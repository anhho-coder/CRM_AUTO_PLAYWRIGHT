import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, CurrencyRateProviderPageMig, ScheduledActionPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_2.2: OCA cron leaves hand-held rates unchanged
 * ===========================================================================
 *  Test Case ID    : CRM-11857_2.2
 *  Jira            : CRM-13390
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13390 updated 2026-10-08T11:14:15+0300, 6 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Make the provider due for today, run the OCA update cron by hand, and verify the UAH
 *    rate history is untouched while CHF gets its new rate for today (proving the run happened).
 *    Restore the provider dates in teardown so the next scheduled run is not skipped.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_2\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13390 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for
 *      NAKIVO, Inc.
 *    - Run on a weekday after 16:00 CET.
 *    - UAH is active, has at least one rate and has no rate dated today.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies, open UAH, click "Rates"
 *     and note the number of rows as N, and the Date and Rate of the newest row as D1 and
 *     R1
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  2. Open Invoicing > Configuration > Accounting > Currency Rates Providers, open
 *     "European Central Bank", click Edit, set "Last successful update" = yesterday and
 *     "Next scheduled update" = today, click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  3. Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates
 *     Update (OCA) daily" and click "Run Manually"
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  4. Open Invoicing > Configuration > Accounting > Currencies, open UAH and click "Rates"
 *     Expected Result: The list still has N rows
 *                      The newest row shows Date = D1 and Rate = R1
 *                      No row is dated today
 *
 *  5. Go back to Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  6. Open CHF and click "Rates"
 *     Expected Result: The newest row is dated today
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTION for the TC author (not invented here)
 * ---------------------------------------------------------------------------
 *
 *  Manual steps 1, 2, 3 and 5 carry EMPTY "Expected Result" fields in Jira. Nothing is stated for them,
 *  so this spec does not invent expectations: it asserts only that the SET-UP actions took effect:
 *  - Step 1: the baseline UAH row count (N) is captured
 *  - Step 2: the provider dates really are set as typed
 *  - Step 3: the "RUN MANUALLY" button really was clicked
 *  - Step 5: we can navigate back
 *  These guards are labelled "setup guard" in the VERIFY block.
 *
 * ---------------------------------------------------------------------------
 *  Data written on crm-mig, and how it is cleaned up
 * ---------------------------------------------------------------------------
 *
 *  - The provider's "Last successful update" / "Next scheduled update" are changed by step 2 and by
 *    the run itself. Teardown puts BOTH back to the values read at the start of the test, so the
 *    base is left exactly as it was found and the scheduled run is not skipped.
 *  - The run writes one res.currency.rate row per covered currency (CHF, EUR, GBP, IDR, INR, USD)
 *    for today. These rows are NOT deleted: they are the ordinary daily rates the scheduled cron
 *    would have written anyway. UAH gets no new row, by design. No migrated record is touched.
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
const HAND_HELD_CURRENCY = 'UAH';
const SOURCE_CURRENCY = 'CHF';

/** A date as the provider FORM renders and accepts it (MM/DD/YYYY). */
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
/** A date as the Currencies LIST renders it (ISO YYYY-MM-DD). */
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
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open UAH, click "Rates" and note the number of rows as N, and the Date and Rate of the newest row as D1 and R1',
  s2: 'Step 2: Open Invoicing > Configuration > Accounting > Currency Rates Providers, open "European Central Bank", click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today, click Save',
  s3: 'Step 3: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s4: 'Step 4: Open Invoicing > Configuration > Accounting > Currencies, open UAH and click "Rates"',
  s5: 'Step 5: Go back to Invoicing > Configuration > Accounting > Currencies',
  s6: 'Step 6: Open CHF and click "Rates"',
  verify: 'Verification: the run updated CHF rates while leaving UAH untouched',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_2.2 - Exchange Rates: Running the currency rate update leaves the UAH rates unchanged and adds no UAH rate', () => {
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

  test.skip('CRM-11857_2.2: Running the currency rate update leaves the UAH rates unchanged and adds no UAH rate [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);
    const cronPage = new ScheduledActionPageMig(page);

    const now = new Date();
    const TODAY_TEXT = asDateField(now);
    const YESTERDAY_TEXT = asDateField(addDays(now, -1));
    const TOMORROW_TEXT = asDateField(addDays(now, 1));
    const TODAY_LIST = asListDate(now);

    let providerBefore: ProviderConfig | null = null;
    let uahRowsBeforeN = 0;
    let uahNewestDateD1 = '';
    let uahNewestRateR1 = 0;
    let datesAfterStep2: ProviderConfig | null = null;
    let ranManually = false;
    let uahRowsAfter = 0;
    let uahNewestDateAfter = '';
    let uahNewestRateAfter = 0;
    let uahHasTodayRow = false;
    let chfHasTodayRow = false;
    let chfNewestDate = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`  Today      : ${TODAY_TEXT}  (Currencies list prints it as ${TODAY_LIST})`);
      console.log(`  Yesterday  : ${YESTERDAY_TEXT}`);
      console.log(`  Tomorrow   : ${TOMORROW_TEXT}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const opened = (await currencyPage.openRatesForCurrency(HAND_HELD_CURRENCY)) !== '';
        expect(opened, `The rate history for ${HAND_HELD_CURRENCY} should open`).toBe(true);

        const ratesBefore = await currencyPage.getRateRows();
        uahRowsBeforeN = ratesBefore.length;

        if (ratesBefore.length > 0) {
          // The Rates list renders NEWEST FIRST, so the last element is the OLDEST loaded row.
          // Pick the newest by comparing the normalised ISO dates instead of by array position.
          const newest = ratesBefore.reduce((a, b) => (b.date > a.date ? b : a));
          uahNewestDateD1 = newest.rawDate;
          uahNewestRateR1 = newest.rate;
        }

        console.log(`  - ${HAND_HELD_CURRENCY} rate history: N = ${uahRowsBeforeN} rows`);
        console.log(`  - Newest row: D1 = ${uahNewestDateD1}, R1 = ${uahNewestRateR1}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - UAH rates before the run').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);

        providerBefore = await providerPage.readProviderFields();
        console.log(`  - Provider before change:`);
        console.log(`    - Last successful update : ${providerBefore.lastSuccessfulRun}`);
        console.log(`    - Next scheduled update  : ${providerBefore.nextRun}`);

        console.log(`  - Setting provider dates:`);
        console.log(`    - Last successful update = ${YESTERDAY_TEXT}`);
        console.log(`    - Next scheduled update  = ${TODAY_TEXT}`);
        const saved = await providerPage.setProviderDates({
          lastSuccessfulRun: YESTERDAY_TEXT,
          nextRun: TODAY_TEXT,
        });
        expect(saved, 'The provider dates should have been saved').toBe(true);

        datesAfterStep2 = await providerPage.readProviderFields();
        console.log(`  - Read back:`);
        console.log(`    - Last successful update : ${datesAfterStep2.lastSuccessfulRun}`);
        console.log(`    - Next scheduled update  : ${datesAfterStep2.nextRun}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - provider made due for today').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        const opened = await cronPage.openScheduledAction(CRON_NAME);
        expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
        ranManually = await cronPage.clickRunManually();
        console.log(`  - "RUN MANUALLY" clicked : ${ranManually}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - cron run manually').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const opened = (await currencyPage.openRatesForCurrency(HAND_HELD_CURRENCY)) !== '';
        expect(opened, `The rate history for ${HAND_HELD_CURRENCY} should open after the run`).toBe(true);

        const ratesAfter = await currencyPage.getRateRows();
        uahRowsAfter = ratesAfter.length;
        uahHasTodayRow = ratesAfter.some((r) => r.rawDate === TODAY_TEXT);

        if (ratesAfter.length > 0) {
          const newest = ratesAfter.reduce((a, b) => (b.date > a.date ? b : a));
          uahNewestDateAfter = newest.rawDate;
          uahNewestRateAfter = newest.rate;
        }

        console.log(`  - ${HAND_HELD_CURRENCY} rate history after run: ${uahRowsAfter} rows`);
        console.log(`  - Newest row: Date = ${uahNewestDateAfter}, Rate = ${uahNewestRateAfter}`);
        console.log(`  - Has row dated today: ${uahHasTodayRow}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - UAH rates after the run').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        await currencyPage.openCurrenciesList();
        console.log(`  - Navigated back to Currencies list`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Currencies list').catch(() => {});
      });

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        const opened = (await currencyPage.openRatesForCurrency(SOURCE_CURRENCY)) !== '';
        expect(opened, `The rate history for ${SOURCE_CURRENCY} should open`).toBe(true);

        const ratesChf = await currencyPage.getRateRows();
        if (ratesChf.length > 0) {
          // Two traps, both measured on 2026-10-13 against a base that was correct:
          //  - the Rates list renders NEWEST FIRST, so `rows[rows.length - 1]` is the OLDEST row of
          //    the loaded page (it read 06/13/2026 while today's row was right there at the top);
          //  - `date` is normalised to ISO, `rawDate` is what the list renders. Pick the newest by
          //    comparing the ISO dates, and search ALL loaded rows for today rather than testing
          //    one position.
          const newest = ratesChf.reduce((a, b) => (b.date > a.date ? b : a));
          chfNewestDate = newest.rawDate;
          chfHasTodayRow = ratesChf.some((r) => r.date === TODAY_LIST);
        }

        console.log(`  - ${SOURCE_CURRENCY} newest row: Date = ${chfNewestDate}`);
        console.log(`  - Has row dated today: ${chfHasTodayRow}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - CHF rates after the run').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        const v1 = uahRowsBeforeN > 0; // setup guard
        const v2 = datesAfterStep2?.lastSuccessfulRun === YESTERDAY_TEXT && datesAfterStep2?.nextRun === TODAY_TEXT; // setup guard
        const v3 = ranManually; // setup guard
        const v4 = uahRowsAfter === uahRowsBeforeN;
        const v5 = uahNewestDateAfter === uahNewestDateD1;
        const v6 = Math.abs(uahNewestRateAfter - uahNewestRateR1) < 0.000001;
        const v7 = !uahHasTodayRow;
        const v8 = chfHasTodayRow;

        console.log('==================== VERIFY ====================');
        console.log(`  Verify #1 - Step 1 setup guard, N is captured from UAH rates:`);
        console.log(`     Expected : N > 0 (if no rows exist, the test's pre-condition is not met)`);
        console.log(`     Actual   : N = ${uahRowsBeforeN}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #2 - Step 2 setup guard, provider dates are set for today:`);
        console.log(`     Expected : Last successful update = ${YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT}`);
        console.log(`     Actual   : Last successful update = ${datesAfterStep2?.lastSuccessfulRun}, Next scheduled update = ${datesAfterStep2?.nextRun}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #3 - Step 3 setup guard, the cron was run manually:`);
        console.log(`     Expected : "RUN MANUALLY" was clicked = true`);
        console.log(`     Actual   : ${ranManually}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #4 - Step 4, UAH row count is still N:`);
        console.log(`     Expected : ${uahRowsBeforeN}`);
        console.log(`     Actual   : ${uahRowsAfter}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #5 - Step 4, UAH newest row Date = D1:`);
        console.log(`     Expected : ${uahNewestDateD1}`);
        console.log(`     Actual   : ${uahNewestDateAfter}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #6 - Step 4, UAH newest row Rate = R1:`);
        console.log(`     Expected : ${uahNewestRateR1}`);
        console.log(`     Actual   : ${uahNewestRateAfter}`);
        console.log(`     Result   : ${v6 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #7 - Step 4, UAH has NO row dated today:`);
        console.log(`     Expected : false`);
        console.log(`     Actual   : ${uahHasTodayRow}`);
        console.log(`     Result   : ${v7 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #8 - Step 6, CHF has a row dated today (proof the run executed):`);
        console.log(`     Expected : true`);
        console.log(`     Actual   : ${chfHasTodayRow}`);
        console.log(`     Result   : ${v8 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 && v6 && v7 && v8 ? 'PASS' : 'FAIL'} - the run updated source currencies while leaving UAH untouched`);

        let __verifyPassed = false;
        try {
          expect(uahRowsBeforeN, 'setup guard - UAH should have at least one rate row').toBeGreaterThan(0);
          expect(datesAfterStep2?.lastSuccessfulRun, 'setup guard - Last successful update').toBe(YESTERDAY_TEXT);
          expect(datesAfterStep2?.nextRun, 'setup guard - Next scheduled update').toBe(TODAY_TEXT);
          expect(ranManually, 'setup guard - "RUN MANUALLY" was clicked on the OCA cron').toBe(true);
          expect(uahRowsAfter, 'Step 4 - UAH row count should be N').toBe(uahRowsBeforeN);
          expect(uahNewestDateAfter, 'Step 4 - UAH newest row Date should be D1').toBe(uahNewestDateD1);
          expect(uahNewestRateAfter, 'Step 4 - UAH newest row Rate should be R1').toBeCloseTo(uahNewestRateR1, 5);
          expect(uahHasTodayRow, 'Step 4 - UAH should have NO row dated today').toBe(false);
          expect(chfHasTodayRow, 'Step 6 - CHF should have a row dated today (proof the run executed)').toBe(true);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_2.2 - UAH untouched, CHF updated',
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
          // The rate rows this run wrote are deliberately LEFT in place: they are the ordinary daily
          // rates the scheduled cron would have written anyway. No migrated record is touched.
          console.log('  - Rate rows written by the run are left in place on purpose');
        } catch (e) {
          console.log(`  ! Teardown could not complete: ${(e as Error).message}`);
        }
      });
    }
  });
});
