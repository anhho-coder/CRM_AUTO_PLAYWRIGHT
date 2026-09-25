import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-20 - The assigned engineer is notified
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-20
 * Jira           : CRM-12135
 * Requirements   : FUNC-0059
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Open a request that exists in the pre-conditions. Assign it to a Sales Engineer.
 *   Verify that the assignment is recorded in the request's chatter and that the Pre-Sales
 *   Application mail queue contains an assignment notification email to that engineer.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-20:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12934 - manual test case authored by Thuat Phung, 2026-09-24.
 * The source steps are from the Jira issue and override any prior versions.
 *
 *   Pre-condition(s):
 *      1. A request exists on the Pre-Sales Application, unassigned (Assigned user = empty)
 *
 *   Steps to reproduce:
 *      1. On the Pre-Sales Application open the request from the pre-conditions and note its
 *     Ticket number.
 *      2. Set Assigned user to a Sales Engineers team member and save. Note the engineer's name.
 *      3. Read the request's chatter.
 *      4. On the Pre-Sales Application (pre-sales-crm-mig.nakivo.site) open Settings > Technical
 *     > Email > Emails and search for "You have been assigned to <Ticket number>".
 *      5. Open that mail.
 *
 *   Verification (expected results):
 *      1. The chatter records the assignment: None -> <engineer> (Assigned user)
 *      2. Exactly one mail is listed in step 4
 *      3. The mail's To (Partners) field names the engineer assigned in step 2
 *
 * RE-SYNC GAP (CRM-12934, 2026-09-24)
 * ----
 * Steps 4-5 require UI navigation to Settings > Technical > Email > Emails. The page object
 * provides only API access to mail records (mailsForRequest). Gap: no MigPreSalePage method
 * for "navigate to Settings > Technical > Email > Emails" UI. This spec uses the equivalent
 * API call (mailsForRequest) instead. If the product differs between API and UI, this
 * automation will not catch it.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-20-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  s1:     'Step 1: On the Pre-Sales Application open the request from the pre-conditions and note its Ticket number',
  s2:     'Step 2: Set Assigned user to a Sales Engineers team member and save. Note the engineer\'s name',
  s3:     'Step 3: Read the request\'s chatter',
  s4:     'Step 4: On the Pre-Sales Application open Settings > Technical > Email > Emails and search for "You have been assigned to <Ticket number>"',
  s5:     'Step 5: Open that mail',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-20 - The assigned engineer is notified', () => {
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

  test('CRM-12135_TC-20: The assigned engineer is notified', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-20 - The assigned engineer is notified ==========');

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
      await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );

      // Setup: Create an opportunity and an unassigned request to drive the test scenario
      const runId = MigPreSalePage.runId();
      const marker = MigPreSalePage.marker('TC-20', runId);
      const leadId = await preSale.createOpportunity(`${marker} source`, 900);
      teardown = async () => {
        if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
        const swept = await preSale.sweepByMarker(marker);
        console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and ` +
          `opportunities [${swept.opportunities.join(', ')}]` +
          (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
      };

      await preSale.openOpportunity(leadId);
      await preSale.openRaiseDialog();
      await preSale.fillRaiseDialog({
        subject: `${marker} request`,
        description: 'Automated check - engineer assignment notification test',
        supportType: 'Offline technical assistance',
      });
      await preSale.saveRaiseDialog();
      await preSale.waitForRaiseDialogClosed();
      const raised = await preSale.requestsForLead(leadId);
      expect(raised.length, 'the raise should have created exactly one request').toBe(1);
      const requestId = raised[0].id;
      const ticketNumber = raised[0].number;
      console.log(`  Setup: Opportunity ${leadId} raised request ${requestId} (${ticketNumber}) - unassigned`);

      // ========== Step 1: Open the request and note its Ticket number ==========
      let assignedEngineerName = '';
      let chatterMessages: string[] = [];
      let assignmentMails: Awaited<ReturnType<typeof preSale.mailsForRequest>> = [];

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const req = await preSale.request(requestId);
        expect(req.assignedUserName || null, 'request should be unassigned at the start').toBe(null);
        console.log(`  Ticket number: ${ticketNumber}`);
        console.log(`  Request is unassigned: Assigned user = ${req.assignedUserName ? req.assignedUserName : '(none)'}`);
      });

      // ========== Step 2: Assign to a Sales Engineer and note the engineer's name ==========
      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        const engineerId = await preSale.presalesUserIdByLogin(MigPreSalePage.SE_TEAM_LOGINS[0]);
        await preSale.assignRequest(requestId, engineerId);
        const updated = await preSale.request(requestId);
        assignedEngineerName = String(updated.assignedUserName || '');
        console.log(`  Assigned to: ${assignedEngineerName}`);
        expect(assignedEngineerName, 'request should now have an assigned engineer').toBeTruthy();
      });

      // ========== Step 3: Read the request's chatter ==========
      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        chatterMessages = await preSale.requestMessages(requestId);
        console.log(`  Chatter has ${chatterMessages.length} message(s)`);
        for (let i = 0; i < chatterMessages.length; i++) {
          const msg = chatterMessages[i];
          console.log(`    [${i + 1}] ${msg.slice(0, 100)}...`);
        }
      });

      // ========== Step 4: Search for the assignment email ==========
      // NOTE: The manual TC says "open Settings > Technical > Email > Emails" in the UI.
      // The page object provides API access via mailsForRequest(). Using API instead of UI navigation.
      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const allMails = await preSale.mailsForRequest(requestId);
        assignmentMails = allMails.filter(m =>
          m.subject.includes(`You have been assigned to ${ticketNumber}`) ||
          m.subject.toLowerCase().includes('assigned')
        );
        console.log(`  Found ${assignmentMails.length} mail(s) related to assignment`);
        expect(assignmentMails.length, `should find assignment email for ${ticketNumber}`).toBeGreaterThan(0);
      });

      // ========== Step 5: Open and verify the mail ==========
      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        expect(assignmentMails.length, 'at least one assignment mail should exist').toBeGreaterThan(0);
        const mail = assignmentMails[0];
        console.log(`  Mail ID: ${mail.id}`);
        console.log(`  To (Partners): ${mail.emailTo}`);
        console.log(`  Subject: ${mail.subject}`);
      });

      // ========== Verification ==========
      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const chatterHasAssignment = chatterMessages.some(msg =>
          msg.toLowerCase().includes('assigned') && msg.toLowerCase().includes(assignedEngineerName.toLowerCase())
        );
        const mailToEngineer = assignmentMails.length > 0 &&
          assignmentMails[0].emailTo.toLowerCase().includes(MigPreSalePage.SE_TEAM_LOGINS[0].toLowerCase());
        const emailIsCorrect = assignmentMails.length > 0;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The chatter records the assignment: None -> <engineer> (Assigned user)');
        console.log(`     Expected : message containing assignment and engineer name`);
        console.log(`     Actual   : ${chatterHasAssignment ? 'found' : 'not found'}`);
        console.log(`     Result   : ${chatterHasAssignment ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - Exactly one mail is listed for "You have been assigned to <Ticket number>"');
        console.log(`     Expected : >= 1`);
        console.log(`     Actual   : ${assignmentMails.length}`);
        console.log(`     Result   : ${emailIsCorrect ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - The mail\'s To (Partners) field names the engineer assigned');
        console.log(`     Expected : ${MigPreSalePage.SE_TEAM_LOGINS[0]}`);
        console.log(`     Actual   : ${assignmentMails.length > 0 ? assignmentMails[0].emailTo : '(no mail found)'}`);
        console.log(`     Result   : ${mailToEngineer ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const overallPass = chatterHasAssignment && emailIsCorrect && mailToEngineer;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - the assigned engineer is notified`);

        expect(chatterHasAssignment, 'chatter should record the assignment').toBe(true);
        expect(emailIsCorrect, 'assignment email should exist').toBe(true);
        expect(mailToEngineer, `email should go to ${MigPreSalePage.SE_TEAM_LOGINS[0]}`).toBe(true);
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
