import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, ScheduledActionPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_1.1: the update fetches the latest ECB rates
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.1
 *  Jira            : CRM-13383
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13383 updated 2026-10-08T10:09:48+0300, 5 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights;
 *                    step 3 needs Settings > Technical > Automation, which only such a user reaches.
 *
 *  Summary:
 *    Make the existing "European Central Bank" provider due for today, run the OCA update cron by
 *    hand, and verify the provider advanced cleanly (no failure message in its chatter) and that the
 *    covered currencies carry today's date.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.1:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13383 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager,
 *      Multi Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for NAKIVO, Inc.
 *    - Run on a weekday after 16:00 CET.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currency Rates Providers and open
 *     "European Central Bank"
 *     Expected Result:
 *       Source Service            = European Central Bank
 *       Company                   = NAKIVO, Inc.
 *       Scheduled update interval = 1 Day(s)
 *       Currencies                = CHF, EUR, GBP, IDR, INR, USD
 *
 *  2. Click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today,
 *     click Save
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION below)
 *
 *  3. Open Settings > Technical > Automation > Scheduled Actions, open
 *     "Currency Rates Update (OCA) daily" and click "Run Manually"
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION below)
 *
 *  4. Re-open the "European Central Bank" provider
 *     Expected Result:
 *       Last successful update  = today
 *       Next scheduled update   = tomorrow
 *       No "Currency Rate Provider Failure" message in the chatter
 *
 *  5. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: CHF, EUR, GBP, IDR, INR show Date = today
 *
 * ---------------------------------------------------------------------------
 *  What CRM-13459 changed, and what it means for this spec
 * ---------------------------------------------------------------------------
 *
 *  Bug CRM-13459 (Resolved/Fixed 2026-10-12) - "A currency rate update run before the ECB
 *  publication records no rate for that day and never retries it". Khang Nguyen Thai Duy's comment
 *  of 2026-10-12 12:53+0300 states the fixed behaviour:
 *
 *    "Each run records the day of the run with the latest rate published before that day, weekends
 *     included, as Production does. The time of the run no longer matters [...]"
 *    "When the source has published nothing, the run posts the reason on the provider and stays due,
 *     instead of marking the day done."
 *
 *  Consequence for this case: the manual TC's pre-condition "Run on a weekday after 16:00 CET" is
 *  no longer a constraint on the RESULT - before the fix an early run wrote no row at all while
 *  still advancing the provider, which is exactly what steps 4 and 5 disagreed about. The spec
 *  therefore runs at whatever time CI starts it and still asserts steps 4 and 5 in full. That is the
 *  point of the check: a red here means the time-of-day dependency is back.
 *
 *  The chatter assertion in step 4 is the second half of the fix - a run that fetched nothing must
 *  now SAY so on the provider. "No failure message" is only meaningful once the chatter is proven to
 *  be on screen, so the spec asserts the panel rendered before it asserts the panel is clean.
 *
 * ---------------------------------------------------------------------------
 *  BLOCKED - step 1's "Company = NAKIVO, Inc." cannot be read on this base
 * ---------------------------------------------------------------------------
 *
 *  The OCA provider form arch wraps company_id in `<group groups="base.group_multi_company">`, and
 *  crm-mig holds exactly ONE company (res.company count = 1, read 2026-10-13). Odoo 12 therefore
 *  strips that node from the rendered form for every user, so the field is not on screen at all -
 *  the 2026-10-13 run read it as an empty string. This is an ENVIRONMENT limit, not a product
 *  defect and not a selector bug: there is nothing to click.
 *
 *  The spec prints the reading as a non-scored observation and does NOT assert it. An empty read
 *  must never be scored as a pass here - "no company shown" and "the wrong company shown" would
 *  look identical.
 *
 *  >> ACTION FOR THE TC AUTHOR: CRM-13383 step 1 expects "Company = NAKIVO, Inc." from a screen that
 *     does not show it on a single-company base. The expectation needs either dropping or moving to
 *     a screen that renders the field.
 *
 * ---------------------------------------------------------------------------
 *  Date formats - the two READERS differ, the two screens do not
 * ---------------------------------------------------------------------------
 *
 *  Both screens render MM/DD/YYYY - the evidence screenshot of the Currencies list shows
 *  "10/13/2026". What differs is the page-object reader:
 *    - `CurrencyPage.getColumnValues('Date')` NORMALISES a date column to ISO before returning it
 *      (CurrencyPage.ts - the `toIsoDate` map on the way out), so the list comes back "2026-10-13";
 *    - `CurrencyRateProviderPageMig.readProviderFields()` returns the field's RAW value, so the
 *      provider form comes back "10/12/2026".
 *  The spec therefore keeps both forms and compares each against the reader it came from. Comparing
 *  the list reading against MM/DD/YYYY matched nothing and reported every currency as un-updated,
 *  which reads exactly like the CRM-13459 failure mode on a base that was in fact correct.
 *
 * ---------------------------------------------------------------------------
 *  OPEN QUESTION for the TC author (not invented here)
 * ---------------------------------------------------------------------------
 *
 *  Manual steps 2 and 3 carry an EMPTY "Expected Result" in Jira. Nothing is stated for them, so
 *  this spec does not invent one: it asserts only that the SET-UP action itself took effect (the
 *  two dates really hold the values step 2 typed; "RUN MANUALLY" really was clicked), which is what
 *  keeps step 4 from passing vacuously. Those two guards are labelled "setup guard" in the VERIFY
 *  block. The missing expected results need filling in CRM-13383 by its author.
 *
 * ---------------------------------------------------------------------------
 *  Data written on crm-mig, and how it is cleaned up
 * ---------------------------------------------------------------------------
 *
 *  - The provider's "Last successful update" / "Next scheduled update" are changed by step 2 and by
 *    the run itself. Teardown puts BOTH back to the values read at the start of the test, so the
 *    base is left exactly as it was found and the scheduled run is not skipped.
 *  - The run writes one res.currency.rate row per covered currency for today. These rows are NOT
 *    deleted: they are the ordinary daily rates the scheduled cron would have written anyway, and
 *    removing them would re-create the very per-day gap CRM-13459 was raised and fixed for. No
 *    migrated record is touched.
 * ===========================================================================
 */

const CRON_NAME = 'Currency Rates Update (OCA) daily';
const PROVIDER_SERVICE = 'European Central Bank';
/** The currencies step 5 names, in the TC's own order. */
const COVERED_CURRENCIES = ['CHF', 'EUR', 'GBP', 'IDR', 'INR'];

/** A date as the provider FORM renders and accepts it (MM/DD/YYYY). */
const asDateField = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};
/** A date as `CurrencyPage.getColumnValues('Date')` RETURNS it: that reader normalises a date column
 *  to ISO, even though the list itself renders MM/DD/YYYY. Built from LOCAL parts, because
 *  toISOString() would shift the day by the host's timezone offset. */
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
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers and open "European Central Bank"',
  s2: 'Step 2: Click Edit, set "Last successful update" = yesterday and "Next scheduled update" = today, click Save',
  s3: 'Step 3: Open Settings > Technical > Automation > Scheduled Actions, open "Currency Rates Update (OCA) daily" and click "Run Manually"',
  s4: 'Step 4: Re-open the "European Central Bank" provider',
  s5: 'Step 5: Open Invoicing > Configuration > Accounting > Currencies',
  verify: 'Verification: the run advanced the provider cleanly and dated the covered currencies today',
  teardown: 'Teardown: restore the provider dates read before the test',
} as const;

test.describe('CRM-11857_1.1 - Exchange Rates: the currency rate update fetches the latest ECB rates', () => {
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

  test('CRM-11857_1.1: Running the currency rate update fetches the latest ECB rates for the covered currencies', async ({ page }, testInfo) => {
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
    /** The same "today", in the ISO form the Currencies list prints. */
    const TODAY_LIST = asListDate(now);

    /** The provider exactly as it was found - restored in teardown. */
    let providerBefore: ProviderConfig | null = null;
    let configStep1: ProviderConfig | null = null;
    let datesAfterStep2: ProviderConfig | null = null;
    let configStep4: ProviderConfig | null = null;
    let ranManually = false;
    let chatterRendered = false;
    let failureMessageInChatter = true;
    const datesAfter = new Map<string, string>();

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`  Today      : ${TODAY_TEXT}  (the list reader normalises it to ${TODAY_LIST})`);
      console.log(`  Yesterday  : ${YESTERDAY_TEXT}`);
      console.log(`  Tomorrow   : ${TOMORROW_TEXT}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open. Its ABSENCE is a finding in its own right - the TC's pre-condition states the provider exists for NAKIVO, Inc.`).toBe(true);

        configStep1 = await providerPage.readProviderFields();
        providerBefore = configStep1;
        console.log(`  - Source Service            : ${configStep1.service}`);
        console.log(`  - Company                   : ${configStep1.company}`);
        console.log(`  - Scheduled update interval : ${configStep1.intervalNumber} ${configStep1.intervalType}`);
        console.log(`  - Currencies                : ${configStep1.currencies}`);
        console.log(`  - Last successful update    : ${configStep1.lastSuccessfulRun}`);
        console.log(`  - Next scheduled update     : ${configStep1.nextRun}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - provider form').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log(`  - Last successful update = ${YESTERDAY_TEXT}`);
        console.log(`  - Next scheduled update  = ${TODAY_TEXT}`);
        const saved = await providerPage.setProviderDates({
          lastSuccessfulRun: YESTERDAY_TEXT,
          nextRun: TODAY_TEXT,
        });
        expect(saved, 'The provider dates should have been saved').toBe(true);

        datesAfterStep2 = await providerPage.readProviderFields();
        console.log(`  - Read back Last successful update : ${datesAfterStep2.lastSuccessfulRun}`);
        console.log(`  - Read back Next scheduled update  : ${datesAfterStep2.nextRun}`);
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
        const reopened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(reopened, `The "${PROVIDER_SERVICE}" provider form should re-open`).toBe(true);

        configStep4 = await providerPage.readProviderFields();
        chatterRendered = await providerPage.isChatterRendered();
        failureMessageInChatter = chatterRendered
          ? await providerPage.isChatterMessageVisible('Currency Rate Provider Failure')
          : true;

        console.log(`  - Last successful update : ${configStep4.lastSuccessfulRun}`);
        console.log(`  - Next scheduled update  : ${configStep4.nextRun}`);
        console.log(`  - Chatter panel rendered : ${chatterRendered}`);
        console.log(`  - "Currency Rate Provider Failure" message present : ${failureMessageInChatter}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - provider after the run').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        const dates = await currencyPage.getColumnValues('Date');
        expect(
          dates.length,
          `The Currencies list returned ${codes.length} code(s) but ${dates.length} Date value(s) - the two columns must line up or every reading below is off by a row`
        ).toBe(codes.length);
        codes.forEach((code, i) => datesAfter.set(code, dates[i]));
        console.log('  - Date column, one currency per line:');
        datesAfter.forEach((date, code) => console.log(`      ${code.padEnd(4)} ${date || '(empty)'}`));
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Currencies list after the run').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = configStep1 as ProviderConfig;
        const c2 = datesAfterStep2 as ProviderConfig;
        const c4 = configStep4 as ProviderConfig;

        const currenciesOnToday = COVERED_CURRENCIES.filter((code) => datesAfter.get(code) === TODAY_LIST);
        const v1 =
          c1.service === PROVIDER_SERVICE &&
          c1.intervalNumber === '1' &&
          (c1.intervalType ?? '').toLowerCase().includes('day') &&
          COVERED_CURRENCIES.concat('USD').every((code) => (c1.currencies ?? '').includes(code));
        const v2 = c2.lastSuccessfulRun === YESTERDAY_TEXT && c2.nextRun === TODAY_TEXT;
        const v3 = ranManually;
        const v4 = c4.lastSuccessfulRun === TODAY_TEXT && c4.nextRun === TOMORROW_TEXT;
        const v5 = chatterRendered && !failureMessageInChatter;
        const v6 = currenciesOnToday.length === COVERED_CURRENCIES.length;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1, the provider is configured as the TC states:');
        console.log(`     Expected : Source Service = ${PROVIDER_SERVICE} | interval = 1 day(s) | Currencies cover ${COVERED_CURRENCIES.concat('USD').join(', ')}`);
        console.log(`     Actual   : Source Service = ${c1.service} | interval = ${c1.intervalNumber} ${c1.intervalType} | Currencies = ${(c1.currencies ?? '').replace(/\s+/g, ', ')}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #1b - Step 1, Company = NAKIVO, Inc.:');
        console.log('     Expected : BLOCKED, not scored - company_id sits in <group groups="base.group_multi_company"> and crm-mig holds ONE company, so Odoo 12 strips the field from the rendered form for every user. An empty read here means "not on screen", never "the right company"');
        console.log(`     Actual   : ${c1.company || '(not rendered)'}`);
        console.log('     Result   : BLOCKED');
        console.log('  Verify #2 - Step 2 setup guard, the provider really is due for today:');
        console.log(`     Expected : Last successful update = ${YESTERDAY_TEXT}, Next scheduled update = ${TODAY_TEXT} (if this did not stick, step 4 below would pass without the run ever being due - a vacuous green)`);
        console.log(`     Actual   : Last successful update = ${c2.lastSuccessfulRun}, Next scheduled update = ${c2.nextRun}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3 setup guard, the update really was triggered:');
        console.log('     Expected : "RUN MANUALLY" clicked on the OCA cron = true (false means the button was absent, so nothing below was produced by a run)');
        console.log(`     Actual   : ${ranManually}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, the provider advanced one day:');
        console.log(`     Expected : Last successful update = ${TODAY_TEXT}, Next scheduled update = ${TOMORROW_TEXT}`);
        console.log(`     Actual   : Last successful update = ${c4.lastSuccessfulRun}, Next scheduled update = ${c4.nextRun}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Step 4, no failure message in the provider chatter:');
        console.log('     Expected : the chatter panel is on screen AND carries no "Currency Rate Provider Failure" message (a chatter that never rendered is NOT a pass - an unrendered panel and a clean one look identical)');
        console.log(`     Actual   : chatter rendered = ${chatterRendered}, failure message present = ${failureMessageInChatter}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #6 - Step 5, the covered currencies are dated today:');
        console.log(`     Expected : {${COVERED_CURRENCIES.join(', ')}} all show Date = ${TODAY_LIST} (a currency left on an older date means the run recorded nothing for it - the CRM-13459 failure mode)`);
        console.log(`     Actual   : {${currenciesOnToday.join(', ')}} show Date = ${TODAY_LIST}`);
        console.log(`     Result   : ${v6 ? 'PASS' : 'FAIL'}`);
        console.log(`  Observation (not scored) - USD Date : ${datesAfter.get('USD') || '(empty)'}`);
        console.log(`  Observation (not scored) - run started at : ${now.toISOString()} (CRM-13459: the time of the run must no longer change the outcome)`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 && v6 ? 'PASS' : 'FAIL'} - the manual update fetched the latest ECB rates for the covered currencies`);

        let __verifyPassed = false;
        try {
          expect(c1.service, 'Source Service').toBe(PROVIDER_SERVICE);
          // "Company = NAKIVO, Inc." is NOT asserted - see the BLOCKED section in the header.
          expect(c1.intervalNumber, 'Scheduled update interval number').toBe('1');
          expect((c1.intervalType ?? '').toLowerCase(), 'Scheduled update interval unit').toContain('day');
          for (const code of COVERED_CURRENCIES.concat('USD')) {
            expect(c1.currencies ?? '', `Currencies should cover ${code}`).toContain(code);
          }
          expect(c2.lastSuccessfulRun, 'setup guard - Last successful update after step 2').toBe(YESTERDAY_TEXT);
          expect(c2.nextRun, 'setup guard - Next scheduled update after step 2').toBe(TODAY_TEXT);
          expect(ranManually, 'setup guard - "RUN MANUALLY" was clicked on the OCA cron').toBe(true);
          expect(c4.lastSuccessfulRun, 'Last successful update after the run').toBe(TODAY_TEXT);
          expect(c4.nextRun, 'Next scheduled update after the run').toBe(TOMORROW_TEXT);
          expect(chatterRendered, 'the provider chatter panel must be on screen before it can be called clean').toBe(true);
          expect(failureMessageInChatter, 'a "Currency Rate Provider Failure" message in the provider chatter').toBe(false);
          expect(
            currenciesOnToday,
            `Every covered currency must show Date = ${TODAY_LIST}. Missing: {${COVERED_CURRENCIES.filter((c) => !currenciesOnToday.includes(c)).join(', ')}}`
          ).toEqual(COVERED_CURRENCIES);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_1.1 - Currencies dated today',
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
          // rates the scheduled cron would have written anyway, and deleting them would re-create the
          // per-day gap CRM-13459 was raised and fixed for.
          console.log('  - Rate rows written by the run are left in place on purpose (see the header)');
        } catch (e) {
          console.log(`  ! Teardown could not complete: ${(e as Error).message}`);
        }
      });
    }
  });
});
