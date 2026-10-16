import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users, baseUrl } from '@config/users.config';
import { HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';
import {
  createPresalesOpportunityAsThomas, openSETicketFromHelpdesk, presalesRunId, printVerify, raiseSERequestFromOpportunity,
  signInAs, verifyCaption, VerifyLine,
} from '@helpers/uc-presales-7x.helper';

/**
 * ============================================================================================
 *  pre-sale-7.12.1.1 - After cut-over, pre-cut-over requests remain readable in the current system
 *                      by salespeople and SEs, and a request open at cut-over can be worked to
 *                      closure there.
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:     pre-sale-7.12.1.1
 *  Jira:             CRM-12229
 *  Automation-Type:  new
 *  Automation-Date:  2026-10-15
 *  Run as:           Salesperson Thomas Semerich (steps 2-3), Sales Engineer Nick Luchkov (steps 4-5) -
 *                    on PRE-PRODUCTION (the CURRENT system)
 *  Source manual TC: CRM-12229 (Xray Manual Steps, 5 steps)
 *  Source version:   updated 2026-09-18T10:25:58+0300 - re-check before trusting this spec
 *  Xray path:        /CRM test/CRM module/Pre-sales SE support/7.12 Data, history & cut-over
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    An open SE request (High, In Progress, typed, with a note) is found and read in the CURRENT
 *    Helpdesk by Thomas, then Nick adds a note and closes it there (close date stamped).
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.12\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (same order, same content):
 *
 *  Pre-condition 1:
 *    (Run this as POST-CUT-OVER validation.)
 *    Before cut-over, a request exists in the CURRENT Odoo 12 EE Helpdesk (Sales Engineers team) with:
 *      - Subject      = Pre-cutover deployment <unique>
 *      - Ticket Type  = Deployment / POC session      (pre-production label: SE: Deployment session)
 *      - Priority     = High
 *      - Stage        = In Progress (i.e. OPEN at cut-over)
 *      - A log note   : "Created pre-cut-over"
 *    Cut-over to the new Pre-Sales application has since completed.
 *      Built here: Thomas raises it from "SE Pre-cutover <unique>"; Nick assigns it, types it, sets
 *      High, moves it to In Progress and logs the note.
 *
 *  Steps to reproduce:
 *    1. [Manual - post-cut-over; run after the new app is live]        Expected: (EMPTY in Jira)
 *    2. Log in as the Salesperson; open the CURRENT Helpdesk and search "Pre-cutover deployment <unique>".
 *                                                                      Expected: (EMPTY in Jira)
 *    3. Open the request; verify all original data is readable.        Expected: (EMPTY in Jira)
 *    4. Log in as Nick Luchkov; open the same request.                 Expected: (EMPTY in Jira)
 *    5. Add a log note "Continuing post-cut-over"; move Stage to "Closed".
 *         Expected: [Manual - post-cut-over]
 *                   1-2. The request is found and readable in the CURRENT system; all original data
 *                   (Subject, Description, Stage, notes, Ticket Type, Priority, Owner) is intact (assert).
 *                   4. The note is added and the request moves to Closed (close date stamped) - worked
 *                   to closure in the CURRENT system.
 *
 *  BLOCKED (manual only): the cut-over itself has not happened on pre-production - this run proves the
 *    CURRENT-system half (readable by the Salesperson and the SE, workable to closure), which is what a
 *    post-cut-over run re-checks. Step 1 is printed, not executed.
 *  Salesperson path on pre-production: Helpdesk > All Tickets (Thomas has no Sales Engineers card).
 */

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: A request exists in the CURRENT Helpdesk (Sales Engineers): Subject = "Pre-cutover deployment <unique>", Ticket Type = SE: Deployment session, Priority = High, Stage = In Progress, log note "Created pre-cut-over"',
  s1: 'Step 1: [MANUAL ONLY - post-cut-over; the cut-over has not happened on pre-production] Run after the new app is live',
  s2: 'Step 2: Log in as the Salesperson; open the CURRENT Helpdesk (Helpdesk > All Tickets) and search "Pre-cutover deployment <unique>"',
  s3: 'Step 3: Open the request; verify all original data is readable',
  s4: 'Step 4: Log in as Nick Luchkov; open the same request',
  s5: 'Step 5: Add a log note "Continuing post-cut-over"; move Stage to "Closed"',
  verify: 'Verification',
} as const;

const TC = 'pre-sale-7.12.1.1';
const TYPE = 'SE: Deployment session';
const DESCRIPTION = 'Pre-cutover deployment request';
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

test.describe(`${TC} - Pre-cut-over requests readable and closable in the current system`, () => {
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

  test(`${TC}: After cut-over, pre-cut-over requests remain readable in the current system by salespeople and SEs, and a request open at cut-over can be worked to closure there.`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.seMeetingTest);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdesk = new HelpdeskPage(page);
    const unique = presalesRunId();
    const subject = `Pre-cutover deployment ${unique}`;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      createdOppUrl = await createPresalesOpportunityAsThomas(page, { oppName: `SE Pre-cutover ${unique}`, companyName: `Test Co ${unique}`, expectedRevenue: '5000' });
      createdTicketSubject = subject;
      await raiseSERequestFromOpportunity(page, createdOppUrl, { subject, description: DESCRIPTION, supportType: 'Online deployment session' });
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
      await helpdesk.clickAssignToMe();
      await helpdesk.reloadTicket();
      await helpdesk.clickEditTicket();
      await helpdesk.setClassificationTicketType(TYPE);
      await helpdesk.setPriority('High');
      expect(await helpdesk.clickSaveTicket(), 'Pre-condition 1: type + priority should save').toBeTruthy();
      const stage = await helpdesk.moveTicketToStage('In Progress');
      await helpdesk.postLogNote('Created pre-cut-over');
      console.log('  Request prepared:');
      console.log(`    - Subject     = ${subject}`);
      console.log(`    - Ticket Type = ${await helpdesk.getTicketType()}`);
      console.log(`    - Priority    = ${await helpdesk.getPriorityLabel()}`);
      console.log(`    - Stage       = ${stage}`);
      console.log('    - Log note    = Created pre-cut-over');
      expect(stage, 'Pre-condition 1: the request should be In Progress').toBe('In Progress');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - open request prepared').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  - Not executable on pre-production: there is no cut-over. The remaining steps exercise the CURRENT system.');
    });

    let found = 0;
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await signInAs(page, users.sale_ic_thomas, 'Salesperson Thomas Semerich');
      await new HomePage(page).waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await helpdesk.openAllTicketsListDirect(baseUrl);
      await helpdesk.searchTicket(subject);
      found = await helpdesk.countTicketRows(subject);
      console.log(`  - Rows found by the Salesperson : ${found}`);
    });

    const read = { subject: '', description: '', stage: '', note: false, type: '', priority: '', owner: '' };
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      if (found) await helpdesk.openTicket(subject);
      read.subject = await helpdesk.getTicketSubject();
      read.stage = await helpdesk.getStageName();
      read.type = await helpdesk.getTicketType();
      read.priority = await helpdesk.getPriorityLabel();
      read.owner = await helpdesk.getAssignedTo();
      read.note = (await helpdesk.getChatterThread()).some((m) => m.body.includes('Created pre-cut-over'));
      await helpdesk.openTicketTab('Description');
      read.description = await helpdesk.getFieldValueByName('description');
      Object.entries(read).forEach(([k, v]) => console.log(`  - ${k.padEnd(11)} = ${v}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - read by the Salesperson').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await signInAs(page, users.pre_sales_engineer, 'Sales Engineer Nick Luchkov');
      await openSETicketFromHelpdesk(page, subject);
    });

    let stageAfter = '';
    let closeDate = '';
    let noteAdded = false;
    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await helpdesk.postLogNote('Continuing post-cut-over');
      stageAfter = await helpdesk.moveTicketToStage('Closed');
      closeDate = await helpdesk.getCloseDate();
      noteAdded = (await helpdesk.getChatterThread()).some((m) => m.body.includes('Continuing post-cut-over'));
      console.log(`  - Note added  : ${noteAdded}`);
      console.log(`  - Stage       : ${stageAfter}`);
      console.log(`  - Close date  : ${closeDate || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - worked to closure').catch(() => {});
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const lines: VerifyLine[] = [
        { what: 'Found by the Salesperson in the CURRENT Helpdesk', expected: '1 row', actual: `${found}`, pass: found === 1 },
        { what: 'Subject intact', expected: subject, actual: read.subject, pass: read.subject === subject },
        { what: 'Description intact', expected: DESCRIPTION, actual: read.description || '(empty)', pass: read.description.includes(DESCRIPTION) },
        { what: 'Stage intact', expected: 'In Progress', actual: read.stage, pass: read.stage === 'In Progress' },
        { what: 'Note intact', expected: '"Created pre-cut-over" in the thread', actual: read.note ? 'present' : 'ABSENT', pass: read.note },
        { what: 'Ticket Type intact', expected: TYPE, actual: read.type || '(empty)', pass: read.type === TYPE },
        { what: 'Priority intact', expected: 'High', actual: read.priority, pass: read.priority === 'High' },
        { what: 'Owner intact', expected: 'Nick Luchkov', actual: read.owner || '(empty)', pass: read.owner === 'Nick Luchkov' },
        { what: 'SE adds the note', expected: '"Continuing post-cut-over" in the thread', actual: noteAdded ? 'present' : 'ABSENT', pass: noteAdded },
        { what: 'SE closes it in the CURRENT system', expected: 'Closed', actual: stageAfter, pass: stageAfter === 'Closed' },
        { what: 'Close date stamped', expected: 'a date', actual: closeDate || '(empty)', pass: closeDate !== '' },
      ];
      const ok = printVerify(lines, 'the open request is readable in the current system and is worked to closure there');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - closed in the current system`, passed: ok, highlight: ['.o_statusbar_status', "[name='close_date']"], lines: verifyCaption(lines) }).catch(() => {});
      expect(ok, 'every current-system check').toBeTruthy();
    });
  });
});
