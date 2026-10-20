import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, OpportunityPage, SESupportPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import { createPresalesOpportunityAsThomas, presalesRunId, printVerify, signInAs, verifyCaption, PRESALES_RESELLER, VerifyLine } from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.15.1.1 - When the raise-request action fails mid-submission, the salesperson sees a
 *                      clear error and the partial request plus its queued notifications are removed
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.15.1.1
 *  Jira:             CRM-12234
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (raise), Sales Engineer Nick Luchkov searches the
 *                    Sales Engineers queue in step 4 - on PRE-PRODUCTION
 *  Source manual TC: CRM-12234 (Xray Manual Steps, 4 steps)
 *  Source version:   updated 2026-09-18T10:26:11+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.15 Reliability
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    The ticket-create call of the New Ticket window is answered with HTTP 500; Thomas must see an
 *    error, and afterwards no request "Fail cleanup <unique>" exists and no raise note is on the Opp.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.15\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity:
 *      - Opportunity Name       = SE Fail Cleanup <unique>
 *      - Company                = Test Co <unique>
 *      - Country                = United States
 *      - Reseller               = an existing active Reseller (TEST-Reseller#Automation-Jun10)
 *      - Expected Revenue       = 50000
 *    Save.
 *
 *  Steps to reproduce:
 *    1. In the automation, set up a network-route interception that ABORTS (or returns 500 for)
 *       the request-create call.        Expected: (EMPTY in Jira)
 *       Pre-production: the create call is POST /web/dataset/call_button with method create_ticket
 *       (wizard helpdesk_ticket_crm_lead.new_ticket); only that one request is answered with 500.
 *    2. Open the Opportunity; click "Request SE Support"; fill the window:
 *            Subject      = Fail cleanup <unique>
 *            Meeting Time = left at the window default
 *            Description  = Failure cleanup check
 *            Meeting link = blank
 *            Support type = Online deployment session
 *         Expected: (EMPTY in Jira)
 *    3. Press Tab and click "SAVE" (the intercepted call fails).
 *         Expected: A clear error is shown to the Salesperson (assert error visible).
 *         Pre-production (verbatim, pinned 2026-10-15): the toast "Connection lost Trying to reconnect..."
 *         - the web client's generic network message, not a product message. Jira proposal: decide
 *         whether that counts as "a clear error", and quote it in step 3.
 *    4. Search the Sales Engineers team for "Fail cleanup <unique>".
 *         Expected: NO request exists with Subject "Fail cleanup <unique>" (assert count = 0) and NO
 *                   log note was added to the Opportunity - the partial request + its queued
 *                   notifications are cleaned up.
 *
 *  Email ADDED to the pre-condition (not in Jira). Observed 2026-10-15, cause NOT isolated: in two runs
 *  of an Opportunity with a Reseller and no Email, the "Tickets" smart button stayed hidden although the
 *  raise note was logged; with an Email (customer Company/Contact created) it showed. A run with neither
 *  Reseller nor Email showed it too. Jira proposal: add "Email = test-<unique>@company.com" to the
 *  pre-condition, pending a dev answer on what drives the button.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Email, Country = United States, Reseller = an existing active Reseller, Expected Revenue = 50000) and Save',
  s1: 'Step 1: [INTERNAL check, network route] In the automation, set up a network-route interception that returns 500 for the request-create call',
  s2: 'Step 2: Open the Opportunity; click "Request SE Support"; fill Subject = "Fail cleanup <unique>", Description, Support type = "Online deployment session"',
  s3: 'Step 3: Press Tab and click "SAVE" (the intercepted call fails)',
  s4: 'Step 4: Search the Sales Engineers team (Nick Luchkov > Helpdesk > Sales Engineers > Tickets) for "Fail cleanup <unique>"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.15.1.1';
// Pinned 2026-10-15: with the create call answered 500, the web client shows its generic network toast.
const EXPECTED_ERROR = 'Connection lost Trying to reconnect...';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - A failed raise shows an error and leaves nothing behind`, () => {
  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    await new SESupportPage(page).releaseCreateTicketFailure();
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // The ticket should NOT exist; archive it anyway if the product created it despite the failure.
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl }, { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: When the raise-request action fails mid-submission, the salesperson sees a clear error and the partial request plus its queued notifications are removed`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);
    const helpdesk = new HelpdeskPage(page);
    const homePage = new HomePage(page);
    const unique = presalesRunId();
    const oppName = `SE Fail Cleanup ${unique}`;
    const subject = `Fail cleanup ${unique}`;
    let baselineTickets = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, email: `test-${unique}@company.com`, expectedRevenue: '50000', reseller: PRESALES_RESELLER });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await seSupportPage.failNextCreateTicketCall();
      console.log('  - Route installed : POST /web/dataset/call_button carrying create_ticket -> HTTP 500 (once)');
      console.log('  - Every other request passes through untouched');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      baselineTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Tickets count N (baseline) : ${baselineTickets}`);
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      console.log(`  - Subject      = ${subject}`);
      console.log('  - Meeting Time = left at the window default');
      console.log('  - Description  = Failure cleanup check');
      console.log('  - Meeting link = blank');
      console.log('  - Support type = Online deployment session');
      await seSupportPage.fillSubject(subject);
      await seSupportPage.fillDescription('Failure cleanup check');
      await seSupportPage.selectSupportType('Online deployment session');
    });

    let errorText = '';
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await seSupportPage.clickSaveOnly();
      errorText = await seSupportPage.getErrorDialogText();
      if (!errorText) errorText = await seSupportPage.getWarningToastText();
      console.log(`  - Error shown to the Salesperson : ${errorText || '(nothing)'}`);
      let ok3 = false;
      try {
        expect(errorText, 'Step 3: the error shown to the Salesperson').toContain(EXPECTED_ERROR);
        ok3 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - error on failed raise`,
          passed: ok3,
          highlight: ['div.modal.show .modal-content', 'div.o_notification'],
          lines: [`error: ${(errorText || '(nothing)').slice(0, 140)}`],
        }).catch(() => {});
      }
      await seSupportPage.closeErrorAndCancel();
      await seSupportPage.releaseCreateTicketFailure();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - failed raise').catch(() => {});
    });

    let afterTickets = -1;
    let raiseNote = true;
    let rows = -1;
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      afterTickets = await opportunityPage.getLinkedTicketsCount();
      raiseNote = (await opportunityPage.getChatterLogText()).includes(`A new ticket has been opened by the customer: ${subject}`);
      console.log(`  - Opportunity Tickets count : ${afterTickets}`);
      console.log(`  - Raise note on the Opp     : ${raiseNote ? 'FOUND' : 'absent'}`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await helpdesk.navigateToHelpdesk();
      await helpdesk.openSalesEngineersTickets();
      await helpdesk.switchToListView();
      await helpdesk.searchTicket(subject);
      rows = await helpdesk.countTicketRows(subject);
      // Archive in teardown only if a request survived the failure (it should not).
      if (rows > 0) createdTicketSubject = subject;
      console.log(`  - Sales Engineers rows for "${subject}" : ${rows}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Sales Engineers searched').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'An error is shown to the Salesperson (verbatim)', expected: `${EXPECTED_ERROR} (the client's generic network message - whether it is "clear" is for the TC owner)`, actual: errorText || '(nothing)', pass: errorText.includes(EXPECTED_ERROR) },
        { what: 'No request exists in the Sales Engineers queue', expected: '0 rows (1+ = a partial request survived the failure)', actual: `${rows}`, pass: rows === 0 },
        { what: 'Opportunity Tickets count unchanged', expected: `N = ${baselineTickets}`, actual: `${afterTickets}`, pass: afterTickets === baselineTickets },
        { what: 'No raise log note on the Opportunity', expected: 'absent', actual: raiseNote ? 'FOUND' : 'absent', pass: !raiseNote },
      ];
      const ok = printVerify(lines, 'the failed raise leaves no request and no note behind');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - nothing left behind`, passed: ok, highlight: ['.o_list_view'], lines: verifyCaption(lines) }).catch(() => {});
      expect(errorText, 'the error shown').toContain(EXPECTED_ERROR);
      expect(rows, 'Sales Engineers rows for the failed Subject').toBe(0);
      expect(afterTickets, 'Tickets count must stay N').toBe(baselineTickets);
      expect(raiseNote, 'no raise note on the Opportunity').toBeFalsy();
    });
  });
});
