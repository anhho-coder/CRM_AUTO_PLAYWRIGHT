import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createMultiProductInvoiceAsThomas, deleteCreatedOpportunityAsAdmin, money } from '@helpers/uc-b-1-multi-product-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.1. - Discount calculation
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.1.2
 *  Jira            : N/A   (distinct scenario alongside TC.-B.1.5, which checks the totals-block sums)
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller on a MULTI-product invoice, verify the discount is applied ONCE at
 *    ORDER level - every portal product line stays GROSS (= Qty x list Unit Price, no per-line
 *    reduction), and the single "Partner Discount(15%)" row = 15% of the SUM of those gross lines.
 *    (TC.-B.1.5 checks the Subtotal/Discount/Total block; this checks the per-line placement of the discount.)
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.1\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED 4-product deal-registration Invoice (Sales-Manager-approved band),
 *    capturing each product line's GROSS amount + the NET invoice Total.
 *  Steps to reproduce (as the reseller):
 *    1. Login as the reseller ; 2. My Invoices ; 3. search Invoice#1 ; 4. open Invoice#1
 *  Verification Point (Partner Portal invoice detail):
 *    1. Each product line Amount = its GROSS (Qty x list Unit Price) - i.e. NO per-line discount.
 *    2. Subtotal = the SUM of the per-line gross Amounts.
 *    3. Exactly one "Partner Discount(15%)" reduction = 15% of that Subtotal.
 *    4. Total = Subtotal - Partner Discount = the backend NET Total.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;

const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.1.2 - Multi-product: Bronze 15% applied once at order level', () => {
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

  test('Discount-A.1.2.1.2: On a multi-product invoice the 15% discount is order-level and each line stays gross', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // multi-product + Sales Manager approval
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note } = generateDealRegistrationNote();
    const oppName = `TEST Discount - Discount-A.1.2.1.2 - ${compactDateTime}`;

    const invoice = await createMultiProductInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote: note, browser, testInfo,
    });
    createdOppUrl = invoice.oppUrl;
    const grossSum = invoice.products.reduce((s, p) => s + p.total, 0);
    console.log(`  - Invoice#1="${invoice.invoiceNumber}" | ${invoice.products.length} products | gross line sum=${grossSum.toFixed(2)} | NET Total=${money(invoice.invoiceTotal)}`);

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Multi-product Invoice#1 opened');
    });

    await test.step('Verification Point: each line is GROSS (no per-line discount) and one order-level 15% discount applies', async () => {
      // 1. Each portal product line Amount equals its GROSS (Qty x list Unit Price) = the backend gross.
      let portalLineSum = 0;
      for (const p of invoice.products) {
        const line = await resellerPortalPage.getDetailProductLine(p.code);
        const portalAmount = money(line?.amount);
        portalLineSum += portalAmount;
        const grossFromQtyPrice = p.quantity * p.unitPrice;
        console.log(`  - line ${p.code}: portalAmount=${portalAmount} | backendGross=${p.total} | qty*unitPrice=${grossFromQtyPrice.toFixed(2)}`);
        expect(line, `Line ${p.code} should be shown on the portal`).toBeTruthy();
        expect(portalAmount, `Line ${p.code} portal Amount should equal its backend gross`).toBeCloseTo(p.total, 1);
        expect(p.total, `Line ${p.code} gross should equal Qty x list Unit Price (no per-line discount)`).toBeCloseTo(grossFromQtyPrice, 1);
      }

      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotal = money(find(/^Subtotal/i)?.amount);
      const discountRows = rows.filter((r) => /Partner Discount/i.test(r.label));
      const discountRow = discountRows[0];
      const discount = money(discountRow?.amount);
      const total = money(rows.filter((r) => /^Total$/i.test(r.label)).pop()?.amount || find(/^Total/i)?.amount);
      const pct = parsePercentInLabel(discountRow?.label);
      console.log(`  - portalLineSum=${portalLineSum.toFixed(2)} | Subtotal=${subtotal} | Partner Discount rows=${discountRows.length} (${pct}%)=${discount} | Total=${total}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Multi-product order-level discount');

      // 2. Subtotal = sum of the per-line gross Amounts.
      expect(subtotal, 'Subtotal should equal the sum of the per-line gross Amounts').toBeCloseTo(portalLineSum, 1);
      expect(subtotal, 'Subtotal should equal the backend gross line sum').toBeCloseTo(grossSum, 1);
      // 3. Exactly ONE order-level Partner Discount = 15% of the Subtotal.
      expect(discountRows.length, 'There should be exactly one order-level Partner Discount row').toBe(1);
      expect(pct, 'The Partner Discount percent should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      expect(discount, 'The Partner Discount should be 15% of the summed Subtotal').toBeCloseTo(subtotal * (BRONZE_PERCENT / 100), 1);
      // 4. Total = Subtotal - discount = backend NET Total.
      expect(total, 'Total should equal Subtotal - Partner Discount').toBeCloseTo(subtotal - discount, 1);
      expect(total, 'Total should equal the backend NET Total').toBeCloseTo(money(invoice.invoiceTotal), 2);
      console.log('✅ Multi-product: each line stays gross; a single 15% order-level Partner Discount applies');
    });
  });
});
