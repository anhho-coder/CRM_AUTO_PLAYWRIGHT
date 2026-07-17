import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin, money } from '@helpers/uc-b-1-multi-product-invoice.helper';

/**
 * ===========================================================================
 *  UC-B-1  -  Reseller views invoices with multiple products
 * ===========================================================================
 *  Test Case ID    : TC.-B.1.7
 *  Jira            : CRM-11168
 *  Manual TC       : O12CE-O12CC-UC-B1.7
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated (unpaid) multi-product invoice, then as the Reseller verify the
 *    invoice detail shows a "PAY NOW" button, the Status is Open, and the left-side Total = InvoiceTotal#1.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.7:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED (unpaid) multi-product invoice (Invoice #1), Status = Open.
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
 *    2. Open this test's Invoice #1 from "My invoices"
 *    3. Review the left side of the invoice detail page
 *       -> a "PAY NOW" button is shown; Status = Open (unpaid); left-side Total = InvoiceTotal#1
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.7 - Reseller sees PAY NOW on an Open multi-product invoice', () => {
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

  test('TC.-B.1.7: Open multi-product invoice shows a PAY NOW button on the portal', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.7 ${compactDateTime}`;

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;
    let rowStatus = '';

    await test.step('Steps to reproduce - Step 1: Login as Reseller_1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2: Open this test\'s Invoice #1 from "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      const row = await resellerPortalPage.getInvoiceRowData(invoice.invoiceNumber);
      rowStatus = row?.status ?? '';
      console.log(`  - My invoices row status for Invoice #1: "${rowStatus}"`);
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
    });

    await test.step('Steps to reproduce - Step 3: Review the left side of the invoice detail page', async () => {
      const hasPayNow = await resellerPortalPage.hasPayNowButton();
      const leftTotal = await resellerPortalPage.getDetailTotalAmount();
      console.log(`  - PAY NOW present: ${hasPayNow} | left Total: "${leftTotal}" | InvoiceTotal#1: "${invoice.invoiceTotal}" | status: "${rowStatus}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.7 - Reseller portal Open invoice (PAY NOW)');

      expect(hasPayNow, 'A "PAY NOW" button should be shown on the Open invoice').toBeTruthy();
      expect(rowStatus, 'The invoice Status should be Open (unpaid)').toMatch(/Open/i);
      expect(money(leftTotal), 'The left-side Total should equal InvoiceTotal#1').toBeCloseTo(money(invoice.invoiceTotal), 2);
      console.log('✅ Open multi-product invoice shows PAY NOW, Status Open, and the matching Total');
    });
  });
});
