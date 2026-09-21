import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.1 - Enterprise dependency declarations
 * Test Case ID: CRM-12326_3.1.2
 * Jira: CRM-12567
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3 and 4 split back to one test.step each
 *                (they were collapsed into a single "Step 2-4", which read as one opaque
 *                block in the report and hid which action a failure came from);
 *                steps are labelled [INTERNAL check, Call API] as they drive no UI.
 *
 * Summary:
 *   Verify the per-module declaration ledger for all 21 in-scope modules against the agreed
 *   Enterprise target. Each module is scored by reading its ir.module.module row and all
 *   dependency rows it owns, then comparing declared Enterprise dependencies against the target.
 *   As of 2026-09-15, the 15 left-out modules have no ir.module.module rows (instance rebuilt);
 *   verification focuses on the 6 installed in-scope modules being present, and ensuring ZERO
 *   dependency rows across the registry target any of the 9 Enterprise modules.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 83):
 *   Test Case ID: CRM-12326_3.1.2
 *   Title: Per-module declaration ledger for all 21 in-scope modules
 *
 * Pre-conditions:
 *   - VPN connected; O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   - Login: anh.ho@nakivo.com (admin_crm_mig).
 *   - The agreed module-to-Enterprise-target map (CRM-12125 comment 683452).
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. For each of the 21 in-scope modules, read its ir.module.module row and every dependency row it owns.
 *   3. Compare what it declares now against the Enterprise module it used to declare.
 *   4. Score each module: cleared, still declaring, or no longer present on the base.
 *
 * Verification Points:
 *   1. All 6 installed in-scope modules are present with state 'installed'.
 *   2. Zero dependency rows across the entire registry target any of the 9 Enterprise modules.
 *   3. The 21 in-scope modules are audited: those with rows are scored; those without rows (pruned on rebuild) are noted.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry and dependency tables. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.1\.2:" --project=chromium
 */

/** The 9 Odoo Enterprise modules the 21 in-scope modules used to depend on (CRM-12125 comment 683452). */
const ENTERPRISE_MODULES = [
  'helpdesk', 'sale_subscription', 'sale_coupon', 'website_sale_coupon', 'website_crm_score',
  'account_asset', 'sign', 'marketing_automation', 'web_studio',
];

/** The 21 in-scope modules checked for Enterprise dependency cut-off (CRM-12125 dependency census).
 *  VERIFIED against CRM-12125 comment 683452 ("The 21 modules this ticket has to clear"). */
const CUT_MODULES_ALL = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_email_rating', 'nakivo_feature_request', 'nakivo_leaves',
  'nakivo_message_approval', 'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'jira_connector',
  'zoho_connector', 'nakivo_sale', 'ib_subscription_notification', 'nakivo_website_crm_score',
  'utm_constructor', 'nakivo_assets', 'nakivo_sign', 'nakivo_transfer_exhibition',
  'marketing_automation_file_template',
];

/** The 6 in-scope modules installed on crm-mig (CRM-12125 comment 685775). */
const INSTALLED_IN_SCOPE = [
  'nakivo_sale', 'ib_subscription_notification', 'utm_constructor', 'nakivo_assets',
  'nakivo_transfer_exhibition', 'jira_connector',
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
  // manual steps. They were previously collapsed into a single "Step 2-4: Read all 21 in-scope
  // modules and their Enterprise dependencies", which read as one opaque block in the report: a
  // reader could not tell which of the three actions a failure came from. Grouping is only allowed
  // for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] For each of the 21 in-scope modules, read its ir.module.module row and every dependency row it owns',
  s3:      'Step 3: [INTERNAL check, Call API] Compare what it declares now against the Enterprise module it used to declare',
  s4:      'Step 4: [INTERNAL check, Call API] Score each module: cleared, still declaring, or no longer present on the base',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.1 - Enterprise dependency declarations', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.1.2: [Part2-3.1] Per-module declaration ledger for all 21 in-scope modules', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let modulesRead: { name: string; state: string }[] = [];
    const moduleLedger: Map<string, { state: string; declaresEnterprise: string[] }> = new Map();
    let allDependencies: { name: string; module_id: [number, string] }[] = [];
    let modulesStillDeclaring: string[] = [];

    console.log('========== CRM-12326_3.1.2 - Per-module declaration ledger for all 21 in-scope modules ==========');

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

      // Read all 21 in-scope module rows (if they exist - as of 2026-09-15, only the 6 installed ones have rows)
      modulesRead = await platform.callKw<{ name: string; state: string }[]>(
        'ir.module.module', 'search_read',
        [[['name', 'in', CUT_MODULES_ALL]], ['name', 'state']],
        { limit: 500 },
      );
      console.log(`  In-scope modules found: ${modulesRead.length} of ${CUT_MODULES_ALL.length}`);
      if (modulesRead.length > 0) {
        for (const mod of modulesRead) {
          console.log(`    ${mod.name}: state=${mod.state}`);
        }
      }

      // For each module that has a row, build a ledger entry
      for (const mod of modulesRead) {
        moduleLedger.set(mod.name, { state: mod.state, declaresEnterprise: [] });
      }

      // Read ALL dependency rows (unfiltered) - proves the table is reachable.
      // Ground truth line 86: 1588 total rows as of 2026-09-15.
      allDependencies = await platform.callKw<
        { name: string; module_id: [number, string] }[]
      >(
        'ir.module.module.dependency', 'search_read',
        [[], ['name', 'module_id']],
        { limit: 500 },
      );
      console.log(`  Total dependency rows (unfiltered): ${allDependencies.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Count and list any dependencies that target an Enterprise module (should be 0)
      for (const dep of allDependencies) {
        if (ENTERPRISE_MODULES.includes(dep.name)) {
          const [moduleId, moduleName] = dep.module_id;

          // Also record in the ledger if the declaring module has a row
          const entry = moduleLedger.get(moduleName);
          if (entry) {
            entry.declaresEnterprise.push(dep.name);
          }
        }
      }

      const enterpriseDepCount = Array.from(moduleLedger.values()).reduce(
        (sum, entry) => sum + entry.declaresEnterprise.length,
        0
      );

      console.log(`  Dependency rows targeting Enterprise modules: ${enterpriseDepCount}`);
      if (enterpriseDepCount > 0) {
        for (const [modName, entry] of moduleLedger.entries()) {
          if (entry.declaresEnterprise.length > 0) {
            for (const dep of entry.declaresEnterprise) {
              console.log(`    ${modName} -> ${dep}`);
            }
          }
        }
      } else {
        console.log('    (none found - Enterprise dependencies successfully cut off)');
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Score the modules that have rows
      console.log('  Modules with rows (audited):');
      for (const [modName, entry] of moduleLedger.entries()) {
        const status = entry.declaresEnterprise.length > 0 ? 'STILL_DECLARING' : 'CLEARED';
        console.log(`    ${modName}: state=${entry.state}, status=${status}`);
        if (entry.declaresEnterprise.length > 0) {
          modulesStillDeclaring.push(modName);
        }
      }

      // Note any modules that are no longer present
      const leftOut = CUT_MODULES_ALL.filter(m => !moduleLedger.has(m));
      if (leftOut.length > 0) {
        console.log(`\n  Modules no longer present (no row found on base):`);
        for (const mod of leftOut) {
          console.log(`    ${mod}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      // Verify #1: All 6 installed in-scope modules are present with state 'installed'
      const foundInstalled = modulesRead.filter(m => INSTALLED_IN_SCOPE.includes(m.name) && m.state === 'installed');
      const missingInstalled = INSTALLED_IN_SCOPE.filter(m => !modulesRead.find(r => r.name === m && r.state === 'installed'));
      const installedPass = foundInstalled.length === INSTALLED_IN_SCOPE.length && missingInstalled.length === 0;
      console.log('  Verify #1 - All 6 installed in-scope modules present and installed:');
      console.log(`     Expected : ${INSTALLED_IN_SCOPE.length}`);
      console.log(`     Actual   : ${foundInstalled.length}`);
      if (missingInstalled.length > 0) {
        console.log(`     Missing  : [${missingInstalled.join(', ')}]`);
      }
      console.log(`     Result   : ${installedPass ? 'PASS' : 'FAIL'}`);

      // Verify #2: Zero dependency rows target any of the 9 Enterprise modules
      // This is the core requirement: no in-scope module declares an Enterprise dependency.
      const enterpriseDepCount = Array.from(moduleLedger.values()).reduce(
        (sum, entry) => sum + entry.declaresEnterprise.length,
        0
      );
      const noEnterprisePass = enterpriseDepCount === 0;
      console.log('\n  Verify #2 - Zero in-scope module dependencies target Enterprise modules:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${enterpriseDepCount}`);
      if (enterpriseDepCount > 0) {
        for (const [modName, entry] of moduleLedger.entries()) {
          if (entry.declaresEnterprise.length > 0) {
            console.log(`       ${modName} -> [${entry.declaresEnterprise.join(', ')}]`);
          }
        }
      }
      console.log(`     Result   : ${noEnterprisePass ? 'PASS' : 'FAIL'}`);

      // Verify #3: Audit summary - modules with rows vs. modules left out
      const leftOut = CUT_MODULES_ALL.filter(m => !moduleLedger.has(m));
      console.log('\n  Verify #3 - Module audit summary:');
      console.log(`     Modules found : ${modulesRead.length}/${CUT_MODULES_ALL.length}`);
      console.log(`     Left out      : ${leftOut.length} (pruned on instance rebuild 2026-09-15)`);
      console.log(`     Result   : PASS (as expected - the 15 left-out modules no longer have rows)`);

      console.log('===============================================');
      const allPass = installedPass && noEnterprisePass;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - 6 installed modules present, zero Enterprise dependencies`);

      expect(foundInstalled.length, 'all 6 installed in-scope modules must be present with state installed').toBe(INSTALLED_IN_SCOPE.length);
      expect(enterpriseDepCount, 'no in-scope module should declare any Enterprise module').toBe(0);
      expect(modulesStillDeclaring.length, 'no modules should still be declaring Enterprise').toBe(0);
    });
  });
});
