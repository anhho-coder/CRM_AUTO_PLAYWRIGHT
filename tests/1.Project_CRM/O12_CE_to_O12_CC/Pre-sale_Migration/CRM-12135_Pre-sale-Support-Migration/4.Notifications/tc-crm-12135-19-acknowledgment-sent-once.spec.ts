import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-19 - The acknowledgment is sent once and never repeats
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-19
 * Jira           : CRM-12135
 * Requirements   : FUNC-0058
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Raise a request from an Opportunity above the gate, and verify that the request receives
 *   an acknowledgment email. Then move the request out of and back into New status, and verify
 *   that the round trip does not add a second acknowledgment email. Evidence is the filtered
 *   mail queue.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-19:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12933, TC-19 from the manual test case written by Thuat Phung, 2026-09-23.
 *
 *   Pre-condition(s):
 *      1. Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)
 *      2. Pre-Sales Application user is logged in and session uid is recorded
 *      3. A fresh Opportunity is created with name AUTO-CRM-12135-TC-19-<runId>, Expected
 *     Revenue >= $100
 *
 *   Steps to reproduce:
 *      1. From that Opportunity, click "Request SE support" and create one request with:
 *          - Subject          = AUTO-CRM-12135-TC-19-<runId>-ack
 *          - Description      = Automated check of CRM-12135 TC-19.
 *          - Support type     = Offline technical assistance
 *          Then open the request and note its Ticket number.
 *      2. [INTERNAL check, Call API] Read the mail queue entries and keep only the mails
 *     whose body contains "has been received and is being reviewed by our Sales Engineers team"
 *      3. Open the request, click In Progress on the stage bar, then click New again
 *      4. [INTERNAL check, Call API] Read the mail queue entries again and keep only the mails
 *     whose body contains "has been received and is being reviewed by our Sales Engineers team"
 *
 *   Verification (expected results):
 *      1. After raising the request, exactly one mail queue entry exists with the acknowledgment
 *     body text
 *      2. After the round trip through In Progress back to New, still exactly one such mail
 *     exists (the round trip added no second acknowledgment)
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-19-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)',
  pre2:   'Pre-condition 2: Pre-Sales Application user is logged in and session uid is recorded',
  pre3:   'Pre-condition 3: A fresh Opportunity is created with name AUTO-CRM-12135-TC-19-<runId>, Expected Revenue >= $100',
  s1:     'Step 1: From that Opportunity, click "Request SE support" and create one request with subject AUTO-CRM-12135-TC-19-<runId>-ack, then open the request and note its Ticket number',
  s2:     'Step 2: [INTERNAL check, Call API] Read the mail queue entries and keep only the mails whose body contains "has been received and is being reviewed by our Sales Engineers team"',
  s3:     'Step 3: Open the request, click In Progress on the stage bar, then click New again',
  s4:     'Step 4: [INTERNAL check, Call API] Read the mail queue entries again and keep only the mails whose body contains "has been received and is being reviewed by our Sales Engineers team"',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The acknowledgment email body text we look for when filtering the mail queue. */
const ACK_TEXT = 'has been received and is being reviewed by our Sales Engineers team';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-19 - The acknowledgment is sent once and never repeats', () => {
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

  test('CRM-12135_TC-19: The acknowledgment is sent once and never repeats', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-19 - The acknowledgment is sent once and never repeats ==========');

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
const marker = MigPreSalePage.marker('TC-19', runId);
      let leadId = 0;
      let requestId = 0;
      let ticketNumber = '';
      let mailsAtRaise = 0;
      let mailsAfterRoundTrip = 0;

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log(`  - Admin session established as : ${users.admin_crm_mig.username}`);
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
});

await test.step(STEP.pre3, async () => {
  console.log(`\n--- ${STEP.pre3} ---`);
  leadId = await preSale.createOpportunity(`${marker} source`, 900);
  teardown = async () => {
    if (SKIP_CLEANUP) {
      console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`);
      return;
    }
    const swept = await preSale.sweepByMarker(marker);
    console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and ` +
      `opportunities [${swept.opportunities.join(', ')}]` +
      (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
  };
  console.log(`  - Opportunity : ${leadId}`);
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  await preSale.openOpportunity(leadId);
  await preSale.openRaiseDialog();
  await preSale.fillRaiseDialog({
    subject: `${marker}-ack`,
    description: 'Automated check of CRM-12135 TC-19.',
    supportType: 'Offline technical assistance',
  });
  await preSale.saveRaiseDialog();
  await preSale.waitForRaiseDialogClosed();
  const raised = await preSale.requestsForLead(leadId);
  expect(raised.length === 1, 'exactly one request should be created').toBe(true);
  requestId = raised[0].id;
  ticketNumber = raised[0].number;
  console.log(`  - Request     : ${requestId}`);
  console.log(`  - Ticket number: ${ticketNumber}`);
});

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  const allMails = await preSale.mailsForRequest(requestId);
  const ackMails = allMails.filter(m => m.bodyHtml && m.bodyHtml.includes(ACK_TEXT));
  mailsAtRaise = ackMails.length;
  console.log(`  - Ack mails found : ${mailsAtRaise}`);
  if (ackMails.length > 0) {
    console.log(`  - Ack mail recipient: ${ackMails[0].emailTo}`);
  }
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  const inProgress = await preSale.stageIdByName('In Progress');
  await preSale.moveRequestToStage(requestId, inProgress);
  console.log(`  - Moved to : In Progress`);
  const newStage = await preSale.stageIdByName('New');
  await preSale.moveRequestToStage(requestId, newStage);
  console.log(`  - Moved to : New`);
});

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  const allMails = await preSale.mailsForRequest(requestId);
  const ackMails = allMails.filter(m => m.bodyHtml && m.bodyHtml.includes(ACK_TEXT));
  mailsAfterRoundTrip = ackMails.length;
  console.log(`  - Ack mails found after round trip : ${mailsAfterRoundTrip}`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const hasAckMail = mailsAtRaise === 1;
  const noRepeat = mailsAfterRoundTrip === mailsAtRaise;

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - After raising the request, exactly one mail queue entry exists with the acknowledgment body text:');
  console.log(`     Expected : 1 ack mail`);
  console.log(`     Actual   : ${mailsAtRaise}`);
  console.log(`     Result   : ${hasAckMail ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - After the round trip through In Progress back to New, still exactly one such mail exists (no second acknowledgment was added):');
  console.log(`     Expected : ${mailsAtRaise} ack mails (same as at raise)`);
  console.log(`     Actual   : ${mailsAfterRoundTrip}`);
  console.log(`     Result   : ${noRepeat ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  const overallPass = hasAckMail && noRepeat;
  console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - The acknowledgment is sent once and never repeats`);
  expect(hasAckMail, 'exactly one mail queue entry with acknowledgment text should exist after raising the request').toBe(true);
  expect(noRepeat, `the mail queue entry count after the round trip should equal the count at raise (was ${mailsAtRaise}, now ${mailsAfterRoundTrip})`).toBe(true);
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
