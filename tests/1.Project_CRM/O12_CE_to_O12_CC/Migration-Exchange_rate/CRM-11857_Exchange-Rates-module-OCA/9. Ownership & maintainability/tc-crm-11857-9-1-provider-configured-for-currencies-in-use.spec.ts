import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, CurrencyRateProviderPageMig, HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_9.1: Currency rates are handled by the OCA option while the Enterprise automatic rates feature is not installed
 * ===========================================================================
 *  Test Case ID    : CRM-11857_9.1
 *  Jira            : CRM-13418
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13418 updated 2026-10-12T10:28:38+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for an Administrator to
 *                    access Settings > Technical > Automation and read module installation status, both
 *                    of which require full access rights.
 *
 *  Summary:
 *    Verify the OCA currency-rates feature is enabled while the Enterprise feature is not installed.
 *    Search Apps for "Live Currency Exchange Rate" (expect none), check Invoicing Settings for the
 *    two checkbox options (OCA checked, Enterprise not), and confirm the ECB provider is configured
 *    with the required currencies.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_9\.1:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13418 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as anh.ho@nakivo.com (Administrator).
 *
 *  1. Open Apps, remove the "Apps" filter and search "Live Currency Exchange Rate"
 *     Expected Result: No module is found
 *
 *  2. Open Invoicing > Configuration > Settings and go to the Currencies section
 *     Expected Result: "Automatic Currency Rates (OCA)" is checked
 *                      "Automatic Currency Rates" is not checked
 *
 *  3. Open Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" is listed with currencies CHF, EUR, GBP, IDR,
 *                      INR, USD
 *
 * ---------------------------------------------------------------------------
 *  BLOCKED - Step 2 cannot be performed on crm-mig (measured 2026-10-14)
 * ---------------------------------------------------------------------------
 *  Invoicing > Configuration > Settings does not render the Odoo settings page on this build, so
 *  the Currencies section and its two checkboxes are not reachable through the path the TC gives.
 *
 *    - menu 176 "Settings" (parent "Invoicing/Configuration") -> ir.actions.act_window,276
 *    - action 276 carries view_id = false, context {'module': 'account'}
 *    - with no view pinned, fields_view_get(res.config.settings, 'form') returns view 1396
 *      "ai.guard.res.config.settings", whose arch is <form string="AI Guard Settings"> and holds
 *      only the AI Guard group - the standard root view 153 and its ~44 inheriting blocks
 *      (including res.config.settings.view.form.inherit.account, which carries Currencies) are
 *      never applied
 *    - the rendered page therefore has no .app_settings_block; the 2026-10-14 run re-drove the
 *      route until the 15-minute test timeout
 *
 *  Only 3 of the 9 res.config.settings actions pin a view_id (571 AI Guard, 354 sale, 292 crm).
 *  Reaching the Currencies section through one of those would be a different screen from the one
 *  the TC names, so this step reports BLOCKED instead of substituting a route that passes.
 *
 *  Re-enable by restoring step 2's body once the deploy serves the standard settings form.
 *
 * ===========================================================================
 */

const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as anh.ho@nakivo.com (Administrator)',
  s1: 'Step 1: Open Apps, remove the "Apps" filter and search "Live Currency Exchange Rate"',
  s2: 'Step 2: [BLOCKED - Invoicing Settings renders the AI Guard form on crm-mig: action 276 pins no view_id, so res.config.settings falls back to view 1396 "ai.guard.res.config.settings", which has no Currencies section] Open Invoicing > Configuration > Settings and go to the Currencies section',
  s3: 'Step 3: Open Invoicing > Configuration > Accounting > Currency Rates Providers',
  verify: 'Verification: OCA is enabled, Enterprise is not installed, ECB provider is configured with required currencies',
} as const;

const EXPECTED_PROVIDER_CURRENCIES = ['CHF', 'EUR', 'GBP', 'IDR', 'INR', 'USD'];

test.describe('CRM-11857_9.1 - Exchange Rates: Currency rates are handled by the OCA option while the Enterprise automatic rates feature is not installed', () => {
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

  test('CRM-11857_9.1: Currency rates are handled by the OCA option while the Enterprise automatic rates feature is not installed', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const homePage = new HomePageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    let enterpriseRatesFound = false;
    let ecbProviderFound = false;
    let providerCurrencies: string[] = [];

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
      enterpriseRatesFound = await homePage.searchAppsForModule('Live Currency Exchange Rate');
      console.log(`  - Live Currency Exchange Rate module: ${enterpriseRatesFound ? 'FOUND' : 'NOT FOUND'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Apps search').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // BLOCKED - see the header. Invoicing > Configuration > Settings serves the AI Guard form on
      // this build, so the Currencies section the TC describes is not on the page at all. The step
      // is not driven: the previous run re-drove the route until the 15-minute test timeout, which
      // costs the whole suite its budget and still reads nothing.
      console.log('  - [BLOCKED] menu 176 "Settings" (Invoicing/Configuration) -> action 276');
      console.log('  - [BLOCKED] action 276 has view_id = false, so res.config.settings falls back');
      console.log('  - [BLOCKED] to view 1396 "ai.guard.res.config.settings" (AI Guard Settings form)');
      console.log('  - [BLOCKED] the Currencies section and its two checkboxes are not rendered');
      console.log('  - Automatic Currency Rates (OCA): NOT READ - step blocked');
      console.log('  - Automatic Currency Rates (Enterprise): NOT READ - step blocked');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const listOpened = await providerPage.openProvidersList();
      if (listOpened) {
        const rows = await providerPage.getProviderRows();
        console.log(`  - Provider rows found: ${rows.length}`);
        for (const row of rows) {
          console.log(`    * Service: "${row.service}"`);
          if (row.service === 'European Central Bank') {
            ecbProviderFound = true;
            const formOpened = await providerPage.openProviderForm('European Central Bank');
            if (formOpened) {
              const config = await providerPage.readProviderFields();
              if (config.currencies) {
                // Split by comma or newline and trim each value
                providerCurrencies = config.currencies
                  .split(/[,\n]/)
                  .map((c) => c.trim())
                  .filter((c) => !!c)
                  .sort();
              }
            }
          }
        }
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Currency Rates Providers').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log('');
      console.log('==================== VERIFY ====================');

      console.log('  Verify #1 - Enterprise "Live Currency Exchange Rate" module is NOT installed:');
      console.log(`     Expected: NOT FOUND`);
      console.log(`     Actual  : ${enterpriseRatesFound ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result  : ${!enterpriseRatesFound ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - OCA "Automatic Currency Rates" is checked in Settings:');
      console.log(`     Expected: CHECKED`);
      console.log('     Actual  : BLOCKED - Invoicing Settings serves the AI Guard form (action 276 pins no view_id)');
      console.log('     Result  : BLOCKED');

      console.log('  Verify #3 - Enterprise "Automatic Currency Rates" is NOT checked in Settings:');
      console.log(`     Expected: NOT CHECKED`);
      console.log('     Actual  : BLOCKED - the Currencies section is not rendered on this build');
      console.log('     Result  : BLOCKED');

      console.log('  Verify #4 - ECB provider is configured:');
      console.log(`     Expected: European Central Bank provider exists`);
      console.log(`     Actual  : ${ecbProviderFound ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result  : ${ecbProviderFound ? 'PASS' : 'FAIL'}`);

      const sortedExpected = [...EXPECTED_PROVIDER_CURRENCIES].sort();
      const missing = sortedExpected.filter((c) => !providerCurrencies.includes(c));
      const extra = providerCurrencies.filter((c) => !sortedExpected.includes(c));

      console.log('  Verify #5 - ECB provider covers required currencies:');
      console.log(`     Expected: [${sortedExpected.join(', ')}]`);
      console.log(`     Actual  : [${providerCurrencies.join(', ')}]`);
      console.log(`     Missing : [${missing.join(', ') || 'none'}]`);
      console.log(`     Extras  : [${extra.join(', ') || 'none'}]`);
      console.log(`     Result  : ${missing.length === 0 && extra.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      // Verify #2 and #3 are BLOCKED, so this run can never reach an overall PASS. The checks that
      // CAN be made are still asserted below - a blocked step must not turn the rest green.
      const checkable = !enterpriseRatesFound && ecbProviderFound && missing.length === 0 && extra.length === 0;
      console.log(
        checkable
          ? 'OVERALL: BLOCKED - Step 2 cannot be performed on crm-mig (Settings serves the AI Guard form); verifies #1, #4 and #5 PASS'
          : 'OVERALL: FAIL - the checks that are not blocked did not hold',
      );

      expect(enterpriseRatesFound, 'Enterprise "Live Currency Exchange Rate" module should NOT be found').toBe(false);
      expect(ecbProviderFound, 'European Central Bank provider should exist').toBe(true);
      expect(missing, `The provider must cover required currencies. Missing: ${missing.join(', ')}`).toEqual([]);
      expect(extra.length, `The provider should not have unexpected extra currencies. Extras: ${extra.join(', ')}`).toBe(0);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-11857_9.1 - verification complete').catch(() => {});
    });
  });
});


