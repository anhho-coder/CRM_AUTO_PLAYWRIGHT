import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_2.3: UAH migrated as a manual currency
 * ===========================================================================
 *  Test Case ID    : CRM-11857_2.3
 *  Jira            : CRM-13391
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13391 updated 2026-10-08T11:22:45+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Assert that UAH has been migrated from production to crm-mig with its historical rate dated
 *    2026-06-04 with Rate = 44.300000. Verify the provider does not include UAH (by design - UAH
 *    rates are manual). This test asserts migrated data only - it creates no data.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_2\.3:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13391 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank exists for
 *      NAKIVO, Inc.
 *    - On production, UAH is active and has a rate dated 2026-06-04 with Rate = 44.300000.
 *    - The crm-mig data has been migrated from production.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: UAH is listed
 *
 *  2. Open UAH and click "Rates"
 *     Expected Result: A row dated 2026-06-04 with Rate = 44.300000 is listed
 *
 *  3. Open Invoicing > Configuration > Accounting > Currency Rates Providers and open
 *     "European Central Bank"
 *     Expected Result: Currencies does not include UAH
 *
 * ---------------------------------------------------------------------------
 *  Migrated data assertion (no creates, no deletes)
 * ---------------------------------------------------------------------------
 *
 *  This spec asserts migrated data only. It creates no new records and deletes nothing: the
 *  assertions are purely read-only verification that the migration preserved the expected
 *  historical rate for UAH.
 * ===========================================================================
 */

const PROVIDER_SERVICE = 'European Central Bank';
const CURRENCY_CODE = 'UAH';
const EXPECTED_RATE = 44.300000;
const EXPECTED_DATE = '2026-06-04';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies',
  s2: 'Step 2: Open UAH and click "Rates"',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currency Rates Providers and open "European Central Bank"',
  verify: 'Verification: UAH is migrated with its 44.3 rate of 4 June 2026, and the provider excludes it',
} as const;

test.describe('CRM-11857_2.3 - Exchange Rates: Migrating to crm-mig carries UAH over from production with its 44.3 rate of 4 June 2026', () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - done').catch(() => {});
  });

  test('CRM-11857_2.3: Migrating to crm-mig carries UAH over from production with its 44.3 rate of 4 June 2026', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    let uahIsListed = false;
    let migratedRateFound = false;
    let migratedRateDate = '';
    let migratedRateValue = 0;
    let providerHasUAH = false;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`  Assertion : UAH is migrated with Rate = ${EXPECTED_RATE} dated ${EXPECTED_DATE}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await currencyPage.openCurrenciesList();
        const codes = await currencyPage.getListedCurrencyCodes();
        uahIsListed = codes.includes(CURRENCY_CODE);
        console.log(`  - Currencies listed : ${codes.join(', ')}`);
        console.log(`  - UAH is listed     : ${uahIsListed}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Currencies list').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const opened = (await currencyPage.openRatesForCurrency(CURRENCY_CODE)) !== '';
        expect(opened, `The rate history for ${CURRENCY_CODE} should open`).toBe(true);

        const rates = await currencyPage.getRateRows();
        console.log(`  - ${CURRENCY_CODE} has ${rates.length} rate row(s)`);

        // Look for the specific migrated rate
        const targetRate = rates.find((r) => r.date === EXPECTED_DATE);
        if (targetRate) {
          migratedRateFound = true;
          // `rawDate` is the date as the list RENDERS it (MM/DD/YYYY on this build); the assertion
          // below compares against the ISO EXPECTED_DATE, so keep the normalised form here. Storing
          // rawDate made the case fail on a row it had just found correctly (measured 2026-10-13).
          migratedRateDate = targetRate.date;
          console.log(`  - Rendered as: ${targetRate.rawDate}`);
          migratedRateValue = targetRate.rate;
          console.log(`  - Found migrated rate: Date = ${migratedRateDate}, Rate = ${migratedRateValue}`);
        } else {
          console.log(`  - No rate found dated ${EXPECTED_DATE}`);
          if (rates.length > 0) {
            console.log(`  - Available dates: ${rates.map((r) => r.rawDate).join(', ')}`);
          }
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - UAH rates list').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);

        const config = await providerPage.readProviderFields();
        providerHasUAH = (config.currencies ?? '').includes(CURRENCY_CODE);
        console.log(`  - Source Service : ${config.service}`);
        console.log(`  - Currencies     : ${config.currencies}`);
        console.log(`  - UAH present    : ${providerHasUAH}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - provider form').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        const v1 = uahIsListed;
        const v2 = migratedRateFound;
        const v3 = migratedRateDate === EXPECTED_DATE;
        const v4 = Math.abs(migratedRateValue - EXPECTED_RATE) < 0.000001;
        const v5 = !providerHasUAH;

        console.log('==================== VERIFY ====================');
        console.log(`  Verify #1 - Step 1, UAH is listed on the Currencies list:`);
        console.log(`     Expected : true`);
        console.log(`     Actual   : ${v1}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #2 - Step 2, the migrated rate row exists:`);
        console.log(`     Expected : true (a row dated ${EXPECTED_DATE} with Rate = ${EXPECTED_RATE})`);
        console.log(`     Actual   : ${v2}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #3 - Step 2, the migrated rate is dated 2026-06-04:`);
        console.log(`     Expected : ${EXPECTED_DATE}`);
        console.log(`     Actual   : ${migratedRateDate}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #4 - Step 2, the migrated rate is 44.300000:`);
        console.log(`     Expected : ${EXPECTED_RATE}`);
        console.log(`     Actual   : ${migratedRateValue}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log(`  Verify #5 - Step 3, the provider does NOT include UAH (by design):`);
        console.log(`     Expected : false`);
        console.log(`     Actual   : ${providerHasUAH}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 ? 'PASS' : 'FAIL'} - UAH is migrated with its historical rate and is manually maintained`);

        let __verifyPassed = false;
        try {
          expect(uahIsListed, 'Step 1 - UAH should be listed on the Currencies list').toBe(true);
          expect(migratedRateFound, 'Step 2 - A rate dated 2026-06-04 should be found in UAH history').toBe(true);
          expect(migratedRateDate, 'Step 2 - The migrated rate should be dated 2026-06-04').toBe(EXPECTED_DATE);
          expect(migratedRateValue, 'Step 2 - The migrated rate should be 44.300000').toBeCloseTo(EXPECTED_RATE, 5);
          expect(providerHasUAH, 'Step 3 - The provider should NOT include UAH (UAH is manually maintained)').toBe(false);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_2.3 - UAH migrated with historical rate',
            passed: __verifyPassed,
            highlight: ['table.o_list_view'],
          }).catch(() => {});
        }
      });
    } finally {
      // No teardown needed - this spec asserts migrated data only and does not create anything.
    }
  });
});
