import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 * CRM-12325 Part 2-A.2 - Settings app opens cleanly and within a reasonable time
 * ===========================================================================
 * Test Case ID    : CRM-12325_1.1.5
 * Jira            : CRM-12340
 * Test Repository : /CRM test/Migration - Setup New CRM/CRM-12325_Build fresh Odoo 12 Community/A. Reachable & boot
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE)
 * Automation-Type : new
 * Automation-Date : 2026-08-19
 * Automation-Updated: 2026-09-15 (steps re-synced with the Jira manual TC)
 *
 * Summary:
 *   Verifies the Settings app opens on the Migration server with no server error / traceback
 *   and renders within a reasonable response-time budget.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.1\.5:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 * Source manual TC - Jira CRM-12340, Xray Manual Steps (verbatim, in order)
 * ---------------------------------------------------------------------------
 * Pre-conditions:
 *   _ Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site
 *
 * Steps to reproduce #1:
 *   1. Open the Settings app (via its menu) and let its action view render.
 *      AUTOMATION: automated - opens by URL hash and waits for the loading spinner to clear
 *      (@pages/mig MigPlatformPage.openAppAndMeasureMs).
 *
 * Verification - Expected Result on step 1:
 *   _ No server error / traceback dialog is shown
 *   _ The Settings app loads within a reasonable time (response time under the ~30s budget)
 * ---------------------------------------------------------------------------
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1:   'Pre-condition 1: Login: anh.ho@nakivo.com (admin_crm_mig) on crm-mig.nakivo.site',
  s1:     'Step 1: Open the Settings app (via its menu) and let its action view render.',
  verify: 'Verification',
} as const;

test.describe('CRM-12325 Part 2-A.2 - Settings opens cleanly and fast', () => {

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

  test('CRM-12325_1.1.5: [Part2-A] Settings app opens with no server error and within a reasonable time', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const budget = MigPlatformPage.APP_RESPONSE_BUDGET_MS;
    let ms: number;
    let hasError: boolean;

    console.log('========== CRM-12325_1.1.5 - Settings app opens cleanly and fast ==========');

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
      ms = await platform.openAppAndMeasureMs(MigPlatformPage.HASH.settings);
      hasError = await platform.isErrorDialogVisible();
      console.log(`  Settings opened - errorDialog=${hasError}, response time=${ms} ms`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - No server error / traceback dialog is shown:');
      console.log(`   Expected : hasError = false`);
      console.log(`   Actual   : hasError = ${hasError}`);
      console.log(`   Result   : ${!hasError ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - The Settings app loads within a reasonable time (response time under the ~30s budget):');
      console.log(`   Expected : ms < ${budget}`);
      console.log(`   Actual   : ms = ${ms}`);
      console.log(`   Result   : ${ms < budget ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${(!hasError && ms < budget) ? 'PASS' : 'FAIL'} - Settings app opens cleanly and within budget`);

      expect(hasError, 'Settings app should open with no server error / traceback').toBeFalsy();
      expect(ms, `Settings app should load within ${budget}ms (actual ${ms}ms)`).toBeLessThan(budget);
    });
  });
});
