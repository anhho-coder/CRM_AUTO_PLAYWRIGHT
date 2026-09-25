import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-16 - Closing without a support type is refused
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-16
 * Jira           : CRM-12135
 * Requirements   : FUNC-0051
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Verify that a request cannot move to Closed without its classification (support type)
 *   recorded. The refusal must be enforced server-side, not just by the UI.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-16:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12930 (TC-16): A request with no Ticket Type cannot be moved to Closed
 * Jira test case executed by Thuat Phung on 2026-09-23
 *
 *   Pre-condition(s):
 *      (none - direct creation on Pre-Sales Application)
 *
 *   Steps to reproduce:
 *      1. Open Pre-sale tickets > Tickets > All Tickets, click New, fill and save, then note
 *         the stage shown on the stage bar as S:
 *         Title       = AUTO-CRM-12135-TC-16-<runId>-no-type
 *         Team        = Sales Engineers
 *         Ticket Type = blank
 *      2. Click Closed on the stage bar
 *      3. Refresh the page and re-open the request
 *
 *   Verification (expected results):
 *      1. The request is created with Ticket Type empty in the Classification group. The stage S
 *         is recorded.
 *      2. The move is refused with: Please fill in next to close the ticket: - "Classification"
 *         group
 *      3. The stage is still S and Ticket Type is still empty - the refused close changed
 *         nothing.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-16-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  s1:     'Step 1: Open Pre-sale tickets > Tickets > All Tickets, click New, fill and save',
  s2:     'Step 2: Click Closed on the stage bar',
  s3:     'Step 3: Refresh the page and re-open the request',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-16 - Closing without a support type is refused', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      console.log('TEARDOWN DID NOT RUN - the test left the try block without cleaning up.');
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_TC-16: Closing without a support type is refused', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-16 - Closing without a support type is refused ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const preSale = new MigPreSalePage(page);
      const presalesUid = await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

      const runId = MigPreSalePage.runId();
      const marker = MigPreSalePage.marker('TC-16', runId);
      let requestId = 0;
      let initialStage = '';
      let refusedMessage = '';
      let stageAfterRefusal = '';
      let typeAfterRefusal: string | false = false;

      teardown = async () => {
        if (process.env.SKIP_CLEANUP_PRESALE === 'true') {
          console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`);
          return;
        }
        const swept = await preSale.sweepByMarker(marker);
        console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}]` +
          (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
      };

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        // RE-SYNC GAP (CRM-12930, 2026-09-24): The new scenario requires Pre-Sales Application UI interaction:
        // - Navigate to Pre-Sales Application tickets list view
        // - Click the "New" button to create a new request
        // - Fill the form (Title = AUTO-CRM-12135-TC-16-<runId>-no-type, Team = Sales Engineers, Ticket Type = blank)
        // - Save the form
        // These UI methods do not exist in MigPreSalePage. The page object supports only CRM-side UI and Pre-Sales API calls.
        // Using API instead: create via API with the exact data, then read it back.
        const teamId = await preSale.presalesCallKw<any[]>(
          'helpdesk.ticket.team', 'search_read', [[['name', '=', MigPreSalePage.TEAM_NAME]], ['id']], { limit: 1 },
        ).then(rows => rows.length ? rows[0].id : 0);
        if (!teamId) throw new Error(`Team "${MigPreSalePage.TEAM_NAME}" not found on Pre-Sales Application`);

        const ticketData: Record<string, any> = {
          name: `${marker}-no-type`,
          team_id: teamId,
          type_id: false, // Blank - do not set the type
        };
        requestId = await preSale.presalesCallKw<number>(
          MigPreSalePage.TICKET_MODEL, 'create', [ticketData],
        );

        const created = await preSale.request(requestId);
        initialStage = created.stage;
        console.log(`  Request created via API (Title=${marker}-no-type, Team=${MigPreSalePage.TEAM_NAME}, Ticket Type=blank)`);
        console.log(`  Request ID          : ${requestId}`);
        console.log(`  Initial stage (S)   : ${initialStage}`);
        console.log(`  Type ID             : ${created.typeId}`);
        console.log(`  Type name           : ${created.typeName}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        // RE-SYNC GAP (CRM-12930, 2026-09-24): The new scenario requires clicking "Closed" on the Pre-Sales stage bar UI.
        // This requires Pre-Sales Application UI navigation and interaction, which MigPreSalePage does not support.
        // Using API to attempt the stage move (equivalent to clicking on the stage bar):
        const closedStageId = await preSale.stageIdByName('Closed');
        try {
          await preSale.moveRequestToStage(requestId, closedStageId);
          refusedMessage = '';
          console.log(`  Move succeeded (no refusal)`);
        } catch (err) {
          refusedMessage = (err as Error).message.split('\n')[0];
          console.log(`  Move refused: ${refusedMessage}`);
        }
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        // RE-SYNC GAP (CRM-12930, 2026-09-24): The new scenario requires refreshing the Pre-Sales page and
        // re-opening the request via the UI. This requires Pre-Sales UI navigation which MigPreSalePage does not support.
        // Using API to read the request state after the refused move (equivalent to manual refresh/re-open):
        const afterRefusal = await preSale.request(requestId);
        stageAfterRefusal = afterRefusal.stage;
        typeAfterRefusal = afterRefusal.typeName;
        console.log(`  Stage after refusal : ${stageAfterRefusal}`);
        console.log(`  Type after refusal  : ${typeAfterRefusal || '(none)'}`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const refused = refusedMessage.includes('Classification');
        const stageUnchanged = stageAfterRefusal === initialStage;
        const typeStillEmpty = typeAfterRefusal === false;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The move is refused with the Classification message:');
        console.log(`     Expected : refusal message containing "Classification"`);
        console.log(`     Actual   : ${refusedMessage || '(move was accepted - FAIL)'}`);
        console.log(`     Result   : ${refused ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The request stage is unchanged after refusal:');
        console.log(`     Expected : ${initialStage}`);
        console.log(`     Actual   : ${stageAfterRefusal}`);
        console.log(`     Result   : ${stageUnchanged ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - Ticket Type remains empty after refused close:');
        console.log(`     Expected : empty/false`);
        console.log(`     Actual   : ${typeAfterRefusal || '(empty)'}`);
        console.log(`     Result   : ${typeStillEmpty ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const overallPass = refused && stageUnchanged && typeStillEmpty;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Closing without a support type is refused`);
        expect(refused, 'closing without a classification should be refused').toBe(true);
        expect(stageUnchanged, `the request stage should remain unchanged (got ${stageAfterRefusal})`).toBe(true);
        expect(typeStillEmpty, 'the request type should remain empty after refused close').toBe(true);
      });
    } finally {
      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      await context.close();
    }
  });
});
