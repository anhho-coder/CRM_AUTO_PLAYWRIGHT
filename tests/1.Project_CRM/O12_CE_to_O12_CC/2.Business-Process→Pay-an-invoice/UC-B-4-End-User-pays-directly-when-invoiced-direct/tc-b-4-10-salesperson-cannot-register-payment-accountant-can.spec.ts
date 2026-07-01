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
 *  Test Case ID    : TC.-B.4.10
 *  Manual TC ID    : UC-B.4.10
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    On an End-User invoice, a Salesperson (Thomas) has NO "Register Payment" action, but the accountant
 *    (Faye) does; verify Thomas cannot register payment, then Faye registers the full payment and the
 *    invoice becomes Paid.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.10:" --project=chromium
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
 *    capture Invoice#1 + InvoiceTotal#1. (Session remains logged in as Thomas - the Salesperson.)
 *      Deal Element details:
 *        - Billed to     = EndUser#1
 *        - Payment terms = Immediate Payment
 *        - Product       = ONE product
 *  Steps to reproduce:
 *    1. As Thomas (Salesperson), open Invoice#1 and check for a "Register Payment" action
 *    2. Log in as Faye (accountant) and open Invoice#1; confirm "Register Payment" IS available
 *    3. Register the full payment as Faye; set "Actually Received($)" = full; Validate
 *  Verification Point:
 *    1. The Salesperson (Thomas) has NO "Register Payment" action on Invoice#1
 *    2. The accountant (Faye) HAS "Register Payment", and the full payment makes Invoice#1 "Paid" (Amount Due $0)
 *    3. Invoice#1 Payer = EndUser#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.4.10 - End User invoice: Salesperson cannot Register Payment, Accountant can', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.10: Salesperson cannot Register Payment on an End-User invoice, the Accountant can', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);

    // Pre-conditions build the invoice AND leave the session logged in as Thomas (the Salesperson).
    const inv = await buildValidatedEndUserInvoiceAsThomas(page, { tcId: 'TC.-B.4.10' });
    createdOppUrl = inv.oppUrl;

    let salespersonHasRegisterPayment = true;
    await test.step('Step 1: As Thomas (Salesperson), open Invoice#1 and check for a "Register Payment" action', async () => {
      await page.goto(inv.invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      const opened = await invoicePage.getInvoiceNumber();
      expect(opened, 'Thomas should open Invoice#1').toBe(inv.invoiceNumber);
      salespersonHasRegisterPayment = await invoicePage.hasRegisterPaymentButton();
      console.log(`  - Salesperson (Thomas) has Register Payment: ${salespersonHasRegisterPayment}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.10 - Thomas (Salesperson) on Invoice#1');
    });

    let accountantHasRegisterPayment = false;
    await test.step('Step 2: Log in as Faye (accountant) and open Invoice#1; confirm "Register Payment" IS available', async () => {
      const opened = await loginAsAccountantAndOpenInvoice(page, inv.invoiceUrl);
      expect(opened, 'Faye should open Invoice#1').toBe(inv.invoiceNumber);
      accountantHasRegisterPayment = await invoicePage.hasRegisterPaymentButton();
      console.log(`  - Accountant (Faye) has Register Payment: ${accountantHasRegisterPayment}`);
    });

    await test.step('Step 3: Register the full payment as Faye; set "Actually Received($)" = full; Validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      const full = await invoicePage.getPaymentAmount();
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full).catch(() => {});
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after payment: "${status}"`);
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: The Salesperson (Thomas) has NO "Register Payment" action on Invoice#1', async () => {
      expect(salespersonHasRegisterPayment, 'A Salesperson should NOT be able to Register Payment on an invoice').toBeFalsy();
    });

    await test.step('Verification Point 2: The Accountant (Faye) HAS "Register Payment", and the full payment makes Invoice#1 "Paid" (Amount Due $0)', async () => {
      expect(accountantHasRegisterPayment, 'An Accountant SHOULD be able to Register Payment').toBeTruthy();
      const status = await invoicePage.getInvoiceStatus();
      const due = await invoicePage.getAmountDue();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.10 - Paid by the Accountant (Faye)');
      console.log(`  - state="${status}" | Amount Due="${due}"`);
      expect(status, 'Invoice#1 should be Paid after the Accountant pays').toMatch(/Paid/i);
      expect(money(due), 'Amount Due should be 0').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 Payer = EndUser#1', async () => {
      const payer = await invoicePage.getPayer();
      console.log(`  - Invoice Payer: "${payer}" | EndUser#1 = "${inv.leadName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1').toContain(inv.leadName);
      console.log('✅ Salesperson cannot Register Payment; Accountant can -> Paid, Due $0, Payer = End User');
    });
  });
});
