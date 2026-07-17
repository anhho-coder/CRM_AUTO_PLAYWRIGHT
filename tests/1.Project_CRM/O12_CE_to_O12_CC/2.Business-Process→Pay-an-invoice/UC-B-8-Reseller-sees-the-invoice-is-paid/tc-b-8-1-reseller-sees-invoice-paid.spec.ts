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
 *  Test Case ID    : TC.-B.8.1
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas, create a deal-registration validated single-product Invoice (Invoice#1); as Faye
 *    (accountant) register a full payment so Invoice#1 becomes Paid; then as Reseller_1 open Invoice#1
 *    on the portal and verify it shows no "Pay Now" button, the "This invoice is paid" message (left
 *    column), and Amount Due = $0 (right-side detail).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.8\.1:" --project=chromium
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
 *             - Opp name                  = TEST TC.-B.8.1 <current date time>
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
 *    7.     "Internal Notes" tab:    paste Internal Note #1 (from Pre-condition #1)
 *    8-9.   Press "SAVE"; capture Opp URL #1; refresh until Company + Contact populate (~10s).
 *    10.    Click "Deal Element" to create a new deal element.
 *    11-13. Set the Deal Element (one field per line):
 *             - Pricelist                 = Public Pricelist_USD (USD)
 *             - Payment terms             = Immediate Payment
 *             - Order Lines               = add ONE random product (Product#1), Quantity = 1
 *    14.    Click "New Quotation" -> wait -> click "Confirm" (small deal, no approval).
 *    15-16. Wait for "Create invoice" -> click it; in the Invoice Order popup select "Invoiceable lines".
 *    17-18. Click "Create and view invoices"; wait for the invoice, then click "Validate".
 *    19.    Remember:
 *             - Invoice#1                 = Invoice number
 *             - InvoiceTotal#1            = Invoice Total value
 *    20.    Use the account of Faye (accountant) to login successful, then open Invoice#1.
 *    21.    Click "Register Payment".
 *    22.    Set Payment Amount           = InvoiceTotal#1 (the full amount due)
 *    23.    Set Actually Received($)     = InvoiceTotal#1 (the same value entered in Payment Amount)
 *    24.    Click "Validate" -> the full payment is recorded and Invoice#1 state becomes "Paid".
 *
 *  Steps to reproduce  (as Reseller_1 - TEST-Reseller#1_Automation_Test):
 *    1. Use the account of Reseller_1 to login successful
 *    2. Click "My Invoices"
 *    3. Input Invoice#1 in the search textbox
 *    4. Click on Invoice#1 in the result list to open it
 *
 *  Verification Point - on Invoice#1 detail screen:
 *    1. The "Pay Now" button is NOT displayed
 *    2. The message "This invoice is paid" is displayed in the left column of the invoice
 *    3. Amount Due = $0 is displayed in the right-side detail of the invoice
 * ===========================================================================
 */

// A validated + paid Invoice cannot be cleanly deleted -> retain the created Opp (mirrors TC.-A.8.11 / TC.-B.1.8).
const SKIP_CLEANUP_OPP = true;

/** Parse a money string ("$ 0.00") to a number (0). */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.8.1 - Reseller sees that the invoice is paid', () => {
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

  test('TC.-B.8.1: Verify the Reseller sees that the invoice is paid on the portal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.8.1 ${compactDateTime}`;
    let invoiceNumber = '';

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 with fresh dynamic values', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared');
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - Contact name (Name from Note) : ${leadName}`);
      console.log(`  - Company email : ${companyEmail}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note #1 prepared').catch(() => {});
    });

    // Pre-condition #2 (steps 1-19): create the validated single-product Invoice#1 as Thomas (shared helper).
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #2',
    });
    createdOppUrl = invoice.oppUrl;
    invoiceNumber = invoice.invoiceNumber;
    const invoiceUrl = page.url(); // the validated Invoice#1 form URL (re-opened by Faye to pay)
    // One field per line so the captured invoice facts are easy to review in the run log.
    console.log(`  - Invoice#1        : ${invoiceNumber}`);
    console.log(`  - InvoiceTotal#1   : ${invoice.amountDue}`);
    console.log(`  - Invoice#1 URL    : ${invoiceUrl}`);

    // Pre-condition #2 (steps 20-24): Faye (accountant) registers the full payment -> Invoice#1 = Paid.
    await registerFullPaymentAsAccountant(page, invoiceUrl, 'Pre-condition #2');
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
      console.log('✓ My invoices page opened');
    });

    await test.step('Steps to reproduce - Step 3: Input Invoice#1 in the search textbox', async () => {
      await resellerPortalPage.searchInvoices(invoiceNumber);
      const listed = await resellerPortalPage.isInvoiceListed(invoiceNumber);
      console.log(`  - Search for "${invoiceNumber}" -> listed: ${listed}`);
      expect(listed, `Invoice#1 "${invoiceNumber}" should appear in the search result list`).toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 4: Click on Invoice#1 in the result list to open it', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      const opened = await resellerPortalPage.getDetailInvoiceNumber();
      console.log(`  - Opened invoice detail: "${opened}"`);
      expect(opened, 'The opened invoice detail should be Invoice#1').toContain(invoiceNumber);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 detail opened').catch(() => {});
    });

    await test.step('Verification Point: "Pay Now" not displayed; "This invoice is paid" shown (left column); Amount Due = $0 (right-side detail)', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton(CommonUtils.waitTimes.abnormalWait);
      const paidMessageShown = await resellerPortalPage.isInvoicePaidMessageShown();
      const paidMessage = await resellerPortalPage.getInvoicePaidMessage();
      const amountDue = await resellerPortalPage.getDetailAmountDue();
      console.log(`  - "Pay Now" present: ${hasPayNow}`);
      console.log(`  - "This invoice is paid" message: shown=${paidMessageShown} text="${paidMessage}"`);
      console.log(`  - Amount Due (right side): "${amountDue}" (${money(amountDue)})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice#1 detail (Paid, no Pay Now, Amount Due $0)');

      // 1. The "Pay Now" button is NOT displayed.
      expect(hasPayNow, 'The "Pay Now" button should NOT be displayed on a paid invoice').toBeFalsy();
      // 2. The message "This invoice is paid" is displayed in the left column.
      expect(paidMessageShown, 'The "This invoice is paid" message should be displayed in the left column').toBeTruthy();
      expect(paidMessage, 'The left-column message text should be "This invoice is paid"').toMatch(/This invoice is paid/i);
      // 3. Amount Due = $0 is displayed in the right-side detail.
      expect(amountDue, 'An Amount Due value should be displayed in the right-side detail').toBeTruthy();
      expect(money(amountDue), 'Amount Due should be $0 on a fully-paid invoice').toBeCloseTo(0, 2);
      console.log('✅ Reseller sees Invoice#1 as paid: no Pay Now, "This invoice is paid", Amount Due = $0');
    });
  });
});
