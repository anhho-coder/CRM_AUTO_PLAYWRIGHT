import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.2 - Enterprise add-ons absent
 * Test Case ID: CRM-12326_3.2.2
 * Jira: CRM-12570
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verifies that every module on the addons path carrying the Odoo Enterprise
 *   licence OEEL-1 is marked uninstallable and none is installed. The licence field
 *   is the check that does not depend on knowing the exact module names in advance.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 87):
 *   Every OEEL-1 module present is uninstallable
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   Login: anh.ho@nakivo.com (admin_crm_mig).
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every ir.module.module row whose licence is OEEL-1.
 *   3. Group them by install state.
 *
 * Verification Points:
 *   1. 0 OEEL-1 modules are installed.
 *   2. Every OEEL-1 module present is in state uninstallable.
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
 *   npx playwright test --grep "CRM-12326_3\.2\.2:" --project=chromium
 */

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Read every ir.module.module row whose licence is OEEL-1',
  s3:      'Step 3: [INTERNAL check, Call API] Group them by install state',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.2 - Enterprise add-ons absent', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.2.2: [Part2-3.2] Every OEEL-1 module present is uninstallable', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let oeel1Modules: Array<{ name: string; state: string; license: string }> = [];
    const stateGroups = new Map<string, string[]>();
    let installedCount = 0;
    let nonUninstallableModules: string[] = [];

    console.log('========== CRM-12326_3.2.2 - Every OEEL-1 module present is uninstallable ==========');

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
      oeel1Modules = await platform.callKw(
        'ir.module.module',
        'search_read',
        [[['license', '=', 'OEEL-1']], ['name', 'state', 'license']],
        { limit: 500 },
      );
      console.log(`  Total OEEL-1 modules found: ${oeel1Modules.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Group modules by state
      for (const module of oeel1Modules) {
        if (!stateGroups.has(module.state)) {
          stateGroups.set(module.state, []);
        }
        stateGroups.get(module.state)!.push(module.name);
      }

      // Log per-state counts
      console.log('\n  Modules grouped by state:');
      for (const [state, names] of stateGroups) {
        console.log(`    ${state}: ${names.length} module(s)`);
        if (names.length <= 5) {
          names.forEach(name => console.log(`      - ${name}`));
        } else {
          names.slice(0, 3).forEach(name => console.log(`      - ${name}`));
          console.log(`      ... and ${names.length - 3} more`);
        }
      }

      // Count installed modules
      installedCount = stateGroups.get('installed')?.length ?? 0;
      console.log(`\n  Installed OEEL-1 modules: ${installedCount}`);

      // Find all modules that are NOT uninstallable
      nonUninstallableModules = oeel1Modules
        .filter(mod => mod.state !== 'uninstallable')
        .map(mod => `${mod.name} (state: ${mod.state})`);

      if (nonUninstallableModules.length > 0) {
        console.log(`  OEEL-1 modules NOT in uninstallable state: ${nonUninstallableModules.length}`);
        nonUninstallableModules.forEach(name => console.log(`    - ${name}`));
      } else {
        console.log('  All OEEL-1 modules are in uninstallable state');
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - No OEEL-1 modules are installed:');
      console.log('     Expected : 0');
      console.log(`     Actual   : ${installedCount}`);
      console.log(`     Result   : ${installedCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('\n  Verify #2 - Every OEEL-1 module is uninstallable:');
      console.log('     Expected : [] (empty list)');
      console.log(`     Actual   : [${nonUninstallableModules.length > 0 ? nonUninstallableModules.join(', ') : ''}]`);
      console.log(`     Result   : ${nonUninstallableModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${installedCount === 0 && nonUninstallableModules.length === 0 ? 'PASS' : 'FAIL'} - All OEEL-1 modules are uninstallable and none are installed`);

      expect(installedCount, 'no OEEL-1 modules should be installed').toBe(0);
      expect(nonUninstallableModules, 'all OEEL-1 modules should be uninstallable').toEqual([]);
    });
  });
});
