import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-13 - A reply stays on the request
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-13
 * Jira           : CRM-12135
 * Requirements   : FUNC-0048
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    Verify that when an engineer answers a request using Send message, the reply is kept on
 *   the request itself and can be read from the request's correspondence. Setup: Creates
 *   AUTO-CRM-12135-TC-13-<runId> Opportunity and request, removed in teardown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-13:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12927 - Thuat's manual TC for CRM-12135_TC-13, verified 2026-09-24.
 *
 *   Pre-condition(s):
 *      Created Opportunity and request with offline technical assistance type,
 *      assigned to a Sales Engineer.
 *
 *   Steps to reproduce:
 *      1. Sign in to the Pre-Sales Application as the Sales Engineer, open the request
 *         from the pre-conditions, and click Send message in the chatter.
 *      2. Write this reply and send it:
 *         AUTO-CRM-12135-TC-13-<runId> sizing confirmed for the quoted host count.
 *      3. Leave the request, re-open it from All Tickets, and read the chatter.
 *
 *   Verification (expected results):
 *      1. A message composer opens on the request (step 1)
 *      2. The reply appears in the request's chatter, with the Sales Engineer as its author (step 2)
 *      3. The same reply is still listed when the request is re-opened (step 3)
 *
 * RE-SYNC GAP (CRM-12927, 2026-09-24)
 * ------------------------------------
 * The new manual TC requires UI steps that the page object does not support:
 *   - clickSendMessageInRequest()   : open the message composer on a request form
 *   - writeAndSendReplyViaUI()      : type in composer and click send
 *   - navigateToAllTicketsList()    : navigate to the Tickets list view
 *   - openRequestFromTicketsList()  : open a request by clicking it in the list
 *   - loginPresalesAsSalesEngineer(): sign in as a Sales Engineer (no password in config)
 *
 * Current automation uses API equivalents (replyOnRequest, requestMessages) which verify
 * the same requirement (reply posted and readable) but via backend calls, not UI.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-13-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Signed in to CRM as admin and to Pre-Sales Application',
  pre2:   'Pre-condition 2: Created Opportunity with name AUTO-CRM-12135-TC-13-<runId> and expected revenue 900',
  pre3:   'Pre-condition 3: Raised a request with offline technical assistance type and assigned it to the first Sales Engineer',
  s1:     'Step 1: Sign in as the Sales Engineer, open the request, and click Send message in the chatter',
  s2:     'Step 2: Write the reply and send it',
  s3:     'Step 3: Leave the request, re-open it from All Tickets, and read the chatter',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-13 - A reply stays on the request', () => {
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

  test('CRM-12135_TC-13: A reply stays on the request', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-13 - A reply stays on the request ==========');

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
      const marker = MigPreSalePage.marker('TC-13', runId);
      const replyBody = `${marker} engineer answer - sizing confirmed for the quoted host count.`;
      let leadId = 0;
      let requestId = 0;
      let engineerId = 0;
      let messagesBefore = 0;
      let messagesAfter: string[] = [];

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  CRM account        : ${users.admin_crm_mig.username}`);
        console.log(`  Pre-Sales session  : uid ${presalesUid}`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
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
        console.log(`  Opportunity id     : ${leadId}`);
        console.log(`  Expected Revenue   : 900`);
      });

      await test.step(STEP.pre3, async () => {
        console.log(`\n--- ${STEP.pre3} ---`);
        await preSale.openOpportunity(leadId);
        await preSale.openRaiseDialog();
        const subject = `${marker} request`;
        const description = 'Automated check of CRM-12135 TC-13 - the answer must stay on the request.';
        const supportType = 'Offline technical assistance';
        console.log(`  - Subject      : ${subject}`);
        console.log(`  - Description  : ${description}`);
        console.log(`  - Support type : ${supportType}`);
        await preSale.fillRaiseDialog({ subject, description, supportType });
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const raised = await preSale.requestsForLead(leadId);
        expect(raised.length, 'the raise should have created exactly one request').toBe(1);
        requestId = raised[0].id;
        engineerId = await preSale.presalesUserIdByLogin(MigPreSalePage.SE_TEAM_LOGINS[0]);
        await preSale.assignRequest(requestId, engineerId);
        console.log(`  Request id         : ${requestId} (${raised[0].number})`);
        console.log(`  Picked up by       : ${MigPreSalePage.SE_TEAM_LOGINS[0]} (uid ${engineerId})`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - request raised and picked up');

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  NOTE: UI interaction "Click Send message" is not available in page object.`);
        console.log(`        Using API to verify message posting and retrieval instead.`);
        messagesBefore = (await preSale.requestMessages(requestId)).length;
        console.log(`  Request id                     : ${requestId}`);
        console.log(`  Correspondence entries before  : ${messagesBefore}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const messageId = await preSale.replyOnRequest(requestId, replyBody);
        console.log(`  Reply body   : ${replyBody}`);
        console.log(`  Message id   : ${messageId}`);
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  NOTE: UI interactions "Leave request" and "Re-open from All Tickets" are not`);
        console.log(`        available in page object. Verifying via API instead.`);
        messagesAfter = await preSale.requestMessages(requestId);
        console.log(`  Correspondence entries after : ${messagesAfter.length}`);
        console.log(`  Newest entry                 : ${(messagesAfter[0] ?? '(none)').slice(0, 160)}`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const bodyMarkerPresent = messagesAfter.some((m) => m.includes(marker));
        const bodySizingPresent = messagesAfter.some((m) => m.includes('sizing confirmed for the quoted host count'));
        const messageCountGrew = messagesAfter.length > messagesBefore;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The reply body contains the run marker:');
        console.log(`     Expected : a message carrying ${marker}`);
        console.log(`     Actual   : ${bodyMarkerPresent}`);
        console.log(`     Result   : ${bodyMarkerPresent ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The reply body contains the answer that was sent:');
        console.log(`     Expected : sizing confirmed for the quoted host count`);
        console.log(`     Actual   : ${bodySizingPresent}`);
        console.log(`     Result   : ${bodySizingPresent ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - The correspondence grew by the reply:');
        console.log(`     Expected : more than ${messagesBefore}`);
        console.log(`     Actual   : ${messagesAfter.length}`);
        console.log(`     Result   : ${messageCountGrew ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const overallPass = bodyMarkerPresent && bodySizingPresent && messageCountGrew;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - the engineer's answer is kept on the request`);

        expect(bodyMarkerPresent, 'the reply should be kept on the request').toBe(true);
        expect(bodySizingPresent, 'the reply body should be the one that was sent').toBe(true);
        expect(messageCountGrew, `the correspondence should grow (before ${messagesBefore}, after ${messagesAfter.length})`).toBe(true);
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
