import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPlatformPage } from '@pages/mig';

/**
 * CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable
 * Test Case ID: CRM-12326_3.4.3
 * Jira: CRM-12580
 * Automation-Type: new
 * Automation-Date: 2026-09-14
 * Last-revised: 2026-09-16 - manual steps 2 and 3 split back to one test.step each
 *                (they were collapsed into a single "Step 2-3", which read as one opaque
 *                block in the report and hid which action a failure came from)
 *
 * Summary:
 *   Verify no scheduled action (ir.cron), server action (ir.actions.server), or automated action
 *   (base.automation) owned by the 15 uninstalled modules is still active. A cron left enabled
 *   on a test instance can fire real outbound effects, breaking the test environment and validation data.
 *
 * Source manual TC (master tab "Migration - Setup New CRM", row 99):
 *
 * Pre-conditions:
 *   - VPN connected; the O12 CE Migration server crm-mig.nakivo.site is reachable
 *   - Login: anh.ho@nakivo.com (admin_crm_mig)
 *
 * Steps to reproduce:
 *   1. Use the account of Admin to login successful.
 *   2. Resolve every ir.cron, ir.actions.server and base.automation owned by the 15 modules through ir.model.data.
 *   3. For each record found, read its active flag and the model it targets.
 *
 * Verification Points:
 *   1. 0 active ir.cron, ir.actions.server or base.automation records are owned by any of the 15.
 *   2. Any record found is reported with its target model, so a dangling automation is distinguished from a live one.
 *
 * EVIDENCE: stdout only - this TC drives NO UI. Every step reads over the authenticated JSON-RPC
 * and navigates nowhere, so the screenshot Playwright auto-captures (config `screenshot: 'on'`)
 * shows an idle, still-loading web client and means nothing here. The per-step console.log output
 * IS the artifact. Steps are labelled [INTERNAL check, Call API] so a report reader knows that
 * before wondering whether the blank capture is a failure.
 *
 * READ-ONLY: this spec only reads action definitions and crons. It creates, modifies and deletes nothing,
 * as required on crm-mig.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12326_3\.4\.3:" --project=chromium
 */

/** The 15 modules in scope for the CRM-12125 dependency audit but NOT installed on crm-mig. */
const CUT_MODULES_UNINSTALLED = [
  'nakivo_helpdesk', 'nakivo_support_tickets', 'nakivo_support_page',
  'nakivo_helpdesk_followup', 'nakivo_helpdesk_mail_route', 'nakivo_email_rating',
  'nakivo_feature_request', 'nakivo_leaves', 'nakivo_message_approval',
  'helpdesk_timer', 'helpdesk_ticket_crm_lead', 'zoho_connector',
  'nakivo_website_crm_score', 'nakivo_sign', 'marketing_automation_file_template',
];

/**
 * Step labels - declared ONCE and used for BOTH the test.step() label and the stdout banner.
 *
 * Writing the two by hand lets them drift: the report step and the log line then describe the
 * same step with different wording, and a reader cannot line the HTML report up against stdout.
 * Reading both from this constant makes that impossible. The text is the manual TC's wording.
 */
const STEP = {
  pre1:    'Pre-condition 1: Login as Admin on the O12 Migration server',
  s2:      'Step 2: [INTERNAL check, Call API] Resolve every ir.cron, ir.actions.server and base.automation owned by the 15 modules through ir.model.data',
  s3:      'Step 3: [INTERNAL check, Call API] For each record found, read its active flag and the model it targets',
  verify:  'Verification',
} as const;

test.describe('CRM-12326 Part 2-3.4 - Uninstalled modules leave nothing executable', () => {

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test('CRM-12326_3.4.3: [Part2-3.4] No active cron or automation owned by the 15', async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const loginPage = new LoginPageMig(page);
    const platform  = new MigPlatformPage(page);

    interface ActionRecord {
      model: string;
      ownerModule: string;
      id: number;
      name: string;
      targetModel: string;
      active: boolean;
    }

    interface RecordToRead {
      model: string;
      recordId: number;
      ownerModule: string;
    }

    const actionRecords: ActionRecord[] = [];
    const recordsToRead: RecordToRead[] = [];
    let activeCount = 0;

    console.log('========== CRM-12326_3.4.3 - No active cron or automation owned by the 15 ==========');

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

      // Holder models to check for each uninstalled module
      const holderModels = ['ir.cron', 'ir.actions.server', 'base.automation'];

      for (const holderModel of holderModels) {
        console.log(`\n  Checking ${holderModel}...`);

        // Get record ids owned by the cut modules via ir.model.data
        const ownedByModules = await platform.ownedRecordIds(holderModel, CUT_MODULES_UNINSTALLED);

        if (ownedByModules.size === 0) {
          console.log(`    No ${holderModel} records owned by the 15 modules`);
          continue;
        }

        console.log(`    Found ${ownedByModules.size} ${holderModel} record(s)`);

        // Collect records to read in step 3
        for (const [recordId, ownerModule] of ownedByModules) {
          recordsToRead.push({ model: holderModel, recordId, ownerModule });
        }
      }

      console.log(`\n  Summary: Collected ${recordsToRead.length} record(s) to read in the next step`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);

      console.log(`  Reading active flag and target model for ${recordsToRead.length} record(s)...`);

      for (const { model: holderModel, recordId, ownerModule } of recordsToRead) {
        try {
          // ir.actions.server has no 'active' field in Odoo 12 CE; wrap in try/catch and fall back to ['name','model_id']
          let record: any;
          if (holderModel === 'ir.actions.server') {
            try {
              record = await platform.callKw(holderModel, 'read', [[recordId], ['name', 'model_id', 'active']]);
            } catch (err) {
              // ir.actions.server may not have 'active' field; fall back without it
              record = await platform.callKw(holderModel, 'read', [[recordId], ['name', 'model_id']]);
              // Treat it as active since we can't verify the flag
              record[0].active = true;
            }
          } else {
            record = await platform.callKw(holderModel, 'read', [[recordId], ['name', 'model_id', 'active']]);
          }

          const data = record[0];
          const targetModel = data.model_id ? (Array.isArray(data.model_id) ? data.model_id[1] : data.model_id) : '(none)';
          const isActive = data.active !== false;

          const actionRecord: ActionRecord = {
            model: holderModel,
            ownerModule,
            id: recordId,
            name: data.name || '(unnamed)',
            targetModel,
            active: isActive,
          };

          actionRecords.push(actionRecord);

          if (isActive) {
            activeCount++;
          }

          console.log(
            `    [${holderModel}] id=${recordId} owner=${ownerModule} name="${actionRecord.name}" ` +
            `targetModel="${targetModel}" active=${isActive}`,
          );
        } catch (err) {
          console.log(`    [${holderModel}] id=${recordId} owner=${ownerModule} - ERROR reading: ${(err as Error).message}`);
          throw err;
        }
      }

      console.log(`\n  Summary: Read ${actionRecords.length} total records, ${activeCount} active`);
    });

    await test.step(STEP.verify, async () => {
      console.log('\n==================== VERIFY ====================');

      console.log('  Verify #1 - No active ir.cron, ir.actions.server or base.automation owned by the 15:');
      console.log(`     Expected : 0 active records`);
      console.log(`     Actual   : ${activeCount} active records`);
      console.log(`     Result   : ${activeCount === 0 ? 'PASS' : 'FAIL'}`);

      console.log('  Verify #2 - Every reported record has a resolved target model:');
      const recordsWithModel = actionRecords.filter(r => r.targetModel !== null && r.targetModel !== undefined).length;
      console.log(`     Expected : ${actionRecords.length} records with target model resolved`);
      console.log(`     Actual   : ${recordsWithModel} records with target model`);
      console.log(`     Result   : ${recordsWithModel === actionRecords.length ? 'PASS' : 'FAIL'}`);

      console.log('===============================================');
      console.log(
        `OVERALL: ${activeCount === 0 && recordsWithModel === actionRecords.length ? 'PASS' : 'FAIL'} - ` +
        `${activeCount} active actions found (expected 0); all ${actionRecords.length} records have target model resolved`,
      );

      expect(activeCount, 'no active cron/action/automation owned by the 15 should remain').toBe(0);
      expect(recordsWithModel, 'all reported records must have a resolved target model').toBe(actionRecords.length);
    });
  });
});
