import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, ScheduledActionPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_1.3: Company currency at rate 1
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.3
 *  Jira            : CRM-13385
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13385 updated 2026-10-08T10:26:02+0300, 4 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights;
 *                    step 3 needs Settings > Technical > Automation, which only such a user reaches.
 *
 *  Summary:
 *    The company's base currency (USD) always has an exchange rate of 1.000000 to itself, set by
 *    the system, not the ECB. After a rate update run, verify USD shows today's date and the
 *    rate 1.000000.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\\.3:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13385 (verbatim)
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
 *  3. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: USD shows Date = today and Current Rate = 1.000000
 *
 *  4. Open USD and click "Rates"
 *     Expected Result: The newest row is dated today with Rate = 1.000000
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
 *  - The run writes one USD rate row for today (always 1.000000). This row is NOT deleted: it is
 *    part of the ordinary daily rates the scheduled cron writes.
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
const USD_RATE = '1.000000';

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
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currencies',
  s4: 'Step 4: Open USD and click "Rates"',
  verify: 'Verification: USD shows today\'s date with rate 1.000000 after the run',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_1.3 - Exchange Rates: USD rate is always 1.000000', () => {
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

  test.skip('CRM-11857_1.3: Running the currency rate update adds a USD rate of 1 dated that day [SKIPPED - the OCA scheduled action is absent from this crm-mig build]', async ({ page }, testInfo) => {
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
    let ranManually = false;
    let usdDateInList = '';
    let usdRateInList = '';
    let usdRateInHistory = '';

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
        ranManually = await cronPage.clickRunManually();
        console.log(`  - "RUN MANUALLY" clicked : ${ranManually}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - cron run manually').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        const dates = await currencyPage.getColumnValues('Date');
        const rates = await currencyPage.getColumnValues('Current Rate');
        expect(
          dates.length,
          `The Currencies list returned ${codes.length} code(s) but ${dates.length} Date value(s)`
        ).toBe(codes.length);
        const usdIdx = codes.indexOf('USD');
        if (usdIdx >= 0) {
          usdDateInList = dates[usdIdx];
          usdRateInList = rates[usdIdx];
          console.log(`  - USD Date: ${usdDateInList}, Current Rate: ${usdRateInList}`);
        } else {
          console.log(`  ! USD not found in Currencies list`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Currencies list').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        await currencyPage.openRatesForCurrency('USD');
        const rateRows = await currencyPage.getRateRows();
        if (rateRows.length > 0) {
          usdRateInHistory = rateRows[0].rate.toFixed(6);
          console.log(`  - Newest row Date: ${rateRows[0].date}, Rate: ${usdRateInHistory}`);
        } else {
          console.log(`  ! USD rate history is empty`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - USD rate history').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = datesAfterStep1 as ProviderConfig;

        const v1 = c1.lastSuccessfulRun === YESTERDAY_TEXT && c1.nextRun === TODAY_TEXT;
        const v2 = ranManually;
        const v3 = usdDateInList === TODAY_LIST && usdRateInList === USD_RATE;
        const v4 = usdRateInHistory === USD_RATE;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1 setup guard, provider made due for today:');
        console.log(`     Expected : Last successful update = ${YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT}`);
        console.log(`     Actual   : Last successful update = ${c1.lastSuccessfulRun}, Next scheduled update = ${c1.nextRun}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2 setup guard, the cron was triggered:');
        console.log(`     Expected : "RUN MANUALLY" clicked = true`);
        console.log(`     Actual   : ${ranManually}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, USD in the Currencies list shows today\'s date and rate 1.000000:');
        console.log(`     Expected : USD Date = ${TODAY_LIST}, Current Rate = ${USD_RATE}`);
        console.log(`     Actual   : USD Date = ${usdDateInList}, Current Rate = ${usdRateInList}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, USD rate history newest row has rate 1.000000:');
        console.log(`     Expected : newest row Rate = ${USD_RATE}`);
        console.log(`     Actual   : newest row Rate = ${usdRateInHistory}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 ? 'PASS' : 'FAIL'} - USD rate is always 1.000000`);

        let __verifyPassed = false;
        try {
          expect(c1.lastSuccessfulRun, 'setup guard - Last successful update after step 1').toBe(YESTERDAY_TEXT);
          expect(c1.nextRun, 'setup guard - Next scheduled update after step 1').toBe(TODAY_TEXT);
          expect(ranManually, 'setup guard - "RUN MANUALLY" was clicked on the OCA cron').toBe(true);
          expect(usdDateInList, 'USD Date in Currencies list').toBe(TODAY_LIST);
          expect(usdRateInList, 'USD Current Rate in Currencies list').toBe(USD_RATE);
          expect(usdRateInHistory, 'USD newest rate in rate history').toBe(USD_RATE);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_1.3 - USD rate 1.000000',
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
