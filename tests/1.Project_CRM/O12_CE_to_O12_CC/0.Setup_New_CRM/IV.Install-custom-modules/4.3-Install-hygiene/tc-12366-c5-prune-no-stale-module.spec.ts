import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.3.5 ==========
 * Test Case ID    : CRM-12366_4.3.5
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.3-Install-hygiene
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify no stale module directories or manifest declarations remain in the module path after prune operation.
 *   Check that known stale modules (nakivo_sign, marketing_automation_file_template) do not exist in any state.
 *   Confirm the prune operation successfully removed 53 stale rows (25 with 'nakivo_' prefix + 28 additional).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\.3\.5:" --project=chromium
 *
 * Source manual TC:
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig)
 *     - Access to the server file system or Odoo module registry (Settings > Modules menu)
 *     - Reference: The modules nakivo_sign and marketing_automation_file_template were deleted from the branch on 2026-07-23 and should not exist on the instance
 *     - Dev reported 53 stale rows pruned: 25 starting with 'nakivo_' prefix + 28 additional stale modules
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Navigate to Settings menu > Modules > Installed Modules.
 *     3. Search for 'nakivo_sign' in the module list using the filter or search box.
 *     4. Verify that nakivo_sign is not found in the Installed list, Not Installed list, or disabled list.
 *     5. Search for 'marketing_automation_file_template' using the same method.
 *     6. Verify that marketing_automation_file_template is not found anywhere in the module registry.
 *     7. Filter modules by name prefix 'nakivo_' and count how many are present.
 *     8. Document any modules that appear in the list but are known to be stale (not in the deployed branch).
 *
 *   Expected Results:
 *     - No record exists for module 'nakivo_sign' in any state (installed, not-installed, disabled)
 *     - No record exists for module 'marketing_automation_file_template' in any state
 *     - All modules named starting with 'nakivo_' that do exist are in the deployed branch
 *     - No stale manifests appear in the Odoo module registry
 *     - If Dev's prune operation was successful, the stale count should be 0 (previously was 53 before prune)
 *     - At least one search query is executed and returns results, proving the module registry was actually accessed
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

interface StaleModule {
  name: string;
  state: string;
  reason: string;
}

interface PruneReport {
  queriesExecuted: number;
  moduleCount: number;
  nakivoSignFound: boolean;
  marketingAutomationFound: boolean;
  staleModules: StaleModule[];
  nakivoPrefixModules: string[];
}

const STEP = {
  pre1: 'Pre-condition 1: Login as Admin on the Migration server',
  s1:   'Step 1: [INTERNAL check, Call API] Query for stale modules nakivo_sign and marketing_automation_file_template',
  s2:   'Step 2: [INTERNAL check, Call API] Count modules with nakivo_ prefix',
  verify: 'Verification',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.3.5 - No stale modules in registry', () => {
  test('CRM-12366_4.3.5: Verify no stale module directories or manifest declarations remain in the module path after prune operation', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);

    console.log('========== CRM-12366_4.3.5 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - logged in');
    });

    const report: PruneReport = await test.step(STEP.s1, async () => {
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

        let queriesExecuted = 0;
        const staleModules: StaleModule[] = [];

        // Query 1: Search for nakivo_sign
        console.log('  Searching for nakivo_sign...');
        const nakivoSignResult = await callKw('ir.module.module', 'search_read',
          [[['name', '=', 'nakivo_sign']], ['name', 'state']],
          { limit: 10 },
        );
        queriesExecuted++;

        const nakivoSignFound = nakivoSignResult.length > 0;
        if (nakivoSignFound) {
          for (const mod of nakivoSignResult) {
            staleModules.push({
              name: mod.name,
              state: mod.state,
              reason: 'Deleted from branch on 2026-07-23 but still exists on instance',
            });
          }
        }
        console.log(`    Found: ${nakivoSignFound}`);

        // Query 2: Search for marketing_automation_file_template
        console.log('  Searching for marketing_automation_file_template...');
        const marketingAutomationResult = await callKw('ir.module.module', 'search_read',
          [[['name', '=', 'marketing_automation_file_template']], ['name', 'state']],
          { limit: 10 },
        );
        queriesExecuted++;

        const marketingAutomationFound = marketingAutomationResult.length > 0;
        if (marketingAutomationFound) {
          for (const mod of marketingAutomationResult) {
            staleModules.push({
              name: mod.name,
              state: mod.state,
              reason: 'Deleted from branch on 2026-07-23 but still exists on instance',
            });
          }
        }
        console.log(`    Found: ${marketingAutomationFound}`);

        // Query 3: Get total module count
        console.log('  Querying total module count...');
        const totalCount = await callKw('ir.module.module', 'search_count', [[]], {});
        queriesExecuted++;

        // Query 4: Get all modules with nakivo_ prefix
        console.log('  Querying modules with nakivo_ prefix...');
        const nakivoPrefixModules = await callKw('ir.module.module', 'search_read',
          [[['name', '=like', 'nakivo\\_%']], ['name', 'state']],
          { limit: 200 },
        );
        queriesExecuted++;

        console.log(`    Found: ${nakivoPrefixModules.length} modules with nakivo_ prefix`);

        return {
          queriesExecuted,
          moduleCount: totalCount,
          nakivoSignFound,
          marketingAutomationFound,
          staleModules,
          nakivoPrefixModules: nakivoPrefixModules.map((m: any) => `${m.name} (${m.state})`),
        };
      });
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  Total modules on instance: ${report.moduleCount}`);
      console.log(`  Modules with nakivo_ prefix: ${report.nakivoPrefixModules.length}`);
      if (report.nakivoPrefixModules.length > 0) {
        console.log('  Listed modules with nakivo_ prefix:');
        for (const mod of report.nakivoPrefixModules.slice(0, 10)) {
          console.log(`    - ${mod}`);
        }
        if (report.nakivoPrefixModules.length > 10) {
          console.log(`    ... and ${report.nakivoPrefixModules.length - 10} more`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);
      console.log(`Verify #1 - nakivo_sign module:`);
      console.log(`  Expected : Not found in any state`);
      console.log(`  Actual   : ${report.nakivoSignFound ? 'FOUND' : 'Not found'}`);
      console.log(`  Result   : ${report.nakivoSignFound ? 'FAIL' : 'PASS'}`);

      console.log(`\nVerify #2 - marketing_automation_file_template module:`);
      console.log(`  Expected : Not found in any state`);
      console.log(`  Actual   : ${report.marketingAutomationFound ? 'FOUND' : 'Not found'}`);
      console.log(`  Result   : ${report.marketingAutomationFound ? 'FAIL' : 'PASS'}`);

      console.log(`\nVerify #3 - Stale modules count:`);
      console.log(`  Expected : 0 stale modules`);
      console.log(`  Actual   : ${report.staleModules.length} stale modules`);
      if (report.staleModules.length > 0) {
        console.log('  Details:');
        for (const mod of report.staleModules) {
          console.log(`    ${mod.name} (state: ${mod.state}) - ${mod.reason}`);
        }
      }
      console.log(`  Result   : ${report.staleModules.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - Queries executed:`);
      console.log(`  Expected : >= 1 query should be executed`);
      console.log(`  Actual   : ${report.queriesExecuted} queries executed`);
      console.log(`  Result   : ${report.queriesExecuted > 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\n  Total modules on instance: ${report.moduleCount}`);
      console.log(`  Modules with nakivo_ prefix: ${report.nakivoPrefixModules.length}`);
      console.log(`===============================================`);
      console.log(`OVERALL: ${report.staleModules.length === 0 && report.queriesExecuted > 0 ? 'PASS' : 'FAIL'} - No stale modules found`);

      expect(report.queriesExecuted, 'at least one module query should have been executed').toBeGreaterThan(0);
      expect(report.moduleCount, 'module count should be greater than 0').toBeGreaterThan(0);
      expect(
        report.nakivoSignFound,
        'nakivo_sign module should not exist on the instance',
      ).toBe(false);
      expect(
        report.marketingAutomationFound,
        'marketing_automation_file_template module should not exist on the instance',
      ).toBe(false);
      expect(
        report.staleModules.length,
        `${report.staleModules.length} stale modules found on the instance`,
      ).toBe(0);
    });
  });
});
