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
 *  TC-SEC-018_B - 'Assigned to' offers only Customer Support team members - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-SEC-018_B   (side B of the A/B row TC-SEC-018; side A = tc-sec-018-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and its Contact) created per run, DELETED in afterEach as Administrator together with
 *                    the ToDo / HD Notification rows created on it during the run (an assignment the try may have made)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "3. Queue, ownership & team" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0267; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-SEC-018_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-sec-018-a-preprod-assigned-to-only-team-members.spec.ts)
 *                    - same outside user and the same "not offered, not taken" checks; map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * On a CS probe ticket assigned to the tester, the Assignee picker is searched for a user outside the CS team (Thomas
 * Semerich - an HD Agent who is not a member of NAKIVO Customer Support) and an assignment to him is tried in the agent app
 * and the way Desk adds one; he must not be offered, the try must be refused with a message, and the ticket must keep
 * exactly one assignee.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-sec-018-b-support --grep "TC-SEC-018_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-sec-018- --grep "TC-SEC-018_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 524 = row TC-SEC-018 (Area Login, roles, security & data,
 *                   Feature "'Assigned to' offers only Customer Support team members", High, negative, L1 agent, refs E04,
 *                   E14, SE-011, SE-010) - 2 steps
 *  Source version : fingerprint 835173a7ca0911de = sha256 (16 hex) of the row's Preconditions + Steps + B expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - including the step-2 "FF: also try via Desk" part
 *
 *  Pre-conditions (CSV, verbatim: "A probe ticket in team Customer Support / NAKIVO Customer Support; a user outside the team
 *  (e.g. an occasional writer seat) exists.")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. One probe ticket in team NAKIVO Customer Support - CREATED by this run (All Tickets > Create, Raised By =
 *       qa.customer.<runId>@example.com, Subject = QA SEC probe TC-SEC-018_B <runId>, Description, Submit) and assigned to
 *       the tester (header Assign to me) - and [INTERNAL check, Call API] the outside user exists: Thomas Semerich, an active
 *       HD Agent who is NOT among the users of HD Team NAKIVO Customer Support
 *       The assignment to the tester is the spec's reading of the expected result "the ticket keeps exactly one assignee",
 *       which needs one before the try (the CSV pre-condition does not say) - reported to the TC author, not invented.
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Open the probe ticket's 'Assigned to' picker and search the outside user.
 *    2. Try to assign the ticket to that user (FF: also try via Desk /app/hd-ticket/<number> > Assigned To).
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Only CS team agents are offered; assigning the outside user is refused with a message; the ticket keeps exactly one
 *    assignee.
 *
 *  How Step 2 tries: (a) in the agent app, the outside user is clicked in the picker when it is offered (when it is not, that
 *  try cannot be made and Step 1 already holds the check); (b) Desk /app/hd-ticket/<number> is opened and the assignment is
 *  requested the way its "Assigned To > Add" does - [INTERNAL check, Call API] frappe.desk.form.assign_to.add as the agent.
 *  Each try records the server's answer; then the assignees are read.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the open picker); Step 2 verify shots
 * (the agent-app try; the Desk page after the Desk try); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-SEC-018_B';
const SOURCE_ROW = 'TC-SEC-018';
const SOURCE_FINGERPRINT = '835173a7ca0911de';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: A probe ticket in team NAKIVO Customer Support; a user outside the team exists - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA SEC probe TC-SEC-018_B <runId>, Description, Submit; Assign to me; [INTERNAL check, Call API] Thomas Semerich is an HD Agent outside the CS team',
  s1: "Step 1: Open the probe ticket's 'Assigned to' picker and search the outside user (FF: side panel > Assignee, type Thomas)",
  s2: 'Step 2: Try to assign the ticket to that user (FF: also try via Desk /app/hd-ticket/<number> > Assigned To) - agent app: click him when offered; Desk: [INTERNAL check, Call API] frappe.desk.form.assign_to.add, what Assigned To > Add calls',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const CS_TEAM = 'NAKIVO Customer Support';
const OUTSIDE_USER = { login: 'thomas.semerich@nakivo.com', name: 'Thomas Semerich' };
const SERVER_ZONE = 'Asia/Ho_Chi_Minh';

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
 * One call per OWNING element: `highlight` is the element the checks read; the outline colour is the verdict of THESE
 * checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-left'
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

/** Now as the Support service stores datetimes: 'YYYY-MM-DD HH:mm:ss' in its own zone. */
function nowInServerZone(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** The distinct assignees of a ticket from _assign and the open ToDos. */
function assigneesOf(who: { assignField: string; openTodos: string[] }): string[] {
  return [...new Set([
    ...String(who.assignField || '').replace(/[[\]"]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
    ...who.openTodos.map((t) => t.split(':')[0]),
  ])];
}

test.describe(`${TC} - Assigned to offers only team members on the Support service`, () => {
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
        console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers, rows since ${probe.since}):`);
        const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
          ticketName: probe.ticketName,
          subject: probe.subject,
          contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail,
          since: probe.since,
        });
        for (const l of lines) console.log(`  - ${l}`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: 'Assigned to' offers only Customer Support team members - B: Frappe Helpdesk neither offers nor accepts an agent outside the CS team`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA SEC probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (Assigned to offers only CS members) - created and deleted by this run.`;
    let ticketName = '';
    let teamUsers: string[] = [];
    let offeredOutside = false;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent (HD Agent Support Level = L1)').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      teamUsers = await desk.getHdTeamUsers(CS_TEAM);
      const outside = await desk.getHdAgent(OUTSIDE_USER.login);
      console.log(`  [INTERNAL check, Call API] HD Team "${CS_TEAM}": ${teamUsers.length} users`);
      console.log(`     outside user ${OUTSIDE_USER.name} (${OUTSIDE_USER.login}): HD Agent ${outside.exists} (active ${outside.active}), team member ${teamUsers.includes(OUTSIDE_USER.login)}`);
      expect(outside.exists && outside.active, `${OUTSIDE_USER.name} is an active HD Agent`).toBe(true);
      expect(teamUsers.includes(OUTSIDE_USER.login), `${OUTSIDE_USER.name} is NOT a user of ${CS_TEAM}`).toBe(false);
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log('     Customer          = blank');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      console.log('     Assigned to       = the tester (Assign to me, after Submit)');
      probe = { subject, contactEmail: raisedBy, since: nowInServerZone() };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      await desk.assignToMeSaved();
      const doc = await desk.readTicketDocument(ticketName);
      const who = assigneesOf(await desk.getAssigneeInfo(ticketName));
      console.log(`  Read back ${ticketName}: team = ${doc.agent_group} | assignees = ${who.join(', ') || '(none)'}`);
      expect(doc.agent_group, 'the probe ticket is in team NAKIVO Customer Support').toBe(CS_TEAM);
      expect(who, 'the probe ticket has exactly one assignee, the tester').toEqual([AGENT.username]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket assigned to the tester');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const offered = await desk.searchSidePanelAssignee(OUTSIDE_USER.name);
      offeredOutside = offered.includes(OUTSIDE_USER.name);
      console.log(`  - Offered for "${OUTSIDE_USER.name.split(' ')[0]}": ${JSON.stringify(offered)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the outside user is not offered', expected: `no "${OUTSIDE_USER.name}" among the offered agents (only ${CS_TEAM} agents)`, actual: JSON.stringify(offered), passed: !offeredOutside },
      ], `${TC} - Step 1 Assignee picker`, [SupportDeskPageMig.MENU], 'bottom-left');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      let appTry = { status: 0, message: 'not offered - nothing to click' };
      if (offeredOutside) appTry = await desk.pickOfferedAssignee(OUTSIDE_USER.name);
      else await desk.closeOpenMenu();
      const afterApp = assigneesOf(await desk.getAssigneeInfo(ticketName));
      console.log(`  - Agent app try : HTTP ${appTry.status} "${appTry.message}" | assignees now ${afterApp.join(', ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 agent app - the try is refused with a message', expected: `refused with a message, or ${OUTSIDE_USER.name} never offered`, actual: offeredOutside ? `HTTP ${appTry.status} "${appTry.message || '(accepted, no message)'}"` : appTry.message, passed: !offeredOutside || (appTry.status !== 200 && !!appTry.message) },
        { what: 'Step 2 agent app - exactly one assignee is kept', expected: AGENT.username, actual: afterApp.join(', ') || '(none)', passed: afterApp.length === 1 && afterApp[0] === AGENT.username },
      ], `${TC} - Step 2 agent app try`, ['body']);
      await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/app/hd-ticket/${ticketName}`, { waitUntil: 'domcontentloaded' });
      await desk.waitForDeskForm();
      const deskTry = await desk.addAssignmentLikeDesk(ticketName, OUTSIDE_USER.login);
      const afterDesk = assigneesOf(await desk.getAssigneeInfo(ticketName));
      console.log(`  - Desk try      : HTTP ${deskTry.status} "${deskTry.message}" | assignees now ${afterDesk.join(', ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 Desk - assigning the outside user is refused with a message', expected: 'an error answer carrying a message (not HTTP 200)', actual: `HTTP ${deskTry.status} "${deskTry.message || '(accepted, no message)'}"`, passed: deskTry.status !== 200 && !!deskTry.message },
        { what: 'Step 2 Desk - the ticket keeps exactly one assignee', expected: AGENT.username, actual: afterDesk.join(', ') || '(none)', passed: afterDesk.length === 1 && afterDesk[0] === AGENT.username },
      ], `${TC} - Step 2 Desk try`, ['body']);
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
        : `OVERALL: PASS - ${OUTSIDE_USER.name} is neither offered nor accepted, and the ticket keeps its one assignee`);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'Assigned to keeps to the CS team agents').toEqual([]);
    });
  });
});
