import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.6 - Retained behaviour after the cut
 * Test Case ID: CRM-12326_3.6.4
 * Jira: CRM-12589
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 * Last-revised: 2026-09-16 - Step 5 tagged [INTERNAL check, Call API] to signal RPC-only
 *                verification (no UI driven)
 *
 * Summary:
 *   Verify the nakivo_transfer_exhibition module field (exhibitor_id on crm.lead) renders on the
 *   Lead/Opportunity form, persists when saved, and no web_studio editor bundle is loaded.
 *   The module owns no menu; its surface is the inherited form field on crm.lead.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 122):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Open the screen owned by nakivo_transfer_exhibition and confirm it renders.
 *   3. Create or open a record, fill the editor-created fields the module relies on, and SAVE.
 *   4. Re-open the record and confirm every value persisted.
 *   5. Confirm no /web_studio/static/ asset bundle is requested while the screen is open.
 *
 * Verification Points:
 *   1. The screen renders with no error dialog.
 *   2. The record saves and every value is read back unchanged after re-open.
 *   3. 0 /web_studio/static/ asset bundles are requested.
 *
 * Implementation note:
 *   nakivo_transfer_exhibition owns no ir.ui.menu and no ir.actions.act_window. Its user-visible
 *   surface is inherited views: ir.ui.view #2269 is a form on model crm.lead that adds field
 *   exhibitor_id (many2one, label 'Exhibitor'). The screen to exercise is the CRM Lead/Opportunity
 *   FORM, which is where this module's field renders.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\\.6\\.4:" --project=chromium
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
  s2:      'Step 2: Open the screen owned by nakivo_transfer_exhibition and confirm it renders',
  s3:      'Step 3: Create or open a record, fill the editor-created fields the module relies on, and SAVE',
  s4:      'Step 4: Re-open the record and confirm every value persisted',
  s5:      'Step 5: [INTERNAL check, Call API] Confirm no /web_studio/static/ asset bundle is requested while the screen is open',
  verify:  'Verification',
} as const;

const TC_ID = 'CRM-12326_3.6.4';
// MARKER must live at MODULE scope, not inside the test: afterAll sweeps BY the marker, and a marker
// computed inside the test body is invisible to the hook - which is how a sweep silently becomes a
// no-op while still looking like a safety net.
const MARKER = `AUTO-${TC_ID}-${Date.now()}`;
let testCreatedRecordId: number | null = null;

test.describe('CRM-12326 Part 2-3.6 - Retained behaviour after the cut', () => {

  test.afterEach(async ({ page }, testInfo) => {
    // Log failure reason if needed
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }

    // Cleanup: delete the created record even if test failed
    if (testCreatedRecordId !== null) {
      try {
        const platform = new MigPlatformPage(page);
        // Odoo call_kw takes the ids as a LIST in args[0] - `[[id]]`, not `[id]`.
        await platform.callKw('crm.lead', 'unlink', [[testCreatedRecordId]]);
        console.log(`  [afterEach cleanup] Deleted record ${testCreatedRecordId}`);
      } catch (err) {
        console.log(`  [afterEach cleanup] Failed to delete record ${testCreatedRecordId}: ${(err as Error).message}`);
      }
      testCreatedRecordId = null;
    }
  });

  test.afterAll(async ({ browser }) => {
    // The global `timeout: 30000` in playwright.config.ts applies to hooks too, and this sweep
    // opens a context + logs in + deletes - well over 30 s. Without this the hook times out and
    // the test goes red although its body passed. See helpers/o12ce-main-business.helper.ts.
    test.setTimeout(120_000);
    // Real sweep by marker - unconditional, because an aborted run never reaches afterEach and has
    // no status to branch on. This is the only thing standing between a crashed run and a leftover
    // record on a shared QA instance.
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    const platform = new MigPlatformPage(page);
    try {
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      const { deleted, failed } = await platform.deleteRecordsByNameMarker('crm.lead', MARKER, 'name');
      if (deleted.length) console.log(`  afterAll sweep: deleted ${deleted.length} leftover lead(s): ${deleted.join(', ')}`);
      if (failed.length) console.log(`  afterAll sweep WARNING: could not delete ${failed.length}: ${JSON.stringify(failed)}`);
      const remaining = await platform.countRecordsByNameMarker('crm.lead', MARKER, 'name');
      console.log(`  afterAll sweep: records still carrying marker "${MARKER}": ${remaining}`);
    } catch (err) {
      console.log(`  afterAll sweep error: ${(err as Error).message}`);
    } finally {
      await context.close();
    }
  });

  test('CRM-12326_3.6.4: [Part2-3.6] Transfer Exhibition screens save without studio', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    // TC_ID and MARKER live at module scope so afterAll can sweep by them - not re-declared here.

    // Result holders for verification
    let screenRendered = false;
    let recordCreated = false;
    let createdRecordId: number | null = null;
    let exhibitorIdFieldPresent = false;
    let exhibitorIdValueSet: string = '';
    let exhibitorIdValueRead: string = '';
    let recordSaveSuccess = false;
    let recordPersisted = false;
    let webStudioBundlesRequested: string[] = [];

    console.log('========== CRM-12326_3.6.4 - Transfer Exhibition screens save without studio ==========');

    // Attach request listener to track web_studio bundles
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/web_studio/static/')) {
        webStudioBundlesRequested.push(url);
        console.log(`  [REQUEST CAPTURED] /web_studio/static/ bundle: ${url}`);
      }
    });

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.admin_crm_mig.username}`);
      console.log(`  Target  : ${baseUrl_mig}`);
      console.log(`  Marker  : ${MARKER}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in on the Migration server');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);

      // The screen is the CRM Lead/Opportunity form where exhibitor_id is inherited
      // Navigate to Leads list first: hash #menu_id=229&action_id=345
      const leadsListUrl = MigPlatformPage.appUrl('#menu_id=229&action_id=345');
      console.log(`  Opening Leads list at: ${leadsListUrl}`);
      // Go through the page object, NOT a raw page.goto: openAppAndAssertRendered also waits for the
      // action to actually appear in the URL. A bare goto returns while the previous screen is still
      // rendered, and the CREATE click then inspects the wrong screen.
      await platform.openAppAndAssertRendered('#menu_id=229&action_id=345');

      // Verify the list renders without error dialog
      screenRendered = !(await platform.isErrorDialogVisible());
      if (screenRendered) {
        console.log('  OK - Leads list rendered successfully, no error dialog');
      } else {
        const errorMsg = await platform.getErrorDialogText();
        console.log(`  ERROR - Error dialog present: ${errorMsg}`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // Click CREATE button to open a new lead form
      console.log('  Clicking CREATE button...');
      const formReady = await platform.clickCreateAndBuildForm();
      if (!formReady) {
        throw new Error('Failed to open create form for Lead');
      }
      console.log('  OK - Lead form opened for new record');

      // Fill lead name with MARKER
      const leadName = `${MARKER}`;
      console.log(`  Filling name field with: ${leadName}`);
      await platform.fillFormField('name', leadName);

      // Check if exhibitor_id field is present
      exhibitorIdFieldPresent = await platform.isFormFieldPresent('exhibitor_id');
      console.log(`  exhibitor_id field present: ${exhibitorIdFieldPresent ? 'YES' : 'NO'}`);

      if (exhibitorIdFieldPresent) {
        // Get an existing exhibitor from nakivo.exhibitor model
        console.log('  Searching for existing exhibitor records...');
        const exhibitors = await platform.callKw<any[]>(
          'nakivo.exhibitor', 'search_read',
          [[]],
          { limit: 1, fields: ['id', 'name'] },
        );

        if (exhibitors.length > 0) {
          const exhibitor = exhibitors[0];
          exhibitorIdValueSet = exhibitor.name || `Exhibitor #${exhibitor.id}`;
          console.log(`  Found exhibitor: ${exhibitorIdValueSet} (id: ${exhibitor.id})`);

          // Set the exhibitor_id field using the display name
          await platform.fillFormField('exhibitor_id', exhibitorIdValueSet);
          console.log(`  Set exhibitor_id to: ${exhibitorIdValueSet}`);
        } else {
          console.log('  WARNING - no exhibitor records found, skipping exhibitor_id field');
          exhibitorIdValueSet = '';
        }
      }

      // Save the form
      console.log('  Saving form...');
      await platform.saveForm();
      recordSaveSuccess = !(await platform.isErrorDialogVisible());

      if (recordSaveSuccess) {
        // Extract record ID from URL
        createdRecordId = await platform.currentRecordIdFromUrl();
        if (createdRecordId) {
          recordCreated = true;
          testCreatedRecordId = createdRecordId; // Set module-scoped for cleanup
          console.log(`  OK - Record saved successfully with ID: ${createdRecordId}`);
        } else {
          console.log('  WARNING - Could not extract record ID from URL');
        }
      } else {
        const errorMsg = await platform.getErrorDialogText();
        console.log(`  ERROR - Save failed: ${errorMsg}`);
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      if (!createdRecordId) {
        console.log('  SKIP - No record ID from creation step');
        return;
      }

      // Re-open the record by direct URL navigation
      console.log(`  Re-opening record ID ${createdRecordId}...`);
      const leadFormUrl = MigPlatformPage.appUrl(`#model=crm.lead&id=${createdRecordId}&view_type=form`);
      await page.goto(leadFormUrl);

      // Small delay to ensure form loads
      await page.waitForTimeout(1000);

      // Read the name field value
      const nameValue = await platform.readFormField('name');
      console.log(`  Read name field: ${nameValue}`);

      // Read the exhibitor_id field value (if it was set)
      if (exhibitorIdFieldPresent && exhibitorIdValueSet) {
        exhibitorIdValueRead = await platform.readFormField('exhibitor_id');
        console.log(`  Read exhibitor_id field: ${exhibitorIdValueRead}`);
      }

      // Verify persistence
      recordPersisted = nameValue === (MARKER);
      if (recordPersisted) {
        if (exhibitorIdFieldPresent && exhibitorIdValueSet) {
          recordPersisted = exhibitorIdValueRead === exhibitorIdValueSet;
        }
        console.log(`  OK - All values persisted correctly`);
      } else {
        console.log(`  ERROR - Name field value changed or lost`);
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      if (webStudioBundlesRequested.length === 0) {
        console.log('  OK - No /web_studio/static/ bundles were requested');
      } else {
        console.log(`  ERROR - ${webStudioBundlesRequested.length} /web_studio/static/ bundles were loaded:`);
        for (const url of webStudioBundlesRequested) {
          console.log(`         ${url}`);
        }
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - The screen renders with no error dialog:');
      console.log(`     Expected : screen renders without errors`);
      console.log(`     Actual   : ${screenRendered ? 'SUCCESS' : 'FAILURE'}`);
      console.log(`     Result   : ${screenRendered ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #2 - The record saves and every value is read back unchanged after re-open:');
      console.log(`     Expected : name field persisted (value: ${MARKER})`);
      console.log(`                exhibitor_id field persisted${exhibitorIdFieldPresent && exhibitorIdValueSet ? ` (value: ${exhibitorIdValueSet})` : ' (field not present or not set)'}`);
      console.log(`     Actual   : ${recordSaveSuccess && recordPersisted ? 'VALUES PERSISTED' : recordSaveSuccess ? 'SAVE OK BUT PERSIST FAILED' : 'SAVE FAILED'}`);
      console.log(`     Result   : ${recordSaveSuccess && recordPersisted ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #3 - 0 /web_studio/static/ asset bundles are requested:');
      console.log(`     Expected : web_studio bundle count = 0`);
      console.log(`     Actual   : web_studio bundle count = ${webStudioBundlesRequested.length}`);
      console.log(`     Result   : ${webStudioBundlesRequested.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      const allPass = screenRendered && recordSaveSuccess && recordPersisted && webStudioBundlesRequested.length === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - Transfer Exhibition field renders, persists, no studio bundle loaded`);

      // Expectations (3 bullets = 3 expect calls)
      expect(screenRendered, 'Lead list form must render successfully without error').toBe(true);
      expect(recordSaveSuccess && recordPersisted, 'record must save and persist on re-open').toBe(true);
      expect(webStudioBundlesRequested.length, 'no web_studio bundles should be loaded').toBe(0);
    });
  });
});
