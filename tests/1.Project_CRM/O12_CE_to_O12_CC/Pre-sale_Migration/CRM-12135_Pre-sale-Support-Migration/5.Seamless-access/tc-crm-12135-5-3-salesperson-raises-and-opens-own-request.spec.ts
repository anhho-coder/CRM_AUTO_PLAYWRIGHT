import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_5.3 - A salesperson creates an Opportunity, raises a request and opens it from Tickets
 * ============================================================================================
 * Test Case ID   : CRM-12135_5.3
 * Jira           : none yet (feature CRM-12135)
 * Requirements   : FUNC-0063, FUNC-0064
 * Run as         : Salesperson Thomas Semerich (thomas.semerich@nakivo.com), for EVERY step
 * Automation-Type: new
 * Automation-Date: 2026-10-16
 * Source TC      : NONE in Xray yet - scenario 1 given by the tester (anh.ho) on 2026-10-16:
 *                  "Thomas tao Opp, request pre-sales ticket va click vao Ticket do".
 *                  OVERLAPS CRM-12135_5.1 since 5.1 was re-synced to its 2026-10-14 TC: there too Thomas
 *                  now creates, raises and opens. This case adds the Salesperson, N + 1 and request-id
 *                  checks; keeping or dropping it is the tester's call.
 * Source version : n/a - pin the Xray key and its `updated` stamp here once the manual TC exists
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video.
 *
 * Summary
 * -------
 *   Thomas Semerich creates his own Opportunity, raises a Request SE support ticket on it and clicks
 *   the Tickets smart button; the request must open inside the CRM page with no second sign-in.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_5\.3:" --project=O12
 *
 * Source manual TC (as given by the tester, written out step by step)
 * --------------------------------------------------------------------
 *   Pre-condition(s):
 *      1. On the CRM (crm-mig) sign in as the salesperson Thomas Semerich.
 *
 *   Steps to reproduce:
 *      1. On the CRM open CRM (left sidebar) > Pipeline, switch to LIST view (in kanban CREATE opens
 *         a quick-create card without Expected Revenue Deal), click CREATE, enter the Opportunity
 *         and SAVE:
 *            - Opportunity name      = AUTO-CRM-12135-TC-5-3-<runId>
 *            - Expected Revenue Deal = 900   (the raise control needs >= $100)
 *            - Email / Contact       = blank (an e-mail starts an async Company/Contact creation
 *                                      whose partners the marker sweep cannot find)
 *            - Salesperson           = left at its default, the signed-in user
 *         Expected: the Opportunity is saved (a record id appears in the URL) and its Salesperson
 *         reads "Thomas Semerich". Note the number on the Tickets smart button as N (hidden = 0).
 *      2. On that Opportunity click "Request SE support" (under More when the header row is full),
 *         fill the dialog and SAVE:
 *            - Subject      = AUTO-CRM-12135-TC-5-3-<runId> request
 *            - Meeting Time = blank
 *            - Description  = Automated check of CRM-12135_5.3 - Thomas raises and opens his own request.
 *            - Meeting link = blank
 *            - Support type = Offline technical assistance
 *         Expected: the dialog closes, and exactly one request is linked to the Opportunity.
 *      3. Refresh the Opportunity and click the Tickets smart button to open that request.
 *         Expected: the Tickets smart button shows N + 1; the Pre-Sales Application opens inside the
 *         CRM page with no login form, showing the request whose Subject reads
 *         "AUTO-CRM-12135-TC-5-3-<runId> request" - the request raised in step 2.
 *
 * Browsers
 * --------
 *   Thomas's steps run in the `page` fixture. The API cross-check in Verification opens an
 *   administrator session in a context of its own, inside that step: a Pre-Sales cookie for another
 *   account in Thomas's browser would be the two-accounts case of CRM-13517, which this case is not about.
 *
 * Data
 * ----
 *   Every record is named AUTO-CRM-12135-TC-5-3-<runId> and removed in afterEach by an administrator
 *   session (Thomas may not delete a crm.lead), on a passing, failing or timed-out run.
 *   SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_5.3';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: On the CRM (crm-mig) sign in as the salesperson Thomas Semerich',
  s1:     'Step 1: On the CRM open CRM (left sidebar) > Pipeline, switch to LIST view (in kanban CREATE opens a quick-create card without Expected Revenue Deal), click CREATE, enter the Opportunity and SAVE',
  s2:     'Step 2: On that Opportunity click "Request SE support" (under More when the header row is full), fill the dialog and SAVE',
  s3:     'Step 3: Refresh the Opportunity and click the Tickets smart button to open that request',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

test.describe(`${TC} - A salesperson creates an Opportunity, raises a request and opens it from Tickets`, () => {
  test.afterEach(async ({ page, browser }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (!runMarker) {
      console.log('  TEARDOWN: nothing was created');
    } else if (SKIP_CLEANUP) {
      console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${runMarker}`);
    } else {
      // An administrator session of its own: Thomas may not delete a crm.lead.
      const swept = await MigPreSalePage.sweepLeftovers(browser, runMarker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    }
    runMarker = '';
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: A salesperson creates an Opportunity, raises a request and opens it from Tickets`, async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - A salesperson creates an Opportunity, raises a request and opens it from Tickets ==========`);

    const runId = MigPreSalePage.runId();
    const marker = MigPreSalePage.marker('TC-5-3', runId);
    const subject = `${marker} request`;
    const description = `Automated check of ${TC} - Thomas raises and opens his own request.`;
    const thomasUi = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let leadId = 0;
    let saveErrorDialog = '';
    let salesperson = '';
    let baselineN = 0;
    let ticketsAfter = 0;
    let dialogStillOpen = true;
    let loginFormVisible = true;
    let embedded = { id: 0, subject: '', url: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.sale_ic_thomas_crm_mig.username, users.sale_ic_thomas_crm_mig.password);
      console.log(`  Account : ${users.sale_ic_thomas_crm_mig.username} (${users.sale_ic_thomas_crm_mig.displayName})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Thomas signed in on the CRM');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await thomasUi.openPipelineListFromSidebar();
      console.log(`  Pipeline list : ${page.url()}`);
      await opportunityPage.clickCreate();
      runMarker = marker;
      console.log(`  - Opportunity name      : ${marker}`);
      console.log(`  - Expected Revenue Deal : ${EXPECTED_REVENUE}`);
      console.log('  - Email / Contact       : blank');
      console.log('  - Salesperson           : default (the signed-in user)');
      await opportunityPage.fillOpportunityName(marker);
      await opportunityPage.fillExpectedRevenueDeal(String(EXPECTED_REVENUE));
      await opportunityPage.saveAndWaitForCompletion();
      leadId = Number(await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage));
      salesperson = await thomasUi.opportunitySalesperson();
      baselineN = await thomasUi.isTicketsStatVisible() ? await thomasUi.ticketsStatCount() : 0;
      // Observation, not scored: an "Odoo Server Error - Missing Record" (mail.followers) dialog has
      // stood over the form after this SAVE on every run since 2026-10-16. The scenario gives no expectation.
      saveErrorDialog = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long)
        ? await opportunityPage.waitForServerErrorDialog(CommonUtils.waitTimes.standard) : '';
      console.log(`  Opportunity id  : ${leadId}`);
      console.log(`  Opportunity URL : ${MigPreSalePage.opportunityUrl(leadId)}`);
      console.log(`  Salesperson     : ${salesperson}`);
      console.log(`  Tickets button  : N = ${baselineN} (hidden = 0)`);
      console.log(`  Observation (not scored) - error dialog after SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - Opportunity saved by Thomas');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await thomasUi.openOpportunity(leadId);
      await thomasUi.openRaiseDialog();
      console.log(`  - Subject      : ${subject}`);
      console.log('  - Meeting Time : blank');
      console.log(`  - Description  : ${description}`);
      console.log('  - Meeting link : blank');
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await thomasUi.fillRaiseDialog({ subject, description, supportType: SUPPORT_TYPE });
      await thomasUi.saveRaiseDialog();
      await thomasUi.waitForRaiseDialogClosed();
      dialogStillOpen = await thomasUi.isRaiseDialogOpen();
      console.log(`  Dialog still open after SAVE : ${dialogStillOpen}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 2 - request raised by Thomas');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await thomasUi.openOpportunity(leadId);
      ticketsAfter = await thomasUi.isTicketsStatVisible() ? await thomasUi.ticketsStatCount() : 0;
      console.log(`  Tickets button after refresh : ${ticketsAfter}`);
      await thomasUi.openTicketsPanel();
      console.log('  Clicked Tickets button');
      // 90 s: the embed is a second web client booting inside an iframe.
      embedded = await thomasUi.waitForEmbeddedRequestForm(90000);
      loginFormVisible = await thomasUi.embeddedLoginFormVisible(5000);
      console.log(`  Embedded frame URL      : ${embedded.url}`);
      console.log(`  Embedded request id     : ${embedded.id}`);
      console.log(`  Embedded request Subject: ${embedded.subject}`);
      console.log(`  Sign-in form visible    : ${loginFormVisible}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 3 - request opened inside the CRM');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      // [INTERNAL check, Call API] which requests the Pre-Sales Application links to this Opportunity -
      // read by an administrator session in a context of its own, never from Thomas's browser.
      const admin = await MigPreSalePage.openAdminSession(browser);
      let raisedIds: number[] = [];
      try {
        raisedIds = (await admin.preSale.requestsForLead(leadId)).map((r) => r.id);
      } finally {
        await admin.context.close().catch(() => {});
      }
      console.log(`  Requests linked to Opportunity ${leadId} (API): [${raisedIds.join(', ')}]`);

      const ok1 = leadId > 0 && salesperson === users.sale_ic_thomas_crm_mig.displayName;
      const ok2 = !dialogStillOpen && raisedIds.length === 1;
      const ok3 = ticketsAfter === baselineN + 1;
      const ok4 = !loginFormVisible;
      const ok5 = embedded.subject === subject;
      const ok6 = raisedIds.length === 1 && embedded.id === raisedIds[0];
      const lines = [
        'Verify #1 - The Opportunity was created by Thomas:',
        `   Expected : saved (id > 0) with Salesperson = ${users.sale_ic_thomas_crm_mig.displayName}`,
        `   Actual   : id ${leadId}, Salesperson = ${salesperson || '(empty)'}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        'Verify #2 - The raise dialog closed and created exactly one request on the Opportunity:',
        '   Expected : dialog closed, 1 linked request',
        `   Actual   : dialog ${dialogStillOpen ? 'STILL OPEN' : 'closed'}, ${raisedIds.length} linked request(s)`,
        `   Result   : ${ok2 ? 'PASS' : 'FAIL'}`,
        'Verify #3 - The Tickets smart button counts the new request:',
        `   Expected : N + 1 = ${baselineN + 1}`,
        `   Actual   : ${ticketsAfter}`,
        `   Result   : ${ok3 ? 'PASS' : 'FAIL'}`,
        'Verify #4 - No second sign-in inside the CRM page:',
        '   Expected : no login form in the embed (a form here is the "second login" FUNC-0064 forbids)',
        `   Actual   : ${loginFormVisible ? 'login form VISIBLE' : 'no login form'}`,
        `   Result   : ${ok4 ? 'PASS' : 'FAIL'}`,
        'Verify #5 - The embed shows the request by its Subject, verbatim:',
        `   Expected : ${subject}`,
        `   Actual   : ${embedded.subject || '(no request form rendered in the embed)'}`,
        `   Result   : ${ok5 ? 'PASS' : 'FAIL'}`,
        'Verify #6 - The request in the embed IS the one raised in step 2:',
        `   Expected : embedded id = linked request id ${raisedIds[0] ?? '(none)'}`,
        `   Actual   : embedded id = ${embedded.id || '(none)'}`,
        `   Result   : ${ok6 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && ok2 && ok3 && ok4 && ok5 && ok6;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log(`  Observation (not scored) - error dialog after the Opportunity SAVE : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - Thomas ${passed ? 'opened his own request inside the CRM with no second sign-in' : 'did NOT reach his own request as specified'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - request opened inside the CRM`,
        passed,
        highlight: ['iframe'],
        lines,
      }).catch(() => {});

      expect(leadId, 'the Opportunity must be saved (a record id in the URL)').toBeGreaterThan(0);
      expect(salesperson, 'the Opportunity must belong to Thomas, who created it').toBe(users.sale_ic_thomas_crm_mig.displayName);
      expect(dialogStillOpen, 'the raise dialog must close after SAVE').toBe(false);
      expect(raisedIds.length, 'exactly one request must be linked to the Opportunity').toBe(1);
      expect(ticketsAfter, 'the Tickets smart button must show N + 1').toBe(baselineN + 1);
      expect(loginFormVisible, 'the embedded helpdesk must not ask Thomas to sign in again').toBe(false);
      expect(embedded.subject, 'the embed must show the request by its Subject, verbatim').toBe(subject);
      expect(embedded.id, 'the request in the embed must be the one raised in step 2').toBe(raisedIds[0]);
    });
  });
});
