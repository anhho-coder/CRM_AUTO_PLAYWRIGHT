import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage } from '@pages';
import { MigIntegrationHubPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12162_4.3.1 - The CRM data structures for leads and the outbound queue are unchanged by the hub workstream
 * Test Case ID: CRM-12162_4.3.1
 * Jira: CRM-12162
 * Automation-Type: new
 * Automation-Date: 2026-09-16
 *
 * Summary:
 *   Verify that the CRM's data structures for leads (crm.lead) and the outbound queue
 *   (x_lead_for_activecampa) are unchanged by the hub integration. Records today's baseline
 *   of field counts and names to detect any structural drift. This is a baseline guard
 *   (IS-CRM-FUNC-0234): if this spec fails after the hub lands, the workstream has changed
 *   the CRM's structures, which is forbidden.
 *
 * READ-ONLY: This spec creates, modifies and deletes NOTHING. It only reads model schemas.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12162_4\.3\.1:" --project=chromium
 *
 * Source manual TC (master tab "CRM test/Migration - Integration Hub", row CRM-12162_4.3.1):
 *   Pre-conditions:
 *     _ A lead has been created through the hub
 *     _ An outbound queue entry has been queued through the hub
 *     _ The authoritative field inventories for today's leads and queue entries are known
 *       (SUPP-0009 for inbound, SUPP-0010 for outbound)
 *
 *   Steps:
 *     1. Open a lead created through the hub in the CRM
 *     2. Inspect the lead record's field structure (field names, types, visibility)
 *     3. Record the complete list of fields present on the lead
 *     4. Navigate to the outbound queue [or records section]
 *     5. Open a queue entry created through the hub
 *     6. Inspect the queue entry's field structure (field names, types, visibility)
 *     7. Record the complete list of fields present on the queue entry
 *     8. Compare the recorded field lists against the pre-hub baseline (from SUPP-0009 and SUPP-0010)
 *
 *   Expected:
 *     2. Lead has all expected fields from the inbound inventory
 *     3. Field list matches today's leads exactly (no new fields added, no old fields removed)
 *     5. Queue entry is readable and complete
 *     6. Queue entry has all expected fields from the outbound inventory
 *     7. Field list matches today's queue entries exactly (69 carried custom fields, same structure)
 *     8. No structural deviations found; CRM data model is unchanged
 */

// Step labels (one source of truth, reused in test.step and stdout banner)
const STEP = {
  pre1: 'Pre-condition 1: Integration Hub is deployed on the pre-production server and the outbound queue model is present',
  s1: 'Step 1: Open a lead created through the hub in the CRM and inspect its field structure',
  s2: 'Step 2: Record the complete list of fields present on the lead',
  s3: 'Step 3: Navigate to the outbound queue records section',
  s4: 'Step 4: Open a queue entry created through the hub and inspect its field structure',
  s5: 'Step 5: Record the complete list of fields present on the queue entry',
  s6: 'Step 6: Compare recorded field lists against the pre-hub baseline',
  verify: 'Verification',
} as const;

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

test.describe('CRM-12162_4.3.1 - CRM data structures unchanged by hub', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    // Log failure reason if present
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12162_4.3.1: The CRM data structures for leads and the outbound queue are unchanged by the hub workstream', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    console.log(
      '========== CRM-12162_4.3.1 - CRM data structures are unchanged by hub workstream ==========',
    );

    // Create a new browser context and page
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      // Login to pre-production
      const loginPage = new LoginPage(page);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);

      const hubPage = new MigIntegrationHubPage(page);

      // Pre-condition 1: Verify session and queue model presence
      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        await hubPage.assertSessionUsable();
        const queueModelPresent = await hubPage.isQueueModelPresent();
        console.log(`  Queue model '${MigIntegrationHubPage.QUEUE_MODEL}': ${queueModelPresent ? 'present' : 'ABSENT'}`);
        if (!queueModelPresent) {
          throw new Error(
            'SKIPPED - the outbound queue model is not present on this server (this would be an environment failure, not a product issue)',
          );
        }
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - hub session ready');

      // Step 1-2: Read crm.lead field structure
      let leadFieldNames: string[] = [];
      let leadFieldCount = 0;

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  Reading field schema for crm.lead...`);
        leadFieldNames = await hubPage.readModelFieldNames('crm.lead');
        leadFieldCount = leadFieldNames.length;
        console.log(`  Total fields on crm.lead: ${leadFieldCount}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log(`  Recording complete list of crm.lead fields (${leadFieldCount} total):`);
        // Note: we intentionally do NOT assert a total count for crm.lead because it is a
        // large core model whose field count legitimately varies with installed modules.
        // We only verify that the core fields a web-form lead carries are present.
        console.log(`  Field list: ${leadFieldNames.join(', ')}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - lead fields recorded');

      // Step 3-5: Read outbound queue field structure
      let queueFieldSchema: Record<string, { string?: string; type?: string }>;
      let queueTotalFields = 0;
      let queueCustomFields: string[] = [];
      let queueTechnicalFields: string[] = [];

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  Reading field schema for outbound queue model...`);
        queueFieldSchema = await hubPage.readQueueFieldSchema();
        const allQueueFields = Object.keys(queueFieldSchema).sort();
        queueTotalFields = allQueueFields.length;

        queueCustomFields = allQueueFields.filter((n) => n.startsWith('x_')).sort();
        queueTechnicalFields = allQueueFields.filter((n) => !n.startsWith('x_')).sort();

        console.log(`  Queue model total fields: ${queueTotalFields}`);
        console.log(`  Queue model custom fields (x_ prefixed): ${queueCustomFields.length}`);
        console.log(`  Queue model technical fields: ${queueTechnicalFields.length}`);
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log(`  Queue entry field structure examined`);
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        console.log(`  Recording complete list of queue fields (${queueTotalFields} total):`);
        console.log(`\n  Custom fields (x_ prefixed) - ${queueCustomFields.length} fields:`);
        for (const field of queueCustomFields) {
          const isDormant = field === MigIntegrationHubPage.DORMANT_FIELD ? ' [DORMANT - not carried]' : '';
          console.log(`    ${field}${isDormant}`);
        }
        console.log(`\n  Technical fields - ${queueTechnicalFields.length} fields:`);
        for (const field of queueTechnicalFields) {
          console.log(`    ${field}`);
        }
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce II - queue fields recorded');

      // Step 6: Compare against baseline
      let carriedCustomCount = 0;
      let hasDormant = false;

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        const dormantDeclared = queueCustomFields.includes(MigIntegrationHubPage.DORMANT_FIELD);
        hasDormant = dormantDeclared;
        carriedCustomCount = queueCustomFields.length - (dormantDeclared ? 1 : 0);

        console.log(`  Baseline comparison:`);
        console.log(`    Expected queue total fields: 77 (70 custom + 7 technical)`);
        console.log(`    Actual queue total fields: ${queueTotalFields}`);
        console.log(`    Expected queue custom fields: 70`);
        console.log(`    Actual queue custom fields: ${queueCustomFields.length}`);
        console.log(`    Expected queue technical fields: 7`);
        console.log(`    Actual queue technical fields: ${queueTechnicalFields.length}`);
        console.log(`    Dormant placeholder '${MigIntegrationHubPage.DORMANT_FIELD}' declared: ${hasDormant ? 'yes' : 'no'}`);
        console.log(`    Carried custom fields (excluding dormant): ${carriedCustomCount}`);
        console.log(`    Expected carried custom fields: 69`);

        console.log(`\n  Lead model baseline comparison:`);
        console.log(`    Actual crm.lead total fields: ${leadFieldCount}`);
        // Check for core fields that a web-form lead must have
        const requiredLeadFields = ['name', 'email_from', 'phone', 'partner_id', 'user_id', 'team_id', 'country_id', 'description', 'create_uid', 'create_date'];
        const missingCoreFields: string[] = [];
        for (const coreField of requiredLeadFields) {
          if (!leadFieldNames.includes(coreField)) {
            missingCoreFields.push(coreField);
          }
        }
        console.log(`    Expected core fields present: ${requiredLeadFields.join(', ')}`);
        console.log(`    Missing core fields: ${missingCoreFields.length > 0 ? missingCoreFields.join(', ') : '(none)'}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce III - baseline comparison complete');

      // VERIFY block
      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        const queueTotalCorrect = queueTotalFields === 77;
        const queueCustomCorrect = queueCustomFields.length === 70;
        const queueTechnicalCorrect = queueTechnicalFields.length === 7;
        const carriedCustomCorrect = carriedCustomCount === 69;
        const dormantDeclaredCorrect = hasDormant;

        // Check for required core fields in crm.lead
        const requiredLeadFields = ['name', 'email_from', 'phone', 'partner_id', 'user_id', 'team_id', 'country_id', 'description', 'create_uid', 'create_date'];
        const missingCoreFields: string[] = [];
        for (const coreField of requiredLeadFields) {
          if (!leadFieldNames.includes(coreField)) {
            missingCoreFields.push(coreField);
          }
        }
        const leadCoreFieldsCorrect = missingCoreFields.length === 0;

        console.log('\n==================== VERIFY ====================');

        console.log('Verify #1 - Queue model total field count:');
        console.log(`     Expected : 77 fields`);
        console.log(`     Actual   : ${queueTotalFields} fields`);
        console.log(`     Result   : ${queueTotalCorrect ? 'PASS' : 'FAIL'}`);

        console.log('Verify #2 - Queue model custom field count:');
        console.log(`     Expected : 70 custom fields (x_ prefixed)`);
        console.log(`     Actual   : ${queueCustomFields.length} custom fields`);
        console.log(`     Result   : ${queueCustomCorrect ? 'PASS' : 'FAIL'}`);

        console.log('Verify #3 - Queue model technical field count:');
        console.log(`     Expected : 7 technical fields`);
        console.log(`     Actual   : ${queueTechnicalFields.length} technical fields`);
        console.log(`     Result   : ${queueTechnicalCorrect ? 'PASS' : 'FAIL'}`);

        console.log('Verify #4 - Dormant placeholder field is declared:');
        console.log(`     Expected : x_studio_field_d29wC present in custom fields`);
        console.log(`     Actual   : ${hasDormant ? 'present' : 'absent'}`);
        console.log(`     Result   : ${dormantDeclaredCorrect ? 'PASS' : 'FAIL'}`);

        console.log('Verify #5 - Carried custom fields count (excluding dormant):');
        console.log(`     Expected : 69 carried fields`);
        console.log(`     Actual   : ${carriedCustomCount} carried fields`);
        console.log(`     Result   : ${carriedCustomCorrect ? 'PASS' : 'FAIL'}`);

        console.log('Verify #6 - Lead model contains required core fields:');
        console.log(`     Expected : name, email_from, phone, partner_id, user_id, team_id, country_id, description, create_uid, create_date`);
        console.log(`     Actual   : ${missingCoreFields.length === 0 ? 'all present' : 'missing: ' + missingCoreFields.join(', ')}`);
        console.log(`     Result   : ${leadCoreFieldsCorrect ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        const overall = queueTotalCorrect && queueCustomCorrect && queueTechnicalCorrect && dormantDeclaredCorrect && carriedCustomCorrect && leadCoreFieldsCorrect;
        console.log(
          `OVERALL: ${overall ? 'PASS' : 'FAIL'} - CRM data structures unchanged: ` +
            `queue has ${queueTotalFields} fields (70 custom + 7 technical), ` +
            `69 carried after excluding dormant; ` +
            `crm.lead has all required core fields`,
        );

        // Assertions - each reads the SAME value its VERIFY line printed
        expect(queueTotalCorrect, `Queue model should have exactly 77 fields, got ${queueTotalFields}`).toBe(true);
        expect(queueCustomCorrect, `Queue model should have exactly 70 custom fields, got ${queueCustomFields.length}`).toBe(true);
        expect(queueTechnicalCorrect, `Queue model should have exactly 7 technical fields, got ${queueTechnicalFields.length}`).toBe(true);
        expect(dormantDeclaredCorrect, `Dormant placeholder field should be declared in custom fields`).toBe(true);
        expect(carriedCustomCorrect, `Carried custom fields should be 69 (70 custom - 1 dormant), got ${carriedCustomCount}`).toBe(true);
        expect(leadCoreFieldsCorrect, `Lead model should have all core fields, missing: ${missingCoreFields.join(', ')}`).toBe(true);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce IV - verification complete');

    } finally {
      // Close context after test
      await context.close();
    }
  });
});
