import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-C - Clean base state
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.3.1
 * Jira            : CRM-12363
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/C. Clean base state
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC)
 *
 * Summary:
 *   Verifies the base is in a clean state - no *_enterprise module installed, no module
 *   stuck in a transient state (To Upgrade / To Install / To Remove), and the core screens
 *   load with no traceback.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.3\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12363, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *
 * Steps to reproduce #1:
 *   1. Read installed modules; check no enterprise (*_enterprise) module is installed.
 *
 * Steps to reproduce #2:
 *   2. Check no module is stuck in To Upgrade / To Install / To Remove.
 *
 * Steps to reproduce #3:
 *   3. Open the core screens (CRM, Settings) and check no traceback.
 *      NOTE: the 'no nakivo_*' and 'no leftover data' bullets are dropped - the instance is
 *      data-migrated (nakivo_* modules + full data present), so they do not apply.
 *      AUTOMATION: automated - RPC module states + UI error-dialog check.
 *
 * Verification - Expected Result on step 3:
 *   _ No *_enterprise module is installed
 *   _ No module is stuck in a transient state
 *   _ Core screens load with no traceback
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:   'Pre-condition 1: Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site',
  s1:     'Step 1: Read installed modules; check no enterprise (*_enterprise) module is installed.',
  s2:     'Step 2: Check no module is stuck in To Upgrade / To Install / To Remove.',
  s3:     'Step 3: Open the core screens (CRM, Settings) and check no traceback.',
  verify: 'Verification',
} as const;

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

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const mods = await platform.getModules();
      enterpriseInstalled = mods.filter(m => m.state === 'installed' && /enterprise/i.test(m.name)).map(m => m.name);
      stuck = mods.filter(m => ['to upgrade', 'to install', 'to remove'].includes(m.state)).map(m => `${m.name}:${m.state}`);
      console.log(`Step 1: enterprise installed: [${enterpriseInstalled.join(', ')}]`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // Computed alongside Step 1 (same module snapshot) so the two reads stay consistent.
      console.log(`Step 2: stuck modules: [${stuck.join(', ')}]`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const [name, hash] of [['CRM', MigPlatformPage.HASH.crm], ['Settings', MigPlatformPage.HASH.settings]] as Array<[string, string]>) {
        await platform.openAppAndAssertRendered(hash);
        screenResults[name] = await platform.isErrorDialogVisible();
        console.log(`Step 3: ${name} errorDialog=${screenResults[name]}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const coreScreensPass = Object.values(screenResults).every(hasError => !hasError);
      const screenErrors = Object.entries(screenResults).filter(([, hasError]) => hasError).map(([name]) => name);

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
