import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_1.8 - Creating a request while the Pre-Sales Application is unreachable shows a clear error and leaves nothing behind
 * ============================================================================================
 * Test Case ID   : CRM-12135_1.8
 * Jira           : CRM-12135
 * Requirements   : REL-0001
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-24
 * Evidence       : screenshots of error dialog, chatter verification, email list verification
 *
 * Summary
 * -------
 *    When the Pre-Sales Application becomes unreachable during a request raise, the CRM
 *   displays a clear error message and does not leave any artifacts (request, note, session,
 *   or email). This test verifies the error handling and cleanup are correct. Requires Dev to
 *   break the CRM-to-helpdesk connection before the test runs, and restore it afterwards.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-08:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12923 (updated by Thuat Phung 2026-09-24)
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig
 *      2. The Pre-Sales Application is currently UNREACHABLE (requires Dev intervention)
 *      3. An Opportunity exists to raise a request from
 *
 *   Steps to reproduce:
 *      1. On the CRM (crm-mig.nakivo.site) open Settings > Technical > Email > Emails,
 *         search Subject = New SE meeting request, and note the number of mails as N.
 *      2. From the Opportunity, click "Request SE support", fill the dialog and click Save:
 *         Subject      = AUTO-CRM-12135-TC-08-<runId>-fail
 *         Description  = Automated check of CRM-12135 TC-08.
 *         Support type = Offline technical assistance
 *      3. Click Ok, click Cancel on the New Ticket dialog, then refresh the Opportunity.
 *      4. Go back to the Emails list from step 1 and search again.
 *      5. After the development team has restored the Pre-Sales Application, log in there
 *         as QA SE User (qa.se.user@nakivo.com), open Tickets and search
 *         AUTO-CRM-12135-TC-08-<runId>-fail.
 *
 *   Verification (expected results):
 *      1. N is recorded.
 *      2. An error dialog says "The pre-sale helpdesk could not be reached, so the request
 *         was not sent. Nothing was saved — try again, and tell IT if it keeps failing."
 *         with a technical detail line.
 *      3. No Tickets smart button, and no log note carrying AUTO-CRM-12135-TC-08-<runId>-fail
 *         in the chatter.
 *      4. Still N mails.
 *      5. No request is found.
 *
 * Data
 * ----
 * RE-SYNC GAP (CRM-12923, 2026-09-24): The test requires the Pre-Sales Application to be
 * unreachable. This can only be controlled by Dev. An automated test cannot break a network
 * connection. The rest of the flow (error dialog, verification of no artifacts) can be
 * automated once the connection is broken by Dev. The test awaits Dev to restore connectivity
 * before verifying step 5.
 *
 * RE-SYNC GAP (CRM-12923, 2026-09-24): Verifying email count requires a method to read
 * the CRM's email list and search by subject - this is available via readKw but the current
 * page object MigPreSalePage does not expose it. The test body will read emails via the API.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig',
  pre2:   'Pre-condition 2: The Pre-Sales Application is currently UNREACHABLE (requires Dev intervention)',
  pre3:   'Pre-condition 3: Create an Opportunity named AUTO-CRM-12135-TC-08-<runId>-fail-opp with Expected Revenue Deal = $750 (above the $100 gate)',
  s1:     'Step 1: Record the baseline email count with subject "New SE meeting request"',
  s2:     'Step 2: From the Opportunity, attempt to create a request while Pre-Sales Application is unreachable',
  s3:     'Step 3: Verify the error dialog, close it, and check Opportunity has no artifacts',
  s4:     'Step 4: Verify the email count is unchanged',
  s5:     'Step 5: After restoration, verify no request exists on Pre-Sales Application',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_1.8 - A submission that fails leaves no request, note, session or mail', () => {
  test.afterEach(async ({ browser }, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      // The test left the try block without cleaning up - a TIMEOUT skips finally. Sweep from here
      // on a fresh session instead of only reporting it; a timeout used to leave records behind.
      console.log('TEARDOWN DID NOT RUN in the test body - sweeping from afterEach on a fresh session.');
      const swept = await MigPreSalePage.sweepLeftovers(browser);
      console.log(`  afterEach SWEEP: removed requests [${swept.requests.join(', ')}] and `
        + `opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
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

  test('CRM-12135_1.8: Creating a request while the Pre-Sales Application is unreachable shows a clear error and leaves nothing behind', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // ---------------------------------------------------------------------------------------------
    // NOT AUTOMATABLE - skipped on purpose, with its reason. Do not turn this back into a thrown
    // error: in the HTML report a thrown BLOCKED is indistinguishable from a real regression, and a
    // reader cannot tell "we never ran this" from "the product broke".
    //
    // The case needs the CRM-to-helpdesk link to be DOWN while a request is raised, then restored.
    // The tester reproduced it by setting an invalid port on the endpoint - the evidence screenshot
    // on CRM-12923 shows the resulting error, "Port out of range 0-65535".
    //
    // Automation could issue that write. It must not:
    //   - crm-mig is a SHARED QA environment. While the test ran, pre-sales raising would be broken
    //     for everyone else on the server.
    //   - If the test died before restoring the parameter, the breakage would persist until somebody
    //     noticed. That is not hypothetical here: a Playwright test TIMEOUT skips the finally block,
    //     which is exactly how this suite left records behind on 2026-09-24.
    // So the blocker is blast radius on a shared server, not a missing capability.
    //
    // To run it: a developer takes the link down, runs this case manually, and restores it.
    // To automate it: give QA a disposable environment, or a supported switch that fails the call
    // without touching shared configuration.
    // ---------------------------------------------------------------------------------------------
    // 2026-10-07: Nathan Do (CRM-12456 comment 703900) answered that he takes the CRM-to-Pre-Sales
    // connection setting down himself for an agreed window, and asked for this case to stay
    // PERMANENTLY MANUAL. It therefore still skips by default - the body below only tells the truth
    // while that window is open, and would fail misleadingly at any other time.
    // During an agreed window, run it with PRESALE_OUTAGE_WINDOW=1 to confirm the behaviour.
    test.skip(!process.env.PRESALE_OUTAGE_WINDOW,
      'MANUAL BY DESIGN (CRM-12923) - needs the CRM-to-helpdesk link down, which only Dev takes down '
      + 'and restores; doing it from a test would break pre-sales raising for every other user of '
      + 'crm-mig, and a test timeout would leave it broken. During an agreed outage window, re-run '
      + 'with PRESALE_OUTAGE_WINDOW=1.');
    console.log('========== CRM-12135_1.8 - Creating a request while Pre-Sales Application is unreachable ==========');

    // recordVideo must be passed HERE. The `video: 'on'` in playwright.config.ts only reaches
    // contexts Playwright creates itself (the `page` / `context` fixtures); a context built by hand
    // with browser.newContext() ignores it, which is why none of the 30 specs in this suite has ever
    // produced a video while the Exchange-rate specs - which use the fixture - all do.
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      recordVideo: { dir: testInfo.outputDir, size: { width: 1920, height: 1080 } },
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);
      // The Pre-Sales Application itself stays up during the window - what Dev takes down is the
      // CRM's connection setting to it - so a direct session is still possible, and step 5 needs one
      // to ask whether a request was created. Without it that check can only report SKIPPED.
      const presalesUid = await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

      let emailCountBefore = -1;
      let emailCountAfter = -1;
      let errorDialogSeen = false;
      let noTicketsButtonAfter = false;
      let noChatterNoteFound = false;
      let leadId = 0;
      let marker = '';
      let alertMessage = '';
      let ticketsCountAfter = 0;
      let requestsOnPresales = 0;

      const runId = MigPreSalePage.runId();
      const testSubject = `AUTO-CRM-12135-TC-08-${runId}-fail`;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log('  Logged in to CRM as Salesperson admin_crm_mig');
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        console.log('  CRITICAL: This test requires Dev to have broken the CRM-to-helpdesk connection');
        console.log('  before this step runs. Without it, the request will succeed and the test will fail.');
        console.log('  The test proceeds assuming the connection is broken.');
      });

      await test.step(STEP.pre3, async () => {
        console.log(`\n--- ${STEP.pre3} ---`);
        marker = MigPreSalePage.marker('TC-08', runId);
        teardown = async () => {
          if (SKIP_CLEANUP) {
            console.log(`  SKIP_CLEANUP_PRESALE=true - leaving ${marker} in place`);
            return;
          }
          const swept = await preSale.sweepByMarker(marker);
          console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and `
            + `opportunities [${swept.opportunities.join(', ')}]`
            + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
        };
        leadId = await preSale.createOpportunity(`${marker}-fail-opp`, 750);
        console.log(`  Opportunity ${leadId} created at $750 (gate is $100)`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        const mailsBefore = await preSale.mailsOnCrmBySubject('New SE meeting request', 500);
        emailCountBefore = mailsBefore.length;
        console.log(`  Email baseline count: ${emailCountBefore}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await preSale.openOpportunity(leadId);
        await preSale.openRaiseDialog();
        await preSale.fillRaiseDialog({
          subject: testSubject,
          description: 'Automated check of CRM-12135 TC-08.',
          supportType: 'Offline technical assistance',
        });
        console.log(`    Subject      = ${testSubject}`);
        console.log(`    Description  = Automated check of CRM-12135 TC-08.`);
        console.log(`    Support type = Offline technical assistance`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo,
          'Step 2: New Ticket dialog filled, before Save');
        // The save is EXPECTED to fail while the link is down. saveRaiseDialog may itself reject
        // when the dialog does not close - that is the behaviour under test, not an error here.
        await preSale.saveRaiseDialog().catch((err) => {
          console.log(`  Save did not complete normally: ${(err as Error).message.split('\n')[0]}`);
        });
        alertMessage = await preSale.alertText().catch(() => '');
        errorDialogSeen = alertMessage.trim().length > 0;
        console.log(`  Error dialog text: ${errorDialogSeen ? JSON.stringify(alertMessage) : '(no dialog)'}`);
        // Taken BEFORE the alert is dismissed in step 3 - this is the evidence the case exists for.
        await CommonUtils.captureAndAttachScreenshot(page, testInfo,
          'Step 2: The error dialog raised by the failed save');
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await preSale.dismissAlert().catch(() => {});
        if (await preSale.isRaiseDialogOpen()) {
          await preSale.cancelRaiseDialog().catch(() => {});
        }
        await preSale.openOpportunity(leadId);
        const ticketsVisible = await preSale.isTicketsStatVisible();
        ticketsCountAfter = ticketsVisible ? await preSale.ticketsStatCount() : 0;
        noTicketsButtonAfter = !ticketsVisible || ticketsCountAfter === 0;
        console.log(`  Tickets smart button visible: ${ticketsVisible}, count: ${ticketsCountAfter}`);

        const notes = await preSale.logNotesForLead(leadId);
        const matching = notes.filter((n) => n.includes(testSubject));
        noChatterNoteFound = matching.length === 0;
        console.log(`  Chatter notes on the Opportunity: ${notes.length}, naming this subject: ${matching.length}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo,
          'Step 3: Opportunity after the failed attempt - no Tickets count, no note');
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const mailsAfter = await preSale.mailsOnCrmBySubject('New SE meeting request', 500);
        emailCountAfter = mailsAfter.length;
        console.log(`  Email count after the failed attempt: ${emailCountAfter} (baseline ${emailCountBefore})`);
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        // The Pre-Sales Application itself stays up during the window - what Dev takes down is the
        // CRM's connection setting to it - so the suite's own direct session can still be asked
        // whether the request exists. If it cannot answer, the count stays -1 and Verify #5 reports
        // SKIPPED rather than passing on an unanswered question.
        try {
          const found = await preSale.requestsByMarker(marker);
          requestsOnPresales = found.length;
          console.log(`  Requests on the Pre-Sales Application matching ${marker}: ${requestsOnPresales}`);
        } catch (err) {
          requestsOnPresales = -1;
          console.log(`  Could not query the Pre-Sales Application: ${(err as Error).message.split('\n')[0]}`);
        }
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const emailsMatch = emailCountBefore >= 0 && emailCountAfter === emailCountBefore;
        const noRequestLeft = requestsOnPresales === 0;
        const presalesAnswered = requestsOnPresales >= 0;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The save is refused with the pre-sale helpdesk error, not a raw server error:');
        console.log(`     Expected : a dialog naming the pre-sale helpdesk`);
        console.log(`     Actual   : ${errorDialogSeen ? JSON.stringify(alertMessage) : '(no dialog appeared)'}`);
        console.log(`     Result   : ${errorDialogSeen ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The Opportunity gained no Tickets count:');
        console.log(`     Expected : no Tickets smart button, or a count of 0`);
        console.log(`     Actual   : count ${ticketsCountAfter}`);
        console.log(`     Result   : ${noTicketsButtonAfter ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - No chatter log note names the attempted request:');
        console.log(`     Expected : 0 notes containing ${testSubject}`);
        console.log(`     Actual   : ${noChatterNoteFound ? 0 : 'at least 1'}`);
        console.log(`     Result   : ${noChatterNoteFound ? 'PASS' : 'FAIL'}`);
        console.log('Verify #4 - The CRM mail queue gained no row:');
        console.log(`     Expected : ${emailCountBefore}`);
        console.log(`     Actual   : ${emailCountAfter}`);
        console.log(`     Result   : ${emailsMatch ? 'PASS' : 'FAIL'}`);
        console.log('Verify #5 - No request was created on the Pre-Sales Application:');
        console.log(`     Expected : 0 requests matching ${marker}`);
        console.log(`     Actual   : ${presalesAnswered ? requestsOnPresales : 'not answered'}`);
        console.log(`     Result   : ${!presalesAnswered ? 'SKIPPED - the Pre-Sales Application did not answer' : (noRequestLeft ? 'PASS' : 'FAIL')}`);
        console.log('===============================================');
        console.log(`OVERALL: ${errorDialogSeen && noTicketsButtonAfter && noChatterNoteFound && emailsMatch && (!presalesAnswered || noRequestLeft) ? 'PASS' : 'FAIL'}`
          + ' - a submission that fails leaves no request, note, session or mail');

        expect(errorDialogSeen, 'the failed save should raise a dialog, not pass silently').toBe(true);
        expect(alertMessage.toLowerCase(), 'the dialog should name the pre-sale helpdesk')
          .toContain('pre-sale helpdesk');
        expect(noTicketsButtonAfter, 'the Opportunity should gain no Tickets count').toBe(true);
        expect(noChatterNoteFound, 'the chatter should carry no note for the attempted request').toBe(true);
        expect(emailCountAfter, 'the CRM mail queue should be unchanged').toBe(emailCountBefore);
        if (presalesAnswered) {
          expect(requestsOnPresales, 'no request should exist on the Pre-Sales Application').toBe(0);
        }
      });
    } finally {
      // Evidence FIRST, while the page is still alive. afterEach runs after this block, so its two
      // screenshots could only ever find a closed page - that is why every run of this suite logged
      // "Screenshot skipped ... has been closed" twice and produced no afterEach evidence at all.
      // A thrown assertion also passes through finally, so a red run is captured the same way.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Final state before teardown')
        .catch(() => {});

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

      // The Video handle must be taken BEFORE close; the file is only written on close, and
      // path() resolves once it is. A hand-made context does not attach it to the report either,
      // so attach it explicitly.
      const video = page.video();
      await context.close();
      if (video) {
        try {
          await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' });
          console.log('🎥 Video attached');
        } catch (err) {
          console.log(`Video not attached: ${(err as Error).message.split('\n')[0]}`);
        }
      }
      // afterEach must not chase a page this block has just closed.
      sharedPage = undefined;
    }
  });
});
