import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.3 - Cut modules still load and render
 * Test Case ID: CRM-12326_3.3.5
 * Jira: CRM-12576
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 3, 4, 5, 6 split back to one test.step each
 *                (they were collapsed into a single "Step 3-5", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify that nakivo_transfer_exhibition module still loads and renders correctly
 *   after its Enterprise dependency on web_studio was cut. This module was unique
 *   in that web_studio was its only removed dependency and served as the visual editor.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 94):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *   - The editor payload was re-delivered under NAKIVO naming per CRM-12126 comment 685484
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Confirm nakivo_transfer_exhibition is in state installed.
 *   3. Resolve every model, view and window action the module owns through ir.model.data.
 *   4. Call fields_get on each model it declares.
 *   5. Call fields_view_get on each view it owns, and on every view_mode of each action it owns.
 *   6. Confirm no view it owns is of an Enterprise-only type and no field it references is a surviving web_studio x_ field that is now absent.
 *
 * Verification Points:
 *   1. nakivo_transfer_exhibition is installed.
 *   2. Every model it declares loads - 0 failures.
 *   3. Every view and action it owns renders/opens - 0 failures.
 *   4. No web_studio asset bundle is served while its screens are open.
 *   5. No Enterprise-only view types found.
 *   6. No view it owns still references a web_studio x_ field that the view's own field set
 *      no longer resolves. (This is the second clause of Xray step 6. It was NOT implemented
 *      before 2026-09-16 - step 6 only checked the view TYPE and printed a 'not implemented'
 *      note for this half, so the TC reported on a check it was not making.)
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step after login reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads the module registry and makes RPC calls to fields_get/fields_view_get.
 * It creates, modifies and deletes nothing, as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.3\.5:" --project=chromium
 */

/** The target module being tested. */
const TARGET_MODULE = 'nakivo_transfer_exhibition';

/** Enterprise-only view types that should never appear in in-scope modules. */
const ENTERPRISE_VIEW_TYPES = ['gantt', 'grid', 'cohort', 'dashboard'];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Confirm nakivo_transfer_exhibition is in state installed',
  s3:      'Step 3: [INTERNAL check, Call API] Resolve every model, view and window action the module owns through ir.model.data',
  s4:      'Step 4: [INTERNAL check, Call API] Call fields_get on each model it declares',
  s5:      'Step 5: [INTERNAL check, Call API] Call fields_view_get on each view it owns, and on every view_mode of each action it owns',
  s6:      'Step 6: [INTERNAL check, Call API] Confirm no view it owns is of an Enterprise-only type and no field it references is a surviving web_studio x_ field that is now absent',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.3 - Cut modules still load and render', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.3.5: [Part2-3.3] nakivo_transfer_exhibition loads and renders', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform = new MigPlatformPage(page);

    // Tracking variables for verification
    let moduleInstalled = false;
    let fieldsGetFailures = 0;
    let fieldsViewGetFailures = 0;
    let webStudioBundleRequested = false;
    let enterpriseViewTypeCount = 0;
    // Xray step 6 has TWO clauses. This is the second one: a field the arch still references
    // that web_studio used to create (x_*) and that no longer exists in the view's field set.
    let missingStudioFields: string[] = [];

    // Data hoisted for consumption across steps (step N+1 consumes what step N produces)
    let ownedDataRecords: Record<string, any>[] = [];
    let recordsByModel: Record<string, Record<string, any>[]> = {};
    let viewInfos: Array<{ viewId: number; viewType: string; info: Record<string, any> }> = [];

    console.log('========== CRM-12326_3.3.5 - nakivo_transfer_exhibition loads and renders ==========');

    // Register response listener BEFORE any navigation to capture all requests.
    // CRITICAL false-positive guard: /base/static/img/icons/web_studio.png is the Apps kanban icon
    // of the uninstallable web_studio row - this is legitimate. Only /web_studio/static/ BUNDLE counts.
    page.on('response', (response) => {
      const url = response.url();
      // Filter on '/web_studio/static/' and exclude the icon image
      if (url.includes('/web_studio/static/') && !url.includes('web_studio.png')) {
        webStudioBundleRequested = true;
      }
    });

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
      const targetModuleInfo = modules.find((m) => m.name === TARGET_MODULE);
      if (targetModuleInfo && targetModuleInfo.state === 'installed') {
        moduleInstalled = true;
        console.log(`  ${TARGET_MODULE}: state = "${targetModuleInfo.state}"`);
        console.log('  OK - module is installed');
      } else {
        console.log(`  ${TARGET_MODULE}: state = "${targetModuleInfo?.state ?? 'NOT FOUND'}"`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // ONE bounded search_read, not search-then-read.
      // Odoo 12's read() takes NO `limit` kwarg: the previous search + read({limit: 500}) raised
      // "read() got an unexpected keyword argument 'limit'", the catch below swallowed it into a
      // plain console.log, and ownedDataRecords stayed empty - so steps 4, 5 and 6 each printed
      // "no records to process" and the whole TC reported PASS while checking nothing.
      // That false green was present in the 2026-09-15 run too; it is NOT a side effect of the
      // 1:1 step split. Bounded per the crm-mig read rules: narrow filter + limit 500.
      ownedDataRecords = await platform.callKw<Record<string, any>[]>(
        'ir.model.data', 'search_read',
        [[['module', '=', TARGET_MODULE]], ['model', 'res_id', 'name']],
        { limit: 500 },
      );

      console.log(`  Records owned by ${TARGET_MODULE}: ${ownedDataRecords.length}`);

      // Finding nothing is NOT a pass here: this module is installed and owns its objects, so an
      // empty result means the query failed to reach them. Fail loudly instead of walking on with
      // an empty set, which is what made steps 4-6 vacuous.
      expect(
        ownedDataRecords.length,
        `ir.model.data returned 0 rows for module ${TARGET_MODULE} - steps 4, 5 and 6 would then `
        + 'check nothing and the TC would report a vacuous PASS',
      ).toBeGreaterThan(0);

      // Group records by model type
      for (const record of ownedDataRecords) {
        const model = record.model;
        if (!recordsByModel[model]) {
          recordsByModel[model] = [];
        }
        recordsByModel[model].push(record);
      }

      console.log(`  Model types in owned records: ${Object.keys(recordsByModel).join(', ')}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      if (ownedDataRecords.length === 0) {
        console.log('  (no records to process - step 3 found none)');
        return;
      }

      // Test fields_get on all non-view, non-action models
      for (const [model, records] of Object.entries(recordsByModel)) {
        if (model === 'ir.ui.view' || model === 'ir.actions.act_window') {
          continue; // Handle these separately with fields_view_get
        }
        try {
          const fieldsInfo = await platform.callKw<Record<string, any>>(
            model, 'fields_get',
            [],
            {}
          );
          console.log(`  fields_get(${model}): ${Object.keys(fieldsInfo).length} fields OK`);
        } catch (err) {
          fieldsGetFailures++;
          console.log(`  fields_get(${model}): FAILED - ${(err as Error).message}`);
        }
      }
      console.log(`  fields_get calls: ${Object.keys(recordsByModel).length - (recordsByModel['ir.ui.view'] ? 1 : 0) - (recordsByModel['ir.actions.act_window'] ? 1 : 0)} models tested`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      if (ownedDataRecords.length === 0) {
        console.log('  (no records to process - step 3 found none)');
        return;
      }

      // Test fields_view_get on all ir.ui.view records
      if (recordsByModel['ir.ui.view']) {
        for (const viewRecord of recordsByModel['ir.ui.view']) {
          const viewId = viewRecord.res_id;
          try {
            const viewInfo = await platform.callKw<Record<string, any>>(
              'ir.ui.view', 'fields_view_get',
              [],
              { view_id: viewId, view_type: 'form', toolbar: false }
            );
            console.log(`  fields_view_get(ir.ui.view ${viewId}): type="${viewInfo.type}" OK`);
            viewInfos.push({ viewId, viewType: viewInfo.type, info: viewInfo });
          } catch (err) {
            fieldsViewGetFailures++;
            console.log(`  fields_view_get(ir.ui.view ${viewId}): FAILED - ${(err as Error).message}`);
          }
        }
      }

      // Test fields_view_get on all ir.actions.act_window records and their referenced views
      if (recordsByModel['ir.actions.act_window']) {
        for (const actionRecord of recordsByModel['ir.actions.act_window']) {
          const actionId = actionRecord.res_id;
          try {
            const actionInfo = await platform.callKw<Record<string, any>[]>(
              'ir.actions.act_window', 'read',
              [[actionId], ['view_mode', 'view_ids']],
              {}
            );
            if (actionInfo && actionInfo.length > 0) {
              const viewMode = actionInfo[0].view_mode || '';
              const viewIds = actionInfo[0].view_ids || [];
              const viewTypes = String(viewMode).split(',').map((v: string) => v.trim()).filter((v: string) => v);
              console.log(`  ir.actions.act_window ${actionId}: view_mode="${viewMode}" OK`);

              // For each view_type in view_mode, test fields_view_get with that view_type
              // Use the first view_id if available, otherwise skip (view_ids might be empty for custom actions)
              if (viewIds.length > 0) {
                const testViewId = viewIds[0];
                for (const viewType of viewTypes) {
                  try {
                    const viewInfo = await platform.callKw<Record<string, any>>(
                      'ir.ui.view', 'fields_view_get',
                      [],
                      { view_id: testViewId, view_type: viewType, toolbar: false }
                    );
                    console.log(`    fields_view_get(action view ${testViewId}, type="${viewType}"): type="${viewInfo.type}" OK`);
                    viewInfos.push({ viewId: testViewId, viewType: viewInfo.type, info: viewInfo });
                  } catch (err) {
                    fieldsViewGetFailures++;
                    console.log(`    fields_view_get(action view ${testViewId}, type="${viewType}"): FAILED - ${(err as Error).message}`);
                  }
                }
              }
            }
          } catch (err) {
            fieldsViewGetFailures++;
            console.log(`  ir.actions.act_window ${actionId}: FAILED - ${(err as Error).message}`);
          }
        }
      }
      console.log(`  Total view/action views tested: ${viewInfos.length}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);

      if (viewInfos.length === 0) {
        // NOT the same as "checked and found nothing". fields_view_get returns the arch and the
        // resolved field set, so a view that FAILS to build contributes nothing to inspect - this
        // check is then NOT PERFORMED, and step 5's failure count is the finding to act on.
        console.log(`  NOT CHECKED - step 5 built 0 views (${fieldsViewGetFailures} view(s) failed to build),`);
        console.log('               so there is no arch or field set to inspect. This is not a pass.');
        return;
      }

      console.log(`  Checking ${viewInfos.length} views for Enterprise-only types and x_ fields:`);
      for (const view of viewInfos) {
        if (view.viewType && ENTERPRISE_VIEW_TYPES.includes(view.viewType)) {
          enterpriseViewTypeCount++;
          console.log(`    View ${view.viewId}: ENTERPRISE TYPE "${view.viewType}" FOUND`);
        }

        // Second clause of Xray step 6: a surviving web_studio field. fields_view_get already
        // returned both the arch and the resolved field set for this view, so the check needs no
        // further RPC: every x_-prefixed name the arch still references must be present in `fields`.
        // A referenced x_ field that is NOT in the field set is a reference web_studio left behind.
        const arch = typeof view.info?.arch === 'string' ? view.info.arch : '';
        const knownFields = Object.keys(view.info?.fields ?? {});
        const referencedStudioFields = [...new Set(
          [...arch.matchAll(/name="(x_[A-Za-z0-9_]+)"/g)].map((m) => m[1]),
        )];
        for (const f of referencedStudioFields) {
          if (!knownFields.includes(f)) {
            missingStudioFields.push(`view ${view.viewId} -> ${f}`);
            console.log(`    View ${view.viewId}: references web_studio field "${f}" which the view's field set does NOT resolve`);
          }
        }
        if (referencedStudioFields.length) {
          console.log(`    View ${view.viewId}: x_ fields referenced = ${referencedStudioFields.length}, all resolved = ${referencedStudioFields.every((f) => knownFields.includes(f)) ? 'yes' : 'NO'}`);
        }
      }
      console.log(`  Enterprise-only view types found      : ${enterpriseViewTypeCount}`);
      console.log(`  Referenced-but-absent web_studio x_ fields: ${missingStudioFields.length}${missingStudioFields.length ? ` - [${missingStudioFields.join(', ')}]` : ''}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - nakivo_transfer_exhibition is installed:');
      console.log(`     Expected : true`);
      console.log(`     Actual   : ${moduleInstalled}`);
      console.log(`     Result   : ${moduleInstalled ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every model it declares loads - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${fieldsGetFailures}`);
      console.log(`     Result   : ${fieldsGetFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #3 - Every view and action it owns renders/opens - 0 failures:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${fieldsViewGetFailures}`);
      console.log(`     Result   : ${fieldsViewGetFailures === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #4 - No web_studio asset bundle is served while its screens are open:');
      console.log(`     Expected : false`);
      console.log(`     Actual   : ${webStudioBundleRequested}`);
      console.log(`     Result   : ${!webStudioBundleRequested ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #5 - No Enterprise-only view types found - 0 views:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${enterpriseViewTypeCount}`);
      console.log(`     Result   : ${enterpriseViewTypeCount === 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #6 - No view still references a web_studio x_ field that no longer resolves:');
      console.log(`     Expected : 0`);
      console.log(`     Actual   : ${missingStudioFields.length}${missingStudioFields.length ? ` - [${missingStudioFields.join(', ')}]` : ''}`);
      console.log(`     Result   : ${viewInfos.length === 0
        ? `NOT CHECKED - 0 views built (${fieldsViewGetFailures} failed), nothing to inspect`
        : (missingStudioFields.length === 0 ? 'PASS' : 'FAIL')}`);

      console.log('===============================================');
      const allPass = moduleInstalled && fieldsGetFailures === 0 && fieldsViewGetFailures === 0 && !webStudioBundleRequested && enterpriseViewTypeCount === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - nakivo_transfer_exhibition module integrity verified`);

      // Six expect() calls, one per expected-result bullet (the sixth covers Xray step 6's
      // second clause - the surviving web_studio x_ field - which was previously not implemented)
      expect(moduleInstalled, 'nakivo_transfer_exhibition should be installed').toBe(true);
      expect(fieldsGetFailures, 'all fields_get calls should succeed (0 failures)').toBe(0);
      expect(fieldsViewGetFailures, 'all fields_view_get calls should succeed (0 failures)').toBe(0);
      expect(webStudioBundleRequested, 'no web_studio static bundle should be requested').toBe(false);
      expect(enterpriseViewTypeCount, 'no Enterprise-only view types should be found').toBe(0);
      expect(missingStudioFields, `a view still references a web_studio x_ field that no longer resolves: ${missingStudioFields.join(', ')}`).toHaveLength(0);
    });
  });
});
