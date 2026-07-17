import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.1. - Discount calculation
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.1.3
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the order-level partner discount STACKS correctly on top of a
 *    line-level discount (10%) WITHOUT compounding: the invoice Subtotal already reflects the 10% line
 *    discount, then Partner Discount = Subtotal x 15%, and Total = Subtotal x 0.85 (applied once).
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.1\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED Bronze invoice as Thomas with a SINGLE product line carrying a 10%
 *    line-level Discount (Public Pricelist_USD, Immediate Payment, no approval). Capture:
 *      - Invoice#1  = Invoice number
 *      - Subtotal#1 = invoice line gross Amount AFTER the 10% line discount (before partner discount)
 *      - Total#1    = backend Total (amount_total, NET)
 *  Steps to reproduce (as the reseller):
 *    1. Login as the reseller ; 2. My Invoices ; 3. search Invoice#1 ; 4. open Invoice#1
 *  Verification Point (Partner Portal invoice detail):
 *    1. Portal Subtotal = Subtotal#1 (the line-discounted line Amount).
 *    2. Partner Discount(15%) amount = Subtotal#1 x 15%  (15% of the ALREADY line-discounted subtotal).
 *    3. Total = Subtotal#1 - discount = Subtotal#1 x 0.85 = backend Total#1  (single, non-compounded 15%).
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;
const LINE_DISCOUNT_PCT = 10;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.1.3 - Bronze partner discount stacks on a line-level discount', () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.2.1.3: Bronze 15% discount stacks (not compounds) on a 10% line-discounted subtotal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount-A.1.2.1.3 ${compactDateTime}`;

    let subtotal1 = 0;
    let total1 = 0;

    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition', lineDiscountPct: LINE_DISCOUNT_PCT,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Pre-condition - capture Subtotal#1 (line-discounted) and Total#1 from the validated invoice', async () => {
      subtotal1 = money(await invoicePage.getFirstInvoiceLineSubtotal());
      total1 = money(invoice.invoiceTotal) || money(await invoicePage.getInvoiceTotal());
      console.log(`  - Invoice#1="${invoice.invoiceNumber}" | Subtotal#1 (after ${LINE_DISCOUNT_PCT}% line disc)=${subtotal1} | Total#1=${total1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Invoice#1 validated (10% line discount)');
      expect(subtotal1, 'Subtotal#1 should be > 0').toBeGreaterThan(0);
      expect(total1, 'Total#1 should be > 0').toBeGreaterThan(0);
    });

    await test.step('Steps to reproduce - Step 1: Login as the reseller', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2-4: My Invoices -> search Invoice#1 -> open it', async () => {
      await resellerPortalPage.clickMyInvoices();
      await resellerPortalPage.searchInvoices(invoice.invoiceNumber);
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 opened on portal');
    });

    await test.step('Verification Point: 15% partner discount applied once on the 10% line-discounted subtotal', async () => {
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter((r) => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const portalSubtotal = money(subtotalRow?.amount);
      const portalDiscount = money(discountRow?.amount);
      const portalTotal = money(totalRow?.amount);
      const portalPercent = parsePercentInLabel(discountRow?.label);
      const expectedDiscount = subtotal1 * (BRONZE_PERCENT / 100);

      console.log(`  - Subtotal=${portalSubtotal} | Partner Discount(${portalPercent}%)=${portalDiscount} | Total=${portalTotal} | Subtotal#1 x 15% = ${expectedDiscount.toFixed(2)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Portal totals (10% line + 15% partner)');

      expect(subtotalRow, 'A Subtotal row should be shown').toBeTruthy();
      expect(discountRow, 'A Partner Discount row should be shown').toBeTruthy();
      expect(totalRow, 'A Total row should be shown').toBeTruthy();
      // 1. Portal Subtotal = the line-discounted line Amount
      expect(portalSubtotal, 'Portal Subtotal should equal the (line-discounted) Subtotal#1').toBeCloseTo(subtotal1, 1);
      // 2. Partner Discount = 15% of the (already line-discounted) Subtotal
      expect(portalPercent, 'Partner Discount percent should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      expect(portalDiscount, 'Partner Discount amount should be 15% of the line-discounted Subtotal').toBeCloseTo(expectedDiscount, 1);
      // 3. Total = Subtotal x 0.85 = backend Total#1 (single 15%, not compounded again)
      expect(portalTotal, 'Total should equal Subtotal - discount').toBeCloseTo(portalSubtotal - portalDiscount, 1);
      expect(portalTotal, 'Total should equal Subtotal x 0.85').toBeCloseTo(portalSubtotal * (1 - BRONZE_PERCENT / 100), 1);
      expect(portalTotal, 'Total should equal the backend Total#1').toBeCloseTo(total1, 1);
      console.log('✅ Bronze 15% stacks correctly on a 10% line-discounted subtotal (no compounding)');
    });
  });
});
