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
 * Last-revised: 2026-10-12 - the left-out list drops from 15 to 14 and nakivo_feature_request
 *                moves to the installed side. Khang Nguyen Thai Duy, CRM-13430 (2026-10-09):
 *                "nakivo_feature_request is installed on crm-mig on purpose. On 2 October it was
 *                brought back because Production uses it ... For the Community server its Helpdesk
 *                dependency was removed. The row 'uninstalled, not mandatory, left out by design'
 *                on CRM-12125 (comment 685775) predates that decision."
 *                Ticket resolved "Not a bug". The module is asserted INSTALLED here rather than
 *                merely deleted from the list: dropping a name would leave the TC unable to tell
 *                "installed on purpose" from "silently gone".
 * Previously:    2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that the 14 in-scope modules left out of the O12 CC scope remain
 *   uninstalled on crm-mig.nakivo.site. These modules must not have been pulled in
 *   as a side effect of installing the in-scope modules or their dependencies.
 *   Verify in the same pass that nakivo_feature_request - the 15th name on the old list,
 *   returned to scope on 2026-10-02 - IS installed.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 97):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - The 14 left-out modules: CRM-12125 comment 685775 minus nakivo_feature_request,
 *     which CRM-13430 returned to scope on 2026-10-02
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read the ir.module.module row of each of the 14 left-out modules, and of nakivo_feature_request.
 *   3. Record the state of each, or record that no row exists.
 *
 * Verification Points:
 *   1. 0 of the 14 is in state installed (tolerates modules being absent from the registry).
 *   2. nakivo_feature_request is in state installed.
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

/**
 * The 14 in-scope modules left out of O12 CC scope: CRM-12125 comment 685775's list of 15,
 * minus nakivo_feature_request, which CRM-13430 confirmed is installed on purpose since 2026-10-02.
 */
const CUT_MODULES_UNINSTALLED = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_email_rating', 'nakivo_leaves',
  'nakivo_message_approval', 'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'zoho_connector',
  'nakivo_website_crm_score', 'nakivo_sign', 'marketing_automation_file_template',
];

/** The 15th name on the old list, now in scope and expected INSTALLED (CRM-13430). */
const RETURNED_TO_SCOPE = 'nakivo_feature_request';

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
  s2:      'Step 2: [INTERNAL check, Call API] Read the ir.module.module row of each of the 14 left-out modules, and of nakivo_feature_request',
  s3:      'Step 3: [INTERNAL check, Call API] Record the state of each, or record that no row exists',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.4.1: [Part2-3.4] All 14 left-out modules are uninstalled and nakivo_feature_request is installed', async ({ page }) => {
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
    let featureRequestState = 'absent';

    console.log('========== CRM-12326_3.4.1 - All 14 left-out modules are uninstalled, nakivo_feature_request is installed ==========');

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
      console.log('  The 14 modules that must stay uninstalled:');
      CUT_MODULES_UNINSTALLED.forEach((m) => console.log(`    - ${m}`));
      console.log(`  Plus the module that must be INSTALLED (CRM-13430): ${RETURNED_TO_SCOPE}`);

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
      console.log(`\n  Of the 14, in state installed (offenders) : ${installedModules.length}`);

      const fr = allModules.find((m: any) => m.name === RETURNED_TO_SCOPE);
      featureRequestState = fr?.state ?? 'absent';
      console.log(`  ${RETURNED_TO_SCOPE.padEnd(36)} : ${featureRequestState}  (expected installed)`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - 0 of the 14 is in state installed:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${installedModules.length}`);
      console.log(`     Result   : ${installedModules.length === 0 ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #2 - ${RETURNED_TO_SCOPE} is installed (CRM-13430, Khang 2026-10-09):`);
      console.log(`     Expected : installed`);
      console.log(`     Actual   : ${featureRequestState}`);
      console.log(`     Result   : ${featureRequestState === 'installed' ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${installedModules.length === 0 && featureRequestState === 'installed' ? 'PASS' : 'FAIL'} - 14 left out, nakivo_feature_request installed`);

      expect(installedModules.length, 'none of the 14 modules should be in installed state').toBe(0);
      expect(featureRequestState, 'nakivo_feature_request must be installed - CRM-13430 returned it to scope on 2026-10-02').toBe('installed');
    });
  });
});
