import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * O12 Migration server - Login smoke
 * Test Case ID: CRM-12124_1.1.1
 * Automation-Type: refactored
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Smoke-check the fresh Odoo 12 Community base (crm-mig.nakivo.site, CRM-12124): log in as Admin
 *   on the Migration server and confirm the CRM desktop (kanban) loads. Starter pattern for O12
 *   Migration specs (targets baseUrl_mig + admin_crm_mig; @pages/mig variants).
 *
 * Target: O12 Migration server (https://crm-mig.nakivo.site/) - NOT pre-prod.
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - The Migration server is reachable; the admin_crm_mig credentials are valid on that instance.
 *   Steps to reproduce:
 *     1. Login as Admin on the O12 Migration server (opens baseUrl_mig).
 *     2. Open the CRM app and verify the CRM kanban (desktop) loads.
 *   Verification Points:
 *     1. After login the URL is the Migration server backend (crm-mig.nakivo.site, /web).
 *     2. The CRM kanban (view_type=kanban) is open.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12124_1\.1\.1:" --project=chromium
 */
test.describe('CRM-12124 - O12 Migration server login smoke', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('WARN Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-12124_1.1.1: Login as Admin on O12 Migration server and open CRM', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const homePage  = new HomePageMig(page);

    let afterLoginUrl = '';
    let onMigBackend = false;
    let crmUrl = '';
    let onCrmKanban = false;

    console.log('========== CRM-12124_1.1.1 - O12 Migration server login smoke ==========');

    await test.step('Step 1: Login as Admin on the O12 Migration server (opens baseUrl_mig)', async () => {
      console.log('\n--- Step 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await loginPage.dismissLocationPermissionDialog();
      afterLoginUrl = page.url();
      onMigBackend = afterLoginUrl.includes('crm-mig.nakivo.site') && afterLoginUrl.includes('/web');
      console.log(`  OK - reached backend: ${afterLoginUrl}`);
    });

    await test.step('Step 2: Open the CRM app and verify the CRM kanban (desktop) loads', async () => {
      console.log('\n--- Step 2: Open the CRM app on the Migration server ---');
      // navigateToCRM waits for the CRM kanban URL and throws if it never loads.
      await homePage.navigateToCRM();
      crmUrl = page.url();
      onCrmKanban = /\/web[?#].*view_type=kanban/.test(crmUrl);
      console.log(`  OK - CRM kanban URL: ${crmUrl}`);
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - Login reaches the Migration server backend (/web):');
      console.log('  Expected : URL on crm-mig.nakivo.site and contains "/web"');
      console.log(`  Actual   : ${afterLoginUrl}`);
      console.log(`  Result   : ${onMigBackend ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - The CRM kanban (desktop) renders:');
      console.log('  Expected : URL matches the CRM kanban (view_type=kanban)');
      console.log(`  Actual   : ${crmUrl}`);
      console.log(`  Result   : ${onCrmKanban ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${onMigBackend && onCrmKanban ? 'PASS' : 'FAIL'} - login reaches the Migration desktop and CRM opens`);

      expect(afterLoginUrl, 'After login the URL should be the Migration server').toContain('crm-mig.nakivo.site');
      expect(afterLoginUrl, 'After login the URL should be on the Odoo backend (/web)').toContain('/web');
      expect(onCrmKanban, 'CRM kanban should be open on the Migration server').toBeTruthy();
    });
  });
});
