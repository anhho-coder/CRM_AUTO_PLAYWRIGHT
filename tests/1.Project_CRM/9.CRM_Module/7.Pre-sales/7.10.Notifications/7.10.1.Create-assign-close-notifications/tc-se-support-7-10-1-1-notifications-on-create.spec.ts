import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, presalesRunId, printVerify, raiseSERequestFromOpportunity, verifyCaption, waitForRaiseLogNote,
  PRESALES_RESELLER, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.10.1.1 - Verify the Pre-Sales team intake address and the requester both receive
 *                      notifications on SE Support request creation
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.10.1.1
 *  Jira:             CRM-12223
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (users.sale_ic_thomas) on PRE-PRODUCTION
 *  Source manual TC: CRM-12223 (Xray Manual Steps, 2 steps)
 *  Source version:   updated 2026-09-18T10:25:41+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.10 Notifications
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Thomas raises "Create notify <unique>": the request lands on Sales Engineers, the Opp chatter
 *    logs the raise, and the request carries the acknowledgment addressed to the requester.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.10\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE Notify Create <unique>",
 *    Company "Test Co <unique>", Country United States, Reseller = an existing active Reseller,
 *    Expected Revenue 5000); Save.
 *
 *  Steps to reproduce:
 *    1. Open the Opportunity.                         Expected: (EMPTY in Jira - form-open check only)
 *    2. Click "Request SE Support"; fill the window, press Tab and SAVE:
 *            Subject      = Create notify <unique>
 *            Meeting Time = left at the window default
 *            Description  = Create notification check
 *            Meeting link = blank
 *            Support type = Online deployment session
 *         Expected: [Automatable] A request "Create notify <unique>" is created on the Sales Engineers
 *                   team and the Opportunity chatter shows "A new ticket has been opened by the
 *                   customer: Create notify <unique>" (assert).
 *                   [Manual] Delivery of the team-intake notification and the requester
 *                   acknowledgment email is verified in the mailbox - not observable via the CRM UI.
 *
 *  Pre-production observable added for the requester acknowledgment (Jira proposal):
 *    the request's chatter carries the acknowledgment note addressed to the requester -
 *    "Your request <Subject> has been received and is being reviewed by our Sales Engineers team."
 *  BLOCKED (manual only): mailbox DELIVERY of both mails - pre-production sends no outbound e-mail,
 *    and the Sales Engineers team alias is "Inactive Alias" on pre-production.
 *
 *  Email ADDED to the pre-condition (not in Jira). Observed 2026-10-15, cause NOT isolated: in two runs
 *  of an Opportunity with a Reseller and no Email, the "Tickets" smart button stayed hidden although the
 *  raise note was logged; with an Email (customer Company/Contact created) it showed. A run with neither
 *  Reseller nor Email showed it too. Jira proposal: add "Email = test-<unique>@company.com" to the
 *  pre-condition, pending a dev answer on what drives the button.
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Email, Country = United States, Reseller = an existing active Reseller, Expected Revenue = 5000) and Save',
  s1: 'Step 1: Open the Opportunity',
  s2: 'Step 2: Click "Request SE Support"; fill Subject = "Create notify <unique>", Description, Support type = "Online deployment session"; press Tab and SAVE [MANUAL ONLY part - mailbox delivery: pre-production sends no e-mail]',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.10.1.1';
const TEAM = 'Sales Engineers';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Notifications on SE Support request creation`, () => {
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

  test(`${TC}: Verify the Pre-Sales team intake address and the requester both receive notifications on SE Support request creation`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const oppName = `SE Notify Create ${unique}`;
    const subject = `Create notify ${unique}`;
    const ackText = `Your request ${subject} has been received and is being reviewed by our Sales Engineers team.`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName, companyName: `Test Co ${unique}`, email: `test-${unique}@company.com`, expectedRevenue: '5000', reseller: PRESALES_RESELLER });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const name = await opportunityPage.getOpportunityNameValue();
      console.log(`  - Opportunity form open : ${name}`);
      expect(name, 'Step 1: the Opportunity form should be open').toContain(oppName);
    });

    let note = { found: false, expected: '' };
    let team = '';
    let ackFound = false;
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'Create notification check', supportType: 'Online deployment session' });
      note = await waitForRaiseLogNote(page, createdOppUrl as string, subject);
      const opened = await opportunityPage.openLinkedTickets();
      expect(opened, 'Step 2: the Opportunity "Tickets" smart button should open the raised request').toBeTruthy();
      if (await helpdesk.isTicketVisible(subject)) await helpdesk.openTicket(subject);
      team = await helpdesk.getHelpdeskTeam();
      const thread = await helpdesk.getChatterThread();
      ackFound = thread.some((m) => m.body.includes(ackText));
      console.log(`  - Request team              : ${team}`);
      console.log(`  - Requester acknowledgment  : ${ackFound ? 'FOUND on the request' : 'NOT FOUND'}`);
      console.log('  - [MANUAL ONLY] mailbox delivery of the intake + acknowledgment mails: not checked (pre-production sends no e-mail)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - request raised').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'The request is created on the Sales Engineers team', expected: TEAM, actual: team || '(not found)', pass: team === TEAM },
        { what: 'Opportunity chatter log note', expected: note.expected, actual: note.found ? 'FOUND' : 'NOT FOUND', pass: note.found },
        { what: 'Requester acknowledgment logged on the request (pre-production observable)', expected: ackText, actual: ackFound ? 'FOUND' : 'NOT FOUND', pass: ackFound },
      ];
      const ok = printVerify(lines, 'the request is created and both the raise note and the requester acknowledgment are logged');
      console.log('  Observation (not scored) - team-intake + requester mail DELIVERY: MANUAL ONLY (no outbound e-mail on pre-production)');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - request + acknowledgment`, passed: ok, highlight: ["[name='team_id']", '.o_chatter .o_thread_message'], lines: verifyCaption(lines) }).catch(() => {});
      expect(team, 'Helpdesk Team of the request').toBe(TEAM);
      expect(note.found, 'the Opportunity raise note').toBeTruthy();
      expect(ackFound, 'the requester acknowledgment on the request').toBeTruthy();
    });
  });
});
