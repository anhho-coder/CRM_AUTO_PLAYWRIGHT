import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage, ScheduledActionPage, CurrencySettingsPage } from '@pages';
import type { CurrencyRateRow } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US5: the automatic run leaves a hand-held rate alone
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.5.3
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    A currency the source does not publish is held by hand. Run the job and prove it does not touch that
 *    history: no row changed, no row removed, and no row added for that currency - while a currency the
 *    source DOES publish gets its row for today, which is what shows the run happened at all rather than
 *    quietly doing nothing.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.5\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Turn on developer mode: Settings module > General Settings > "Developer Tools" > "Activate the
 *      developer mode"
 *    - UAH is enabled and carries at least one rate row
 *    - On Invoicing > Configuration > Settings > the "Currencies" block confirm Service = European Central
 *      Bank and Interval = Daily
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click the "UAH" row, then
 *       click the "Rates" button in the box at the top right
 *    2. In the "Currency Rates" list write down every row - its Date and its Rate to six decimals - and the
 *       total number of rows
 *    3. Open the Settings module > Technical > Automation > Scheduled Actions, search "Currency: rate
 *       update", open it, click "EDIT", set "Next Execution Date" to today, click "SAVE" and click
 *       "RUN MANUALLY"
 *    4. Go back to Currencies > UAH > the "Rates" button and compare the list with what was written down in
 *       step 2
 *    5. Click "Currencies" in the breadcrumb, click the "EUR" row and click its "Rates" button
 *
 *  Verification Point:
 *    4. The UAH rows are identical to step 2
 *       _ The same Date values and the same Rate values to six decimals
 *       _ The total number of UAH rows is unchanged
 *       _ UAH has NO row dated today
 *    5. EUR does have a row dated today
 *       _ This proves the run did execute, so UAH was skipped by design and not because nothing happened
 *
 *  Automation notes:
 *    - TWO GATES. The job runs `run_update_currency()`, which acts only on a company whose own "Next Run"
 *      (Invoicing > Configuration > Settings > Currencies) is today or earlier, and then pushes that date
 *      forward. Pressing "RUN MANUALLY" a second time on the same day therefore does nothing at all, with
 *      no error shown. Step 3 here sets "Next Run" to today first so the run is genuinely due. Without it
 *      this case would report a green "UAH unchanged" purely because the job never ran - the strongest way
 *      to pass a test while proving nothing. The Master steps were updated to match.
 *    - Step 5 is the independent proof of execution and is asserted, not just observed: EUR must carry a row
 *      dated today.
 *    - Developer mode is NOT switched on: the job is reached by its action hash, so no global setting has to
 *      be changed for everyone else.
 *    - Nothing is written by this case, so there is no teardown. The rows the job adds for the covered
 *      currencies are exactly what it would have added on its own schedule.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it RUNS a shared scheduled job. */
const SKIP_MUTATING_TESTS = false;

const CRON_NAME = 'Currency: rate update';
/** Enabled here but NOT published by the source, so it is held by hand. */
const HAND_HELD_CURRENCY = 'UAH';
/** Published by the source, used as the proof that the run really executed. */
const SOURCE_CURRENCY = 'EUR';

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
const todayForNextRun = (): string => asDateField(new Date());
const todayForCronField = (): string => `${asDateField(new Date())} 00:00:00`;

/** One rate row rendered as a single comparable string, e.g. "2026-08-17=44.300000". */
const asKey = (r: CurrencyRateRow): string => `${r.date}=${r.rate.toFixed(6)}`;

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.5.3 - US5: the automatic run leaves a hand-held rate alone', () => {
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

  test('CRM-11857_1.5.3: US5 - The automatic run neither changes nor removes the hand-held rate, and adds no row for that currency', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);
    const cronPage = new ScheduledActionPage(page);
    const settingsPage = new CurrencySettingsPage(page);

    const TODAY = todayIso();
    let uahBefore: string[] = [];
    let uahAfter: string[] = [];
    let uahRowsWithToday = -1;
    let eurRowsWithToday = -1;
    let ranManually = false;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step(`Step 1-2: Open the ${HAND_HELD_CURRENCY} rate history and write down every row`, async () => {
      await currencyPage.openRatesForCurrency(HAND_HELD_CURRENCY);
      const rows = await currencyPage.getRateRows();
      uahBefore = rows.map(asKey);
      console.log(`  - Today is ${TODAY}`);
      console.log(`  - ${HAND_HELD_CURRENCY} history before the run (${uahBefore.length} row(s)): ${uahBefore.join(', ') || 'none'}`);
      expect(
        uahBefore.length,
        `${HAND_HELD_CURRENCY} must carry at least one rate row for this case to mean anything`
      ).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - UAH history before the run').catch(() => {});
    });

    await test.step('Step 3: Make the update due, then run the scheduled action manually', async () => {
      // Gate one - the company's own "Next Run". See the TWO GATES note in the header.
      await settingsPage.openInvoicingSettings();
      const before = await settingsPage.readSettings();
      console.log(`  - "Next Run" was ${before.nextRun || '(empty)'}; setting it to ${todayForNextRun()} so the update is due`);
      const due = await settingsPage.setNextRun(todayForNextRun());
      expect(
        due,
        `"Next Run" must end up holding ${todayForNextRun()} for the update to be due. Otherwise the job returns ` +
          `early and "${HAND_HELD_CURRENCY} unchanged" would be true only because nothing ran.`
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

    await test.step(`Step 4: Go back to the ${HAND_HELD_CURRENCY} rate history and compare it with step 2`, async () => {
      await currencyPage.openRatesForCurrency(HAND_HELD_CURRENCY);
      const rows = await currencyPage.getRateRows();
      uahAfter = rows.map(asKey);
      uahRowsWithToday = rows.filter((r) => r.date === TODAY).length;
      console.log(`  - ${HAND_HELD_CURRENCY} history after the run (${uahAfter.length} row(s)): ${uahAfter.join(', ') || 'none'}`);
      console.log(`  - ${HAND_HELD_CURRENCY} rows dated ${TODAY}: ${uahRowsWithToday}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - UAH history after the run').catch(() => {});
    });

    await test.step(`Step 5: Open the ${SOURCE_CURRENCY} rate history and look for a row dated today`, async () => {
      await currencyPage.openRatesForCurrency(SOURCE_CURRENCY);
      const rows = await currencyPage.getRateRows();
      eurRowsWithToday = rows.filter((r) => r.date === TODAY).length;
      console.log(`  - ${SOURCE_CURRENCY} rows dated ${TODAY}: ${eurRowsWithToday} (newest row on file ${rows[0]?.rawDate ?? 'none'})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - EUR history after the run').catch(() => {});
    });

    await test.step('Verification Point 5: the run really did execute', async () => {
      // Asserted BEFORE the "unchanged" checks on purpose: if the run did nothing, "UAH is unchanged" is
      // meaningless, and reporting it as a pass would be the most misleading possible outcome.
      console.log('VERIFY - the run executed:');
      console.log(`  Expected ${SOURCE_CURRENCY} rows dated ${TODAY}: 1`);
      console.log(`  Actual   ${SOURCE_CURRENCY} rows dated ${TODAY}: ${eurRowsWithToday}`);
      expect(
        eurRowsWithToday,
        `${SOURCE_CURRENCY} is published by the source, so a run must leave exactly one row dated ${TODAY}. ` +
          `It shows ${eurRowsWithToday}, so the job did not do its work and nothing else here can be trusted.`
      ).toBe(1);
      console.log('  Result: PASS - the run executed, so anything untouched was skipped by design');
    });

    await test.step(`Verification Point 4: the ${HAND_HELD_CURRENCY} history is untouched`, async () => {
      console.log(`VERIFY - the hand-held ${HAND_HELD_CURRENCY} history against the run:`);
      console.log(`  Expected rows (${uahBefore.length}): ${uahBefore.join(', ')}`);
      console.log(`  Actual   rows (${uahAfter.length}): ${uahAfter.join(', ')}`);
      console.log(`  Expected ${HAND_HELD_CURRENCY} rows dated ${TODAY}: 0`);
      console.log(`  Actual   ${HAND_HELD_CURRENCY} rows dated ${TODAY}: ${uahRowsWithToday}`);

      expect(
        uahAfter.length,
        `The run must not add or remove a ${HAND_HELD_CURRENCY} row. There were ${uahBefore.length} and there are now ${uahAfter.length}.`
      ).toBe(uahBefore.length);
      expect(
        uahAfter,
        `Every ${HAND_HELD_CURRENCY} Date and Rate must be identical to six decimals. A rate held by hand that the ` +
          `job silently overwrites would change how every document in that currency converts.`
      ).toEqual(uahBefore);
      expect(
        uahRowsWithToday,
        `${HAND_HELD_CURRENCY} is not published by the source, so the run must add no row for it at all - not even ` +
          `a fallback. It has ${uahRowsWithToday} row(s) dated ${TODAY}.`
      ).toBe(0);
      console.log('  Result: PASS - the run neither changed, removed nor added a hand-held rate');
    });
  });
});
