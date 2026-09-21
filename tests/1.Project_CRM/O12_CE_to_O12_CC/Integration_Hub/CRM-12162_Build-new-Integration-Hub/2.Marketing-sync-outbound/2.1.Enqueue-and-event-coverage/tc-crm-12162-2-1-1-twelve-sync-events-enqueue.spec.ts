import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigIntegrationHubPage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { reportHubBlocked } from '@config/integration-hub.config';
import { sweepMigLeftoversAfterAll } from '@helpers/o12ce-main-business.helper';

/**
 * CRM-12162_2.1.1 - Each carried sync event queues an entry with the correct label on its trigger condition
 * Test Case ID: CRM-12162_2.1.1
 * Jira: CRM-12162
 * Automation-Type: new
 * Automation-Date: 2026-09-16
 *
 * Summary:
 *   Verify that each of the twelve sync events (archived, Lead qualified, Email Changed, Stop Automation,
 *   Customer renewed/upgraded, Partner promoted, Change Saleperson, Contact Updated, New customer,
 *   New partner sign-up, Partner activated, Sale Order Updated) correctly enqueues an outbound queue entry
 *   with the exact event label on its trigger condition.
 *
 * Covers 14 requirements: IS-CRM-FUNC-0225, IS-CRM-FUNC-0226, IS-CRM-FUNC-0226-01 through -12.
 *
 * BLOCKED: This spec requires delivery inputs IS-CRM-SUPP-0011 (outbound enqueue entry point and
 * authentication) which are still open on CRM-12069. A BLOCKED run is a DELIVERY GAP, not a product defect.
 *
 * Source manual TC (master tab "CRM-12162_Build new Integration Hub/Marketing sync (outbound)", row 2.1.1):
 *
 *   Pre-conditions:
 *     _ Hub environment is accessible
 *     _ Test CRM contains records with required statuses and relationships
 *     _ Simulation entry point available to enqueue test entries
 *     _ Access to outbound queue traffic log
 *     _ BLOCKED: SUPP-0011 (simulation entry point authentication not yet provided by Dev)
 *
 *   Steps:
 *     Step 1: Trigger archived sync event on a contact record; enqueue queue entry through simulation
 *     Step 2: Verify queue entry created with event label archived
 *     Step 3: Trigger Lead qualified sync event on a lead record; enqueue through simulation
 *     Step 4: Verify queue entry created with event label Lead qualified
 *     Step 5: Trigger Email Changed sync event by updating contact email; enqueue through simulation
 *     Step 6: Verify queue entry created with event label Email Changed
 *     Step 7: Trigger Stop Automation sync event; enqueue through simulation
 *     Step 8: Verify queue entry created with event label Stop Automation
 *     Step 9: Trigger Customer renewed/upgraded sync event; enqueue through simulation
 *     Step 10: Verify queue entry created with event label Customer renewed/upgraded
 *     Step 11: Trigger Partner promoted sync event; enqueue through simulation
 *     Step 12: Verify queue entry created with event label Partner promoted
 *     Step 13: Trigger Change Saleperson sync event by updating lead owner; enqueue through simulation
 *     Step 14: Verify queue entry created with event label Change Saleperson
 *     Step 15: Trigger Contact Updated sync event by modifying contact fields; enqueue through simulation
 *     Step 16: Verify queue entry created with event label Contact Updated
 *     Step 17: Trigger New customer sync event; enqueue through simulation
 *     Step 18: Verify queue entry created with event label New customer
 *     Step 19: Trigger New partner sign-up sync event; enqueue through simulation
 *     Step 20: Verify queue entry created with event label New partner sign-up
 *     Step 21: Trigger Partner activated sync event; enqueue through simulation
 *     Step 22: Verify queue entry created with event label Partner activated
 *     Step 23: Trigger Sale Order Updated sync event by updating a sales order; enqueue through simulation
 *     Step 24: Verify queue entry created with event label Sale Order Updated
 *
 *   Expected:
 *     Step 2: Queue entry contains event label field = archived
 *     Step 4: Queue entry contains event label field = Lead qualified
 *     Step 6: Queue entry contains event label field = Email Changed
 *     Step 8: Queue entry contains event label field = Stop Automation
 *     Step 10: Queue entry contains event label field = Customer renewed/upgraded
 *     Step 12: Queue entry contains event label field = Partner promoted
 *     Step 14: Queue entry contains event label field = Change Saleperson (exact spelling from spec)
 *     Step 16: Queue entry contains event label field = Contact Updated
 *     Step 18: Queue entry contains event label field = New customer
 *     Step 20: Queue entry contains event label field = New partner sign-up
 *     Step 22: Queue entry contains event label field = Partner activated
 *     Step 24: Queue entry contains event label field = Sale Order Updated
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12162_2\.1\.1:" --project=chromium
 */

const STEP = {
  s1: 'Step 1: Trigger archived sync event on a contact record; enqueue queue entry through simulation',
  s2: 'Step 2: Verify queue entry created with event label archived',
  s3: 'Step 3: Trigger Lead qualified sync event on a lead record; enqueue through simulation',
  s4: 'Step 4: Verify queue entry created with event label Lead qualified',
  s5: 'Step 5: Trigger Email Changed sync event by updating contact email; enqueue through simulation',
  s6: 'Step 6: Verify queue entry created with event label Email Changed',
  s7: 'Step 7: Trigger Stop Automation sync event; enqueue through simulation',
  s8: 'Step 8: Verify queue entry created with event label Stop Automation',
  s9: 'Step 9: Trigger Customer renewed/upgraded sync event; enqueue through simulation',
  s10: 'Step 10: Verify queue entry created with event label Customer renewed/upgraded',
  s11: 'Step 11: Trigger Partner promoted sync event; enqueue through simulation',
  s12: 'Step 12: Verify queue entry created with event label Partner promoted',
  s13: 'Step 13: Trigger Change Saleperson sync event by updating lead owner; enqueue through simulation',
  s14: 'Step 14: Verify queue entry created with event label Change Saleperson',
  s15: 'Step 15: Trigger Contact Updated sync event by modifying contact fields; enqueue through simulation',
  s16: 'Step 16: Verify queue entry created with event label Contact Updated',
  s17: 'Step 17: Trigger New customer sync event; enqueue through simulation',
  s18: 'Step 18: Verify queue entry created with event label New customer',
  s19: 'Step 19: Trigger New partner sign-up sync event; enqueue through simulation',
  s20: 'Step 20: Verify queue entry created with event label New partner sign-up',
  s21: 'Step 21: Trigger Partner activated sync event; enqueue through simulation',
  s22: 'Step 22: Verify queue entry created with event label Partner activated',
  s23: 'Step 23: Trigger Sale Order Updated sync event by updating a sales order; enqueue through simulation',
  s24: 'Step 24: Verify queue entry created with event label Sale Order Updated',
  verify: 'Verification',
  pre1: 'Pre-condition: Set up test environment and verify prerequisites',
  unknown: 'Check for unexpected sync event labels',
} as const;

const SKIP_CLEANUP_HUB = false;
const TEST_CASE_ID = 'CRM-12162_2.1.1';

test.describe('CRM-12162_2.1.1 - Twelve sync events enqueue with correct labels', () => {
  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Tear down - Start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`\nFAILURE REASON: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Tear down - End').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP_HUB) {
      await sweepMigLeftoversAfterAll(browser, TEST_CASE_ID).catch(() => {});
    }
  });

  test('CRM-12162_2.1.1: Each carried sync event queues an entry with the correct label on its trigger condition', async (
    { browser, page },
    testInfo,
  ) => {
    test.setTimeout(config.timeouts.test);

    const testStartIso = new Date().toISOString();
    let hub: MigIntegrationHubPage | null = null;
    let queueModelPresent = false;
    let blockedByMissingInputs = false;
    const eventResults: Array<{ event: string; count: number; passed: boolean }> = [];

    console.log(
      '========== CRM-12162_2.1.1 - Twelve sync events enqueue with correct labels ==========',
    );

    // Decide BLOCKED before opening a session: the banner must print first, and a blocked run
    // must not burn a login on an environment it is never going to exercise.
    blockedByMissingInputs = reportHubBlocked(['outboundEnqueueUrl', 'outboundEnqueueAuth']);

    try {
      // Pre-condition: Log in and check queue model presence
      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        const loginPage = new LoginPageMig(page);
        await loginPage.navigateTo(baseUrl_mig);
        await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
        console.log(`  Logged in as: ${users.admin_crm_mig.username}`);

        hub = new MigIntegrationHubPage(page);

        // Check if queue model is present on this server
        // An unreachable server and a server without the model look identical - prove the session
        // answers FIRST, so an environment failure can never be recorded as "the model is absent".
        await hub.assertSessionUsable();
        queueModelPresent = await hub.isQueueModelPresent();
        console.log(`  Queue model present: ${queueModelPresent}`);

        if (!queueModelPresent) {
          throw new Error(
            `SKIPPED - the outbound queue model (${MigIntegrationHubPage.QUEUE_MODEL}) is not present on this server, so the sync event enqueue check could not run.`,
          );
        }

        await CommonUtils.captureAndAttachScreenshot(
          page,
          testInfo,
          'Pre-condition - Environment verified',
        ).catch(() => {});
      });

      // The twelve trigger + verify step pairs
      // Event 1: archived
      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'archived',
            leadId: 1,
            reference: `TEST ${TEST_CASE_ID} archived-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('archived', testStartIso);
          console.log(`  Queue entries for 'archived': ${count}`);
          eventResults.push({ event: 'archived', count, passed: count > 0 });
        }
      });

      // Event 2: Lead qualified
      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Lead qualified',
            leadId: 2,
            reference: `TEST ${TEST_CASE_ID} lead-qualified-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Lead qualified', testStartIso);
          console.log(`  Queue entries for 'Lead qualified': ${count}`);
          eventResults.push({ event: 'Lead qualified', count, passed: count > 0 });
        }
      });

      // Event 3: Email Changed
      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Email Changed',
            leadId: 3,
            reference: `TEST ${TEST_CASE_ID} email-changed-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Email Changed', testStartIso);
          console.log(`  Queue entries for 'Email Changed': ${count}`);
          eventResults.push({ event: 'Email Changed', count, passed: count > 0 });
        }
      });

      // Event 4: Stop Automation
      await test.step(STEP.s7, async () => {
        console.log(`\n--- ${STEP.s7} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Stop Automation',
            leadId: 4,
            reference: `TEST ${TEST_CASE_ID} stop-automation-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s8, async () => {
        console.log(`\n--- ${STEP.s8} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Stop Automation', testStartIso);
          console.log(`  Queue entries for 'Stop Automation': ${count}`);
          eventResults.push({ event: 'Stop Automation', count, passed: count > 0 });
        }
      });

      // Event 5: Customer renewed/upgraded
      await test.step(STEP.s9, async () => {
        console.log(`\n--- ${STEP.s9} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Customer renewed/upgraded',
            leadId: 5,
            reference: `TEST ${TEST_CASE_ID} customer-renewed-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s10, async () => {
        console.log(`\n--- ${STEP.s10} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent(
            'Customer renewed/upgraded',
            testStartIso,
          );
          console.log(`  Queue entries for 'Customer renewed/upgraded': ${count}`);
          eventResults.push({ event: 'Customer renewed/upgraded', count, passed: count > 0 });
        }
      });

      // Event 6: Partner promoted
      await test.step(STEP.s11, async () => {
        console.log(`\n--- ${STEP.s11} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Partner promoted',
            leadId: 6,
            reference: `TEST ${TEST_CASE_ID} partner-promoted-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s12, async () => {
        console.log(`\n--- ${STEP.s12} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Partner promoted', testStartIso);
          console.log(`  Queue entries for 'Partner promoted': ${count}`);
          eventResults.push({ event: 'Partner promoted', count, passed: count > 0 });
        }
      });

      // Event 7: Change Saleperson (exact spelling from spec)
      await test.step(STEP.s13, async () => {
        console.log(`\n--- ${STEP.s13} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Change Saleperson',
            leadId: 7,
            reference: `TEST ${TEST_CASE_ID} change-saleperson-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s14, async () => {
        console.log(`\n--- ${STEP.s14} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Change Saleperson', testStartIso);
          console.log(`  Queue entries for 'Change Saleperson': ${count}`);
          eventResults.push({ event: 'Change Saleperson', count, passed: count > 0 });
        }
      });

      // Event 8: Contact Updated
      await test.step(STEP.s15, async () => {
        console.log(`\n--- ${STEP.s15} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Contact Updated',
            leadId: 8,
            reference: `TEST ${TEST_CASE_ID} contact-updated-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s16, async () => {
        console.log(`\n--- ${STEP.s16} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Contact Updated', testStartIso);
          console.log(`  Queue entries for 'Contact Updated': ${count}`);
          eventResults.push({ event: 'Contact Updated', count, passed: count > 0 });
        }
      });

      // Event 9: New customer
      await test.step(STEP.s17, async () => {
        console.log(`\n--- ${STEP.s17} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'New customer',
            leadId: 9,
            reference: `TEST ${TEST_CASE_ID} new-customer-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s18, async () => {
        console.log(`\n--- ${STEP.s18} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('New customer', testStartIso);
          console.log(`  Queue entries for 'New customer': ${count}`);
          eventResults.push({ event: 'New customer', count, passed: count > 0 });
        }
      });

      // Event 10: New partner sign-up
      await test.step(STEP.s19, async () => {
        console.log(`\n--- ${STEP.s19} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'New partner sign-up',
            leadId: 10,
            reference: `TEST ${TEST_CASE_ID} new-partner-signup-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s20, async () => {
        console.log(`\n--- ${STEP.s20} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('New partner sign-up', testStartIso);
          console.log(`  Queue entries for 'New partner sign-up': ${count}`);
          eventResults.push({ event: 'New partner sign-up', count, passed: count > 0 });
        }
      });

      // Event 11: Partner activated
      await test.step(STEP.s21, async () => {
        console.log(`\n--- ${STEP.s21} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Partner activated',
            leadId: 11,
            reference: `TEST ${TEST_CASE_ID} partner-activated-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s22, async () => {
        console.log(`\n--- ${STEP.s22} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Partner activated', testStartIso);
          console.log(`  Queue entries for 'Partner activated': ${count}`);
          eventResults.push({ event: 'Partner activated', count, passed: count > 0 });
        }
      });

      // Event 12: Sale Order Updated
      await test.step(STEP.s23, async () => {
        console.log(`\n--- ${STEP.s23} ---`);
        if (!blockedByMissingInputs && hub) {
          const response = await hub.enqueueOutboundEntry({
            syncEvent: 'Sale Order Updated',
            leadId: 12,
            reference: `TEST ${TEST_CASE_ID} sale-order-updated-${CommonUtils.generateUniqueId('run')}`,
          });
          console.log(`  Enqueue response: ${response.status}`);
        }
      });

      await test.step(STEP.s24, async () => {
        console.log(`\n--- ${STEP.s24} ---`);
        if (!blockedByMissingInputs && hub) {
          const count = await hub.countQueueEntriesForEvent('Sale Order Updated', testStartIso);
          console.log(`  Queue entries for 'Sale Order Updated': ${count}`);
          eventResults.push({ event: 'Sale Order Updated', count, passed: count > 0 });
        }
      });

      // Check for unknown labels (not in the carried twelve events)
      let unknownLabelsFound: string[] = [];
      let observedLabels: Map<string, number> = new Map();
      if (!blockedByMissingInputs && hub) {
        await test.step(STEP.unknown, async () => {
          console.log(`\n--- ${STEP.unknown} ---`);
          observedLabels = await hub!.observedSyncEventLabels(testStartIso);
          unknownLabelsFound = MigIntegrationHubPage.unknownLabels(observedLabels);
          if (unknownLabelsFound.length > 0) {
            console.log(
              `  Unknown labels found: ${unknownLabelsFound.join(', ')} (CRM cannot enforce sync-event selection list, so data is checked instead)`,
            );
          } else {
            console.log('  No unknown labels found - all observed events are in the carried set');
          }
        });
      }

      // VERIFY block
      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');

        if (blockedByMissingInputs) {
          console.log('NOTE: Spec inputs IS-CRM-SUPP-0011 are not yet delivered (open on CRM-12069).');
          console.log('All verify checks are BLOCKED - record this run as SKIPPED.');
        } else {
          for (let i = 0; i < eventResults.length; i++) {
            const result = eventResults[i];
            console.log(`  Verify #${i + 1} - Event '${result.event}' enqueued with correct label:`);
            console.log(`     Expected : count >= 1`);
            console.log(`     Actual   : ${result.count}`);
            console.log(`     Result   : ${result.passed ? 'PASS' : 'FAIL'}`);
          }

          if (unknownLabelsFound.length > 0) {
            console.log(
              `  Verify #${eventResults.length + 1} - No unknown labels outside the twelve carried events:`,
            );
            console.log(`     Expected : unknownLabels.length = 0`);
            console.log(`     Actual   : ${unknownLabelsFound.length} (${unknownLabelsFound.join(', ')})`);
            console.log(`     Result   : FAIL`);
          } else {
            console.log(
              `  Verify #${eventResults.length + 1} - No unknown labels outside the twelve carried events:`,
            );
            console.log(`     Expected : unknownLabels.length = 0`);
            console.log(`     Actual   : ${unknownLabelsFound.length}`);
            console.log(`     Result   : ${unknownLabelsFound.length === 0 ? 'PASS' : 'FAIL'}`);
          }
        }

        console.log('===============================================');

        if (blockedByMissingInputs) {
          console.log(
            'OVERALL: SKIPPED - IS-CRM-SUPP-0011 not delivered; this is a delivery gap, not a product failure.',
          );
          // Never let a BLOCKED run report green: nothing was exercised, so there is nothing to pass.
          throw new Error(
            'SKIPPED - the delivery has not provided the outbound enqueue entry point (IS-CRM-SUPP-0011, open on CRM-12069). ' +
              'This is a delivery gap, not a product defect.',
          );
        } else {
          const allPassed = eventResults.every((r) => r.passed) && unknownLabelsFound.length === 0;
          console.log(
            `OVERALL: ${allPassed ? 'PASS' : 'FAIL'} - ${eventResults.length} sync events enqueue with correct labels.`,
          );

          // Assertions (only run if inputs are available)
          for (const result of eventResults) {
            expect(result.count, `Event '${result.event}' should have at least 1 queue entry`).toBeGreaterThan(
              0,
            );
          }
          expect(
            unknownLabelsFound,
            `No unknown labels should be present; found: ${unknownLabelsFound.join(', ')}`,
          ).toEqual([]);
        }
      });
    } finally {
      // No additional cleanup needed - the suite-level afterAll will sweep leftovers
    }
  });
});
