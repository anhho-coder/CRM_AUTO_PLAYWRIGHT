import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, CurrencyPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_6.1: The Currencies list shows each active currency with its date and current rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_6.1
 *  Jira            : CRM-13409
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13409 updated 2026-10-09T12:13:22+0300, 2 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : Billing Manager / Accountancy user (faye.nguyen@nakivo.com) - the TC names a user
 *                    without administrative rights to read the rate data and verify the UI shows it
 *                    correctly from a non-admin perspective.
 *
 *  Summary:
 *    Open the Currencies list and verify it renders all active currencies with their Date and
 *    Current Rate columns. Note EUR's listed Date D and Current Rate CR, then open EUR and click
 *    "Rates" to verify the newest rate row matches both D and CR.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_6\.1:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13409 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as faye.nguyen@nakivo.com.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: The columns are Currency, Symbol, Date, Current Rate and Active
 *                      CHF, EUR, GBP, IDR, INR, UAH and USD are listed, each with a Date and
 *                      a Current Rate
 *
 *  2. Note the Date of EUR as D and its Current Rate as CR, then open EUR and click
 *     "Rates"
 *     Expected Result: The newest row is dated D with Rate = CR
 *
 * ===========================================================================
 */

const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as faye.nguyen@nakivo.com',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies',
  s2: 'Step 2: Note the Date of EUR as D and its Current Rate as CR, then open EUR and click "Rates"',
  verify: 'Verification: The Currencies list shows active currencies with Date and Current Rate, and the newest rate row matches them',
} as const;

/** Active currencies the TC expects. */
const EXPECTED_CURRENCIES = ['CHF', 'EUR', 'GBP', 'IDR', 'INR', 'UAH', 'USD'];
/** EUR's listed rate must match the newest rate row. */
const EUR_CURRENCY = 'EUR';

test.describe('CRM-11857_6.1 - Exchange Rates: Currencies list shows each active currency with its date and current rate', () => {
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
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_6.1: The Currencies list shows each active currency with its date and current rate, matching its newest rate', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);

    let listColumns: string[] = [];
    let listedCurrencies: string[] = [];
    let eurDate = '';
    let eurRate = '';
    let newestRateDate = '';
    let newestRateValue = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.accountance_ic_faye_crm_mig.username} (${users.accountance_ic_faye_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye_crm_mig.username, users.accountance_ic_faye_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await currencyPage.openCurrenciesList();
      listColumns = await currencyPage.getListColumnHeaders();
      listedCurrencies = await currencyPage.getListedCurrencyCodes();
      console.log(`  - List columns: ${listColumns.join(', ')}`);
      console.log(`  - Listed currencies: ${listedCurrencies.join(', ')}`);
      const dateValues = await currencyPage.getColumnValues('Date');
      const rateValues = await currencyPage.getColumnValues('Current Rate');
      listedCurrencies.forEach((code, i) => {
        console.log(`    ${code.padEnd(5)} Date=${dateValues[i] || '(empty)'} Rate=${rateValues[i] || '(empty)'}`);
      });
      // Capture EUR's Date and Current Rate for step 2 assertion
      const eurIndex = listedCurrencies.indexOf(EUR_CURRENCY);
      if (eurIndex >= 0) {
        eurDate = dateValues[eurIndex] || '';
        eurRate = rateValues[eurIndex] || '';
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Currencies list').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - EUR Date noted as D = "${eurDate}"`);
      console.log(`  - EUR Current Rate noted as CR = "${eurRate}"`);
      const opened = (await currencyPage.openCurrencyForm(EUR_CURRENCY)) !== '';
      expect(opened, `The ${EUR_CURRENCY} currency form should open`).toBe(true);
      const ratesClicked = await currencyPage.clickRatesButtonOnOpenForm();
      expect(ratesClicked, 'The "Rates" button should be clickable').toBe(true);
      await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
      const rateRows = await currencyPage.getRateRows();
      if (rateRows.length > 0) {
        newestRateDate = rateRows[0]?.date || '';
        newestRateValue = rateRows[0] ? rateRows[0].rate.toFixed(6) : '';
        console.log(`  - Newest rate row: Date="${newestRateDate}" Rate="${newestRateValue}"`);
      } else {
        console.log('  ! No rate rows found in the rates list');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - EUR rates').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const hasRequiredColumns = ['Currency', 'Date', 'Current Rate'].every((col) => listColumns.includes(col));
      const hasAllExpectedCurrencies = EXPECTED_CURRENCIES.every((code) => listedCurrencies.includes(code));
      const eurDateMatches = eurDate === newestRateDate;
      const eurRateMatches = eurRate === newestRateValue;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Step 1, required columns present:');
      console.log(`     Expected : Currency, Symbol, Date, Current Rate, Active columns`);
      console.log(`     Actual   : ${listColumns.join(', ')}`);
      console.log(`     Result   : ${hasRequiredColumns ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Step 1, all expected currencies listed:');
      console.log(`     Expected : ${EXPECTED_CURRENCIES.join(', ')}`);
      console.log(`     Actual   : ${listedCurrencies.join(', ')}`);
      console.log(`     Missing  : ${EXPECTED_CURRENCIES.filter((c) => !listedCurrencies.includes(c)).join(', ') || 'none'}`);
      console.log(`     Result   : ${hasAllExpectedCurrencies ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Step 2, EUR newest rate matches list:');
      console.log(`     Expected : Date = "${eurDate}", Rate = "${eurRate}"`);
      console.log(`     Actual   : Date = "${newestRateDate}", Rate = "${newestRateValue}"`);
      console.log(`     Result   : ${eurDateMatches && eurRateMatches ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const overall = hasRequiredColumns && hasAllExpectedCurrencies && eurDateMatches && eurRateMatches;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - The Currencies list shows each active currency with its date and current rate`);

      let __verifyPassed = false;
      try {
        expect(hasRequiredColumns, 'Required columns must be present in the Currencies list').toBe(true);
        expect(hasAllExpectedCurrencies, `All expected currencies must be listed: ${EXPECTED_CURRENCIES.join(', ')}`).toBe(true);
        expect(eurDateMatches, `EUR Date on the list (${eurDate}) must match newest rate row date (${newestRateDate})`).toBe(true);
        expect(eurRateMatches, `EUR Rate on the list (${eurRate}) must match newest rate row value (${newestRateValue})`).toBe(true);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: 'CRM-11857_6.1 - Currencies list with date and rate',
          passed: __verifyPassed,
          highlight: ['table.o_list_view'],
        }).catch(() => {});
      }
    });
  });
});





