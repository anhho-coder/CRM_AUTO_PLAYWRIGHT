import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, ScheduledActionPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_1.5: Missed day has no rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.5
 *  Jira            : CRM-13387
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13387 updated 2026-10-08T10:45:55+0300, 4 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights;
 *                    step 2 needs Settings > Technical > Automation, which only such a user reaches.
 *
 *  Summary:
 *    When the rate provider skips a day (e.g., was not run yesterday), the update run today will
 *    record today's rates but will NOT back-fill yesterday. Verify that after such a gap, the rate
 *    list carries today's rates but no entry for yesterday.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\\.5:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13387 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for
 *      NAKIVO, Inc.
 *    - Run on a Tuesday to Friday after 16:00 CET.
 *    - The EUR rate history has no row dated yesterday.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currency Rates Providers, open
 *     "European Central Bank", click Edit, set "Last successful update" = the day before
 *     yesterday and "Next scheduled update" = today, click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  2. Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates
 *     Update (OCA) daily" and click "Run Manually"
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  3. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: CHF, EUR, GBP, IDR, INR show Date = today
 *
 *  4. Open EUR and click "Rates"
 *     Expected Result: The newest row is dated today
 *                      No row is dated yesterday
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTIONS for the TC author (not invented here)
 * ---------------------------------------------------------------------------
 *
 *  Steps 1 and 2 carry EMPTY "Expected Results" in Jira. Nothing is stated for them, so this spec
 *  does not invent one: it asserts only that the SET-UP action itself took effect (the dates really
 *  hold the values step 1 typed; "RUN MANUALLY" really was clicked), which is what keeps step 4 from
 *  passing vacuously. Those two guards are labelled "setup guard" in the VERIFY block.
 *
 * ---------------------------------------------------------------------------
 *  Data written on crm-mig, and how it is cleaned up
 * ---------------------------------------------------------------------------
 *
 *  - The provider's "Last successful update" / "Next scheduled update" are changed by step 1 and by
 *    the run itself. Teardown puts BOTH back to the values read at the start of the test, so the
 *    base is left exactly as it was found and the scheduled run is not skipped.
 *  - The run writes one res.currency.rate row per covered currency for today. Yesterday is NOT
 *    back-filled. These rows are NOT deleted: they are the ordinary daily rates the scheduled cron
 *    would have written anyway.
 * ---------------------------------------------------------------------------
 *  SKIPPED - environment limitation, not a product or spec defect
 * ---------------------------------------------------------------------------
 *
 *  Measured on crm-mig 2026-10-14, after the rebuild that re-sequenced the ids:
 *    - `currency_rate_update` 12.0.1.3.1 is INSTALLED
 *    - the ECB provider record EXISTS, with all 6 currencies and interval 1 Day
 *    - but `ir.cron` holds NO record whose name contains "rate" - the scheduled
 *      action "Currency Rates Update (OCA) daily" was not created by the deploy.
 *
 *  This case drives that scheduled action, so it cannot run at all until the cron
 *  is restored on the build. Skipped at DECLARATION level on the tester's ruling
 *  (2026-10-14) so no browser is launched for it.
 *
 *  RE-ENABLE by deleting the `.skip` below once the cron exists again.
 *
 * ===========================================================================
 */

const CRON_NAME = 'Currency Rates Update (OCA) daily';
const PROVIDER_SERVICE = 'European Central Bank';
/** The currencies step 3 names. */
const COVERED_CURRENCIES = ['CHF', 'EUR', 'GBP', 'IDR', 'INR'];

const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const asListDate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const addDays = (d: Date, days: number): Date => {
  const out = new Date(d);
  out.setDate(d.getDate() + days);
  return out;
};

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers, open "European Central Bank", click Edit, set "Last successful update" = the day before yesterday and "Next scheduled update" = today, click Save',
  s2: 'Step 2: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currencies',
  s4: 'Step 4: Open EUR and click "Rates"',
  verify: 'Verification: after a missed day, today has rates but yesterday does not',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_1.5 - Exchange Rates: missed day has no rate', () => {
  test.describe.configure({ timeout: config.timeouts.test });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip('CRM-11857_1.5: Running the currency rate update after a missed day adds no rate for the missed day [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);
    const cronPage = new ScheduledActionPageMig(page);

    const now = new Date();
    const TODAY_TEXT = asDateField(now);
    const YESTERDAY_TEXT = asDateField(addDays(now, -1));
    const DAY_BEFORE_YESTERDAY_TEXT = asDateField(addDays(now, -2));
    const TODAY_LIST = asListDate(now);
    const YESTERDAY_LIST = asListDate(addDays(now, -1));

    let providerBefore: ProviderConfig | null = null;
    let datesAfterStep1: ProviderConfig | null = null;
    let ranManually = false;
    let datesAfter = new Map<string, string>();
    let eurRateRows: Array<{ date: string; rate: number }> = [];
    let hasRateTodayInEUR = false;
    let hasRateYesterdayInEUR = false;
    /** Did a row dated yesterday already exist BEFORE the run? Decides scored vs BLOCKED. */
    let yesterdayExistedBefore = false;
    /** True when the TC's "no row dated yesterday" pre-condition actually holds on this base. */
    let preconditionMet = false;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      console.log(`  Today                 : ${TODAY_TEXT}`);
      console.log(`  Yesterday             : ${YESTERDAY_TEXT}`);
      console.log(`  Day before yesterday  : ${DAY_BEFORE_YESTERDAY_TEXT}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});

      // CRM-13387's pre-condition states "The EUR rate history has no row dated yesterday" - it is a
      // GIVEN, not something the TC asks the tester to arrange. On a base whose cron ran yesterday
      // that given does not hold, and asserting the no-back-fill rule anyway blames the product for a
      // scenario the test never set up (measured 2026-10-13: yesterday's row was present, so the case
      // reported FAIL on a base that was behaving correctly).
      // The spec therefore MEASURES the pre-condition and, when it does not hold, reports the case
      // BLOCKED instead of scoring it. It deliberately does NOT delete yesterday's rate to force the
      // gap: that would mutate migrated rate history on a shared base, and a crash between the delete
      // and the restore would leave every document dated yesterday converting at the wrong rate.
      await currencyPage.openRatesForCurrency('EUR');
      const rowsBefore = await currencyPage.getRateRows();
      yesterdayExistedBefore = rowsBefore.some((r) => r.date === YESTERDAY_LIST);
      preconditionMet = !yesterdayExistedBefore;
      console.log(`  EUR rows before the run : ${rowsBefore.length}`);
      console.log(`  Row dated yesterday (${YESTERDAY_LIST}) already present : ${yesterdayExistedBefore}`);
      console.log(`  Pre-condition "no row dated yesterday" met : ${preconditionMet}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);

        providerBefore = await providerPage.readProviderFields();
        console.log(`  - Last successful update (before) : ${providerBefore.lastSuccessfulRun}`);
        console.log(`  - Next scheduled update (before)  : ${providerBefore.nextRun}`);

        console.log(`  - Setting Last successful update = ${DAY_BEFORE_YESTERDAY_TEXT}`);
        console.log(`  - Setting Next scheduled update  = ${TODAY_TEXT}`);
        const saved = await providerPage.setProviderDates({
          lastSuccessfulRun: DAY_BEFORE_YESTERDAY_TEXT,
          nextRun: TODAY_TEXT,
        });
        expect(saved, 'The provider dates should have been saved').toBe(true);

        datesAfterStep1 = await providerPage.readProviderFields();
        console.log(`  - Read back Last successful update : ${datesAfterStep1.lastSuccessfulRun}`);
        console.log(`  - Read back Next scheduled update  : ${datesAfterStep1.nextRun}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - provider gap set (skip yesterday)').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const opened = await cronPage.openScheduledAction(CRON_NAME);
        expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
        ranManually = await cronPage.clickRunManually();
        console.log(`  - "RUN MANUALLY" clicked : ${ranManually}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - cron run manually').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        const dates = await currencyPage.getColumnValues('Date');
        expect(
          dates.length,
          `The Currencies list returned ${codes.length} code(s) but ${dates.length} Date value(s)`
        ).toBe(codes.length);
        codes.forEach((code, i) => datesAfter.set(code, dates[i]));
        console.log('  - Date column:');
        datesAfter.forEach((date, code) => console.log(`      ${code.padEnd(4)} ${date || '(empty)'}`));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Currencies list after run').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        // Step 4's action is "Open EUR and click Rates" - without this the reader was handed the
        // Currencies list left over from step 3, found zero rate rows, and reported BOTH "today
        // exists = false" and "yesterday exists = false", which reads exactly like a real product
        // failure on a base that was correct (measured on the 2026-10-13 run).
        await currencyPage.openRatesForCurrency('EUR');
        eurRateRows = await currencyPage.getRateRows();
        hasRateTodayInEUR = eurRateRows.some(r => r.date === TODAY_LIST);
        hasRateYesterdayInEUR = eurRateRows.some(r => r.date === YESTERDAY_LIST);
        console.log(`  - EUR rate rows found: ${eurRateRows.length}`);
        console.log(`  - Has rate for today: ${hasRateTodayInEUR}`);
        console.log(`  - Has rate for yesterday: ${hasRateYesterdayInEUR}`);
        if (eurRateRows.length > 0) {
          console.log(`  - Newest 3 rows:`);
          eurRateRows.slice(0, 3).forEach(r => console.log(`      ${r.date} = ${r.rate}`));
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR rate history').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = datesAfterStep1 as ProviderConfig;

        const v1 = c1.lastSuccessfulRun === DAY_BEFORE_YESTERDAY_TEXT && c1.nextRun === TODAY_TEXT;
        const v2 = ranManually;
        const v3 = COVERED_CURRENCIES.every((code) => datesAfter.get(code) === TODAY_LIST);
        const v4 = hasRateTodayInEUR && !hasRateYesterdayInEUR;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1 setup guard, provider set to skip yesterday:');
        console.log(`     Expected : Last successful update = ${DAY_BEFORE_YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT}`);
        console.log(`     Actual   : Last successful update = ${c1.lastSuccessfulRun}, Next scheduled update = ${c1.nextRun}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2 setup guard, the cron was triggered:');
        console.log(`     Expected : "RUN MANUALLY" clicked = true`);
        console.log(`     Actual   : ${ranManually}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, currencies show today\'s date:');
        const currenciesOnToday = COVERED_CURRENCIES.filter((code) => datesAfter.get(code) === TODAY_LIST);
        console.log(`     Expected : {${COVERED_CURRENCIES.join(', ')}} all show Date = ${TODAY_LIST}`);
        console.log(`     Actual   : {${currenciesOnToday.join(', ')}} show Date = ${TODAY_LIST}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, EUR has today but NOT yesterday:');
        console.log(`     Expected : today (${TODAY_LIST}) exists, yesterday (${YESTERDAY_LIST}) does not`);
        console.log(`     Actual   : today exists = ${hasRateTodayInEUR}, yesterday exists = ${hasRateYesterdayInEUR}`);
        if (preconditionMet) {
          console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        } else {
          console.log('     Result   : BLOCKED - the TC pre-condition "the EUR rate history has no row');
          console.log('                dated yesterday" does not hold on this base: a row dated');
          console.log(`                ${YESTERDAY_LIST} was already there before the run, so there is no`);
          console.log('                missed day to observe. Not scored - a FAIL here would blame the');
          console.log('                product for a scenario the test never set up.');
        }
        console.log('===============================================');
        const overall = !preconditionMet
          ? 'BLOCKED - pre-condition not met on this base (yesterday already has an EUR rate)'
          : `${v1 && v2 && v3 && v4 ? 'PASS' : 'FAIL'} - after missed day, no rate for missed day`;
        console.log(`OVERALL: ${overall}`);

        let __verifyPassed = false;
        try {
          expect(c1.lastSuccessfulRun, 'setup guard - Last successful update set to day before yesterday').toBe(DAY_BEFORE_YESTERDAY_TEXT);
          expect(c1.nextRun, 'setup guard - Next scheduled update set to today').toBe(TODAY_TEXT);
          expect(ranManually, 'setup guard - "RUN MANUALLY" was clicked on the OCA cron').toBe(true);
          const currenciesOnToday = COVERED_CURRENCIES.filter((code) => datesAfter.get(code) === TODAY_LIST);
          expect(
            currenciesOnToday,
            `Every covered currency must show Date = ${TODAY_LIST}`
          ).toEqual(COVERED_CURRENCIES);
          expect(hasRateTodayInEUR, 'EUR must have a rate for today').toBe(true);
          // Only scored when the TC's pre-condition actually holds - see the Pre-condition step.
          if (preconditionMet) {
            expect(hasRateYesterdayInEUR, 'EUR must NOT have a rate for yesterday (no back-fill)').toBe(false);
          }
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_1.5 - Missed day gap',
            passed: __verifyPassed,
            highlight: ['table.o_list_view'],
          }).catch(() => {});
        }
      });
    } finally {
      await test.step(STEP.teardown, async () => {
        console.log(`\n--- ${STEP.teardown} ---`);
        try {
          if (providerBefore?.lastSuccessfulRun && providerBefore?.nextRun) {
            const reopened = await providerPage.openProviderForm(PROVIDER_SERVICE);
            if (reopened) {
              console.log(`  - Restoring Last successful update = ${providerBefore.lastSuccessfulRun}`);
              console.log(`  - Restoring Next scheduled update  = ${providerBefore.nextRun}`);
              await providerPage.setProviderDates({
                lastSuccessfulRun: providerBefore.lastSuccessfulRun,
                nextRun: providerBefore.nextRun,
              }).catch(() => {});
            }
          } else {
            console.log('  ! No provider dates were captured - nothing to restore');
          }
          console.log('  - Rate rows written by the run are left in place on purpose');
        } catch (e) {
          console.log(`  ! Teardown could not complete: ${(e as Error).message}`);
        }
      });
    }
  });
});
