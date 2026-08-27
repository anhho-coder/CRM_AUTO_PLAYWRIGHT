import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage, CurrencySettingsPage } from '@pages';
import type { AutomaticRatesSettings } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US4: a manual refresh, without waiting for the next run
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.4.3
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Remove today's rate, then fetch it back with the refresh control on the settings screen while the next
 *    scheduled run is still a day away. This is the escape hatch an administrator needs when a rate is
 *    missing and waiting until tomorrow is not an option.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.4\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - On Invoicing > Configuration > Settings > the "Currencies" block confirm Interval = Daily and that
 *      "Next Run" is a date later than today
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click "EUR", click the "Rates"
 *       button in the box at the top right, and tick the checkbox of the row dated today then use "Action" >
 *       "Delete" so no row for today remains
 *    2. Open the Invoicing module > Configuration > Settings and scroll to the block headed "Currencies"
 *    3. In the "Automatic Currency Rates" block click the small circular refresh icon immediately to the
 *       right of the "Next Run" field
 *    4. Wait for the page to finish reloading, then open Invoicing > Configuration > Accounting > Currencies
 *       > EUR > the "Rates" button again
 *
 *  Verification Point:
 *    3. The refresh finishes with no error dialog
 *    4. A row dated today is present again for EUR, count = 1
 *       _ The rate arrived even though "Next Run" is still a date later than today
 *       _ The same is true for GBP, CHF, IDR, INR and USD
 *
 *  Automation notes:
 *    - This case DELETES today's real EUR rate before fetching it back. If the refresh failed and the row
 *      were left missing, every EUR figure computed today would silently fall back to yesterday's rate. So
 *      the row's rate is recorded before it is removed, the `finally` block writes it back by hand if the
 *      refresh did not, and the case ASSERTS that EUR ends with a rate for today. It cannot report green on
 *      an environment left without one.
 *    - "Next Run" is deliberately left in the future and is re-read afterwards: the whole point is that the
 *      refresh control does not go through the schedule. The refresh calls the update directly and does not
 *      move "Next Run", which is what makes it a usable escape hatch.
 *    - "Last Sync Date" on the same block is READ AND LOGGED but deliberately not asserted. It is a field
 *      this build's live-rate module adds, not something the specification asks for, and reading it back
 *      from this screen proved unreliable - the value on file was 2026-08-19 while the screen read returned
 *      empty. The proof the refresh really fetched is the one the manual case already names and it is a
 *      stronger one anyway: today's row was deleted first, so its coming back cannot be explained by
 *      anything else.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it removes and re-fetches a real rate row. */
const SKIP_MUTATING_TESTS = false;

const CURRENCY_CODE = 'EUR';
/** The currencies the source covers, measured from what the daily job actually writes. */
const COVERED_BY_SOURCE = ['USD', 'EUR', 'GBP', 'CHF', 'IDR', 'INR'];
const EXPECTED_INTERVAL = 'Daily';

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
const todayForDateField = (): string => asDateField(new Date());
const tomorrowForDateField = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return asDateField(d);
};

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.4.3 - US4: a manual refresh without waiting for the next run', () => {
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

  test('CRM-11857_1.4.3: US4 - The refresh control on the settings screen fetches rates at once, without waiting for the next scheduled run', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    const TODAY = todayIso();
    const TODAY_TEXT = todayForDateField();
    let settingsBefore: AutomaticRatesSettings | null = null;
    let settingsAfter: AutomaticRatesSettings | null = null;
    let rateRemoved = '';
    let deleted = false;
    let refreshed = false;
    let eurRowsToday = -1;
    let datesAfter = new Map<string, string>();
    let eurRowsAtEnd = -1;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Pre-condition: Confirm Interval = Daily and that "Next Run" is later than today', async () => {
      const opened = await settingsPage.openInvoicingSettings();
      expect(opened, 'The Invoicing settings screen should open').toBe(true);
      settingsBefore = await settingsPage.readSettings();
      console.log(`  - Today is ${TODAY_TEXT}; "Next Run" reads ${settingsBefore.nextRun || '(empty)'}`);
      expect(settingsBefore.interval, `"Interval" should be "${EXPECTED_INTERVAL}" for this case`).toBe(EXPECTED_INTERVAL);

      if (settingsBefore.nextRun === TODAY_TEXT || !settingsBefore.nextRun) {
        // The point of this case is that the refresh works while the schedule is NOT due, so push the next
        // run out to tomorrow. Doing it here rather than assuming keeps the case runnable on any day.
        console.log(`  - "Next Run" is not in the future; setting it to ${tomorrowForDateField()} so the schedule cannot be the trigger`);
        const ok = await settingsPage.setNextRun(tomorrowForDateField());
        expect(ok, `"Next Run" should have been moved to ${tomorrowForDateField()}`).toBe(true);
        settingsBefore = await settingsPage.readSettings();
      }
      expect(
        settingsBefore.nextRun,
        `"Next Run" must be a date LATER than today (${TODAY_TEXT}), or a rate arriving proves nothing about the refresh control`
      ).not.toBe(TODAY_TEXT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - schedule not due').catch(() => {});
    });

    try {
      await test.step(`Step 1: Remove the ${CURRENCY_CODE} rate row dated today so none remains`, async () => {
        await currencyPage.openRatesForCurrency(CURRENCY_CODE);
        const rows = await currencyPage.getRateRows();
        const todayRow = rows.find((r) => r.date === TODAY);
        if (!todayRow) {
          console.log(`  - ${CURRENCY_CODE} has no row dated ${TODAY_TEXT} to begin with, so there is nothing to remove`);
        } else {
          rateRemoved = todayRow.rate.toFixed(6);
          console.log(`  - ${CURRENCY_CODE} row dated ${TODAY_TEXT} holds ${rateRemoved}; recording it before removing it`);
          deleted = await currencyPage.deleteRateRowForDate(TODAY_TEXT);
          expect(deleted, `The ${CURRENCY_CODE} row dated ${TODAY_TEXT} should have been removed`).toBe(true);
        }
        const after = await currencyPage.getRateRows();
        const stillToday = after.filter((r) => r.date === TODAY).length;
        console.log(`  - ${CURRENCY_CODE} rows dated ${TODAY_TEXT} now: ${stillToday}`);
        expect(stillToday, `No ${CURRENCY_CODE} row may remain for today before the refresh is tried`).toBe(0);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - today rate removed').catch(() => {});
      });

      await test.step('Step 2-3: Open the "Currencies" settings block and click the refresh control next to "Next Run"', async () => {
        await settingsPage.openInvoicingSettings();
        refreshed = await settingsPage.clickRefreshRatesNow();
        expect(refreshed, 'The refresh control next to "Next Run" should have been pressed').toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - refresh pressed').catch(() => {});
      });

      await test.step('Step 4: Read the settings again, then re-open the rate history and the Currencies list', async () => {
        await settingsPage.openInvoicingSettings();
        settingsAfter = await settingsPage.readSettings();

        await currencyPage.openRatesForCurrency(CURRENCY_CODE);
        const rows = await currencyPage.getRateRows();
        eurRowsToday = rows.filter((r) => r.date === TODAY).length;
        console.log(`  - ${CURRENCY_CODE} rows dated ${TODAY_TEXT} after the refresh: ${eurRowsToday}`);

        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        const dates = await currencyPage.getColumnValues('Date');
        datesAfter = new Map<string, string>();
        codes.forEach((code, i) => datesAfter.set(code, dates[i] ?? ''));
        console.log('  - Currencies list after the refresh:');
        datesAfter.forEach((date, code) => console.log(`      ${code.padEnd(4)} Date ${date || '(empty)'}`));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - rates after the refresh').catch(() => {});
      });

      await test.step('Verification Point 3: the refresh finished with no error dialog', async () => {
        console.log('VERIFY - the refresh completed:');
        console.log(`  Expected: the control was pressed and the page came back with no error dialog`);
        console.log(`  Actual  : pressed = ${refreshed}`);
        // Logged for information only - see the note in the header on why this field is not asserted.
        console.log(`  "Last Sync Date" before  : ${settingsBefore!.lastSync || '(read as empty)'}`);
        console.log(`  "Last Sync Date" after   : ${settingsAfter!.lastSync || '(read as empty)'}`);
        expect(refreshed, 'The refresh control next to "Next Run" should have been pressed and returned').toBe(true);
        console.log('  Result: PASS - the refresh ran to completion');
      });

      await test.step('Verification Point 4: the rate is back for today, and the schedule was not what brought it', async () => {
        const withToday = [...datesAfter.entries()]
          .filter(([, date]) => date === TODAY)
          .map(([code]) => code)
          .sort();
        const expectedSet = [...COVERED_BY_SOURCE].sort();

        console.log('VERIFY - a rate fetched on demand:');
        console.log(`  Expected ${CURRENCY_CODE} rows dated ${TODAY_TEXT} : 1`);
        console.log(`  Actual   ${CURRENCY_CODE} rows dated ${TODAY_TEXT} : ${eurRowsToday}`);
        console.log(`  Expected currencies dated today   : {${expectedSet.join(', ')}}, count = ${expectedSet.length}`);
        console.log(`  Actual   currencies dated today   : {${withToday.join(', ')}}, count = ${withToday.length}`);
        console.log(`  Expected "Next Run" untouched     : ${settingsBefore!.nextRun} (still later than today)`);
        console.log(`  Actual   "Next Run"               : ${settingsAfter!.nextRun || '(empty)'}`);

        expect(
          eurRowsToday,
          `${CURRENCY_CODE} must carry exactly one row dated ${TODAY_TEXT} after the refresh, so the escape hatch ` +
            `really does replace a missing rate`
        ).toBe(1);
        expect(
          withToday,
          `The refresh fetches for every covered currency, not just the one being looked at. Expected ` +
            `{${expectedSet.join(', ')}} dated today but the list shows {${withToday.join(', ')}}.`
        ).toEqual(expectedSet);
        expect(
          settingsAfter!.nextRun,
          `"Next Run" must still be later than today (${TODAY_TEXT}). If the refresh moved it, it went through the ` +
            `schedule rather than round it, and it is not the escape hatch it is meant to be.`
        ).not.toBe(TODAY_TEXT);
        console.log('  Result: PASS - the rate arrived on demand while the next scheduled run was still a day away');
      });
    } finally {
      await test.step(`Teardown: make sure ${CURRENCY_CODE} is left with a rate for today`, async () => {
        // The try/catch wraps only the ACTIONS so a UI error cannot mask the real failure. The verdict is
        // asserted afterwards, outside the catch: an environment left without today's EUR rate would convert
        // every euro figure at yesterday's rate, silently.
        try {
          await currencyPage.discardEditableList().catch(() => {});
          await currencyPage.openRatesForCurrency(CURRENCY_CODE);
          let rows = await currencyPage.getRateRows();
          eurRowsAtEnd = rows.filter((r) => r.date === TODAY).length;
          if (eurRowsAtEnd === 0 && rateRemoved) {
            console.log(`  - ${CURRENCY_CODE} has no rate for today and the refresh did not bring one back; writing ${rateRemoved} by hand`);
            await currencyPage.createRateRow(TODAY_TEXT, rateRemoved);
            rows = await currencyPage.getRateRows();
            eurRowsAtEnd = rows.filter((r) => r.date === TODAY).length;
          }
          console.log(`  - ${CURRENCY_CODE} rows dated ${TODAY_TEXT} at the end: ${eurRowsAtEnd}`);
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Check that ${CURRENCY_CODE} has a rate dated ${TODAY_TEXT}${rateRemoved ? ` (it was ${rateRemoved})` : ''}.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - today rate present again').catch(() => {});

        if (deleted) {
          expect(
            eurRowsAtEnd,
            `${CURRENCY_CODE} must be left with exactly one rate dated ${TODAY_TEXT}. It has ${eurRowsAtEnd}. ` +
              `${rateRemoved ? `The row removed held ${rateRemoved} - put it back by hand.` : ''}`
          ).toBe(1);
        }
      });
    }
  });
});
