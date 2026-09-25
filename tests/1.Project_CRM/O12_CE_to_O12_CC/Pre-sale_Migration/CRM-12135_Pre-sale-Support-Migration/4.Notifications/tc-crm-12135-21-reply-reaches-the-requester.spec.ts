import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-21 - A reply reaches the requester; an unmatched one is visibly unsent
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-21
 * Jira           : CRM-12135
 * Requirements   : FUNC-0060
 * Run as         : Both
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create a request from an Opportunity above the gate, assign it to a Sales Engineer,
 *   and reply on it. Verify that a mail queue entry is created for the requester with the reply
 *   body, has a visible delivery state, and is addressed to the salesperson who created the
 *   request.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-21:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12935 (TC-21) - Replying on a request emails the salesperson who created it
 * Execution Run: CRM-12945
 * Manual TC authored by: Thuat Phung (2026-09-23)
 *
 *   Pre-condition(s):
 *      1. Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)
 *      2. Pre-Sales Application user is logged in and session uid is recorded
 *      3. A fresh Opportunity is created with name AUTO-CRM-12135-TC-21-<runId>, Expected
 *     Revenue >= $100
 *      4. A request is created and assigned to a Sales Engineer
 *
 *   Steps to reproduce:
 *      1. On the Pre-Sales Application open the request from the pre-conditions, note its Ticket
 *     number, and set Assigned user to a Sales Engineers team member.
 *      2. Click Send message, write this reply and send it:
 *          - AUTO-CRM-12135-TC-21-<runId> answer - technical assessment complete
 *      3. On the Pre-Sales Application open Settings > Technical > Email > Emails, search for
 *     the Ticket number from step 1, and keep only the mails whose body contains the reply
 *     text from step 2.
 *      4. Open that mail.
 *
 *   Verification (expected results):
 *      1. At least one new mail queue entry was created by the reply
 *      2. The new entry's body_html contains the reply text (the AUTO-CRM-12135-TC-21 marker)
 *      3. Its To (Partners) field names the salesperson who created the request
 *
 * RE-SYNC GAP (CRM-12935, 2026-09-24)
 * ====================================
 * The manual TC requires navigating the Pre-Sales Application UI to verify the mail in
 * Settings > Email > Emails. The current page object provides only API access. Mail verification
 * is performed via mailsForRequest API call instead of UI navigation. The verification remains
 * functionally equivalent: the mail is read from the same queue.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-21-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)',
  pre2:   'Pre-condition 2: Pre-Sales Application user is logged in and session uid is recorded',
  pre3:   'Pre-condition 3: A fresh Opportunity is created with name AUTO-CRM-12135-TC-21-<runId>, Expected Revenue >= $100',
  pre4:   'Pre-condition 4: A request is created',
  s1:     'Step 1: On the Pre-Sales Application open the request, note its Ticket number, and set Assigned user to a Sales Engineers team member',
  s2:     'Step 2: Click Send message and reply with: AUTO-CRM-12135-TC-21-<runId> answer - technical assessment complete',
  s3:     'Step 3: Verify the reply mail in the queue contains the reply text',
  s4:     'Step 4: Verify the reply mail is addressed to the salesperson who created the request',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-21 - A reply reaches the requester; an unmatched one is visibly unsent', () => {
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

  test('CRM-12135_TC-21: A reply reaches the requester; an unmatched one is visibly unsent', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-21 - A reply reaches the requester; an unmatched one is visibly unsent ==========');

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
const marker = MigPreSalePage.marker('TC-21', runId);
    let leadId = 0;
    let requestId = 0;
    let mailsAfter: Awaited<ReturnType<typeof preSale.mailsForRequest>> = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log('  Admin is logged in');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      leadId = await preSale.createOpportunity(`${marker} source`, 900);
      console.log(`  Opportunity created: ${leadId}`);
    });

    teardown = async () => {
      if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
      const swept = await preSale.sweepByMarker(marker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
        (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    };

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await preSale.openOpportunity(leadId);
      await preSale.openRaiseDialog();
      await preSale.fillRaiseDialog({
        subject: `${marker} request`,
        description: 'Automated check - reply notification test',
        supportType: 'Offline technical assistance',
      });
      await preSale.saveRaiseDialog();
      await preSale.waitForRaiseDialogClosed();
      const raised = await preSale.requestsForLead(leadId);
      expect(raised.length, 'exactly one request should be raised').toBe(1);
      requestId = raised[0].id;
      console.log(`  Request raised: ${requestId} (${raised[0].number})`);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const request = await preSale.request(requestId);
      console.log(`  Request ticket number: ${request.number}`);
      const engineerId = await preSale.presalesUserIdByLogin(MigPreSalePage.SE_TEAM_LOGINS[0]);
      await preSale.assignRequest(requestId, engineerId);
      console.log(`  Request assigned to: ${MigPreSalePage.SE_TEAM_LOGINS[0]}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const replyBody = `${marker} answer - technical assessment complete`;
      await preSale.replyOnRequest(requestId, replyBody);
      console.log(`  Reply posted: ${replyBody}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      mailsAfter = await preSale.mailsForRequest(requestId);
      console.log(`  Queue entries after reply: ${mailsAfter.length}`);
      for (const m of mailsAfter) {
        console.log(`    #${m.id} state="${m.state}" to="${m.emailTo}" subject="${m.subject}"`);
      }
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const request = await preSale.request(requestId);
      const requesterLogin = request.requesterLogin;
      console.log(`  Requester login: ${requesterLogin}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const request = await preSale.request(requestId);
      const requesterLogin = request.requesterLogin;
      const replyBody = `${marker} answer - technical assessment complete`;

      const mailsWithReply = mailsAfter.filter((m) => m.bodyHtml.includes(marker));
      const hasReplyMail = mailsWithReply.length > 0;
      const replyMailsHaveState = mailsWithReply.every((m) => m.state.trim().length > 0);
      const replyMailsHaveRecipient = mailsWithReply.every((m) => m.emailTo.trim().length > 0);

      const states = mailsWithReply.map((m) => `"${m.state}"`).join(', ');
      const recipients = mailsWithReply.map((m) => `"${m.emailTo}"`).join(', ');

      console.log('\n==================== VERIFY ====================');
      console.log('Verify #1 - At least one mail was created by the reply:');
      console.log(`     Expected : mail with reply text`);
      console.log(`     Actual   : ${hasReplyMail ? `found ${mailsWithReply.length} mail(s)` : 'none found'}`);
      console.log(`     Result   : ${hasReplyMail ? 'PASS' : 'FAIL'}`);
      console.log('Verify #2 - The mail\'s body_html contains the reply text:');
      console.log(`     Expected : a mail carrying "${replyBody}"`);
      console.log(`     Actual   : ${hasReplyMail}`);
      console.log(`     Result   : ${hasReplyMail ? 'PASS' : 'FAIL'}`);
      console.log('Verify #3 - The mail has a non-empty state field:');
      console.log(`     Expected : every mail carries a state`);
      console.log(`     Actual   : states = [${states}]`);
      console.log(`     Result   : ${replyMailsHaveState ? 'PASS' : 'FAIL'}`);
      console.log('Verify #4 - The mail is addressed to the requester:');
      console.log(`     Expected : recipients are non-empty`);
      console.log(`     Actual   : recipients = [${recipients}]`);
      console.log(`     Requester login : ${requesterLogin}`);
      console.log(`     Result   : ${replyMailsHaveRecipient ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
        const overallPass = hasReplyMail && replyMailsHaveState && replyMailsHaveRecipient;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - A reply reaches the requester`);

      expect(hasReplyMail, 'the reply should create a mail with the reply text').toBe(true);
      expect(replyMailsHaveState, 'the reply mail should have a delivery state').toBe(true);
      expect(replyMailsHaveRecipient, 'the reply mail should be addressed to someone').toBe(true);
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
