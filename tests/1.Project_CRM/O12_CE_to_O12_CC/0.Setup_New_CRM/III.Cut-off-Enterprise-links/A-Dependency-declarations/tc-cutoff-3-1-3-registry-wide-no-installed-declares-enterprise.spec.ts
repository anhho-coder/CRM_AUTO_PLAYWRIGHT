import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.1 - Enterprise dependency declarations (registry-wide)
 * Test Case ID: CRM-12326_3.1.3
 * Jira: CRM-12568
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3 and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify the registry-wide guard: no installed module ANYWHERE on the new base
 *   (not only inside the 21 in-scope modules) declares one of the 9 Odoo Enterprise
 *   modules. This catches a module outside the agreed scope that also carries an
 *   Enterprise dependency.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 84):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   Login: anh.ho@nakivo.com (admin_crm_mig).
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every ir.module.module.dependency row naming one of the 9 Enterprise modules, with NO restriction to the 21-module scope.
 *   3. Resolve each owning module and its install state.
 *   4. List every owner whose state is installed.
 *
 * Verification Points:
 *   1. 0 installed modules on the whole base declare an Enterprise dependency.
 *   2. Any module found is reported by technical name and by the Enterprise module it declares, so a new one can be added to the cut-off scope.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.1\.3:" --project=chromium
 */

/** The 9 Odoo Enterprise modules the 21 in-scope modules used to depend on (CRM-12125 comment 683452). */
const ENTERPRISE_MODULES = [
  'helpdesk', 'sale_subscription', 'sale_coupon', 'website_sale_coupon', 'website_crm_score',
  'account_asset', 'sign', 'marketing_automation', 'web_studio',
];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  // Manual steps 2, 3 and 4 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into a single "Step 2-4: Read all ...", which read
  // as one opaque block in the report: a reader could not tell which of the three actions a failure
  // came from. Grouping is only allowed for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Read every ir.module.module.dependency row naming one of the 9 Enterprise modules, with NO restriction to the 21-module scope',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve each owning module and its install state',
  s4:      'Step 4: [INTERNAL check, Call API] List every owner whose state is installed',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.1 - Enterprise dependency declarations', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.1.3: [Part2-3.1] Registry-wide guard - no installed module anywhere declares an Enterprise dependency', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let totalDepCount = 0;
    const installedOffenders: Array<{ moduleName: string; enterpriseDependency: string }> = [];

    // Carried between steps 2 -> 3 -> 4, so each manual step owns exactly one action.
    let deps: Array<{ name: string; module_id: Array<number | string> }> = [];
    let ownersById = new Map<number, { id: number; name: string; state: string }>();

    console.log('========== CRM-12326_3.1.3 - Registry-wide guard: no installed module declares Enterprise dependency ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  The 9 Enterprise modules being searched for:');
      ENTERPRISE_MODULES.forEach((m) => console.log(`    - ${m}`));

      // Guard: verify the ir.module.module.dependency table is accessible and has rows.
      // This is the UNFILTERED count, which should be > 0 (ground-truth: 1588 total).
      // If this guard fails, the filtered query below is unreliable.
      totalDepCount = await platform.callKw(
        'ir.module.module.dependency', 'search_count',
        [[]],
        // NO `limit` here: Odoo 12's search_count(domain) takes no limit kwarg and raises
        // "search_count() got an unexpected keyword argument 'limit'". A count is already a
        // single number, so there is nothing to bound - the bounding rule applies to search_read.
        {},
      ) as number;
      console.log(`\n  Total ir.module.module.dependency rows (unfiltered)           : ${totalDepCount}`);

      // Query all ir.module.module.dependency records where name is an Enterprise module
      // No restriction to the 21-module scope - this is registry-wide
      deps = await platform.callKw(
        'ir.module.module.dependency', 'search_read',
        [[['name', 'in', ENTERPRISE_MODULES]], ['name', 'module_id']],
        { limit: 500 },
      ) as Array<{ name: string; module_id: Array<number | string> }>;

      console.log(`  Rows naming one of the 9 Enterprise modules                  : ${deps.length}`);
      if (deps.length === 0) {
        console.log('  -> none found, which is the expected state');
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      const ownerIds = [...new Set(deps.map((d) => d.module_id[0] as number))];
      console.log(`  Distinct owning modules to resolve : ${ownerIds.length}`);

      const owners: Array<{ id: number; name: string; state: string }> = ownerIds.length
        ? await platform.callKw('ir.module.module', 'read', [ownerIds, ['name', 'state']], {})
        : [];
      ownersById = new Map(owners.map((o) => [o.id, o]));

      if (owners.length === 0) {
        console.log('  (no owners to resolve - no dependency row named an Enterprise module)');
      } else {
        console.log('  Owning module and its install state:');
        owners.forEach((o) => console.log(`    - ${o.name.padEnd(36)} state = ${o.state}`));
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Collect installed modules that declare Enterprise dependencies
      for (const dep of deps) {
        const owner = ownersById.get(dep.module_id[0] as number);
        if (!owner) continue;
        console.log(
          `  ${owner.name.padEnd(36)} declares ${dep.name.padEnd(22)} state=${String(owner.state).padEnd(14)}`,
        );
        if (owner.state === 'installed') {
          installedOffenders.push({
            moduleName: owner.name,
            enterpriseDependency: dep.name,
          });
        }
      }

      console.log(`\n  Installed modules declaring Enterprise dependencies : ${installedOffenders.length}`);
    });

    await test.step(STEP.verify, async () => {
      const allOfferersReported = installedOffenders.every(o => o.moduleName && o.enterpriseDependency);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Query reached ir.module.module.dependency table (unfiltered guard):');
      console.log(`     Expected : total rows > 0`);
      console.log(`     Actual   : ${totalDepCount}`);
      console.log(`     Result   : ${totalDepCount > 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - 0 dependency rows name any of the 9 Enterprise modules:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${deps.length}`);
      console.log(`     Result   : ${deps.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - 0 installed modules on the whole base declare an Enterprise dependency:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${installedOffenders.length}`);
      console.log(`     Result   : ${installedOffenders.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Any module found is reported by technical name and by the Enterprise module it declares:');
      console.log(`     Expected : all offenders have moduleName and enterpriseDependency fields`);
      console.log(`     Actual   : ${allOfferersReported ? 'yes, all have both fields' : 'no, some missing fields'}`);
      console.log(`     Result   : ${allOfferersReported ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      const overallPass = totalDepCount > 0 && deps.length === 0 && installedOffenders.length === 0 && allOfferersReported;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Query verified, table accessible, 0 Enterprise dependencies exist`);

      expect(totalDepCount, 'ir.module.module.dependency table should be accessible').toBeGreaterThan(0);
      expect(deps, 'no dependency rows should name any of the 9 Enterprise modules').toHaveLength(0);
      expect(installedOffenders, 'no installed modules anywhere should declare an Enterprise dependency').toHaveLength(0);
      expect(allOfferersReported, 'any modules found must be reported with both moduleName and enterpriseDependency').toBeTruthy();
    });
  });
});
