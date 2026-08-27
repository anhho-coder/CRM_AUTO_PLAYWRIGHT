import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US1: a new rate must not move issued figures
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.1.4
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Add a rate row for a LATER date than any issued document, then re-read the "Total in Company
 *    Currency" of three euro invoices that were already issued. Not one of the three may move. This is the
 *    property that makes the rate table safe to append to: conversion is resolved from the rate that
 *    applied on a document's OWN date, so a rate published afterwards cannot rewrite history.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.1\.4:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Write down the "Total in Company Currency" of three existing issued euro invoices, together with
 *      their Numbers (use the Invoices list with the column shown)
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click the "EUR" row, then
 *       click the "Rates" button in the box at the top right
 *    2. Click "CREATE", set Date to a date LATER than every issued document and Rate to a value clearly
 *       different from today's (today's rate plus 0.05), then click "SAVE"
 *    3. Open the Invoicing module > Customers > Invoices, and read "Total in Company Currency" for the
 *       three invoices written down in the pre-conditions
 *    4. Return to the EUR "Currency Rates" list, tick the checkbox of the row created in step 2 and use
 *       "Action" > "Delete" to remove it again
 *
 *  Verification Point:
 *    3. All three invoices show exactly the value written down in the pre-conditions
 *       _ Not one of the three figures has moved
 *       _ A rate added for a later date has no effect on invoices already issued
 *    4. The temporary rate row is removed, so the environment is left as it was found
 *
 *  Automation notes - two deliberate choices, both about safety on a shared environment:
 *
 *    1. The manual step says "tomorrow". This uses a FAR-future date instead. The assertion is identical -
 *       what matters is only that the new row is dated later than the invoices - but the blast radius is
 *       not: a wrong rate left on tomorrow's date would corrupt tomorrow's conversions for everybody,
 *       while a row dated 2030 cannot affect any real document. The daily source job would overwrite
 *       tomorrow anyway. The Master step was updated to match.
 *
 *    2. The case ARRIVES CLEAN. If a row already carries the temporary date it is residue from a run that
 *       was interrupted before its teardown finished, and it is removed before anything is created: the
 *       date is unique per currency and company, so CREATE would otherwise be refused and the run would
 *       fail for a reason unrelated to what is being checked.
 *
 *    The invoices are re-read by SEARCHING each Number rather than by row position, so the comparison
 *    cannot silently drift onto a different invoice. Search facets are cleared between passes because a
 *    hash navigation does not reset the search bar, and a facet left behind ANDs with the next search.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it WRITES to the shared rate table. */
const SKIP_MUTATING_TESTS = false;

const CURRENCY_CODE = 'EUR';
/** Paid is used because Odoo ANDs two separate custom filters, so Open and Paid cannot be OR-ed. */
const ISSUED_STATUS = 'Paid';
/** How many issued invoices the manual case asks for. */
const INVOICES_TO_CHECK = 3;
/** Dated far beyond any real document on purpose - see automation note 1. */
const TEMP_DATE_TEXT = '12/31/2030';
/** How far the temporary rate is moved away from today's, so a leak would be unmistakable. */
const RATE_OFFSET = 0.05;

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

interface IssuedInvoice {
  number: string;
  totalCompany: string;
  totalCompanyNumeric: number;
}

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.1.4 - US1: a new rate must not move issued figures', () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.1.4: US1 - Adding a rate for a later date leaves the company-currency figure of every already-issued invoice unchanged', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    const before: IssuedInvoice[] = [];
    const after: IssuedInvoice[] = [];
    let rowsBefore = 0;
    let rowsAfterRestore = 0;
    let created = false;
    let tempRate = '';

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step(`Pre-condition: Write down the "Total in Company Currency" of ${INVOICES_TO_CHECK} issued ${CURRENCY_CODE} invoices`, async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.addInvoiceListCustomFilter('Currency', CURRENCY_CODE, { operator: 'contains' });
      await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

      const rowsInList = await invoicePage.getInvoiceListRowCount();
      console.log(`  - ${rowsInList} issued ${CURRENCY_CODE} invoice(s) in the filtered list`);
      expect(
        rowsInList,
        `At least ${INVOICES_TO_CHECK} issued ${CURRENCY_CODE} invoices are needed to run this case; the list holds ${rowsInList}`
      ).toBeGreaterThanOrEqual(INVOICES_TO_CHECK);

      for (let i = 0; i < INVOICES_TO_CHECK; i++) {
        const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency'], i);
        before.push({
          number: row['Number'] || '',
          totalCompany: row['Total in Company Currency'] || '',
          totalCompanyNumeric: money(row['Total in Company Currency']),
        });
        console.log(`  - Recorded ${row['Number']} -> Total in Company Currency ${row['Total in Company Currency']}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - issued invoices recorded').catch(() => {});
    });

    try {
      await test.step(`Step 1: Open Currencies, click "${CURRENCY_CODE}" and open its "Currency Rates" list`, async () => {
        await currencyPage.openRatesForCurrency(CURRENCY_CODE);

        // ARRIVE CLEAN - see automation note 2.
        const preexisting = await currencyPage.getRateRows();
        if (preexisting.some((r) => r.rawDate === TEMP_DATE_TEXT)) {
          console.log(`  - Residue found: a ${CURRENCY_CODE} row already carries ${TEMP_DATE_TEXT}. Removing it before starting.`);
          const cleared = await currencyPage.deleteRateRowForDate(TEMP_DATE_TEXT);
          expect(
            cleared,
            `A leftover ${CURRENCY_CODE} rate row dated ${TEMP_DATE_TEXT} could not be removed, so this case cannot ` +
              `run: the date is unique per currency, so CREATE would be refused. Remove it by hand.`
          ).toBe(true);
        }

        const rows = await currencyPage.getRateRows();
        rowsBefore = rows.length;
        console.log(`  - ${CURRENCY_CODE} history before the change: ${rowsBefore} row(s), newest ${rows[0]?.rawDate ?? 'none'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR rate history before the change').catch(() => {});
      });

      await test.step(`Step 2: Click "CREATE", set Date = ${TEMP_DATE_TEXT} and Rate = today's plus ${RATE_OFFSET}, then "SAVE"`, async () => {
        const todayIso = new Date().toISOString().slice(0, 10);
        const applicable = await currencyPage.getRateApplicableToDate(todayIso);
        expect(
          applicable,
          `A rate effective on or before ${todayIso} is needed as the starting point for ${CURRENCY_CODE}`
        ).not.toBeNull();

        tempRate = (applicable!.rate + RATE_OFFSET).toFixed(6);
        console.log(`  - ${CURRENCY_CODE} rate effective today (${todayIso}) is ${applicable!.rate} from the row dated ${applicable!.rawDate}`);
        console.log(`  - Temporary rate to write on ${TEMP_DATE_TEXT}: ${tempRate}`);

        created = await currencyPage.createRateRow(TEMP_DATE_TEXT, tempRate);
        expect(created, `The temporary ${CURRENCY_CODE} rate row dated ${TEMP_DATE_TEXT} should have been saved`).toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - temporary rate row saved').catch(() => {});
      });

      await test.step(`Step 3: Read "Total in Company Currency" again for the ${INVOICES_TO_CHECK} invoices recorded`, async () => {
        for (const inv of before) {
          await invoicePage.openCustomerInvoicesList();
          // A hash navigation does not reset the search bar, so drop any facet left by the previous pass.
          await invoicePage.clearListSearchFacets();
          await invoicePage.searchInvoiceInList(inv.number);

          const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency']);
          after.push({
            number: row['Number'] || '',
            totalCompany: row['Total in Company Currency'] || '',
            totalCompanyNumeric: money(row['Total in Company Currency']),
          });
          console.log(`  - ${row['Number']} now reads Total in Company Currency ${row['Total in Company Currency']}`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - invoices re-read after the new rate').catch(() => {});
      });

      await test.step('Verification Point 3: not one of the issued figures has moved', async () => {
        console.log('VERIFY - issued invoices against a rate published for a later date:');
        console.log(`  Rate added                  : ${tempRate} on ${TEMP_DATE_TEXT}`);
        console.log(`  Expected for every invoice  : the exact figure recorded in the pre-conditions`);

        expect(after.length, 'Every recorded invoice should have been re-read').toBe(before.length);

        for (let i = 0; i < before.length; i++) {
          const b = before[i];
          const a = after[i];
          console.log(`  [${b.number}]`);
          console.log(`    Expected Total in Company Currency: ${b.totalCompany} (${b.totalCompanyNumeric})`);
          console.log(`    Actual   Total in Company Currency: ${a.totalCompany} (${a.totalCompanyNumeric})`);

          expect(a.number, `The invoice re-read should be ${b.number}, not ${a.number}`).toBe(b.number);
          expect(
            a.totalCompanyNumeric,
            `${b.number} must still convert at the rate that applied on its OWN date. It read ` +
              `${b.totalCompany} before the ${TEMP_DATE_TEXT} rate was added and ${a.totalCompany} after, so a ` +
              `later rate publication is rewriting an already-issued document.`
          ).toBeCloseTo(b.totalCompanyNumeric, 2);
          console.log(`    Result: PASS - the figure did not move`);
        }
        console.log('  Result: PASS - a rate added for a later date has no effect on invoices already issued');
      });
    } finally {
      await test.step('Step 4: Remove the temporary rate row so the environment is left as it was found', async () => {
        // The try/catch wraps only the CLEANUP ACTIONS, so a UI error here cannot mask the real failure
        // that sent us into `finally`. Whether the environment was actually restored is asserted
        // AFTERWARDS, outside the catch - inside it, the catch would swallow the assertion and the run
        // would report green with the temporary row still on file.
        try {
          await currencyPage.discardEditableList().catch(() => {});
          await currencyPage.openRatesForCurrency(CURRENCY_CODE);
          if (created) {
            const removed = await currencyPage.deleteRateRowForDate(TEMP_DATE_TEXT);
            console.log(`  - Temporary row dated ${TEMP_DATE_TEXT} removed: ${removed}`);
          }
          const rows = await currencyPage.getRateRows();
          rowsAfterRestore = rows.length;
          console.log(`  - ${CURRENCY_CODE} history after restore: ${rowsAfterRestore} row(s), newest ${rows[0]?.rawDate ?? 'none'}`);
          console.log(`  - Expected back to ${rowsBefore} row(s): ${rowsAfterRestore === rowsBefore ? 'YES' : 'NO - CHECK MANUALLY'}`);
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Remove the ${CURRENCY_CODE} row dated ${TEMP_DATE_TEXT} by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR rate history restored').catch(() => {});

        // A test that WRITES to a shared environment must never report green while its data is still there:
        // a passing run would quietly hand the mess to whoever runs next. EUR is the most-used currency
        // here, so a leftover row matters more than it would for a currency nobody transacts in.
        expect(
          rowsAfterRestore,
          `Teardown must leave the ${CURRENCY_CODE} rate history exactly as it was found (${rowsBefore} row(s)). ` +
            `It still holds ${rowsAfterRestore}. Remove the row dated ${TEMP_DATE_TEXT} by hand.`
        ).toBe(rowsBefore);
      });
    }
  });
});
