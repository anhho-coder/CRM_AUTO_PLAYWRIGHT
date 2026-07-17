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
 *  Test Case ID    : TC.-B.8.5
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    As Thomas create a deal-registration validated Invoice#1; as Faye register a full payment so it is
 *    Paid; then as Reseller_1 open Invoice#1 and verify the totals breakdown shows a "Paid on <date>"
 *    payment line (the recorded payment) and Amount Due = $0.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.8\.5:" --project=chromium
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
 *             - Opp name                  = TEST TC.-B.8.5 <current date time>
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
 *    19.    Click "Validate"; remember Invoice#1 + InvoiceTotal#1.
 *    20-24. As Faye (accountant): login; open Invoice#1; Register Payment; Payment Amount =
 *           InvoiceTotal#1; Actually Received($) = InvoiceTotal#1; Validate -> Invoice#1 = Paid.
 *
 *  Steps to reproduce  (as Reseller_1 - TEST-Reseller#1_Automation_Test):
 *    1. Use the account of Reseller_1 to login successful
 *    2. Click "My Invoices"
 *    3. Input Invoice#1 in the search textbox
 *    4. Click on Invoice#1 in the result list to open it
 *
 *  Verification Point - on Invoice#1 detail screen (totals breakdown):
 *    1. A "Paid on <date>" payment line is shown for the registered payment (amount > 0)
 *    2. Amount Due = $0 is displayed
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated + paid Invoice cannot be cleanly deleted -> retain.
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.8.5 - Reseller sees the "Paid on" payment line on the paid invoice', () => {
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

  test('TC.-B.8.5: Verify the paid invoice shows a "Paid on" payment line and Amount Due is $0', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.8.5 ${compactDateTime}`;
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
    console.log(`  - InvoiceTotal#1   : ${invoice.invoiceTotal || invoice.amountDue}`);
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

    await test.step('Steps to reproduce - Step 4: Click on Invoice#1 in the result list to open it', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 detail opened').catch(() => {});
    });

    await test.step('Verification Point: a "Paid on <date>" payment line is shown and Amount Due = $0', async () => {
      const rows = await resellerPortalPage.getDetailTotalsAllRows();
      const paidOn = rows.find((r) => /paid on/i.test(r.label));
      const due = rows.find((r) => /amount due/i.test(r.label));
      console.log(`  - #total rows  : ${JSON.stringify(rows)}`);
      console.log(`  - Paid-on row  : ${JSON.stringify(paidOn)}`);
      console.log(`  - Amount Due   : ${JSON.stringify(due)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Paid on line + Amount Due $0');

      expect(paidOn, 'A "Paid on <date>" payment line should be shown on the paid invoice').toBeTruthy();
      expect(money(paidOn?.amount), 'The Paid-on amount should be > 0 (the recorded payment)').toBeGreaterThan(0);
      expect(due, 'An "Amount Due" row should be shown').toBeTruthy();
      expect(money(due?.amount), 'Amount Due should be $0 on a fully-paid invoice').toBeCloseTo(0, 2);
      console.log('✅ The paid invoice shows a "Paid on" payment line and Amount Due is $0');
    });
  });
});
