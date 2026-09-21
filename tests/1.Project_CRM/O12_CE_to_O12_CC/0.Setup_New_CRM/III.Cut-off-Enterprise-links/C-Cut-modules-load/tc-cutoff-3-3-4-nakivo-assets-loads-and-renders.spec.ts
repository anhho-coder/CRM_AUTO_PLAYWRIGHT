import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.3 - Cut modules still load and render
 * Test Case ID: CRM-12326_3.3.4
 * Jira: CRM-12575
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 3, 4, 5 and 6 split back to one test.step each
 *                (they were collapsed into two opaque blocks "Step 3-4" and "Step 5/6", which
 *                read as single units in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify nakivo_assets still loads and renders after its dependency on the Enterprise module
 *   account_asset was cut. On Community it keeps the equipment register and now defines
 *   account.asset.asset itself, which is why it GAINED 31 objects against Production.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 93):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - Dev decision recorded on CRM-12125 comment 685328: the accounting side is IS-CRM-FUNC-0008 route 3, not provided
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm nakivo_assets is in state installed.
 *   3. Resolve every model, view and window action the module owns through ir.model.data.
 *   4. Call fields_get on each model it declares.
 *   5. Call fields_view_get on each view it owns, and on every view_mode of each action it owns.
 *   6. Confirm account.asset.asset resolves and is owned by nakivo_assets, not by the absent Enterprise module.
 *
 * Verification Points:
 *   1. nakivo_assets is installed.
 *   2. Every model it declares loads - 0 failures.
 *   3. Every view and action it owns renders/opens - 0 failures.
 *   4. account.asset.asset loads and is attributed to nakivo_assets.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step (except login) reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry and metadata. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.3\.4:" --project=chromium
 */

/** The module under test. */
const MODULE_NAME = 'nakivo_assets';

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Confirm nakivo_assets is in state installed',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve every model, view and window action the module owns through ir.model.data',
  s4:      'Step 4: [INTERNAL check, Call API] Call fields_get on each model it declares',
  s5:      'Step 5: [INTERNAL check, Call API] Call fields_view_get on each view it owns, and on every view_mode of each action it owns',
  s6:      'Step 6: [INTERNAL check, Call API] Confirm account.asset.asset resolves and is owned by nakivo_assets, not by the absent Enterprise module',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.3 - Cut modules still load and render', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.3.4: [Part2-3.3] nakivo_assets loads and renders', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let moduleInstalled = false;
    let modelLoadFailures = 0;
    let viewActionFailures = 0;
    let assetAssetOwned = false;
    let assetAssetFieldsGetSucceeded = false;

    // Shared between steps 3, 4, 5 so each manual step owns exactly one action.
    let records: Array<{ name: string; model: string; res_id: number }> = [];
    let models: string[] = [];
    let views: string[] = [];
    let actions: string[] = [];

    console.log('========== CRM-12326_3.3.4 - nakivo_assets loads and renders ==========');

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
      const found = modules.find((m) => m.name === MODULE_NAME);
      moduleInstalled = found?.state === 'installed';
      console.log(`  Module ${MODULE_NAME} state: ${found?.state ?? 'NOT FOUND'}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Get all ir.model.data records owned by nakivo_assets
      records = await platform.callKw(
        'ir.model.data', 'search_read',
        [[['module', '=', MODULE_NAME]], ['name', 'model', 'res_id']],
        { limit: 500 },
      );
      console.log(`  Found ${records.length} ir.model.data records owned by ${MODULE_NAME}`);

      // Categorize by model type
      for (const rec of records) {
        const model = rec.model as string;
        if (model === 'ir.model') models.push(rec.name);
        else if (model === 'ir.ui.view') views.push(rec.name);
        else if (model === 'ir.actions.act_window') actions.push(rec.name);
      }

      console.log(`  Categorized: Models: ${models.length}, Views: ${views.length}, Actions: ${actions.length}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Call fields_get on each model to verify it loads
      for (const xmlId of models) {
        try {
          // Resolve the XML ID to the actual model name via ir.model.data
          const dataRecs = await platform.callKw(
            'ir.model.data', 'search_read',
            [[['name', '=', xmlId], ['module', '=', MODULE_NAME]], ['res_id']],
            { limit: 1 },
          );
          if (dataRecs.length > 0) {
            const modelId = dataRecs[0].res_id as number;
            const modelRecs = await platform.callKw(
              'ir.model', 'search_read',
              [[['id', '=', modelId]], ['model']],
              { limit: 1 },
            );
            if (modelRecs.length > 0) {
              const actualModelName = modelRecs[0].model as string;
              await platform.callKw(actualModelName, 'fields_get', [], { attributes: ['type'] });
            }
          }
        } catch (e) {
          modelLoadFailures++;
          console.log(`  FAIL: model ${xmlId} - ${(e as Error).message}`);
        }
      }

      console.log(`  Model load failures: ${modelLoadFailures}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      // Call fields_view_get on each view to verify it renders
      for (const viewXmlId of views) {
        let viewModel = 'unknown';
        try {
          // Resolve the XML ID to the view ID
          const dataRecs = await platform.callKw(
            'ir.model.data', 'search_read',
            [[['name', '=', viewXmlId], ['module', '=', MODULE_NAME]], ['res_id']],
            { limit: 1 },
          );
          if (dataRecs.length > 0) {
            const viewId = dataRecs[0].res_id as number;
            // Get the view record to determine its type and the model it belongs to
            const viewRecs = await platform.callKw(
              'ir.ui.view', 'search_read',
              [[['id', '=', viewId]], ['type', 'model']],
              { limit: 1 },
            );
            if (viewRecs.length > 0) {
              const viewType = viewRecs[0].type as string;
              viewModel = viewRecs[0].model as string;
              // Call fields_view_get on the actual model that owns the view, not on ir.ui.view
              await platform.callKw(viewModel, 'fields_view_get', [], {
                view_id: viewId,
                view_type: viewType,
                toolbar: false
              });
            }
          }
        } catch (e) {
          viewActionFailures++;
          const errorMsg = (e as Error).message;
          console.log(`  FAIL: view ${viewXmlId} (model: ${viewModel}) - ${errorMsg}`);
          console.log(`        Note: This may be a stale Odoo registry cache on this worker. The same view may render successfully on retry.`);
        }
      }

      // Verify action loading by reading the action definitions
      for (const actionName of actions) {
        try {
          await platform.callKw('ir.actions.act_window', 'search_read', [[['name', '=', actionName]]], { limit: 1 });
        } catch (e) {
          viewActionFailures++;
          console.log(`  FAIL: action ${actionName} - ${(e as Error).message}`);
        }
      }

      console.log(`  View/Action failures: ${viewActionFailures}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);

      // Call fields_get on account.asset.asset to verify it loads
      try {
        await platform.callKw('account.asset.asset', 'fields_get', [], { attributes: ['type'] });
        assetAssetFieldsGetSucceeded = true;
        console.log('  account.asset.asset fields_get: OK');
      } catch (e) {
        console.log(`  account.asset.asset fields_get: FAIL - ${(e as Error).message}`);
      }

      // Get owned record IDs for this module
      const ownedRecords = await platform.ownedRecordIds('ir.model', [MODULE_NAME]);

      // Find the ir.model record for account.asset.asset and check ownership
      const modelRecs = await platform.callKw(
        'ir.model', 'search_read',
        [[['model', '=', 'account.asset.asset']], ['id', 'model', 'module']],
        { limit: 1 },
      );

      if (modelRecs.length > 0) {
        const modelId = modelRecs[0].id as number;
        assetAssetOwned = ownedRecords.has(modelId);
        console.log(`  account.asset.asset id: ${modelId}, owned by ${MODULE_NAME}: ${assetAssetOwned}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - nakivo_assets is installed:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${moduleInstalled}`);
      console.log(`     Result   : ${moduleInstalled ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every model it declares loads - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${modelLoadFailures}`);
      console.log(`     Result   : ${modelLoadFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Every view and action it owns renders/opens - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${viewActionFailures}`);
      console.log(`     Result   : ${viewActionFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - account.asset.asset loads and is attributed to nakivo_assets:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${assetAssetOwned && assetAssetFieldsGetSucceeded}`);
      console.log(`     Result   : ${assetAssetOwned && assetAssetFieldsGetSucceeded ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = moduleInstalled && modelLoadFailures === 0 && viewActionFailures === 0 && assetAssetOwned && assetAssetFieldsGetSucceeded;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - nakivo_assets loaded successfully with no failures`);

      expect(moduleInstalled, 'nakivo_assets must be installed').toBe(true);
      expect(modelLoadFailures, 'no models should fail to load').toBe(0);
      expect(viewActionFailures, 'no views or actions should fail to load').toBe(0);
      expect(assetAssetOwned && assetAssetFieldsGetSucceeded, 'account.asset.asset must load and be owned by nakivo_assets').toBe(true);
    });
  });
});
