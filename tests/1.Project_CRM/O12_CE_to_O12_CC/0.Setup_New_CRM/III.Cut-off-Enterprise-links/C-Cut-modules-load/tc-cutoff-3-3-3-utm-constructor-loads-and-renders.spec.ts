import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.3 - Cut modules still load and render
 * Test Case ID: CRM-12326_3.3.3
 * Jira: CRM-12574
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 3, 4 and 5 split back to one test.step each;
 *                [INTERNAL check, Call API] tags added to all RPC-only steps
 *
 * Summary:
 *   Verify utm_constructor still loads and renders after its dependency on the Enterprise module
 *   website_crm_score was cut. This module carries no nakivo_ prefix, so a prefix-based inventory
 *   misses it. We verify the module is installed, all its models load via fields_get, and all
 *   its views and actions render via fields_view_get.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 92):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable.
 *   Login: anh.ho@nakivo.com (admin_crm_mig).
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm utm_constructor is in state installed.
 *   3. Resolve every model, view and window action the module owns through ir.model.data.
 *   4. Call fields_get on each model it declares.
 *   5. Call fields_view_get on each view it owns, and on every view_mode of each action it owns.
 *
 * Verification Points:
 *   1. utm_constructor is installed.
 *   2. Every model it declares loads - 0 failures.
 *   3. Every view and action it owns renders/opens - 0 failures.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry and calls metadata read methods. It creates,
 * modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.3\.3:" --project=chromium
 */

/** The module being verified: utm_constructor. */
const MODULE = 'utm_constructor';

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Confirm utm_constructor is in state installed',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve every model, view and window action the module owns through ir.model.data',
  s4:      'Step 4: [INTERNAL check, Call API] Call fields_get on each model it declares',
  s5:      'Step 5: [INTERNAL check, Call API] Call fields_view_get on each view it owns, and on every view_mode of each action it owns',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.3 - Cut modules still load and render', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.3.3: [Part2-3.3] utm_constructor loads and renders', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let moduleInstalled = false;
    let modelLoadFailures = 0;
    let viewActionRenderFailures = 0;
    let modelNames: string[] = [];
    let viewIds: number[] = [];
    let actionIds: number[] = [];

    console.log('========== CRM-12326_3.3.3 - utm_constructor loads and renders ==========');

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
      const modules = await platform.getModules();
      const moduleRecord = modules.find(m => m.name === MODULE);
      if (moduleRecord) {
        moduleInstalled = moduleRecord.state === 'installed';
        console.log(`  Module '${MODULE}' state: ${moduleRecord.state}`);
      } else {
        console.log(`  Module '${MODULE}' not found in registry`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      if (!moduleInstalled) {
        console.log('  Module is not installed; skipping metadata checks');
        return;
      }

      try {
        // Get all ir.model.data records owned by this module
        const moduleDataMap = await platform.ownedRecordIds(
          'ir.model.data',
          [MODULE]
        );

        console.log(`  Found ${moduleDataMap.size} ir.model.data records owned by '${MODULE}'`);

        // Retrieve full ir.model.data records to categorize them by model/res_id
        for (const [recordId] of moduleDataMap) {
          const dataRecords = await platform.callKw<any>(
            'ir.model.data', 'read',
            [recordId],
            { fields: ['model', 'res_id', 'name'] }
          );
          if (dataRecords && dataRecords.length > 0) {
            const record = dataRecords[0];
            // For ir.model records, we need to query the model by name via ir.model search
            if (record.model === 'ir.model') {
              const modelRecords = await platform.callKw<any>(
                'ir.model', 'search_read',
                [[['id', '=', record.res_id]]],
                { fields: ['model'] }
              );
              if (modelRecords && modelRecords.length > 0) {
                modelNames.push(modelRecords[0].model);
              }
            } else if (record.model === 'ir.ui.view' && record.res_id) {
              viewIds.push(record.res_id);
            } else if (record.model === 'ir.actions.act_window' && record.res_id) {
              actionIds.push(record.res_id);
            }
          }
        }

        console.log(`  Models to verify: ${modelNames.length}, Views: ${viewIds.length}, Actions: ${actionIds.length}`);

      } catch (err: any) {
        console.log(`  Error querying module data: ${(err.message || String(err)).split('\n')[0]}`);
        modelLoadFailures = 1;
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      if (!moduleInstalled) {
        console.log('  Module is not installed; skipping metadata checks');
        return;
      }

      // Test fields_get on each model
      console.log('  Testing fields_get on models:');
      for (const modelName of modelNames) {
        try {
          const fields = await platform.callKw<any>(
            modelName, 'fields_get',
            [],
            {}
          );
          console.log(`    ✓ ${modelName} - OK (${Object.keys(fields).length} fields)`);
        } catch (err: any) {
          modelLoadFailures++;
          const errMsg = err.message || String(err);
          console.log(`    ✗ ${modelName} - FAILED: ${errMsg.split('\n')[0]}`);
        }
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      if (!moduleInstalled) {
        console.log('  Module is not installed; skipping metadata checks');
        return;
      }

      // Test fields_view_get on each view
      console.log('  Testing fields_view_get on views:');
      for (const viewId of viewIds) {
        try {
          await platform.callKw<any>(
            'ir.ui.view', 'fields_view_get',
            [],
            { view_id: viewId, toolbar: false }
          );
          console.log(`    ✓ View ${viewId} - OK`);
        } catch (err: any) {
          viewActionRenderFailures++;
          const errMsg = err.message || String(err);
          console.log(`    ✗ View ${viewId} - FAILED: ${errMsg.split('\n')[0]}`);
        }
      }

      // Test fields_view_get on each action's view modes
      console.log('\n  Testing fields_view_get on action views:');
      for (const actionId of actionIds) {
        try {
          const actions = await platform.callKw<any>(
            'ir.actions.act_window', 'read',
            [actionId],
            { fields: ['view_mode', 'res_model'] }
          );
          if (actions && actions.length > 0) {
            const action = actions[0];
            const viewModes = (action.view_mode || '')
              .split(',')
              .map((m: string) => m.trim())
              .filter((m: string) => m);

            for (const viewType of viewModes) {
              try {
                await platform.callKw<any>(
                  'ir.ui.view', 'fields_view_get',
                  [],
                  { model: action.res_model, view_type: viewType, toolbar: false }
                );
                console.log(`    ✓ Action ${actionId} view_type '${viewType}' - OK`);
              } catch (err: any) {
                viewActionRenderFailures++;
                const errMsg = err.message || String(err);
                console.log(`    ✗ Action ${actionId} '${viewType}' - FAILED: ${errMsg.split('\n')[0]}`);
              }
            }
          }
        } catch (err: any) {
          viewActionRenderFailures++;
          const errMsg = err.message || String(err);
          console.log(`    ✗ Action ${actionId} - FAILED: ${errMsg.split('\n')[0]}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - utm_constructor is installed:');
      console.log(`     Expected : installed`);
      console.log(`     Actual   : ${moduleInstalled ? 'installed' : 'not installed'}`);
      console.log(`     Result   : ${moduleInstalled ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every model it declares loads - 0 failures:');
      console.log(`     Expected : 0 failures`);
      console.log(`     Actual   : ${modelLoadFailures}`);
      console.log(`     Result   : ${modelLoadFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Every view and action it owns renders/opens - 0 failures:');
      console.log(`     Expected : 0 failures`);
      console.log(`     Actual   : ${viewActionRenderFailures}`);
      console.log(`     Result   : ${viewActionRenderFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const overallPass = moduleInstalled && modelLoadFailures === 0 && viewActionRenderFailures === 0;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - utm_constructor installed with all models and views rendering`);

      expect(moduleInstalled, 'utm_constructor must be installed').toBe(true);
      expect(modelLoadFailures, 'all models must load without failure').toBe(0);
      expect(viewActionRenderFailures, 'all views and actions must render without failure').toBe(0);
    });
  });
});
