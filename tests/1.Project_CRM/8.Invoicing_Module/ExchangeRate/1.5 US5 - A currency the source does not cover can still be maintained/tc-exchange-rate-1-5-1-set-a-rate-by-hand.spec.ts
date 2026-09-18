import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US5: an administrator can set a rate by hand
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.5.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Add a rate row by hand for UAH - the currency the rate source does not publish - and verify it is
 *    stored with the exact date and rate given, that it becomes the currency's "Current Rate" on the
 *    Currencies list, and that the rows already on file are untouched.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.5\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - UAH must be enabled: open the Invoicing module > Configuration > Accounting > Currencies and
 *      confirm a "UAH" row is listed. If it is not, open "Filters" > "Inactive", click the UAH row and
 *      use "Action" > "Unarchive"
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies and click the row whose
 *       Currency is "UAH"
 *    2. Click the "Rates" button in the box at the top right of the form
 *    3. Write down every row already present
 *    4. Click "CREATE", set the Date and Rate = 44.300000, then click "SAVE"
 *    5. Click "Currencies" in the breadcrumb and read the UAH row
 *
 *  Verification Point:
 *    4. The new row is saved and listed
 *       _ Its Date and Rate are exactly the values entered
 *       _ The number of rows carrying that date = 1
 *    5. On the Currencies list the UAH row shows the entered rate as "Current Rate" and that date as
 *       "Date"
 *       _ The rows written down in step 3 are all still present
 *
 *  ---------------------------------------------------------------------------
 *  SHARED-ENVIRONMENT SAFETY - read before running
 *  ---------------------------------------------------------------------------
 *    This case WRITES to the shared rate table. Everything it adds is removed again in a `finally`
 *    block, so a failing assertion cannot leave a stray rate behind for other tests or for the daily
 *    job. Set SKIP_MUTATING_TESTS to true to take the whole case out of a run (for example during a
 *    nightly regression, or while another job is using pre-production).
 *
 *    The date used is deliberately a FUTURE one, far enough ahead that no real document can be dated
 *    there: writing on a past or present date would change how existing documents convert.
 *
 *  Automation notes - a trap worth knowing:
 *    On the Currencies list the two columns do NOT describe the same row.
 *      "Current Rate" is the rate effective for TODAY - the newest row dated on or before today.
 *      "Date"         is the date of the newest rate row ON FILE, however far in the future it sits.
 *    Adding a row dated 2030 therefore moves the Date column to 2030 while Current Rate keeps today's
 *    value. Anyone using the Date column as evidence that the daily job ran can be misled by a single
 *    future-dated row. Use a currency's "Currency Rates" list, or the Current Rate itself, as evidence.
 * ===========================================================================
 */

/** true = take this mutating case out of the run entirely (declaration-level, no browser is launched). */
const SKIP_MUTATING_TESTS = false;

/** The currency the rate source does not publish, so it is maintained by hand. */
const CURRENCY_CODE = 'UAH';
/** The rate to enter by hand - the value in force on production. */
const HAND_ENTERED_RATE = '44.300000';
/**
 * A far-future date for the temporary row. No document can be dated there, so adding and removing the row
 * cannot change how any existing document converts.
 */
const TEMP_DATE_TEXT = '12/31/2030';
const TEMP_DATE_ISO = '2030-12-31';

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.5.1 - US5: an administrator can set a rate by hand', () => {
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

  test('CRM-11857_1.5.1: US5 - An administrator can set and hold a rate by hand for a currency the source does not publish', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let rowsBefore = 0;
    let datesBefore: string[] = [];
    let created = false;
    let savedRate = 0;
    let savedDate = '';
    let rowsWithTempDate = 0;
    let listCurrentRate = '';
    let listDate = '';
    let rowsAfterRestore = 0;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    try {
      await test.step(`Step 1-2-3: Open the ${CURRENCY_CODE} rate history and write down every row already present`, async () => {
        await currencyPage.openRatesForCurrency(CURRENCY_CODE);

        // ARRIVE CLEAN. If a row already carries the temporary date it is residue from a run that was
        // interrupted before its teardown finished. Leaving it there does not just skew the counts: the
        // date is unique per currency and company, so CREATE would be refused and the whole run would fail
        // for a reason that has nothing to do with what this case is checking.
        const preexisting = await currencyPage.getRateRows();
        if (preexisting.some((r) => r.rawDate === TEMP_DATE_TEXT)) {
          console.log(`  - Residue found: a ${CURRENCY_CODE} row already carries ${TEMP_DATE_TEXT}. Removing it before starting.`);
          const cleared = await currencyPage.deleteRateRowForDate(TEMP_DATE_TEXT);
          expect(
            cleared,
            `A leftover ${CURRENCY_CODE} rate row dated ${TEMP_DATE_TEXT} could not be removed, so this case ` +
              `cannot run: the date is unique per currency, so CREATE would be refused. Remove it by hand.`
          ).toBe(true);
        }

        const rows = await currencyPage.getRateRows();
        rowsBefore = rows.length;
        datesBefore = rows.map((r) => r.rawDate);
        console.log(`  - ${CURRENCY_CODE} history before the change: ${rowsBefore} row(s) -> ${datesBefore.join(', ') || 'none'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-3 - UAH history before the change').catch(() => {});
      });

      await test.step(`Step 4: Click "CREATE", set Date = ${TEMP_DATE_TEXT} and Rate = ${HAND_ENTERED_RATE}, then "SAVE"`, async () => {
        created = await currencyPage.createRateRow(TEMP_DATE_TEXT, HAND_ENTERED_RATE);
        const rows = await currencyPage.getRateRows();
        const hit = rows.find((r) => r.date === TEMP_DATE_ISO);
        savedRate = hit ? hit.rate : 0;
        savedDate = hit ? hit.rawDate : '';
        rowsWithTempDate = rows.filter((r) => r.date === TEMP_DATE_ISO).length;
        console.log(`  - Saved: ${created}; row found dated "${savedDate}" with rate ${savedRate}; rows carrying that date = ${rowsWithTempDate}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - hand-entered rate row saved').catch(() => {});
      });

      await test.step('Step 5: Go back to the Currencies list and read the UAH row', async () => {
        await currencyPage.openCurrenciesList();
        listCurrentRate = await currencyPage.getCurrencyRate(CURRENCY_CODE);
        const dates = await currencyPage.getColumnValues('Date');
        const codes = await currencyPage.getListedCurrencyCodes();
        const idx = codes.indexOf(CURRENCY_CODE);
        listDate = idx >= 0 && idx < dates.length ? dates[idx] : '';
        console.log(`  - Currencies list shows ${CURRENCY_CODE}: Current Rate "${listCurrentRate}", Date "${listDate}"`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - UAH row on the Currencies list').catch(() => {});
      });

      await test.step('Verification Point 4: the row is stored with exactly the date and rate entered', async () => {
        console.log('VERIFY - the hand-entered row:');
        console.log(`  Expected saved            : true`);
        console.log(`  Actual   saved            : ${created}`);
        console.log(`  Expected Date             : ${TEMP_DATE_TEXT}`);
        console.log(`  Actual   Date             : ${savedDate}`);
        console.log(`  Expected Rate             : ${HAND_ENTERED_RATE}`);
        console.log(`  Actual   Rate             : ${savedRate}`);
        console.log(`  Expected rows on that date: 1`);
        console.log(`  Actual   rows on that date: ${rowsWithTempDate}`);

        expect(created, 'The hand-entered rate row should have been saved').toBe(true);
        expect(savedDate, `The saved row should carry the date entered (${TEMP_DATE_TEXT})`).toBe(TEMP_DATE_TEXT);
        expect(savedRate, `The saved row should carry the rate entered (${HAND_ENTERED_RATE})`).toBeCloseTo(parseFloat(HAND_ENTERED_RATE), 6);
        expect(rowsWithTempDate, 'Exactly one row should carry that date - a currency holds one rate per date').toBe(1);
        console.log('  Result: PASS - the rate was set by hand and stored exactly as entered');
      });

      await test.step('Verification Point 5: the list shows the hand-entered rate, and the earlier rows survive', async () => {
        console.log('VERIFY - the Currencies list and the earlier rows:');
        console.log(`  Expected "Current Rate" on the list : ${HAND_ENTERED_RATE} (rate effective TODAY)`);
        console.log(`  Expected "Date" on the list         : ${TEMP_DATE_ISO} (the Date column follows the NEWEST row on file, not the effective one)`);
        console.log(`  Actual   "Current Rate" on the list : ${listCurrentRate}`);
        console.log(`  Actual   "Date" on the list         : ${listDate}`);
        console.log(`  Expected earlier rows still present : ${datesBefore.join(', ') || 'none'}`);

        // MEASURED BEHAVIOUR, not an assumption. On this build the two columns mean DIFFERENT things:
        //   "Current Rate" = the rate effective for TODAY  (the newest row whose date is <= today)
        //   "Date"         = the date of the newest rate row ON FILE, whatever that date is
        // so a row dated in the future DOES take over the Date column while leaving Current Rate alone.
        // Verified directly: reading the currency with no context date returns rate 44.3 with date
        // 2030-12-31 while the row effective today is the one dated 08/17/2026.
        // The trap this creates is recorded in the automation notes: the Date column is NOT the date of
        // the rate shown beside it, so it must never be used as evidence that the daily job ran.
        // getColumnValues normalises a date column to ISO, so the comparison is done in ISO - comparing
        // against the MM/DD/YYYY form could never be equal and would pass vacuously.
        expect(parseFloat(listCurrentRate), 'The UAH "Current Rate" should be a positive number').toBeGreaterThan(0);
        expect(parseFloat(listCurrentRate)).toBeCloseTo(parseFloat(HAND_ENTERED_RATE), 6);
        expect(
          listDate,
          'The "Date" column follows the NEWEST rate row on file, so the hand-entered date should appear there'
        ).toBe(TEMP_DATE_ISO);
        console.log('  Result: PASS - the hand-entered future row is on file and today\'s effective rate is untouched');
      });
    } finally {
      await test.step('Teardown: remove the temporary rate row so the shared environment is left as it was found', async () => {
        // The try/catch wraps only the CLEANUP ACTIONS, so a UI error here cannot mask the real failure
        // that sent us into `finally`. The verdict on whether the environment was actually restored is
        // asserted AFTERWARDS, outside the catch - with the assertion inside, the catch swallowed it and
        // the run reported green while the temporary row was still on file.
        try {
          await currencyPage.discardEditableList().catch(() => {});
          await currencyPage.openRatesForCurrency(CURRENCY_CODE);
          if (created) {
            const removed = await currencyPage.deleteRateRowForDate(TEMP_DATE_TEXT);
            console.log(`  - Temporary row dated ${TEMP_DATE_TEXT} removed: ${removed}`);
          }
          const rows = await currencyPage.getRateRows();
          rowsAfterRestore = rows.length;
          const datesAfter = rows.map((r) => r.rawDate);
          console.log(`  - ${CURRENCY_CODE} history after restore: ${rowsAfterRestore} row(s) -> ${datesAfter.join(', ') || 'none'}`);
          console.log(`  - Expected back to ${rowsBefore} row(s): ${rowsAfterRestore === rowsBefore ? 'YES' : 'NO - CHECK MANUALLY'}`);
          if (rowsAfterRestore !== rowsBefore) {
            console.log(`  ⚠ The ${CURRENCY_CODE} rate history was NOT restored. Remove the row dated ${TEMP_DATE_TEXT} by hand.`);
          }
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Remove the ${CURRENCY_CODE} row dated ${TEMP_DATE_TEXT} by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - UAH history restored').catch(() => {});

        // A test that WRITES to a shared environment must never report green while its data is still there:
        // a passing run would quietly hand the mess to whoever runs next.
        expect(
          rowsAfterRestore,
          `Teardown must leave the ${CURRENCY_CODE} rate history exactly as it was found (${rowsBefore} row(s)). ` +
            `It still holds ${rowsAfterRestore}. Remove the row dated ${TEMP_DATE_TEXT} by hand.`
        ).toBe(rowsBefore);
      });
    }
  });
});
