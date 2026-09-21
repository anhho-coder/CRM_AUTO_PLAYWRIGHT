import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.5 - No reference to a removed capability
 * Test Case ID: CRM-12326_3.5.2
 * Jira: CRM-12583
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - Steps 2-4 split back to one test.step each; RPC-only
 *                steps tagged [INTERNAL check, Call API]
 *
 * Summary:
 *   Verify no menu entry on the new base points at a window action whose model is missing.
 *   Missing models are invisible to users until a menu is clicked, at which point an Invalid
 *   action dialog appears. This check prevents silent broken menus from shipping.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 103):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Read every ir.ui.menu that carries an action.
 *   3. Resolve each action and its res_model.
 *   4. Confirm each res_model exists in ir.model and loads via fields_get.
 *
 * Verification Points:
 *   1. 0 menus point at an action that cannot be resolved.
 *   2. 0 menus point at an action whose model is absent or fails to load.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads ir.ui.menu, ir.actions and ir.model. It creates, modifies
 * and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.5\.2:" --project=chromium
 */

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 *
 * Manual steps 2, 3 and 4 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
 * manual steps. They were previously collapsed into a single "Steps 2-4", which read as one opaque
 * block in the report: a reader could not tell which of the three actions a failure came from.
 * Grouping is only allowed for a contiguous run of pure SETUP steps.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Read every ir.ui.menu that carries an action',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve each action and its res_model',
  s4:      'Step 4: [INTERNAL check, Call API] Confirm each res_model exists in ir.model and loads via fields_get',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.5 - No reference to a removed capability', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.5.2: [Part2-3.5] No menu points at a missing action or model', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let menusRead = 0;
    let menusWithUnresolvedActions = 0;
    let menusWithMissingModels = 0;

    console.log('========== CRM-12326_3.5.2 - No menu points at a missing action or model ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 -> 3 -> 4, so each manual step owns exactly one action.
    let menus: Array<{ id: number; name: string; action: string; complete_name: string }> = [];
    let menuWithResModels: Array<{ menu: any; resModel: string }> = [];

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // Note: ir.ui.menu.action is a REFERENCE field. When serialized, it reads like
      // 'ir.actions.act_window,123'. Split on ',' to get the model and id. This is the trap
      // in this TC - reference fields are opaque to automated clients.
      menus = await platform.callKw<
        Array<{ id: number; name: string; action: string; complete_name: string }>
      >(
        'ir.ui.menu', 'search_read',
        [[['action', '!=', false]], ['name', 'action', 'complete_name']],
        { limit: 2000 },
      );
      menusRead = menus.length;
      console.log(`  Menus with actions: ${menusRead}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Resolve the action. Only ir.actions.act_window carries a res_model - a menu may legitimately
      // point at ir.actions.client / .server / .report, which have no model at all. Reading res_model
      // off one of those raises "Invalid field" and would be miscounted as a broken menu, so those
      // action types are resolved (they must EXIST) and then skipped for the model check.
      for (const menu of menus) {
        // Parse the REFERENCE field 'ir.actions.act_window,123' to get model and id
        const actionParts = menu.action.split(',');
        if (actionParts.length !== 2) {
          console.log(`  ERROR: Menu "${menu.complete_name}" action format invalid: ${menu.action}`);
          menusWithUnresolvedActions++;
          continue;
        }

        const actionModel = actionParts[0].trim();
        const actionId = parseInt(actionParts[1].trim(), 10);

        let resModel = '';
        try {
          const readFields = actionModel === 'ir.actions.act_window' ? ['res_model'] : ['name'];
          const actionRecords = await platform.callKw<Array<{ res_model?: string }>>(
            actionModel, 'read',
            [[actionId], readFields],
          );
          if (!actionRecords || actionRecords.length === 0) {
            console.log(`  ERROR: Menu "${menu.complete_name}" - action ${actionModel},${actionId} not found`);
            menusWithUnresolvedActions++;
            continue;
          }
          if (actionModel !== 'ir.actions.act_window') {
            console.log(`  SKIP: Menu "${menu.complete_name}" -> ${actionModel} carries no res_model by design`);
            continue;
          }
          resModel = actionRecords[0].res_model ?? '';
        } catch (err: any) {
          console.log(`  ERROR: Menu "${menu.complete_name}" - cannot read action ${actionModel},${actionId}: ${err.message?.split('\n')[0]}`);
          menusWithUnresolvedActions++;
          continue;
        }

        if (!resModel) {
          console.log(`  ERROR: Menu "${menu.complete_name}" - action has empty res_model`);
          menusWithMissingModels++;
          continue;
        }

        menuWithResModels.push({ menu, resModel });
      }

      console.log(`  Menus with unresolved actions: ${menusWithUnresolvedActions}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Cache for fields_get results per model name to avoid repeated calls for menu-heavy bases
      const fieldsGetCache = new Map<string, object>();

      // Confirm each res_model exists in ir.model and loads via fields_get.
      // Check cache first to avoid repeated calls for the same model.
      for (const { menu, resModel } of menuWithResModels) {
        if (!fieldsGetCache.has(resModel)) {
          try {
            const fields = await platform.callKw<object>(
              resModel, 'fields_get',
              [[], {}],
            );
            fieldsGetCache.set(resModel, fields);
          } catch (err: any) {
            console.log(`  ERROR: Menu "${menu.complete_name}" - model ${resModel} missing or fails fields_get: ${err.message?.split('\n')[0]}`);
            menusWithMissingModels++;
            continue;
          }
        }
      }

      console.log(`  Menus with missing/broken models: ${menusWithMissingModels}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - Menus whose action cannot be resolved:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${menusWithUnresolvedActions}`);
      console.log(`     Result   : ${menusWithUnresolvedActions === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Menus whose res_model is absent or fails to load:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${menusWithMissingModels}`);
      console.log(`     Result   : ${menusWithMissingModels === 0 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${menusWithUnresolvedActions === 0 && menusWithMissingModels === 0 ? 'PASS' : 'FAIL'} - no menus reference removed actions or models`);

      expect(menusWithUnresolvedActions, '0 menus should point at an action that cannot be resolved').toBe(0);
      expect(menusWithMissingModels, '0 menus should point at an action whose model is absent or fails to load').toBe(0);
    });
  });
});
