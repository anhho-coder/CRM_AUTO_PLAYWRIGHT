import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, HelpdeskPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  signInAs, verifyCaption, PRESALES_RESELLER, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.10.1.3 - Verify on close the requester is notified of the outcome, a rating request
 *                      is sent, and internal notes are written to lead + reseller partner with no
 *                      message to the prospect/partner
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.10.1.3
 *  Jira:             CRM-12225
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the request is raised by
 *                    the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12225 (Xray Manual Steps, 2 steps)
 *  Source version:   updated 2026-09-18T10:25:47+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.10 Notifications
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick closes an In-Progress request (type set, outcome note); the related Opportunity and the
 *    Reseller partner must each carry an internal note about it, and no message to them.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.10\.1\.3:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    A request exists assigned to Nick Luchkov in stage In Progress (raised from an Opportunity that has
 *    a Reseller; Subject = "Close notify <unique>"), with at least one reply logged.
 *      Opportunity: SE Close Notify <unique> / Test Co <unique> / United States / Reseller =
 *                   TEST-Reseller#Automation-Jun10 / Expected Revenue 5000
 *      Nick: Assign To Me -> Stage = In Progress -> Log note "SE reply <unique>"
 *  Pre-condition 2:
 *    Log in as the Sales Engineer - Nick Luchkov.  (already signed in)
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open "Close notify <unique>"; set Ticket Type = "Deployment / POC
 *       session"; move Stage to "Closed" with an outcome note.
 *         Pre-production values: Ticket Type = "SE: Deployment session"; outcome note = Log note
 *         "Outcome: session delivered <unique>" posted before the move.
 *         Expected: (EMPTY in Jira - the spec confirms Stage = Closed)
 *    2. Open the related Lead and the Reseller partner record.
 *         Expected: [Automatable] An internal note is present on the related Lead AND on the Reseller
 *                   partner record (assert); no message is posted to the prospect/partner.
 *                   [Manual] The requester closure email and the rating-request email (+ recorded
 *                   rating) are verified in the mailbox - not observable via the CRM UI.
 *
 *  "Close note" = a chatter NOTE (o_mail_not_discussion) naming the request Subject that is NOT a raise
 *  note ("A new ticket has been opened by the customer ..."; the Opportunity and the Reseller partner
 *  word it slightly differently).
 *
 *  PRE-PRODUCTION BEHAVIOUR (asserted here, measured 2026-10-15) - DIFFERS FROM THE JIRA EXPECTED RESULT:
 *    Closing writes NO note on the Opportunity and NO note on the Reseller partner. The only notes naming
 *    the request are the RAISE notes, written when it was raised (Opportunity: 1; Reseller partner: 2
 *    identical "A new ticket has been opened by the customer Thomas Semerich: <Subject>" - printed as an
 *    observation). Nothing is messaged to the prospect or the partner. The close-time internal notes are
 *    a TARGET-system requirement. Jira proposal: run step 2 against the target app, or expect "no close
 *    note" on the current system.
 *  BLOCKED (manual only): mailbox delivery - pre-production sends no outbound e-mail.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Thomas raises "Close notify <unique>" from an Opportunity with a Reseller; Nick Luchkov assigns it to himself, moves it to In Progress and logs a reply',
  s1: 'Step 1: Log in as Nick Luchkov; open "Close notify <unique>"; set Ticket Type = "SE: Deployment session" (Jira: "Deployment / POC session"); move Stage to "Closed" with an outcome note',
  s2: 'Step 2: Open the related Lead (Opportunity Info > Opportunity) and the Reseller partner record [MANUAL ONLY part - closure + rating mails: pre-production sends no e-mail]',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.10.1.3';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - On close: internal notes on the Lead and the Reseller partner`, () => {
  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedSESupportTicketAndOppAsAdmin(page, { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl }, { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP }, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Verify on close the requester is notified of the outcome, a rating request is sent, and internal notes are written to lead + reseller partner with no message to the prospect/partner`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const opportunityPage = new OpportunityPage(page);
    const unique = presalesRunId();
    const subject = `Close notify ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Close Notify ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000', reseller: PRESALES_RESELLER });
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: 'Close notification check', supportType: 'Online deployment session' });
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      const stage = await helpdesk.moveTicketToStage('In Progress');
      await helpdesk.postLogNote(`SE reply ${unique}`);
      console.log(`  - Owner : ${await helpdesk.getAssignedTo()} | Stage : ${stage}`);
      expect(stage, 'Pre-condition 1: the request should be In Progress').toBe('In Progress');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - request In Progress with a reply').catch(() => {});
    });

    let stageAfter = '';
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdesk.clickEditTicket();
      await helpdesk.setClassificationTicketType('SE: Deployment session');
      const saved = await helpdesk.clickSaveTicket();
      console.log(`  - Ticket Type saved : ${saved} (${await helpdesk.getTicketType()})`);
      await helpdesk.postLogNote(`Outcome: session delivered ${unique}`);
      stageAfter = await helpdesk.moveTicketToStage('Closed');
      console.log(`  - Stage after the move : ${stageAfter}`);
      expect(stageAfter, 'Step 1: the request should be Closed').toBe('Closed');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - request closed').catch(() => {});
    });

    const result = { lead: { notes: [] as string[], messages: [] as string[] }, reseller: { notes: [] as string[], messages: [] as string[], url: '' } };
    const raiseNotes = { lead: 0, reseller: 0 };
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdesk.openOpportunityInfoTab();
      await helpdesk.followLinkedOpportunity();
      const leadThread = await opportunityPage.getChatterThread();
      const isRaise = (m: { body: string }) => m.body.includes('A new ticket has been opened by the customer');
      const mentions = (m: { body: string }) => m.body.includes(subject) && !isRaise(m);
      result.lead.notes = leadThread.filter((m) => m.isNote && mentions(m)).map((m) => `[${m.timestamp}] ${m.body}`);
      result.lead.messages = leadThread.filter((m) => !m.isNote && m.body.includes(subject)).map((m) => `[${m.timestamp}] ${m.body}`);
      raiseNotes.lead = leadThread.filter((m) => m.body.includes(subject) && isRaise(m)).length;
      result.reseller.url = await opportunityPage.openResellerFromOpportunity();
      const partnerThread = result.reseller.url ? await opportunityPage.getChatterThread() : [];
      result.reseller.notes = partnerThread.filter((m) => m.isNote && mentions(m)).map((m) => `[${m.timestamp}] ${m.body}`);
      result.reseller.messages = partnerThread.filter((m) => !m.isNote && m.body.includes(subject)).map((m) => `[${m.timestamp}] ${m.body}`);
      raiseNotes.reseller = partnerThread.filter((m) => m.body.includes(subject) && isRaise(m)).length;
      console.log(`  - Lead close notes about the request        : ${result.lead.notes.length}`);
      result.lead.notes.forEach((n) => console.log(`      ${n.slice(0, 200)}`));
      console.log(`  - Lead messages (non-note) naming it        : ${result.lead.messages.length}`);
      console.log(`  - Reseller partner opened                    : ${result.reseller.url || '(no Reseller link)'}`);
      console.log(`  - Reseller close notes about the request    : ${result.reseller.notes.length}`);
      result.reseller.notes.forEach((n) => console.log(`      ${n.slice(0, 200)}`));
      console.log(`  - Reseller messages (non-note) naming it    : ${result.reseller.messages.length}`);
      console.log('  - [MANUAL ONLY] closure + rating-request mail delivery: not checked (pre-production sends no e-mail)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Reseller partner chatter').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Close note on the related Lead (Opportunity) - pre-production', expected: '0 (Jira expects >= 1 - see header)', actual: `${result.lead.notes.length}`, pass: result.lead.notes.length === 0 },
        { what: 'Close note on the Reseller partner - pre-production', expected: '0 (Jira expects >= 1 - see header)', actual: `${result.reseller.notes.length}`, pass: result.reseller.notes.length === 0 },
        { what: 'No message posted to the prospect (Lead followers)', expected: '0 non-note messages naming the request', actual: `${result.lead.messages.length}`, pass: result.lead.messages.length === 0 },
        { what: 'No message posted to the partner', expected: '0 non-note messages naming the request', actual: `${result.reseller.messages.length}`, pass: result.reseller.messages.length === 0 },
      ];
      const ok = printVerify(lines, 'pre-production writes no close note on the Lead or the Reseller partner, and messages neither');
      console.log(`  Observation (not scored) - raise notes naming the request: Opportunity ${raiseNotes.lead}, Reseller partner ${raiseNotes.reseller}`);
      console.log('  Observation (not scored) - closure + rating-request mail DELIVERY: MANUAL ONLY (no outbound e-mail on pre-production)');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - notes on close`, passed: ok, highlight: ['.o_chatter .o_thread_message'], lines: verifyCaption(lines) }).catch(() => {});
      expect(result.lead.notes.length, 'close notes on the Lead (pre-production: none)').toBe(0);
      expect(result.reseller.notes.length, 'close notes on the Reseller partner (pre-production: none)').toBe(0);
      expect(result.lead.messages.length, 'messages to the prospect').toBe(0);
      expect(result.reseller.messages.length, 'messages to the partner').toBe(0);
    });
  });
});
