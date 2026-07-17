import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, registerFullPaymentAsAdmin, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-A-8  -  Reseller views invoice on portal
 * ===========================================================================
 *  Test Case ID    : TC.-A.8.11
 *  Automation-Type : new
 *  Automation-Date : 2026-06-24
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated Invoice (Invoice Number #1) and
 *    register full payment so it becomes Paid; then as the Reseller verify the
 *    "My invoices" row Status for Invoice Number #1 shows "Paid".
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-A\.8\.11:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
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
 *
 *  Steps to reproduce #1  -  create + pay the invoice:
 *    1-19.  Login as Thomas; create the deal-registration Opportunity (Assigned Partner below);
 *           build the DEAL ELEMENT below; SAVE; NEW QUOTATION; CONFIRM; CREATE INVOICE; CREATE
 *           AND VIEW INVOICES; remember Invoice Number #1; VALIDATE.
 *           Opportunity:
 *             - Assigned Partner = TEST-Reseller#Automation-Jun10
 *           Deal Element:
 *             - Pricelist
 *             - Payment Term
 *             - Order Lines = first product
 *    20-23. (As an admin with Accounting rights - the Salesperson role has no "Register Payment"
 *           on the invoice) open the Invoice; press REGISTER PAYMENT; read the Payment Amount;
 *           set the Register-Payment popup field below; press VALIDATE (the invoice becomes Paid).
 *           Register Payment:
 *             - Actually Received($) = Payment Amount
 *
 *  Steps to reproduce #2  -  view the invoice as the Reseller:
 *    1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *    2. After login successful, click at "My invoices" button
 *
 *  Verification #1:
 *    1. The "My invoices" row Status for Invoice Number #1 shows "Paid".
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated+paid Invoice cannot be cleanly deleted -> retain (see TC.-A.8.1)

test.describe('TC.-A.8.11 - Reseller sees the invoice Status as Paid after payment', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-A.8.11: Verify Reseller sees the invoice Status as Paid after payment', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.8.11 ${compactDateTime}`;

    // Steps to reproduce #1 (1-19): create the validated Invoice as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, { oppName, contactName: leadName, companyEmail, internalNote });
    createdOppUrl = invoice.oppUrl;
    const invoiceUrl = page.url(); // the validated Invoice form URL (re-opened by the admin to pay)

    // Steps to reproduce #1 (20-23): register full payment. The Salesperson role has no "Register
    // Payment" on the invoice, so it is done by an admin with Accounting rights.
    await registerFullPaymentAsAdmin(page, invoiceUrl);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.11 - Invoice paid (backend)');

    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click at "My invoices" button', async () => {
      await resellerPortalPage.clickMyInvoices();
      console.log('✓ My invoices page opened');
    });

    await test.step('Verification #1: The "My invoices" row Status for Invoice Number #1 shows "Paid"', async () => {
      const row = await resellerPortalPage.getInvoiceRowData(invoice.invoiceNumber);
      console.log(`  - Row for "${invoice.invoiceNumber}": ${JSON.stringify(row)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.8.11 - Reseller My invoices (status Paid)');

      expect(row, 'The invoice row should be found on My invoices').not.toBeNull();
      expect(row?.status, `The Status column for Invoice Number #1 "${invoice.invoiceNumber}" should show "Paid"`).toMatch(/Paid/i);
      console.log('✅ Reseller sees the invoice Status as Paid after payment');
    });
  });
});
