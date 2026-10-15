import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_8.5: seven consecutive days, one rate per day
 * ===========================================================================
 *  Test Case ID    : CRM-11857_8.5
 *  Jira            : CRM-13417
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13417 updated 2026-10-12T07:50:29+0300, 3 Xray manual steps
 *
 *  Summary:
 *    After 7 days of scheduled runs, every covered currency has one rate for each of the 7 days.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_8\.5:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Pre-conditions (verbatim from CRM-13417):
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as faye.nguyen@nakivo.com.
 *    - The scheduled action "Currency Rates Update (OCA) daily" is active (checked by an
 *      administrator), and nobody runs it manually during the test.
 *    - Let it run by itself for 7 consecutive days, D1 to D7.
 *
 *  Step 1:
 *    On D7, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies,
 *    open EUR and click "Rates"
 *    Expected: Exactly one row for each date from D1 to D7, no date missing.
 *              Saturday and Sunday repeat Friday's rate.
 *
 *  Step 2:
 *    Go back to the Currencies list and repeat step 1 for CHF, GBP, IDR and INR
 *    Expected: Same as step 1
 *
 *  Step 3:
 *    Go back to the Currencies list, open USD and click "Rates"
 *    Expected: Exactly one row for each date from D1 to D7, each with Rate = 1.000000
 *
 * ---------------------------------------------------------------------------
 *  HOW D1..D7 ARE RESOLVED
 * ---------------------------------------------------------------------------
 *
 *  The TC is written from inside a seven-day observation ("let it run by itself for 7 consecutive
 *  days ... on D7, after the scheduled run"). A single run cannot wait seven days, so the spec reads
 *  back the seven days the scheduled runs have already produced, anchored on the CALENDAR:
 *
 *    D7 = today when EUR already carries a row dated today (the day's run has fired), otherwise
 *         yesterday - which is the only tolerance the TC's own "after the scheduled run" allows.
 *    D1 = D7 - 6 days.
 *
 *  The anchor is deliberately NOT "the newest date present in the data". That would slide the window
 *  backwards whenever rates stop arriving and hand back a green run for a dead provider - the exact
 *  failure CRM-13459 was raised for. Anchoring on today means a day that never arrived shows up as a
 *  missing date, which is what step 1 asks to be checked.
 *
 * ---------------------------------------------------------------------------
 *  THE WEEKEND SENTENCE IN STEP 1 - and what this spec asserts instead
 * ---------------------------------------------------------------------------
 *
 *  Step 1's expected result ends "Saturday and Sunday repeat Friday's rate". Measured on crm-mig,
 *  the weekend rows do NOT carry the Friday ROW's rate:
 *      EUR  2026-10-09 (Fri) = 0.893975
 *      EUR  2026-10-10 (Sat) = 0.892379
 *      EUR  2026-10-11 (Sun) = 0.892379
 *
 *  That wording predates the fix in CRM-13459 (Resolved/Fixed). Khang Nguyen Thai Duy, comment of
 *  2026-10-12 12:53 +0300:
 *
 *    "Each run records the day of the run with the latest rate published BEFORE that day, weekends
 *     included, as Production does."
 *
 *  Under that rule the Friday row holds what was published before Friday, while Saturday and Sunday
 *  both hold what was published ON Friday. So the weekend pair equals each other, not the Friday row.
 *  This spec asserts what the fixed rule guarantees - Saturday and Sunday carry the SAME rate - and
 *  leaves the Friday comparison out rather than asserting a sentence the fix contradicts.
 *
 *  >> ACTION FOR THE TC AUTHOR: CRM-13417 step 1 still reads "Saturday and Sunday repeat Friday's
 *     rate", the same pre-fix wording flagged on CRM-13414. It needs the same correction.
 *
 *  This spec is READ-ONLY on crm-mig. It creates, edits and deletes nothing, so it needs no teardown.
 * ===========================================================================
 */

/** Step 1 names EUR; step 2 adds these four; step 3 takes USD on its own. */
const EUR = 'EUR';
const STEP2_CURRENCIES = ['CHF', 'GBP', 'IDR', 'INR'];
const USD = 'USD';
/** The company currency's rate against itself, as step 3 states it. */
const USD_EXPECTED_RATE = 1;
const WINDOW_DAYS = 7;

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
const dayName = (iso: string): string =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${iso}T00:00:00`).getDay()];

/** Count the rows carrying each date of the window: date -> how many rows the rate list shows. */
function countPerDate(rows: { date: string; rate: number }[], window: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const iso of window) counts.set(iso, 0);
  for (const row of rows) {
    if (counts.has(row.date)) counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
  }
  return counts;
}

const missingOrDuplicated = (counts: Map<string, number>): string[] =>
  [...counts.entries()].filter(([, n]) => n !== 1).map(([iso, n]) => `${iso}=${n}`);

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as faye.nguyen@nakivo.com',
  s1: 'Step 1: On D7, after the scheduled run, open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates"',
  s2: 'Step 2: Go back to the Currencies list and repeat step 1 for CHF, GBP, IDR and INR',
  s3: 'Step 3: Go back to the Currencies list, open USD and click "Rates"',
  verify: 'Verification: one rate per day for each of the 7 days, for every covered currency',
} as const;

test.describe('CRM-11857_8.5 - Exchange Rates: seven consecutive days each carry one rate', () => {
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

  test('CRM-11857_8.5: After 7 days of scheduled runs, every covered currency has one rate for each of the 7 days', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);

    const today = toLocalIso(new Date());
    /** D1..D7, oldest first - filled in once step 1 has established whether today's run has fired. */
    let windowDays: string[] = [];
    let anchorNote = '';

    let eurCounts = new Map<string, number>();
    const otherCounts = new Map<string, Map<string, number>>();
    let usdCounts = new Map<string, number>();
    let usdRatesInWindow: { date: string; rate: number }[] = [];
    /** Every full Saturday+Sunday pair that falls inside the window. */
    let weekendPairs: { saturday: string; sunday: string; satRate: number; sunRate: number }[] = [];

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.accountance_ic_faye_crm_mig.username} (${users.accountance_ic_faye_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye_crm_mig.username, users.accountance_ic_faye_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`  Today (the run date) : ${today} (${dayName(today)})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await currencyPage.openCurrenciesList();
      await currencyPage.openRatesForCurrency(EUR);
      const eurRows = await currencyPage.getRateRows();

      // Anchor D7 on the calendar: today once today's run has written its row, yesterday until then.
      const todaysRunHasFired = eurRows.some((r) => r.date === today);
      const d7 = todaysRunHasFired ? today : toLocalIso(addDays(new Date(), -1));
      anchorNote = todaysRunHasFired
        ? `today ${today} - EUR already carries today's row, so the day's run has fired`
        : `yesterday ${d7} - EUR carries no row dated today ${today}, so today's run has not written yet`;
      const d7Date = new Date(`${d7}T00:00:00`);
      windowDays = Array.from({ length: WINDOW_DAYS }, (_, i) => toLocalIso(addDays(d7Date, i - (WINDOW_DAYS - 1))));

      console.log(`  - D7 anchored on ${anchorNote}`);
      console.log(`  - The window under test, D1 to D7:`);
      windowDays.forEach((iso, i) => console.log(`      D${i + 1}  ${iso} (${dayName(iso)})`));

      eurCounts = countPerDate(eurRows, windowDays);
      console.log(`  - EUR rows per date in the window:`);
      for (const iso of windowDays) {
        const row = eurRows.find((r) => r.date === iso);
        console.log(`      ${iso}  ${eurCounts.get(iso)} row(s)${row ? `  rate=${row.rate}` : ''}`);
      }

      // Collect every full Saturday+Sunday pair inside the window for the weekend check.
      weekendPairs = [];
      for (const iso of windowDays) {
        if (dayName(iso) !== 'Saturday') continue;
        const sunday = toLocalIso(addDays(new Date(`${iso}T00:00:00`), 1));
        if (!windowDays.includes(sunday)) continue;
        const sat = eurRows.find((r) => r.date === iso);
        const sun = eurRows.find((r) => r.date === sunday);
        if (!sat || !sun) continue;
        weekendPairs.push({ saturday: iso, sunday, satRate: sat.rate, sunRate: sun.rate });
      }
      if (weekendPairs.length === 0) {
        console.log('  - No complete Saturday+Sunday pair falls inside the window - the weekend check does not apply');
      } else {
        weekendPairs.forEach((p) =>
          console.log(`  - Weekend pair ${p.saturday} = ${p.satRate} | ${p.sunday} = ${p.sunRate}`)
        );
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR rates over the 7-day window').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const code of STEP2_CURRENCIES) {
        await currencyPage.openCurrenciesList();
        await currencyPage.openRatesForCurrency(code);
        const rows = await currencyPage.getRateRows();
        const counts = countPerDate(rows, windowDays);
        otherCounts.set(code, counts);
        const bad = missingOrDuplicated(counts);
        console.log(`  - ${code.padEnd(4)} ${bad.length === 0 ? 'one row for each of the 7 dates' : `NOT one row per date: ${bad.join(', ')}`}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - CHF, GBP, IDR, INR rates').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await currencyPage.openCurrenciesList();
      await currencyPage.openRatesForCurrency(USD);
      const rows = await currencyPage.getRateRows();
      usdCounts = countPerDate(rows, windowDays);
      usdRatesInWindow = rows.filter((r) => windowDays.includes(r.date));
      console.log(`  - USD rows per date in the window:`);
      for (const iso of windowDays) {
        const row = usdRatesInWindow.find((r) => r.date === iso);
        console.log(`      ${iso}  ${usdCounts.get(iso)} row(s)${row ? `  rate=${row.rate}` : ''}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - USD rates').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log('');
      console.log('==================== VERIFY ====================');
      console.log(`  Window D1..D7 : ${windowDays[0]} to ${windowDays[windowDays.length - 1]} (D7 anchored on ${anchorNote})`);

      const eurBad = missingOrDuplicated(eurCounts);
      console.log('  Verify #1 - Step 1, EUR has exactly one row for each date from D1 to D7:');
      console.log(`     Expected : 1 row on each of ${windowDays.join(', ')}`);
      console.log(`     Actual   : ${eurBad.length === 0 ? 'one row on every date' : `off on ${eurBad.join(', ')}`}`);
      console.log(`     Result   : ${eurBad.length === 0 ? 'PASS' : 'FAIL'}`);

      const weekendOk = weekendPairs.every((p) => p.satRate === p.sunRate);
      console.log('  Verify #2 - Step 1, each weekend pair inside the window carries one and the same rate:');
      console.log(`     Expected : Saturday rate = Sunday rate (per CRM-13459 "the latest rate published before that day"; the TC's "repeat Friday's rate" is the pre-fix wording)`);
      console.log(`     Actual   : ${weekendPairs.length === 0 ? 'no complete weekend in the window - not applicable' : weekendPairs.map((p) => `${p.saturday}=${p.satRate} vs ${p.sunday}=${p.sunRate}`).join(' | ')}`);
      console.log(`     Result   : ${weekendOk ? 'PASS' : 'FAIL'}`);

      const step2Bad = STEP2_CURRENCIES.filter((c) => missingOrDuplicated(otherCounts.get(c) ?? new Map()).length > 0);
      console.log('  Verify #3 - Step 2, CHF, GBP, IDR and INR each have exactly one row per date:');
      console.log(`     Expected : all four currencies, 1 row on each of the 7 dates`);
      console.log(`     Actual   : ${step2Bad.length === 0 ? 'all four complete' : step2Bad.map((c) => `${c}: ${missingOrDuplicated(otherCounts.get(c) ?? new Map()).join(', ')}`).join(' | ')}`);
      console.log(`     Result   : ${step2Bad.length === 0 ? 'PASS' : 'FAIL'}`);

      const usdBad = missingOrDuplicated(usdCounts);
      console.log('  Verify #4 - Step 3, USD has exactly one row for each date from D1 to D7:');
      console.log(`     Expected : 1 row on each of the 7 dates`);
      console.log(`     Actual   : ${usdBad.length === 0 ? 'one row on every date' : `off on ${usdBad.join(', ')}`}`);
      console.log(`     Result   : ${usdBad.length === 0 ? 'PASS' : 'FAIL'}`);

      const usdOffRate = usdRatesInWindow.filter((r) => Math.abs(r.rate - USD_EXPECTED_RATE) > 1e-6);
      console.log('  Verify #5 - Step 3, every USD row in the window reads Rate = 1.000000:');
      console.log(`     Expected : 1.000000 on each row`);
      console.log(`     Actual   : ${usdRatesInWindow.length} row(s) read${usdOffRate.length === 0 ? ', all 1.000000' : `, off on ${usdOffRate.map((r) => `${r.date}=${r.rate}`).join(', ')}`}`);
      console.log(`     Result   : ${usdOffRate.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const overall = eurBad.length === 0 && weekendOk && step2Bad.length === 0 && usdBad.length === 0 && usdOffRate.length === 0;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - one rate per day for each of the 7 days`);

      let __verifyPassed = false;
      try {
        expect(eurBad, `EUR must carry exactly one row on each of ${windowDays.join(', ')}. Off on: ${eurBad.join(', ')}`).toEqual([]);
        for (const pair of weekendPairs) {
          expect(
            pair.sunRate,
            `Sunday ${pair.sunday} must carry the same rate as Saturday ${pair.saturday} (${pair.satRate}) - nothing is published at the weekend, so both days take the same last published value`
          ).toBe(pair.satRate);
        }
        for (const code of STEP2_CURRENCIES) {
          const bad = missingOrDuplicated(otherCounts.get(code) ?? new Map());
          expect(bad, `${code} must carry exactly one row on each of the 7 dates. Off on: ${bad.join(', ')}`).toEqual([]);
        }
        expect(usdBad, `USD must carry exactly one row on each of the 7 dates. Off on: ${usdBad.join(', ')}`).toEqual([]);
        expect(
          usdOffRate.map((r) => `${r.date}=${r.rate}`),
          'Every USD row in the window must read Rate = 1.000000'
        ).toEqual([]);
        __verifyPassed = true;
      } finally {
        // No `highlight`: these five checks span six rate screens, one per currency, and only the last
        // one (USD) is still rendered. Outlining an element here would mark the wrong screen - the
        // burned-in VERIFY lines carry the evidence instead.
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_8.5 - seven days, one rate per day',
          passed: __verifyPassed,
        }).catch(() => {});
      }
    });
  });
});
