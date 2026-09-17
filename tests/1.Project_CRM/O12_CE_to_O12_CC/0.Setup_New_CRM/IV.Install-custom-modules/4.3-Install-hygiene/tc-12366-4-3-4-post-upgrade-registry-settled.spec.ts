import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { MigPlatformPage } from '@pages/mig/MigPlatformPage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ========== CRM-12366_4.3.4 ==========
 * Test Case ID    : CRM-12366_4.3.4
 * Jira            : CRM-12366
 * Test Repository : CRM test/Migration - Setup New CRM/CRM-12366 - Install Nakivo custom modules on the new Odoo 12 CE (QA verify)/4.3 Install hygiene, including prune
 * Target          : crm-mig.nakivo.site (O12 Migration server, db nakivoCE) - READ-ONLY
 * Automation-Type : rewritten
 * Automation-Date : 2026-09-17
 *
 * Summary:
 *   Verify the instance carries the signature of a completed, error-free upgrade pass: nothing
 *   left mid-flight, every installed module versioned, and the metadata registry internally
 *   consistent - no external id naming a model that does not exist, and no view inheriting
 *   from a view that is gone.
 *
 * WHY THIS WAS REWRITTEN (2026-09-17):
 *   The original wording scored the ERROR / CRITICAL line count of a Dev-supplied install log.
 *   That log is not attached to CRM-12126 - the ticket carries only
 *   CRM-12126_mandatory_modules_revised.txt, CRM-12126_branch_module_list.txt and
 *   MIGRATION_MAPPING.json - so by its own pre-condition the case was BLOCKED and unscorable,
 *   and running an upgrade pass is a write and a Dev step, never a QA step on this host.
 *
 *   It now asserts what a failed or half-finished upgrade LEAVES BEHIND on the instance, all of
 *   which is readable over an authenticated JSON-RPC session:
 *     - a module stuck in a transitional state,
 *     - an installed module with no version stamped,
 *     - an external id pointing at a model the registry no longer knows,
 *     - a view whose parent view was deleted under it.
 *
 * WHAT THIS DOES NOT REPLACE:
 *   Dev's own statement that the pass produced 0 ERROR / 0 CRITICAL (CRM-12126 comment 687015,
 *   2026-08-26) stays a Dev attestation. This TC does not verify that count - it verifies the
 *   instance is consistent with such a pass. The log ask stays open on CRM-12126.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12366_4\\.3\\.4:" --project=O12
 *
 * Source manual TC (rewritten):
 *   Pre-conditions:
 *     - VPN connected and crm-mig.nakivo.site reachable
 *     - Login as anh.ho@nakivo.com (admin_crm_mig), db nakivoCE
 *     - crm-mig is read-only for this TC: it creates, modifies and deletes nothing
 *     - QA never triggers an upgrade pass on this host - that is a write and a Dev step
 *
 *   Steps:
 *     1. Use the account of Admin to login successful.
 *     2. Count the modules left in state To Install, To Upgrade or To Remove.
 *     3. Count the installed modules that carry no version stamp.
 *     4. Group ir.model.data by model and check every model named there exists in ir.model.
 *     5. Read every view and check each inherit_id resolves to a view that still exists.
 *     6. Group ir.model.data by module; for every owning module that is no longer a module row -
 *        excluding Odoo's own __export__ and __import__ pseudo-modules - check whether the
 *        records it still names are alive, and report them.
 *
 *   Expected:
 *     - 0 modules in a transitional state
 *     - 0 installed modules with a blank version stamp
 *     - 0 external ids naming a model absent from ir.model
 *     - 0 views inheriting from a view that no longer exists
 *     - 0 external ids owned by an orphan module whose record has ALSO gone - an orphan whose
 *       record is still alive is reported, not failed
 *     - The scan is proved to have run: >= 200 installed modules, >= 100 distinct models in
 *       ir.model.data and >= 1000 views were examined
 * Evidence: stdout only - this TC drives no UI, so the auto-captured screenshot would
 *   show an idle page. Every step below is an authenticated JSON-RPC read; the console
 *   output IS the artifact. UI capture is disabled for this spec on purpose.
 */

// RPC-only spec: no screen is driven, so a screenshot/video would only show an idle page.
test.use({ screenshot: 'off', video: 'off' });

/**
 * Odoo writes these two pseudo-modules itself: __export__ for every record exported through the
 * UI and __import__ for imported ones. They are not add-ons and never appear in
 * ir.module.module, so they are excluded from the orphan check rather than reported forever.
 */
const PSEUDO_MODULES = ['__export__', '__import__'] as const;

const TRANSITIONAL_STATES = ['to install', 'to upgrade', 'to remove'] as const;

/** Floors that prove each query actually reached its table instead of returning an empty page. */
const SCAN_FLOORS = { installedModules: 200, distinctDataModels: 100, views: 1000 } as const;

interface OrphanModule {
  module: string;
  rows: number;
  deadRefs: number;
  sample: string;
}

interface Outcome {
  transitional: number;
  transitionalNames: string[];
  installedTotal: number;
  blankVersion: number;
  blankVersionNames: string[];
  distinctDataModels: number;
  liveModels: number;
  danglingModels: string[];
  viewsRead: number;
  brokenInherit: Array<{ id: number; inheritId: number }>;
  orphanModules: OrphanModule[];
  deadOrphanRefs: number;
}

test.describe('CRM-12366 4.3.4 - Post-upgrade registry is settled', () => {
  const STEP = {
    pre1: 'Pre-condition: login on the Migration server',
    s1: 'Step 2-3: [INTERNAL check, Call API] Module states and version stamps',
    s2: 'Step 4: [INTERNAL check, Call API] Every model named in ir.model.data exists in ir.model',
    s3: 'Step 5: [INTERNAL check, Call API] Every view inherit_id resolves to a live view',
    s4: 'Step 6: [INTERNAL check, Call API] External ids owned by a module that is gone',
    verify: 'Verification',
  } as const;

  test('CRM-12366_4.3.4: Verify the instance is in a settled, internally consistent post-upgrade state', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.setViewportSize({ width: 1600, height: 900 });

    const loginPage = new LoginPageMig(page);
    const migPlatform = new MigPlatformPage(page);

    console.log('========== CRM-12366_4.3.4 ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      await page.waitForTimeout(CommonUtils.waitTimes.medium);
      console.log('  OK - logged in');
    });

    const modules = await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);

      const transitionalRows: Array<{ name: string; state: string }> = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[['state', 'in', [...TRANSITIONAL_STATES]]]],
        { fields: ['name', 'state'], limit: 500 },
      );
      const installedTotal: number = await migPlatform.callKw(
        'ir.module.module',
        'search_count',
        [[['state', '=', 'installed']]],
        {},
      );
      const blankRows: Array<{ name: string }> = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[['state', '=', 'installed'], ['latest_version', 'in', [false, '']]]],
        { fields: ['name'], limit: 500 },
      );

      console.log(`  installed modules              : ${installedTotal}`);
      console.log(`  in a transitional state        : ${transitionalRows.length}`);
      transitionalRows.forEach((r) => console.log(`    - ${r.name} (${r.state})`));
      console.log(`  installed without a version    : ${blankRows.length}`);
      blankRows.forEach((r) => console.log(`    - ${r.name}`));

      return {
        transitional: transitionalRows.length,
        transitionalNames: transitionalRows.map((r) => `${r.name} (${r.state})`),
        installedTotal,
        blankVersion: blankRows.length,
        blankVersionNames: blankRows.map((r) => r.name),
      };
    });

    const dataModels = await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      const grouped: Array<{ model: string }> = await migPlatform.callKw(
        'ir.model.data',
        'read_group',
        [[], ['id'], ['model']],
        { lazy: false, limit: 2000 },
      );
      const namedModels = grouped.map((g) => g.model).filter(Boolean);

      const live: Array<{ model: string }> = await migPlatform.callKw(
        'ir.model',
        'search_read',
        [[]],
        { fields: ['model'], limit: 5000 },
      );
      const liveSet = new Set(live.map((m) => m.model));
      const dangling = namedModels.filter((m) => !liveSet.has(m));

      console.log(`  distinct models named in ir.model.data : ${namedModels.length}`);
      console.log(`  models registered in ir.model          : ${liveSet.size}`);
      console.log(`  naming a model that does NOT exist     : ${dangling.length}`);
      dangling.forEach((m) => console.log(`    - ${m}`));

      return { distinctDataModels: namedModels.length, liveModels: liveSet.size, danglingModels: dangling };
    });

    const views = await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      const rows: Array<{ id: number; inherit_id: [number, string] | false }> = await migPlatform.callKw(
        'ir.ui.view',
        'search_read',
        [[]],
        { fields: ['id', 'inherit_id'], limit: 20000, context: { active_test: false } },
      );
      const ids = new Set(rows.map((r) => r.id));
      const broken = rows
        .filter((r) => r.inherit_id && !ids.has(r.inherit_id[0]))
        .map((r) => ({ id: r.id, inheritId: (r.inherit_id as [number, string])[0] }));

      console.log(`  views read (archived included) : ${rows.length}`);
      console.log(`  inheriting from a missing view : ${broken.length}`);
      broken.slice(0, 20).forEach((b) => console.log(`    - view ${b.id} inherits missing view ${b.inheritId}`));

      return { viewsRead: rows.length, brokenInherit: broken };
    });

    const orphans = await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      const grouped: Array<{ module: string; __count: number }> = await migPlatform.callKw(
        'ir.model.data',
        'read_group',
        [[], ['id'], ['module']],
        { lazy: false, limit: 2000 },
      );
      const known: Array<{ name: string }> = await migPlatform.callKw(
        'ir.module.module',
        'search_read',
        [[]],
        { fields: ['name'], limit: 5000, context: { active_test: false } },
      );
      const knownSet = new Set(known.map((m) => m.name));

      const orphanGroups = grouped.filter(
        (g) => g.module && !knownSet.has(g.module) && !PSEUDO_MODULES.includes(g.module as typeof PSEUDO_MODULES[number]),
      );

      console.log(`  distinct owning modules in ir.model.data : ${grouped.length}`);
      console.log(`  module rows known to ir.module.module    : ${knownSet.size}`);
      console.log(`  pseudo-modules excluded by design        : ${PSEUDO_MODULES.join(', ')}`);
      console.log(`  owning modules that no longer exist      : ${orphanGroups.length}`);

      const detail: OrphanModule[] = [];
      let deadOrphanRefs = 0;

      for (const g of orphanGroups) {
        const rows: Array<{ name: string; model: string; res_id: number }> = await migPlatform.callKw(
          'ir.model.data',
          'search_read',
          [[['module', '=', g.module]]],
          { fields: ['name', 'model', 'res_id'], limit: 200 },
        );

        // Group the references by target model, then ask each model which ids still exist.
        const byModel = new Map<string, number[]>();
        rows.forEach((r) => {
          const list = byModel.get(r.model) ?? [];
          list.push(r.res_id);
          byModel.set(r.model, list);
        });

        let dead = 0;
        for (const [model, resIds] of byModel) {
          try {
            const alive: Array<{ id: number }> = await migPlatform.callKw(
              model,
              'search_read',
              [[['id', 'in', resIds]]],
              { fields: ['id'], limit: 500, context: { active_test: false } },
            );
            dead += resIds.length - alive.length;
          } catch {
            // The model itself is gone - every reference into it is dead.
            dead += resIds.length;
          }
        }

        deadOrphanRefs += dead;
        const sample = rows.slice(0, 3).map((r) => `${g.module}.${r.name} -> ${r.model}#${r.res_id}`).join(' ; ');
        detail.push({ module: g.module, rows: rows.length, deadRefs: dead, sample });
        console.log(`    - ${g.module}: ${rows.length} row(s), ${dead} pointing at a record that is gone`);
        console.log(`        ${sample}`);
      }

      return { orphanModules: detail, deadOrphanRefs };
    });

    const result: Outcome = { ...modules, ...dataModels, ...views, ...orphans };

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`\n==================== VERIFY ====================`);

      const scanRan =
        result.installedTotal >= SCAN_FLOORS.installedModules &&
        result.distinctDataModels >= SCAN_FLOORS.distinctDataModels &&
        result.viewsRead >= SCAN_FLOORS.views;

      console.log(`Verify #1 - the scan actually reached its tables:`);
      console.log(
        `   Expected : >= ${SCAN_FLOORS.installedModules} installed modules, >= ${SCAN_FLOORS.distinctDataModels} distinct models, >= ${SCAN_FLOORS.views} views`,
      );
      console.log(`   Actual   : ${result.installedTotal} / ${result.distinctDataModels} / ${result.viewsRead}`);
      console.log(`   Result   : ${scanRan ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #2 - no module left mid-flight:`);
      console.log(`   Expected : 0 in To Install / To Upgrade / To Remove`);
      console.log(`   Actual   : ${result.transitional}${result.transitional ? ' -> ' + result.transitionalNames.join(', ') : ''}`);
      console.log(`   Result   : ${result.transitional === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #3 - every installed module carries a version stamp:`);
      console.log(`   Expected : 0 blank`);
      console.log(`   Actual   : ${result.blankVersion}${result.blankVersion ? ' -> ' + result.blankVersionNames.join(', ') : ''}`);
      console.log(`   Result   : ${result.blankVersion === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #4 - no external id names a model the registry lost:`);
      console.log(`   Expected : 0`);
      console.log(`   Actual   : ${result.danglingModels.length}${result.danglingModels.length ? ' -> ' + result.danglingModels.join(', ') : ''}`);
      console.log(`   Result   : ${result.danglingModels.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #5 - no view inherits from a view that is gone:`);
      console.log(`   Expected : 0`);
      console.log(`   Actual   : ${result.brokenInherit.length}`);
      console.log(`   Result   : ${result.brokenInherit.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nVerify #6 - external ids owned by a module that no longer exists:`);
      console.log(`   Expected : 0 of them point at a record that is ALSO gone`);
      console.log(`   Actual   : ${result.orphanModules.length} orphan module(s), ${result.deadOrphanRefs} dead reference(s)`);
      result.orphanModules.forEach((o) =>
        console.log(`     REPORTED  ${o.module}: ${o.rows} row(s), ${o.deadRefs} dead - ${o.sample}`),
      );
      if (result.orphanModules.length > 0 && result.deadOrphanRefs === 0) {
        console.log(`   Note     : the orphan rows above still resolve to live records, so they are`);
        console.log(`              stale metadata rather than a broken reference - reported, not failed.`);
        console.log(`              They belong with the prune question on CRM-12366_4.3.5 / 4.3.6.`);
      }
      console.log(`   Result   : ${result.deadOrphanRefs === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`\nNOTE: this TC does not verify Dev's 0 ERROR / 0 CRITICAL line count for the second`);
      console.log(`      upgrade pass (CRM-12126 comment 687015) - that stays a Dev attestation and the`);
      console.log(`      install-log ask stays open on CRM-12126. What is scored here is that the`);
      console.log(`      instance is CONSISTENT with a completed, error-free pass.`);
      console.log(`===============================================`);

      const overall =
        scanRan &&
        result.transitional === 0 &&
        result.blankVersion === 0 &&
        result.danglingModels.length === 0 &&
        result.brokenInherit.length === 0 &&
        result.deadOrphanRefs === 0;
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - post-upgrade registry is settled and consistent`);

      expect(result.installedTotal, 'too few installed modules read - the scan did not reach the table')
        .toBeGreaterThanOrEqual(SCAN_FLOORS.installedModules);
      expect(result.distinctDataModels, 'too few distinct models read - the scan did not reach ir.model.data')
        .toBeGreaterThanOrEqual(SCAN_FLOORS.distinctDataModels);
      expect(result.viewsRead, 'too few views read - the scan did not reach ir.ui.view')
        .toBeGreaterThanOrEqual(SCAN_FLOORS.views);
      expect(result.transitional, 'a module is still in a transitional state').toBe(0);
      expect(result.blankVersion, 'an installed module carries no version stamp').toBe(0);
      expect(result.danglingModels, 'an external id names a model that is not in ir.model').toEqual([]);
      expect(result.brokenInherit, 'a view inherits from a view that no longer exists').toEqual([]);
      expect(result.deadOrphanRefs, 'an orphan module still names records that are gone').toBe(0);
    });
  });
});
