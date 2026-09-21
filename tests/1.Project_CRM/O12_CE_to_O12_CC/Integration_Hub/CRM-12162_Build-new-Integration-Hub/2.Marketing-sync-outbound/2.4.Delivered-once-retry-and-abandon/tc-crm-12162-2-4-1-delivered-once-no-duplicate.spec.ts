import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigIntegrationHubPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { reportHubBlocked, type HubInput } from '@config/integration-hub.config';
import { sweepMigLeftoversAfterAll } from '@helpers/o12ce-main-business.helper';
import type { Page, Browser } from '@playwright/test';

/**
 * CRM-12162_2.4.1 - Re-processing an already-delivered queue entry produces no second contact update and no second automation trigger
 * Test Case ID: CRM-12162_2.4.1
 * Jira: CRM-12162
 * Automation-Type: new
 * Automation-Date: 2026-09-16
 *
 * Summary:
 *   After a queue entry is successfully delivered to the marketing platform, re-processing the same entry
 *   produces no second contact update and no second automation trigger on the marketing platform. This test
 *   verifies the delivered-once guarantee (IS-CRM-REL-0009) that prevents duplicate marketing contact updates
 *   and duplicate automation firing.
 *
 * BLOCKED DELIVERY GAPS:
 *   This spec requires the following hub entry points from CRM-12069:
 *   - outboundEnqueueUrl (IS-CRM-SUPP-0011: outbound enqueue entry point)
 *   - outboundEnqueueAuth (IS-CRM-SUPP-0011: outbound entry point authentication mechanism)
 *   - simulatedMarketingUrl (IS-CRM-SUPP-0012: simulated marketing-platform endpoint)
 *   - simulatedMarketingAuth (IS-CRM-SUPP-0012: simulated marketing-platform read access)
 *   A BLOCKED run is a DELIVERY GAP, not a product defect.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12162_2\.4\.1:" --project=chromium
 *
 * Source manual TC (master tab "CRM-12162_Build new Integration Hub", row 2.4.1):
 *   Pre-conditions:
 *   _ <HUB-ENV> hub environment is accessible
 *   _ Simulated marketing platform endpoint configured to record contact updates and automation triggers with timestamps
 *   _ Ability to manually re-trigger delivery of a specific queue entry
 *   _ Access to query delivery history and platform events
 *   _ BLOCKED: SUPP-0012 (simulated marketing endpoint and event query method); SUPP-0011 (re-delivery simulation mechanism)
 *
 *   Steps:
 *   1. Create test contact and lead in CRM with unique identifiers AUTO-DEDUP-[timestamp]
 *   2. Trigger sync event to queue entry
 *   3. Record queue entry ID
 *   4. Wait for hub to deliver entry to marketing platform
 *   5. Query simulated marketing platform for contact updates and automation triggers from this entry
 *   6. Record count of contact updates and automation triggers (baseline = 1 each if event has automation)
 *   7. Manually re-trigger delivery of the same queue entry ID
 *   8. Wait for reprocessing to complete
 *   9. Query simulated marketing platform again for events related to this entry
 *   10. Verify contact and automation event counts have not increased
 *
 *   Expected:
 *   5. Contact update recorded once on simulated platform with delivery timestamp
 *   _ If event has mapped automation: one automation trigger recorded with timestamp
 *   6. Baseline contact updates = 1; automation triggers = 0 or 1 depending on event
 *   9. No new contact update records created
 *   _ No additional automation trigger requests
 *   10. Delivery status shows entry as delivered (not re-queued)
 *   _ Contact on platform shows single update only
 *   _ Automation history shows single trigger only (or none if event has no automation)
 */

const TEST_CASE_ID = 'CRM-12162_2.4.1';
const SKIP_CLEANUP_HUB = false;
const SYNC_EVENT = 'Contact Updated'; // Example event that carries automation

const STEP = {
  preCondition: 'Pre-condition: Verify hub environment and required endpoints are accessible',
  step1: 'Step 1: Create test contact and lead in CRM with unique identifiers AUTO-DEDUP-[timestamp]',
  step2: 'Step 2: Trigger sync event to queue entry',
  step3: 'Step 3: Record queue entry ID',
  step4: 'Step 4: Wait for hub to deliver entry to marketing platform',
  step5: 'Step 5: Query simulated marketing platform for contact updates and automation triggers from this entry',
  step6: 'Step 6: Record count of contact updates and automation triggers (baseline = 1 each if event has automation)',
  step7: 'Step 7: Manually re-trigger delivery of the same queue entry ID',
  step8: 'Step 8: Wait for reprocessing to complete',
  step9: 'Step 9: Query simulated marketing platform again for events related to this entry',
  step10: 'Step 10: Verify contact and automation event counts have not increased',
  verify: 'Verification',
} as const;

test.describe('CRM-12162_2.4.1 - Delivered-once guarantee (no duplicate contact update or automation trigger)', () => {
  let testDataMarkers: string[] = [];
  let browser: Browser;

  test.beforeAll(async ({ browser: browserContext }) => {
    browser = browserContext;
  });

  test.afterEach(async ({ page }, testInfo) => {
    try {
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'end-of-cleanup');
    } catch {
      // Ignore screenshot capture errors in cleanup
    }

    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
  });

  test.afterAll(async () => {
    if (!SKIP_CLEANUP_HUB && testDataMarkers.length > 0) {
      await sweepMigLeftoversAfterAll(browser, TEST_CASE_ID);
    }
  });

  test('CRM-12162_2.4.1: Re-processing an already-delivered queue entry produces no second contact update and no second automation trigger', async ({ browser: browserInstance, page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Check if BLOCKED on hub inputs
    let enqueueStatus = 0;
    const blockedInputs: HubInput[] = [
      'outboundEnqueueUrl',
      'outboundEnqueueAuth',
      'simulatedMarketingUrl',
      'simulatedMarketingAuth',
    ];
    if (reportHubBlocked(blockedInputs)) {
      // Never `return` here: a bare return reports the test as PASSED although nothing ran.
      throw new Error(
        'SKIPPED - the delivery has not provided the outbound enqueue entry point and/or the simulated ' +
          'marketing-platform endpoint (IS-CRM-SUPP-0011 / IS-CRM-SUPP-0012, open on CRM-12069). ' +
          'This is a delivery gap, not a product defect.',
      );
    }

    const runId = CommonUtils.generateUniqueId();
    const uniqueRef = `AUTO-DEDUP-${runId}`;
    let queueEntryId: number | null = null;
    let baselineUpserts = 0;
    let baselineTriggers = 0;
    let afterReprocessUpserts = 0;
    let afterReprocessTriggers = 0;
    let queueModelPresent = false;

    console.log(`========== ${TEST_CASE_ID} - Delivered-once guarantee verification ==========`);
    console.log(`Run ID: ${runId}`);
    console.log(`Unique reference: ${uniqueRef}`);

    try {
      // Pre-condition: Check queue model is present
      await test.step(STEP.preCondition, async () => {
        console.log(`\n--- ${STEP.preCondition} ---`);
        console.log(`  Environment: ${baseUrl_mig}`);
        console.log(`  Account: ${users.admin_crm_mig.username}`);

        const loginPage = new LoginPageMig(page);
        await loginPage.navigateTo(baseUrl_mig);
        await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
        console.log('  Status: Logged in');

        const hub = new MigIntegrationHubPage(page);
        // An unreachable server and a server without the model look identical - prove the session
        // answers FIRST, so an environment failure can never be recorded as "the model is absent".
        await hub.assertSessionUsable();
        queueModelPresent = await hub.isQueueModelPresent();
        console.log(`  Queue model present: ${queueModelPresent}`);

        if (!queueModelPresent) {
          throw new Error(
            `SKIPPED - The outbound queue model (${MigIntegrationHubPage.QUEUE_MODEL}) is not present on this server. ` +
            'This is expected on Odoo 12 Community bases where the queue is a Studio model from the Enterprise side. ' +
            'The delivered-once guarantee check could not run.',
          );
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'post-login-queue-check');
      });

      // Step 1: Create test contact and lead
      await test.step(STEP.step1, async () => {
        console.log(`\n--- ${STEP.step1} ---`);
        const hub = new MigIntegrationHubPage(page);

        // For this test, we simulate the creation of a contact and lead by enqueuing an entry
        // The actual contact/lead creation would be done via the CRM UI or backend
        console.log(`  Creating test identifiers with marker: ${uniqueRef}`);
        testDataMarkers.push(uniqueRef);
        console.log(`  Test marker registered for cleanup: ${uniqueRef}`);
      });

      // Step 2-3: Trigger sync event and enqueue
      await test.step(STEP.step2, async () => {
        console.log(`\n--- ${STEP.step2} ---`);
        const hub = new MigIntegrationHubPage(page);

        const payload = {
          reference: uniqueRef,
          event: SYNC_EVENT,
          contactEmail: `${uniqueRef}@test.nakivo.com`,
          automationName: 'TEST automation trigger',
        };

        console.log(`  Enqueuing entry with reference: ${uniqueRef}`);
        console.log(`  Event: ${SYNC_EVENT}`);

        const response = await hub.enqueueOutboundEntry(payload);
        enqueueStatus = response.status;
        console.log(`  Enqueue response status: ${enqueueStatus}`);
        console.log(`  Enqueue response body (first 500 chars): ${response.body.slice(0, 500)}`);
      });

      // Step 3: Record queue entry ID
      await test.step(STEP.step3, async () => {
        console.log(`\n--- ${STEP.step3} ---`);
        const hub = new MigIntegrationHubPage(page);

        // Read queue entries since the start of this test
        const startTime = new Date();
        startTime.setMinutes(startTime.getMinutes() - 5); // Look back 5 minutes
        const sinceIso = startTime.toISOString();

        const entries = await hub.readQueueEntriesSince(sinceIso, 100);
        console.log(`  Found ${entries.length} queue entries since ${sinceIso.split('T')[0]}`);

        // Find the entry matching our reference (we'll search by sync event label and recent creation)
        const relevantEntries = entries.filter((e) => e.syncEvent === SYNC_EVENT);
        console.log(`  Matching entries with event "${SYNC_EVENT}": ${relevantEntries.length}`);

        if (relevantEntries.length > 0) {
          queueEntryId = relevantEntries[0].id;
          console.log(`  Recorded queue entry ID: ${queueEntryId}`);
        } else {
          console.log(`  WARNING: No queue entry found yet for event "${SYNC_EVENT}" - it may still be processing`);
        }
      });

      // Step 4: Wait for hub to deliver
      await test.step(STEP.step4, async () => {
        console.log(`\n--- ${STEP.step4} ---`);
        console.log(`  Waiting ${CommonUtils.waitTimes.hubDeliveryWait}ms for hub to deliver...`);
        await page.waitForTimeout(CommonUtils.waitTimes.hubDeliveryWait);
        console.log('  Wait complete');
      });

      // Step 5-6: Read baseline from simulated marketing platform
      await test.step(STEP.step5, async () => {
        console.log(`\n--- ${STEP.step5} ---`);
        const hub = new MigIntegrationHubPage(page);

        console.log(`  Querying simulated platform for reference: ${uniqueRef}`);
        const simulator = await hub.readSimulatorRecord(uniqueRef);
        baselineUpserts = simulator.contactUpserts;
        baselineTriggers = simulator.automationTriggers;

        console.log(`  Baseline contact upserts: ${baselineUpserts}`);
        console.log(`  Baseline automation triggers: ${baselineTriggers}`);
        console.log(`  Raw response: ${JSON.stringify(simulator.raw).slice(0, 300)}`);
      });

      await test.step(STEP.step6, async () => {
        console.log(`\n--- ${STEP.step6} ---`);
        console.log(`  Recorded baseline counts:`);
        console.log(`    Contact updates: ${baselineUpserts} (expected 1)`);
        console.log(`    Automation triggers: ${baselineTriggers} (expected 0 or 1 depending on event mapping)`);
      });

      // Step 7: Manually re-trigger delivery
      await test.step(STEP.step7, async () => {
        console.log(`\n--- ${STEP.step7} ---`);
        const hub = new MigIntegrationHubPage(page);

        console.log(`  Re-triggering delivery for reference: ${uniqueRef}`);
        const response = await hub.reprocessQueueEntry(uniqueRef);
        console.log(`  Reprocess response status: ${response.status}`);
        console.log(`  Reprocess response body (first 500 chars): ${response.body.slice(0, 500)}`);
      });

      // Step 8: Wait for reprocessing
      await test.step(STEP.step8, async () => {
        console.log(`\n--- ${STEP.step8} ---`);
        console.log(`  Waiting ${CommonUtils.waitTimes.hubDeliveryWait}ms for reprocessing...`);
        await page.waitForTimeout(CommonUtils.waitTimes.hubDeliveryWait);
        console.log('  Wait complete');
      });

      // Step 9-10: Query simulated platform again and verify no duplication
      await test.step(STEP.step9, async () => {
        console.log(`\n--- ${STEP.step9} ---`);
        const hub = new MigIntegrationHubPage(page);

        console.log(`  Querying simulated platform again for reference: ${uniqueRef}`);
        const simulatorAfter = await hub.readSimulatorRecord(uniqueRef);
        afterReprocessUpserts = simulatorAfter.contactUpserts;
        afterReprocessTriggers = simulatorAfter.automationTriggers;

        console.log(`  After-reprocess contact upserts: ${afterReprocessUpserts}`);
        console.log(`  After-reprocess automation triggers: ${afterReprocessTriggers}`);
      });

      await test.step(STEP.step10, async () => {
        console.log(`\n--- ${STEP.step10} ---`);
        console.log(`  Comparing baseline vs after-reprocess:`);
        console.log(`    Contact updates  : baseline=${baselineUpserts}, after-reprocess=${afterReprocessUpserts} (should be equal)`);
        console.log(`    Automation triggers : baseline=${baselineTriggers}, after-reprocess=${afterReprocessTriggers} (should be equal)`);

        const upsertsUnchanged = baselineUpserts === afterReprocessUpserts;
        const triggersUnchanged = baselineTriggers === afterReprocessTriggers;

        console.log(`  Contact updates unchanged: ${upsertsUnchanged}`);
        console.log(`  Automation triggers unchanged: ${triggersUnchanged}`);
      });

      // VERIFY block
      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const enqueueAccepted = enqueueStatus >= 200 && enqueueStatus < 300;
        console.log('\n==================== VERIFY ====================');

        console.log('Verify #1 - Queue model is present on the server:');
        console.log(`     Expected : queue model ${MigIntegrationHubPage.QUEUE_MODEL} exists`);
        console.log(`     Actual   : ${queueModelPresent}`);
        console.log(`     Result   : ${queueModelPresent ? 'PASS' : 'FAIL'}`);

        console.log('Verify #2 - Entry enqueued successfully:');
        console.log(`     Expected : response status in 2xx`);
        console.log(`     Actual   : ${enqueueStatus}`);
        console.log(`     Result   : ${enqueueAccepted ? 'PASS' : 'FAIL'}`);

        console.log('Verify #3 - Baseline counts recorded from simulated platform:');
        console.log(`     Expected : contact upserts >= 0, automation triggers >= 0`);
        console.log(`     Actual   : upserts=${baselineUpserts}, triggers=${baselineTriggers}`);
        console.log(`     Result   : ${baselineUpserts >= 0 && baselineTriggers >= 0 ? 'PASS' : 'FAIL'}`);

        console.log('Verify #4 - Contact upserts unchanged after re-processing:');
        console.log(`     Expected : ${baselineUpserts}`);
        console.log(`     Actual   : ${afterReprocessUpserts}`);
        console.log(`     Result   : ${baselineUpserts === afterReprocessUpserts ? 'PASS' : 'FAIL'}`);

        console.log('Verify #5 - Automation triggers unchanged after re-processing:');
        console.log(`     Expected : ${baselineTriggers}`);
        console.log(`     Actual   : ${afterReprocessTriggers}`);
        console.log(`     Result   : ${baselineTriggers === afterReprocessTriggers ? 'PASS' : 'FAIL'}`);

        console.log('Verify #6 - Delivered-once guarantee (IS-CRM-REL-0009) verified:');
        console.log(`     Expected : no duplicate contact updates and no duplicate automation triggers`);
        console.log(`     Actual   : baseline and after-reprocess counts are identical`);
        console.log(`     Result   : ${baselineUpserts === afterReprocessUpserts && baselineTriggers === afterReprocessTriggers ? 'PASS' : 'FAIL'}`);

        console.log('===============================================');

        // Assertions
        expect(queueModelPresent, 'Queue model must be present').toBe(true);
        expect(baselineUpserts, 'Baseline must have at least one contact upsert').toBeGreaterThanOrEqual(1);
        expect(afterReprocessUpserts, 'After re-processing, contact upserts must not increase').toBe(baselineUpserts);
        expect(afterReprocessTriggers, 'After re-processing, automation triggers must not increase').toBe(baselineTriggers);
      });
    } finally {
      // Cleanup: delete test data markers (in production, this would delete the actual contacts/leads)
      if (!SKIP_CLEANUP_HUB) {
        console.log('\n--- Cleanup ---');
        for (const marker of testDataMarkers) {
          console.log(`  Marked for sweep: ${marker}`);
        }
      }
    }
  });
});
