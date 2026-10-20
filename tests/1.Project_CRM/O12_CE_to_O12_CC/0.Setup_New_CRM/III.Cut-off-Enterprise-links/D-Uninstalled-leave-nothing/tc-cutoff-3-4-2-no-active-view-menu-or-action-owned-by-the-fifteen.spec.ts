import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable
 * Test Case ID: CRM-12326_3.4.2
 * Jira: CRM-12579
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-10-12 - the left-out list drops from 15 to 14. Khang Nguyen Thai Duy,
 *                CRM-13430 (2026-10-09): "nakivo_feature_request is installed on crm-mig on
 *                purpose. On 2 October it was brought back because Production uses it: it is
 *                installed on Production, it carries the Feature Request app, and it provides
 *                'Log Feature Request' on the Opportunity Action menu (CRM-13086)."
 *                Its 27 views, 10 menus and 8 window actions are therefore EXPECTED to be live,
 *                and this TC now asserts they are, instead of counting them as residue.
 * Previously:    2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that no view, menu or window action owned by the 14 uninstalled modules
 *   remains active on the new base. Uninstalled modules must not leave a screen a user
 *   can reach. Verify in the same pass that nakivo_feature_request - installed on purpose
 *   since 2026-10-02 - DOES own live views, menus and window actions.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 98):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Resolve every ir.ui.view, ir.ui.menu and ir.actions.act_window owned by the 14 modules through ir.model.data, and the same for nakivo_feature_request.
 *   3. For each object found, read whether it is active.
 *
 * Verification Points:
 *   1. 0 active views, 0 active menus and 0 active window actions are owned by any of the 14.
 *   2. Any object found is reported with its owning module and id, so it can be routed for deletion.
 *   3. nakivo_feature_request owns at least one live view, at least one live menu and at least one
 *      live window action - it is installed on purpose, so its screens must be reachable.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads ir.ui.view, ir.ui.menu and ir.actions.act_window records
 * and their ownership via ir.model.data. It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.4\.2:" --project=chromium
 */

/**
 * The 14 modules that are NOT installed on the new O12 CC base (cut from migration scope).
 * CRM-12125 comment 685775 listed 15; CRM-13430 moved nakivo_feature_request off this list on
 * 2026-10-09 because the 2026-10-02 deploy installed it on purpose.
 * As of 2026-10-12, none of these 14 has a row in ir.module.module; the instance was rebuilt
 * and the deploy pruned them. Assertions remain: if any view/menu/action is found via ir.model.data,
 * it must not be active.
 */
const CUT_MODULES_UNINSTALLED = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page', 'nakivo_helpdesk_followup',
  'nakivo_helpdesk_mail_route', 'nakivo_email_rating', 'nakivo_leaves',
  'nakivo_message_approval', 'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'zoho_connector',
  'nakivo_website_crm_score', 'nakivo_sign', 'marketing_automation_file_template',
];

/**
 * The 15th name on the old list. Installed on purpose since 2026-10-02 (CRM-13430), so its
 * objects are checked for PRESENCE, the opposite of the check applied to the 14 above.
 * Asserted as "at least one of each kind", not as an exact count: the exact 27/10/8 reading of
 * 2026-10-07 is a measurement of one build, and pinning it would turn any later version of the
 * module into a false red.
 */
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
  // manual steps. They were previously collapsed into a single "Step 2-3: Resolve and check
  // ownership of views, menus and actions", which read as one opaque block in the report: a
  // reader could not tell which of the two actions a failure came from. Grouping is only allowed
  // for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Resolve every ir.ui.view, ir.ui.menu and ir.actions.act_window owned by the 14 modules through ir.model.data, and the same for nakivo_feature_request',
  s3:      'Step 3: [INTERNAL check, Call API] For each object found, read whether it is active',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.4.2: [Part2-3.4] No active view, menu or action owned by the 14, and nakivo_feature_request owns live ones', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let liveViews: Array<{ module: string; id: number; name: string }> = [];
    let liveMenus: Array<{ module: string; id: number; name: string }> = [];
    let liveActions: Array<{ module: string; id: number; name: string }> = [];
    let totalLiveCount = 0;

    // nakivo_feature_request - counted separately, and expected to be NON-zero.
    let frViewCount = 0;
    let frMenuCount = 0;
    let frActionCount = 0;

    // Carried between steps 2 -> 3, so each manual step owns exactly one action.
    let viewOwnershipMap: Map<number, string> = new Map();
    let viewIds: number[] = [];
    let menuOwnershipMap: Map<number, string> = new Map();
    let menuIds: number[] = [];
    let actionOwnershipMap: Map<number, string> = new Map();
    let actionIds: number[] = [];

    console.log('========== CRM-12326_3.4.2 - No active view, menu or action owned by the 14; nakivo_feature_request owns live ones ==========');

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

      // Query ir.ui.view records owned by the 14 modules
      console.log('  Resolving ir.ui.view records owned by the 14 modules through ir.model.data...');
      viewOwnershipMap = await platform.ownedRecordIds('ir.ui.view', CUT_MODULES_UNINSTALLED);
      viewIds = Array.from(viewOwnershipMap.keys());
      console.log(`    Found ${viewIds.length} views owned by the 14 modules`);

      // Query ir.ui.menu records owned by the 14 modules
      console.log('  Resolving ir.ui.menu records owned by the 14 modules through ir.model.data...');
      menuOwnershipMap = await platform.ownedRecordIds('ir.ui.menu', CUT_MODULES_UNINSTALLED);
      menuIds = Array.from(menuOwnershipMap.keys());
      console.log(`    Found ${menuIds.length} menus owned by the 14 modules`);

      // Query ir.actions.act_window records owned by the 14 modules
      console.log('  Resolving ir.actions.act_window records owned by the 14 modules through ir.model.data...');
      actionOwnershipMap = await platform.ownedRecordIds('ir.actions.act_window', CUT_MODULES_UNINSTALLED);
      actionIds = Array.from(actionOwnershipMap.keys());
      console.log(`    Found ${actionIds.length} window actions owned by the 14 modules`);

      // The other side of the same question: nakivo_feature_request is installed on purpose,
      // so the SAME three queries must come back NON-empty for it.
      console.log(`\n  Resolving the same three models for ${RETURNED_TO_SCOPE} (expected: non-empty)...`);
      frViewCount   = (await platform.ownedRecordIds('ir.ui.view', [RETURNED_TO_SCOPE])).size;
      frMenuCount   = (await platform.ownedRecordIds('ir.ui.menu', [RETURNED_TO_SCOPE])).size;
      frActionCount = (await platform.ownedRecordIds('ir.actions.act_window', [RETURNED_TO_SCOPE])).size;
      console.log(`    views  : ${frViewCount}`);
      console.log(`    menus  : ${frMenuCount}`);
      console.log(`    actions: ${frActionCount}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Read active status for ir.ui.view records
      if (viewIds.length > 0) {
        console.log('  Reading active status for view records...');
        const viewRecords = await platform.callKw<Array<{ id: number; name: string; active: boolean }>>(
          'ir.ui.view', 'read',
          [viewIds, ['name', 'active']],
          {},
        );
        liveViews = viewRecords
          .filter((rec) => rec.active)
          .map((rec) => ({
            module: viewOwnershipMap.get(rec.id) || 'unknown',
            id: rec.id,
            name: rec.name || '(no name)',
          }));
        console.log(`    Active views: ${liveViews.length}`);
        liveViews.forEach((v) => {
          console.log(`      - Module: ${v.module}, ID: ${v.id}, Name: ${v.name}`);
        });
      }

      // Read active status for ir.ui.menu records
      if (menuIds.length > 0) {
        console.log('  Reading active status for menu records...');
        const menuRecords = await platform.callKw<Array<{ id: number; name: string; active: boolean }>>(
          'ir.ui.menu', 'read',
          [menuIds, ['name', 'active']],
          {},
        );
        liveMenus = menuRecords
          .filter((rec) => rec.active)
          .map((rec) => ({
            module: menuOwnershipMap.get(rec.id) || 'unknown',
            id: rec.id,
            name: rec.name || '(no name)',
          }));
        console.log(`    Active menus: ${liveMenus.length}`);
        liveMenus.forEach((m) => {
          console.log(`      - Module: ${m.module}, ID: ${m.id}, Name: ${m.name}`);
        });
      }

      // Read active status for ir.actions.act_window records
      // NOTE: ir.actions.act_window has no 'active' field in Odoo 12. Every owned act_window
      // is considered live if found via ir.model.data (they are not marked inactive, just deleted).
      if (actionIds.length > 0) {
        console.log('  Reading window action records...');
        console.log('    (NOTE: ir.actions.act_window has no active field in Odoo 12 - all found are considered live)');
        const actionRecords = await platform.callKw<Array<{ id: number; name: string }>>(
          'ir.actions.act_window', 'read',
          [actionIds, ['name']],
          {},
        );
        liveActions = actionRecords.map((rec) => ({
          module: actionOwnershipMap.get(rec.id) || 'unknown',
          id: rec.id,
          name: rec.name || '(no name)',
        }));
        console.log(`    Live window actions: ${liveActions.length}`);
        liveActions.forEach((a) => {
          console.log(`      - Module: ${a.module}, ID: ${a.id}, Name: ${a.name}`);
        });
      }

      totalLiveCount = liveViews.length + liveMenus.length + liveActions.length;
    });

    await test.step(STEP.verify, async () => {
      const objectsWithModuleCount =
        liveViews.filter(v => v.module && v.module !== 'unknown').length +
        liveMenus.filter(m => m.module && m.module !== 'unknown').length +
        liveActions.filter(a => a.module && a.module !== 'unknown').length;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - No active views, menus or actions owned by the 14 modules:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${totalLiveCount}`);
      console.log(`     Result   : ${totalLiveCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - All reported objects carry a non-empty owning module:');
      console.log(`     Expected : ${totalLiveCount}`);
      console.log(`     Actual   : ${objectsWithModuleCount}`);
      console.log(`     Result   : ${objectsWithModuleCount === totalLiveCount ? 'PASS' : 'FAIL'}`);
      const frLive = frViewCount > 0 && frMenuCount > 0 && frActionCount > 0;
      console.log(`  Verify #3 - ${RETURNED_TO_SCOPE} owns live views, menus and actions (CRM-13430):`);
      console.log(`     Expected : >= 1 of each`);
      console.log(`     Actual   : ${frViewCount} views, ${frMenuCount} menus, ${frActionCount} window actions`);
      console.log(`     Result   : ${frLive ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${totalLiveCount === 0 && frLive ? 'PASS' : 'FAIL'} - ${totalLiveCount === 0 ? 'No active views, menus or actions remain from the 14 uninstalled modules' : `${totalLiveCount} live object(s) found that must be deleted`}`);

      expect(totalLiveCount, 'the count of active views + menus + actions owned by the 14 modules must be 0').toBe(0);
      expect(objectsWithModuleCount, 'every reported live object must have a non-empty owning module').toBe(totalLiveCount);
      expect(frViewCount, `${RETURNED_TO_SCOPE} is installed on purpose (CRM-13430) - it must own at least one view`).toBeGreaterThan(0);
      expect(frMenuCount, `${RETURNED_TO_SCOPE} is installed on purpose (CRM-13430) - it must own at least one menu`).toBeGreaterThan(0);
      expect(frActionCount, `${RETURNED_TO_SCOPE} is installed on purpose (CRM-13430) - it must own at least one window action`).toBeGreaterThan(0);
    });
  });
});
