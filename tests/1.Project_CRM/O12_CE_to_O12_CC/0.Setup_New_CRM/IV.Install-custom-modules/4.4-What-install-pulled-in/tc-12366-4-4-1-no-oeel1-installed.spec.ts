import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.4.1 ==========
 * Test Case ID    : CRM-12366_4.4.1
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.4-What-install-pulled-in
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that no modules with OEEL-1 (Odoo Enterprise licence) are installed, proving the
 *   Enterprise license was not embedded in the install.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.4\\.1:" --project=chromium
 *
 * Source manual TC:
 * Pre-conditions:
 *   - VPN connection is active and crm-mig.nakivo.site is reachable.
 *   - Logged in as admin_crm_mig (anh.ho@nakivo.com).
 *   - Odoo 12.0 Community Edition on db nakivoCE.
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to Settings > Modules > Modules menu.
 *   3. Use the search bar to filter by license field.
 *   4. Search for modules with license value OEEL-1.
 *   5. Count the number of modules with status Installed.
 *   6. AUTOMATION: Query ir.module.module filtered by license='OEEL-1' and state='installed'; confirm count is 0.
 *
 * Expected Results:
 *   - The count of installed modules with OEEL-1 license is 0.
 *   - At least one module row is visible in the search results (proving the query ran and scanned the module list).
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

interface ModuleQueryResult {
  oeel1ModulesScanned: number;
  oeel1ModulesInstalled: number;
  installedModules: Array<{ id: number; name: string; license: string; state: string }>;
}

const STEP = {
  pre1: 'Pre-condition: log in on the Migration server',
  s1: 'Step 1-6: [INTERNAL check, Call API] Query ir.module.module for OEEL-1 installed modules and verify count is 0',
  verify: 'Verification',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.4.1 - no OEEL-1 modules installed', () => {
  test('CRM-12366_4.4.1: no modules with OEEL-1 license are installed on the new CE base', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);

    console.log('========== CRM-12366_4.4.1 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const result: ModuleQueryResult = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      return await page.evaluate(async () => {
        async function callKw(model: string, method: string, args: any[], kwargs: any = {}) {
          const r = await fetch('/web/dataset/call_kw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
          });
          const j = await r.json();
          if (j.error) {
            const d = j.error.data || {};
            throw new Error(String(d.message || j.error.message || 'rpc error').slice(0, 300));
          }
          return j.result;
        }

        // Query all modules to prove the scan happened
        const allModulesDomain: any[] = [];
        const allModules: any[] = await callKw('ir.module.module', 'search_read', [allModulesDomain, ['name', 'license', 'state']], { limit: 5000 });

        // Query only OEEL-1 modules
        const oeel1Domain: any[] = [['license', '=', 'OEEL-1']];
        const oeel1Modules: any[] = await callKw('ir.module.module', 'search_read', [oeel1Domain, ['id', 'name', 'license', 'state']], { limit: 5000 });

        // Query OEEL-1 modules that are installed
        const oeel1InstalledDomain: any[] = [['license', '=', 'OEEL-1'], ['state', '=', 'installed']];
        const oeel1Installed: any[] = await callKw('ir.module.module', 'search_read', [oeel1InstalledDomain, ['id', 'name', 'license', 'state']], { limit: 5000 });

        return {
          oeel1ModulesScanned: oeel1Modules.length,
          oeel1ModulesInstalled: oeel1Installed.length,
          installedModules: oeel1Installed,
        };
      });
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('\n==================== VERIFY ====================');
      console.log(`Total OEEL-1 modules found (any state) : ${result.oeel1ModulesScanned}`);
      console.log(`OEEL-1 modules installed              : ${result.oeel1ModulesInstalled}`);
      console.log(`\nVerify #1 - Query execution:`);
      console.log(`  Expected : at least 1 OEEL-1 module found (proves query ran)`);
      console.log(`  Actual   : ${result.oeel1ModulesScanned} OEEL-1 modules found`);
      console.log(`  Result   : ${result.oeel1ModulesScanned > 0 ? 'PASS' : 'FAIL'}`);
      console.log(`\nVerify #2 - No OEEL-1 modules installed:`);
      console.log(`  Expected : 0 installed OEEL-1 modules`);
      console.log(`  Actual   : ${result.oeel1ModulesInstalled} installed OEEL-1 modules`);
      console.log(`  Result   : ${result.oeel1ModulesInstalled === 0 ? 'PASS' : 'FAIL'}`);

      if (result.installedModules.length > 0) {
        console.log(`\n  Installed OEEL-1 modules found:`);
        for (const m of result.installedModules) {
          console.log(`    - ${m.name} (id: ${m.id}, license: ${m.license}, state: ${m.state})`);
        }
      }

      console.log(`\n===============================================`);
      console.log(`OVERALL: ${result.oeel1ModulesInstalled === 0 && result.oeel1ModulesScanned > 0 ? 'PASS' : 'FAIL'} - Enterprise license not embedded in the CE install`);

      expect(result.oeel1ModulesScanned, 'at least 1 OEEL-1 module must be found to prove the query scanned the module list').toBeGreaterThan(0);
      expect(result.oeel1ModulesInstalled, `no OEEL-1 modules should be installed, but found ${result.oeel1ModulesInstalled}`).toBe(0);
    });
  });
});
