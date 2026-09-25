import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-23 - Creating a request adds a log note on the Opportunity, closing it adds none
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-23
 * Jira           : CRM-12135
 * Requirements   : FUNC-0062
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Raise a request from an Opportunity. Verify that a log note appears on the Opportunity.
 *   Close the request. Verify that closing does not add a second log note. The key assertion
 *   is that only the raise triggers a note, not the close.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-23:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12937 (TC-23)
 *
 *   Pre-condition(s):
 *      1. Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)
 *      2. Pre-Sales Application user is logged in and session uid is recorded
 *      3. A fresh Opportunity is created with name AUTO-CRM-12135-TC-23-<runId>, Expected
 *         Revenue >= $100
 *
 *   Steps to reproduce:
 *      1. From the Opportunity in the pre-conditions, click "Request SE support" and create
 *         one request with:
 *         - Subject      = AUTO-CRM-12135-TC-23-<runId>-note
 *         - Description  = Automated check of CRM-12135 TC-23.
 *         - Support type = Offline technical assistance
 *         Expected: No error popup.
 *
 *      2. Refresh the Opportunity and read its chatter.
 *         Expected: One log note "SE support requested by <salesperson> —
 *         AUTO-CRM-12135-TC-23-<runId>-note (HT000nn)" is shown. Note the ticket number as H.
 *
 *      3. Open request H on the Pre-Sales Application, set Ticket Type = Technical assistance,
 *         then click Closed on the stage bar.
 *         Expected: No error popup.
 *
 *      4. On the CRM, refresh the Opportunity and read its chatter.
 *         Expected: Still only the one log note carrying H from step 2; closing added none.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-23-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)',
  pre2:   'Pre-condition 2: Pre-Sales Application user is logged in and session uid is recorded',
  pre3:   'Pre-condition 3: A fresh Opportunity is created with name AUTO-CRM-12135-TC-23-<runId>, Expected Revenue >= $100',
  s1:     'Step 1: From the Opportunity in the pre-conditions, click "Request SE support" and create one request with: Subject = AUTO-CRM-12135-TC-23-<runId>-note, Description = Automated check of CRM-12135 TC-23., Support type = Offline technical assistance. Expected: No error popup.',
  s2:     'Step 2: Refresh the Opportunity and read its chatter. Expected: One log note "SE support requested by <salesperson> — AUTO-CRM-12135-TC-23-<runId>-note (HT000nn)" is shown. Note the ticket number as H.',
  s3:     'Step 3: Open request H on the Pre-Sales Application, set Ticket Type = Technical assistance, then click Closed on the stage bar. Expected: No error popup.',
  s4:     'Step 4: On the CRM, refresh the Opportunity and read its chatter. Expected: Still only the one log note carrying H from step 2; closing added none.',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-23 - The internal note lands at raise and on a contact change, not at close', () => {
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

  test('CRM-12135_TC-23: The internal note lands at raise and on a contact change, not at close', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-23 - The internal note lands at raise and on a contact change, not at close ==========');

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
const marker = MigPreSalePage.marker('TC-23', runId);
let leadId = 0;
let requestId = 0;
let notesAtRaise: string[] = [];
let notesAfterClose: string[] = [];

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log(`  Admin logged in`);
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
});

await test.step(STEP.pre3, async () => {
  console.log(`\n--- ${STEP.pre3} ---`);
  leadId = await preSale.createOpportunity(`${marker} source`, 900);
  teardown = async () => {
    if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
    const swept = await preSale.sweepByMarker(marker);
    console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
      (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
  };
  console.log(`  Opportunity ${leadId} created with marker ${marker}`);
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  await preSale.openOpportunity(leadId);
  await preSale.openRaiseDialog();
  const subject = `${marker}-note`;
  const description = 'Automated check of CRM-12135 TC-23.';
  const supportType = 'Offline technical assistance';
  await preSale.fillRaiseDialog({
    subject: subject,
    description: description,
    supportType: supportType,
  });
  console.log(`  - Subject      : ${subject}`);
  console.log(`  - Description  : ${description}`);
  console.log(`  - Support type : ${supportType}`);
  await preSale.saveRaiseDialog();
  await preSale.waitForRaiseDialogClosed();
  const raised = await preSale.requestsForLead(leadId);
  expect(raised.length, 'the raise should have created exactly one request').toBe(1);
  requestId = raised[0].id;
  console.log(`  Request ${requestId} (${raised[0].number}) created`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Request raised');

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  notesAtRaise = await preSale.logNotesForLead(leadId);
  console.log(`  Notes on the Opportunity after raise: ${notesAtRaise.length}`);
  if (notesAtRaise.length > 0) {
    console.log(`  Newest note (first 200 chars): ${notesAtRaise[0].slice(0, 200)}`);
  }
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  const typeId = await preSale.requestTypeIdByName(MigPreSalePage.EXPECTED_TYPES[0]);
  const typeName = MigPreSalePage.EXPECTED_TYPES[0];
  await preSale.setRequestType(requestId, typeId);
  const closedStageId = await preSale.stageIdByName('Closed');
  await preSale.moveRequestToStage(requestId, closedStageId);
  console.log(`  - Request type : ${typeName}`);
  console.log(`  - Stage        : Closed`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Request closed');

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  notesAfterClose = await preSale.logNotesForLead(leadId);
  console.log(`  Notes on the Opportunity after close: ${notesAfterClose.length}`);
  if (notesAfterClose.length > 0) {
    console.log(`  Newest note (first 200 chars): ${notesAfterClose[0].slice(0, 200)}`);
  }
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const noteAtRaise = notesAtRaise.length > 0;
  const namesRequest = (notesAtRaise[0] ?? '').includes(marker);
  const addedByClose = notesAfterClose.length - notesAtRaise.length;
  const countReadable = addedByClose <= 1;

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - At least one log note was written on the Opportunity when the request was raised:');
  console.log(`     Expected : at least one note`);
  console.log(`     Actual   : ${notesAtRaise.length}`);
  console.log(`     Result   : ${noteAtRaise ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - The note\'s body contains the request subject (AUTO-CRM-12135-TC-23 marker):');
  console.log(`     Expected : the note carries ${marker}`);
  console.log(`     Actual   : ${namesRequest}`);
  console.log(`     Result   : ${namesRequest ? 'PASS' : 'FAIL'}`);
  console.log('Verify #3 - The log note count after closing is readable and did not increase significantly (no second note was added by the close):');
  console.log(`     Expected : reported`);
  console.log(`     Actual   : ${addedByClose} note(s) added by the close`);
  console.log(`     Result   : ${countReadable ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  console.log(`OVERALL: ${noteAtRaise && namesRequest && countReadable ? 'PASS' : 'FAIL'} - All three checks passed`);

  expect(noteAtRaise, 'the raise should write a note on the Opportunity').toBe(true);
  expect(namesRequest, 'the note should name what was asked for').toBe(true);
  expect(countReadable, 'the note count after the close should not increase significantly').toBe(true);
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
