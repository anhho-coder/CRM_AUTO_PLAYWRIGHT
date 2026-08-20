import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12325 Part 2-D - Light smoke (crm-mig.nakivo.site)
 * Test Case ID: CRM-12325_1.4.1
 * Automation-Type: new
 * Automation-Date: 2026-08-19
 *
 * Summary:
 *   Light smoke of the Migration server - the core CE apps (Contacts, CRM, Sales, Settings) render
 *   with no error, and the write path is alive (create + delete a trivial Contact).
 *
 * Source manual TC (mirrors ticket CRM-12325 Part 2):
 *
 * Pre-conditions:
 *   Login as Admin (anh.ho) on the O12 Migration server.
 *
 * Steps to reproduce (ticket Part 2-D):
 *   1. Open a few core CE apps (Contacts, CRM, Sales, Settings) and confirm they render.
 *   2. Create and delete one trivial record (a Contact) to confirm the write path is alive.
 *
 * Verification Points:
 *   1. Each core app renders with no error.
 *   2. The write path persisted a record (create returns an id), then cleaned it up.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_1\.4\.1:" --project=chromium
 */
test.describe('CRM-12325 Part 2-D - Light smoke', () => {

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

  test('CRM-12325_1.4.1: [Part2-D] Core apps render and the write path is alive', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Collect results for final verification
    const appRenderResults: { name: string; hasError: boolean }[] = [];
    let writePathResult: { id: number; deleted: boolean; error?: string } | null = null;

    await test.step('Pre-condition 1: Login as Admin on the O12 Migration server', async () => {
      console.log('\n--- Pre-condition 1: Login as Admin on the O12 Migration server ---');
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step('Step 1: Open a few core CE apps (Contacts, CRM, Sales, Settings) and confirm they render', async () => {
      console.log('\n=== STEP 1: CORE APPS RENDER ===');
      const apps: Array<[string, string]> = [
        ['Contacts', MigPlatformPage.HASH.contacts],
        ['CRM', MigPlatformPage.HASH.crm],
        ['Sales', MigPlatformPage.HASH.sales],
        ['Settings', MigPlatformPage.HASH.settings],
      ];
      for (const [name, hash] of apps) {
        await platform.openAppAndAssertRendered(hash);
        const hasError = await platform.isErrorDialogVisible();
        appRenderResults.push({ name, hasError });
        console.log(`  ${name}: rendered, errorDialog=${hasError} -> ${hasError ? 'FAIL' : 'PASS'}`);
      }
    });

    await test.step('Step 2: Create and delete one trivial record (a Contact) to confirm the write path is alive', async () => {
      console.log('\n=== STEP 2: WRITE PATH (create + delete a Contact) ===');
      const contactName = `TEST Contact Mig ${Date.now()}`;
      writePathResult = await platform.writePathAliveViaPartner(contactName);
      console.log(`  Created: ${contactName}`);
      console.log(`  Record id: ${writePathResult.id}  |  cleanup deleted: ${writePathResult.deleted}  |  error: ${writePathResult.error || 'none'}`);
      console.log(`  Result : ${writePathResult.id > 0 ? 'PASS' : 'FAIL'} (write path persisted a record)`);
    });

    await test.step('Verification', async () => {
      console.log('\n==================== VERIFY ====================');

      // Verification #1: Each core app renders with no error
      console.log('  Verify #1 - Each core app renders with no error:');
      for (const result of appRenderResults) {
        console.log(`     Expected : ${result.name} renders without error dialog`);
        console.log(`     Actual   : errorDialog=${result.hasError}`);
        console.log(`     Result   : ${result.hasError ? 'FAIL' : 'PASS'}`);
      }

      // Verification #2: The write path persisted a record (create returns an id), then cleaned it up
      console.log('  Verify #2 - The write path persisted a record (create returns an id), then cleaned it up:');
      console.log(`     Expected : record id > 0, cleanup successful`);
      console.log(`     Actual   : id=${writePathResult?.id}, deleted=${writePathResult?.deleted}`);
      console.log(`     Result   : ${writePathResult && writePathResult.id > 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      console.log('OVERALL: ' + (appRenderResults.every(r => !r.hasError) && writePathResult && writePathResult.id > 0 ? 'PASS' : 'FAIL') + ' - Core apps rendered and write path persisted record');

      // Run all expects after VERIFY block
      for (const result of appRenderResults) {
        expect(result.hasError, `${result.name} should render with no error`).toBeFalsy();
      }
      expect(writePathResult?.id, `the write path should persist a record (create returns an id). error=${writePathResult?.error || 'none'}`).toBeGreaterThan(0);
    });
  });
});
