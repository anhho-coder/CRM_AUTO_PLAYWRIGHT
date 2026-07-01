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
 *  Test Case ID    : TC.-B.4.9
 *  Manual TC ID    : UC-B.4.9
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    After the End User pays an invoice in full, the payment is recorded on the invoice's Payments tab;
 *    verify exactly one payment row whose Payment Amount = InvoiceTotal#1, with the invoice Paid.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.9:" --project=chromium
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
 *    2. Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate
 *    3. Open the "Payments" tab on the invoice
 *  Verification Point:
 *    1. The Payments tab shows exactly ONE payment row
 *    2. The recorded Payment Amount = InvoiceTotal#1 (the full amount)
 *    3. Invoice#1 state = "Paid" (and Payer = EndUser#1)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.9 - End User payment is recorded on the Payments tab', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.9: End User full payment is recorded on the invoice Payments tab', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.9' });
    createdOppUrl = inv.oppUrl;

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const full = await invoicePage.getPaymentAmount();
      console.log(`  - Full Amount Due: "${full}"`);
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    let paymentRows = 0;
    let recordedAmounts: string[] = [];
    await test.step('Step 3: Open the "Payments" tab on the invoice', async () => {
      await invoicePage.clickPaymentsTab();
      paymentRows = await invoicePage.getPaymentRowCount();
      recordedAmounts = await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => []);
      console.log(`  - Payment rows: ${paymentRows} | Payment Amount column: ${JSON.stringify(recordedAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.9 - Payments tab');
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: The Payments tab shows exactly ONE payment row', async () => {
      expect(paymentRows, 'There should be exactly one payment row after a single full payment').toBe(1);
    });

    await test.step('Verification Point 2: The recorded Payment Amount = InvoiceTotal#1 (the full amount)', async () => {
      // Prefer the multi-row column reader; fall back to the single-cell getter.
      let recorded = recordedAmounts.length ? recordedAmounts[0] : '';
      if (!recorded) recorded = await invoicePage.getPaymentAmountFromPaymentsTab().catch(() => '');
      console.log(`  - Recorded Payment Amount="${recorded}" | InvoiceTotal#1="${inv.invoiceTotal}"`);
      expect(money(recorded), 'Recorded Payment Amount should equal InvoiceTotal#1').toBeCloseTo(money(inv.invoiceTotal), 2);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Paid" (and Payer = EndUser#1)', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const payer = await invoicePage.getPayer();
      console.log(`  - state="${status}" | Payer="${payer}" | EndUser#1="${inv.leadName}"`);
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ End-User full payment recorded on the Payments tab (1 row = InvoiceTotal#1), invoice Paid');
    });
  });
});
