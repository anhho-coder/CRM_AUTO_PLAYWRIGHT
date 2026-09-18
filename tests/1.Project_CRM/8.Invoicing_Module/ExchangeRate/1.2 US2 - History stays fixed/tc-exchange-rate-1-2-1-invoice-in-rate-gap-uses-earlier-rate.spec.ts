import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US2: an invoice inside a rate gap keeps the earlier rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.2.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-18
 *
 *  Summary:
 *    Read the EUR rate history and locate the GAP - the stretch of dates that carries no rate row at
 *    all. Then find an issued euro invoice dated inside that gap and verify its "Total in Company
 *    Currency" = Total / the rate of the LAST date present before the gap. This proves a document dated
 *    where no rate was published still converts at the most recent earlier rate, and never at a rate of
 *    one.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.2\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Open the Invoicing module > Configuration > Accounting > Currencies > EUR > the "Rates" button,
 *      sort the list by Date descending, and write down: the two most recent dates present, and the next
 *      date present below them. On the current environment those are 18 Aug 2026, 17 Aug 2026 and then
 *      22 Jan 2026 with Rate 0.851861 - so every date from 23 Jan to 16 Aug 2026 has no row at all
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Customers > Invoices, filter to Paid with "Filters" > "Add Custom
 *       Filter" on Status, then isolate the currency with a SECOND custom filter on Currency using the
 *       operator "contains". Notes for this build: "Total in Company Currency" is already a default
 *       column on this list so there is nothing to tick; there is NO Currency column to tick; and Open
 *       and Paid cannot be combined because Odoo ANDs two separate custom filters
 *    2. With the list ordered newest-first, scan the newest rows and take the first invoice whose Invoice
 *       Date falls inside the gap - no date-range filter is needed, because the newest rows already
 *       straddle the gap
 *    3. Pick one euro invoice dated inside the gap and write down its Number, Invoice Date, Total and
 *       "Total in Company Currency"
 *    4. Divide its Total by the Rate of the last date present BEFORE the gap - READ that Rate from the
 *       history rather than assuming a value, so the case survives a backfill (it was 0.851861 when
 *       this case was written) - and round to two decimals
 *    5. Compare the result with the value written down in step 3
 *
 *  Verification Point:
 *    5. The calculated value EQUALS the "Total in Company Currency" read from the list
 *       _ The rate applied is the most recent one on or before the invoice date, never a rate of 1
 *
 *  Automation notes:
 *    - The gap is DISCOVERED from the history at run time rather than hard-coded, so the case keeps
 *      working after the rate history is backfilled: it then simply finds a narrower gap, or reports
 *      that no gap exists and skips the comparison with an explicit message.
 *    - The invoice dated inside the gap is found by scanning the newest rows of the filtered list
 *      (the list is ordered newest-first), which avoids needing a date-range custom filter.
 * ===========================================================================
 */

/** The currency whose history and invoices are inspected. */
const CURRENCY_CODE = 'EUR';
/** How many of the newest filtered invoice rows to scan when looking for one dated inside the gap. */
const ROWS_TO_SCAN = 20;

/**
 * The status used to isolate an ISSUED invoice. "Paid" is chosen over "Open" because Odoo ANDs two
 * separate custom filters, so Open and Paid cannot be OR-ed as two facets - and every transacting
 * currency has thousands of Paid invoices (EUR 62926, GBP 3173, CHF 1189) while Open is scarce
 * (GBP 8, CHF 1), which left the filtered list empty for GBP.
 */
const ISSUED_STATUS = 'Paid';

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('CRM-11857_1.2.1 - US2: an invoice inside a rate gap keeps the earlier rate', () => {
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

  test('CRM-11857_1.2.1: US2 - An invoice dated inside a period with no rate rows keeps the rate of the most recent earlier row', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    let gapStartsAfter = '';   // the last date PRESENT before the gap, ISO
    let gapStartsAfterRaw = '';
    let rateBeforeGap = 0;
    let gapEndsBefore = '';    // the first date PRESENT after the gap, ISO
    let invoiceNumber = '';
    let invoiceRawDate = '';
    let invoiceIsoDate = '';
    let invoiceTotal = 0;
    let invoiceTotalCompany = 0;
    let resolvedRateDate = '';
    let resolvedRate = 0;

    await test.step('Pre-condition - Step 1: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Pre-condition - Step 2: Open the EUR rate history, sort by Date descending and locate the gap', async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      await currencyPage.sortListByColumn('Date', 'desc');
      const rows = await currencyPage.getRateRows();

      // Walk the date-descending rows and take the FIRST place where two consecutive rows are more than
      // one day apart - that is the newest gap in the history.
      for (let i = 0; i < rows.length - 1; i++) {
        const newer = rows[i].date;
        const older = rows[i + 1].date;
        const daysApart = Math.round(
          (new Date(`${newer}T00:00:00Z`).getTime() - new Date(`${older}T00:00:00Z`).getTime()) / 86400000
        );
        if (daysApart > 1) {
          gapEndsBefore = newer;
          gapStartsAfter = older;
          gapStartsAfterRaw = rows[i + 1].rawDate;
          rateBeforeGap = rows[i + 1].rate;
          console.log(`  - Gap found: no rate row between ${gapStartsAfter} and ${gapEndsBefore} (${daysApart - 1} calendar day(s) with no row)`);
          console.log(`  - Last date present BEFORE the gap : ${gapStartsAfterRaw} = ${rateBeforeGap}`);
          break;
        }
      }
      if (!gapStartsAfter) {
        console.log('  - No gap found in the loaded EUR history: every consecutive pair of rows is one day apart');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - EUR history sorted, gap located').catch(() => {});
    });

    await test.step('Step 1-3: Open the Invoices list, isolate issued euro invoices and pick one dated inside the gap', async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.addInvoiceListCustomFilter('Currency', CURRENCY_CODE, { operator: 'contains' });
      await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

      // The list is ordered newest-first, so an invoice dated inside the gap is among the newest rows.
      for (let idx = 0; idx < ROWS_TO_SCAN; idx++) {
        const row = await invoicePage.getInvoiceListRowFields(
          ['Number', 'Invoice Date', 'Total', 'Total in Company Currency'],
          idx
        );
        if (!row['Number']) break; // ran out of rows
        const iso = CurrencyPage.toIsoDate(row['Invoice Date'] || '');
        const insideGap = !!gapStartsAfter && iso > gapStartsAfter && iso < gapEndsBefore;
        if (insideGap) {
          invoiceNumber = row['Number'];
          invoiceRawDate = row['Invoice Date'] || '';
          invoiceIsoDate = iso;
          invoiceTotal = money(row['Total']);
          invoiceTotalCompany = money(row['Total in Company Currency']);
          console.log(`  - Invoice dated inside the gap found at row #${idx + 1}: ${invoiceNumber} dated ${invoiceRawDate}`);
          console.log(`    Total "${row['Total']}", Total in Company Currency "${row['Total in Company Currency']}"`);
          break;
        }
      }
      if (!invoiceNumber) {
        console.log(`  - No issued euro invoice dated inside the gap was found in the newest ${ROWS_TO_SCAN} rows`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-3 - issued euro invoices filtered').catch(() => {});
    });

    await test.step('Step 4: Resolve the rate the invoice date actually falls back to, from the history', async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      const applicable = await currencyPage.getRateApplicableToDate(invoiceIsoDate);
      resolvedRate = applicable ? applicable.rate : 0;
      resolvedRateDate = applicable ? applicable.rawDate : '';
      console.log(`  - Rate applicable to ${invoiceRawDate}: ${resolvedRate} (from the row dated ${resolvedRateDate || 'none found'})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - fallback rate resolved from the history').catch(() => {});
    });

    await test.step('Step 5 / Verification Point: Total in Company Currency = Total / the last rate before the gap', async () => {
      const expectedUSD = resolvedRate ? invoiceTotal / resolvedRate : 0;
      const tolerance = Math.max(0.05, expectedUSD * 0.002);

      console.log('VERIFY - fallback conversion inside the rate gap:');
      console.log(`  Gap (no rate rows)                  : after ${gapStartsAfter} until ${gapEndsBefore}`);
      console.log(`  Invoice                             : ${invoiceNumber} dated ${invoiceRawDate}`);
      console.log(`  Rate row the date falls back to     : ${resolvedRateDate} = ${resolvedRate}`);
      console.log(`  Last rate present before the gap    : ${gapStartsAfterRaw} = ${rateBeforeGap}`);
      console.log(`  Expected Total in Company Currency  : ${expectedUSD.toFixed(2)}  (= ${invoiceTotal} / ${resolvedRate})`);
      console.log(`  Actual   Total in Company Currency  : ${invoiceTotalCompany}`);
      console.log(`  Would-be value at a rate of 1       : ${invoiceTotal.toFixed(2)}`);
      console.log(`  Allowed tolerance                   : +/- ${tolerance.toFixed(4)}`);

      expect(gapStartsAfter, 'A gap should be locatable in the EUR rate history for this case to be meaningful').toBeTruthy();
      expect(invoiceNumber, `An issued euro invoice dated inside the gap should exist within the newest ${ROWS_TO_SCAN} rows`).toBeTruthy();
      expect(resolvedRate, 'A rate row dated on or before the invoice date should exist').toBeGreaterThan(0);
      expect(
        resolvedRateDate,
        'The rate the invoice falls back to should be the last row present before the gap'
      ).toBe(gapStartsAfterRaw);
      expect(
        Math.abs(invoiceTotalCompany - expectedUSD),
        `"Total in Company Currency" (${invoiceTotalCompany}) should equal Total / the pre-gap rate (${expectedUSD.toFixed(2)})`
      ).toBeLessThanOrEqual(tolerance);
      expect(
        Math.abs(invoiceTotalCompany - invoiceTotal),
        'The figure must NOT equal the invoice Total - that would mean a rate of 1 had been substituted'
      ).toBeGreaterThan(tolerance);
      console.log('  Result: PASS - the invoice fell back to the last rate published before the gap, not to a rate of 1');
      console.log('✅ CRM-11857_1.2.1 verified: a document dated where no rate was published converts at the most recent earlier rate');
    });
  });
});
