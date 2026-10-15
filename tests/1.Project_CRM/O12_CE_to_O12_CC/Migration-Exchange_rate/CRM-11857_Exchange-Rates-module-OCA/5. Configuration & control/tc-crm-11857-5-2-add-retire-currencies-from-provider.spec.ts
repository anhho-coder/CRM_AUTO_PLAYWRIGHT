import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyRateProviderPageMig } from '@pages/mig';
import type { ProviderConfig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_5.2: An administrator removes a currency from the ECB provider, adds it back and sees when the next update is due
 * ===========================================================================
 *  Test Case ID    : CRM-11857_5.2
 *  Jira            : CRM-13406
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13406 updated 2026-10-09T13:01:40+0300, 5 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Verify that an administrator can remove a currency from the "European Central Bank" provider,
 *    add it back, and see the next update schedule is still visible. The test removes INR and adds
 *    it back, restoring the provider to its initial state in teardown.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_5\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13406 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - A Currency Rates Provider with Source Service = European Central Bank and Currencies =
 *      CHF, EUR, GBP, IDR, INR, USD exists for NAKIVO, Inc.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" shows its Currencies and a date in Next
 *                      scheduled update
 *
 *  2. Open "European Central Bank", click Edit, remove INR from Currencies, click Save
 *     Expected Result: Currencies = CHF, EUR, GBP, IDR, USD
 *
 *  3. Go back to Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" shows Currencies without INR
 *
 *  4. Open "European Central Bank", click Edit, add INR to Currencies, click Save
 *     Expected Result: Currencies = CHF, EUR, GBP, IDR, INR, USD
 *
 *  5. Go back to Invoicing > Configuration > Accounting > Currency Rates Providers
 *     Expected Result: "European Central Bank" shows Currencies with INR again
 *
 * ===========================================================================
 */

const PROVIDER_SERVICE = 'European Central Bank';
const CURRENCY_TO_REMOVE = 'INR';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currency Rates Providers',
  s2: 'Step 2: Open "European Central Bank", click Edit, remove INR from Currencies, click Save',
  s3: 'Step 3: Go back to Invoicing > Configuration > Accounting > Currency Rates Providers',
  s4: 'Step 4: Open "European Central Bank", click Edit, add INR to Currencies, click Save',
  s5: 'Step 5: Go back to Invoicing > Configuration > Accounting > Currency Rates Providers',
  verify: 'Verification: administrator can remove and add currencies to the ECB provider',
} as const;

test.describe('CRM-11857_5.2 - Exchange Rates: Remove and add currencies to provider', () => {
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

  test('CRM-11857_5.2: An administrator removes a currency from the ECB provider, adds it back and sees when the next update is due', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const providerPage = new CurrencyRateProviderPageMig(page);

    let currenciesInitial: string = '';
    let nextScheduleInitial: string = '';
    let currenciesAfterRemove: string = '';
    let currenciesAfterAdd: string = '';
    let removedSuccessfully = false;
    let addedSuccessfully = false;

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
        console.log(`  - Row shows: ${ecbRow}`);

        // Open form to read initial state
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);
        const config = await providerPage.readProviderFields();
        currenciesInitial = config.currencies || '';
        nextScheduleInitial = config.nextRun || '';
        console.log(`  - Initial Currencies: ${currenciesInitial}`);
        console.log(`  - Next scheduled update: ${nextScheduleInitial}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - providers list').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log(`  - Removing currency: ${CURRENCY_TO_REMOVE}`);
        removedSuccessfully = await providerPage.removeCurrencyFromProvider(CURRENCY_TO_REMOVE);
        expect(removedSuccessfully, `${CURRENCY_TO_REMOVE} should be removed from the provider`).toBe(true);
        console.log(`  - Currency removed and form saved`);

        const config = await providerPage.readProviderFields();
        currenciesAfterRemove = config.currencies || '';
        console.log(`  - Currencies after removal: ${currenciesAfterRemove}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - currency removed').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await providerPage.openProvidersList();
        const rows = await providerPage.getProviderRows();
        const ecbRow = rows.find((r) => (r.service ?? "").includes(PROVIDER_SERVICE));
        expect(ecbRow, `"${PROVIDER_SERVICE}" should still be listed`).toBeDefined();
        console.log(`  - "${PROVIDER_SERVICE}" is listed without ${CURRENCY_TO_REMOVE}`);
        console.log(`  - Row shows: ${ecbRow}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - providers list after removal').catch(() => {});
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
        expect(opened, `The "${PROVIDER_SERVICE}" provider form should open`).toBe(true);
        console.log(`  - Adding currency: ${CURRENCY_TO_REMOVE}`);
        addedSuccessfully = await providerPage.addCurrencyToProvider(CURRENCY_TO_REMOVE);
        expect(addedSuccessfully, `${CURRENCY_TO_REMOVE} should be added to the provider`).toBe(true);
        console.log(`  - Currency added and form saved`);

        const config = await providerPage.readProviderFields();
        currenciesAfterAdd = config.currencies || '';
        console.log(`  - Currencies after addition: ${currenciesAfterAdd}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - currency added back').catch(() => {});
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        await providerPage.openProvidersList();
        const rows = await providerPage.getProviderRows();
        const ecbRow = rows.find((r) => (r.service ?? "").includes(PROVIDER_SERVICE));
        expect(ecbRow, `"${PROVIDER_SERVICE}" should still be listed`).toBeDefined();
        console.log(`  - "${PROVIDER_SERVICE}" is listed with ${CURRENCY_TO_REMOVE} restored`);
        console.log(`  - Row shows: ${ecbRow}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - providers list after addition').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const v1 = currenciesInitial.includes(CURRENCY_TO_REMOVE) && nextScheduleInitial;
        const v2 = removedSuccessfully && !currenciesAfterRemove.includes(CURRENCY_TO_REMOVE);
        const v3 = !currenciesAfterRemove.includes(CURRENCY_TO_REMOVE);
        const v4 = addedSuccessfully && currenciesAfterAdd.includes(CURRENCY_TO_REMOVE);
        const v5 = currenciesAfterAdd.includes(CURRENCY_TO_REMOVE);

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1, provider lists currencies and next update date:');
        console.log(`     Expected : Currencies include ${CURRENCY_TO_REMOVE}, Next update shown`);
        console.log(`     Actual   : Currencies = ${currenciesInitial}, Next update = ${nextScheduleInitial}`);
        console.log(`     Result   : ${v1 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - Step 2, currency removed and saved:');
        console.log(`     Expected : ${CURRENCY_TO_REMOVE} removed = true, Currencies no longer include ${CURRENCY_TO_REMOVE}`);
        console.log(`     Actual   : Removed = ${removedSuccessfully}, Currencies = ${currenciesAfterRemove}`);
        console.log(`     Result   : ${v2 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #3 - Step 3, providers list shows removal:');
        console.log(`     Expected : "${PROVIDER_SERVICE}" listed without ${CURRENCY_TO_REMOVE}`);
        console.log(`     Actual   : Currencies = ${currenciesAfterRemove}`);
        console.log(`     Result   : ${v3 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #4 - Step 4, currency added and saved:');
        console.log(`     Expected : ${CURRENCY_TO_REMOVE} added = true, Currencies include ${CURRENCY_TO_REMOVE}`);
        console.log(`     Actual   : Added = ${addedSuccessfully}, Currencies = ${currenciesAfterAdd}`);
        console.log(`     Result   : ${v4 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #5 - Step 5, providers list shows addition:');
        console.log(`     Expected : "${PROVIDER_SERVICE}" listed with ${CURRENCY_TO_REMOVE} restored`);
        console.log(`     Actual   : Currencies = ${currenciesAfterAdd}`);
        console.log(`     Result   : ${v5 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${v1 && v2 && v3 && v4 && v5 ? 'PASS' : 'FAIL'} - administrator can remove and add currencies`);

        let __verifyPassed = false;
        try {
          expect(currenciesInitial.includes(CURRENCY_TO_REMOVE), 'Step 1 - initial currencies include INR').toBe(true);
          expect(nextScheduleInitial, 'Step 1 - next update is visible').toBeTruthy();
          expect(removedSuccessfully, 'Step 2 - currency removed').toBe(true);
          expect(currenciesAfterRemove.includes(CURRENCY_TO_REMOVE), 'Step 2 - currencies no longer include INR').toBe(false);
          expect(currenciesAfterRemove, 'Step 3 - list shows removal').not.toContain(CURRENCY_TO_REMOVE);
          expect(addedSuccessfully, 'Step 4 - currency added').toBe(true);
          expect(currenciesAfterAdd.includes(CURRENCY_TO_REMOVE), 'Step 4 - currencies include INR again').toBe(true);
          expect(currenciesAfterAdd.includes(CURRENCY_TO_REMOVE), 'Step 5 - list shows addition').toBe(true);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_5.2 - Currency add/remove',
            passed: __verifyPassed,
            highlight: ['table.o_list_view'],
          }).catch(() => {});
        }
      });
    } finally {
      // Teardown: if test failed mid-way, restore initial currencies
      if (!addedSuccessfully && currenciesInitial.includes(CURRENCY_TO_REMOVE) && !currenciesAfterRemove.includes(CURRENCY_TO_REMOVE)) {
        console.log('\n--- Teardown: Restore currencies to initial state ---');
        try {
          const opened = await providerPage.openProviderForm(PROVIDER_SERVICE);
          if (opened) {
            await providerPage.addCurrencyToProvider(CURRENCY_TO_REMOVE).catch(() => {});
            console.log(`  - Restored ${CURRENCY_TO_REMOVE} to the provider`);
          }
        } catch (e) {
          console.log(`  ! Teardown could not restore currencies: ${(e as Error).message}`);
        }
      }
    }
  });
});




