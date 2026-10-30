import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { deleteSupportProbeAsAdmin, readTicketEmailQueueAsAdmin, SupportProbe } from '@helpers/support-desk-cleanup.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-SEC-019_B - No automatic assignment; agents claim tickets - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-SEC-019_B   (side B of the A/B row TC-SEC-019; side A = tc-sec-019-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Administrator over the API: the Email Queue read (an agent cannot
 *                    read it) and the teardown.
 * Data             : one probe ticket (and its Contact) created per run, DELETED in afterEach as Administrator together with
 *                    the ToDo / HD Notification rows created on it during the run
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "3. Queue, ownership & team" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0266; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-SEC-019_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-sec-019-a-preprod-no-auto-assignment-claim.spec.ts)
 *                    - same 5-minute wait and the same claim; map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * A new probe ticket with no assignee is left for 5 minutes and reopened - it must still be unassigned (no round-robin to
 * Administrator or anyone); then "Assign to me" must make the agent its only assignee, with no assignment mail for it.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-sec-019-b-support --grep "TC-SEC-019_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-sec-019- --grep "TC-SEC-019_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 525 = row TC-SEC-019 (Area Login, roles, security & data,
 *                   Feature "No automatic assignment; agents claim tickets", High, regression, L1 agent, refs E04, E14,
 *                   SE-011, SE-033, DM-044) - 2 steps
 *  Source version : fingerprint 210a899dc68130cd = sha256 (16 hex) of the row's Preconditions + Steps + B expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk)
 *
 *  Pre-conditions (CSV, verbatim: "Create a new probe ticket (agent create form, raised by customer@example.com) with no
 *  assignee.")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. A new probe ticket with no assignee - CREATED by this run on the agent create form:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = customer.<runId>@example.com   (CSV "customer@example.com", made unique per run)
 *            - Subject           = QA SEC probe TC-SEC-019_B <runId>
 *            - Description       = Automated check of TC-SEC-019_B (no automatic assignment) - created and deleted by this run.
 *            - Assigned to       = blank
 *         Submit -> no assignee (asserted)
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Wait 5 minutes and reopen the ticket.
 *    2. Click 'Assign to me' (FF: Assign to me in the panel).
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The ticket stays unassigned (no round-robin to Administrator or anyone); 'Assign to me' makes you the only assignee; no
 *    assignment mail is sent for a self-assignment.
 *
 *  UI vs TC (measured 2026-10-28): "Assign to me" is the ticket HEADER button, not a panel control - the step says so.
 *  The mail check reads the Email Queue rows referencing the ticket created since the run started (as Administrator). The
 *  demo guard only queues mail to allow-listed addresses; the tester's own address is printed with the result so a reader can
 *  judge whether "none" was reachable at all.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the Assignee row after 5 minutes); Step 2
 * verify shot (the Assignee row after Assign to me); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-SEC-019_B';
const SOURCE_ROW = 'TC-SEC-019';
const SOURCE_FINGERPRINT = '210a899dc68130cd';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: Create a new probe ticket (agent create form, raised by customer@example.com) with no assignee - All Tickets > Create, Raised By = customer.<runId>@example.com, Subject = QA SEC probe TC-SEC-019_B <runId>, Description, Submit',
  s1: 'Step 1: Wait 5 minutes and reopen the ticket (FF: by its link)',
  s2: "Step 2: Click 'Assign to me' (FF: Assign to me in the panel) - it is the ticket HEADER button (measured 2026-10-28); [INTERNAL check, Call API] the Email Queue is read as Administrator",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
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

test.describe(`${TC} - No automatic assignment on the Support service`, () => {
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

  test(`${TC}: No automatic assignment; agents claim tickets - B: Frappe Helpdesk leaves a new ticket unassigned until Assign to me, no mail`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA SEC probe ${TC} ${runId}`;
    const raisedBy = `customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (no automatic assignment) - created and deleted by this run.`;
    let ticketName = '';
    let assignedAt = '';

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
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      console.log('     Assigned to       = blank');
      probe = { subject, contactEmail: raisedBy, since: nowInServerZone() };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const who = assigneesOf(await desk.getAssigneeInfo(ticketName));
      console.log(`  Read back ${ticketName}: assignees = ${who.join(', ') || '(none)'}`);
      expect(who, 'the new probe ticket has no assignee').toEqual([]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - new probe ticket without assignee');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Waiting 5 minutes from ${new Date().toISOString()} ...`);
      await page.waitForTimeout(CommonUtils.waitTimes.helpdeskNoAutoAssignWait);
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      const who = assigneesOf(await desk.getAssigneeInfo(ticketName));
      const shown = await desk.getSidePanelRowValue('Assignee');
      console.log(`  - Reopened at ${new Date().toISOString()}: assignees ${who.join(', ') || '(none)'} | side panel Assignee "${shown}"`);
      await desk.markPanelRow('Assignee');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 after 5 minutes the ticket is still unassigned', expected: 'no assignee (no round-robin to Administrator or anyone)', actual: who.join(', ') || '(none)', passed: who.length === 0 },
      ], `${TC} - Step 1 unassigned after 5 minutes`, [SupportDeskPageMig.PANEL_ROW]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      assignedAt = nowInServerZone();
      await desk.assignToMeSaved();
      const who = assigneesOf(await desk.getAssigneeInfo(ticketName));
      const mails = await readTicketEmailQueueAsAdmin(baseUrl_support_mig, ADMIN, ticketName, assignedAt);
      const toMe = mails.filter((m) => m.recipients.some((r) => r.toLowerCase() === AGENT.username.toLowerCase()));
      console.log(`  - Assignees now ${who.join(', ') || '(none)'}`);
      console.log(`  [INTERNAL check, Call API] Email Queue rows for ${ticketName} since ${assignedAt}: ${mails.length}`);
      for (const m of mails) console.log(`     ${m.name} ${m.status} -> ${m.recipients.join(', ')}`);
      await desk.markPanelRow('Assignee');
      await recordChecks(page, testInfo, checks, [
        { what: "Step 2 'Assign to me' makes you the only assignee", expected: AGENT.username, actual: who.join(', ') || '(none)', passed: who.length === 1 && who[0] === AGENT.username },
        { what: 'Step 2 no assignment mail is sent for a self-assignment', expected: `no Email Queue row to ${AGENT.username} since the click`, actual: `${toMe.length} of ${mails.length} queued mail(s) to ${AGENT.username}`, passed: toMe.length === 0 },
      ], `${TC} - Step 2 Assign to me`, [SupportDeskPageMig.PANEL_ROW]);
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
        : 'OVERALL: PASS - no automatic assignment for 5 minutes; Assign to me makes the agent the only assignee, with no mail');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'no automatic assignment; the agent claims the ticket').toEqual([]);
    });
  });
});
