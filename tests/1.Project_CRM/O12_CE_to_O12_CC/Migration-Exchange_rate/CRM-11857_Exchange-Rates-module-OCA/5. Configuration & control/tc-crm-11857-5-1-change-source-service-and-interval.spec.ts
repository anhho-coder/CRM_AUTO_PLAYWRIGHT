import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_5.1: An administrator changes the rate source and the update frequency of the ECB provider from the screen
 * ===========================================================================
 *  Test Case ID    : CRM-11857_5.1
 *  Jira            : CRM-13405
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13405 updated 2026-10-09T11:26:21+0300, 5 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Verify that an administrator can change the Source Service and Scheduled update interval
 *    on the existing "European Central Bank" provider from the configuration screen, and restore
 *    the interval to 1 Day(s) in the final step.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_5\.1:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13405 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank and Scheduled
 *      update interval = 1 Day(s) exists for NAKIVO, Inc.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" is listed with Update Schedule = 1 Day(s)
 *
 *  2. Open "European Central Bank", click Edit and open the Source Service dropdown
 *     Expected Result: The dropdown lists the available rate services, including European
 *                      Central Bank
 *
 *  3. Select Source Service = European Central Bank, set Scheduled update interval = 2 and
 *     Units = Day(s), click Save
 *     Expected Result: The form saves without an error
 *
 *  4. Go back to Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" shows Update Schedule = 2 Day(s)
 *
 *  5. Open "European Central Bank", click Edit, set Scheduled update interval = 1, click
 *     Save, then go back to Invoicing > Configuration > Accounting > Currency Rates
 *     Providers
 *     Expected Result: "European Central Bank" shows Update Schedule = 1 Day(s)
 *
 * ===========================================================================
 */

const PROVIDER_SERVICE = 'European Central Bank';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers',
  s2: 'Step 2: Open "European Central Bank", click Edit and open the Source Service dropdown',
  s3: 'Step 3: Select Source Service = European Central Bank, set Scheduled update interval = 2 and Units = Day(s), click Save',
  s4: 'Step 4: Go back to Invoicing > Configuration > Accounting > Currency Rates Providers',
  s5: 'Step 5: Open "European Central Bank", click Edit, set Scheduled update interval = 1, click Save, then go back to Invoicing > Configuration > Accounting > Currency Rates Providers',
  verify: 'Verification: administrator can change the rate source and update frequency of the ECB provider',
} as const;

test.describe('CRM-11857_5.1 - Exchange Rates: Change rate source and update frequency', () => {
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

  test('CRM-11857_5.1: An administrator changes the rate source and the update frequency of the ECB provider from the screen', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    let configStep1: ProviderConfig | null = null;
    let serviceOptionsStep2: string[] = [];
    let savedStep3 = false;
    let configStep4: ProviderConfig | null = null;
    let configStep5BeforeSave: ProviderConfig | null = null;
    let savedStep5 = false;
    let configStep5AfterSave: ProviderConfig | null = null;

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Target  : ${baseUrl}`);
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
    });

    try {
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await providerPage.openProvidersList();
        const rows = await providerPage.getProviderRows();
        console.log(`  - Providers list shows ${rows.length} provider(s)`);
        const ecbRow = rows.find((r) => (r.service ?? "").includes(PROVIDER_SERVICE));
        expect(ecbRow, `"${PROVIDER_SERVICE}" should be listed`).toBeDefined();
        console.log(`  - "${PROVIDER_SERVICE}" is listed`);
        const intervalMatch = ecbRow?.interval?.match(/(\d+)\s+Day\(s\)/);
        const interval = intervalMatch ? intervalMatch[1] : '?';
        console.log(`  - Update Schedule = ${interval} Day(s)`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - providers list').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);

        configStep1 = await providerPage.readProviderFields();
        console.log(`  - Current Source Service : ${configStep1.service}`);
        console.log(`  - Current interval       : ${configStep1.intervalNumber} ${configStep1.intervalType}`);

        serviceOptionsStep2 = await providerPage.getServiceOptions();
        console.log(`  - Available services (${serviceOptionsStep2.length}) : ${serviceOptionsStep2.join(', ')}`);
        expect(serviceOptionsStep2, 'The dropdown should list available rate services').toContain(PROVIDER_SERVICE);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - source service dropdown opened').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  - Setting Source Service = ${PROVIDER_SERVICE}`);
        console.log(`  - Setting Scheduled update interval = 2 Day(s)`);
        savedStep3 = await providerPage.setServiceAndInterval({
          service: PROVIDER_SERVICE,
          intervalNumber: '2',
          intervalType: 'Day(s)',
        });
        expect(savedStep3, 'The form should save without an error').toBe(true);
        console.log(`  - Form saved successfully`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - interval changed to 2 days').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        await providerPage.openProvidersList();
        const rows = await providerPage.getProviderRows();
        const ecbRow = rows.find((r) => (r.service ?? "").includes(PROVIDER_SERVICE));
        expect(ecbRow, `"${PROVIDER_SERVICE}" should be listed`).toBeDefined();
        const intervalMatch = ecbRow?.interval?.match(/(\d+)\s+Day\(s\)/);
        const interval = intervalMatch ? intervalMatch[1] : '?';
        console.log(`  - "${PROVIDER_SERVICE}" Update Schedule = ${interval} Day(s)`);
        configStep4 = { ...configStep1, intervalNumber: interval };
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - providers list shows 2 days').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);

        configStep5BeforeSave = await providerPage.readProviderFields();
        console.log(`  - Before: interval = ${configStep5BeforeSave.intervalNumber} ${configStep5BeforeSave.intervalType}`);

        console.log(`  - Setting Scheduled update interval = 1 Day(s)`);
        savedStep5 = await providerPage.setServiceAndInterval({
          service: PROVIDER_SERVICE,
          intervalNumber: '1',
          intervalType: 'Day(s)',
        });
        expect(savedStep5, 'The form should save without an error').toBe(true);
        console.log(`  - Form saved successfully`);

        await providerPage.openProvidersList();
        const rows = await providerPage.getProviderRows();
        const ecbRow = rows.find((r) => (r.service ?? "").includes(PROVIDER_SERVICE));
        expect(ecbRow, `"${PROVIDER_SERVICE}" should be listed`).toBeDefined();
        const intervalMatch = ecbRow?.interval?.match(/(\d+)\s+Day\(s\)/);
        const interval = intervalMatch ? intervalMatch[1] : '?';
        console.log(`  - "${PROVIDER_SERVICE}" Update Schedule = ${interval} Day(s)`);
        configStep5AfterSave = { ...configStep5BeforeSave, intervalNumber: interval };
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - interval restored to 1 day').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const c1 = configStep1 as ProviderConfig;
        const c4 = configStep4 as ProviderConfig;
        const c5before = configStep5BeforeSave as ProviderConfig;
        const c5after = configStep5AfterSave as ProviderConfig;

        const v1 = c1.service === PROVIDER_SERVICE && c1.intervalNumber === '1';
        const v2 = serviceOptionsStep2.length > 0 && serviceOptionsStep2.includes(PROVIDER_SERVICE);
        const v3 = savedStep3;
        const v4 = c4.intervalNumber === '2';
        const v5 = savedStep5 && c5after.intervalNumber === '1';

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1, provider listed with 1 Day(s):');
        console.log(`     Expected : "${PROVIDER_SERVICE}" with interval = 1 Day(s)`);
        console.log(`     Actual   : Source Service = ${c1.service} | interval = ${c1.intervalNumber} ${c1.intervalType}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2, service dropdown lists services including ECB:');
        console.log(`     Expected : Service dropdown includes "${PROVIDER_SERVICE}"`);
        console.log(`     Actual   : Services listed (${serviceOptionsStep2.length}) : ${serviceOptionsStep2.join(', ')}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, form saves interval change without error:');
        console.log(`     Expected : Form saved = true`);
        console.log(`     Actual   : ${savedStep3}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, provider shows 2 Day(s):');
        console.log(`     Expected : "${PROVIDER_SERVICE}" Update Schedule = 2 Day(s)`);
        console.log(`     Actual   : ${c4.intervalNumber} ${c4.intervalType}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Step 5, interval restored to 1 Day(s):');
        console.log(`     Expected : Form saved = true AND "${PROVIDER_SERVICE}" Update Schedule = 1 Day(s)`);
        console.log(`     Actual   : Saved = ${savedStep5} AND interval = ${c5after.intervalNumber} ${c5after.intervalType}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 ? 'PASS' : 'FAIL'} - administrator can change the rate source and update frequency`);

        let __verifyPassed = false;
        try {
          expect(c1.service, 'Step 1 - Source Service').toBe(PROVIDER_SERVICE);
          expect(c1.intervalNumber, 'Step 1 - initial interval is 1').toBe('1');
          expect(serviceOptionsStep2.length, 'Step 2 - service dropdown has options').toBeGreaterThan(0);
          expect(serviceOptionsStep2, 'Step 2 - services include ECB').toContain(PROVIDER_SERVICE);
          expect(savedStep3, 'Step 3 - form saved').toBe(true);
          expect(c4.intervalNumber, 'Step 4 - interval changed to 2').toBe('2');
          expect(savedStep5, 'Step 5 - form saved').toBe(true);
          expect(c5after.intervalNumber, 'Step 5 - interval restored to 1').toBe('1');
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_5.1 - Provider interval change',
            passed: __verifyPassed,
            highlight: ['table.o_list_view'],
          }).catch(() => {});
        }
      });
    } finally {
      // No teardown needed - the provider is restored in step 5
    }
  });
});




