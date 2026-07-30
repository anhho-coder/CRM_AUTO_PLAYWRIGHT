import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import {
  createValidatedInvoiceAsThomas,
  registerFullPaymentAsAccountant,
  deleteCreatedOpportunityAsAdmin,
} from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.3. - Reseller portal view
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.3.3
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, after the invoice is fully paid the Partner-Portal detail still
 *    shows the discount breakdown (Subtotal, Partner Discount(15%), Total) for audit, while the
 *    "Amount Due" drops to $0 and the "This invoice is paid" message appears.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.3\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1: fresh VALIDATED single-product Bronze invoice (as Thomas). Capture Invoice#1,
 *    Total#1 (NET), and the backend Invoice URL.
 *  Pre-condition #2: as Faye (accountant), Register Payment for the full amount -> Invoice#1 = Paid.
 *  Steps to reproduce (as the reseller):
 *    1. Login as the reseller ; 2. My Invoices ; 3. search Invoice#1 ; 4. open Invoice#1
 *  Verification Point (Partner Portal invoice detail, PAID):
 *    1. "This invoice is paid" message is shown.
 *    2. Amount Due = $0.00.
 *    3. The Partner Discount(15%) row is STILL present (discount not removed on payment).
 *    4. Total = Subtotal - discount = Subtotal x 0.85 = backend Total#1 (discount amounts unchanged).
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.3.3 - Paid Bronze invoice keeps its discount breakdown on the portal', () => {
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

  test('Discount-A.1.2.3.3: A fully-paid Bronze invoice still shows the Partner Discount(15%) breakdown', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount - Discount-A.1.2.3.3 - ${compactDateTime}`;

    // Pre-condition #1: create + validate the invoice as Thomas.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition #1',
    });
    createdOppUrl = invoice.oppUrl;
    const backendTotal = money(invoice.invoiceTotal);

    // Pre-condition #2: as Faye, register the full payment -> Paid.
    await registerFullPaymentAsAccountant(page, invoice.invoiceUrl, 'Pre-condition #2');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 marked Paid').catch(() => {});

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Paid Invoice#1 opened on portal');
    });

    await test.step('Verification Point: Paid invoice shows paid + $0 due but KEEPS the Partner Discount(15%) breakdown', async () => {
      const paidShown = await resellerPortalPage.isInvoicePaidMessageShown();
      const amountDue = money(await resellerPortalPage.getDetailAmountDue());
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotalRow = find(/^Subtotal/i);
      const discountRow = find(/Partner Discount/i);
      const totalRow = rows.filter((r) => /^Total$/i.test(r.label)).pop() || find(/^Total/i);

      const portalSubtotal = money(subtotalRow?.amount);
      const portalDiscount = money(discountRow?.amount);
      const portalTotal = money(totalRow?.amount);
      const portalPercent = parsePercentInLabel(discountRow?.label);

      console.log(`  - paidShown=${paidShown} | Amount Due=${amountDue} | Subtotal=${portalSubtotal} | Partner Discount(${portalPercent}%)=${portalDiscount} | Total=${portalTotal} | backend Total#1=${backendTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Paid invoice totals block');

      // 1. Paid message shown
      expect(paidShown, 'The "This invoice is paid" message should be shown').toBeTruthy();
      // 2. Amount Due = 0
      expect(amountDue, 'Amount Due should be 0 on a fully-paid invoice').toBeCloseTo(0, 1);
      // 3. Partner Discount row still present + still 15%
      expect(discountRow, 'The Partner Discount row should still be present on a paid invoice').toBeTruthy();
      expect(portalPercent, 'The discount percent should still be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      // 4. Discount math unchanged: Total = Subtotal x 0.85 = backend Total#1
      expect(portalTotal, 'Total should equal Subtotal - discount').toBeCloseTo(portalSubtotal - portalDiscount, 1);
      expect(portalTotal, 'Total should equal Subtotal x 0.85').toBeCloseTo(portalSubtotal * (1 - BRONZE_PERCENT / 100), 1);
      expect(portalTotal, 'Total should equal the backend Total#1').toBeCloseTo(backendTotal, 1);
      console.log('✅ Paid Bronze invoice retains its 15% Partner Discount breakdown (Amount Due $0)');
    });
  });
});
