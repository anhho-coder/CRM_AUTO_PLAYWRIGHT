import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.3 - Cut modules still load and render
 * Test Case ID: CRM-12326_3.3.1
 * Jira: CRM-12572
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 3, 4 and 5 split back to one test.step each
 *                (they were collapsed into a single "Step 3-5", which read as one opaque
 *                block in the report and hid which action a failure came from).
 *                RPC-only steps are now labelled [INTERNAL check, Call API].
 *
 * Summary:
 *   Verify nakivo_sale still loads and renders after its Enterprise dependency was cut.
 *   It previously declared sale_subscription, sale_coupon and website_sale_coupon dependencies.
 *   This is the largest custom module on the base.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 90):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm nakivo_sale is in state installed.
 *   3. Resolve every model, view and window action the module owns through ir.model.data.
 *   4. Call fields_get on each model it declares.
 *   5. Call fields_view_get on each view it owns, and on every view_mode of each action it owns.
 *
 * Verification Points:
 *   1. nakivo_sale is installed.
 *   2. Every model it declares loads - 0 failures.
 *   3. Every view it owns renders - 0 failures.
 *   4. Every window action it owns opens on every view_mode - 0 failures.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step after login reads over the authenticated
 * JSON-RPC and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry, models, views and actions.
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.3\.1:" --project=chromium
 */

const MODULE = 'nakivo_sale';

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Confirm nakivo_sale is in state installed',
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

  test('CRM-12326_3.3.1: [Part2-3.3] nakivo_sale loads and renders', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    let moduleState = '';
    let modelCount = 0;
    let modelFailures = 0;
    let modelData: Array<{ id: number; model: string }> = [];
    let viewCount = 0;
    let viewSkippedQweb = 0;
    let viewFailures = 0;
    let viewData: Array<{ id: number; name: string; model: string; type: string; active: boolean }> = [];
    let actionCount = 0;
    let actionFailures = 0;
    let actionData: Array<{ id: number; name: string; res_model: string; view_mode: string }> = [];

    console.log('========== CRM-12326_3.3.1 - nakivo_sale loads and renders ==========');

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
      const result = await platform.callKw(
        'ir.module.module', 'search_read',
        [[['name', '=', MODULE]], ['name', 'state']],
        { limit: 1 },
      );
      moduleState = result.length > 0 ? result[0].state : '';
      console.log(`  Module ${MODULE} state: ${moduleState}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Resolve models through ir.model.data
      console.log('  Resolving models...');
      const modelIds = await platform.ownedRecordIds('ir.model', [MODULE]);
      modelData = await platform.callKw(
        'ir.model', 'read',
        [Array.from(modelIds.keys()), ['model']],
        {},
      );
      modelCount = modelData.length;
      console.log(`    Models found: ${modelCount}`);

      // Resolve views through ir.model.data
      console.log('  Resolving views...');
      const viewIds = await platform.ownedRecordIds('ir.ui.view', [MODULE]);
      viewData = await platform.callKw(
        'ir.ui.view', 'read',
        [Array.from(viewIds.keys()), ['name', 'model', 'type', 'active']],
        {},
      );
      console.log(`    Views found: ${viewData.length}`);

      // Resolve window actions through ir.model.data
      console.log('  Resolving window actions...');
      const actionIds = await platform.ownedRecordIds('ir.actions.act_window', [MODULE]);
      actionData = await platform.callKw(
        'ir.actions.act_window', 'read',
        [Array.from(actionIds.keys()), ['name', 'res_model', 'view_mode']],
        {},
      );
      actionCount = actionData.length;
      console.log(`    Actions found: ${actionCount}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      for (const model of modelData) {
        try {
          await platform.callKw(model.model, 'fields_get', [], { attributes: ['type'] });
        } catch (err: unknown) {
          modelFailures++;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.log(`    FAIL - Model ${model.model} (id=${model.id}): ${errMsg.split('\n')[0]}`);
        }
      }
      console.log(`  Model failures: ${modelFailures} out of ${modelCount}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      // Test views with fields_view_get
      console.log('  Testing views...');
      for (const view of viewData) {
        // Skip qweb templates (not model views)
        if (view.type === 'qweb') {
          viewSkippedQweb++;
          continue;
        }
        // Skip views with no model
        if (!view.model) {
          continue;
        }
        viewCount++;
        try {
          await platform.callKw(
            view.model, 'fields_view_get',
            [],
            { view_id: view.id, view_type: view.type, toolbar: false },
          );
        } catch (err: unknown) {
          viewFailures++;
          const errMsg = err instanceof Error ? err.message : String(err);
          console.log(`    FAIL - View ${view.name} (id=${view.id}, model=${view.model}, type=${view.type}): ${errMsg.split('\n')[0]}`);
        }
      }
      console.log(`  Views checked: ${viewCount} (skipped ${viewSkippedQweb} qweb templates)`);
      console.log(`  View failures: ${viewFailures}`);

      // Test window actions with fields_view_get
      console.log('  Testing window actions...');
      for (const action of actionData) {
        if (!action.res_model || !action.view_mode) {
          continue;
        }
        const viewModes = action.view_mode.split(',').map((m: string) => m.trim());
        for (let mode of viewModes) {
          // Map 'list' to 'tree' if needed
          if (mode === 'list') {
            mode = 'tree';
          }
          // Skip qweb
          if (mode === 'qweb') {
            continue;
          }
          try {
            await platform.callKw(
              action.res_model, 'fields_view_get',
              [],
              { view_type: mode, toolbar: false },
            );
          } catch (err: unknown) {
            actionFailures++;
            const errMsg = err instanceof Error ? err.message : String(err);
            console.log(`    FAIL - Action ${action.name} (id=${action.id}, model=${action.res_model}, mode=${mode}): ${errMsg.split('\n')[0]}`);
          }
        }
      }
      console.log(`  Action failures: ${actionFailures} out of ${actionCount}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');
      console.log(`  Verify #1 - nakivo_sale is installed:`);
      console.log(`     Expected : installed`);
      console.log(`     Actual   : ${moduleState}`);
      console.log(`     Result   : ${moduleState === 'installed' ? 'PASS' : 'FAIL'}`);

      console.log(`  Verify #2 - Every model it declares loads - 0 failures:`);
      console.log(`     Expected : 0 failures`);
      console.log(`     Actual   : ${modelFailures} failures (${modelCount} models checked)`);
      console.log(`     Result   : ${modelFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`  Verify #3 - Every view it owns renders - 0 failures:`);
      console.log(`     Expected : 0 failures`);
      console.log(`     Actual   : ${viewFailures} failures (${viewCount} views checked, ${viewSkippedQweb} qweb skipped)`);
      console.log(`     Result   : ${viewFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log(`  Verify #4 - Every window action it owns opens on every view_mode - 0 failures:`);
      console.log(`     Expected : 0 failures`);
      console.log(`     Actual   : ${actionFailures} failures (${actionCount} actions checked)`);
      console.log(`     Result   : ${actionFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = moduleState === 'installed' && modelFailures === 0 && viewFailures === 0 && actionFailures === 0;
      const checkedTotal = modelCount + viewCount + actionCount;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - nakivo_sale module loads and renders (${checkedTotal} entities checked)`);

      expect(moduleState, 'nakivo_sale should be installed').toBe('installed');
      expect(modelFailures, `all ${modelCount} models should load without error`).toBe(0);
      expect(viewFailures, `all ${viewCount} views should render without error`).toBe(0);
      expect(actionFailures, 'all action view_modes should open without error').toBe(0);
    });
  });
});
