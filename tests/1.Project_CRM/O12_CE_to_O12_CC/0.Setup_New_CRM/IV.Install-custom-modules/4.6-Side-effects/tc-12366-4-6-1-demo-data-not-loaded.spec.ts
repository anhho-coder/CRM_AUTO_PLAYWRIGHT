import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.6.1 ==========
 * Test Case ID    : CRM-12366_4.6.1
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.6 - Side effects of the install
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that demo data is not loaded on the Odoo 12 CE installation by checking that the
 *   ir.module.module record for the 'base' module has its demo flag set to false (unchecked).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.6\\.1:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN access required
 *     - crm-mig.nakivo.site must be reachable
 *     - Logged in as anh.ho@nakivo.com (admin_crm_mig)
 *     - Odoo 12.0 Community Edition database nakivoCE
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Technical > Modules > Modules.
 *     3. Search for the base module.
 *     4. Open the base module record.
 *     5. Observe the Demo data flag.
 *
 *   Expected:
 *     - ir.module.module base record exists
 *     - demo flag = false (unchecked)
 *     - At least one module record is read, confirming the check executed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.6.1 - Demo data not loaded', () => {
  const STEP = {
    pre1:   'Pre-condition: login on the Migration server',
    s1:     'Step 1-5: [INTERNAL check, Call API] Read the base module record and verify demo flag is false',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.6.1: Verify that demo data is not loaded on Odoo 12 CE', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.6.1 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    interface ModuleRecord {
      id: number;
      name: string;
      demo: boolean;
      state: string;
    }

    const result = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      // Read module records - at least one to confirm the check executed
      const allModules: Array<{ id: number; name: string }> = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[]],
        { limit: 1000 },
      );

      console.log(`  Modules found: ${allModules.length}`);
      expect(allModules.length, 'no module records read - the query found nothing').toBeGreaterThan(0);

      // Search for the 'base' module specifically
      const baseModules: ModuleRecord[] = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[['name', '=', 'base']]],
        { limit: 10 },
      );

      console.log(`  Base module records found: ${baseModules.length}`);
      expect(baseModules.length, 'base module record does not exist').toBe(1);

      const baseModule = baseModules[0];
      console.log(`  Base module name: ${baseModule.name}`);
      console.log(`  Base module demo flag: ${baseModule.demo}`);
      console.log(`  Base module state: ${baseModule.state}`);

      return {
        moduleCount: allModules.length,
        baseModuleExists: baseModules.length === 1,
        baseModule,
      };
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);
      console.log(`Verify #1 - base module exists:`);
      console.log(`   Expected : 1 record`);
      console.log(`   Actual   : ${result.baseModuleExists ? 1 : 0} record(s)`);
      console.log(`   Result   : ${result.baseModuleExists ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - demo flag is false:`);
      console.log(`   Expected : false`);
      console.log(`   Actual   : ${result.baseModule.demo}`);
      console.log(`   Result   : ${result.baseModule.demo === false ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - module records were read:`);
      console.log(`   Expected : > 0`);
      console.log(`   Actual   : ${result.moduleCount}`);
      console.log(`   Result   : ${result.moduleCount > 0 ? 'PASS' : 'FAIL'}`);

      console.log(`===============================================`);
      console.log(`OVERALL: ${result.baseModuleExists && result.baseModule.demo === false ? 'PASS' : 'FAIL'} - base module exists with demo flag = false`);

      expect(result.baseModuleExists, 'base module should exist').toBe(true);
      expect(result.baseModule.demo, 'demo flag should be false').toBe(false);
    });
  });
});
