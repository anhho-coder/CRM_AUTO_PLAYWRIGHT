import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  signInAs, verifyCaption, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.9.1.1 - System blocks moving a request to Closed state if the Ticket Type field is
 *                     not filled
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.9.1.1
 *  Jira:             CRM-12219
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Sales Engineer Nick Luchkov (users.pre_sales_engineer); the pre-condition request
 *                    is raised by the Salesperson Thomas Semerich - on PRE-PRODUCTION
 *  Source manual TC: CRM-12219 (Xray Manual Steps, 3 steps)
 *  Source version:   updated 2026-09-18T10:24:21+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.9 Lifecycle, status & priority
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Nick takes the request, empties its Ticket Type and clicks Closed: the move is refused with the
 *    "Classification" message and the Stage stays where it was.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.9\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    Log in as a Salesperson - Thomas Semerich; create an Opportunity ("SE No-Type <unique>", Company
 *    "Test Co <unique>", Country United States, Expected Revenue 5000); Save.
 *  Pre-condition 2:
 *    Raise a request: "Request SE Support" -> Subject = "No type close <unique>", Description =
 *    "verify type gate", Support type = "Online technical assistance" -> Tab -> SAVE.
 *  Pre-condition 3:
 *    Log in as the Sales Engineer - Nick Luchkov; open the request and click "Assign To Me".
 *    (done by step 1)
 *
 *  Steps to reproduce:
 *    1. Log in as Nick Luchkov; open the request "No type close <unique>" and click "Assign To Me".
 *         Expected: (EMPTY in Jira - the spec confirms Assigned to = Nick Luchkov)
 *    2. Ensure Ticket Type is empty.
 *         Expected: (EMPTY in Jira) - on pre-production "Assign To Me" AUTO-FILLS Ticket Type from the
 *         Support type ("SE: Tech Assistance"), so the spec empties it (EDIT > Ticket Type = empty >
 *         SAVE) and confirms it reads empty.
 *    3. Move Stage to "Closed".
 *         Expected: The close is REJECTED (assert): a validation error is shown and Stage does NOT
 *                   become "Closed" (stays as before) - a Ticket Type is required to close.
 *
 *  Pre-production refusal (verbatim, pinned 2026-10-15 - Jira proposal: quote it in step 3):
 *    dialog "Odoo Server Error - Warning":
 *    Please fill in next to close the ticket: - "Classification" group
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Log in as the Salesperson Thomas Semerich; create an Opportunity (Name, Company, Country = United States, Expected Revenue = 5000) and Save',
  pre2: 'Pre-condition 2: Raise a request from the Opportunity: Subject = "No type close <unique>", Description = "verify type gate", Support type = "Online technical assistance" -> Tab -> SAVE',
  s1: 'Step 1: Log in as Nick Luchkov; open the request "No type close <unique>" (Helpdesk > Sales Engineers > Tickets) and click "Assign To Me"',
  s2: 'Step 2: Ensure Ticket Type is empty (EDIT > Ticket Type = empty > SAVE - Assign To Me auto-fills it on pre-production)',
  s3: 'Step 3: Move Stage to "Closed"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.9.1.1';
const EXPECTED_MESSAGE = 'Please fill in next to close the ticket: - "Classification" group';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Closing is blocked while the Ticket Type is empty`, () => {
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

  test(`${TC}: System blocks moving a request to Closed state if the Ticket Type field is not filled`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `No type close ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE No-Type ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Opportunity created').catch(() => {});
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl as string, { subject, description: 'verify type gate', supportType: 'Online technical assistance' });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - request raised').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      await helpdesk.reloadTicket();
      const owner = await helpdesk.getAssignedTo();
      console.log(`  - Assigned to : ${owner}`);
      console.log(`  - Ticket Type : ${await helpdesk.getTicketType()} (auto-filled by Assign To Me)`);
      expect(owner, 'Step 1: Assign To Me should set Assigned to = Nick Luchkov').toBe('Nick Luchkov');
    });

    let stageBefore = '';
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdesk.clickEditTicket();
      await helpdesk.setClassificationTicketType('');
      const saved = await helpdesk.clickSaveTicket();
      await helpdesk.reloadTicket();
      const type = await helpdesk.getTicketType();
      stageBefore = await helpdesk.getStageName();
      console.log(`  - Saved               : ${saved}`);
      console.log(`  - Ticket Type now     : ${type || 'empty'}`);
      console.log(`  - Stage before close  : ${stageBefore}`);
      expect(type, 'Step 2: Ticket Type must be empty before the close attempt').toBe('');
    });

    let dialog = '';
    let stageAfter = '';
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      dialog = await helpdesk.clickStageExpectingRefusal('Closed');
      console.log(`  - Dialog shown : ${dialog || '(none)'}`);
      const lines: VerifyLine[] = [
        { what: 'The close is refused with the product message', expected: EXPECTED_MESSAGE, actual: dialog || '(no dialog)', pass: dialog.includes(EXPECTED_MESSAGE) },
      ];
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - close refused`,
        passed: lines[0].pass,
        highlight: ['div.modal.show .modal-content', "select[name='classification_ticket_type'], [name='classification_ticket_type']"],
        lines: verifyCaption(lines),
      }).catch(() => {});
      await helpdesk.closeShownDialog();
      await helpdesk.discardTicketEdits();
      await helpdesk.reloadTicket();
      stageAfter = await helpdesk.getStageName();
      console.log(`  - Stage after reload : ${stageAfter}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - close refused').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'A validation error is shown (verbatim)', expected: EXPECTED_MESSAGE, actual: dialog || '(no dialog)', pass: dialog.includes(EXPECTED_MESSAGE) },
        { what: 'Stage does NOT become Closed', expected: `${stageBefore} (unchanged; Closed = the gate let an untyped request close)`, actual: stageAfter, pass: stageAfter === stageBefore && stageAfter !== 'Closed' },
      ];
      printVerify(lines, 'closing without a Ticket Type is refused and the Stage is unchanged');
      expect(dialog, 'the refusal message').toContain(EXPECTED_MESSAGE);
      expect(stageAfter, 'Stage after the refused close').toBe(stageBefore);
      expect(stageAfter, 'Stage must not be Closed').not.toBe('Closed');
    });
  });
});
