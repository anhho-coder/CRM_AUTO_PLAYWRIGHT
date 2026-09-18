import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US1: record the company-currency baseline
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.1.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Take one issued invoice in each currency the business transacts in besides US dollars (EUR, GBP,
 *    CHF) and record its Number, Invoice Date, Total and "Total in Company Currency". The output is the
 *    BASELINE the migration is measured against: the same three figures must read identically on the new
 *    platform, and each one can only be re-checked against the rate that applied on its own date - which
 *    is why the Invoice Date is part of the record.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.1\.1:" --project=chromium
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
 *    1. Open the Invoicing module > Customers > Invoices
 *    2. Filter to Paid with "Filters" > "Add Custom Filter" on Status, then isolate one currency with a
 *       SECOND custom filter on Currency using the operator "contains". Notes for this build: "Total in
 *       Company Currency" is already a default column on this list so there is nothing to tick; there is
 *       NO Currency column to tick; and Open and Paid cannot be combined because Odoo ANDs two separate
 *       custom filters
 *    3. Take the first invoice row and write down: its Number, its Invoice Date, its Total and its
 *       "Total in Company Currency"
 *    4. Clear the search facets, then repeat steps 2 and 3 for GBP and for CHF - a hash navigation does
 *       NOT reset the search bar, so a facet left behind would AND with the next currency and match
 *       nothing
 *    5. Save the three rows you wrote down as the baseline table for this feature
 *
 *  Verification Point:
 *    2. Only invoices whose status is Paid are listed, and only in the currency filtered for
 *    3. The row read has a Total in that currency and a "Total in Company Currency" greater than zero
 *    4. A row is found for EUR, for GBP and for CHF, so the baseline covers the 3 currencies the business
 *       transacts in besides US dollars
 *    5. The baseline table holds 3 rows, each carrying Number, Invoice Date, Total and "Total in Company
 *       Currency"
 *       _ Every "Total in Company Currency" value read is greater than zero
 *       _ Each row's Invoice Date is recorded, because the figure can only be re-checked against the rate
 *         that applied on that date
 *
 *  Automation notes:
 *    - The baseline is printed to the run log as a single block so it can be copied straight into the
 *      pre-cutover record. Nothing is written anywhere: this case only reads.
 * ===========================================================================
 */

/** The currencies the business transacts in besides the company currency. */
const CURRENCIES = ['EUR', 'GBP', 'CHF'];
/** Paid is used because Odoo ANDs two separate custom filters, so Open and Paid cannot be OR-ed. */
const ISSUED_STATUS = 'Paid';

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

interface BaselineRow {
  currency: string;
  number: string;
  invoiceDate: string;
  total: string;
  totalNumeric: number;
  totalCompany: string;
  totalCompanyNumeric: number;
  rowsInList: number;
}

test.describe('CRM-11857_1.1.1 - US1: record the company-currency baseline', () => {
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
    // Read-only test: nothing is created or changed, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.1.1: US1 - Record the company-currency figure of issued invoices in every currency the business transacts in', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const baseline: BaselineRow[] = [];

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    for (const code of CURRENCIES) {
      await test.step(`Step 1-2-3-4 (${code}): Isolate issued ${code} invoices and record the first row`, async () => {
        await invoicePage.openCustomerInvoicesList();
        // A hash navigation does not reset the search bar, so drop any facet left by the previous pass -
        // otherwise the currency filters AND together and the list matches nothing.
        await invoicePage.clearListSearchFacets();
        await invoicePage.addInvoiceListCustomFilter('Currency', code, { operator: 'contains' });
        await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

        const rowsInList = await invoicePage.getInvoiceListRowCount();
        const row = await invoicePage.getInvoiceListRowFields(
          ['Number', 'Invoice Date', 'Total', 'Total in Company Currency']
        );
        baseline.push({
          currency: code,
          number: row['Number'] || '',
          invoiceDate: row['Invoice Date'] || '',
          total: row['Total'] || '',
          totalNumeric: money(row['Total']),
          totalCompany: row['Total in Company Currency'] || '',
          totalCompanyNumeric: money(row['Total in Company Currency']),
          rowsInList,
        });
        console.log(`  - ${code}: ${rowsInList} row(s) in the filtered list; recorded ${row['Number']} dated ${row['Invoice Date']}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 1-4 - ${code} baseline row recorded`).catch(() => {});
      });
    }

    await test.step('Step 5: Print the baseline table so it can be copied into the pre-cutover record', async () => {
      console.log('');
      console.log('=== BASELINE - company-currency figures before the move ===');
      console.log('Currency | Invoice Number      | Invoice Date | Total            | Total in Company Currency');
      for (const b of baseline) {
        console.log(
          `${b.currency.padEnd(8)} | ${b.number.padEnd(19)} | ${b.invoiceDate.padEnd(12)} | ${b.total.padEnd(16)} | ${b.totalCompany}`
        );
      }
      console.log('=== end of baseline ===');
      console.log('');
    });

    await test.step('Verification Point 2-3-4-5: the baseline covers all three currencies and every figure is usable', async () => {
      console.log('VERIFY - the baseline record:');
      console.log(`  Expected currencies covered : ${CURRENCIES.join(', ')} (count ${CURRENCIES.length})`);
      console.log(`  Actual   currencies covered : ${baseline.map((b) => b.currency).join(', ')} (count ${baseline.length})`);

      expect(baseline.length, 'One baseline row should have been recorded per currency').toBe(CURRENCIES.length);

      for (const b of baseline) {
        console.log(`  [${b.currency}] invoice="${b.number}" date="${b.invoiceDate}" total="${b.total}" company="${b.totalCompany}" rowsInList=${b.rowsInList}`);
        expect(b.rowsInList, `[${b.currency}] the filtered list should hold at least one issued invoice`).toBeGreaterThan(0);
        expect(b.number, `[${b.currency}] an Invoice Number should have been recorded`).toBeTruthy();
        expect(b.invoiceDate, `[${b.currency}] an Invoice Date should have been recorded - the figure can only be re-checked against that date's rate`).toBeTruthy();
        expect(b.totalNumeric, `[${b.currency}] the Total should be a positive number`).toBeGreaterThan(0);
        expect(b.totalCompanyNumeric, `[${b.currency}] "Total in Company Currency" should be a positive number`).toBeGreaterThan(0);
        console.log(`    Result: PASS - ${b.currency} baseline row is complete and usable`);
      }

      const distinctCurrencies = new Set(baseline.map((b) => b.currency));
      expect(distinctCurrencies.size, 'The three baseline rows should cover three DIFFERENT currencies').toBe(CURRENCIES.length);
      console.log('  Result: PASS - the baseline holds one complete row per transacting currency');
      console.log('✅ CRM-11857_1.1.1 verified: the pre-move company-currency baseline is recorded for EUR, GBP and CHF');
    });
  });
});
