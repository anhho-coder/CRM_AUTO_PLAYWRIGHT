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
 *  TC-FLOW-002_B - L1/L2 hand-off stages (manual moves) - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-002_B   (side B of the A/B row TC-FLOW-002; side A = tc-flow-002-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS /
 *                    SKIP_CLEANUP_CONTACTS); the stage moves' NK Stage Transition rows and the ticket's comments are deleted
 *                    with it (they block the ticket's delete)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0271; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-002_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-002-a-preprod-l2-handoff-stage-moves.spec.ts)
 *                    - same three moves and the same history check (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket that is in stage L2 and assigned to me, and move it L2 > In Progress (L2) >
 * Waiting to be sent > Preparing Answer (L1). Each move must be accepted and shown as the Status, and the history must log
 * each change with my name.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-002-b-support --grep "TC-FLOW-002_B:" --project=chromium
 *   (both sides: npx playwright test tc-flow-002- --grep "TC-FLOW-002_" --project=chromium; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 91 = row TC-FLOW-002 (Area Ticket lifecycle & workflow,
 *                   Feature "L1/L2 hand-off stages (manual moves)", High, happy, L2 engineer, refs E10, LC-034, LC-001) - 4 steps
 *  Source version : fingerprint aee354d4559a6dee = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of steps 1 and 4
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in stage L2 in both systems, assigned to the tester.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket in stage L2, assigned to the tester - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made
 *                                                                    unique per run - see below)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Priority          = blank (FF default Medium)
 *            - Assigned to       = blank (then "Assign to me" = the tester)
 *            - Subject           = QA FLOW probe TC-FLOW-002_B <runId>
 *            - Description       = Automated check of TC-FLOW-002_B (L1/L2 hand-off stages) - created and deleted by this run.
 *         Submit -> status Open (asserted); "Assign to me" -> assigned to the tester (asserted); the Status dropdown > L2
 *         -> status L2 (asserted)
 *       Measured 2026-10-22: Submit stays disabled until Subject AND Description hold text; the server refuses a ticket
 *       with neither Raised By nor Contact (HTTP 417); hence a run-unique address, so the teardown deletes exactly the
 *       Contact this run caused.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Move the ticket L2 > In Progress (L2) (FF: side panel > Status).
 *    2. Move it In Progress (L2) > Waiting to be sent.
 *    3. Move it Waiting to be sent > Preparing Answer (L1).
 *    4. Check the ticket's history after each move (FF: Activity / timeline of the ticket).
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Each move is accepted, the Status shows the new stage and the timeline logs each change with the tester's name;
 *    'Waiting to be sent' is selectable.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. Each step asserts its own move (the Status reads the new stage; step 2 also asserts that 'Waiting to be
 *  sent' is offered); Step 4 asserts the timeline entries.
 *
 *  UI vs TC (measured 2026-10-23, the TC wording should be corrected): step 1 says "side panel > Status". The side panel has
 *  Sub-status only; the Status control is the dropdown in the ticket header, labelled with the current status. The step keeps
 *  the CSV text and says so.
 *
 *  Environment traps (also in the step text):
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell; the probe
 *     is opened by its link.
 *   - "Assign to me" writes the assignment as a ToDo; the HD Ticket's _assign list can lag behind it, so the assignee is read
 *     from both.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 to 3 (the
 * Status, outlined green = PASS, red = FAIL) and Step 4 (the timeline); one end-of-section shot after Step 4; afterEach
 * start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-002_B';
const SOURCE_ROW = 'TC-FLOW-002';
const SOURCE_FINGERPRINT = 'aee354d4559a6dee';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One probe ticket in stage L2, assigned to the tester - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-002_B <runId>, Description, Submit; then Assign to me, then the Status dropdown > L2',
  s1: 'Step 1: Move the ticket L2 > In Progress (L2) (FF: side panel > Status) - the Status control is the header dropdown; the side panel carries Sub-status only (measured 2026-10-22)',
  s2: "Step 2: Move it In Progress (L2) > Waiting to be sent - 'Waiting to be sent' must be offered in the Status dropdown before it is chosen",
  s3: 'Step 3: Move it Waiting to be sent > Preparing Answer (L1).',
  s4: "Step 4: Check the ticket's history after each move (FF: Activity / timeline of the ticket) - the Activity tab is read after a reload; each change must carry the tester's name",
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const MOVES: Array<{ from: string; to: string }> = [
  { from: 'L2', to: 'In Progress (L2)' },
  { from: 'In Progress (L2)', to: 'Waiting to be sent' },
  { from: 'Waiting to be sent', to: 'Preparing Answer (L1)' },
];

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** One check as banner lines - what / Expected / Actual, wrapped at word boundaries so no value runs off the image. */
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length);
    const out: string[] = [];
    let cur = head;
    for (const word of text.split(' ')) {
      if (cur.length + word.length > width && cur.trim().length > head.trim().length) {
        out.push(cur.trimEnd());
        cur = pad;
      }
      cur += `${word} `;
    }
    out.push(cur.trimEnd());
    return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}

/**
 * Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b).
 * One call per OWNING element: `highlight` is the element the checks read (the dialog, the stage bar, the list), and it
 * must still be on screen - a dialog / toast value is shot before the dialog is closed or the toast fades. The outline
 * colour is the verdict of THESE checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'
): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, {
    name,
    passed: stepChecks.every((c) => c.passed),
    highlight,
    lines: stepChecks.flatMap((c) => bannerLines(c)),
    corner,
  }).catch(() => {});
}

test.describe(`${TC} - L1/L2 hand-off stages on the Support service`, () => {
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
      if (!probe) {
        console.log('  - No probe ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - ${probe.ticketName ?? '?'} "${probe.subject}"`);
      } else {
        console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers):`);
        console.log(`     ticket   = ${probe.ticketName ?? '(number not captured - looked up by subject)'}`);
        console.log(`     subject  = ${probe.subject}`);
        console.log(`     contact  = ${SKIP_CLEANUP_CONTACTS ? '(kept - SKIP_CLEANUP_CONTACTS)' : probe.contactEmail}`);
        const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
          ticketName: probe.ticketName,
          subject: probe.subject,
          contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail,
        });
        for (const l of lines) console.log(`  - ${l}`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: L1/L2 hand-off stages - B: Status moves L2 > In Progress (L2) > Waiting to be sent > Preparing Answer (L1), each in the timeline with the tester's name`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (L1/L2 hand-off stages) - created and deleted by this run.`;

    let ticketName = '';
    const statusAfter: string[] = [];
    let timeline = '';
    let assigneeAfterAssign = { assignField: '', openTodos: [] as string[] };

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const who = await desk.getLoggedUser();
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] frappe.auth.get_logged_user + GET HD Agent/<user>, as Nam:');
      console.log(`     session user  = ${who}`);
      console.log(`     agent         = ${agent.agent}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      console.log(`     job level     = ${agent.jobLevel || '(empty)'}`);
      console.log(`     active        = ${agent.active}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(who.toLowerCase(), 'the session belongs to the L2 engineer').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log('     Contact           = blank');
      console.log('     Customer          = blank');
      console.log('     Priority          = blank');
      console.log('     Assigned to       = blank (then Assign to me)');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.getTicketFields(ticketName);
      await desk.assignToMeFromHeader();
      assigneeAfterAssign = await desk.getAssigneeInfo(ticketName);
      await desk.openStatusMenu('Open');
      await desk.pickOpenMenuItem('L2');
      const atL2 = await desk.getTicketFields(ticketName);
      const assignedToTester = assigneeAfterAssign.assignField.includes(ENGINEER.username) || assigneeAfterAssign.openTodos.some((t) => t.startsWith(ENGINEER.username));
      console.log('  Read back:');
      console.log(`     ticket     = ${ticketName}`);
      console.log(`     status     = ${created.status} -> ${atL2.status}`);
      console.log(`     team       = ${created.team}`);
      console.log(`     assigned   = _assign "${assigneeAfterAssign.assignField || '(empty)'}" | open ToDo ${assigneeAfterAssign.openTodos.join(', ') || '(none)'}`);
      const passed = created.status === 'Open' && created.team === TEAM && atL2.status === 'L2' && assignedToTester;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket in L2, assigned`,
        passed,
        highlight: ['header button[aria-haspopup="menu"]'],
        lines: [
          `created status: expected Open | actual ${created.status}`,
          `status after the dropdown: expected L2 | actual ${atL2.status}`,
          `assigned to the tester: expected ${ENGINEER.username} (in _assign or an open ToDo) | actual ${assignedToTester ? 'yes' : 'no'}`,
        ],
      }).catch(() => {});
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(created.team, 'the probe ticket is on team NAKIVO Customer Support').toBe(TEAM);
      expect(assignedToTester, 'the probe ticket is assigned to the tester').toBe(true);
      expect(atL2.status, 'the probe ticket is moved to stage L2').toBe('L2');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket in L2, assigned');
    });

    // ================= Steps to reproduce #1 =================
    const stepLabels = [STEP.s1, STEP.s2, STEP.s3];
    for (let i = 0; i < MOVES.length; i++) {
      const move = MOVES[i];
      await test.step(stepLabels[i], async () => {
        console.log(`\n--- ${stepLabels[i]} ---`);
        console.log(`  - Move: ${move.from} > ${move.to}`);
        await desk.openStatusMenu(move.from);
        const options = await desk.getOpenMenuOptions();
        const offered = options.includes(move.to);
        console.log(`  - Status dropdown offers "${move.to}" : ${offered}`);
        await desk.pickOpenMenuItem(move.to);
        const status = (await desk.getTicketFields(ticketName)).status;
        statusAfter.push(status);
        console.log(`  - Status now : ${status}`);
        await recordChecks(page, testInfo, checks, [
          {
            what: `Step ${i + 1} the Status dropdown offers ${move.to}`,
            expected: `"${move.to}" is selectable`,
            actual: offered ? 'offered' : 'NOT offered',
            passed: offered,
          },
          {
            what: `Step ${i + 1} move accepted - the Status reads the new stage`,
            expected: move.to,
            actual: status || '(none)',
            passed: status === move.to,
          },
        ], `${TC} - Step ${i + 1} Status`, ['header button[aria-haspopup="menu"]']);
      });
    }

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await desk.reloadPage();
      timeline = await desk.readActivityTimeline();
      console.log(`  - Timeline text (first 900 chars) : ${timeline.slice(0, 900)}`);
      const perMove = MOVES.map((m) => {
        const phrase = `${ENGINEER.displayName} set status to ${m.to}`;
        const hit = timeline.includes(phrase);
        return {
          what: `Step 4 timeline - change ${m.from} > ${m.to} logged with the tester's name`,
          expected: `"${phrase}" in the Activity timeline (the timeline names the new status; the previous one is the row before it)`,
          actual: hit ? 'FOUND' : 'NOT FOUND',
          passed: hit,
        };
      });
      await recordChecks(page, testInfo, checks, perMove, `${TC} - Step 4 timeline`, ['body']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - moves in the timeline');
    });

    // ================= Verification =================
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length
        ? `OVERALL: FAIL - ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.what).join('; ')}`
        : `OVERALL: PASS - each move is accepted and shown as the Status, Waiting to be sent is offered, the timeline logs each change with the tester's name`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(statusAfter, 'the Status shows each new stage after its move').toEqual(MOVES.map((m) => m.to));
      for (const m of MOVES) {
        expect(checks.some((c) => c.what.startsWith('Step 4') && c.what.includes(`${m.from} > ${m.to}`) && c.passed), `the timeline logs ${m.from} > ${m.to} with the tester's name`).toBe(true);
      }
    });
  });
});
