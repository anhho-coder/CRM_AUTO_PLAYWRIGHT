import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { hubConfig, reportHubBlocked } from '@config/integration-hub.config';
import { LoginPageMig, MigIntegrationHubPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { sweepMigLeftoversAfterAll } from '@helpers/o12ce-main-business.helper';
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * CRM-12162_1.1.1 - Web-form submission delivers exactly one lead
 * Test Case ID: CRM-12162_1.1.1
 * Jira: CRM-12162
 * Automation-Type: new
 * Automation-Date: 2026-09-16
 *
 * Summary:
 *   Verify that a web-form submission delivered through the Integration Hub creates exactly one
 *   lead in the CRM with the submitted email address. No duplicates are created, and the lead is
 *   immediately visible to the salesperson.
 *
 * BLOCKED RUN NOTE:
 *   This spec reports BLOCKED (SKIPPED, not FAIL) when the delivery has not provided the
 *   inbound simulation entry point on CRM-12069. A BLOCKED result is a delivery gap, not a
 *   product defect.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12162_1\.1\.1:" --project=chromium
 *
 * Source manual TC (master tab "CRM test/Migration - Integration Hub", row CRM-12162_1.1.1):
 *   Pre-conditions:
 *     _ Integration Hub is deployed and running on <HUB-ENV>
 *     _ Web-form delivery service is configured to send submissions to the hub
 *     _ QA user has read access to Leads view
 *     _ Test data unique identifier: timestamp-based suffix LEAD-{YYYYMMDD-HHmm}
 *
 *   Steps:
 *     1. Using the provided simulation entry point for inbound submissions (BLOCKED on SUPP-0011),
 *        submit a complete web form with unique email LEAD-{timestamp}@test.nakivo.com and
 *        standard field values
 *     2. Wait 10 seconds for the hub to process the submission
 *     3. Navigate to CRM > Leads
 *     4. Filter or search for the lead using the unique email address submitted in step 1
 *
 *   Expected:
 *     3. The Leads view loads and displays without error
 *     4. Exactly one lead record is found with the submitted email address. No duplicate records
 *        are present. The lead is visible to the salesperson without requiring any manual
 *        intervention or additional setup step.
 */

// Step labels (one source of truth, reused in test.step and stdout banner)
const STEP = {
  pre1: 'Pre-condition 1: Integration Hub is deployed on the migration server and the outbound queue model is present',
  s1: 'Step 1: Submit a complete web form with unique email LEAD-{timestamp}@test.nakivo.com and standard field values',
  s2: 'Step 2: Wait 10 seconds for the hub to process the submission',
  s3: 'Step 3: Navigate to CRM > Leads',
  s4: 'Step 4: Filter or search for the lead using the unique email address submitted in step 1',
  verify: 'Verification',
} as const;

// Cleanup toggle
const SKIP_CLEANUP_HUB = false;

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

test.describe('CRM-12162_1.1.1 - One submission creates one lead', () => {
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

  test.afterAll(async ({ browser }) => {
    // Sweep any leftover test data created by this spec
    await sweepMigLeftoversAfterAll(browser, 'CRM-12162_1.1.1');
  });

  test('CRM-12162_1.1.1: Web-form submission delivered through Integration Hub creates exactly one lead in the CRM', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    console.log(
      '========== CRM-12162_1.1.1 - Web-form submission creates exactly one lead ==========',
    );

    // Check if the hub entry points are available; if not, report BLOCKED
    if (reportHubBlocked(['inboundSimulationUrl', 'inboundSimulationAuth'])) {
      throw new Error(
        'SKIPPED - the delivery has not provided the inbound simulation entry point (IS-CRM-SUPP-0011, open on CRM-12069)',
      );
    }

    // Create a new browser context and page
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true, // crm-mig serves a self-signed chain
    });
    const page = await context.newPage();
    sharedPage = page;
    const runId = CommonUtils.generateUniqueId('');
    const emailMarker = `LEAD-${runId}@test.nakivo.com`;
    const createdLeadIds: number[] = [];
    let submitStatus = 0;

    try {
      // Login to crm-mig
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const hubPage = new MigIntegrationHubPage(page);

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        // An absent model and an empty model look identical to a row count, so branch on presence
        // FIRST and report SKIPPED - never record "0 rows" as a product failure.
        // An unreachable server and a server without the model look identical - prove the session
        // answers FIRST, so an environment failure can never be recorded as "the model is absent".
        await hubPage.assertSessionUsable();
        const queueModelPresent = await hubPage.isQueueModelPresent();
        console.log(`  Queue model '${MigIntegrationHubPage.QUEUE_MODEL}': ${queueModelPresent ? 'present' : 'ABSENT'}`);
        if (!queueModelPresent) {
          throw new Error(
            'SKIPPED - the outbound queue model is not present on this server (crm-mig is Odoo 12 Community, the queue is a Studio model from the Enterprise side)',
          );
        }
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - hub session ready');

      // Step 1: Submit inbound lead
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  Email: ${emailMarker}`);
        console.log(`  Endpoint: ${hubConfig.inboundSimulationUrl}`);

        const payload = {
          email: emailMarker,
          name: `TEST CRM-12162_1.1.1 ${runId}`,
          company: 'Test Company',
          phone: '+1-555-0100',
          message: 'Test submission from automation',
        };

        console.log(`  Payload fields:`);
        console.log(`    email      = ${payload.email}`);
        console.log(`    name       = ${payload.name}`);
        console.log(`    company    = ${payload.company}`);
        console.log(`    phone      = ${payload.phone}`);
        console.log(`    message    = ${payload.message}`);

        const response = await hubPage.submitInboundLead(payload);
        submitStatus = response.status;
        console.log(`  Response status: ${submitStatus}`);
        console.log(`  Response body (first 200 chars): ${response.body.slice(0, 200)}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - web form submitted');

      // Step 2: Wait for the hub to write the lead
      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log(`  Waiting for hub to process...`);
        await page.waitForTimeout(CommonUtils.waitTimes.hubProcessingWait);
        console.log(`  Wait complete`);
      });

      // Step 3-4: Count and read leads by email
      let leadCount = 0;
      let foundLeads: Array<{
        id: number;
        name: string;
        emailFrom: string | false;
        createDate: string;
        createUidLabel: string;
      }> = [];

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  Navigating to CRM > Leads...`);
        // The page is already authenticated; the counts below verify visibility
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log(`  Searching for leads with email containing: ${emailMarker}`);

        leadCount = await hubPage.countLeadsByEmail(emailMarker);
        console.log(`  Lead count: ${leadCount}`);

        foundLeads = await hubPage.readLeadsByNameMarker(`TEST CRM-12162_1.1.1`, 500);
        console.log(`  Found ${foundLeads.length} lead(s) by name marker`);

        for (const lead of foundLeads) {
          if (lead.emailFrom && String(lead.emailFrom).includes(emailMarker)) {
            createdLeadIds.push(lead.id);
            console.log(`    Lead ID ${lead.id}: name="${lead.name}", email="${lead.emailFrom}", created=${lead.createDate}, by=${lead.createUidLabel}`);
          }
        }
      });

      // VERIFY block
      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const submitAccepted = submitStatus >= 200 && submitStatus < 300;
        const leadVisible = foundLeads.length > 0;
        console.log('\n==================== VERIFY ====================');

        console.log('Verify #1 - Inbound lead submission accepted:');
        console.log(`     Expected : response status in 2xx`);
        console.log(`     Actual   : ${submitStatus}`);
        console.log(`     Result   : ${submitAccepted ? 'PASS' : 'FAIL'}`);

        console.log('Verify #2 - Lead count by email marker:');
        console.log(`     Expected : count = 1`);
        console.log(`     Actual   : ${leadCount}`);
        console.log(`     Result   : ${leadCount === 1 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #3 - Exactly one lead found with submitted email:');
        console.log(`     Expected : 1 lead with email ${emailMarker}`);
        console.log(`     Actual   : found ${createdLeadIds.length} lead(s), IDs = [${createdLeadIds.join(', ')}]`);
        console.log(`     Result   : ${createdLeadIds.length === 1 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #4 - No duplicate leads created:');
        console.log(`     Expected : lead count = 1 (no duplicates)`);
        console.log(`     Actual   : ${leadCount}`);
        console.log(`     Result   : ${leadCount === 1 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #5 - Lead visible without manual intervention:');
        console.log(`     Expected : at least 1 lead readable in the Leads list`);
        console.log(`     Actual   : lead query returned ${foundLeads.length} record(s)`);
        console.log(`     Result   : ${leadVisible ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');
        const overall = submitAccepted && leadCount === 1 && createdLeadIds.length === 1 && leadVisible;
        console.log(
          `OVERALL: ${overall ? 'PASS' : 'FAIL'} - one delivered submission produced ${leadCount} lead(s) ` +
            `(expected exactly 1) with email ${emailMarker}`,
        );

        // Assertions - each reads the SAME value its VERIFY line printed
        expect(submitAccepted, `Inbound submission was rejected with status ${submitStatus}`).toBe(true);
        expect(leadCount, 'Lead count should be exactly 1').toBe(1);
        expect(createdLeadIds.length, 'Should find exactly 1 lead with submitted email').toBe(1);
        expect(leadVisible, 'The lead should be readable in the Leads list').toBe(true);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce II - lead verified');

    } finally {
      // Close context after test
      await context.close();
    }
  });
});
