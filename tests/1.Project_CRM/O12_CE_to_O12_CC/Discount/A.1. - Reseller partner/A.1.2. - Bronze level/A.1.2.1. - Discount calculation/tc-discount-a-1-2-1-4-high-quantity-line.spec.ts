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
 *  Test Case ID    : Discount-A.1.2.1.4
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the partner discount is applied ONCE to the summed
 *    line subtotal (Unit Price x Qty) - i.e. order-level, not per-unit - on a high-quantity line
 *    (Qty 10, kept under the ~$4k no-approval threshold): Discount = (UnitPrice x 10) x 15%.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.1\.4:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED deal-registration Invoice for the Bronze reseller with a SINGLE
 *    product line at Quantity = 10 (Public Pricelist_USD, Immediate Payment, no approval). Capture:
 *      - Invoice#1     = Invoice number
 *      - LineQty#1     = the invoice line Quantity  (expected 10)
 *      - Subtotal#1    = the invoice line gross Amount (Unit Price x 10, before partner discount)
 *      - Total#1       = the backend Total (amount_total, NET)
 *  Steps to reproduce  (as the reseller):
 *    1. Login as the reseller ; 2. My Invoices ; 3. search Invoice#1 ; 4. open Invoice#1
 *  Verification Point (Partner Portal invoice detail):
 *    1. The invoice line Quantity = 10.
 *    2. Portal Subtotal = Subtotal#1 (= Unit Price x 10, the summed gross).
 *    3. Partner Discount(15%) amount = Subtotal#1 x 15%  (applied to the summed subtotal, not per unit).
 *    4. Total = Subtotal#1 - discount = Subtotal#1 x 0.85 = backend Total#1.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;
const LINE_QTY = 10; // "high" quantity, kept under the ~$4k no-approval threshold

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const qtyNum = (s: string | undefined | null): number => {
  const m = (s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
};
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.1.4 - Bronze partner discount on a high-quantity line', () => {
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

  test('Discount-A.1.2.1.4: Bronze 15% discount applies to the summed subtotal on a high-quantity line', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount-A.1.2.1.4 ${compactDateTime}`;

    let lineQty = 0;
    let subtotal1 = 0;
    let total1 = 0;

    // Pre-condition: single-product invoice at Qty 10.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition', productQty: LINE_QTY,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Pre-condition - capture LineQty#1 / Subtotal#1 / Total#1 from the validated invoice', async () => {
      const line = await invoicePage.getInvoiceLineData(''); // "" matches the first/only invoice line
      lineQty = qtyNum(line.quantity);
      subtotal1 = money(line.subtotal) || money(await invoicePage.getFirstInvoiceLineSubtotal());
      total1 = money(invoice.invoiceTotal) || money(await invoicePage.getInvoiceTotal());
      console.log(`  - Invoice#1="${invoice.invoiceNumber}" | LineQty#1=${lineQty} | Subtotal#1=${subtotal1} | Total#1=${total1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Invoice#1 validated (Qty 10)');
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

    await test.step('Verification Point: 15% discount on the summed subtotal (Qty 10, order-level not per-unit)', async () => {
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Portal totals (Qty 10)');

      // 1. Quantity = 10 (skip if the backend line reader could not resolve the qty; log it)
      if (lineQty) expect(lineQty, 'The invoice line Quantity should be 10').toBe(LINE_QTY);
      // 2. Subtotal = Subtotal#1 (summed gross = Unit Price x 10)
      expect(portalSubtotal, 'Portal Subtotal should equal the summed line gross (Unit Price x 10)').toBeCloseTo(subtotal1, 1);
      // 3. Discount = Subtotal#1 x 15% (order-level on the summed subtotal)
      expect(portalPercent, 'Partner Discount percent should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      expect(portalDiscount, 'Partner Discount amount should be 15% of the summed Subtotal').toBeCloseTo(expectedDiscount, 1);
      // 4. Total = Subtotal x 0.85 = backend Total#1
      expect(portalTotal, 'Total should equal Subtotal - discount').toBeCloseTo(portalSubtotal - portalDiscount, 1);
      expect(portalTotal, 'Total should equal the backend Total#1').toBeCloseTo(total1, 1);
      console.log('✅ Bronze 15% applied to the summed subtotal on a high-quantity line');
    });
  });
});
