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
 *  Test Case ID    : TC.-B.4.8
 *  Manual TC ID    : UC-B.4.8
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an End-User invoice, the accountant registers a payment that is LESS than the due and chooses
 *    "Mark invoice as fully paid" (writing off the small difference); verify the invoice becomes Paid
 *    with Amount Due $0 from a single under-payment, Payer still the End User.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.8:" --project=chromium
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
 *        - Billed to     = EndUser#1
 *        - Payment terms = Immediate Payment
 *        - Product       = ONE product
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Click "Register Payment"
 *    3. Set Payment Amount = InvoiceTotal#1 - 1.00 (slightly less than the full due)
 *    4. A "Payment Difference" appears; select "Mark invoice as fully paid" (and set a write-off account if asked)
 *    5. Set "Actually Received($)" = the entered amount; click "Validate"
 *  Verification Point:
 *    1. Invoice#1 state = "Paid" (the difference was written off)
 *    2. Amount Due = $0
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.8 - End User invoice: under-pay then "Mark fully paid" (write-off)', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.8: Accountant under-pays an End-User invoice and marks it fully paid (write-off)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.8' });
    createdOppUrl = inv.oppUrl;

    const total = money(inv.invoiceTotal);
    const underStr = Math.max(total - 1, total / 2).toFixed(2); // pay 1.00 less than due (write off 1.00)

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    await test.step('Step 3: Set Payment Amount = InvoiceTotal#1 - 1.00 (slightly less than the full due)', async () => {
      console.log(`  - InvoiceTotal#1=${total} | paying ${underStr} (writing off the difference)`);
      await invoicePage.fillPaymentAmount(underStr);
    });

    await test.step('Step 4: A "Payment Difference" appears; select "Mark invoice as fully paid" (set a write-off account if asked)', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      console.log(`  - Payment Difference visible: ${diffVisible}`);
      expect(diffVisible, 'A Payment Difference should appear when paying less than the due').toBeTruthy();
      const marked = await invoicePage.selectPaymentDifferenceMarkFullyPaid();
      expect(marked, 'Payment Difference handling should be "Mark invoice as fully paid"').toBeTruthy();
      if (await invoicePage.isWriteoffAccountVisible()) {
        const acct = await invoicePage.selectFirstWriteoffAccount();
        console.log(`  - Post Difference In (write-off account) = "${acct}"`);
      }
    });

    await test.step('Step 5: Set "Actually Received($)" = the entered amount; click "Validate"', async () => {
      await invoicePage.fillActuallyReceived(underStr).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Invoice#1 state = "Paid" (difference written off)', async () => {
      const status = await invoicePage.getInvoiceStatus();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.8 - Paid via Mark fully paid (write-off)');
      console.log(`  - Invoice state: "${status}"`);
      expect(status, 'Invoice#1 should be Paid after "Mark invoice as fully paid"').toMatch(/Paid/i);
    });

    await test.step('Verification Point 2: Amount Due = $0', async () => {
      const due = await invoicePage.getAmountDue();
      console.log(`  - Amount Due: "${due}"`);
      expect(money(due), 'Amount Due should be 0 after the write-off').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ Under-payment marked fully paid -> Paid, Due $0, Payer = End User');
    });
  });
});
