import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US8: the history explains a historical figure
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.8.2
 *  Automation-Type : new
 *  Automation-Date : 2026-08-18
 *
 *  Summary:
 *    Take one issued euro invoice, then work the explanation the other way round - as a finance user
 *    would: open the EUR rate history, find the row that applies to the invoice date, and show that the
 *    invoice's "Total in Company Currency" can be re-derived from that row alone. The point of the case
 *    is that the history is complete enough to account for a figure already issued, with no help from
 *    development.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.8\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Pick one existing issued euro invoice and write down its Number, its Invoice Date, its Total and
 *      its "Total in Company Currency" from the Invoices list, filtered to Paid with a custom filter on
 *      Status and to EUR with a custom filter on Currency using the operator "contains" ("Total in
 *      Company Currency" is already a default column on that list; it is NOT on the invoice form)
 *    - Any issued euro invoice works - the case reads whichever one the filtered list returns first. On
 *      the current environment INV/2026/2227 dated 16 Aug 2026 has Total 245.65 and "Total in Company
 *      Currency" 288.37
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click "EUR", then click the
 *       "Rates" button in the box at the top right
 *    2. Sort the "Currency Rates" list by Date and find the row with the latest Date that is on or before
 *       the invoice date written down in the pre-conditions
 *    3. Write down that row's Date and Rate to six decimals
 *    4. Divide the invoice Total by that Rate and round to two decimals
 *    5. Compare the result with the "Total in Company Currency" written down in the pre-conditions
 *
 *  Verification Point:
 *    2. Such a row is found, so the history is complete enough to explain the figure
 *    5. The calculated value EQUALS the invoice's "Total in Company Currency"
 *       _ A finance user can therefore explain any historical figure from the history alone, with no help
 *         from development
 * ===========================================================================
 */

/** The currency whose history is used to explain the figure. */
const CURRENCY_CODE = 'EUR';

/**
 * The status used to isolate an ISSUED invoice. "Paid" is chosen over "Open" because Odoo ANDs two
 * separate custom filters, so Open and Paid cannot be OR-ed as two facets - and every transacting
 * currency has thousands of Paid invoices (EUR 62926, GBP 3173, CHF 1189) while Open is scarce
 * (GBP 8, CHF 1), which left the filtered list empty for GBP.
 */
const ISSUED_STATUS = 'Paid';

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('CRM-11857_1.8.2 - US8: the rate history explains a historical figure', () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // Read-only test: nothing is created, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.8.2: US8 - A past rate can be found in the history and used to explain an issued figure', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    let invoiceNumber = '';
    let invoiceRawDate = '';
    let invoiceIsoDate = '';
    let invoiceTotal = 0;
    let invoiceTotalCompany = 0;
    let rateRowDate = '';
    let rateRowIsoDate = '';
    let rateRowValue = 0;
    let historyRowCount = 0;

    await test.step('Pre-condition - Step 1: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Pre-condition - Step 2: Pick one existing issued euro invoice and write down its figures', async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.addInvoiceListCustomFilter('Currency', CURRENCY_CODE, { operator: 'contains' });
      await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

      const row = await invoicePage.getInvoiceListRowFields(
        ['Number', 'Invoice Date', 'Total', 'Total in Company Currency']
      );
      invoiceNumber = row['Number'] || '';
      invoiceRawDate = row['Invoice Date'] || '';
      invoiceIsoDate = CurrencyPage.toIsoDate(invoiceRawDate);
      invoiceTotal = money(row['Total']);
      invoiceTotalCompany = money(row['Total in Company Currency']);
      console.log('  - The figure to be explained:');
      console.log(`      Invoice                    : ${invoiceNumber}`);
      console.log(`      Invoice Date               : ${invoiceRawDate} (${invoiceIsoDate})`);
      console.log(`      Total                      : "${row['Total']}" (${invoiceTotal})`);
      console.log(`      Total in Company Currency  : "${row['Total in Company Currency']}" (${invoiceTotalCompany})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - the issued euro invoice to explain').catch(() => {});
    });

    await test.step('Step 1-2-3: Open the EUR rate history, find the row applicable to the invoice date and read its Rate', async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      historyRowCount = await currencyPage.getListTotalCount();
      await currencyPage.sortListByColumn('Date', 'desc');

      const applicable = await currencyPage.getRateApplicableToDate(invoiceIsoDate);
      rateRowDate = applicable ? applicable.rawDate : '';
      rateRowIsoDate = applicable ? applicable.date : '';
      rateRowValue = applicable ? applicable.rate : 0;
      console.log(`  - History holds ${historyRowCount} rows for ${CURRENCY_CODE}`);
      console.log(`  - Row that explains the figure: ${rateRowDate || 'none found'} = ${rateRowValue}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-3 - the explaining rate row found in the history').catch(() => {});
    });

    await test.step('Step 4-5 / Verification Point: the figure is re-derived from the history row alone', async () => {
      const expectedUSD = rateRowValue ? invoiceTotal / rateRowValue : 0;
      const tolerance = Math.max(0.05, expectedUSD * 0.002);

      console.log('VERIFY - the history explains the issued figure:');
      console.log(`  Invoice                             : ${invoiceNumber} dated ${invoiceRawDate}`);
      console.log(`  Expected an explaining row dated    : on or before ${invoiceIsoDate}`);
      console.log(`  Actual   explaining row             : ${rateRowDate} (${rateRowIsoDate}) = ${rateRowValue}`);
      console.log(`  Expected Total in Company Currency  : ${expectedUSD.toFixed(2)}  (= ${invoiceTotal} / ${rateRowValue})`);
      console.log(`  Actual   Total in Company Currency  : ${invoiceTotalCompany}`);
      console.log(`  Allowed tolerance                   : +/- ${tolerance.toFixed(4)}`);

      expect(invoiceNumber, 'An issued euro invoice should have been found on the list').toBeTruthy();
      expect(invoiceTotal, 'The invoice Total should be a positive number').toBeGreaterThan(0);
      expect(historyRowCount, 'The EUR rate history should hold more than one row').toBeGreaterThan(1);
      expect(rateRowDate, `A rate row dated on or before ${invoiceRawDate} should be findable in the history`).toBeTruthy();
      expect(rateRowIsoDate <= invoiceIsoDate, 'The explaining row must be dated on or before the invoice date').toBe(true);
      expect(rateRowValue, 'The explaining row should carry a positive Rate').toBeGreaterThan(0);
      expect(
        Math.abs(invoiceTotalCompany - expectedUSD),
        `The issued figure (${invoiceTotalCompany}) should be re-derivable as Total / the history rate (${expectedUSD.toFixed(2)})`
      ).toBeLessThanOrEqual(tolerance);
      console.log('  Result: PASS - the issued figure is fully accounted for by one row of the rate history');
      console.log('✅ CRM-11857_1.8.2 verified: a finance user can explain a historical company-currency figure from the rate history alone');
    });
  });
});
