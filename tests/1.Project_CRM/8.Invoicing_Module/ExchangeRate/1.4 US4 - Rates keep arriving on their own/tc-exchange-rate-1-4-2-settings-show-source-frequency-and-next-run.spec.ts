import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ScheduledActionPage, CurrencySettingsPage } from '@pages';
import type { AutomaticRatesSettings } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US4: the settings screen shows source, frequency and next run
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.4.2
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    An administrator must be able to answer three questions without a developer: where do the rates come
 *    from, how often do they arrive, and when do they arrive next. All three are on the Invoicing settings
 *    screen, and the third one has to move forward once a run has happened - otherwise nobody can tell a
 *    working schedule from a stalled one.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.4\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Turn on developer mode: Settings module > General Settings > "Developer Tools" > "Activate the
 *      developer mode"
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Settings and scroll down to the block headed
 *       "Currencies"
 *    2. In the "Automatic Currency Rates" block write down the values of "Service", "Interval" and
 *       "Next Run"
 *    3. Open the Settings module > Technical > Automation > Scheduled Actions, search "Currency: rate
 *       update", open it, click "EDIT", set "Next Execution Date" to today, click "SAVE" and click
 *       "RUN MANUALLY"
 *    4. Go back to Invoicing > Configuration > Settings > the "Currencies" block and read "Next Run" again
 *
 *  Verification Point:
 *    2. "Service" reads European Central Bank
 *       _ "Interval" reads Daily
 *       _ "Next Run" holds a date, it is not empty
 *    4. "Next Run" has moved forward to the day after the run
 *       _ The three values are all readable from the settings screen with no developer tools needed
 *
 *  Automation notes:
 *    - TWO GATES. The job runs `run_update_currency()`, which acts only on a company whose own "Next Run"
 *      is today or earlier and then pushes that date forward by the interval. Pressing "RUN MANUALLY" a
 *      second time on the same day therefore does nothing at all - no row, no error, no change to
 *      "Next Run" - so step 3 as written can silently fail to trigger anything. Step 3 here sets "Next Run"
 *      to today first, which is what makes the run due, and only then fires the scheduled action. The value
 *      recorded in step 2 is deliberately overwritten to do this, which is why step 4 expects tomorrow
 *      rather than "the recorded value plus one". The Master steps were updated to match.
 *    - Developer mode is NOT switched on: the scheduled action is reached by its action hash, so the
 *      Technical menu does not need to be rendered, and no global setting is changed for other people.
 *    - "Service" and "Interval" are read as the LABELS a tester sees on screen, not the stored codes
 *      ("ecb" / "daily").
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it RUNS a shared scheduled job. */
const SKIP_MUTATING_TESTS = false;

const CRON_NAME = 'Currency: rate update';
const EXPECTED_SERVICE = 'European Central Bank';
const EXPECTED_INTERVAL = 'Daily';

/** A date in the form Odoo's date fields render here, e.g. "08/19/2026". */
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
const todayForNextRun = (): string => asDateField(new Date());
const tomorrowForNextRun = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return asDateField(d);
};
const todayForCronField = (): string => `${asDateField(new Date())} 00:00:00`;

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.4.2 - US4: the settings screen shows source, frequency and next run', () => {
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

  test('CRM-11857_1.4.2: US4 - The settings screen shows which source is used, how often it runs and when it next runs, and the next run moves forward after a run', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const cronPage = new ScheduledActionPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    let recorded: AutomaticRatesSettings | null = null;
    let nextRunAfter = '';
    let ranManually = false;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Step 1-2: Open the Invoicing settings, find the "Currencies" block and write down "Service", "Interval" and "Next Run"', async () => {
      const opened = await settingsPage.openInvoicingSettings();
      expect(opened, 'The Invoicing settings screen should open').toBe(true);
      recorded = await settingsPage.readSettings();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - Automatic Currency Rates read').catch(() => {});
    });

    await test.step('Verification Point 2: the source, the frequency and the next run are all readable here', async () => {
      console.log('VERIFY - what the settings screen tells an administrator:');
      console.log(`  Expected "Service"  : ${EXPECTED_SERVICE}`);
      console.log(`  Actual   "Service"  : ${recorded!.service || '(empty)'}`);
      console.log(`  Expected "Interval" : ${EXPECTED_INTERVAL}`);
      console.log(`  Actual   "Interval" : ${recorded!.interval || '(empty)'}`);
      console.log(`  Expected "Next Run" : a date, not empty`);
      console.log(`  Actual   "Next Run" : ${recorded!.nextRun || '(empty)'}`);

      expect(recorded!.service, `"Service" should name the rate source`).toBe(EXPECTED_SERVICE);
      expect(recorded!.interval, `"Interval" should say how often rates arrive`).toBe(EXPECTED_INTERVAL);
      expect(
        recorded!.nextRun,
        '"Next Run" must hold a date. Empty means nothing is scheduled, and an administrator would have no way ' +
          'of telling that from this screen.'
      ).toBeTruthy();
      console.log('  Result: PASS - all three answers are on the settings screen, no developer tools needed');
    });

    await test.step('Step 3: Make the update due, then run the scheduled action manually', async () => {
      // Gate one - the company's own "Next Run". See the TWO GATES note in the header: without this the
      // scheduled action fires but the method returns early, and nothing observable happens.
      console.log(`  - "Next Run" was ${recorded!.nextRun}; setting it to ${todayForNextRun()} so the update is due`);
      const due = await settingsPage.setNextRun(todayForNextRun());
      expect(
        due,
        `"Next Run" must end up holding ${todayForNextRun()} for the update to be due. It did not, so the ` +
          `scheduled action would fire and return early, and step 4 would be reading a schedule that never moved.`
      ).toBe(true);

      // Gate two - the scheduled action's own "Next Execution Date".
      const opened = await cronPage.openScheduledAction(CRON_NAME);
      expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
      const set = await cronPage.setNextExecutionDate(todayForCronField());
      expect(set, '"Next Execution Date" should have been set to today').toBe(true);
      ranManually = await cronPage.clickRunManually();
      expect(ranManually, '"RUN MANUALLY" should have been pressed and the run should have come back').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - job run manually').catch(() => {});
    });

    await test.step('Step 4: Go back to the "Currencies" block and read "Next Run" again', async () => {
      await settingsPage.openInvoicingSettings();
      const after = await settingsPage.readSettings();
      nextRunAfter = after.nextRun;
      console.log(`  - "Next Run" now reads ${nextRunAfter || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Next Run after the run').catch(() => {});
    });

    await test.step('Verification Point 4: "Next Run" has moved forward to the day after the run', async () => {
      console.log('VERIFY - the schedule advances once a run has happened:');
      console.log(`  Expected "Next Run" : ${tomorrowForNextRun()} (the day after the run, on a Daily interval)`);
      console.log(`  Actual   "Next Run" : ${nextRunAfter || '(empty)'}`);
      expect(
        nextRunAfter,
        `On a Daily interval the job pushes "Next Run" to the following day each time it updates. It reads ` +
          `${nextRunAfter || 'empty'} instead, so either the run did nothing or the screen is not reporting the ` +
          `real schedule - and an administrator could not tell a working schedule from a stalled one.`
      ).toBe(tomorrowForNextRun());
      console.log('  Result: PASS - the next run is visible and moves forward after a run');
    });

    // No teardown. "Next Run" is left on tomorrow, which is exactly where a normal daily run leaves it, and
    // "Service" and "Interval" were never changed. Putting the originally recorded date back would instead
    // re-arm a run that has already happened today.
  });
});
