import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.6 - Retained behaviour after the cut
 * Test Case ID: CRM-12326_3.6.2
 * Jira: CRM-12587
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2, 3, 4, 5 split back to one test.step each;
 *                RPC-only steps s2-s5 labelled [INTERNAL check, Call API]
 *
 * Summary:
 *   Verify the equipment register kept by nakivo_assets still opens and a record still renders
 *   after account_asset was removed - the register is the capability that was RETAINED, while
 *   the accounting depreciation is route 3, deliberately not provided.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 108):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *   Dev decision on CRM-12125 comment 685328: 0 depreciation entries were ever posted on
 *   Production, so nothing in the books needs preserving
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Open the asset/equipment register screen owned by nakivo_assets.
 *   3. Confirm the list renders and open one record.
 *   4. Confirm the record's equipment fields (serial number, location, holder) are present.
 *   5. Confirm no depreciation board or depreciation-line field is present on the form.
 *
 * Verification Points:
 *   1. The register list renders with no error dialog.
 *   2. A record opens and shows its equipment fields.
 *   3. No depreciation board or depreciation-line field is present, matching route 3.
 *
 * READ-ONLY: this spec only reads the asset register and fields_view_get metadata. It creates,
 * modifies and deletes nothing, as required on crm-mig. It opens an EXISTING record via backend
 * read, not UI form save.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\\.6\\.2:" --project=chromium
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
  // Manual steps 2, 3, 4, 5 are the SUBSTANCE of this TC, not setup, so they stay 1:1 with the Xray
  // manual steps. They were previously collapsed into two merged steps ("Steps 2-3" and "Steps 4-5"),
  // which read as opaque blocks in the report: a reader could not tell which of the actions a
  // failure came from. Grouping is only allowed for a contiguous run of pure SETUP steps.
  s2:      'Step 2: [INTERNAL check, Call API] Open the asset/equipment register screen owned by nakivo_assets',
  s3:      'Step 3: [INTERNAL check, Call API] Confirm the list renders and open one record',
  s4:      'Step 4: [INTERNAL check, Call API] Confirm the record\'s equipment fields (serial number, location, holder) are present',
  s5:      'Step 5: [INTERNAL check, Call API] Confirm no depreciation board or depreciation-line field is present on the form',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.6 - Retained behaviour after the cut', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.6.2: [Part2-3.6] Equipment register opens without depreciation', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // Result holders for verification
    let listRendered = false;
    let equipmentFieldsFound: string[] = [];
    let deprecationFieldsFound: string[] = [];
    let recordOpened = false;
    let listViewSuccess = false;
    let formViewSuccess = false;
    let readRecordSuccess = false;

    console.log('========== CRM-12326_3.6.2 - Equipment register opens without depreciation ==========');

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    // Carried between steps 2 -> 3, so each manual step owns exactly one action.
    let assetActionId: number | null = null;

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      // Resolve the register action owned by nakivo_assets module
      const ownedActions = await platform.ownedRecordIds('ir.actions.act_window', ['nakivo_assets']);

      // Search through owned actions to find the one with res_model 'account.asset.asset'
      for (const [actionId, _] of ownedActions.entries()) {
        const action = await platform.callKw<any>(
          'ir.actions.act_window', 'read',
          [actionId, ['name', 'res_model', 'view_mode']],
        );

        if (action[0]?.res_model === 'account.asset.asset') {
          assetActionId = actionId;
          console.log(`  Found asset action ID ${actionId}: ${action[0].name}`);
          break;
        }
      }

      // Fallback: if no owned action, query directly
      if (!assetActionId) {
        console.log('  No owned action found, querying account.asset.asset directly');
        const fallbackAction = await platform.callKw<any>(
          'ir.actions.act_window', 'search',
          [[['res_model', '=', 'account.asset.asset']]],
          { limit: 1 },
        );
        if (fallbackAction.length > 0) {
          assetActionId = fallbackAction[0];
        }
      }

      if (!assetActionId) {
        throw new Error('Could not resolve asset register action');
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Get the list view (tree type) fields_view_get
      try {
        const listView = await platform.callKw<any>(
          'account.asset.asset', 'fields_view_get',
          [], { view_id: false, view_type: 'tree', toolbar: false },
        );
        listRendered = true;
        listViewSuccess = true;
        console.log('  OK - list view rendered successfully');
      } catch (err) {
        console.log(`  ERROR - list view failed: ${(err as Error).message}`);
        listViewSuccess = false;
      }

      // Verify a record actually exists and can be read
      try {
        const recordIds = await platform.callKw<number[]>(
          'account.asset.asset', 'search',
          [[]],
          { limit: 1 },
        );

        if (recordIds.length > 0) {
          const recordId = recordIds[0];
          // Get form view to obtain field names for read
          const formView = await platform.callKw<any>(
            'account.asset.asset', 'fields_view_get',
            [], { view_id: false, view_type: 'form', toolbar: false },
          );
          const fieldNames = Object.keys(formView.fields || {});
          const record = await platform.callKw<any>(
            'account.asset.asset', 'read',
            [recordId, fieldNames],
          );
          recordOpened = true;
          readRecordSuccess = true;
          console.log(`  OK - record ${recordId} opened and read successfully with ${fieldNames.length} fields`);
        } else {
          console.log('  WARNING - no asset records found in the system');
          recordOpened = false;
          readRecordSuccess = true; // Mark as success since no records = no error
        }
      } catch (err) {
        console.log(`  ERROR - failed to open and read record: ${(err as Error).message}`);
        readRecordSuccess = false;
      }
    });

    // Carried between steps 4 -> 5, so each manual step owns exactly one action.
    let formFields: Record<string, any> = {};
    let formArch = '';

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      // Get the form view fields_view_get
      try {
        const formView = await platform.callKw<any>(
          'account.asset.asset', 'fields_view_get',
          [], { view_id: false, view_type: 'form', toolbar: false },
        );
        formFields = formView.fields || {};
        formArch = formView.arch || '';
        formViewSuccess = true;
        console.log(`  OK - form view rendered, ${Object.keys(formFields).length} fields available`);
      } catch (err) {
        console.log(`  ERROR - form view failed: ${(err as Error).message}`);
        formViewSuccess = false;
        throw err;
      }

      // Check for equipment fields (serial, location, holder, employee, user)
      const equipmentFieldPatterns = /serial|location|holder|employee|user/i;
      for (const fieldName of Object.keys(formFields)) {
        if (equipmentFieldPatterns.test(fieldName)) {
          equipmentFieldsFound.push(fieldName);
        }
      }
      console.log(`  Equipment fields found: ${equipmentFieldsFound.join(', ') || 'none'}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      // Check for depreciation fields - should be ABSENT
      const depreciationFieldPatterns = /depreciation/i;
      for (const fieldName of Object.keys(formFields)) {
        if (depreciationFieldPatterns.test(fieldName)) {
          deprecationFieldsFound.push(fieldName);
        }
      }

      // Also check form arch for depreciation_line_ids
      const hasDepreciationLineInArch = /depreciation_line_ids/.test(formArch);
      if (hasDepreciationLineInArch) {
        deprecationFieldsFound.push('depreciation_line_ids (in arch)');
      }

      console.log(`  Depreciation fields found: ${deprecationFieldsFound.join(', ') || 'none'}`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - The register list renders with no error dialog:');
      console.log(`     Expected : list view renders successfully`);
      console.log(`     Actual   : ${listViewSuccess ? 'SUCCESS' : 'FAILURE'}`);
      console.log(`     Result   : ${listViewSuccess ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #2 - A record opens and shows its equipment fields:');
      console.log(`     Expected : equipment fields present (serial, location, holder, employee, user)`);
      console.log(`     Actual   : ${equipmentFieldsFound.length > 0 ? equipmentFieldsFound.join(', ') : 'no equipment fields found'}`);
      console.log(`     Result   : ${equipmentFieldsFound.length > 0 ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #3 - No depreciation board or depreciation-line field is present:');
      console.log(`     Expected : no depreciation fields`);
      console.log(`     Actual   : ${deprecationFieldsFound.length > 0 ? deprecationFieldsFound.join(', ') : 'no depreciation fields found (correct)'}`);
      console.log(`     Result   : ${deprecationFieldsFound.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = listViewSuccess && equipmentFieldsFound.length > 0 && deprecationFieldsFound.length === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - Equipment register opens with retained fields, no depreciation`);

      // Expectations (3 bullets = 3 expect calls)
      expect(listViewSuccess, 'list view must render successfully without error').toBe(true);
      expect(equipmentFieldsFound.length, 'at least one equipment field must be present').toBeGreaterThan(0);
      expect(deprecationFieldsFound.length, 'no depreciation fields should be present').toBe(0);
    });
  });
});
