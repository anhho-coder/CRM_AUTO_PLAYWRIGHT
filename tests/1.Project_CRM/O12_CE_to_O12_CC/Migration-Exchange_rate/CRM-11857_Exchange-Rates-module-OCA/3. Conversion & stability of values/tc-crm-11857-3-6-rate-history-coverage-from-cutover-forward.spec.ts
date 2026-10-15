import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_3.6: rate coverage validates migrated baseline
 * ===========================================================================
 *  Test Case ID    : CRM-11857_3.6
 *  Jira            : CRM-13397
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13397 updated 2026-10-09T07:02:12+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Read-only validation of the migrated currency baseline. Verify that all 7 active currencies
 *    (USD, EUR, GBP, CHF, IDR, INR, UAH) are listed on the Currencies screen with current rates.
 *    USD carries the standard 1.0 rate (as the company currency), while the others differ from 1.0.
 *    UAH's first rate was migrated from production dated 2026-06-04. Verify that gaps in rate
 *    history (e.g., 2026-06-29 on other currencies) were carried forward as-is from production,
 *    never back-filled.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_3\.6:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13397 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - On production, the first UAH rate is dated 2026-06-04 and no rate exists for
 *      2026-06-29. The crm-mig data has been migrated from production.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: USD, EUR, GBP, CHF, IDR, INR, UAH are listed, each with a Date and a
 *                      Current Rate
 *                      USD Current Rate = 1.000000
 *                      The other six are not 1.000000
 *
 *  2. Open UAH, click "Rates" and sort by Date ascending
 *     Expected Result: The oldest row is dated 2026-06-04
 *
 *  3. Go back to Invoicing > Configuration > Accounting > Currencies, open GBP and click
 *     "Rates"
 *     Expected Result: No row is dated 2026-06-29
 *
 * ===========================================================================
 */

const ACTIVE_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'IDR', 'INR', 'UAH'];
const NON_USD_CURRENCIES = ['EUR', 'GBP', 'CHF', 'IDR', 'INR', 'UAH'];
const USD_RATE = 1.0;
const UAH_FIRST_RATE_DATE = '2026-06-04';
const GAP_DATE = '2026-06-29';
const TEST_CURRENCY_FOR_GAP = 'GBP';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies',
  s2: 'Step 2: Open UAH, click "Rates" and sort by Date ascending',
  s3: 'Step 3: Go back to Invoicing > Configuration > Accounting > Currencies, open GBP and click "Rates"',
  verify: 'Verification: all 7 active currencies present with correct rates, UAH starts at 2026-06-04, gap at 2026-06-29 exists',
} as const;

test.describe('CRM-11857_3.6 - Exchange Rates: every currency in use has a rate for new amounts, historical gaps carried over', () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - complete').catch(() => {});
  });

  test('CRM-11857_3.6: Every currency in use has a rate for new amounts, and historical rate gaps are carried over without back-fill', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);

    let currenciesListed: string[] = [];
    let usdRate = 0;
    let nonUsdRatesNotOne = true;
    let uahFirstDate = '';
    let uahFirstDateMatches = false;
    let gapExistsOnGbp = false;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await currencyPage.openCurrenciesList();
      currenciesListed = await currencyPage.getListedCurrencyCodes();
      console.log(`  - Currencies listed: ${currenciesListed.join(', ')}`);

      // Read current rates for each currency
      const currentRates = new Map<string, number>();
      for (const code of currenciesListed) {
        const rate = parseFloat(await currencyPage.getCurrencyRate(code));
        currentRates.set(code, rate);
        console.log(`    ${code.padEnd(4)}: ${rate}`);
      }

      // Verify USD = 1.0
      usdRate = currentRates.get('USD') || 0;
      console.log(`  - USD Current Rate = 1.000000? : ${usdRate === USD_RATE}`);

      // Verify other currencies != 1.0
      nonUsdRatesNotOne = NON_USD_CURRENCIES.every((code) => {
        const rate = currentRates.get(code) || 0;
        return rate !== USD_RATE;
      });
      console.log(`  - Other currencies all != 1.000000? : ${nonUsdRatesNotOne}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Currencies list').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await currencyPage.openCurrencyForm('UAH');
      await currencyPage.clickRatesButtonOnOpenForm();
      await currencyPage.sortListByColumn('Date', 'asc');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      const rateRows = await currencyPage.getRateRows();
      if (rateRows.length > 0) {
        uahFirstDate = rateRows[0].date;
        uahFirstDateMatches = uahFirstDate === UAH_FIRST_RATE_DATE;
        console.log(`  - Oldest UAH rate: ${rateRows[0].rawDate || uahFirstDate} = ${rateRows[0].rate}`);
        console.log(`  - Matches 2026-06-04? : ${uahFirstDateMatches}`);
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - UAH rate history').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await currencyPage.openCurrenciesList();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await currencyPage.openCurrencyForm(TEST_CURRENCY_FOR_GAP);
      await currencyPage.clickRatesButtonOnOpenForm();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      const rateRows = await currencyPage.getRateRows();
      const gapRowExists = rateRows.some((row) => row.date === GAP_DATE);
      gapExistsOnGbp = !gapRowExists;
      console.log(`  - GBP rate rows: ${rateRows.length}`);
      console.log(`  - No row dated 2026-06-29? : ${gapExistsOnGbp}`);

      if (rateRows.length <= 10) {
        rateRows.forEach((row) => {
          console.log(`      ${row.date}: ${row.rate}`);
        });
      } else {
        const nearby = rateRows.filter((row) => row.date >= '2026-06-27' && row.date <= '2026-07-01');
        if (nearby.length > 0) {
          console.log(`    Rows near 2026-06-29:`);
          nearby.forEach((row) => {
            console.log(`      ${row.date}: ${row.rate}`);
          });
        }
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - GBP rate history').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const allCurrenciesPresent = ACTIVE_CURRENCIES.every((code) => currenciesListed.includes(code));
      const step1Pass = allCurrenciesPresent && usdRate === USD_RATE && nonUsdRatesNotOne;
      const step2Pass = uahFirstDateMatches;
      const step3Pass = gapExistsOnGbp;
      const overallPass = step1Pass && step2Pass && step3Pass;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Step 1: All 7 active currencies listed with correct rates:');
      console.log(`     Expected : {${ACTIVE_CURRENCIES.join(', ')}} all present; USD = 1.0; others != 1.0`);
      console.log(`     Actual   : Found {${currenciesListed.join(', ')}}; USD = ${usdRate}; others != 1.0 = ${nonUsdRatesNotOne}`);
      console.log(`     Result   : ${step1Pass ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Step 2: UAH oldest rate dated 2026-06-04 (migration baseline from production):');
      console.log(`     Expected : First UAH rate row = 2026-06-04`);
      console.log(`     Actual   : ${uahFirstDate}`);
      console.log(`     Result   : ${step2Pass ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Step 3: Historical gap at 2026-06-29 preserved (not back-filled):');
      console.log(`     Expected : No ${TEST_CURRENCY_FOR_GAP} rate row dated 2026-06-29`);
      console.log(`     Actual   : Gap exists = ${gapExistsOnGbp}`);
      console.log(`     Result   : ${step3Pass ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - migrated rate baseline validated`);

      let __verifyPassed = false;
      try {
        expect(allCurrenciesPresent, `All 7 active currencies should be listed: {${ACTIVE_CURRENCIES.join(', ')}}`).toBe(true);
        expect(usdRate, 'USD Current Rate should equal 1.0').toBe(USD_RATE);
        expect(nonUsdRatesNotOne, 'All non-USD currencies should have rates != 1.0').toBe(true);
        expect(uahFirstDateMatches, `UAH oldest rate should be dated ${UAH_FIRST_RATE_DATE}`).toBe(true);
        expect(gapExistsOnGbp, `No ${TEST_CURRENCY_FOR_GAP} rate should exist for ${GAP_DATE} (historical gap preserved)`).toBe(true);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_3.6 - Migrated rate baseline validated',
          passed: __verifyPassed,
          highlight: ['table.o_list_view'],
        }).catch(() => {});
      }
    });
  });
});
