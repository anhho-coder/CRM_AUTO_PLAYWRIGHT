import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_8.2: the daily update adds one rate per day
 * ===========================================================================
 *  Test Case ID    : CRM-11857_8.2
 *  Jira            : CRM-13414
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13414 updated 2026-10-12T06:42:20+0300, 6 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : Faye Nguyen (faye.nguyen@nakivo.com) - the account the TC names. She holds
 *                    Accounting & Finance / Billing Manager, which grants READ on
 *                    res.currency.rate.provider (ir.model.access 560, read-only) - enough for
 *                    step 6 and nothing more.
 *
 *  Summary:
 *    Read back the Friday-to-Monday window the scheduled runs already produced: every covered
 *    currency carries exactly one rate for each of the four days, the weekend rows repeat the value
 *    published before them, the Friday row is never rewritten, and the provider advanced to Monday
 *    or later.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_8\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13414 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as faye.nguyen@nakivo.com.
 *    - The scheduled action "Currency Rates Update (OCA) daily" is active and runs by itself once a
 *      day after 16:00 CET (checked by an administrator), and nobody runs it manually during the test.
 *    - Start on a Friday, after that day's scheduled run.
 *
 *  1. On Friday, open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: CHF, EUR, GBP, IDR, INR show Date = Friday
 *
 *  2. Open EUR, click "Rates" and note the Rate of the Friday row as RF
 *     Expected Result: Exactly one row is dated Friday
 *
 *  3. On Saturday, after the scheduled run, open Invoicing > Configuration > Accounting >
 *     Currencies, open EUR and click "Rates"
 *     Expected Result: Exactly one row is dated Saturday, with Rate = RF
 *
 *  4. On Sunday, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies,
 *     open EUR and click "Rates"
 *     Expected Result: Exactly one row is dated Sunday, with Rate = RF
 *
 *  5. On Monday, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies,
 *     open EUR and click "Rates"
 *     Expected Result: Exactly one row is dated Monday
 *                      The Friday row still has Rate RF
 *
 *  6. Open Invoicing > Configuration > Accounting > Currency Rates Providers and open
 *     "European Central Bank"
 *     Expected Result: Last successful update = Monday
 *
 * ---------------------------------------------------------------------------
 *  WHAT CRM-13459 CHANGED - and why steps 3 and 4 no longer assert "Rate = RF"
 * ---------------------------------------------------------------------------
 *
 *  Bug CRM-13459 (Resolved/Fixed 2026-10-12). Khang Nguyen Thai Duy's comment of
 *  2026-10-12 12:53+0300 states the fixed rule:
 *
 *    "Each run records the day of the run with the latest rate published BEFORE that day, weekends
 *     included, as Production does."
 *
 *  Under that rule the Saturday and Sunday rows do NOT carry the Friday ROW's rate. The ECB publishes
 *  at about 16:00 CET, so Friday's row holds the value published before Friday (i.e. Thursday's),
 *  while Saturday and Sunday both hold the value published on Friday. The TC's "Rate = RF" wording
 *  predates the fix and disagrees with it.
 *
 *  Measured on crm-mig on 2026-10-13 for the 2026-10-09..2026-10-12 window - the same figures Khang
 *  reports, read back from res.currency.rate:
 *      EUR  2026-10-09 = 0.893975   <- value published before Friday
 *      EUR  2026-10-10 = 0.892379   <- value published ON Friday, repeated at the weekend
 *      EUR  2026-10-11 = 0.892379
 *      EUR  2026-10-12 = 0.892379
 *
 *  So this spec asserts what the fixed rule actually guarantees, independently of the cron's time of
 *  day:
 *    - exactly one row for each of Friday, Saturday, Sunday and Monday (the weekend is the point);
 *    - Saturday and Sunday carry the SAME rate as each other - the ECB publishes nothing at the
 *      weekend, so "the latest rate published before that day" is by definition one and the same
 *      value for both;
 *    - the Friday row still reads RF at the end of the window (an existing row is never rewritten).
 *  Monday is deliberately NOT asserted equal to the weekend value: whether Monday's run picks up
 *  Monday's own publication depends on the cron firing before or after 16:00 CET, which Khang's fix
 *  explicitly makes irrelevant to correctness. Asserting it would re-introduce the time-of-day
 *  coupling the fix removed.
 *
 *  >> SYNCED 2026-10-13: CRM-13414's Xray steps 3 and 4 were corrected in Jira to match this spec -
 *     step 3 now reads "Exactly one row is dated Saturday / Note its Rate as RSat / Do not compare
 *     RSat with RF ...", step 4 "Exactly one row is dated Sunday / Its Rate equals RSat, the
 *     Saturday rate". The master file's row 55 (tab "Migration - Exchange Rate") carries the same
 *     text. Spec, master and Xray now say one thing.
 *
 * ---------------------------------------------------------------------------
 *  NOT SIMULATED, and how each step is read instead
 * ---------------------------------------------------------------------------
 *
 *  Waiting three calendar days is impossible inside one run, so the spec reads back the window the
 *  scheduled runs already produced. It resolves Friday..Monday as the most recent COMPLETE window -
 *  the last Monday strictly before today, and the Friday three days before it - so the four days are
 *  always in the past and always already written.
 *
 *  Step 1 is read from each currency's rate history rather than from the Date column of the
 *  Currencies list: that column shows only the NEWEST rate date, which is "Friday" solely while the
 *  test is actually run on that Friday. One row dated Friday per currency is the same fact, readable
 *  on any later day. The Currencies list itself is still opened and printed, as the step says.
 *
 *  Step 6 asserts "Last successful update" is ON OR AFTER the window's Monday, not exactly equal to
 *  it: the provider has kept advancing every day since. Equality would only hold if the test ran on
 *  that Monday, and a run on any other day would go red for a provider that is working perfectly.
 *
 *  This spec is READ-ONLY on crm-mig. It creates, edits and deletes nothing, so it needs no teardown.
 * ===========================================================================
 */

const PROVIDER_SERVICE = 'European Central Bank';
/** The currencies step 1 names, in the TC's own order. */
const COVERED_CURRENCIES = ['CHF', 'EUR', 'GBP', 'IDR', 'INR'];
const EUR_CURRENCY = 'EUR';

/** ISO `YYYY-MM-DD` from the date's LOCAL parts - toISOString() would shift the day by the tz offset. */
const toLocalIso = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const addDays = (d: Date, days: number): Date => {
  const out = new Date(d);
  out.setDate(d.getDate() + days);
  return out;
};

/**
 * The most recent COMPLETE Friday-to-Monday window: the last Monday strictly before today, and the
 * three days running up to it. Every returned day is in the past, so the scheduled runs that produced
 * them have already happened whatever time of day the suite starts.
 */
function getRecentWeekWindow(today: Date = new Date()) {
  const daysSinceMonday = (today.getDay() + 6) % 7; // Mon -> 0, Tue -> 1, ... Sun -> 6
  // On a Monday this week's Monday is TODAY, whose run may not have fired yet - step back a full week.
  const monday = addDays(today, -(daysSinceMonday === 0 ? 7 : daysSinceMonday));
  return {
    friday: addDays(monday, -3),
    saturday: addDays(monday, -2),
    sunday: addDays(monday, -1),
    monday,
  };
}

const dayName = (d: Date): string => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as faye.nguyen@nakivo.com',
  s1: 'Step 1: On Friday, open Invoicing > Configuration > Accounting > Currencies - the Friday rows are read from each currency\'s rate history, because the list\'s Date column only shows the newest date',
  s2: 'Step 2: Open EUR, click "Rates" and note the Rate of the Friday row as RF',
  s3: 'Step 3: On Saturday, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  s4: 'Step 4: On Sunday, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  s5: 'Step 5: On Monday, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  s6: 'Step 6: Open Invoicing > Configuration > Accounting > Currency Rates Providers and open "European Central Bank"',
  verify: 'Verification: one rate per day from Friday to Monday, weekend included, with the Friday row untouched',
} as const;

test.describe('CRM-11857_8.2 - Exchange Rates: the daily update adds one rate per day, weekend included', () => {
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

  test('CRM-11857_8.2: The scheduled currency rate update runs by itself every day from Friday to Monday and adds one rate per day, weekend included', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    const window = getRecentWeekWindow();
    const friday = toLocalIso(window.friday);
    const saturday = toLocalIso(window.saturday);
    const sunday = toLocalIso(window.sunday);
    const monday = toLocalIso(window.monday);

    /** Friday row count per covered currency, read in step 1. */
    const fridayRowsPerCurrency = new Map<string, number>();
    let fridayRowCount = 0;
    let saturdayRowCount = 0;
    let sundayRowCount = 0;
    let mondayRowCount = 0;
    let fridayRate = 0;
    let saturdayRate = 0;
    let sundayRate = 0;
    let mondayRate = 0;
    let fridayRateAtEnd = -1;
    let providerAfter: ProviderConfig | null = null;
    let lastSuccessfulIso = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.accountance_ic_faye_crm_mig.username} (${users.accountance_ic_faye_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye_crm_mig.username, users.accountance_ic_faye_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('  The window under test - the most recent COMPLETE Friday-to-Monday:');
      console.log(`    Friday   : ${friday} (${dayName(window.friday)})`);
      console.log(`    Saturday : ${saturday} (${dayName(window.saturday)})`);
      console.log(`    Sunday   : ${sunday} (${dayName(window.sunday)})`);
      console.log(`    Monday   : ${monday} (${dayName(window.monday)})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await currencyPage.openCurrenciesList();
      const codes = await currencyPage.getListedCurrencyCodes();
      const dates = await currencyPage.getColumnValues('Date');
      console.log('  - Currencies list, Date column (newest rate date), one currency per line:');
      codes.forEach((code, i) => console.log(`      ${code.padEnd(4)} ${dates[i] || '(empty)'}`));

      console.log(`  - Rows dated ${friday} in each covered currency's rate history:`);
      for (const code of COVERED_CURRENCIES) {
        await currencyPage.openRatesForCurrency(code);
        const count = await currencyPage.countRateRowsForDate(friday);
        fridayRowsPerCurrency.set(code, count);
        console.log(`      ${code.padEnd(4)} ${count} row(s)`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Friday rows per currency').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await currencyPage.openRatesForCurrency(EUR_CURRENCY);
      const rows = await currencyPage.getRateRows();
      const fridayRows = rows.filter((r) => r.date === friday);
      fridayRowCount = fridayRows.length;
      fridayRate = fridayRows.length > 0 ? fridayRows[0].rate : 0;
      console.log(`  - EUR rows dated ${friday} : ${fridayRowCount}`);
      console.log(`  - RF (the Friday rate)     : ${fridayRate}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - EUR Friday row').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await currencyPage.openCurrenciesList();
      await currencyPage.openRatesForCurrency(EUR_CURRENCY);
      const rows = await currencyPage.getRateRows();
      const saturdayRows = rows.filter((r) => r.date === saturday);
      saturdayRowCount = saturdayRows.length;
      saturdayRate = saturdayRows.length > 0 ? saturdayRows[0].rate : 0;
      console.log(`  - EUR rows dated ${saturday} : ${saturdayRowCount}`);
      console.log(`  - Saturday rate              : ${saturdayRate}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - EUR Saturday row').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await currencyPage.openCurrenciesList();
      await currencyPage.openRatesForCurrency(EUR_CURRENCY);
      const rows = await currencyPage.getRateRows();
      const sundayRows = rows.filter((r) => r.date === sunday);
      sundayRowCount = sundayRows.length;
      sundayRate = sundayRows.length > 0 ? sundayRows[0].rate : 0;
      console.log(`  - EUR rows dated ${sunday} : ${sundayRowCount}`);
      console.log(`  - Sunday rate              : ${sundayRate}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR Sunday row').catch(() => {});
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await currencyPage.openCurrenciesList();
      await currencyPage.openRatesForCurrency(EUR_CURRENCY);
      const rows = await currencyPage.getRateRows();
      const mondayRows = rows.filter((r) => r.date === monday);
      mondayRowCount = mondayRows.length;
      mondayRate = mondayRows.length > 0 ? mondayRows[0].rate : 0;
      const fridayRowsAtEnd = rows.filter((r) => r.date === friday);
      fridayRateAtEnd = fridayRowsAtEnd.length > 0 ? fridayRowsAtEnd[0].rate : -1;
      console.log(`  - EUR rows dated ${monday} : ${mondayRowCount}`);
      console.log(`  - Monday rate              : ${mondayRate}`);
      console.log(`  - Friday row re-read       : ${fridayRateAtEnd}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - EUR Monday row').catch(() => {});
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
      expect(opened, `The "${PROVIDER_SERVICE}" provider form should open for a Billing Manager (read-only access, ir.model.access 560)`).toBe(true);
      providerAfter = await providerPage.readProviderFields();
      // The form renders the date as MM/DD/YYYY - normalise so it can be compared with the ISO window.
      const raw = (providerAfter.lastSuccessfulRun ?? '').trim();
      const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      lastSuccessfulIso = m ? `${m[3]}-${m[1]}-${m[2]}` : raw;
      console.log(`  - Last successful update : ${raw || '(empty)'}`);
      console.log(`  - Normalised to ISO      : ${lastSuccessfulIso || '(empty)'}`);
      console.log(`  - Next scheduled update  : ${providerAfter.nextRun || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - provider last successful update').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const currenciesWithOneFridayRow = COVERED_CURRENCIES.filter((c) => fridayRowsPerCurrency.get(c) === 1);

      const v1 = currenciesWithOneFridayRow.length === COVERED_CURRENCIES.length;
      const v2 = fridayRowCount === 1;
      const v3 = saturdayRowCount === 1;
      const v4 = sundayRowCount === 1 && sundayRate === saturdayRate;
      const v5 = mondayRowCount === 1;
      const v6 = fridayRateAtEnd === fridayRate;
      const v7 = !!lastSuccessfulIso && lastSuccessfulIso >= monday;

      console.log('==================== VERIFY ====================');
      console.log(`  Verify #1 - Step 1, every covered currency has exactly one rate for Friday ${friday}:`);
      console.log(`     Expected : {${COVERED_CURRENCIES.join(', ')}} each with 1 row dated ${friday}`);
      console.log(`     Actual   : ${COVERED_CURRENCIES.map((c) => `${c}=${fridayRowsPerCurrency.get(c) ?? 'not read'}`).join(' | ')}`);
      console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #2 - Step 2, exactly one EUR row is dated Friday ${friday}:`);
      console.log(`     Expected : 1 row, whose rate is RF`);
      console.log(`     Actual   : ${fridayRowCount} row(s), RF = ${fridayRate}`);
      console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #3 - Step 3, exactly one EUR row is dated Saturday ${saturday}:`);
      console.log('     Expected : 1 row (a MISSING weekend row is the CRM-13459 failure mode - the run skipped the day and never came back for it)');
      console.log(`     Actual   : ${saturdayRowCount} row(s), rate = ${saturdayRate}`);
      console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #4 - Step 4, exactly one EUR row is dated Sunday ${sunday}, at the Saturday rate:`);
      console.log(`     Expected : 1 row with rate = ${saturdayRate} (the ECB publishes nothing at the weekend, so per CRM-13459 "the latest rate published before that day" is the SAME value on Saturday and Sunday; a difference means the weekend rows were not derived from one published rate)`);
      console.log(`     Actual   : ${sundayRowCount} row(s), rate = ${sundayRate}`);
      console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #5 - Step 5, exactly one EUR row is dated Monday ${monday}:`);
      console.log('     Expected : 1 row');
      console.log(`     Actual   : ${mondayRowCount} row(s), rate = ${mondayRate}`);
      console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #6 - Step 5, the Friday row still has Rate RF after the window closed:`);
      console.log(`     Expected : ${fridayRate} (a changed value means a later run REWROTE an existing row instead of adding its own day)`);
      console.log(`     Actual   : ${fridayRateAtEnd}`);
      console.log(`     Result   : ${v6 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #7 - Step 6, the provider's Last successful update reached Monday ${monday} or later:`);
      console.log(`     Expected : >= ${monday} (the TC says "= Monday", which holds only when the test is run on that Monday; the provider has kept advancing daily since, so equality would fail a perfectly healthy provider)`);
      console.log(`     Actual   : ${lastSuccessfulIso || '(empty)'}`);
      console.log(`     Result   : ${v7 ? 'PASS' : 'FAIL'}`);
      console.log(`  Observation (not scored) - Monday rate vs the weekend rate : ${mondayRate} vs ${saturdayRate} (whether Monday picked up its OWN publication depends on the cron firing before or after 16:00 CET, which CRM-13459 makes irrelevant to correctness)`);
      console.log('===============================================');
      console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 && v6 && v7 ? 'PASS' : 'FAIL'} - one rate per day from Friday to Monday, weekend included`);

      let __verifyPassed = false;
      try {
        expect(
          currenciesWithOneFridayRow,
          `Every covered currency must carry exactly one rate dated ${friday}. Got ${COVERED_CURRENCIES.map((c) => `${c}=${fridayRowsPerCurrency.get(c) ?? 'not read'}`).join(', ')}`
        ).toEqual(COVERED_CURRENCIES);
        expect(fridayRowCount, `EUR must have exactly one row dated Friday ${friday}`).toBe(1);
        expect(saturdayRowCount, `EUR must have exactly one row dated Saturday ${saturday}`).toBe(1);
        expect(sundayRowCount, `EUR must have exactly one row dated Sunday ${sunday}`).toBe(1);
        expect(
          sundayRate,
          `Sunday ${sunday} must carry the same rate as Saturday ${saturday} (${saturdayRate}) - nothing is published at the weekend, so both days take the same last published value`
        ).toBe(saturdayRate);
        expect(mondayRowCount, `EUR must have exactly one row dated Monday ${monday}`).toBe(1);
        expect(fridayRateAtEnd, `The Friday ${friday} row must still read RF (${fridayRate}) at the end of the window`).toBe(fridayRate);
        expect(lastSuccessfulIso, 'The provider\'s "Last successful update" must have been read').not.toBe('');
        expect(
          lastSuccessfulIso >= monday,
          `The provider's "Last successful update" (${lastSuccessfulIso}) must be on or after Monday ${monday}`
        ).toBe(true);
        __verifyPassed = true;
      } finally {
        // No `highlight`: these seven checks span five screens (each currency's rate history and the
        // provider form), and the last one on screen is the provider. Pointing the outline at the
        // rate list would mark an element that is no longer rendered - the 2026-10-13 run reported it
        // as "highlight matched NOTHING". The burned-in VERIFY lines carry the evidence instead.
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_8.2 - Friday to Monday rate rows',
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
