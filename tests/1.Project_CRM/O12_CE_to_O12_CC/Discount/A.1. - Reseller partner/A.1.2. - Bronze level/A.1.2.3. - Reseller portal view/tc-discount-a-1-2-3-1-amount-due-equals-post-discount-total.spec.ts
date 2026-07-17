import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.3. - Reseller portal view
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.3.1
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the Partner-Portal invoice payable amount (the left-side
 *    "total to pay") equals the POST-discount Total (Subtotal x 0.85 = backend amount_total), NOT the
 *    pre-discount Subtotal.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.3\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: fresh VALIDATED single-product deal-registration Invoice for the Bronze reseller
 *    (Internal Note #1 from the deal-registration template with fresh dynamic values each run;
 *     Deal Element = Public Pricelist_USD + Immediate Payment + 1 product, Qty 1; New Quotation ->
 *     Confirm -> Create invoice -> Validate). Capture Invoice#1 and the backend Total#1 (amount_total, NET).
 *  Steps to reproduce  (as the reseller TEST-Reseller#Automation-Jun10):
 *    1. Use the account of the reseller to login successful
 *    2. Click "My Invoices"
 *    3. Input Invoice#1 in the search textbox
 *    4. Click on Invoice#1 in the result list to open it
 *  Verification Point (Partner Portal invoice detail):
 *    - Totals block: Subtotal, Partner Discount(15%), Total.
 *    1. The Partner Discount percent = 15 (Bronze).
 *    2. Total = Subtotal - Partner Discount amount (= Subtotal x 0.85).
 *    3. Payable amount (left-side total to pay) = Total (the POST-discount total), and = backend Total#1.
 *    4. Payable amount is NOT equal to the pre-discount Subtotal.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // validated Invoice cannot be cleanly deleted -> retain
const BRONZE_PERCENT = 15;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.3.1 - Reseller portal Amount Due equals the post-discount Total', () => {
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

  test('Discount-A.1.2.3.1: Portal Amount Due equals the post-discount Total (not the pre-discount Subtotal)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount-A.1.2.3.1 ${compactDateTime}`;

    // Pre-condition: create + validate the single-product Bronze invoice as Thomas.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });
    createdOppUrl = invoice.oppUrl;
    const backendTotal = money(invoice.invoiceTotal);
    console.log(`  - Invoice#1 = "${invoice.invoiceNumber}" | backend Total#1 (NET) = ${backendTotal}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Invoice#1 validated').catch(() => {});

    await test.step('Steps to reproduce - Step 1: Use the account of the reseller to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as the Bronze reseller (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce - Step 2: Click "My Invoices"', async () => {
      await resellerPortalPage.clickMyInvoices();
    });

    await test.step('Steps to reproduce - Step 3: Input Invoice#1 in the search textbox', async () => {
      await resellerPortalPage.searchInvoices(invoice.invoiceNumber);
    });

    await test.step('Steps to reproduce - Step 4: Click on Invoice#1 in the result list to open it', async () => {
      await resellerPortalPage.openInvoiceByNumber(invoice.invoiceNumber);
      await resellerPortalPage.waitForDetailLineTable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoice#1 opened on portal');
    });

    await test.step('Verification Point: Amount Due = post-discount Total (Subtotal x 0.85 = backend Total), not the Subtotal', async () => {
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter((r) => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const portalSubtotal = money(subtotalRow?.amount);
      const portalDiscount = money(discountRow?.amount);
      const portalTotal = money(totalRow?.amount);
      const portalPercent = parsePercentInLabel(discountRow?.label);
      // For an OPEN (unpaid) invoice the reseller's headline payable amount is the left-side total
      // ("Pay now" / total to pay). The paid-invoice "Amount Due $0" row (getDetailAmountDue) only
      // appears once the invoice is settled - covered by A.1.2.3.3.
      const payable = money(await resellerPortalPage.getDetailTotalAmount());

      console.log(`  - Subtotal=${portalSubtotal} | Partner Discount(${portalPercent}%)=${portalDiscount} | Total=${portalTotal} | Payable(left)=${payable} | backend Total#1=${backendTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Portal totals + payable amount');

      expect(subtotalRow, 'A Subtotal row should be shown').toBeTruthy();
      expect(discountRow, 'A Partner Discount row should be shown').toBeTruthy();
      expect(totalRow, 'A Total row should be shown').toBeTruthy();
      // 1. Bronze percent = 15
      expect(portalPercent, 'Partner Discount percent should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      // 2. Total = Subtotal - discount = Subtotal x 0.85
      expect(portalTotal, 'Total should equal Subtotal - Partner Discount').toBeCloseTo(portalSubtotal - portalDiscount, 1);
      expect(portalTotal, 'Total should equal Subtotal x (1 - 15%)').toBeCloseTo(portalSubtotal * (1 - BRONZE_PERCENT / 100), 1);
      // 3. The payable amount = the post-discount Total = backend Total#1
      expect(payable, 'The portal payable amount should equal the post-discount Total').toBeCloseTo(portalTotal, 1);
      expect(payable, 'The portal payable amount should equal the backend invoice Total#1').toBeCloseTo(backendTotal, 1);
      // 4. The payable amount is NOT the pre-discount Subtotal
      expect(Math.abs(payable - portalSubtotal), 'The payable amount must NOT equal the pre-discount Subtotal').toBeGreaterThan(0.5);
      console.log('✅ The portal payable amount reflects the post-discount Total (Bronze 15% applied)');
    });
  });
});
