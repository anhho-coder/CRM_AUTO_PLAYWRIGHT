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
 *  Test Case ID    : TC.-B.4.11
 *  Manual TC ID    : UC-B.4.11
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    After the End User pays an invoice in full, the paid state PERSISTS across a reload: verify the
 *    reloaded invoice still shows Payer = End User, Amount Due $0, state "Paid", and that no further
 *    "Register Payment" action is offered (nothing left to pay).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.11:" --project=chromium
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
 *    3. Reload Invoice#1 (re-open the back-office page)
 *  Verification Point:
 *    1. On reload, Invoice#1 state = "Paid" and Amount Due = $0 (the paid state persists)
 *    2. No further "Register Payment" action is offered (the invoice is fully paid)
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.11 - End User invoice: paid state persists on reload', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.11: A fully-paid End-User invoice keeps Paid / Amount Due $0 / no Register Payment on reload', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.11' });
    createdOppUrl = inv.oppUrl;

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"; keep the full amount; set "Actually Received($)" = full; Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const full = await invoicePage.getPaymentAmount();
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    let hasRegisterPaymentAfter = true;
    await test.step('Step 3: Reload Invoice#1 (re-open the back-office page)', async () => {
      await page.goto(inv.invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      hasRegisterPaymentAfter = await invoicePage.hasRegisterPaymentButton();
      console.log(`  - Register Payment still offered after full payment: ${hasRegisterPaymentAfter}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.11 - Reloaded fully-paid invoice');
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: On reload, Invoice#1 state = "Paid" and Amount Due = $0 (persists)', async () => {
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      console.log(`  - state="${status}" | Amount Due="${due}"`);
      expect(status, 'Invoice#1 should still be Paid after reload').toMatch(/Paid/i);
      expect(money(due), 'Amount Due should still be 0 after reload').toBe(0);
    });

    await test.step('Verification Point 2: No further "Register Payment" action is offered (fully paid)', async () => {
      expect(hasRegisterPaymentAfter, 'A fully-paid invoice should not offer Register Payment').toBeFalsy();
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ Fully-paid End-User invoice persists: Paid, Due $0, no Register Payment, Payer = End User');
    });
  });
});
