import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage, ScheduledActionPage, CurrencySettingsPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US6: a run does not fill in the days it missed
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.6.3
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Run the job and prove it writes a row for TODAY only. The days it never ran on stay empty, which is
 *    what keeps history honest: a figure once converted at the last rate on file before its date must go on
 *    being explained by that rate, and back-filling the gap afterwards would silently change the reason.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.6\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Turn on developer mode: Settings module > General Settings > "Developer Tools" > "Activate the
 *      developer mode"
 *    - On Currencies > EUR > the "Rates" button write down the total number of rows and pick three dates
 *      inside the gap that have no row (for example 1 Jun, 1 Jul and 1 Aug 2026 on the current environment)
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click "EUR", click the "Rates"
 *       button and confirm none of the three chosen dates has a row
 *    2. Open the Settings module > Technical > Automation > Scheduled Actions, search "Currency: rate
 *       update", open it, click "EDIT", set "Next Execution Date" to today, click "SAVE" and click
 *       "RUN MANUALLY"
 *    3. Go back to Currencies > EUR > the "Rates" button and look for rows on the three chosen dates
 *    4. Read the total number of rows again
 *
 *  Verification Point:
 *    3. None of the three chosen dates has a row, count = 0 for each
 *       _ The gap is exactly as wide as it was before the run
 *    4. The total number of rows has increased by at most 1, and that one row is dated today
 *       _ The skipped days are never filled in afterwards, so a figure once explained by the earlier rate
 *         stays explained by it
 *
 *  Automation notes:
 *    - The three dates are checked through the rate list's own "Date" search rather than by reading rows.
 *      EUR carries thousands of rate rows here and the list renders one page at a time, so scanning for a
 *      date would either miss it or need the whole history loaded.
 *    - The gap those three dates sit in was verified on this environment: EUR has dense daily rows up to
 *      January 2026 and then nothing at all until 17 August 2026. If someone later back-fills that stretch,
 *      step 1 fails with a message saying to pick other empty dates - which is the correct outcome, because
 *      the case needs genuinely empty days inside the covered range.
 *    - TWO GATES. The job acts only on a company whose own "Next Run" is today or earlier, and then pushes
 *      that date forward. A second "RUN MANUALLY" on the same day does nothing and says nothing, so step 2
 *      sets "Next Run" to today first. Without it "the gap did not change" would be trivially true because
 *      no run happened - which is why the row count is also asserted to have grown by today's row. The
 *      Master steps were updated to match.
 *    - Nothing is written by this case beyond the row the job itself adds for today, which is exactly what
 *      the daily schedule would have written. There is nothing to undo.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it RUNS a shared scheduled job. */
const SKIP_MUTATING_TESTS = false;

const CRON_NAME = 'Currency: rate update';
const CURRENCY_CODE = 'EUR';
/** Three days with no rate row, inside the stretch the history covers. Verified on this environment. */
const GAP_DATES = ['06/01/2026', '07/01/2026', '08/01/2026'];

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
const todayForNextRun = (): string => asDateField(new Date());
const todayForCronField = (): string => `${asDateField(new Date())} 00:00:00`;

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.6.3 - US6: a run does not fill in the days it missed', () => {
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

  test('CRM-11857_1.6.3: US6 - A run creates a row only for the day it runs and never fills in the days that were skipped', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);
    const cronPage = new ScheduledActionPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    const TODAY = todayIso();
    const gapBefore = new Map<string, number>();
    const gapAfter = new Map<string, number>();
    let totalBefore = -1;
    let totalAfter = -1;
    let rowsDatedToday = -1;
    let ranManually = false;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step(`Step 1: Open the ${CURRENCY_CODE} rate history, note the total, and confirm the three chosen dates have no row`, async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      await currencyPage.clearSearchFacets().catch(() => {});
      totalBefore = await currencyPage.getListTotalCount();
      console.log(`  - Today is ${TODAY}; ${CURRENCY_CODE} holds ${totalBefore} rate row(s) in total`);

      for (const date of GAP_DATES) {
        const count = await currencyPage.countRateRowsForDateBySearch(date);
        gapBefore.set(date, count);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - gap confirmed before the run').catch(() => {});

      for (const date of GAP_DATES) {
        expect(
          gapBefore.get(date),
          `${date} must have NO ${CURRENCY_CODE} rate row for this case to mean anything - it needs genuinely ` +
            `empty days inside the covered range. It has ${gapBefore.get(date)}. Pick three other empty dates.`
        ).toBe(0);
      }
      console.log(`  - All three chosen dates are empty before the run: ${GAP_DATES.join(', ')}`);
    });

    await test.step('Step 2: Make the update due, then run the scheduled action manually', async () => {
      // Gate one - the company's own "Next Run". See the TWO GATES note in the header.
      await settingsPage.openInvoicingSettings();
      const before = await settingsPage.readSettings();
      console.log(`  - "Next Run" was ${before.nextRun || '(empty)'}; setting it to ${todayForNextRun()} so the update is due`);
      const due = await settingsPage.setNextRun(todayForNextRun());
      expect(
        due,
        `"Next Run" must end up holding ${todayForNextRun()} for the update to be due. Otherwise the job returns ` +
          `early, and "the gap did not change" would be true only because nothing ran.`
      ).toBe(true);

      // Gate two - the scheduled action's own "Next Execution Date".
      const opened = await cronPage.openScheduledAction(CRON_NAME);
      expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
      const set = await cronPage.setNextExecutionDate(todayForCronField());
      expect(set, '"Next Execution Date" should have been set to today').toBe(true);
      ranManually = await cronPage.clickRunManually();
      expect(ranManually, '"RUN MANUALLY" should have been pressed and the run should have come back').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - job run manually').catch(() => {});
    });

    await test.step('Step 3-4: Look for rows on the three chosen dates again, then read the total', async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      for (const date of GAP_DATES) {
        const count = await currencyPage.countRateRowsForDateBySearch(date);
        gapAfter.set(date, count);
      }
      await currencyPage.clearSearchFacets().catch(() => {});
      totalAfter = await currencyPage.getListTotalCount();
      const rows = await currencyPage.getRateRows();
      rowsDatedToday = rows.filter((r) => r.date === TODAY).length;
      console.log(`  - ${CURRENCY_CODE} now holds ${totalAfter} rate row(s) in total (was ${totalBefore})`);
      console.log(`  - ${CURRENCY_CODE} rows dated ${TODAY}: ${rowsDatedToday}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3-4 - gap and total after the run').catch(() => {});
    });

    await test.step('Verification Point 4: the run added at most one row, and it is dated today', async () => {
      // Asserted before the gap checks: if no row arrived for today then the job never ran, and an unchanged
      // gap would prove nothing at all.
      console.log('VERIFY - what the run added:');
      console.log(`  Expected rows dated ${TODAY}   : 1`);
      console.log(`  Actual   rows dated ${TODAY}   : ${rowsDatedToday}`);
      console.log(`  Expected total after the run : at most ${totalBefore + 1} (was ${totalBefore})`);
      console.log(`  Actual   total after the run : ${totalAfter}`);

      expect(
        rowsDatedToday,
        `${CURRENCY_CODE} must carry exactly one row dated ${TODAY} after the run. Without it the job did not do ` +
          `its work, and nothing else here can be trusted.`
      ).toBe(1);
      expect(
        totalAfter,
        `A run may add at most ONE row. The total went from ${totalBefore} to ${totalAfter}, so it wrote ` +
          `${totalAfter - totalBefore} rows - it is filling in days it never ran on.`
      ).toBeLessThanOrEqual(totalBefore + 1);
      expect(
        totalAfter,
        `The total must not go DOWN - a run must never remove history`
      ).toBeGreaterThanOrEqual(totalBefore);
      console.log('  Result: PASS - the run wrote one row for today and nothing else');
    });

    await test.step('Verification Point 3: the gap is exactly as wide as it was', async () => {
      console.log('VERIFY - the skipped days after the run:');
      for (const date of GAP_DATES) {
        console.log(`  ${date}: expected 0 row(s), actual ${gapAfter.get(date)} row(s)`);
      }
      for (const date of GAP_DATES) {
        expect(
          gapAfter.get(date),
          `${date} must still have no ${CURRENCY_CODE} rate row. A run that back-fills a skipped day would ` +
            `change the rate a document dated after it converts at, rewriting a figure that was already reported.`
        ).toBe(0);
      }
      console.log('  Result: PASS - a missed day is never filled in afterwards');
    });
  });
});
