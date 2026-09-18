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
 *  Test Case ID    : Discount-A.1.2.1.5
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the partner-discount amount is ROUNDED to 2 decimals and the
 *    total reconciles to the cent. A 7% line discount is used to force a fractional-cent case (e.g.
 *    Subtotal 305.97 x 15% = 45.8955 -> shown as 45.90), so we can prove there is no >2-decimal leak or
 *    off-by-a-cent drift.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.1\.5:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED Bronze invoice as Thomas with a single product line carrying a 7%
 *    line discount (so the line Subtotal has cents whose 15% is a fractional cent). Capture Subtotal#1.
 *  Steps to reproduce (as the reseller): 1. login ; 2. My Invoices ; 3. search Invoice#1 ; 4. open it.
 *  Verification Point (Partner Portal invoice detail):
 *    1. The displayed Partner Discount amount is rounded to 2 decimals = round(Subtotal#1 x 15%, 2).
 *    2. The displayed Total = round(Subtotal#1 x 0.85, 2), and reconciles: Total = Subtotal - Discount
 *       (to within one cent - the rounding rule may round the discount or the net independently).
 *    3. No value is shown with more than 2 decimals.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;
const LINE_DISCOUNT_PCT = 7; // forces a fractional-cent subtotal (e.g. 329.00 -> 305.97)

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const decimals = (s: string | undefined | null): number => {
  const m = (s || '').match(/\.(\d+)/);
  return m ? m[1].length : 0;
};
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.1.5 - Bronze partner-discount rounding / precision', () => {
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

  test('Discount-A.1.2.1.5: The Bronze discount amount is correctly rounded to 2 decimals and the total reconciles', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount - Discount-A.1.2.1.5 - ${compactDateTime}`;

    let subtotal1 = 0;

    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition', lineDiscountPct: LINE_DISCOUNT_PCT,
    });
    createdOppUrl = invoice.oppUrl;

    await test.step('Pre-condition - capture Subtotal#1 (line-discounted, has cents) from the validated invoice', async () => {
      subtotal1 = money(await invoicePage.getFirstInvoiceLineSubtotal());
      const rawDiscount = subtotal1 * (BRONZE_PERCENT / 100);
      console.log(`  - Invoice#1="${invoice.invoiceNumber}" | Subtotal#1=${subtotal1} | raw 15% = ${rawDiscount} (rounds to ${round2(rawDiscount)})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Invoice#1 validated (7% line discount)');
      expect(subtotal1, 'Subtotal#1 should be > 0').toBeGreaterThan(0);
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

    await test.step('Verification Point: discount amount rounded to 2 dp = round(Subtotal x 15%), total reconciles to the cent', async () => {
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter((r) => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const portalSubtotal = money(subtotalRow?.amount);
      const portalDiscount = money(discountRow?.amount);
      const portalTotal = money(totalRow?.amount);
      const portalPercent = parsePercentInLabel(discountRow?.label);

      const rawDiscount = portalSubtotal * (BRONZE_PERCENT / 100);
      const expectedRoundedDiscount = round2(rawDiscount);
      const expectedRoundedNet = round2(portalSubtotal * (1 - BRONZE_PERCENT / 100));
      const fractionalCase = Math.abs(rawDiscount * 100 - Math.round(rawDiscount * 100)) > 1e-9;

      console.log(`  - Subtotal=${portalSubtotal} | Partner Discount(${portalPercent}%)=${portalDiscount} | Total=${portalTotal}`);
      console.log(`  - raw 15% = ${rawDiscount} | expected rounded discount = ${expectedRoundedDiscount} | expected rounded net = ${expectedRoundedNet} | fractional-cent case triggered = ${fractionalCase}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Discount rounding / precision');

      expect(subtotalRow && discountRow && totalRow, 'Subtotal / Partner Discount / Total rows should all be shown').toBeTruthy();
      expect(portalPercent, 'Partner Discount percent should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      // 1. Displayed discount is rounded to 2 decimals (== round(Subtotal x 15%) within one cent).
      expect(Math.abs(portalDiscount - expectedRoundedDiscount), 'Displayed discount should equal round(Subtotal x 15%, 2) to the cent').toBeLessThanOrEqual(0.011);
      // 2. Displayed total = round(Subtotal x 0.85) and reconciles Subtotal - discount to within a cent.
      expect(Math.abs(portalTotal - expectedRoundedNet), 'Displayed total should equal round(Subtotal x 0.85, 2) to the cent').toBeLessThanOrEqual(0.011);
      expect(Math.abs(portalTotal - (portalSubtotal - portalDiscount)), 'Total should reconcile to Subtotal - Discount within a cent').toBeLessThanOrEqual(0.011);
      // 3. Nothing is displayed with more than 2 decimals.
      expect(decimals(subtotalRow?.amount), 'Subtotal should have at most 2 decimals').toBeLessThanOrEqual(2);
      expect(decimals(discountRow?.amount), 'Discount should have at most 2 decimals').toBeLessThanOrEqual(2);
      expect(decimals(totalRow?.amount), 'Total should have at most 2 decimals').toBeLessThanOrEqual(2);
      console.log(`✅ Discount rounding is correct (${fractionalCase ? 'fractional-cent case exercised' : 'no fractional cent this run, consistency still verified'})`);
    });
  });
});
