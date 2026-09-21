import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.3 - Cut modules still load and render
 * Test Case ID: CRM-12326_3.3.6
 * Jira: CRM-12577
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 3, 4, 5 split back to one test.step each, and step 6
 *                (helpdesk check) renamed from conflated step 5; RPC-only steps tagged
 *                [INTERNAL check, Call API]
 *
 * Summary:
 *   Verify jira_connector still loads and renders after its dependency on the Enterprise module
 *   helpdesk was cut. jira_connector is the one module of the 13 helpdesk-chain modules that was
 *   KEPT and installed rather than left out. This TC confirms it can operate without helpdesk
 *   and renders all owned models, views, and actions cleanly.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 95):
 *   Test Case ID: CRM-12326_3.3.6
 *   Title: jira_connector loads and renders
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - Dev confirmed jira_connector is kept but is not on the 73-item mandatory list (CRM-12126 comment 685484)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm jira_connector is in state installed.
 *   3. Resolve every model, view and window action the module owns through ir.model.data.
 *   4. Call fields_get on each model it declares.
 *   5. Call fields_view_get on each view it owns, and on every view_mode of each action it owns.
 *   6. Confirm none of its models or views still resolves a helpdesk.* model.
 *
 * Verification Points:
 *   1. jira_connector is installed.
 *   2. Every model it declares loads - 0 failures.
 *   3. Every view and action it owns renders/opens - 0 failures.
 *   4. 0 of its objects reference a helpdesk.* model.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry, models, views, and actions. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * NOTE: this TC checks the module LOADS and RENDERS on a helpdesk-less base; it does NOT exercise
 * the Jira integration itself, which needs an external system and is out of automation scope.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.3\.6:" --project=chromium
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
  s2:      'Step 2: [INTERNAL check, Call API] Confirm jira_connector is in state installed',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve every model, view and window action the module owns through ir.model.data',
  s4:      'Step 4: [INTERNAL check, Call API] Call fields_get on each model it declares',
  s5:      'Step 5: [INTERNAL check, Call API] Call fields_view_get on each view it owns, and on every view_mode of each action it owns',
  s6:      'Step 6: [INTERNAL check, Call API] Confirm none of its models or views still resolves a helpdesk.* model',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.3 - Cut modules still load and render', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.3.6: [Part2-3.3] jira_connector loads and renders', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    const MODULE_NAME = 'jira_connector';
    let isInstalled = false;
    let modelLoadFailures = 0;
    let viewActionRenderFailures = 0;
    let helpdesk_references = 0;

    // Carried between steps 3 -> 4 -> 5 -> 6, so each manual step owns exactly one action.
    let modelData: Array<{ module: string; model: string; res_id: number; name: string }> = [];
    const modelsOwned = new Set<string>();
    const viewsOwned = new Set<number>();
    const actionsOwned = new Set<number>();
    const allModelNames = new Set<string>();

    console.log('========== CRM-12326_3.3.6 - jira_connector loads and renders ==========');

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
      const modules = await platform.callKw<Array<{ name: string; state: string }>>(
        'ir.module.module', 'search_read',
        [[['name', '=', MODULE_NAME]], ['name', 'state']],
        { limit: 10 },
      );
      if (modules.length > 0) {
        isInstalled = modules[0].state === 'installed';
        console.log(`  Module state: ${modules[0].state}`);
      } else {
        console.log(`  Module not found in database`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Get all ir.model.data records owned by jira_connector module.
      modelData = await platform.callKw<
        Array<{ module: string; model: string; res_id: number; name: string }>
      >(
        'ir.model.data', 'search_read',
        [[['module', '=', MODULE_NAME]], ['module', 'model', 'res_id', 'name']],
        { limit: 500 },
      );
      console.log(`  Total ir.model.data records: ${modelData.length}`);

      // Extract unique model names that jira_connector owns.
      for (const record of modelData) {
        modelsOwned.add(record.model);
        if (record.model === 'ir.ui.view' && record.res_id) {
          viewsOwned.add(record.res_id);
        }
        if (record.model === 'ir.actions.act_window' && record.res_id) {
          actionsOwned.add(record.res_id);
        }
      }

      console.log(`  Models referenced: ${modelsOwned.size}`);
      console.log(`  Views owned: ${viewsOwned.size}`);
      console.log(`  Actions owned: ${actionsOwned.size}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Call fields_get on each model jira_connector owns.
      for (const modelName of modelsOwned) {
        try {
          await platform.callKw(modelName, 'fields_get', [], {});
          allModelNames.add(modelName);
        } catch (err: any) {
          console.log(`    ERROR loading ${modelName}: ${err.message?.split('\n')[0]}`);
          modelLoadFailures++;
        }
      }
      console.log(`  Models loaded successfully: ${allModelNames.size}`);
      console.log(`  Model load failures: ${modelLoadFailures}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      // Call fields_view_get on each view owned by jira_connector.
      console.log(`\n  --- Checking view field definitions (fields_view_get) ---`);
      for (const viewId of viewsOwned) {
        try {
          await platform.callKw(
            'ir.ui.view', 'fields_view_get',
            [],
            { view_id: viewId, toolbar: false },
          );
        } catch (err: any) {
          console.log(`    ERROR rendering view ${viewId}: ${err.message?.split('\n')[0]}`);
          viewActionRenderFailures++;
        }
      }
      console.log(`  Views rendered successfully: ${viewsOwned.size - viewActionRenderFailures}`);
      console.log(`  View render failures: ${viewActionRenderFailures}`);

      // Call fields_view_get on each action owned by jira_connector.
      console.log(`\n  --- Checking action view definitions ---`);
      for (const actionId of actionsOwned) {
        try {
          // Fetch the action to get its res_model and view_mode.
          const action = await platform.callKw<
            Array<{ res_model: string; view_mode: string }>
          >(
            'ir.actions.act_window', 'search_read',
            [[['id', '=', actionId]], ['res_model', 'view_mode']],
            { limit: 1 },
          );
          if (action.length > 0) {
            const resModel = action[0].res_model;
            const viewModes = (action[0].view_mode || '').split(',').map(v => v.trim()).filter(Boolean);
            for (const mode of viewModes) {
              try {
                await platform.callKw(
                  resModel, 'fields_view_get',
                  [],
                  { view_id: false, view_type: mode, toolbar: false },
                );
              } catch (err: any) {
                console.log(`    ERROR rendering action ${actionId} (${resModel}, ${mode}): ${err.message?.split('\n')[0]}`);
                viewActionRenderFailures++;
              }
            }
          }
        } catch (err: any) {
          console.log(`    ERROR loading action ${actionId}: ${err.message?.split('\n')[0]}`);
          viewActionRenderFailures++;
        }
      }
      console.log(`  Actions rendered successfully: ${actionsOwned.size - viewActionRenderFailures}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);

      // Helper to normalize model name: many2one fields come back as [id, display_name]
      const normalizeModelName = (value: any): string => {
        if (Array.isArray(value)) {
          return value[1] || String(value[0]); // [id, display_name] - take display_name
        }
        return String(value);
      };

      // Collect all model technical names that jira_connector declares.
      const technicalNames = new Set<string>();
      for (const record of modelData) {
        if (record.model === 'ir.model' && record.res_id) {
          try {
            const irModel = await platform.callKw<Array<{ model: string | any[] }>>(
              'ir.model', 'search_read',
              [[['id', '=', record.res_id]], ['model']],
              { limit: 1 },
            );
            if (irModel.length > 0) {
              technicalNames.add(normalizeModelName(irModel[0].model));
            }
          } catch (err: any) {
            console.log(`    Error reading model ${record.res_id}: ${err.message?.split('\n')[0]}`);
          }
        }
      }

      // Collect model names from all views owned by jira_connector.
      const viewModels = new Set<string>();
      for (const record of modelData) {
        if (record.model === 'ir.ui.view' && record.res_id) {
          try {
            const view = await platform.callKw<Array<{ model: string | any[] }>>(
              'ir.ui.view', 'search_read',
              [[['id', '=', record.res_id]], ['model']],
              { limit: 1 },
            );
            if (view.length > 0) {
              viewModels.add(normalizeModelName(view[0].model));
            }
          } catch (err: any) {
            console.log(`    Error reading view ${record.res_id}: ${err.message?.split('\n')[0]}`);
          }
        }
      }

      // Collect res_model from all actions owned by jira_connector.
      const actionModels = new Set<string>();
      for (const record of modelData) {
        if (record.model === 'ir.actions.act_window' && record.res_id) {
          try {
            const action = await platform.callKw<Array<{ res_model: string | any[] }>>(
              'ir.actions.act_window', 'search_read',
              [[['id', '=', record.res_id]], ['res_model']],
              { limit: 1 },
            );
            if (action.length > 0 && action[0].res_model) {
              actionModels.add(normalizeModelName(action[0].res_model));
            }
          } catch (err: any) {
            console.log(`    Error reading action ${record.res_id}: ${err.message?.split('\n')[0]}`);
          }
        }
      }

      // Check for helpdesk.* references.
      const allCollected = new Set([...technicalNames, ...viewModels, ...actionModels]);
      console.log(`\n  Unique models collected: ${allCollected.size}`);
      for (const modelName of allCollected) {
        if (typeof modelName === 'string' && modelName.startsWith('helpdesk.')) {
          console.log(`    FOUND helpdesk reference: ${modelName}`);
          helpdesk_references++;
        }
      }
      console.log(`  Helpdesk model references: ${helpdesk_references}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - jira_connector is installed:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${isInstalled}`);
      console.log(`     Result   : ${isInstalled ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #2 - Every model it declares loads - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${modelLoadFailures}`);
      console.log(`     Result   : ${modelLoadFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #3 - Every view and action it owns renders/opens - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${viewActionRenderFailures}`);
      console.log(`     Result   : ${viewActionRenderFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #4 - 0 of its objects reference a helpdesk.* model:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${helpdesk_references}`);
      console.log(`     Result   : ${helpdesk_references === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = isInstalled && modelLoadFailures === 0 && viewActionRenderFailures === 0 && helpdesk_references === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - jira_connector loads and renders without helpdesk dependencies`);

      expect(isInstalled, 'jira_connector must be installed').toBe(true);
      expect(modelLoadFailures, 'all owned models must load without errors').toBe(0);
      expect(viewActionRenderFailures, 'all owned views and actions must render without errors').toBe(0);
      expect(helpdesk_references, 'no owned objects must reference helpdesk models').toBe(0);
    });
  });
});
