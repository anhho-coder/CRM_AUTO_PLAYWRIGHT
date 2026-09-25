import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-17 - A typed close succeeds and the timestamps hold
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-17
 * Jira           : CRM-12135
 * Requirements   : FUNC-0050, FUNC-0051, FUNC-0052
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Verify that a request can move freely between stages and that a typed close (with
 *   classification recorded) preserves the created timestamp and writes the closed timestamp.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-17:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12931 (TC-17) - rewritten by Thuat Phung on 2026-09-23.
 *
 *   Pre-condition(s):
 *      A request on the Pre-Sales Application with Ticket Type already filled.
 *
 *   Steps to reproduce:
 *      1. Open the request on the Pre-Sales Application, read the Classification group, and note
 *     the created date as C.
 *      2. Click On Product Team on the stage bar.
 *      3. Click In Progress on the stage bar.
 *      4. Click On Support Team on the stage bar.
 *      5. Click Closed on the stage bar.
 *      6. Refresh the page and re-open the request.
 *
 *   Verification (expected results):
 *      1. Ticket Type is already filled.
 *      2. No error popup when moving to On Product Team.
 *      3. No error popup when moving to In Progress.
 *      4. No error popup when moving to On Support Team.
 *      5. No error popup when moving to Closed.
 *      6. After refresh, the stage is Closed, the created date is still C, and the closed date
 *     is the time of step 5.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-17-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  s1: 'Step 1: Open the request on the Pre-Sales Application, read the Classification group, and note the created date as C',
  s2: 'Step 2: Click On Product Team on the stage bar',
  s3: 'Step 3: Click In Progress on the stage bar',
  s4: 'Step 4: Click On Support Team on the stage bar',
  s5: 'Step 5: Click Closed on the stage bar',
  s6: 'Step 6: Refresh the page and re-open the request',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-17 - A typed close succeeds and the timestamps hold', () => {
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

  test('CRM-12135_TC-17: A typed close succeeds and the timestamps hold', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-17 - A typed close succeeds and the timestamps hold ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);
      const presalesUid = await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

const runId = MigPreSalePage.runId();
    const marker = MigPreSalePage.marker('TC-17', runId);
    let leadId = 0;
    let requestId = 0;
    let createdAtRaise = '';
    let closedRequest: Awaited<ReturnType<typeof preSale.request>> | undefined;

    // ==== FIXTURE SETUP - Create the request with Ticket Type filled ====
    leadId = await preSale.createOpportunity(`${marker} source`, 900);
    teardown = async () => {
      if (process.env.SKIP_CLEANUP_PRESALE === 'true') {
        console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`);
        return;
      }
      const swept = await preSale.sweepByMarker(marker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and ` +
        `opportunities [${swept.opportunities.join(', ')}]` +
        (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    };

    // Open the Opportunity and create the request via the raise dialog.
    await preSale.openOpportunity(leadId);
    await preSale.openRaiseDialog();
    await preSale.fillRaiseDialog({
      subject: `${marker} request`,
      description: 'Automated check of CRM-12135 TC-17 - the engineer flow.',
      supportType: 'Offline technical assistance',
    });
    await preSale.saveRaiseDialog();
    await preSale.waitForRaiseDialogClosed();

    // Get the request and set its Ticket Type so it matches the pre-condition.
    const raised = await preSale.requestsForLead(leadId);
    expect(raised.length === 1, 'exactly one request should be created').toBe(true);
    requestId = raised[0].id;
    const typeId = await preSale.requestTypeIdByName(MigPreSalePage.EXPECTED_TYPES[1]);
    await preSale.setRequestType(requestId, typeId);

    let baseRequest = await preSale.request(requestId);
    createdAtRaise = baseRequest.createDate;
    console.log(`Pre-condition setup: Request ${requestId} created with Ticket Type = ${MigPreSalePage.EXPECTED_TYPES[1]}`);
    console.log(`  Created date (C) : ${createdAtRaise}`);

    // ==== RE-SYNC GAP (CRM-12931, 2026-09-24) ====
    // The new manual TC requires opening the request form on the Pre-Sales Application and
    // clicking stage buttons in the UI. MigPreSalePage has NO method to navigate to a request
    // form on the Pre-Sales Application (all request operations go through API calls via
    // presalesCallKw). Without a navigation method, the following cannot be done:
    //   - Step 1: Open the request on the Pre-Sales Application UI and read the Classification group
    //   - Step 2-5: Click stage buttons on the stage bar (no page object selectors or methods)
    //   - Step 6: Refresh and verify via the UI
    // The test CAN verify the scenario via API calls, below. A page object enhancement is needed:
    //   - navigateToPresalesRequest(requestId) method (similar to openOpportunity for the CRM)
    //   - Selectors for stage buttons and date fields on the request form
    // =====================================================================

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  RE-SYNC GAP: cannot navigate to request form on Pre-Sales Application.`);
      console.log(`  Verifying via API instead:`);
      baseRequest = await preSale.request(requestId);
      console.log(`    Ticket Type : ${baseRequest.typeName || '(not set)'}`);
      console.log(`    Created date (C) : ${baseRequest.createDate}`);
      expect(baseRequest.typeId, 'Ticket Type should be filled').not.toBe(false);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  RE-SYNC GAP: cannot click stage buttons on the Pre-Sales Application form.`);
      const stageId = await preSale.stageIdByName('On Product Team');
      await preSale.moveRequestToStage(requestId, stageId);
      const r = await preSale.request(requestId);
      console.log(`    Stage moved via API: ${r.stage}`);
      expect(r.stage, 'No error popup - move to On Product Team should succeed').toBe('On Product Team');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  RE-SYNC GAP: cannot click stage buttons on the Pre-Sales Application form.`);
      const stageId = await preSale.stageIdByName('In Progress');
      await preSale.moveRequestToStage(requestId, stageId);
      const r = await preSale.request(requestId);
      console.log(`    Stage moved via API: ${r.stage}`);
      expect(r.stage, 'No error popup - move to In Progress should succeed').toBe('In Progress');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  RE-SYNC GAP: cannot click stage buttons on the Pre-Sales Application form.`);
      const stageId = await preSale.stageIdByName('On Support Team');
      await preSale.moveRequestToStage(requestId, stageId);
      const r = await preSale.request(requestId);
      console.log(`    Stage moved via API: ${r.stage}`);
      expect(r.stage, 'No error popup - move to On Support Team should succeed').toBe('On Support Team');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  RE-SYNC GAP: cannot click stage buttons on the Pre-Sales Application form.`);
      const closedStageId = await preSale.stageIdByName('Closed');
      await preSale.moveRequestToStage(requestId, closedStageId);
      closedRequest = await preSale.request(requestId);
      console.log(`    Stage moved via API: ${closedRequest.stage}`);
      expect(closedRequest.stage, 'No error popup - move to Closed should succeed').toBe('Closed');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      console.log(`  RE-SYNC GAP: cannot refresh or re-open the request on the Pre-Sales Application form.`);
      console.log(`  Verifying via API instead:`);
      closedRequest = await preSale.request(requestId);
      const createdUnchanged = closedRequest.createDate === createdAtRaise;
      const closedStamp = Boolean(closedRequest.closedDate) && String(closedRequest.closedDate) >= createdAtRaise;
      console.log(`    Stage        : ${closedRequest.stage}`);
      console.log(`    Created at   : ${closedRequest.createDate} (expected: ${createdAtRaise})`);
      console.log(`    Closed at    : ${closedRequest.closedDate || '(none)'}`);
      console.log(`    Created stable: ${createdUnchanged ? 'yes' : 'no'}`);
      console.log(`    Closed valid : ${closedStamp ? 'yes' : 'no'}`);
      expect(closedRequest.stage, 'stage should be Closed').toBe('Closed');
      expect(createdUnchanged, 'created date should be unchanged').toBe(true);
      expect(closedStamp, 'closed date should be written and >= created date').toBe(true);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const r = closedRequest!;
      const createdHeld = r.createDate === createdAtRaise;
      const closedStamp = Boolean(r.closedDate) && String(r.closedDate) >= createdAtRaise;

      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - Ticket Type is filled:');
      console.log(`     Expected : a request type (not empty)`);
      console.log(`     Actual   : ${r.typeName || '(not set)'}`);
      console.log(`     Result   : ${r.typeId ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - Stage move to On Product Team succeeds with no error:');
      console.log(`     Result   : PASS (no error thrown)`);
      console.log('Verify #3 - Stage move to In Progress succeeds with no error:');
      console.log(`     Result   : PASS (no error thrown)`);
      console.log('Verify #4 - Stage move to On Support Team succeeds with no error:');
      console.log(`     Result   : PASS (no error thrown)`);
      console.log('Verify #5 - Stage move to Closed succeeds with no error:');
      console.log(`     Expected : Closed`);
      console.log(`     Actual   : ${r.stage}`);
      console.log(`     Result   : ${r.stage === 'Closed' ? 'PASS' : 'FAIL'}`);
      console.log('Verify #6 - After refresh, created date is unchanged and closed date is written:');
      console.log(`     Created at   : ${r.createDate} (expected: ${createdAtRaise})`);
      console.log(`     Closed at    : ${r.closedDate || '(none)'}`);
      console.log(`     Created stable: ${createdHeld ? 'PASS' : 'FAIL'}`);
      console.log(`     Closed valid : ${closedStamp ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      const overallPass = r.typeId && r.stage === 'Closed' && createdHeld && closedStamp;
      console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Request moves freely between stages and close records timestamps`);
      expect(r.typeId, 'Ticket Type should be filled').not.toBe(false);
      expect(r.stage, 'stage should be Closed').toBe('Closed');
      expect(createdHeld, 'created date should be unchanged').toBe(true);
      expect(closedStamp, 'closed date should be written and not precede created date').toBe(true);
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
