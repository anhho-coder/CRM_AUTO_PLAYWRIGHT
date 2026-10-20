import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, ScheduledActionPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_1.2: Weekend run repeats last published rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.2
 *  Jira            : CRM-13384
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13384 updated 2026-10-12T07:51:45+0300, 4 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights;
 *                    step 3 needs Settings > Technical > Automation, which only such a user reaches.
 *
 *  Summary:
 *    When the update runs on a weekend (Saturday), the ECB has published no new rate for that day,
 *    so the system writes a rate for the weekend day using the last published value (from Friday).
 *    Verify the weekend's rate row holds the repeated Friday rate.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13384 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for
 *      NAKIVO, Inc.
 *    - Run on a Saturday (after 07:00 Vietnam time).
 *    - The Currencies list shows CHF, EUR, GBP, IDR, INR dated the previous Friday.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currency Rates Providers, open
 *     "European Central Bank", click Edit, set "Last successful update" = yesterday and
 *     "Next scheduled update" = today, click Save
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
 *                      Its Rate equals the Rate of the row below it
 *
 * ---------------------------------------------------------------------------
 *  THE SATURDAY DAY-GATE IS GONE - and why it could be removed (2026-10-13)
 * ---------------------------------------------------------------------------
 *
 *  The TC's pre-condition says "Run on a Saturday (after 07:00 Vietnam time)", and this spec used to
 *  refuse to assert on any other day: it printed steps 3 and 4 as BLOCKED and still finished GREEN.
 *  That is a vacuous pass - the run reported success while the only two checks that matter had not
 *  executed - and it is removed here.
 *
 *  The gate was only ever necessary because of the defect in CRM-13459: before that fix a run on a
 *  non-publication day wrote NO row at all, so the weekend behaviour existed nowhere but on the
 *  weekend itself. CRM-13459 is Resolved/Fixed (2026-10-12) and the weekend rows are now in the
 *  history for good - measured on crm-mig:
 *      EUR  2026-10-09 (Fri) = 0.893975
 *      EUR  2026-10-10 (Sat) = 0.892379
 *      EUR  2026-10-11 (Sun) = 0.892379
 *  so the scenario can be READ BACK from the most recent complete weekend on any day of the week,
 *  the same way CRM-11857_8.2 reads back its Friday-to-Monday window.
 *
 * ---------------------------------------------------------------------------
 *  WHAT STEP 4 ASSERTS, AND WHERE IT DEPARTS FROM THE TC's WORDING
 * ---------------------------------------------------------------------------
 *
 *  Step 4's expected result reads "The newest row is dated today / Its Rate equals the Rate of the
 *  row below it". On a Saturday the row below is FRIDAY's, and the measured figures above show the
 *  two are NOT equal: Saturday 0.892379 vs Friday 0.893975. Read literally, step 4 fails on a
 *  Saturday even on a perfectly healthy base.
 *
 *  That wording predates the fix. Khang Nguyen Thai Duy on CRM-13459, 2026-10-12 12:53 +0300:
 *
 *    "Each run records the day of the run with the latest rate published BEFORE that day, weekends
 *     included, as Production does."
 *
 *  Friday's row carries what was published before Friday; Saturday AND Sunday both carry what was
 *  published on Friday. So the repeat the TC is after is visible between SATURDAY and SUNDAY, not
 *  between Saturday and Friday. This spec asserts that - a row exists for the weekend Saturday in
 *  every covered currency, and the Saturday and Sunday rates are one and the same value.
 *
 *  >> ACTION FOR THE TC AUTHOR: CRM-13384 step 4 ("Its Rate equals the Rate of the row below it")
 *     and the "Run on a Saturday" pre-condition both predate CRM-13459 and need correcting. This is
 *     the third test case in the suite carrying the same pre-fix wording, after CRM-13414 and
 *     CRM-13417.
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
 *  - The run writes one res.currency.rate row per covered currency for today (if today is a
 *    publication day; on weekends it repeats Friday's rate). These rows are NOT deleted: they are
 *    the ordinary daily rates the scheduled cron would have written anyway.
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

const getDayName = (d: Date): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
};

/**
 * The most recent COMPLETE weekend - the last Saturday strictly before today and the Sunday after
 * it. Both days are always in the past, so the scheduled runs that wrote them have already happened
 * whatever time of day the suite starts. On a Sunday the spec steps back a full week rather than
 * take today, whose run may not have fired yet.
 */
function getRecentWeekend(today: Date = new Date()) {
  const dow = today.getDay(); // 0 = Sunday ... 6 = Saturday
  const backToSaturday = dow === 6 ? 7 : dow === 0 ? 8 : dow + 1;
  const saturday = addDays(today, -backToSaturday);
  return { saturday, sunday: addDays(saturday, 1), friday: addDays(saturday, -1) };
}

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers, open "European Central Bank", click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today, click Save',
  s2: 'Step 2: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currencies',
  s4: 'Step 4: Open EUR and click "Rates"',
  verify: 'Verification: the weekend run wrote a row dated that day, carrying the rate last published before it',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_1.2 - Exchange Rates: weekend run repeats last published rate', () => {
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

  test.skip('CRM-11857_1.2: Running the currency rate update on a weekend adds a rate dated that day, repeating the last published rate [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);
    const cronPage = new ScheduledActionPageMig(page);

    const now = new Date();
    const TODAY_TEXT = asDateField(now);
    const YESTERDAY_TEXT = asDateField(addDays(now, -1));
    const dayName = getDayName(now);
    // The weekend the scheduled runs already wrote - read back instead of waiting for a Saturday.
    const weekend = getRecentWeekend(now);
    const WEEKEND_SATURDAY = asListDate(weekend.saturday);
    const WEEKEND_SUNDAY = asListDate(weekend.sunday);
    const WEEKEND_FRIDAY = asListDate(weekend.friday);

    let providerBefore: ProviderConfig | null = null;
    let datesAfterStep1: ProviderConfig | null = null;
    let ranManually = false;
    let datesAfter = new Map<string, string>();
    /** How many rows each covered currency carries for the weekend Saturday. */
    const saturdayRowsPerCurrency = new Map<string, number>();
    let saturdayRate = '';
    let sundayRate = '';
    let fridayRate = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      console.log(`  Today      : ${TODAY_TEXT} (${dayName})`);
      console.log(`  Yesterday  : ${YESTERDAY_TEXT}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
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

        console.log(`  - Setting Last successful update = ${YESTERDAY_TEXT}`);
        console.log(`  - Setting Next scheduled update  = ${TODAY_TEXT}`);
        const saved = await providerPage.setProviderDates({
          lastSuccessfulRun: YESTERDAY_TEXT,
          nextRun: TODAY_TEXT,
        });
        expect(saved, 'The provider dates should have been saved').toBe(true);

        datesAfterStep1 = await providerPage.readProviderFields();
        console.log(`  - Read back Last successful update : ${datesAfterStep1.lastSuccessfulRun}`);
        console.log(`  - Read back Next scheduled update  : ${datesAfterStep1.nextRun}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - provider made due for today').catch(() => {});
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
        console.log(`  - The weekend under test (most recent COMPLETE weekend):`);
        console.log(`      Friday   : ${WEEKEND_FRIDAY}`);
        console.log(`      Saturday : ${WEEKEND_SATURDAY}`);
        console.log(`      Sunday   : ${WEEKEND_SUNDAY}`);

        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        const dates = await currencyPage.getColumnValues('Date');
        expect(
          dates.length,
          `The Currencies list returned ${codes.length} code(s) but ${dates.length} Date value(s) - the two columns must line up`
        ).toBe(codes.length);
        codes.forEach((code, i) => datesAfter.set(code, dates[i]));
        console.log('  - Date column (newest rate date per currency):');
        datesAfter.forEach((date, code) => console.log(`      ${code.padEnd(4)} ${date || '(empty)'}`));

        // The list's Date column only ever shows the NEWEST rate date, so "a row exists for the
        // weekend Saturday" is read from each currency's own rate history instead - the same fact,
        // readable on any day of the week.
        console.log(`  - Rows dated ${WEEKEND_SATURDAY} in each covered currency's rate history:`);
        for (const code of COVERED_CURRENCIES) {
          await currencyPage.openRatesForCurrency(code);
          const count = await currencyPage.countRateRowsForDate(WEEKEND_SATURDAY);
          saturdayRowsPerCurrency.set(code, count);
          console.log(`      ${code.padEnd(4)} ${count} row(s)`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - weekend rows per currency').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        await currencyPage.openCurrenciesList();
        await currencyPage.openRatesForCurrency('EUR');
        const rateRows = await currencyPage.getRateRows();
        const sat = rateRows.find((r) => r.date === WEEKEND_SATURDAY);
        const sun = rateRows.find((r) => r.date === WEEKEND_SUNDAY);
        const fri = rateRows.find((r) => r.date === WEEKEND_FRIDAY);
        saturdayRate = sat ? sat.rate.toFixed(6) : '';
        sundayRate = sun ? sun.rate.toFixed(6) : '';
        fridayRate = fri ? fri.rate.toFixed(6) : '';
        console.log(`  - EUR ${WEEKEND_FRIDAY} (Friday)   : ${fridayRate || '(no row)'}`);
        console.log(`  - EUR ${WEEKEND_SATURDAY} (Saturday) : ${saturdayRate || '(no row)'}`);
        console.log(`  - EUR ${WEEKEND_SUNDAY} (Sunday)   : ${sundayRate || '(no row)'}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR rate history').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = datesAfterStep1 as ProviderConfig;

        const v1 = c1.lastSuccessfulRun === YESTERDAY_TEXT && c1.nextRun === TODAY_TEXT;
        const v2 = ranManually;
        const currenciesWithSaturdayRow = COVERED_CURRENCIES.filter((code) => saturdayRowsPerCurrency.get(code) === 1);
        const v3 = currenciesWithSaturdayRow.length === COVERED_CURRENCIES.length;
        const v4 = saturdayRate !== '' && sundayRate !== '' && saturdayRate === sundayRate;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1 setup guard, provider made due for today:');
        console.log(`     Expected : Last successful update = ${YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT}`);
        console.log(`     Actual   : Last successful update = ${c1.lastSuccessfulRun}, Next scheduled update = ${c1.nextRun}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2 setup guard, the cron was triggered:');
        console.log(`     Expected : "RUN MANUALLY" clicked = true`);
        console.log(`     Actual   : ${ranManually}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);

        console.log(`  Verify #3 - Step 3, every covered currency carries exactly one row dated the weekend Saturday:`);
        console.log(`     Expected : {${COVERED_CURRENCIES.join(', ')}} each with 1 row dated ${WEEKEND_SATURDAY}`);
        console.log(`     Actual   : ${COVERED_CURRENCIES.map((c) => `${c}=${saturdayRowsPerCurrency.get(c) ?? 'not read'}`).join(' | ')}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, the Saturday and Sunday rows carry one and the same rate:');
        console.log(`     Expected : ${WEEKEND_SATURDAY} rate = ${WEEKEND_SUNDAY} rate - per CRM-13459 both weekend days take "the latest rate published before that day", which is Friday's publication. The TC's "equals the Rate of the row below it" compares Saturday with the FRIDAY ROW and is the pre-fix wording.`);
        console.log(`     Actual   : Friday ${WEEKEND_FRIDAY} = ${fridayRate || '(no row)'} | Saturday = ${saturdayRate || '(no row)'} | Sunday = ${sundayRate || '(no row)'}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 ? 'PASS' : 'FAIL'} - the weekend run wrote a row dated that day, carrying the rate last published before it`);

        let __verifyPassed = false;
        try {
          expect(c1.lastSuccessfulRun, 'setup guard - Last successful update after step 1').toBe(YESTERDAY_TEXT);
          expect(c1.nextRun, 'setup guard - Next scheduled update after step 1').toBe(TODAY_TEXT);
          expect(ranManually, 'setup guard - "RUN MANUALLY" was clicked on the OCA cron').toBe(true);
          expect(
            currenciesWithSaturdayRow,
            `Every covered currency must carry exactly one rate dated ${WEEKEND_SATURDAY}. Got ${COVERED_CURRENCIES.map((c) => `${c}=${saturdayRowsPerCurrency.get(c) ?? 'not read'}`).join(', ')}`
          ).toEqual(COVERED_CURRENCIES);
          expect(saturdayRate, `EUR must carry a row dated Saturday ${WEEKEND_SATURDAY}`).not.toBe('');
          expect(sundayRate, `EUR must carry a row dated Sunday ${WEEKEND_SUNDAY}`).not.toBe('');
          expect(
            sundayRate,
            `Sunday ${WEEKEND_SUNDAY} must carry the same rate as Saturday ${WEEKEND_SATURDAY} (${saturdayRate}) - nothing is published at the weekend, so both days take the same last published value`
          ).toBe(saturdayRate);
          __verifyPassed = v1 && v2 && v3 && v4;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_1.2 - Weekend rate repeat',
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
