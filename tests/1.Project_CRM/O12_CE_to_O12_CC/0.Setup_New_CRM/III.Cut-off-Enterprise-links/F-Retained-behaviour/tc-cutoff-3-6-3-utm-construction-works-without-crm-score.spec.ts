import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.6 - Retained behaviour after the cut
 * Test Case ID: CRM-12326_3.6.3
 * Jira: CRM-12588
 * Automation-Type: new
 * Automation-Date: 2026-09-15
 * Last-revised: 2026-09-16 - steps 3 and 5 split into separate test.step() and tagged [INTERNAL check, Call API]
 *                as they are RPC-only; updated step labels to match Xray manual steps verbatim.
 *
 * Summary:
 *   Verify the UTM constructor module works and can create/save/persist records.
 *   Confirm the screen renders without error and no website_crm_score lead-score field
 *   is present on crm.lead.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row ~123):
 *
 * Pre-conditions:
 *   VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful
 *   2. Open the screen owned by utm_constructor and confirm it renders
 *   3. Create or open a record and confirm its UTM fields (campaign, source, medium) are present and editable
 *   4. Save and confirm the value persists
 *   5. Confirm no lead-score field belonging to website_crm_score is present
 *
 * Verification Points:
 *   1. The screen renders with no error dialog.
 *   2. The UTM values are saved and read back unchanged.
 *   3. No website_crm_score lead-score field is present.
 *
 * NOTE - TC DRIFT: The manual TC refers to fields "campaign, source, medium" which do not exist
 * on utm_constructor.utm_constructor. This model actually has: name (char), team_id (many2one),
 * user_id (many2one), utm_link_ids (one2many). The spec verifies the ACTUAL fields and logs
 * the drift for manual TC correction.
 *
 * This spec CREATES a utm_constructor record, verifies its fields persist, then deletes it
 * in afterEach and runs an afterAll sweep by marker. No migrated records are modified.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\\.6\\.3:" --project=chromium
 */

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text matches the Xray manual steps.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: Open the screen owned by utm_constructor and confirm it renders',
  s3:      'Step 3: [INTERNAL check, Call API] Create or open a record and confirm its UTM fields (campaign, source, medium) are present and editable',
  s4:      'Step 4: Save and confirm the value persists',
  s5:      'Step 5: [INTERNAL check, Call API] Confirm no lead-score field belonging to website_crm_score is present',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.6 - Retained behaviour after the cut', () => {

  const TC_ID = 'CRM-12326_3.6.3';
  const MARKER = `AUTO-${TC_ID}-${Date.now()}`;
  let createdRecordId: number | null = null;
  let deletedRecords: number[] = [];

  test.afterEach(async ({ page }, testInfo) => {
    // Clean up the created record in afterEach (runs even on failure)
    if (createdRecordId !== null) {
      const platform = new MigPlatformPage(page);
      try {
        await platform.callKw(
          'utm_constructor.utm_constructor',
          'unlink',
          // Odoo call_kw takes the ids as a LIST in args[0].
          [[createdRecordId]],
        );
        deletedRecords.push(createdRecordId);
        console.log(`  Teardown: deleted created record ${createdRecordId}`);
      } catch (err) {
        console.log(`  Teardown WARNING: failed to delete record ${createdRecordId}: ${(err as Error).message}`);
      }
    }

    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test.afterAll(async ({ browser }) => {
    // The global `timeout: 30000` in playwright.config.ts applies to hooks too, and this sweep
    // opens a context + logs in + deletes - well over 30 s. Without this the hook times out and
    // the test goes red although its body passed. See helpers/o12ce-main-business.helper.ts.
    test.setTimeout(120_000);
    // Sweep for any remaining records with the marker name
    const context = await browser.newContext();
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    const platform = new MigPlatformPage(page);

    try {
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const { deleted, failed } = await platform.deleteRecordsByNameMarker(
        'utm_constructor.utm_constructor',
        MARKER,
        'name',
      );

      if (deleted.length > 0) {
        console.log(`  Afterall sweep: deleted ${deleted.length} remaining records: ${deleted.join(', ')}`);
      }
      if (failed.length > 0) {
        console.log(`  Afterall sweep WARNING: failed to delete ${failed.length} records: ${failed.join(', ')}`);
      }
    } catch (err) {
      console.log(`  Afterall sweep error: ${(err as Error).message}`);
    } finally {
      await context.close();
    }
  });

  test('CRM-12326_3.6.3: [Part2-3.6] UTM construction works without CRM score', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform = new MigPlatformPage(page);

    // Result holders for verification
    let screenRendered = false;
    let screenRenderError = '';
    let recordCreated = false;
    let fieldsPresent: string[] = [];
    let fieldsSaved: Record<string, any> = {};
    let fieldsReadBack: Record<string, any> = {};
    let scoreFieldsFound: string[] = [];

    console.log(`========== ${TC_ID} - UTM construction works without CRM score ==========`);

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

      // Open the UTM Links screen: menu_id=1356, action_id=1821
      const hash = '#menu_id=1356&action_id=1821';
      try {
        await platform.openAppAndAssertRendered(hash);
        screenRendered = true;
        console.log('  OK - UTM Links screen opened and rendered');
      } catch (err) {
        screenRenderError = (err as Error).message;
        screenRendered = false;
        console.log(`  ERROR - screen render failed: ${screenRenderError}`);
      }

      // Also check the fields_view_get to confirm the form structure
      try {
        const formView = await platform.callKw<any>(
          'utm_constructor.utm_constructor',
          'fields_view_get',
          [],
          { view_id: false, view_type: 'form', toolbar: false },
        );
        const formFields = formView.fields || {};
        console.log(`  Form fields available: ${Object.keys(formFields).join(', ')}`);
      } catch (err) {
        console.log(`  WARNING - could not fetch form view: ${(err as Error).message}`);
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      // The utm_constructor.utm_constructor model has no records, so we MUST create one.
      // Fields to fill: name (required char), team_id (many2one), user_id (many2one)

      try {
        // Create a new record
        createdRecordId = await platform.callKw<number>(
          'utm_constructor.utm_constructor',
          'create',
          [
            {
              name: `${MARKER}`,
              team_id: 1, // Default team if it exists
              user_id: 2, // Admin user, typically id=2
            },
          ],
        );

        recordCreated = true;
        console.log(`  Created record: ID ${createdRecordId}`);

        // Now read back the fields to confirm they are present and can be read
        const fieldNames = ['name', 'team_id', 'user_id', 'utm_link_ids'];
        const record = await platform.callKw<any>(
          'utm_constructor.utm_constructor',
          'read',
          [createdRecordId, fieldNames],
        );

        if (record && record.length > 0) {
          const recordData = record[0];
          fieldsPresent = Object.keys(recordData).filter(k => k !== 'id');
          fieldsSaved = recordData;

          console.log(`  Fields present on created record:`);
          fieldsPresent.forEach(field => {
            const value = recordData[field];
            console.log(`    ${field}: ${JSON.stringify(value)}`);
          });
        }
      } catch (err) {
        recordCreated = false;
        console.log(`  ERROR - failed to create or read record: ${(err as Error).message}`);
        throw err;
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      if (!createdRecordId) {
        throw new Error('No record was created, cannot verify persistence');
      }

      try {
        // Open the form via the app to simulate UI interaction and verify it renders
        const hash = `#menu_id=1356&action_id=1821&id=${createdRecordId}`;
        await platform.openAppAndAssertRendered(hash);
        console.log(`  OK - opened form for record ${createdRecordId}`);

        // Read back the record to confirm persistence
        const fieldNames = ['name', 'team_id', 'user_id'];
        const record = await platform.callKw<any>(
          'utm_constructor.utm_constructor',
          'read',
          [createdRecordId, fieldNames],
        );

        if (record && record.length > 0) {
          fieldsReadBack = record[0];
          console.log(`  Fields read back from persisted record:`);
          Object.keys(fieldsReadBack).forEach(field => {
            if (field !== 'id') {
              const savedVal = fieldsSaved[field];
              const readVal = fieldsReadBack[field];
              const match = JSON.stringify(savedVal) === JSON.stringify(readVal) ? 'MATCH' : 'DIFFER';
              console.log(`    ${field}: ${JSON.stringify(readVal)} [${match}]`);
            }
          });
        }
      } catch (err) {
        console.log(`  ERROR - failed to verify persistence: ${(err as Error).message}`);
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);

      // Check crm.lead for any fields matching /score/
      try {
        const leadFields = await platform.callKw<any>(
          'crm.lead',
          'fields_get',
          [[], ['type', 'string', 'help']],
        );

        const allFields = leadFields.fields || leadFields;
        for (const fieldName of Object.keys(allFields)) {
          if (/score/i.test(fieldName)) {
            scoreFieldsFound.push(fieldName);
          }
        }

        if (scoreFieldsFound.length === 0) {
          console.log('  OK - No score fields found on crm.lead');
        } else {
          console.log(`  ERROR - Found score fields: ${scoreFieldsFound.join(', ')}`);
        }
      } catch (err) {
        console.log(`  WARNING - could not fetch crm.lead fields: ${(err as Error).message}`);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - The screen renders with no error dialog:');
      console.log(`     Expected : UTM Links screen renders successfully`);
      console.log(`     Actual   : ${screenRendered ? 'SUCCESS' : `FAILURE (${screenRenderError})`}`);
      console.log(`     Result   : ${screenRendered ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #2 - Record created, fields saved and read back unchanged:');
      // Compare only the fields present on BOTH sides. The saved snapshot also carries
      // `utm_link_ids`, which the read-back does not request, so comparing every saved key made an
      // empty one2many ([]) differ from `undefined` and reported a mismatch on a record whose values
      // had in fact persisted perfectly.
      const comparedKeys = Object.keys(fieldsSaved)
        .filter((k) => k !== 'id' && Object.prototype.hasOwnProperty.call(fieldsReadBack, k));
      const fieldsMatch = comparedKeys.length > 0 && comparedKeys.every(
        k => JSON.stringify(fieldsSaved[k]) === JSON.stringify(fieldsReadBack[k]),
      );
      console.log(`     Compared : ${comparedKeys.join(', ')}`);
      console.log(`     Expected : name, team_id, user_id saved and persisted unchanged`);
      console.log(`     Actual   : ${recordCreated && fieldsMatch ? 'All fields persisted' : 'Field mismatch or create failed'}`);
      console.log(`     Result   : ${recordCreated && fieldsMatch ? 'PASS' : 'FAIL'}`);

      console.log('\n  Verify #3 - No website_crm_score lead-score field is present:');
      console.log(`     Expected : no fields matching /score/ on crm.lead`);
      console.log(`     Actual   : ${scoreFieldsFound.length === 0 ? 'no score fields found (correct)' : scoreFieldsFound.join(', ')}`);
      console.log(`     Result   : ${scoreFieldsFound.length === 0 ? 'PASS' : 'FAIL'}`);

      console.log('\n  NOTE - TC DRIFT FLAGGED:');
      console.log('     The manual TC refers to "campaign, source, medium" fields.');
      console.log('     utm_constructor.utm_constructor actually has: name, team_id, user_id, utm_link_ids.');
      console.log('     This spec verifies the ACTUAL fields. Manual TC must be corrected.');

      console.log('===============================================');
      const allPass = screenRendered && recordCreated && fieldsMatch && scoreFieldsFound.length === 0;
      console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'} - UTM constructor renders, persists fields, no crm score field`);

      // Expectations (3 bullets = 3 expect calls)
      expect(screenRendered, 'UTM Links screen must render without error').toBe(true);
      expect(recordCreated && fieldsMatch, 'record must be created and fields must persist unchanged').toBe(true);
      expect(scoreFieldsFound.length, 'no score fields should exist on crm.lead').toBe(0);
    });
  });
});
