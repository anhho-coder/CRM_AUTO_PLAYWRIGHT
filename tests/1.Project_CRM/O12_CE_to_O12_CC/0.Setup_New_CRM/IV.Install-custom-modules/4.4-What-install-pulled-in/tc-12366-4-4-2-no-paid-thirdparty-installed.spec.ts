import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.4.2 ==========
 * Test Case ID    : CRM-12366_4.4.2
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.4-What-install-pulled-in
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : new
 * Automation-Date : 2026-09-15
 *
 * Summary:
 *   Verify that no modules with OPL-1 or Other proprietary licence are installed; identify each
 *   installed module and its complete dependency path including external ID references.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.4\\.2:" --project=chromium
 *
 * Source manual TC:
 * Pre-conditions:
 *   - VPN connection is active and crm-mig.nakivo.site is reachable.
 *   - Logged in as admin_crm_mig (anh.ho@nakivo.com).
 *   - Odoo 12.0 Community Edition on db nakivoCE.
 *   - Reference modules from baseline: ks_dashboard_ninja, message_delete, odoo_email_cc_bcc,
 *     org_chart_employee_pro, two_factor_authentication (installed); sync_global_search,
 *     web_dynamic_list, web_export_list_xls (present but uninstalled).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to Settings > Modules > Modules menu.
 *   3. Filter modules by license value OPL-1.
 *   4. Record all modules with status Installed.
 *   5. Filter modules by license value Other proprietary.
 *   6. Record all modules with status Installed.
 *   7. For each installed module found, open its form and check ir.module.module.dependency records.
 *   8. For org_chart_employee_pro (if installed), additionally check ir.model.data records and Views
 *      to trace external ID references that may link it as a dependency from nakivo_hr or other modules.
 *   9. For each installed module, document the full dependency chain: which module(s) caused its installation.
 *   10. AUTOMATION: Query ir.module.module where license in ('OPL-1', 'Other proprietary') and state='installed';
 *       traverse ir.module.module.dependency and ir.model.data to map dependency tree.
 *
 * Expected Results (SCORED PER THE PM RULING, not as a bare zero - see PM_TRACKED_PAID below):
 *   - At least one paid-licence module is found in any state (proving the query ran).
 *   - No paid add-on is installed OUTSIDE the 5 PM already tracks. An extra one is a NEW deviation
 *     from the state PM ruled on and IS this ticket's business -> FAIL.
 *   - IS-CRM-FUNC-0002 itself is reported BLOCKED, never passed: PM ruled on comment 685088 that the
 *     removal sits outside CRM-12126's acceptance but inside the parent feature. A green run here
 *     therefore means "nothing new appeared", NOT "the base is clean of paid add-ons".
 *   - Each installed paid module is listed with its licence, state, tracked/untracked status and its
 *     dependency path, one field per line.
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

interface ModuleWithDependencies {
  id: number;
  name: string;
  license: string;
  state: string;
  dependsOnModules: string[];
}

interface ModuleQueryResult {
  paidModulesScanned: number;
  paidModulesInstalled: number;
  installedModules: ModuleWithDependencies[];
}

/**
 * The paid third-party add-ons PM already knows about and is tracking off this ticket.
 *
 * AUTHORITATIVE SOURCE - CRM-12126 comment 685088 (Aiva Nievierova, 2026-08-21 07:49 +03:00):
 *   "Requirement stands; Dev names the owner. IS-CRM-FUNC-0002 is unconditional - no removed
 *    add-on present in any form - and IS-CRM-FUNC-0005 requires the removed set recorded.
 *    Removal sits outside CRM-12126's acceptance but inside the parent feature: the new base
 *    cannot be accepted with the 5 paid add-ons installed. [...] until it exists and the
 *    IS-CRM-FUNC-0005 record is in place, reporting IS-CRM-FUNC-0002 as blocked rather than
 *    passed is correct. I am tracking this on the PM side."
 *
 * The five names are the ones listed on CRM-12126 comment 683627 (2026-08-20) and re-confirmed
 * by Dev on comment 687015 item 9, which keeps org_chart_employee_pro and message_delete
 * "in the PM-tracked paid-add-on set (IS-CRM-FUNC-0005)".
 *
 * WHY THIS TC DOES NOT ASSERT ZERO. Asserting "0 paid modules installed" makes this spec red on a
 * state PM has already ruled on and moved elsewhere - so the red carries no information and gets
 * skimmed past. What IS this ticket's business is a CHANGE: a paid add-on appearing that was not
 * in the set PM ruled on. That is the assertion below.
 * Concrete case this caught: sync_global_search was "present but uninstalled" on 2026-08-20
 * (comment 683627) and measured INSTALLED on 2026-09-15. No comment on CRM-12126 mentions that
 * change - it is an open question for Dev, not part of the accepted five.
 */
const PM_TRACKED_PAID = [
  'ks_dashboard_ninja',
  'message_delete',
  'odoo_email_cc_bcc',
  'org_chart_employee_pro',
  'two_factor_authentication',
];

const STEP = {
  pre1: 'Pre-condition: log in on the Migration server',
  s1: 'Step 1-10: [INTERNAL check, Call API] Query ir.module.module for OPL-1 and Other proprietary installed modules and map dependencies',
  verify: 'Verification',
} as const;

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

test.describe('CRM-12366 4.4.2 - no paid add-on outside the PM-tracked set (IS-CRM-FUNC-0002 stays BLOCKED)', () => {
  test('CRM-12366_4.4.2: no paid add-on outside the PM-tracked set is installed on the new CE base', async ({ page }, testInfo) => {
    test.setTimeout(20 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);

    console.log('========== CRM-12366_4.4.2 ==========');

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

        // Query all OPL-1 or Other proprietary modules
        const paidDomain: any[] = [['license', 'in', ['OPL-1', 'Other proprietary']]];
        const paidModules: any[] = await callKw('ir.module.module', 'search_read', [paidDomain, ['id', 'name', 'license', 'state']], { limit: 5000 });

        // Query only installed paid modules
        const paidInstalledDomain: any[] = [['license', 'in', ['OPL-1', 'Other proprietary']], ['state', '=', 'installed']];
        const paidInstalled: any[] = await callKw('ir.module.module', 'search_read', [paidInstalledDomain, ['id', 'name', 'license', 'state']], { limit: 5000 });

        // For each installed paid module, fetch its dependencies
        const moduleIds = paidInstalled.map((m) => m.id);
        const modulesWithDeps: ModuleWithDependencies[] = [];

        for (const installedMod of paidInstalled) {
          // Get ir.module.module.dependency records for this module
          const depDomain = [['module_id', '=', installedMod.id]];
          const dependencies: any[] = await callKw('ir.module.module.dependency', 'search_read', [depDomain, ['name']], { limit: 500 });

          modulesWithDeps.push({
            id: installedMod.id,
            name: installedMod.name,
            license: installedMod.license,
            state: installedMod.state,
            dependsOnModules: dependencies.map((d) => d.name),
          });
        }

        return {
          paidModulesScanned: paidModules.length,
          paidModulesInstalled: paidInstalled.length,
          installedModules: modulesWithDeps,
        };
      });
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const installedNames = result.installedModules.map((m) => m.name).sort();
      const untracked = installedNames.filter((n) => !PM_TRACKED_PAID.includes(n));
      const trackedMissing = PM_TRACKED_PAID.filter((n) => !installedNames.includes(n));
      const queryRan = result.paidModulesScanned > 0;

      console.log('\n==================== VERIFY ====================');
      console.log(`Total OPL-1 + Other proprietary modules found (any state) : ${result.paidModulesScanned}`);
      console.log(`OPL-1 + Other proprietary modules installed               : ${result.paidModulesInstalled}`);

      console.log(`\nVerify #1 - the licence query actually ran:`);
      console.log(`  Expected : at least 1 paid-licence module found in any state`);
      console.log(`  Actual   : ${result.paidModulesScanned} found`);
      console.log(`  Result   : ${queryRan ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - no paid add-on OUTSIDE the PM-tracked set is installed:`);
      console.log(`  Expected : 0 installed modules outside the ${PM_TRACKED_PAID.length} PM-tracked ones`);
      console.log(`  Actual   : ${untracked.length}${untracked.length ? ' -> ' + untracked.join(', ') : ''}`);
      console.log(`  Result   : ${untracked.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - IS-CRM-FUNC-0002 itself: BLOCKED, not scored here.`);
      console.log(`  PM ruling, CRM-12126 comment 685088, 2026-08-21 07:49 +03:00:`);
      console.log(`    "Removal sits outside CRM-12126's acceptance but inside the parent feature:`);
      console.log(`     the new base cannot be accepted with the 5 paid add-ons installed. [...]`);
      console.log(`     reporting IS-CRM-FUNC-0002 as blocked rather than passed is correct."`);
      console.log(`  PM-tracked set still installed : ${PM_TRACKED_PAID.filter((n) => installedNames.includes(n)).length} of ${PM_TRACKED_PAID.length}`);
      if (trackedMissing.length) {
        console.log(`  No longer installed            : ${trackedMissing.join(', ')} (removal may have started - tell PM)`);
      }

      console.log(`\n  Installed paid modules, one per line:`);
      for (const m of result.installedModules) {
        const tag = PM_TRACKED_PAID.includes(m.name) ? 'PM-tracked' : '*** NOT IN THE TRACKED SET ***';
        console.log(`    - ${m.name}`);
        console.log(`        licence      : ${m.license}`);
        console.log(`        state        : ${m.state}`);
        console.log(`        status       : ${tag}`);
        console.log(`        dependencies : ${m.dependsOnModules.length ? m.dependsOnModules.join(', ') : '(none in the manifest layer)'}`);
      }

      console.log(`\n===============================================`);
      const verdict = !queryRan || untracked.length > 0 ? 'FAIL' : 'BLOCKED';
      console.log(
        `OVERALL: ${verdict} - IS-CRM-FUNC-0002 is not scored on this ticket; ` +
        `${untracked.length} paid add-on(s) outside the PM-tracked set`,
      );

      testInfo.annotations.push({
        type: 'blocked',
        description:
          'IS-CRM-FUNC-0002 is BLOCKED, not passed - PM ruled on CRM-12126 comment 685088 that removing the ' +
          'paid add-ons sits outside this ticket acceptance but inside the parent feature. A green run here ' +
          'means only that no NEW paid add-on appeared beyond the ' + PM_TRACKED_PAID.length + ' PM-tracked ones.',
      });

      expect(result.paidModulesScanned, 'at least 1 paid module must be found to prove the query scanned the module list').toBeGreaterThan(0);
      expect(
        untracked,
        `paid add-on(s) installed that are NOT in the PM-tracked set of ${PM_TRACKED_PAID.length}: ${untracked.join(', ')}. ` +
        'This is a NEW deviation from the state PM ruled on - raise it on CRM-12126, do not fold it into the tracked set.',
      ).toEqual([]);
    });
  });
});
