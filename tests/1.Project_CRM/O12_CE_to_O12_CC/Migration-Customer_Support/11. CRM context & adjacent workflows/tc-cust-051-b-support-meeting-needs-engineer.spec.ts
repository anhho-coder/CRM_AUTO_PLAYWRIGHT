import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { deleteSupportProbeAsAdmin, SupportProbe } from '@helpers/support-desk-cleanup.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-CUST-051_B - Schedule meeting requires an assigned engineer - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-CUST-051_B   (side A = tc-cust-051-a-preprod-meeting-needs-engineer.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 engineer Nam Pham (HD Agent Support Level = L2
 *                    asserted); teardown as Administrator over the API
 * Data             : one unassigned probe ticket (+ its Contact) per run, DELETED in afterEach
 * Folder           : "11. CRM context & adjacent workflows" = Confluence 231246777 spec area of IS-CRM-FUNC-0289 (author's mapping)
 *
 * Summary: on an unassigned ticket, "Schedule meeting" must be refused with 'Please assign engineer to ticket' and nothing
 * may be created (the meeting form opening behind the message is accepted - tester decision 2026-10-30, below).
 * Command to run: npx playwright test tc-cust-051-b-support --grep "TC-CUST-051_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 381 = row TC-CUST-051 (refs E25, E25-T1, IN-009, AU-031) - 3 steps
 *  Source version   : fingerprint de1b4dc5bb39b677 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "A probe ticket with no assignee. No booking happens in this case.")
 *    1. Logged in as L2 engineer Nam Pham on the Support service
 *    2. One probe ticket with no assignee - CREATED by this run (All Tickets > Create, Raised By = qa.customer.<runId>@example.com,
 *       Subject = QA CUST probe TC-CUST-051_B <runId>, Description, Submit; no assignee asserted)
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Open the probe ticket.
 *    2. Start a support meeting: ... B: click 'Schedule meeting'.
 *    3. Read the message.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    'Please assign engineer to ticket'; the meeting form does not open and nothing is created.
 *
 *  Measured 2026-10-28: the server answers "Please assign engineer to ticket" (meetings.form_defaults, printed as an
 *  [INTERNAL check, Call API] line) - the scored check is that the MESSAGE IS SHOWN, as the B expected says.
 *  UI vs TC (measured 2026-10-28): 'Schedule meeting' is an entry of the ticket header's Actions menu. "Nothing is created" is
 *  read from the same menu's "Meetings (N)" counter before and after (baseline-then-delta, must stay equal).
 *  Measured 2026-10-30: the click opens a "Schedule meeting #N" drawer that EMBEDS the Desk page "New NK Meeting" (Dial
 *  Number, Access Code, Attendees) in a frame; the message is a Desk "Message" dialog drawn over that form, inside the frame.
 *  Tester decision 2026-10-30: the form opening behind the message is ACCEPTED - "the meeting form does not open" (B expected)
 *  is printed as an INFO line, not scored. The scored checks are the message and "nothing is created".
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 end shot; Step 3 verify shots (the message; the Meetings counter);
 * afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-CUST-051_B';
const SOURCE_ROW = 'TC-CUST-051';
const SOURCE_FINGERPRINT = 'de1b4dc5bb39b677';
const SKIP_CLEANUP_TICKETS = false;
const SKIP_CLEANUP_CONTACTS = false;

const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: 'Pre-condition 2: A probe ticket with no assignee - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA CUST probe TC-CUST-051_B <runId>, Description, Submit',
  s1: 'Step 1: Open the probe ticket. (by its link; the Actions menu\'s "Meetings (N)" is noted)',
  s2: "Step 2: Start a support meeting: B: click 'Schedule meeting' (ticket header > Actions > Schedule meeting - measured 2026-10-28)",
  s3: 'Step 3: Read the message. (and the Actions menu\'s "Meetings (N)" again)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const MESSAGE = 'Please assign engineer to ticket';

type Check = { what: string; expected: string; actual: string; passed: boolean };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-left'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - Schedule meeting requires an engineer on the Support service`, () => {
  let probe: SupportProbe | null = null;
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = null;
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe) console.log('  - No probe ticket was created by this run - nothing to clean up');
      else if (SKIP_CLEANUP_TICKETS) console.log(`  - SKIP_CLEANUP_TICKETS = true: kept ${probe.ticketName ?? '?'}`);
      else for (const l of await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.ticketName, subject: probe.subject, contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail })) console.log(`  - ${l}`);
    } catch (e) { cleanupError = e instanceof Error ? e.message : String(e); }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Schedule meeting requires an assigned engineer - B: Frappe Helpdesk refuses with 'Please assign engineer to ticket', nothing created`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA CUST probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    let ticketName = '';
    let meetingsBefore = '';
    const meetingsEntry = async () => { await desk.openHeaderActionsMenu(); const items = await desk.getHeaderMenuItems(); await desk.closeOpenMenu(); return items.find((i) => /^Meetings/.test(i)) || '(no Meetings entry)'; };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(agent.level, 'the signed-in agent is an L2 engineer').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---\n     Raised By (Email) = ${raisedBy}\n     Subject           = ${subject}\n     Assigned to       = blank`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description: `Automated check of ${TC} - created and deleted by this run.` });
      probe.ticketName = ticketName;
      const who = await desk.getAssigneeInfo(ticketName);
      console.log(`  Read back ${ticketName}: _assign "${who.assignField || '(empty)'}" | open ToDo ${who.openTodos.join(', ') || '(none)'}`);
      expect(who.openTodos.length === 0 && !who.assignField.includes('@'), 'the probe ticket has no assignee').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - unassigned probe ticket');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      meetingsBefore = await meetingsEntry();
      console.log(`  - Actions menu before: ${meetingsBefore}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 probe ticket opened');
    });

    let message = '';
    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const r = await desk.scheduleMeetingFromActions('assign engineer');
      message = r.shown;
      console.log(`  - Shown on screen: "${message || '(nothing)'}"`);
      console.log(`  [INTERNAL check, Call API] the server's answer (meetings.form_defaults) message: "${r.serverMessage || '(none)'}"`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const shownOk = message.includes(MESSAGE);
      // The message sits in the drawer's embedded frame, out of captureVerifyEvidence's reach - outlined there directly.
      await desk.outlineMessageInAnyFrame('assign engineer', shownOk ? '#1a9641' : '#e03131');
      const formOpen = await desk.isMeetingFormOpen();
      console.log(`  [INFO] the meeting form behind the message: ${formOpen ? 'New NK Meeting form open' : 'no meeting form'} - accepted by the tester 2026-10-30, not scored`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the message', expected: `"${MESSAGE}" shown on screen`, actual: message ? `"${message.slice(0, 160)}"` : 'nothing shown (the server answered the message - see stdout)', passed: shownOk },
      ], `${TC} - Step 3 message`);
      await page.keyboard.press('Escape').catch(() => {});
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      const meetingsAfter = await meetingsEntry();
      console.log(`  - Actions menu after: ${meetingsAfter}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 nothing is created', expected: `the Meetings counter unchanged (${meetingsBefore})`, actual: meetingsAfter, passed: meetingsAfter === meetingsBefore && /\(0\)/.test(meetingsAfter) },
      ], `${TC} - Step 3 Meetings counter`, ['header']);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : `OVERALL: PASS - '${MESSAGE}' and nothing created`);
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the meeting needs an engineer').toEqual([]);
    });
  });
});
