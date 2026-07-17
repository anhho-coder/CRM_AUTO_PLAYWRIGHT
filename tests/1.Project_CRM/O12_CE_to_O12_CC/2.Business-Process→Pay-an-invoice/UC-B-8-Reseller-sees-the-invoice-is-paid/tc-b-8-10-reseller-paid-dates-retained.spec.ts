import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import {
  createValidatedInvoiceAsThomas,
  registerFullPaymentAsAccountant,
  deleteCreatedOpportunityAsAdmin,
} from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-B.8  -  Reseller sees that the invoice is paid
 * ===========================================================================
 *  Test Case ID    : TC.-B.8.10
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    As Thomas create a deal-registration validated Invoice#1; as Faye register a full payment so it is
 *    Paid; then as Reseller_1 verify the paid Invoice#1 row on "My Invoices" still shows its Invoice Date
 *    and Due Date (the dates are retained) alongside Status = Paid.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.8\.10:" --project=chromium
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
 *  Pre-condition #2 - create the invoice, then register a full payment so the invoice is Paid:
 *    1-3.   As Thomas: login; click "CRM" > "view list"; on the Opp page click "CREATE".
 *    4.     Enter the Opportunity details (one field per line):
 *             - Opp name                  = TEST TC.-B.8.10 <current date time>
 *             - Contact name              = <Name from Internal Note #1>
 *             - CompanyName               = Company Name Lead 1
 *             - Email                     = <Email from Internal Note #1>
 *             - Country                   = United States
 *             - State                     = Maryland
 *             - IP                        = <IP from Internal Note #1>
 *             - Create manually checkbox  = FALSE
 *             - Sales Team dropdown       = cleared
 *             - Salesperson dropdown      = cleared
 *    5.     "CRM Developer" tab: Lead form textbox = NAKIVO deal registration*
 *    6.     "Assigned Partner" tab:  Assigned Partner = TEST-Reseller#Automation-Jun10
 *    7.     "Internal Notes" tab:    paste Internal Note #1
 *    8-9.   Press "SAVE"; capture Opp URL #1; refresh until Company + Contact populate.
 *    10.    Click "Deal Element" to create a new deal element.
 *    11-13. Set the Deal Element (one field per line):
 *             - Pricelist                 = Public Pricelist_USD (USD)
 *             - Payment terms             = Immediate Payment
 *             - Order Lines               = add ONE random product (Product#1), Quantity = 1
 *    14.    Click "New Quotation" -> "Confirm" (small deal, no approval).
 *    15-18. Click "Create invoice" -> "Invoiceable lines" -> "Create and view invoices".
 *    19.    Click "Validate"; remember Invoice#1 + its Invoice Date + Due Date.
 *    20-24. As Faye (accountant): login; open Invoice#1; Register Payment; Payment Amount =
 *           InvoiceTotal#1; Actually Received($) = InvoiceTotal#1; Validate -> Invoice#1 = Paid.
 *
 *  Steps to reproduce  (as Reseller_1 - TEST-Reseller#1_Automation_Test):
 *    1. Use the account of Reseller_1 to login successful
 *    2. Click "My Invoices"
 *    3. Input Invoice#1 in the search textbox
 *
 *  Verification Point - on the "My Invoices" row for Invoice#1:
 *    1. The Invoice Date is shown (retained on the paid invoice)
 *    2. The Due Date is shown (retained on the paid invoice)
 *    3. The Status is Paid
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated + paid Invoice cannot be cleanly deleted -> retain.
const DATE_LIKE = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}/; // tolerant: matches MM/DD/YYYY (and similar)

test.describe('TC.-B.8.10 - Reseller sees the paid invoice retains its Invoice Date and Due Date', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const rp = new ResellerPortalPage(page);
      await rp.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.8.10: Verify the paid invoice retains its Invoice Date and Due Date on the portal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.8.10 ${compactDateTime}`;
    let invoiceNumber = '';

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 with fresh dynamic values', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared (key fields, one per line)');
      console.log(`  - Opportunity name      : ${oppName}`);
      console.log(`  - Name (Contact)        : ${leadName}`);
      console.log(`  - Email                 : ${companyEmail}`);
      console.log(`  - Company               : Company Name Lead 1`);
      console.log(`  - Partner Company Name  : TEST-Reseller#Automation-Jun10`);
      console.log(`  - Country               : United States`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note #1 prepared').catch(() => {});
    });

    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition #2',
    });
    createdOppUrl = invoice.oppUrl;
    invoiceNumber = invoice.invoiceNumber;
    console.log(`  - Invoice#1        : ${invoiceNumber}`);
    console.log(`  - Invoice Date     : ${invoice.invoiceDate}`);
    console.log(`  - Due Date         : ${invoice.dueDate}`);
    console.log(`  - Invoice#1 URL    : ${invoice.invoiceUrl}`);

    await registerFullPaymentAsAccountant(page, invoice.invoiceUrl, 'Pre-condition #2');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 paid (backend)').catch(() => {});

    await test.step('Steps to reproduce - Step 1: Use the account of Reseller_1 to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce - Step 2: Click "My Invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
    });

    await test.step('Steps to reproduce - Step 3: Input Invoice#1 in the search textbox', async () => {
      await resellerPortalPage.searchInvoices(invoiceNumber);
    });

    await test.step('Verification Point: the paid Invoice#1 row shows its Invoice Date and Due Date, Status = Paid', async () => {
      const row = await resellerPortalPage.getInvoiceRowData(invoiceNumber);
      console.log(`  - Row for "${invoiceNumber}": ${JSON.stringify(row)}`);
      console.log(`  - Backend Invoice Date: "${invoice.invoiceDate}" | Due Date: "${invoice.dueDate}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - paid invoice dates retained');

      expect(row, `Invoice#1 "${invoiceNumber}" should be listed on My Invoices`).not.toBeNull();
      expect(row?.status, 'The Status column should show "Paid"').toMatch(/Paid/i);
      expect(row?.invoiceDate, 'The Invoice Date should be shown (retained) on the paid invoice row').toBeTruthy();
      expect(row?.invoiceDate ?? '', 'The Invoice Date should look like a date').toMatch(DATE_LIKE);
      expect(row?.dueDate, 'The Due Date should be shown (retained) on the paid invoice row').toBeTruthy();
      expect(row?.dueDate ?? '', 'The Due Date should look like a date').toMatch(DATE_LIKE);
      console.log('✅ The paid invoice retains its Invoice Date and Due Date on the portal');
    });
  });
});
