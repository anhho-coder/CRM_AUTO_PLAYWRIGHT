import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_5.4: A Billing Manager can maintain currency rates but cannot change the rate provider, as on production
 * ===========================================================================
 *  Test Case ID    : CRM-11857_5.4
 *  Jira            : CRM-13408
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13408 updated 2026-10-09T12:02:13+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : faye.nguyen@nakivo.com (Billing Manager, accountance_ic_faye_crm_mig) -
 *                    NO Administration / Settings rights. This is a PERMISSION test. Running
 *                    as admin would make it pass vacuously.
 *
 *  Summary:
 *    Verify that a Billing Manager can maintain currency rates (has "Create" button on
 *    Currencies and Rates lists) but cannot change the provider configuration (no
 *    "Create" and no "Edit" button on the provider form). Access mirrors production.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_5\.4:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13408 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as faye.nguyen@nakivo.com (Billing
 *      Manager, without Administration / Settings rights).
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies
 *     Expected Result: The Currencies list opens with the "Create" button
 *
 *  2. Open EUR and click "Rates"
 *     Expected Result: The Rates list shows a "Create" button
 *
 *  3. Open Invoicing > Configuration > Accounting > Currency Rates Providers and open
 *     "European Central Bank"
 *     Expected Result: The provider opens with no "Create" and no "Edit" button
 *
 * ===========================================================================
 */

const TEST_CURRENCY = 'EUR';
const PROVIDER_SERVICE = 'European Central Bank';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as faye.nguyen@nakivo.com (Billing Manager, no admin/settings rights)',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies',
  s2: 'Step 2: Open EUR and click "Rates"',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currency Rates Providers and open "European Central Bank"',
  verify: 'Verification: Billing Manager can maintain rates but not provider configuration',
} as const;

test.describe('CRM-11857_5.4 - Exchange Rates: Billing Manager cannot access provider config', () => {
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

  test('CRM-11857_5.4: A Billing Manager can maintain currency rates but cannot change the rate provider, as on production', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    let currenciesListHasCreateButton = false;
    let ratesListHasCreateButton = false;
    let providerFormHasCreateButton = false;
    let providerFormHasEditButton = false;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.accountance_ic_faye_crm_mig.username} (${users.accountance_ic_faye_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye_crm_mig.username, users.accountance_ic_faye_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await currencyPage.openCurrenciesList();
        // Check if Create button is present on the Currencies list
        currenciesListHasCreateButton = await currencyPage.hasCreateButtonOnList();
        console.log(`  - Currencies list opened`);
        console.log(`  - "Create" button visible: ${currenciesListHasCreateButton}`);
        expect(currenciesListHasCreateButton, 'Billing Manager should have "Create" button on Currencies list').toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - currencies list').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const opened = (await currencyPage.openCurrencyForm(TEST_CURRENCY)) !== '';
        expect(opened, `The ${TEST_CURRENCY} currency form should open`).toBe(true);
        console.log(`  - ${TEST_CURRENCY} currency form opened`);

        // Click Rates button to see rate history
        await currencyPage.clickRatesButtonOnOpenForm();
        console.log(`  - "Rates" button clicked`);

        // Check if Create button is present on the Rates list
        ratesListHasCreateButton = await currencyPage.hasCreateButtonOnList();
        console.log(`  - Rates list for ${TEST_CURRENCY} opened`);
        console.log(`  - "Create" button visible: ${ratesListHasCreateButton}`);
        expect(ratesListHasCreateButton, 'Billing Manager should have "Create" button on Rates list').toBe(true);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - rates list').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await providerPage.openProvidersList();
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);
        console.log(`  - "${PROVIDER_SERVICE}" provider form opened`);

        // Check if Create and Edit buttons are absent
        providerFormHasCreateButton = await currencyPage.hasCreateButtonOnList();
        providerFormHasEditButton = await currencyPage.hasEditButtonOnForm();

        console.log(`  - "Create" button visible: ${providerFormHasCreateButton}`);
        console.log(`  - "Edit" button visible: ${providerFormHasEditButton}`);
        expect(providerFormHasCreateButton, 'Billing Manager should NOT have "Create" button on provider form').toBe(false);
        expect(providerFormHasEditButton, 'Billing Manager should NOT have "Edit" button on provider form').toBe(false);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - provider form').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const v1 = currenciesListHasCreateButton;
        const v2 = ratesListHasCreateButton;
        const v3 = !providerFormHasCreateButton && !providerFormHasEditButton;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1, Currencies list has "Create" button:');
        console.log(`     Expected : "Create" button visible = true`);
        console.log(`     Actual   : ${currenciesListHasCreateButton}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2, Rates list has "Create" button:');
        console.log(`     Expected : "Create" button visible = true`);
        console.log(`     Actual   : ${ratesListHasCreateButton}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, Provider form has no "Create" and no "Edit" button:');
        console.log(`     Expected : "Create" = false AND "Edit" = false`);
        console.log(`     Actual   : "Create" = ${providerFormHasCreateButton}, "Edit" = ${providerFormHasEditButton}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 ? 'PASS' : 'FAIL'} - Billing Manager can maintain rates but not provider`);

        let __verifyPassed = false;
        try {
          expect(currenciesListHasCreateButton, 'Step 1 - Currencies list "Create" button').toBe(true);
          expect(ratesListHasCreateButton, 'Step 2 - Rates list "Create" button').toBe(true);
          expect(providerFormHasCreateButton, 'Step 3 - Provider form no "Create" button').toBe(false);
          expect(providerFormHasEditButton, 'Step 3 - Provider form no "Edit" button').toBe(false);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_5.4 - Access control',
            passed: __verifyPassed,
            highlight: ['table.o_list_view', '.o_form_button'],
          }).catch(() => {});
        }
      });
    } finally {
      // No teardown needed - this test only reads/views
    }
  });
});
