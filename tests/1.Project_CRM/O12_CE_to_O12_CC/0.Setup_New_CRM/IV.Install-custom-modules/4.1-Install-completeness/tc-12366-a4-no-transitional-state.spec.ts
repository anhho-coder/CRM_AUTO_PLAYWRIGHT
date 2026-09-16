import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-12366 section 4.1 - Install completeness
 * Test Case ID: CRM-12366_4.1.4
 * Jira: CRM-12366
 * Test Repository: CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.1-Install-completeness
 * Target: crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 *
 * Summary:
 *   Verify that no Odoo module remains in a transitional installation state (To Upgrade,
 *   To Install, or To Remove). A module stuck in any of these states indicates that the
 *   last installation or upgrade operation did not complete successfully.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4.1.4:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connection required to reach crm-mig.nakivo.site
 *     - Host crm-mig.nakivo.site is reachable and responding normally
 *     - User anh.ho@nakivo.com logged in with admin_crm_mig credentials
 *     - Apps menu is accessible
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to the Apps menu.
 *     3. Remove the default filter to view all modules.
 *     4. Scan all module rows and check for any module with state = "To Upgrade".
 *     5. Scan all module rows and check for any module with state = "To Install".
 *     6. Scan all module rows and check for any module with state = "To Remove".
 *     7. Record the count of modules found in each transitional state.
 *
 *   Expected Results:
 *     - Count of modules with state = "To Upgrade": 0
 *     - Count of modules with state = "To Install": 0
 *     - Count of modules with state = "To Remove": 0
 *     - At least 100 module rows were scanned (baseline 129 nakivo_* modules present), confirming the check actually examined the full module inventory
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

const STEP = {
  pre: 'Pre-condition: log in to the Migration server',
  s1: 'Step 1: [INTERNAL check, Call API] Retrieve all modules from the instance',
  s2: 'Step 2: [INTERNAL check, Call API] Scan for transitional states',
  verify: 'Verification: no modules in transitional states',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366_4.1 - Install completeness', () => {
  test('CRM-12366_4.1.4: verify no module remains in a transitional state', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPage = new MigPlatformPage(page);

    console.log('\n========== CRM-12366_4.1.4 ==========');

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    let allModules: Array<{ name: string; state: string }> = [];

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      allModules = await migPage.getModules();
      console.log(`  Total modules retrieved: ${allModules.length}`);
    });

    let toUpgradeModules: Array<{ name: string; state: string }> = [];
    let toInstallModules: Array<{ name: string; state: string }> = [];
    let toRemoveModules: Array<{ name: string; state: string }> = [];

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      toUpgradeModules = allModules.filter((m) => m.state === 'to upgrade');
      toInstallModules = allModules.filter((m) => m.state === 'to install');
      toRemoveModules = allModules.filter((m) => m.state === 'to remove');

      console.log(`  Modules scanned: ${allModules.length}`);
      console.log(`  To Upgrade: ${toUpgradeModules.length}`);
      console.log(`  To Install: ${toInstallModules.length}`);
      console.log(`  To Remove: ${toRemoveModules.length}`);

      if (toUpgradeModules.length > 0) {
        console.log('\n  To Upgrade modules:');
        for (const m of toUpgradeModules) {
          console.log(`    - ${m.name}`);
        }
      }
      if (toInstallModules.length > 0) {
        console.log('\n  To Install modules:');
        for (const m of toInstallModules) {
          console.log(`    - ${m.name}`);
        }
      }
      if (toRemoveModules.length > 0) {
        console.log('\n  To Remove modules:');
        for (const m of toRemoveModules) {
          console.log(`    - ${m.name}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const totalTransitional = toUpgradeModules.length + toInstallModules.length + toRemoveModules.length;

      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify #1 - No modules in "To Upgrade" state:`);
      console.log(`    Expected : 0`);
      console.log(`    Actual   : ${toUpgradeModules.length}`);
      console.log(`    Result   : ${toUpgradeModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log(`\n  Verify #2 - No modules in "To Install" state:`);
      console.log(`    Expected : 0`);
      console.log(`    Actual   : ${toInstallModules.length}`);
      console.log(`    Result   : ${toInstallModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log(`\n  Verify #3 - No modules in "To Remove" state:`);
      console.log(`    Expected : 0`);
      console.log(`    Actual   : ${toRemoveModules.length}`);
      console.log(`    Result   : ${toRemoveModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log(`\n  Verify #4 - Module inventory scanned (`);
      console.log(`    Expected : >= 100 modules`);
      console.log(`    Actual   : ${allModules.length} modules`);
      console.log(`    Result   : ${allModules.length >= 100 ? 'PASS' : 'FAIL'}`);
      console.log(`\n  OVERALL: ${totalTransitional === 0 ? 'PASS' : 'FAIL'} - no transitional states`);
      console.log('===============================================');

      expect(allModules.length, 'No modules were retrieved - the query may have failed').toBeGreaterThan(0);
      expect(allModules.length, 'At least 100 module rows should have been scanned').toBeGreaterThanOrEqual(100);
      expect(toUpgradeModules.length, 'Modules in "To Upgrade" state found').toBe(0);
      expect(toInstallModules.length, 'Modules in "To Install" state found').toBe(0);
      expect(toRemoveModules.length, 'Modules in "To Remove" state found').toBe(0);
    });
  });
});
