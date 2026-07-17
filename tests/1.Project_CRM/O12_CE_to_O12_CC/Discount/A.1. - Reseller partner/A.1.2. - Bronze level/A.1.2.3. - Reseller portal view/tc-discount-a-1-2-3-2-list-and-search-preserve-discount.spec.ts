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
 *  Test Case ID    : Discount-A.1.2.3.2
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the /my/invoices list shows two differently-sized discounted
 *    invoices, that searching by number narrows to one, and that opening each still renders the correct
 *    per-invoice Partner Discount(15%) breakdown (Total = Subtotal x 0.85).
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.3\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: two fresh VALIDATED Bronze invoices as Thomas - Invoice#A (Qty 1) and Invoice#B
 *    (Qty 3) so their Subtotals/discounts differ. Capture each number + backend Total.
 *  Steps to reproduce (as the reseller):
 *    1. Login as the reseller
 *    2. Click "My Invoices"
 *    3. Verify BOTH Invoice#A and Invoice#B are listed
 *    4. Search Invoice#A -> only Invoice#A remains in the list
 *    5. Open Invoice#A -> its discount breakdown is correct
 *    6. Search + open Invoice#B -> its (different) discount breakdown is correct
 *  Verification Point:
 *    - Both invoices listed; search narrows correctly; each detail shows Partner Discount(15%) with
 *      Total = Subtotal x 0.85 = that invoice's backend Total (discount data intact after list/search).
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const BRONZE_PERCENT = 15;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const parsePercentInLabel = (label: string | undefined | null): number => {
  const m = (label || '').match(/\(\s*([\d.]+)\s*%\s*\)/);
  return m ? parseFloat(m[1]) : NaN;
};

test.describe('Discount-A.1.2.3.2 - Portal list + search preserve the Bronze discount breakdown', () => {
  let oppUrlA: string | null = null;
  let oppUrlB: string | null = null;

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
    await deleteCreatedOpportunityAsAdmin(page, oppUrlA, SKIP_CLEANUP_OPP, testInfo);
    await deleteCreatedOpportunityAsAdmin(page, oppUrlB, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.2.3.2: My Invoices list + search keep each invoice\'s 15% discount breakdown intact', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // two invoices + portal checks
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    // Pre-condition: Invoice#A (Qty 1).
    const noteA = generateDealRegistrationNote();
    const invoiceA = await createValidatedInvoiceAsThomas(page, {
      oppName: `TEST Discount-A.1.2.3.2-A ${noteA.compactDateTime}`,
      contactName: noteA.leadName, companyEmail: noteA.companyEmail, internalNote: noteA.note,
      stepPrefix: 'Pre-condition A',
    });
    oppUrlA = invoiceA.oppUrl;

    // Switch Thomas session cleanly, then Invoice#B (Qty 3).
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    const noteB = generateDealRegistrationNote();
    const invoiceB = await createValidatedInvoiceAsThomas(page, {
      oppName: `TEST Discount-A.1.2.3.2-B ${noteB.compactDateTime}`,
      contactName: noteB.leadName, companyEmail: noteB.companyEmail, internalNote: noteB.note,
      stepPrefix: 'Pre-condition B', productQty: 3,
    });
    oppUrlB = invoiceB.oppUrl;
    console.log(`  - Invoice#A="${invoiceA.invoiceNumber}" Total=${money(invoiceA.invoiceTotal)} | Invoice#B="${invoiceB.invoiceNumber}" Total=${money(invoiceB.invoiceTotal)}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - both invoices validated').catch(() => {});

    // Reusable per-invoice detail assertion. Always start from a FRESH My Invoices list (by URL, so it
    // works even from an invoice-detail page) so the search box is present and unfiltered.
    const verifyDetailDiscount = async (num: string, backendTotal: number, label: string) => {
      await resellerPortalPage.gotoMyInvoices();
      await resellerPortalPage.searchInvoices(num);
      await resellerPortalPage.openInvoiceByNumber(num);
      await resellerPortalPage.waitForDetailLineTable();
      const rows = await resellerPortalPage.getDetailTotalsBreakdown();
      const find = (re: RegExp) => rows.find((r) => re.test(r.label));
      const subtotal = money(find(/^Subtotal/i)?.amount);
      const discountRow = find(/Partner Discount/i);
      const discount = money(discountRow?.amount);
      const total = money(rows.filter((r) => /^Total$/i.test(r.label)).pop()?.amount || find(/^Total/i)?.amount);
      const pct = parsePercentInLabel(discountRow?.label);
      console.log(`  - ${label}: Subtotal=${subtotal} Discount(${pct}%)=${discount} Total=${total} backendTotal=${backendTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Verification - ${label} detail`);
      expect(pct, `${label}: percent should be 15`).toBeCloseTo(BRONZE_PERCENT, 1);
      expect(discount, `${label}: discount should be 15% of Subtotal`).toBeCloseTo(subtotal * (BRONZE_PERCENT / 100), 1);
      expect(total, `${label}: Total should be Subtotal x 0.85`).toBeCloseTo(subtotal * (1 - BRONZE_PERCENT / 100), 1);
      expect(total, `${label}: Total should equal the backend Total`).toBeCloseTo(backendTotal, 1);
    };

    await test.step('Steps to reproduce - Step 1: Login as the reseller', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce - Step 2-3: My Invoices lists BOTH Invoice#A and Invoice#B (verified via search - the reseller has many accumulated invoices, so the raw list is paginated)', async () => {
      await resellerPortalPage.clickMyInvoices();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - My Invoices list');
      // Confirm each invoice EXISTS for this reseller by searching for it (search filters the whole set,
      // avoiding pagination). isInvoiceListed on the raw first page is unreliable with lots of data.
      await resellerPortalPage.gotoMyInvoices();
      await resellerPortalPage.searchInvoices(invoiceA.invoiceNumber);
      const afterA = await resellerPortalPage.getListedInvoiceNumbers();
      await resellerPortalPage.gotoMyInvoices();
      await resellerPortalPage.searchInvoices(invoiceB.invoiceNumber);
      const afterB = await resellerPortalPage.getListedInvoiceNumbers();
      console.log(`  - search A -> ${JSON.stringify(afterA)} | search B -> ${JSON.stringify(afterB)}`);
      expect(afterA.some((n) => n.includes(invoiceA.invoiceNumber)), 'Invoice#A should be found via search').toBeTruthy();
      expect(afterB.some((n) => n.includes(invoiceB.invoiceNumber)), 'Invoice#B should be found via search').toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 4: Search Invoice#A -> only Invoice#A remains (B filtered out)', async () => {
      await resellerPortalPage.gotoMyInvoices();
      await resellerPortalPage.searchInvoices(invoiceA.invoiceNumber);
      const listed = await resellerPortalPage.getListedInvoiceNumbers();
      console.log(`  - after search "${invoiceA.invoiceNumber}", listed rows: ${JSON.stringify(listed)}`);
      expect(listed.some((n) => n.includes(invoiceA.invoiceNumber)), 'Invoice#A should be in the filtered list').toBeTruthy();
      expect(listed.some((n) => n.includes(invoiceB.invoiceNumber)), 'Invoice#B should NOT be in the filtered list').toBeFalsy();
    });

    await test.step('Steps to reproduce - Step 5-6: Open each invoice; its 15% discount breakdown is intact', async () => {
      await verifyDetailDiscount(invoiceA.invoiceNumber, money(invoiceA.invoiceTotal), 'Invoice#A');
      await verifyDetailDiscount(invoiceB.invoiceNumber, money(invoiceB.invoiceTotal), 'Invoice#B');
      console.log('✅ List + search preserve each Bronze invoice\'s 15% discount breakdown');
    });
  });
});
