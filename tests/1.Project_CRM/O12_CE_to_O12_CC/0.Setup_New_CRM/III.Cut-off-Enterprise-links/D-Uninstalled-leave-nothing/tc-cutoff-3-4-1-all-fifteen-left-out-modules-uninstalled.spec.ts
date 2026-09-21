import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable
 * Test Case ID: CRM-12326_3.4.1
 * Jira: CRM-12578
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that all 15 in-scope modules left out of the O12 CC scope remain
 *   uninstalled on crm-mig.nakivo.site. These modules must not have been pulled in
 *   as a side effect of installing the 21 in-scope modules or their dependencies.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 97):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - The 15 left-out modules per CRM-12125 comment 685775
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read the ir.module.module row of each of the 15 left-out modules.
 *   3. Record the state of each, or record that no row exists.
 *
 * Verification Points:
 *   1. 0 of the 15 is in state installed (tolerates modules being absent from the registry).
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
 *   npx playwright test --grep "CRM-12326_3\.4\.1:" --project=chromium
 */

/** The 15 in-scope modules left out of O12 CC scope (CRM-12125 comment 685775). */
const CUT_MODULES_UNINSTALLED = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_email_rating', 'nakivo_feature_request', 'nakivo_leaves',
  'nakivo_message_approval', 'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'zoho_connector',
  'nakivo_website_crm_score', 'nakivo_sign', 'marketing_automation_file_template',
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
  // Manual steps 2 and 3 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into a single "Step 2-3: Read module states and
  // record each", which read as one opaque block in the report: a reader could not tell which of
  // the two actions a failure came from.
  s2:      'Step 2: [INTERNAL check, Call API] Read the ir.module.module row of each of the 15 left-out modules',
  s3:      'Step 3: [INTERNAL check, Call API] Record the state of each, or record that no row exists',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.4.1: [Part2-3.4] All 15 left-out modules are uninstalled', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    interface ModuleState {
      name: string;
      state: string;
    }

    let moduleStates: ModuleState[] = [];
    let installedModules: ModuleState[] = [];
    let allModules: any[] = [];

    console.log('========== CRM-12326_3.4.1 - All 15 left-out modules are uninstalled ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 -> 3, so each manual step owns exactly one action.

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  The 15 modules being checked:');
      CUT_MODULES_UNINSTALLED.forEach((m) => console.log(`    - ${m}`));

      allModules = await platform.getModules();
      console.log(`\n  Total ir.module.module rows read : ${allModules.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      for (const moduleName of CUT_MODULES_UNINSTALLED) {
        const found = allModules.find((m: any) => m.name === moduleName);
        const state = found?.state ?? 'absent';
        moduleStates.push({ name: moduleName, state });
        console.log(`  ${moduleName.padEnd(36)} : ${state}`);

        if (state === 'installed') {
          installedModules.push({ name: moduleName, state });
        }
      }
      console.log(`\n  Of the 15, in state installed (offenders) : ${installedModules.length}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - 0 of the 15 is in state installed:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${installedModules.length}`);
      console.log(`     Result   : ${installedModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${installedModules.length === 0 ? 'PASS' : 'FAIL'} - No left-out modules are in installed state`);

      expect(installedModules.length, 'none of the 15 modules should be in installed state').toBe(0);
    });
  });
});
