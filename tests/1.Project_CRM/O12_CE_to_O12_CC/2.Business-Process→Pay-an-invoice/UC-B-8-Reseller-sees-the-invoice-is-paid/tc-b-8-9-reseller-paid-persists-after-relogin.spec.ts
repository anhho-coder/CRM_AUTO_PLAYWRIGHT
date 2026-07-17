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
 *  Test Case ID    : TC.-B.8.9
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    As Thomas create a deal-registration validated Invoice#1; as Faye register a full payment so it is
 *    Paid; then as Reseller_1 open Invoice#1 (it is paid), LOG OUT and LOG IN AGAIN as Reseller_1, and
 *    verify the paid state PERSISTS (no "Pay Now", "This invoice is paid", Amount Due = $0).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.8\.9:" --project=chromium
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
 *             - Opp name                  = TEST TC.-B.8.9 <current date time>
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
 *    2. Click "My Invoices" and open Invoice#1 (it shows as paid)
 *    3. Log out, then log in again as Reseller_1 and re-open Invoice#1
 *
 *  Verification Point - on the re-opened Invoice#1 detail screen (state persists):
 *    1. The "Pay Now" button is NOT displayed
 *    2. The message "This invoice is paid" is displayed
 *    3. Amount Due = $0 is displayed
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated + paid Invoice cannot be cleanly deleted -> retain.
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.8.9 - Reseller sees the paid state persists after re-login', () => {
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

  test('TC.-B.8.9: Verify the Reseller sees the paid state persists after logging out and back in', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.8.9 ${compactDateTime}`;
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

    await test.step('Steps to reproduce - Step 2: Click "My Invoices" and open Invoice#1 (it shows as paid)', async () => {
      await resellerPortalPage.clickMyInvoices();
      await resellerPortalPage.openInvoiceByNumber(invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      const firstPaid = await resellerPortalPage.isInvoicePaidMessageShown();
      const firstDue = await resellerPortalPage.getDetailAmountDue();
      console.log(`  - First view: paid message=${firstPaid}, Amount Due="${firstDue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 paid (first view)').catch(() => {});
    });

    await test.step('Steps to reproduce - Step 3: Log out, then log in again as Reseller_1 and re-open Invoice#1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      await resellerPortalPage.clickMyInvoices();
      await resellerPortalPage.openInvoiceByNumber(invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      console.log('✓ Re-logged in as Reseller_1 and re-opened Invoice#1');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 re-opened after re-login').catch(() => {});
    });

    await test.step('Verification Point: the paid state persists - "Pay Now" hidden, "This invoice is paid", Amount Due = $0', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton(CommonUtils.waitTimes.abnormalWait);
      const paidMessageShown = await resellerPortalPage.isInvoicePaidMessageShown();
      const amountDue = await resellerPortalPage.getDetailAmountDue();
      console.log(`  - After re-login: "Pay Now" present=${hasPayNow}, paid message=${paidMessageShown}, Amount Due="${amountDue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - paid state persists after re-login');

      expect(hasPayNow, 'The "Pay Now" button should still NOT be displayed after re-login').toBeFalsy();
      expect(paidMessageShown, 'The "This invoice is paid" message should still be displayed after re-login').toBeTruthy();
      expect(money(amountDue), 'Amount Due should still be $0 after re-login').toBeCloseTo(0, 2);
      console.log('✅ The paid state persists after the Reseller logs out and back in');
    });
  });
});
