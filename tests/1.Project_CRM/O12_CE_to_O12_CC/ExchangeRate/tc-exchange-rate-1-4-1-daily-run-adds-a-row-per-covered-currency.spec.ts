import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage, ScheduledActionPage, CurrencySettingsPage } from '@pages';
import type { ScheduledActionState } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US4: the daily run adds a row per covered currency
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.4.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Drive the "Currency: rate update" job on demand and prove what one run produces: exactly one dated
 *    row for each currency the source covers, and nothing at all for a currency the source does not
 *    publish. This is the case that shows nobody has to type a rate in by hand day to day.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.4\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Turn on developer mode: Settings module > General Settings > "Developer Tools" > "Activate the
 *      developer mode"
 *    - On Invoicing > Configuration > Settings > the "Currencies" block confirm Service = European Central
 *      Bank and Interval = Daily
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies and write down the Date shown
 *       on each of the seven rows
 *    2. Open the Settings module > Technical > Automation > Scheduled Actions. Type "Currency: rate update"
 *       in the search box at the top right and press Enter, then click the row to open it
 *    3. On the form read "Execute Every" and "Next Execution Date", and confirm the "Repeat Missed"
 *       checkbox is not ticked
 *    4. Click "EDIT", set "Next Execution Date" to today, click "SAVE", then click "RUN MANUALLY" at the
 *       top left
 *    5. Return to Invoicing > Configuration > Accounting > Currencies and read the Date column again
 *    6. For EUR, click the row then the "Rates" button in the box at the top right, and count the rows
 *       dated today
 *
 *  Verification Point:
 *    3. "Execute Every" reads 1 Days
 *       _ "Repeat Missed" is not ticked, so a run that is missed is never caught up later
 *    5. The Date column shows today for EUR, GBP, CHF, IDR, INR and USD
 *       _ The set of currencies whose Date is today EQUALS exactly {EUR, GBP, CHF, IDR, INR, USD}, count = 6
 *       _ UAH keeps the Date it had in step 1
 *    6. EUR has exactly one row dated today, count = 1
 *
 *  Automation notes:
 *    - The expected set of six is not a guess: the rows the job wrote on its previous run were read
 *      straight from the environment and they are exactly USD, GBP, CHF, IDR, INR and EUR, all stamped by
 *      the system user in the same second. UAH was not among them.
 *    - Developer mode is NOT switched on. The Technical menu is only a way to reach the job's form, and
 *      this navigates by the action hash instead, which does not depend on the menu being rendered. Not
 *      toggling a global setting keeps the run from changing what other people see.
 *    - "Execute Every" is asserted case-insensitively. The unit comes back as the rendered label "Days"
 *      while the form is readonly, but as the raw value "days" when it is read from the <select> in edit
 *      mode, and the case should not decide whether the run passes.
 *    - The job is shared by the whole environment, so its schedule is captured up front and put back in a
 *      `finally`. Re-arming today's run is harmless - the job only refreshes today's rows, which is what it
 *      would have done anyway.
 *
 *    - TWO GATES, not one. This is the trap that makes the manual steps as written misleading. The job runs
 *      `run_update_currency()`, which acts only on companies whose own "Next Run" (the field on Invoicing >
 *      Configuration > Settings > Currencies) is today or earlier, and then pushes that date forward by the
 *      interval. So pressing "RUN MANUALLY" a SECOND time on the same day does nothing at all: the
 *      scheduled action fires, the method returns immediately, no row is written and no error is shown.
 *      A tester following only the scheduled-action steps would read that silence as a broken feature.
 *      This case therefore opens the two gates in order - "Next Run" = today, then "Next Execution Date" =
 *      today - and afterwards asserts that "Next Run" has moved to tomorrow, which is the proof the run
 *      really did work rather than returning early. Without that proof the case could pass on rows a
 *      previous run had already written. The Master steps were updated to match.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it RUNS a shared scheduled job. */
const SKIP_MUTATING_TESTS = false;

const CRON_NAME = 'Currency: rate update';
/** The currencies the source covers, measured from what the job's previous run actually wrote. */
const COVERED_BY_SOURCE = ['USD', 'EUR', 'GBP', 'CHF', 'IDR', 'INR'];
/** Enabled here but NOT published by the source, so the job must leave it alone. */
const NOT_COVERED = 'UAH';

/** Today as the Currencies list renders dates once normalised, e.g. "2026-08-19". */
const todayIso = (): string => new Date().toISOString().slice(0, 10);
/** A date in the form Odoo's date fields render here, e.g. "08/19/2026". */
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
/** Today in the form the "Next Execution Date" field renders, e.g. "08/19/2026 00:00:00". */
const todayForCronField = (): string => `${asDateField(new Date())} 00:00:00`;
/** Today / tomorrow for the settings screen's "Next Run" date field. */
const todayForNextRun = (): string => asDateField(new Date());
const tomorrowForNextRun = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return asDateField(d);
};

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.4.1 - US4: the daily run adds a row per covered currency', () => {
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

  test('CRM-11857_1.4.1: US4 - The daily scheduled run adds one dated row for each currency the source covers, without anyone doing it by hand', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);
    const cronPage = new ScheduledActionPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    const TODAY = todayIso();
    const datesBefore = new Map<string, string>();
    const datesAfter = new Map<string, string>();
    let cronState: ScheduledActionState | null = null;
    let ranManually = false;
    let eurRowsToday = -1;
    let nextRunBefore = '';
    let nextRunAfter = '';

    /** Read the Currencies list as a code -> Date map. */
    const readCurrencyDates = async (): Promise<Map<string, string>> => {
      await currencyPage.openCurrenciesList();
      const codes = await currencyPage.getListedCurrencyCodes();
      const dates = await currencyPage.getColumnValues('Date');
      expect(
        dates.length,
        `The Currencies list returned ${codes.length} code(s) but ${dates.length} Date value(s); the two ` +
          `columns must line up row for row or the mapping would be wrong`
      ).toBe(codes.length);
      const map = new Map<string, string>();
      codes.forEach((code, i) => map.set(code, dates[i]));
      return map;
    };

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    try {
      await test.step('Step 1: Open Currencies and write down the Date shown on each row', async () => {
        const map = await readCurrencyDates();
        map.forEach((date, code) => datesBefore.set(code, date));
        console.log(`  - Today is ${TODAY}`);
        console.log('  - Currencies list before the run:');
        datesBefore.forEach((date, code) => console.log(`      ${code.padEnd(4)} Date ${date || '(empty)'}`));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Currencies dates before the run').catch(() => {});
      });

      await test.step(`Step 2: Open Scheduled Actions, search "${CRON_NAME}" and open it`, async () => {
        const opened = await cronPage.openScheduledAction(CRON_NAME);
        expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - scheduled action opened').catch(() => {});
      });

      await test.step('Step 3: Read "Execute Every" and "Next Execution Date", and check "Repeat Missed"', async () => {
        cronState = await cronPage.readState();
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - scheduled action state read').catch(() => {});
      });

      await test.step('Verification Point 3: the job runs once a day and never catches up a missed run', async () => {
        console.log('VERIFY - the job\'s schedule:');
        console.log(`  Expected "Execute Every"   : 1 Days`);
        console.log(`  Actual   "Execute Every"   : ${cronState!.intervalNumber} ${cronState!.intervalUnit}`);
        console.log(`  Expected "Repeat Missed"   : not ticked`);
        console.log(`  Actual   "Repeat Missed"   : ${cronState!.repeatMissed ? 'ticked' : 'not ticked'}`);
        console.log(`  "Next Execution Date" read : ${cronState!.nextExecution || '(empty)'}`);

        expect(cronState!.intervalNumber, '"Execute Every" should be 1').toBe('1');
        expect(
          cronState!.intervalUnit.toLowerCase(),
          '"Execute Every" should be counted in days - readonly renders the label "Days", a <select> the value "days"'
        ).toContain('day');
        expect(
          cronState!.repeatMissed,
          '"Repeat Missed" must be off: a run that is missed is never caught up later, which is why a gap in the ' +
            'rate history stays a gap'
        ).toBe(false);
        expect(cronState!.nextExecution, '"Next Execution Date" should hold a value').toBeTruthy();
        console.log('  Result: PASS - one run a day, and a missed run is never caught up');
      });

      await test.step('Step 4 (part 1): Make the update due - set "Next Run" on the settings screen to today', async () => {
        // The second gate. See the TWO GATES note in the header: without this the run returns early and
        // silently does nothing, and the case would pass on rows written by an earlier run.
        await settingsPage.openInvoicingSettings();
        const settingsBefore = await settingsPage.readSettings();
        nextRunBefore = settingsBefore.nextRun;
        console.log(`  - "Next Run" was ${nextRunBefore || '(empty)'}; setting it to ${todayForNextRun()} so the update is due`);
        const due = await settingsPage.setNextRun(todayForNextRun());
        expect(
          due,
          `"Next Run" must end up holding ${todayForNextRun()} for the update to be due. It did not, so the ` +
            `scheduled action would fire and return early without writing anything.`
        ).toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 part 1 - update made due').catch(() => {});
      });

      await test.step('Step 4 (part 2): Set "Next Execution Date" to today, "SAVE", then "RUN MANUALLY"', async () => {
        const opened = await cronPage.openScheduledAction(CRON_NAME);
        expect(opened, `The scheduled action "${CRON_NAME}" should open again to be run`).toBe(true);
        const set = await cronPage.setNextExecutionDate(todayForCronField());
        expect(set, '"Next Execution Date" should have been set to today').toBe(true);
        ranManually = await cronPage.clickRunManually();
        expect(ranManually, '"RUN MANUALLY" should have been pressed and the run should have come back').toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 part 2 - job run manually').catch(() => {});
      });

      await test.step('Step 4 (part 3): Read "Next Run" again - it must have moved forward if the run really worked', async () => {
        await settingsPage.openInvoicingSettings();
        const settingsAfter = await settingsPage.readSettings();
        nextRunAfter = settingsAfter.nextRun;
        console.log(`  - "Next Run" is now ${nextRunAfter || '(empty)'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 part 3 - Next Run after the run').catch(() => {});
      });

      await test.step('Verification Point 4: the run actually executed rather than returning early', async () => {
        console.log('VERIFY - the run did work:');
        console.log(`  Expected "Next Run" after the run: ${tomorrowForNextRun()} (pushed forward by the daily interval)`);
        console.log(`  Actual   "Next Run" after the run: ${nextRunAfter || '(empty)'}`);
        expect(
          nextRunAfter,
          `The job pushes "Next Run" forward by its interval every time it really updates. It still reads ` +
            `${nextRunAfter || 'empty'}, so the run returned early and wrote nothing - any row dated today was ` +
            `left by an earlier run, and the rest of this case would be proving nothing.`
        ).toBe(tomorrowForNextRun());
        console.log('  Result: PASS - the run executed and moved its own schedule on');
      });

      await test.step('Step 5: Return to Currencies and read the Date column again', async () => {
        const map = await readCurrencyDates();
        map.forEach((date, code) => datesAfter.set(code, date));
        console.log('  - Currencies list after the run:');
        datesAfter.forEach((date, code) => console.log(`      ${code.padEnd(4)} Date ${date || '(empty)'}`));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Currencies dates after the run').catch(() => {});
      });

      await test.step('Step 6: Open the EUR rate history and count the rows dated today', async () => {
        await currencyPage.openRatesForCurrency('EUR');
        eurRowsToday = await currencyPage.countRateRowsForDate(TODAY);
        console.log(`  - EUR rows dated ${TODAY}: ${eurRowsToday}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - EUR rows dated today').catch(() => {});
      });

      await test.step('Verification Point 5: exactly the covered currencies moved to today, and the uncovered one did not', async () => {
        const movedToToday = [...datesAfter.entries()]
          .filter(([, date]) => date === TODAY)
          .map(([code]) => code)
          .sort();
        const expectedSet = [...COVERED_BY_SOURCE].sort();

        console.log('VERIFY - what one run produced:');
        console.log(`  Expected set with Date = ${TODAY} : {${expectedSet.join(', ')}}, count = ${expectedSet.length}`);
        console.log(`  Actual   set with Date = ${TODAY} : {${movedToToday.join(', ')}}, count = ${movedToToday.length}`);
        console.log(`  Expected ${NOT_COVERED} Date            : ${datesBefore.get(NOT_COVERED) || '(empty)'} (unchanged)`);
        console.log(`  Actual   ${NOT_COVERED} Date            : ${datesAfter.get(NOT_COVERED) || '(empty)'}`);

        expect(
          movedToToday,
          `One run must produce a row dated today for exactly the currencies the source covers. Expected ` +
            `{${expectedSet.join(', ')}} but the list shows {${movedToToday.join(', ')}}.`
        ).toEqual(expectedSet);
        expect(
          datesAfter.get(NOT_COVERED),
          `${NOT_COVERED} is not published by the source, so the run must leave its Date exactly as it was ` +
            `(${datesBefore.get(NOT_COVERED)})`
        ).toBe(datesBefore.get(NOT_COVERED));
        console.log(`  Result: PASS - the run covered exactly ${expectedSet.length} currencies and left ${NOT_COVERED} untouched`);
      });

      await test.step('Verification Point 6: EUR has exactly one row dated today', async () => {
        console.log('VERIFY - no duplicate row for the same day:');
        console.log(`  Expected EUR rows dated ${TODAY}: 1`);
        console.log(`  Actual   EUR rows dated ${TODAY}: ${eurRowsToday}`);
        expect(
          eurRowsToday,
          `A day may hold only ONE rate per currency. EUR shows ${eurRowsToday} row(s) dated ${TODAY}, so a run ` +
            `is appending a second row for a day that already had one.`
        ).toBe(1);
        console.log('  Result: PASS - one run leaves exactly one row per currency per day');
      });
    } finally {
      await test.step('Teardown: put the shared job back on the schedule it was found on', async () => {
        // The try/catch wraps only the restore ACTION so a UI error cannot mask the real failure that sent
        // us into `finally`. Re-arming today's run is harmless: the job only refreshes today's rows.
        try {
          // A settings page left dirty blocks every later navigation, so clear it before asking for the job.
          await settingsPage.discardSettings().catch(() => {});
          if (cronState?.nextExecution) {
            await cronPage.openScheduledAction(CRON_NAME);
            await cronPage.restoreState(cronState);
          } else {
            console.log('  - The job\'s schedule was never captured, so there is nothing to put back');
          }
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Check "Next Execution Date" on "${CRON_NAME}" by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - scheduled action restored').catch(() => {});
      });
    }
  });
});
