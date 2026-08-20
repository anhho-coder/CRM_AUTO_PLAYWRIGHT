import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12325 Part 2-A.2 - Job Queue app opens cleanly and within a reasonable time (crm-mig.nakivo.site)
 * Test Case ID: CRM-12325_1.1.11
 * Automation-Type: new
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Verifies the Job Queue app opens on the Migration server with no server error / traceback and
 *   renders within a reasonable response-time budget.
 *
 * Source manual TC (mirrors ticket CRM-12325 Part 2):
 *
 * Pre-conditions:
 *   Login as Admin (anh.ho) on the O12 Migration server (crm-mig.nakivo.site).
 *
 * Steps to reproduce:
 *   1. Open the Job Queue app and let its action view render.
 *
 * Verification Points (ticket Part 2-A bullet 2, for the Job Queue app):
 *   1. No server error / traceback dialog is shown.
 *   2. The app loads within a reasonable time (response time under the budget).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1.1.11:" --project=chromium
 */
test.describe('CRM-12325 Part 2-A.2 - Job Queue opens cleanly and fast', () => {

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

  test('CRM-12325_1.1.11: [Part2-A] Job Queue app opens with no server error and within a reasonable time', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const budget = MigPlatformPage.APP_RESPONSE_BUDGET_MS;
    let ms: number;
    let hasError: boolean;

    console.log('========== CRM-12325_1.1.11 - Job Queue app opens cleanly and fast ==========');

    await test.step('Pre-condition 1: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('Step 1: Open the Job Queue app and let its action view render', async () => {
      console.log('\n--- Step 1: Open the Job Queue app and let its action view render ---');
      ms = await platform.openAppAndMeasureMs(MigPlatformPage.HASH.jobQueue);
      hasError = await platform.isErrorDialogVisible();
      console.log(`  Job Queue opened - errorDialog=${hasError}, response time=${ms} ms`);
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - No server error / traceback dialog is shown:');
      console.log(`  Expected : hasError = false`);
      console.log(`  Actual   : hasError = ${hasError}`);
      console.log(`  Result   : ${!hasError ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - The app loads within a reasonable time (response time under the budget):');
      console.log(`  Expected : ms < ${budget}`);
      console.log(`  Actual   : ms = ${ms}`);
      console.log(`  Result   : ${ms < budget ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${(!hasError && ms < budget) ? 'PASS' : 'FAIL'} - Job Queue app opens cleanly and within budget`);

      expect(hasError, 'Job Queue app should open with no server error / traceback').toBeFalsy();
      expect(ms, `Job Queue app should load within ${budget}ms (actual ${ms}ms)`).toBeLessThan(budget);
    });
  });
});
