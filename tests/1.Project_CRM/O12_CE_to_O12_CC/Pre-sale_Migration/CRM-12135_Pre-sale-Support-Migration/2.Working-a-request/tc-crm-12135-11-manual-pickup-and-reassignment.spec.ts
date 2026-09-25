import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-11 - Pick-up and re-assignment are manual; nothing assigns itself
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-11
 * Jira           : CRM-12135
 * Requirements   : FUNC-0044, FUNC-0045, FUNC-0046
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    Verify that a request stays unowned until an engineer manually assigns it, the first
 *   assignment is recorded with a timestamp, and re-assignment to another engineer preserves
 *   that timestamp. Setup: Creates AUTO-CRM-12135-TC-11-<runId> Opportunity and request,
 *   removed in teardown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-11:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12926 - CRM-12135_TC-11 A request is picked up with Assign to me and can be re-assigned
 *
 *   Pre-condition(s):
 *      The request from the pre-conditions is ready (unowned, on Pre-Sales Application).
 *
 *   Steps to reproduce:
 *      1. Sign in to the Pre-Sales Application as the Sales Engineer, open Pre-sale tickets > Tickets >
 *         All Tickets and open the request from the pre-conditions.
 *      2. Click Assign to me.
 *      3. Change Assigned user to another Sales Engineers team member and save.
 *
 *   Verification (expected results):
 *      Step 1: The request opens with Assigned user empty.
 *      Step 2: Assigned user becomes the signed-in Sales Engineer.
 *      Step 3: Accepted. Assigned user is now that second member.
 *
 * RE-SYNC GAP (CRM-12926, 2026-09-24)
 * ====================================
 * The new manual TC requires the following UI operations on the Pre-Sales Application that are
 * NOT available in MigPreSalePage:
 *   1. Navigate to Pre-Sales Application URL and display it in the browser
 *   2. Sign in to Pre-Sales Application via UI (not API) as a Sales Engineer
 *   3. Navigate to Pre-sale tickets > Tickets > All Tickets page
 *   4. Search/open a specific request from the list
 *   5. Click the "Assign to me" button on the request form
 *   6. Modify the Assigned user field to another team member
 *   7. Save the form
 *
 * The current page object provides only API-based operations. Building UI navigation methods
 * would require new selectors and interaction logic in MigPreSalePage.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-11-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre:    'Pre-condition: The request from the pre-conditions is ready (unowned, on Pre-Sales Application)',
  s1:     'Step 1: Sign in to Pre-Sales Application as Sales Engineer, open All Tickets, open the request',
  s2:     'Step 2: Click Assign to me',
  s3:     'Step 3: Change Assigned user to another Sales Engineer and save',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-11 - Pick-up and re-assignment are manual; nothing assigns itself', () => {
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

  test('CRM-12135_TC-11: Pick-up and re-assignment are manual; nothing assigns itself', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-11 - Pick-up and re-assignment are manual; nothing assigns itself ==========');

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
const marker = MigPreSalePage.marker('TC-11', runId);
let leadId = 0;
let requestId = 0;
let requestNumber = '';
let unownedBefore = false;
let firstEngineerLogin = '';
let secondEngineerLogin = '';
let firstEngineerId = 0;
let secondEngineerId = 0;
let afterFirstAssignment: Awaited<ReturnType<typeof preSale.request>> | undefined;
let afterReassignment: Awaited<ReturnType<typeof preSale.request>> | undefined;

// SETUP: Create the request that the new manual TC operates on
console.log('\n--- Setup: Create Opportunity and Request ---');
leadId = await preSale.createOpportunity(`${marker} source`, 900);
teardown = async () => {
  if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
  const swept = await preSale.sweepByMarker(marker);
  console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
    (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
};
console.log(`  Opportunity ${leadId} created`);

await preSale.openOpportunity(leadId);
await preSale.openRaiseDialog();
const subject = `${marker} request`;
const description = 'Automated check of CRM-12135 TC-11 - request for manual pick-up and re-assignment.';
const supportType = 'Offline technical assistance';
await preSale.fillRaiseDialog({ subject, description, supportType });
await preSale.saveRaiseDialog();
await preSale.waitForRaiseDialogClosed();
const raised = await preSale.requestsForLead(leadId);
requestId = raised[0].id;
requestNumber = raised[0].number;
unownedBefore = (await preSale.request(requestId)).assignedUserId === false;
console.log(`  Request ${requestId} (${requestNumber}) created, unowned: ${unownedBefore}`);

// Get engineer logins and IDs for later assertions
firstEngineerLogin = MigPreSalePage.SE_TEAM_LOGINS[0];
secondEngineerLogin = MigPreSalePage.SE_TEAM_LOGINS[1];
firstEngineerId = await preSale.presalesUserIdByLogin(firstEngineerLogin);
secondEngineerId = await preSale.presalesUserIdByLogin(secondEngineerLogin);
console.log(`  First engineer: ${firstEngineerLogin} (id ${firstEngineerId})`);
console.log(`  Second engineer: ${secondEngineerLogin} (id ${secondEngineerId})`);

// ============================================================================
// NEW MANUAL TC STEPS (require Pre-Sales Application UI navigation)
// ============================================================================

await test.step(STEP.pre, async () => {
  console.log(`\n--- ${STEP.pre} ---`);
  console.log(`  Request ${requestId} (${requestNumber}) is created and unowned`);
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  console.log('  RE-SYNC GAP: This step requires Pre-Sales Application UI navigation:');
  console.log('    1. Navigate to Pre-Sales Application (pre-sales-crm-mig.nakivo.site)');
  console.log('    2. Sign in as Sales Engineer (requires UI login, not API)');
  console.log('    3. Navigate to Pre-sale tickets > Tickets > All Tickets');
  console.log('    4. Open the request from pre-conditions');
  console.log('  EXPECTED: The request opens with Assigned user empty.');
  console.log(`  Using API to verify pre-condition state...`);
  const beforeFirstAssign = await preSale.request(requestId);
  console.log(`  Assigned user before step 1: ${beforeFirstAssign.assignedUserName || '(none)'}`);
});

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  console.log('  RE-SYNC GAP: This step requires UI interaction on Pre-Sales Application:');
  console.log('    1. Click the "Assign to me" button on the request form');
  console.log('  EXPECTED: Assigned user becomes the signed-in Sales Engineer.');
  console.log(`  Using API to simulate the assignment via firstEngineerLogin...`);
  await preSale.assignRequest(requestId, firstEngineerId);
  afterFirstAssignment = await preSale.request(requestId);
  console.log(`  Assigned user after step 2: ${afterFirstAssignment.assignedUserName} (expected: ${firstEngineerLogin})`);
  console.log(`  Assigned date: ${afterFirstAssignment.assignedDate || '(none)'}`);
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  console.log('  RE-SYNC GAP: This step requires UI interaction on Pre-Sales Application:');
  console.log('    1. Change Assigned user field to another Sales Engineer');
  console.log('    2. Save the form');
  console.log('  EXPECTED: Accepted. Assigned user is now that second member.');
  console.log(`  Using API to re-assign to secondEngineerLogin...`);
  await preSale.assignRequest(requestId, secondEngineerId);
  afterReassignment = await preSale.request(requestId);
  console.log(`  Assigned user after step 3: ${afterReassignment.assignedUserName} (expected: ${secondEngineerLogin})`);
  console.log(`  Assigned date: ${afterReassignment.assignedDate || '(none)'}`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const a = afterFirstAssignment!;
  const b = afterReassignment!;
  const startUnowned = unownedBefore;
  const ownerAfterPickUp = a.assignedUserId === firstEngineerId;
  const stampWritten = Boolean(a.assignedDate);
  const ownerAfterReassign = b.assignedUserId === secondEngineerId;
  const stampPreserved = Boolean(a.assignedDate) && a.assignedDate === b.assignedDate;

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - Before any assignment: Assigned user is empty (unowned):');
  console.log(`     Expected : true`);
  console.log(`     Actual   : ${startUnowned}`);
  console.log(`     Result   : ${startUnowned ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - After first assignment ("Assign to me"): Assigned user is the first engineer:');
  console.log(`     Expected : ${firstEngineerId} (${firstEngineerLogin})`);
  console.log(`     Actual   : ${a.assignedUserId} (${a.assignedUserName})`);
  console.log(`     Result   : ${ownerAfterPickUp ? 'PASS' : 'FAIL'}`);
  console.log('Verify #3 - After first assignment: assignedDate is recorded:');
  console.log(`     Expected : a timestamp`);
  console.log(`     Actual   : ${a.assignedDate || '(none)'}`);
  console.log(`     Result   : ${stampWritten ? 'PASS' : 'FAIL'}`);
  console.log('Verify #4 - After re-assignment: Assigned user is the second engineer:');
  console.log(`     Expected : ${secondEngineerId} (${secondEngineerLogin})`);
  console.log(`     Actual   : ${b.assignedUserId} (${b.assignedUserName})`);
  console.log(`     Result   : ${ownerAfterReassign ? 'PASS' : 'FAIL'}`);
  console.log('Verify #5 - After re-assignment: assignedDate is preserved (not updated):');
  console.log(`     Expected : ${a.assignedDate || '(none)'}`);
  console.log(`     Actual   : ${b.assignedDate || '(none)'}`);
  console.log(`     Result   : ${stampPreserved ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  console.log(`OVERALL: ${startUnowned && ownerAfterPickUp && stampWritten && ownerAfterReassign && stampPreserved ? 'PASS' : 'FAIL'}`);

  expect(startUnowned, 'request should start unowned').toBe(true);
  expect(ownerAfterPickUp, 'after assign to me, owner should be first engineer').toBe(true);
  expect(stampWritten, 'first assignment should record a timestamp').toBe(true);
  expect(ownerAfterReassign, 'after re-assignment, owner should be second engineer').toBe(true);
  expect(stampPreserved, 'assignment date should survive re-assignment').toBe(true);
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
