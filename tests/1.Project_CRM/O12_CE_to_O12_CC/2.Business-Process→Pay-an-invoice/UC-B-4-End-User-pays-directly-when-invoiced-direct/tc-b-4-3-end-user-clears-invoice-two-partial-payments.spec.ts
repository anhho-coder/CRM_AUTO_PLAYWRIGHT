import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  buildValidatedEndUserInvoiceAsThomas,
  loginAsAccountantAndOpenInvoice,
  money,
} from '@helpers/uc-b-4-end-user-invoice.helper';
import { deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-4  -  End User pays directly when invoiced direct
 * ===========================================================================
 *  Test Case ID    : TC.-B.4.3
 *  Manual TC ID    : UC-B.4.3
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an invoice whose Payer = the End User, the accountant records TWO partial payments that together
 *    clear the balance; verify the invoice becomes "Paid" with Amount Due $0 after the second payment,
 *    Payer still the End User.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *    The Internal Note "Name" is the End User contact (EndUser#1).
 *  Pre-condition #2 (as Thomas): 1-20. validated invoice billed to EndUser#1 (details below);
 *    capture Invoice#1 + InvoiceTotal#1.
 *      Deal Element details:
 *        - Payer           = EndUser#1
 *        - Invoice Address = EndUser#1
 *        - Payment terms   = Immediate Payment
 *        - Product         = ONE product
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Click "Register Payment"; set Payment Amount = half of InvoiceTotal#1; Payment Difference = "Keep open"; Validate (1st partial)
 *    3. Verify Amount Due = remaining half (invoice still Open)
 *    4. Click "Register Payment" again; the Payment Amount defaults to the remaining balance; set "Actually Received($)" = remaining; Validate (2nd payment)
 *  Verification Point:
 *    1. Invoice#1 state = "Paid" (after the two partials clear the balance)
 *    2. Amount Due = $0
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.3 - End User invoice: cleared by two partial payments', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.3: End User clears an invoice with two partial payments (becomes Paid)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.3' });
    createdOppUrl = inv.oppUrl;

    const total = money(inv.invoiceTotal);
    const firstStr = (total / 2).toFixed(2);
    const firstPartial = parseFloat(firstStr);

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Register Payment - first PARTIAL payment (half), Payment Difference = "Keep open", Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.fillPaymentAmount(firstStr);
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      if (diffVisible) await invoicePage.selectPaymentDifferenceKeepOpen();
      await invoicePage.fillActuallyReceived(firstStr).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log(`✓ First partial payment recorded: ${firstStr}`);
    });

    await test.step('Step 3: Verify Amount Due = remaining half (invoice still Open)', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      console.log(`  - After 1st partial: state="${status}" | Amount Due="${due}" (expected ~= ${(total - firstPartial).toFixed(2)})`);
      expect(status, 'Invoice should still be Open after the 1st partial').not.toMatch(/Paid/i);
      expect(money(due), 'Amount Due should be the remaining balance (> 0)').toBeGreaterThan(0);
    });

    await test.step('Step 4: Register Payment again - pay the remaining balance (full of what is left), Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const remaining = await invoicePage.getPaymentAmount(); // defaults to the remaining balance
      console.log(`  - 2nd payment default Payment Amount (remaining): "${remaining}"`);
      expect(money(remaining), '2nd payment should default to the remaining balance (> 0)').toBeGreaterThan(0);
      await invoicePage.fillActuallyReceived(remaining).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after the 2nd payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Invoice#1 state = "Paid"', async () => {
      const status = await invoicePage.getInvoiceStatus();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.3 - Paid after two partial payments');
      console.log(`  - Invoice state: "${status}"`);
      expect(status, 'Invoice#1 should be Paid after the two partials clear the balance').toMatch(/Paid/i);
    });

    await test.step('Verification Point 2: Amount Due = $0', async () => {
      const due = await invoicePage.getAmountDue();
      console.log(`  - Amount Due: "${due}"`);
      expect(money(due), 'Amount Due should be 0 after the two payments').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ Two partial payments cleared the End-User invoice -> Paid, Amount Due $0, Payer = End User');
    });
  });
});
