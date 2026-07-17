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
 *  Test Case ID    : TC.-B.1.3
 *  Jira            : CRM-11164
 *  Manual TC       : O12CE-O12CC-UC-B1.3
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice and capture its backend net Total (InvoiceTotal#1);
 *    then as the Reseller verify the left-side Total on the portal equals InvoiceTotal#1 (NET, after the
 *    automatic 15% Partner Discount).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1); note InvoiceTotal#1 on the backend.
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
 *    3. Open this test's Invoice #1
 *    4. Read the Total shown on the left side  -> left-side Total = InvoiceTotal#1 (NET, after 15% Partner Discount)
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.3 - Reseller invoice portal Total equals the validated net total', () => {
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

  test('TC.-B.1.3: Multi-product invoice portal Total equals the validated invoice net total (after Partner Discount)', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.3 ${compactDateTime}`;

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Steps to reproduce - Step 1: Login as Reseller_1', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2: Click "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
    });

    await test.step('Steps to reproduce - Step 3: Open this test\'s Invoice #1', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
    });

    await test.step('Steps to reproduce - Step 4: Read the Total shown on the left side of the invoice', async () => {
      const leftTotal = await resellerPortalPage.getDetailTotalAmount();
      const grossSum = invoice.products.reduce((s, p) => s + p.total, 0);
      console.log(`  - Portal left Total: "${leftTotal}" | InvoiceTotal#1 (net): "${invoice.invoiceTotal}" | gross sum of lines: ${grossSum.toFixed(2)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.3 - Reseller portal invoice Total (net)');

      expect(money(invoice.invoiceTotal), 'InvoiceTotal#1 should be captured').toBeGreaterThan(0);
      expect(money(leftTotal), 'The left-side Total should equal InvoiceTotal#1').toBeCloseTo(money(invoice.invoiceTotal), 2);
      // It is the NET total: strictly less than the sum of the gross product line Amounts (Partner Discount applied).
      expect(money(leftTotal), 'The net Total should be less than the gross sum of the product lines').toBeLessThan(grossSum);
      console.log('✅ Portal left-side Total equals InvoiceTotal#1 (net, after the 15% Partner Discount)');
    });
  });
});
