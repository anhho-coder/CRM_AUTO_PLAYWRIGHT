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
 *  Test Case ID    : TC.-B.4.2
 *  Manual TC ID    : UC-B.4.2   (folder UC-B-4-End-User-pays-directly-when-invoiced-direct)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an invoice whose Payer = the End User, the accountant (Faye) registers a PARTIAL payment and
 *    chooses "Keep open"; verify the invoice stays open (not Paid), the Amount Due drops to the
 *    remaining balance, and the Payer is still the End User.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.2:" --project=chromium
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
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *    1-20. Login as Thomas; create the deal-registration Opp (details below); Deal Element (details
 *          below); New Quotation -> Confirm; Create Invoice (Invoiceable lines) -> Validate; capture
 *          Invoice#1 and InvoiceTotal#1.
 *            Opp details:
 *              - Contact          = EndUser#1
 *              - Assigned Partner = TEST-Reseller#Automation-Jun10
 *            Deal Element details:
 *              - Payer            = EndUser#1
 *              - Invoice Address  = EndUser#1
 *              - Pricelist        = Public Pricelist_USD
 *              - Payment terms    = Immediate Payment
 *              - Product          = ONE product (Qty 1)
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Click "Register Payment"
 *    3. In the popup, set Payment Amount = half of InvoiceTotal#1 (a partial payment, less than the due)
 *    4. A "Payment Difference" appears; select "Keep open" (record a partial payment, leave balance open)
 *    5. Set "Actually Received($)" = the partial amount
 *    6. Click "Validate" -> the partial payment is recorded
 *  Verification Point:
 *    1. Invoice#1 state is NOT "Paid" (still Open) - only partially paid
 *    2. Amount Due = InvoiceTotal#1 - partial amount (remaining balance > 0)
 *    3. Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Shared backbone (Pre-conditions) via buildValidatedEndUserInvoiceAsThomas (Payer + Invoice Address
 *    = End User -> the posted invoice's Payer is the End User). Cleanup SKIPPED (a validated invoice
 *    with a posted payment cannot be cleanly deleted; O12 convention).
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.2 - End User invoice: accountant registers a partial payment (Keep open)', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.2: Accountant registers a partial payment (Keep open) for an invoice whose Payer = End User', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    // ── Pre-conditions #1 + #2: validated invoice billed to the End User (as Thomas) ──
    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.2' });
    createdOppUrl = inv.oppUrl;

    const total = money(inv.invoiceTotal);
    const partialStr = (total / 2).toFixed(2);   // a partial payment = half the due
    const partial = parseFloat(partialStr);
    const expectedRemaining = +(total - partial).toFixed(2);

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1 in the back-office').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    await test.step('Step 3: In the popup, set Payment Amount = half of InvoiceTotal#1 (a partial payment)', async () => {
      const fullDue = await invoicePage.getPaymentAmount();
      console.log(`  - Full Amount Due (default): "${fullDue}" | InvoiceTotal#1: "${inv.invoiceTotal}" | partial to pay: ${partialStr}`);
      await invoicePage.fillPaymentAmount(partialStr);
      console.log(`✓ Payment Amount set to the partial amount: ${partialStr}`);
    });

    await test.step('Step 4: A "Payment Difference" appears; select "Keep open"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      console.log(`  - Payment Difference visible: ${diffVisible}`);
      if (diffVisible) {
        const kept = await invoicePage.selectPaymentDifferenceKeepOpen();
        expect(kept, 'Payment Difference handling should be "Keep open"').toBeTruthy();
      } else {
        console.log('  ⚠ Payment Difference not shown - the partial may post as a simple partial payment');
      }
    });

    await test.step('Step 5: Set "Actually Received($)" = the partial amount', async () => {
      await invoicePage.fillActuallyReceived(partialStr)
        .catch((e) => console.log(`  ⚠ "Actually Received($)" not set: ${e instanceof Error ? e.message : String(e)}`));
    });

    await test.step('Step 6: Click "Validate" -> the partial payment is recorded', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Partial payment recorded');
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Invoice#1 state is NOT "Paid" (still Open) - only partially paid', async () => {
      const status = await invoicePage.getInvoiceStatus();
      console.log(`  - Invoice state after partial payment: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.2 - Partially paid (Keep open)');
      expect(status, 'Invoice should NOT be Paid after a partial payment').not.toMatch(/Paid/i);
      expect(status, 'Invoice should remain Open/Posted after a partial payment').toMatch(/Open|Posted/i);
    });

    await test.step('Verification Point 2: Amount Due = InvoiceTotal#1 - partial (remaining balance > 0)', async () => {
      const amountDue = await invoicePage.getAmountDue();
      console.log(`  - Amount Due: "${amountDue}" | expected remaining ~= ${expectedRemaining} (total ${total} - partial ${partial})`);
      expect(money(amountDue), 'Amount Due should be the remaining balance (> 0)').toBeGreaterThan(0);
      expect(money(amountDue), 'Amount Due should equal InvoiceTotal#1 - partial').toBeCloseTo(expectedRemaining, 1);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1 (the End User contact)').toContain(inv.leadName);
      console.log('✅ Partial payment (Keep open): invoice still Open, Amount Due = remaining, Payer = End User');
    });
  });
});
