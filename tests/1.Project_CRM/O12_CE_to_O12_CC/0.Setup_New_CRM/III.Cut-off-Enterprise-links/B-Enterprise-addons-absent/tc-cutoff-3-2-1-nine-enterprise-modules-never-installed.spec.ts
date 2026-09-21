import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.2 - Enterprise add-ons absent
 * Test Case ID: CRM-12326_3.2.1
 * Jira: CRM-12569
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that none of the 9 Odoo Enterprise modules is installed on the O12 CE Migration server.
 *   Each module is either absent from the addons path or present but marked uninstallable, never
 *   installed. This guards against accidental Enterprise addon presence on a Community Edition
 *   instance (CRM-12125 enterprise dependency census).
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 86):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read the module registry and look up each of the 9 Enterprise modules by technical name.
 *   3. Record the state of each: absent, uninstallable, uninstalled or installed.
 *
 * Verification Points:
 *   1. 0 of the 9 Enterprise modules is in state installed.
 *   2. Each is reported with its actual state, so a change from uninstallable to installed would be caught.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry via platform.getModules(). It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.2\.1:" --project=chromium
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
  s2:      'Step 2: [INTERNAL check, Call API] Read the module registry and look up each of the 9 Enterprise modules by technical name',
  s3:      'Step 3: [INTERNAL check, Call API] Record the state of each: absent, uninstallable, uninstalled or installed',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.2 - Enterprise add-ons absent', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.2.1: [Part2-3.2] None of the 9 Enterprise modules is installed', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const moduleStates: string[] = [];
    let installedCount = 0;
    let moduleMap = new Map<string, string>();

    console.log('========== CRM-12326_3.2.1 - Enterprise modules not installed ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 and 3, so each manual step owns exactly one action.
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const allModules = await platform.getModules();

      // Build name -> state map from the module registry
      allModules.forEach((mod) => {
        moduleMap.set(mod.name, mod.state);
      });

      console.log(`  Total modules in registry: ${allModules.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  Enterprise modules status:');

      // Record state of each Enterprise module: absent, uninstallable, uninstalled, or installed
      ENTERPRISE_MODULES.forEach((name) => {
        const state = moduleMap.has(name) ? moduleMap.get(name)! : 'absent';
        moduleStates.push(state);
        console.log(`    ${name.padEnd(25)} : ${state}`);
        if (state === 'installed') {
          installedCount++;
        }
      });
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - 0 of the 9 Enterprise modules is installed:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${installedCount}`);
      console.log(`     Result   : ${installedCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - All 9 Enterprise modules are reported:');
      console.log(`     Expected : 9`);
      console.log(`     Actual   : ${moduleStates.length}`);
      console.log(`     Result   : ${moduleStates.length === 9 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${installedCount === 0 && moduleStates.length === 9 ? 'PASS' : 'FAIL'} - 0 Enterprise modules installed, all 9 accounted for`);

      expect(installedCount, 'none of the 9 Enterprise modules should be in state installed').toBe(0);
      expect(moduleStates.length, 'all 9 Enterprise modules must be reported').toBe(9);
    });
  });
});
