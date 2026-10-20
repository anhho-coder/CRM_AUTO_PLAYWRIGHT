import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, ScheduledActionPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_1.4: Re-run same day keeps edited rate, no 2nd row
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.4
 *  Jira            : CRM-13386
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13386 updated 2026-10-08T11:03:16+0300, 7 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights;
 *                    step 3 needs Settings > Technical > Automation, which only such a user reaches.
 *
 *  Summary:
 *    When the rate update runs on the same day twice, the second run should NOT create a
 *    second rate row for that day. Additionally, if the operator manually edited the rate
 *    between the two runs, the second run should preserve the edited value rather than
 *    overwrite it with the ECB rate.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\\.4:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13386 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for
 *      NAKIVO, Inc.
 *    - Run on a weekday after 16:00 CET.
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
 *  3. Open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"
 *     Expected Result: The newest row is dated today
 *
 *  4. Click the Rate of the row dated today, change it to 1.000000, click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  5. Open the "European Central Bank" provider again, click Edit, set "Last successful
 *     update" = yesterday and "Next scheduled update" = today, click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  6. Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates
 *     Update (OCA) daily" and click "Run Manually"
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  7. Open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"
 *     Expected Result: Exactly one row is dated today
 *                      Its Rate = 1.000000
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTIONS for the TC author (not invented here)
 * ---------------------------------------------------------------------------
 *
 *  Steps 1, 2, 4, 5, 6 carry EMPTY "Expected Results" in Jira. Nothing is stated for them, so
 *  this spec does not invent one: it asserts only that the SET-UP action itself took effect.
 *  Those guards are labelled "setup guard" in the VERIFY block.
 *
 * ---------------------------------------------------------------------------
 *  Data written on crm-mig, and how it is cleaned up
 * ---------------------------------------------------------------------------
 *
 *  - The provider's "Last successful update" / "Next scheduled update" are changed by steps 1
 *    and 5 and by the runs themselves. Teardown puts BOTH back to the values read at the start
 *    of the test.
 *  - The first run writes one EUR rate row for today. This row is edited in step 4 to 1.000000.
 *    The second run does NOT write a second row. These rows are NOT deleted: they are the
 *    ordinary daily rates the scheduled cron writes.
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
const EDITED_RATE = '1.000000';

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
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers, open "European Central Bank", click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today, click Save',
  s2: 'Step 2: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  s4: 'Step 4: Click the Rate of the row dated today, change it to 1.000000, click Save',
  s5: 'Step 5: Open the "European Central Bank" provider again, click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today, click Save',
  s6: 'Step 6: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s7: 'Step 7: Open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  verify: 'Verification: second run on same day creates no second row; edited rate is preserved',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_1.4 - Exchange Rates: re-run same day keeps edited rate, no 2nd row', () => {
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

  test.skip('CRM-11857_1.4: Running the currency rate update again on the same day keeps the edited rate and adds no second row [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);
    const cronPage = new ScheduledActionPageMig(page);

    const now = new Date();
    const TODAY_TEXT = asDateField(now);
    const YESTERDAY_TEXT = asDateField(addDays(now, -1));
    const TODAY_LIST = asListDate(now);

    let providerBefore: ProviderConfig | null = null;
    let datesAfterStep1: ProviderConfig | null = null;
    let ranManuallyFirst = false;
    let rateAfterFirstRun = '';
    let rateEditedToday = false;
    let ranManuallySecond = false;
    let rowCountAfterSecondRun = 0;
    let finalRateValue = '';
    let finalRowsForToday = 0;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      console.log(`  Today      : ${TODAY_TEXT}`);
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
        ranManuallyFirst = await cronPage.clickRunManually();
        console.log(`  - "RUN MANUALLY" clicked (first run) : ${ranManuallyFirst}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - cron run manually (first)').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await currencyPage.openCurrenciesList();
        await currencyPage.openCurrencyForm('EUR');
        await currencyPage.clickRatesButtonOnOpenForm();
        await currencyPage.openRatesForCurrency('EUR');
        const rateRows = await currencyPage.getRateRows();
        if (rateRows.length > 0) {
          rateAfterFirstRun = rateRows[0].rate.toFixed(6);
          console.log(`  - Newest row Date: ${rateRows[0].date}, Rate: ${rateAfterFirstRun}`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - EUR rate history after first run').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log(`  - Editing rate to ${EDITED_RATE}`);
        // `setRateForDate` matches the date cell as the list RENDERS it, while `CurrencyRateRow.date`
        // is normalised to ISO - passing the ISO form matched nothing and the edit silently did not
        // happen (measured on the 2026-10-13 run). Resolve today's row first and hand the method its
        // own `rawDate`.
        const rowsBeforeEdit = await currencyPage.getRateRows();
        const todayRow = rowsBeforeEdit.find((r) => r.date === TODAY_LIST);
        console.log(`  - Today's row as the list renders it: ${todayRow ? todayRow.rawDate : '(not found)'}`);
        rateEditedToday = todayRow
          ? await currencyPage.setRateForDate(todayRow.rawDate, EDITED_RATE)
          : false;
        console.log(`  - Rate edited: ${rateEditedToday}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR rate edited to 1.000000').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        await currencyPage.openCurrenciesList();
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should re-open`).toBe(true);

        console.log(`  - Setting Last successful update = ${YESTERDAY_TEXT}`);
        console.log(`  - Setting Next scheduled update  = ${TODAY_TEXT}`);
        const saved = await providerPage.setProviderDates({
          lastSuccessfulRun: YESTERDAY_TEXT,
          nextRun: TODAY_TEXT,
        });
        expect(saved, 'The provider dates should have been saved again').toBe(true);
        console.log(`  - Provider dates set for second run`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - provider made due again for second run').catch(() => {});
      });

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        const opened = await cronPage.openScheduledAction(CRON_NAME);
        expect(opened, `The scheduled action "${CRON_NAME}" should open`).toBe(true);
        ranManuallySecond = await cronPage.clickRunManually();
        console.log(`  - "RUN MANUALLY" clicked (second run) : ${ranManuallySecond}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - cron run manually (second)').catch(() => {});
      });

      await test.step(STEP.s7, async () => {
        console.log(`\n--- ${STEP.s7} ---`);
        await currencyPage.openCurrenciesList();
        await currencyPage.openCurrencyForm('EUR');
        await currencyPage.clickRatesButtonOnOpenForm();
        await currencyPage.openRatesForCurrency('EUR');
        const rateRows = await currencyPage.getRateRows();
        rowCountAfterSecondRun = rateRows.length;
        const rowsToday = rateRows.filter(r => r.date === TODAY_LIST);
        finalRowsForToday = rowsToday.length;
        if (finalRowsForToday > 0) {
          finalRateValue = rowsToday[0].rate.toFixed(6);
          console.log(`  - Rows for today: ${finalRowsForToday}, newest rate: ${finalRateValue}`);
        }
        console.log(`  - Total EUR rate rows: ${rowCountAfterSecondRun}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - EUR rate history after second run').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = datesAfterStep1 as ProviderConfig;

        const v1 = c1.lastSuccessfulRun === YESTERDAY_TEXT && c1.nextRun === TODAY_TEXT;
        const v2 = ranManuallyFirst;
        const v3 = rateAfterFirstRun !== '';
        const v4 = rateEditedToday;
        const v5 = ranManuallySecond;
        const v6 = finalRowsForToday === 1;
        const v7 = finalRateValue === EDITED_RATE;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1 setup guard, provider made due for first run:');
        console.log(`     Expected : Last successful update = ${YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT}`);
        console.log(`     Actual   : Last successful update = ${c1.lastSuccessfulRun}, Next scheduled update = ${c1.nextRun}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2 setup guard, first run triggered:');
        console.log(`     Expected : "RUN MANUALLY" clicked = true`);
        console.log(`     Actual   : ${ranManuallyFirst}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, first run created a rate row:');
        console.log(`     Expected : EUR rate row exists for today`);
        console.log(`     Actual   : rate = ${rateAfterFirstRun}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, rate was manually edited:');
        console.log(`     Expected : rate edited to ${EDITED_RATE} = true`);
        console.log(`     Actual   : ${rateEditedToday}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Step 6, second run was triggered:');
        console.log(`     Expected : "RUN MANUALLY" clicked = true`);
        console.log(`     Actual   : ${ranManuallySecond}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #6 - Step 7, exactly one row is dated today:');
        console.log(`     Expected : exactly 1 row dated today (no second row added)`);
        console.log(`     Actual   : ${finalRowsForToday} row(s) dated today`);
        console.log(`     Result   : ${v6 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #7 - Step 7, today\'s rate is still the edited value:');
        console.log(`     Expected : Rate = ${EDITED_RATE}`);
        console.log(`     Actual   : Rate = ${finalRateValue}`);
        console.log(`     Result   : ${v7 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 && v6 && v7 ? 'PASS' : 'FAIL'} - second run keeps edited rate and creates no second row`);

        let __verifyPassed = false;
        try {
          expect(c1.lastSuccessfulRun, 'setup guard - Last successful update after step 1').toBe(YESTERDAY_TEXT);
          expect(c1.nextRun, 'setup guard - Next scheduled update after step 1').toBe(TODAY_TEXT);
          expect(ranManuallyFirst, 'setup guard - first "RUN MANUALLY" was clicked').toBe(true);
          expect(rateAfterFirstRun, 'first run created a rate row').not.toBe('');
          expect(rateEditedToday, 'setup guard - rate was edited to 1.000000').toBe(true);
          expect(ranManuallySecond, 'setup guard - second "RUN MANUALLY" was clicked').toBe(true);
          expect(finalRowsForToday, 'exactly one row is dated today').toBe(1);
          expect(finalRateValue, 'edited rate was preserved').toBe(EDITED_RATE);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_1.4 - Same-day re-run preserves edited rate',
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
          console.log('  - Rate rows are left in place on purpose');
        } catch (e) {
          console.log(`  ! Teardown could not complete: ${(e as Error).message}`);
        }
      });
    }
  });
});
