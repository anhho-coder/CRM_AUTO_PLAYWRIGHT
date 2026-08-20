import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12325 Part 2-C - Clean base state (crm-mig.nakivo.site)
 * Test Case ID: CRM-12325_1.3.1
 * Automation-Type: new
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Verifies the base is in a clean state - no *_enterprise module installed, no module stuck in a
 *   transient state (To Upgrade / To Install / To Remove), and the core screens load with no traceback.
 *
 * Source manual TC (mirrors ticket CRM-12325 Part 2):
 *
 * Pre-conditions:
 *   Login as Admin (anh.ho) on the O12 Migration server.
 *
 * Steps to reproduce (ticket Part 2-C, valid clean-state checks; the "no nakivo_*" sub-point
 * was intentionally dropped and must stay dropped):
 *   1. Read the installed modules and check no enterprise (*_enterprise) module is installed.
 *   2. Check no module is stuck in a transient state (To Upgrade / To Install / To Remove).
 *   3. Open the core screens (CRM, Settings) and check no traceback.
 *
 * Verification Points:
 *   1. No *_enterprise module is installed.
 *   2. No module is stuck in a transient state.
 *   3. Core screens load with no traceback.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.3\.1:" --project=chromium
 */
test.describe('CRM-12325 Part 2-C - Clean base state', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-12325_1.3.1: [Part2-C] Clean base - no enterprise, no stuck modules, no traceback', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Values are computed in the Steps and reused (not recomputed) in the Verification step.
    let enterpriseInstalled: string[] = [];
    let stuck: string[] = [];
    const screenResults: { [name: string]: boolean } = {};

    await test.step('Pre-condition 1: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('Step 1: Read the installed modules and check no enterprise (*_enterprise) module is installed', async () => {
      const mods = await platform.getModules();
      enterpriseInstalled = mods.filter(m => m.state === 'installed' && /enterprise/i.test(m.name)).map(m => m.name);
      stuck = mods.filter(m => ['to upgrade', 'to install', 'to remove'].includes(m.state)).map(m => `${m.name}:${m.state}`);
      console.log(`Step 1: enterprise installed: [${enterpriseInstalled.join(', ')}]`);
    });

    await test.step('Step 2: Check no module is stuck in a transient state (To Upgrade / To Install / To Remove)', async () => {
      // Computed alongside Step 1 (same module snapshot) so the two reads stay consistent.
      console.log(`Step 2: stuck modules: [${stuck.join(', ')}]`);
    });

    await test.step('Step 3: Open the core screens (CRM, Settings) and check no traceback', async () => {
      for (const [name, hash] of [['CRM', MigPlatformPage.HASH.crm], ['Settings', MigPlatformPage.HASH.settings]] as Array<[string, string]>) {
        await platform.openAppAndAssertRendered(hash);
        screenResults[name] = await platform.isErrorDialogVisible();
        console.log(`Step 3: ${name} errorDialog=${screenResults[name]}`);
      }
    });

    await test.step('Verification', async () => {
      const coreScreensPass = Object.values(screenResults).every(hasError => !hasError);
      const screenErrors = Object.entries(screenResults).filter(([, hasError]) => hasError).map(([name]) => name);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - No *_enterprise module is installed:');
      console.log(`     Expected : 0 enterprise modules`);
      console.log(`     Actual   : ${enterpriseInstalled.length} [${enterpriseInstalled.join(', ')}]`);
      console.log(`     Result   : ${enterpriseInstalled.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - No module is stuck in a transient state:');
      console.log(`     Expected : 0 stuck modules`);
      console.log(`     Actual   : ${stuck.length} [${stuck.join(', ')}]`);
      console.log(`     Result   : ${stuck.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Core screens load with no traceback:');
      console.log(`     Expected : No error dialogs on CRM and Settings`);
      console.log(`     Actual   : ${coreScreensPass ? 'No errors' : `Errors on: ${screenErrors.join(', ')}`}`);
      console.log(`     Result   : ${coreScreensPass ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      const overallPass = enterpriseInstalled.length === 0 && stuck.length === 0 && coreScreensPass;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Clean base state`);

      expect(enterpriseInstalled, `no *_enterprise installed (found: ${enterpriseInstalled.join(', ')})`).toHaveLength(0);
      expect(stuck, `no module should be stuck in To Upgrade/To Install/To Remove (found: ${stuck.join(', ')})`).toHaveLength(0);
      for (const [name, hasError] of Object.entries(screenResults)) {
        expect(hasError, `${name} should load with no traceback`).toBeFalsy();
      }
    });
  });
});
