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
 *  Test Case ID    : TC.-B.1.5
 *  Jira            : CRM-11166
 *  Manual TC       : O12CE-O12CC-UC-B1.5
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    Create a fresh validated multi-product invoice, then as the Reseller verify the totals block
 *    on the portal shows Subtotal / Partner Discount(15.0%) / Total, where Subtotal = sum of the
 *    gross line Amounts, Partner Discount = 15% of Subtotal, and Total = Subtotal - Partner Discount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.1\.5:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED multi-product invoice (Invoice #1).
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
 *    3. Review the totals block (Subtotal, Partner Discount, Total)
 *       -> Subtotal = sum of line Amounts; Partner Discount = 15% of Subtotal; Total = Subtotal - Partner Discount
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;

test.describe('TC.-B.1.5 - Reseller invoice Subtotal / Partner Discount / Total breakdown', () => {
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

  test('TC.-B.1.5: Multi-product invoice shows the Subtotal / Partner Discount / Total breakdown correctly', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.1.5 ${compactDateTime}`;

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

    await test.step('Steps to reproduce - Step 2: Open this test\'s Invoice #1 from "My invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
    });

    await test.step('Steps to reproduce - Step 3: Review the totals block (Subtotal, Partner Discount, Total)', async () => {
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find(r => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter(r => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const subtotal = money(subtotalRow?.amount);
      const discount = money(discountRow?.amount);
      const total = money(totalRow?.amount);
      const grossSum = invoice.products.reduce((s, p) => s + p.total, 0);
      console.log(`  - breakdown: Subtotal=${subtotal} | Partner Discount=${discount} | Total=${total} | gross line sum=${grossSum.toFixed(2)} | InvoiceTotal#1=${money(invoice.invoiceTotal)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.1.5 - Reseller portal invoice totals breakdown');

      expect(subtotalRow, 'A Subtotal row should be shown').toBeTruthy();
      expect(discountRow, 'A Partner Discount row should be shown').toBeTruthy();
      expect(totalRow, 'A Total row should be shown').toBeTruthy();
      // Subtotal = sum of the 4 gross line Amounts.
      expect(subtotal, 'Subtotal should equal the sum of the gross product line Amounts').toBeCloseTo(grossSum, 1);
      // Partner Discount = 15% of Subtotal.
      expect(discount, 'Partner Discount should be 15% of Subtotal').toBeCloseTo(subtotal * 0.15, 1);
      // Total = Subtotal - Partner Discount (= InvoiceTotal#1).
      expect(total, 'Total should equal Subtotal - Partner Discount').toBeCloseTo(subtotal - discount, 1);
      expect(total, 'Total should equal InvoiceTotal#1').toBeCloseTo(money(invoice.invoiceTotal), 2);
      console.log('✅ Subtotal / Partner Discount(15%) / Total breakdown is correct');
    });
  });
});
