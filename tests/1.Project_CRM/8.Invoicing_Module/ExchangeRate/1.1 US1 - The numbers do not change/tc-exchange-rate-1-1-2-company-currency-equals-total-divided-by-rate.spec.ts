import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US1: the company-currency figure equals amount / date's rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.1.2
 *  Automation-Type : new
 *  Automation-Date : 2026-08-18
 *
 *  Summary:
 *    For each currency the business transacts in (EUR, GBP, CHF), take one issued invoice from the
 *    Invoices list, read its Total and its "Total in Company Currency", then open that currency's rate
 *    history and resolve the rate that applies to the invoice date (the LATEST row dated on or before
 *    it). Verify "Total in Company Currency" = Total / that rate - i.e. the amount is DIVIDED by the
 *    rate, and the rate used is the one applicable to the document's own date.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.1\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - No data needs creating - this case reads invoices that already exist
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Customers > Invoices, filter to Paid with "Filters" > "Add Custom
 *       Filter" on Status, then isolate the currency with a SECOND custom filter on Currency using the
 *       operator "contains". Notes for this build: "Total in Company Currency" is already a default
 *       column on this list so there is nothing to tick; there is NO Currency column to tick; and Open
 *       and Paid cannot be combined because Odoo ANDs two separate custom filters
 *    2. Pick one euro invoice and write down its Number, Invoice Date, Total and "Total in Company
 *       Currency"
 *    3. Open the Invoicing module > Configuration > Accounting > Currencies, click the "EUR" row, then
 *       click the "Rates" button in the box at the top right of the currency form
 *    4. In the "Currency Rates" list find the row with the LATEST Date that is on or before the invoice
 *       date written down in step 2, and write down its Rate to six decimals
 *    5. Divide the invoice Total by that Rate and round to two decimals
 *    6. Compare the result with the "Total in Company Currency" written down in step 2
 *    7. Repeat steps 2 to 6 for one pound sterling invoice and one Swiss franc invoice
 *
 *  Verification Point:
 *    6. The calculated value EQUALS the "Total in Company Currency" read from the list
 *       _ The rate used is the latest one dated on or before the invoice date, not necessarily a rate
 *         dated the same day
 *    7. The same holds for the pound sterling invoice and for the Swiss franc invoice
 *       _ In all three cases the amount was DIVIDED by the rate, never multiplied
 *
 *  Automation notes:
 *    - "Total in Company Currency" is a LIST-only column on this build (it is not on the invoice form),
 *      so it is read from the Invoices list, and the invoice of a given currency is isolated with
 *      "Filters > Add Custom Filter" on Currency (there is no Currency column on this list's tree view).
 *    - The rate is displayed to 6 decimals while the company total is rounded to 2 dp, so the comparison
 *      allows a small magnitude-scaled tolerance (rate-rounding error grows with the amount).
 * ===========================================================================
 */

/** The currencies the business transacts in that have issued invoices on pre-production. */
const CURRENCIES = ['EUR', 'GBP', 'CHF'];

/**
 * The status used to isolate an ISSUED invoice. "Paid" is chosen over "Open" because Odoo ANDs two
 * separate custom filters, so Open and Paid cannot be OR-ed as two facets - and every transacting
 * currency has thousands of Paid invoices (EUR 62926, GBP 3173, CHF 1189) while Open is scarce
 * (GBP 8, CHF 1), which left the filtered list empty for GBP.
 */
const ISSUED_STATUS = 'Paid';

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

interface InvoiceFacts {
  currency: string;
  number: string;
  rawDate: string;
  isoDate: string;
  total: number;
  totalCompany: number;
  rateDate: string;
  rate: number;
}

test.describe('CRM-11857_1.1.2 - US1: company-currency figure equals Total / the date rate', () => {
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

  test('CRM-11857_1.1.2: US1 - The company-currency figure on an issued invoice equals its amount divided by the rate of its invoice date', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    const facts: InvoiceFacts[] = [];

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    for (const code of CURRENCIES) {
      await test.step(`Step 1-2 (${code}): Open the Invoices list, isolate one issued ${code} invoice and read its figures`, async () => {
        await invoicePage.openCustomerInvoicesList();
        // A hash navigation does not reset the search bar, so drop any facet left by the previous pass -
        // otherwise the currency filters AND together and the list matches nothing.
        await invoicePage.clearListSearchFacets();
        // No Currency column exists on this list's tree view, so isolate the currency with a custom filter.
        await invoicePage.addInvoiceListCustomFilter('Currency', code, { operator: 'contains' });
        await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

        // Wait for the filtered list to SETTLE before reading a row. Reading straight after the facet is
        // applied returned an empty row for GBP while EUR and CHF happened to be quick enough - the
        // repo's row counter polls until the row count stops changing, which removes that race.
        const rowsFound = await invoicePage.getInvoiceListRowCount();
        console.log(`  - Rows in the filtered ${code} list: ${rowsFound}`);

        const row = await invoicePage.getInvoiceListRowFields(
          ['Number', 'Invoice Date', 'Total', 'Total in Company Currency']
        );
        const rawDate = row['Invoice Date'] || '';
        facts.push({
          currency: code,
          number: row['Number'] || '',
          rawDate,
          isoDate: CurrencyPage.toIsoDate(rawDate),
          total: money(row['Total']),
          totalCompany: money(row['Total in Company Currency']),
          rateDate: '',
          rate: 0,
        });
        console.log(`  - ${code} invoice picked: ${row['Number']} dated ${rawDate}, Total "${row['Total']}", Total in Company Currency "${row['Total in Company Currency']}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 1-2 - ${code} invoice isolated on the Invoices list`).catch(() => {});
      });
    }

    for (const fact of facts) {
      await test.step(`Step 3-4 (${fact.currency}): Open the ${fact.currency} rate history and resolve the rate applicable to ${fact.rawDate}`, async () => {
        await currencyPage.openRatesForCurrency(fact.currency);
        const applicable = await currencyPage.getRateApplicableToDate(fact.isoDate);
        fact.rate = applicable ? applicable.rate : 0;
        fact.rateDate = applicable ? applicable.rawDate : '';
        console.log(`  - ${fact.currency}: the rate applicable to ${fact.rawDate} is ${fact.rate} (from the row dated ${fact.rateDate || 'none found'})`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 3-4 - ${fact.currency} rate history resolved`).catch(() => {});
      });
    }

    await test.step('Step 5-6-7 / Verification Point: Total in Company Currency = Total / the rate applicable to the invoice date, for every currency', async () => {
      console.log('VERIFY - conversion math per currency:');
      for (const fact of facts) {
        const expectedUSD = fact.rate ? fact.total / fact.rate : 0;
        const tolerance = Math.max(0.05, expectedUSD * 0.002);
        const multipliedUSD = fact.total * fact.rate; // what a multiply-instead-of-divide bug would give

        console.log(`  [${fact.currency}] invoice ${fact.number} dated ${fact.rawDate}`);
        console.log(`    Rate row used                       : ${fact.rateDate} = ${fact.rate}`);
        console.log(`    Expected Total in Company Currency  : ${expectedUSD.toFixed(2)}  (= ${fact.total} / ${fact.rate})`);
        console.log(`    Actual   Total in Company Currency  : ${fact.totalCompany}`);
        console.log(`    Allowed tolerance                   : +/- ${tolerance.toFixed(4)}`);
        console.log(`    (a multiply bug would have given    : ${multipliedUSD.toFixed(2)})`);

        expect(fact.number, `[${fact.currency}] an issued invoice should have been found on the list`).toBeTruthy();
        expect(fact.total, `[${fact.currency}] the invoice Total should be a positive number`).toBeGreaterThan(0);
        expect(fact.rate, `[${fact.currency}] a rate row dated on or before ${fact.rawDate} should exist in the history`).toBeGreaterThan(0);
        expect(fact.totalCompany, `[${fact.currency}] "Total in Company Currency" should be a positive number`).toBeGreaterThan(0);
        expect(
          Math.abs(fact.totalCompany - expectedUSD),
          `[${fact.currency}] "Total in Company Currency" (${fact.totalCompany}) should equal Total / rate (${expectedUSD.toFixed(2)}) using the rate dated ${fact.rateDate}`
        ).toBeLessThanOrEqual(tolerance);
        console.log(`    Result: PASS - ${fact.currency} converts by DIVIDING by the rate of its own date`);
      }

      expect(facts.length, 'All three transacting currencies should have been checked').toBe(CURRENCIES.length);
      console.log(`✅ CRM-11857_1.1.2 verified for ${facts.map((f) => f.currency).join(', ')}: the company-currency figure = Total / the rate applicable to the invoice date`);
    });
  });
});
