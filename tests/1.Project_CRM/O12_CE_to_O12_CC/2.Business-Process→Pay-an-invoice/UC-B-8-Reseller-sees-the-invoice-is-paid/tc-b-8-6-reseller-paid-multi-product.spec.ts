import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin, money } from '@helpers/uc-b-1-multi-product-invoice.helper';
import { registerFullPaymentAsAccountant } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-B.8  -  Reseller sees that the invoice is paid
 * ===========================================================================
 *  Test Case ID    : TC.-B.8.6
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    As Thomas create a fresh validated MULTI-PRODUCT Invoice#1 (4 products, approved by Max); as Faye
 *    register a full payment so it is Paid; then as Reseller_1 open Invoice#1 and verify it is paid
 *    (no "Pay Now", "This invoice is paid", Amount Due = $0) and all product lines are listed.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.8\.6:" --project=chromium
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
 *  Pre-condition #2 - create a MULTI-PRODUCT invoice, then register a full payment so it is Paid:
 *    1-9.   As Thomas: login; CRM > view list > CREATE; enter the Opportunity details; CRM Developer
 *           Lead form = NAKIVO deal registration*; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *           Internal Note #1; SAVE; refresh until Company + Contact populate.
 *    10-13. Build the Deal Element (one field per line):
 *             - Pricelist     = Public Pricelist_USD (USD)
 *             - Payment terms = Immediate Payment
 *             - Order Lines   = add 4 DIFFERENT products sized into the $15k-$20k approval band
 *    14.    New Quotation -> "To Approve"; Sales Manager Max approves it (second browser).
 *    15-18. Back as Thomas: Confirm -> Create invoice -> Invoiceable lines -> Create and view invoices.
 *    19.    Validate; remember Invoice#1 + InvoiceTotal#1 + the product codes.
 *    20-24. As Faye (accountant): login; open Invoice#1; Register Payment; Payment Amount =
 *           InvoiceTotal#1; Actually Received($) = InvoiceTotal#1; Validate -> Invoice#1 = Paid.
 *
 *  Steps to reproduce  (as Reseller_1 - TEST-Reseller#1_Automation_Test):
 *    1. Use the account of Reseller_1 to login successful
 *    2. Click "My Invoices"
 *    3. Click on Invoice#1 in the result list to open it
 *
 *  Verification Point - on Invoice#1 detail screen:
 *    1. The "Pay Now" button is NOT displayed
 *    2. The message "This invoice is paid" is displayed
 *    3. Amount Due = $0 is displayed
 *    4. All product lines are listed on the invoice detail
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated + paid Invoice cannot be cleanly deleted -> retain.

test.describe('TC.-B.8.6 - Reseller sees a paid multi-product invoice with all lines', () => {
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

  test('TC.-B.8.6: Verify the Reseller sees a paid multi-product invoice with all lines and Amount Due $0', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.8.6 ${compactDateTime}`;

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

    // Pre-condition #2 (1-19): multi-product validated invoice (approved by Max).
    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, browser, testInfo, stepPrefix: 'Pre-condition #2',
    });
    createdOppUrl = invoice.oppUrl;
    console.log(`  - Invoice#1        : ${invoice.invoiceNumber}`);
    console.log(`  - InvoiceTotal#1   : ${invoice.invoiceTotal}`);
    console.log(`  - Product codes    : ${invoice.products.map((p) => p.code).join(', ')}`);
    console.log(`  - Invoice#1 URL    : ${invoice.invoiceUrl}`);

    // Pre-condition #2 (20-24): Faye registers the full payment -> Invoice#1 = Paid.
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

    await test.step('Steps to reproduce - Step 3: Click on Invoice#1 in the result list to open it', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 detail opened').catch(() => {});
    });

    await test.step('Verification Point: paid (no Pay Now, "This invoice is paid", Amount Due $0) and all product lines listed', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton(CommonUtils.waitTimes.abnormalWait);
      const paidMessageShown = await resellerPortalPage.isInvoicePaidMessageShown();
      const amountDue = await resellerPortalPage.getDetailAmountDue();
      console.log(`  - "Pay Now" present: ${hasPayNow} | paid message: ${paidMessageShown} | Amount Due: "${amountDue}"`);
      const lines: { code: string; found: boolean }[] = [];
      for (const pr of invoice.products) {
        const line = await resellerPortalPage.getDetailProductLine(pr.code);
        lines.push({ code: pr.code, found: line !== null });
      }
      console.log(`  - Product lines on detail: ${JSON.stringify(lines)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - paid multi-product invoice (all lines)');

      expect(hasPayNow, 'The "Pay Now" button should NOT be displayed on a paid invoice').toBeFalsy();
      expect(paidMessageShown, 'The "This invoice is paid" message should be displayed').toBeTruthy();
      expect(money(amountDue), 'Amount Due should be $0 on a fully-paid invoice').toBeCloseTo(0, 2);
      for (const l of lines) {
        expect(l.found, `Product line "${l.code}" should be listed on the paid invoice detail`).toBeTruthy();
      }
      console.log('✅ The Reseller sees a paid multi-product invoice with all lines and Amount Due $0');
    });
  });
});
