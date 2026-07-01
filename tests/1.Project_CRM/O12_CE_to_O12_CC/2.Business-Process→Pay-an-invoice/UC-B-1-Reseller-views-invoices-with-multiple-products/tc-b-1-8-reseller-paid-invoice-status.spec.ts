import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-1-multi-product-invoice.helper';
import { registerFullPaymentAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.8
 *  Jira            : CRM-11169
 *  Manual TC       : O12CE-O12CC-UC-B1.8
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice and fully pay it (payment registered by an admin,
 *    since the Salesperson cannot Register Payment); then as the Reseller verify the invoice Status is
 *    Paid and no "PAY NOW" button is shown.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.8:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1), then FULLY PAID by an admin -> Status = Paid.
 *
 *    Internal Note #1 (deal-registration template; key fields, one per line):
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
 *  Steps to reproduce:
 *    1. Login as Reseller_1
 *    2. Click "My invoices"
 *    3. Open this test's Invoice #1          -> Invoice #1 is listed with Status = Paid
 *    4. Review the status and the left side   -> Status = Paid and the "PAY NOW" button is NOT shown
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated + paid Invoice cannot be cleanly deleted -> retain

test.describe('TC.-B.1.8 - Reseller sees a Paid multi-product invoice (no PAY NOW)', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const rp = new ResellerPortalPage(page);
      await rp.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.1.8: Paid multi-product invoice shows status Paid and no PAY NOW button on the portal', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.8 ${compactDateTime}`;

    // Pre-condition: create the validated multi-product Invoice, then fully pay it as admin (-> Paid).
    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Pre-condition: Fully pay Invoice #1 as an admin (the Salesperson role cannot Register Payment)', async () => {
      await registerFullPaymentAsAdmin(page, invoice.invoiceUrl);
    });

    let rowStatus = '';
    await test.step('Steps to reproduce - Step 1: Login as Reseller_1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2: Click "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
    });

    await test.step('Steps to reproduce - Step 3: Open this test\'s Invoice #1', async () => {
      const row = await resellerPortalPage.getInvoiceRowData(invoice.invoiceNumber);
      rowStatus = row?.status ?? '';
      console.log(`  - My invoices row status for Invoice #1: "${rowStatus}"`);
      expect(row, 'Invoice #1 should be listed on My invoices').not.toBeNull();
      expect(rowStatus, 'Invoice #1 should be listed with Status = Paid').toMatch(/Paid/i);
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
    });

    await test.step('Steps to reproduce - Step 4: Review the status and the left side of the invoice', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton(CommonUtils.waitTimes.abnormalWait);
      console.log(`  - Status: "${rowStatus}" | PAY NOW present: ${hasPayNow}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.8 - Reseller portal Paid invoice (no PAY NOW)');

      expect(rowStatus, 'The invoice Status should be Paid').toMatch(/Paid/i);
      expect(hasPayNow, 'The "PAY NOW" button should NOT be shown on a Paid invoice').toBeFalsy();
      console.log('✅ Paid multi-product invoice shows Status Paid and no PAY NOW button');
    });
  });
});
