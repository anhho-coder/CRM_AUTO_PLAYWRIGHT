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
 *  Test Case ID    : TC.-B.4.4
 *  Manual TC ID    : UC-B.4.4
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an invoice whose Payer = the End User, the Register Payment dialog pre-fills the Payment Amount
 *    with the full Amount Due (= InvoiceTotal#1); verify that default, then pay it in full and confirm
 *    the invoice becomes Paid with Amount Due $0.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.4:" --project=chromium
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
 *    3. Read the pre-filled "Payment Amount" - it equals the full Amount Due (= InvoiceTotal#1)
 *    4. Keep the full amount; set "Actually Received($)" = the full amount
 *    5. Click "Validate" -> the full payment is recorded
 *  Verification Point:
 *    1. The Register Payment dialog defaulted "Payment Amount" to InvoiceTotal#1 (the full due)
 *    2. Invoice#1 state = "Paid" and Amount Due = $0
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.4 - End User invoice: Register Payment defaults to the full Amount Due', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.4: Register Payment defaults to the full Amount Due on an End-User invoice, then pays in full', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.4' });
    createdOppUrl = inv.oppUrl;

    let defaultPaymentAmount = '';

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    await test.step('Step 3: Read the pre-filled "Payment Amount" - it equals the full Amount Due (= InvoiceTotal#1)', async () => {
      defaultPaymentAmount = await invoicePage.getPaymentAmount();
      console.log(`  - Default Payment Amount: "${defaultPaymentAmount}" | InvoiceTotal#1: "${inv.invoiceTotal}"`);
    });

    await test.step('Step 4: Keep the full amount; set "Actually Received($)" = the full amount', async () => {
      await invoicePage.fillPaymentAmount(defaultPaymentAmount);
      await invoicePage.fillActuallyReceived(defaultPaymentAmount)
        .catch((e) => console.log(`  ⚠ "Actually Received($)" not set: ${e instanceof Error ? e.message : String(e)}`));
    });

    await test.step('Step 5: Click "Validate" -> the full payment is recorded', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Register Payment defaulted "Payment Amount" to InvoiceTotal#1 (the full due)', async () => {
      console.log(`  - default "${defaultPaymentAmount}" (${money(defaultPaymentAmount)}) vs InvoiceTotal#1 "${inv.invoiceTotal}" (${money(inv.invoiceTotal)})`);
      expect(money(defaultPaymentAmount), 'The dialog should default Payment Amount to the full due > 0').toBeGreaterThan(0);
      expect(money(defaultPaymentAmount), 'Default Payment Amount should equal InvoiceTotal#1 (the full Amount Due)').toBeCloseTo(money(inv.invoiceTotal), 2);
    });

    await test.step('Verification Point 2: Invoice#1 state = "Paid" and Amount Due = $0', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.4 - Paid (default full amount)');
      console.log(`  - state="${status}" | Amount Due="${due}"`);
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
      expect(money(due), 'Amount Due should be 0').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ Register Payment defaulted to the full due; full payment -> Paid, Due $0, Payer = End User');
    });
  });
});
