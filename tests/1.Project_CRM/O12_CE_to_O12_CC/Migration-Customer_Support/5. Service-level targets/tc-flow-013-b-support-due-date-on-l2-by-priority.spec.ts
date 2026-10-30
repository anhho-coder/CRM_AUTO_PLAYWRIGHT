import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { deleteSupportProbeAsAdmin } from '@helpers/support-desk-cleanup.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-FLOW-013_B - Due date when moved to L2 (by priority) - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-013_B   (side B of the A/B row TC-FLOW-013; side A = tc-flow-013-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : three probe tickets (and the one Contact FF creates for their Raised By address) created per run in
 *                    Pre-condition 3, DELETED in afterEach as Administrator with their NK Stage Transition rows
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "5. Service-level targets" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0276; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-013_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-013-a-preprod-due-date-on-l2-by-priority.spec.ts)
 *                    - same three priorities and the same hours (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * Three probe tickets in Open (Medium, High, Urgent; Support Type Standard) are moved to L2 by an L2 engineer. Each Due
 * Date must equal its move time + 24 h / + 15 h / + 6 h.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-013-b-support --grep "TC-FLOW-013_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-013- --grep "TC-FLOW-013_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 102 = row TC-FLOW-013 (Area Ticket lifecycle & workflow,
 *                   Feature "Due date when moved to L2 (by priority)", High, happy, L2 engineer, refs E11, LC-013, AU-003)
 *                   - 3 steps
 *  Source version : fingerprint 92d25919523dbbd6 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 3
 *
 *  Pre-conditions (CSV, verbatim: "Three probe tickets in stage Open with priority Medium, High and Urgent; customer
 *  support type Standard (not 24/7); run Monday-Thursday so no due date hits a weekend.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. Run Monday-Thursday (Asia/Ho_Chi_Minh, the account's time zone) - on any other day the case is SKIPPED
 *    3. Three probe tickets in Open - CREATED by this run, one per priority:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made unique)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Subject           = QA FLOW probe TC-FLOW-013_B <priority> <runId>
 *            - Description       = Automated check of TC-FLOW-013_B (due date on L2) - created and deleted by this run.
 *         Submit; then on the ticket page, side panel:
 *            - Priority     = Medium / High / Urgent
 *            - Support Type = Standard
 *         Read back on each: status Open, priority, Support Type Standard (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd)): no customer; a new FF ticket
 *       carries no Support Type, so the run sets Standard itself - that is what the pre-condition asks for.
 *  Steps to reproduce #1 (CSV, verbatim; the "Odoo:" half belongs to side A)
 *    1. Note the current time (UTC).
 *    2. Move each ticket to L2.
 *    3. Read each Due Date (FF: Due date row in the side panel).
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Medium: move time + 24 h. High: + 15 h. Urgent: + 6 h (shown in the viewer's time zone; compare in the same zone as Odoo).
 *
 *  How "move time" is measured: the UTC clock is read right before and right after each move (Step 2). The stored Due Date
 *  (custom_overdue) carries no zone; the zone is derived from the ticket's own `modified` stamp read right after the move,
 *  then the Due Date must fall inside [before + N h - 60 s, after + N h + 60 s]. The side-panel row is printed and must show
 *  the same date and time in the viewer's zone.
 *
 *  Environment traps (also in the step text):
 *   - The Status control is the header dropdown (labelled with the current status), not a side-panel row.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 3 end shot; Step 2 end shot; one verify-point shot per ticket in Step 3
 * (the Due Date row outlined); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-013_B';
const SOURCE_ROW = 'TC-FLOW-013';
const SOURCE_FINGERPRINT = '92d25919523dbbd6';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe tickets (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probes' Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: Run Monday-Thursday so no due date hits a weekend - today (Asia/Ho_Chi_Minh) is a Monday to Thursday',
  pre3: 'Pre-condition 3: Three probe tickets in stage Open with priority Medium, High and Urgent; customer support type Standard - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-013_B <priority> <runId>, Description, Submit; side panel Priority and Support Type = Standard',
  s1: 'Step 1: Note the current time (UTC).',
  s2: 'Step 2: Move each ticket to L2 (FF: the Status dropdown in the ticket header, Open > L2; the UTC clock is read right before and right after each move)',
  s3: 'Step 3: Read each Due Date (FF: Due date row in the side panel - shown in the viewer\'s time zone)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
/** Priority -> hours the CSV expects between the move to L2 and the Due Date. */
const PROBES: Array<{ priority: string; hours: number }> = [
  { priority: 'Medium', hours: 24 },
  { priority: 'High', hours: 15 },
  { priority: 'Urgent', hours: 6 },
];
const TOLERANCE_MS = 60 * 1000;

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

/** "2026-10-29 15:51:17" stored in a zone `offsetH` hours east of UTC -> epoch ms; NaN when it does not parse. */
function parseStored(text: string, offsetH: number): number {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offsetH * 3600_000;
}

/** The side panel's date-time text in the viewer's zone (this machine's clock zone) -> epoch ms; NaN when not recognised. */
function parsePanel(text: string): number {
  const t = String(text || '').trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return new Date(+m[3], +m[2] - 1, +m[1], h, +m[5], +(m[6] || 0)).getTime();
  }
  const d = Date.parse(t);
  return Number.isNaN(d) ? NaN : d;
}

/** Weekday of `now` in Asia/Ho_Chi_Minh (0 = Sunday). */
function weekdayInVietnam(now: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

test.describe(`${TC} - Due date when moved to L2 on the Support service`, () => {
  let probes: Array<{ ticketName?: string; subject: string }> = [];
  let contactEmail = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probes = [];
    contactEmail = '';
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const problems: string[] = [];
    if (!probes.length) console.log('  - No probe ticket was created by this run - nothing to clean up');
    else if (SKIP_CLEANUP_TICKETS) console.log(`  - SKIP_CLEANUP_TICKETS = true: probe tickets kept - ${probes.map((p) => p.ticketName ?? p.subject).join(', ')}`);
    else {
      console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers):`);
      for (const [i, p] of probes.entries()) {
        const last = i === probes.length - 1;
        try {
          const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
            ticketName: p.ticketName,
            subject: p.subject,
            contactEmail: last && !SKIP_CLEANUP_CONTACTS ? contactEmail : undefined,
          });
          for (const l of lines) console.log(`  - ${l}`);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (problems.length) throw new Error(`afterEach cleanup: ${problems.join(' | ')}`);
  });

  test(`${TC}: Due date when moved to L2 - B: Frappe Helpdesk sets Medium + 24 h, High + 15 h, Urgent + 6 h from the move`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const raisedBy = `qa.customer.${runId}@example.com`;
    const moves: Array<{ before: number; after: number; status: string; offsetH: number }> = [];

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
      console.log(`     support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(who.toLowerCase(), 'the session belongs to the L2 engineer').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const day = weekdayInVietnam(new Date());
      console.log(`  - Today (Asia/Ho_Chi_Minh) : ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`);
      test.skip(day < 1 || day > 4, 'CSV pre-condition: run Monday-Thursday so no due date hits a weekend - today is not one of those days');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      contactEmail = raisedBy;
      for (const p of PROBES) {
        const subject = `QA FLOW probe ${TC} ${p.priority} ${runId}`;
        const description = `Automated check of ${TC} (due date on L2) - created and deleted by this run.`;
        console.log(`  Probe ticket (${p.priority}) data:`);
        console.log(`     Raised By (Email) = ${raisedBy}`);
        console.log('     Contact           = blank');
        console.log('     Customer          = blank');
        console.log(`     Subject           = ${subject}`);
        console.log(`     Description       = ${description}`);
        console.log(`     Priority          = ${p.priority}   (side panel, after Submit)`);
        console.log('     Support Type      = Standard (side panel, after Submit)');
        const probe: { ticketName?: string; subject: string } = { subject };
        probes.push(probe);
        await desk.openAllTicketsFromSidebar();
        probe.ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
        if (p.priority !== 'Medium' || (await desk.getSidePanelRowValue('Priority')) !== 'Medium') await desk.setSidePanelPriority(p.priority);
        await desk.setSidePanelChoice('Support Type', 'Standard');
        const doc = await desk.readTicketDocument(probe.ticketName);
        console.log(`  Read back ${probe.ticketName}: status = ${doc.status} | priority = ${doc.priority} | Support Type = ${doc.custom_support_type || '(empty)'}`);
        expect(doc.status, `probe ${p.priority} is in status Open`).toBe('Open');
        expect(doc.priority, `probe ${p.priority} carries priority ${p.priority}`).toBe(p.priority);
        expect(doc.custom_support_type, `probe ${p.priority} has customer support type Standard`).toBe('Standard');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - three probe tickets in Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Current time (UTC) : ${new Date().toISOString()}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const [i, p] of probes.entries()) {
        await desk.openTicketByLink(baseUrl_support_mig, p.ticketName as string);
        const before = Date.now();
        await desk.chooseStatusSaved('Open', 'L2');
        const after = Date.now();
        const doc = await desk.readTicketDocument(p.ticketName as string);
        // The server stamps `modified` in its own zone at the move: its distance from the UTC clock gives that zone.
        const offsetH = Math.round((Date.parse(`${String(doc.modified).slice(0, 19).replace(' ', 'T')}Z`) - after) / 3600_000);
        moves.push({ before, after, status: String(doc.status), offsetH });
        console.log(`  - ${p.ticketName} (${PROBES[i].priority}) status ${doc.status} | before ${new Date(before).toISOString()} | after ${new Date(after).toISOString()} | server zone UTC${offsetH >= 0 ? '+' : ''}${offsetH}`);
        expect(String(doc.status), `the ${PROBES[i].priority} probe reached status L2`).toBe('L2');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 2 three tickets in L2');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const [i, p] of probes.entries()) {
        await desk.openTicketByLink(baseUrl_support_mig, p.ticketName as string);
        const shown = await desk.getSidePanelRowValue('Due Date');
        const doc = await desk.readTicketDocument(p.ticketName as string);
        const { hours, priority } = PROBES[i];
        const dueMs = parseStored(String(doc.custom_overdue || ''), moves[i].offsetH);
        const shownMs = parsePanel(shown);
        const lo = moves[i].before + hours * 3600_000 - TOLERANCE_MS;
        const hi = moves[i].after + hours * 3600_000 + TOLERANCE_MS;
        const offset = Number.isNaN(dueMs) ? NaN : (dueMs - moves[i].before) / 3600_000;
        console.log(`  - ${p.ticketName} ${priority}: side panel Due Date "${shown || '(row not shown)'}" | stored ${String(doc.custom_overdue || '(empty)')} | = move + ${Number.isNaN(offset) ? '?' : offset.toFixed(3)} h`);
        await desk.markPanelRow('Due Date');
        await recordChecks(page, testInfo, checks, [
          {
            what: `Step 3 ${priority} ticket ${p.ticketName} - Due Date = move time + ${hours} h`,
            expected: `between ${new Date(lo).toISOString()} and ${new Date(hi).toISOString()} (UTC) - an empty Due Date or one off by an hour or more is a FAIL`,
            actual: Number.isNaN(dueMs) ? `stored "${String(doc.custom_overdue || '')}" (empty or unparsable)` : `${new Date(dueMs).toISOString()} (move + ${offset.toFixed(2)} h)`,
            passed: !Number.isNaN(dueMs) && dueMs >= lo && dueMs <= hi,
          },
          {
            what: `Step 3 ${priority} ticket ${p.ticketName} - the side panel shows that Due Date in the viewer's time zone`,
            expected: `a Due Date row showing ${Number.isNaN(dueMs) ? 'the stored value' : new Date(dueMs).toISOString()} converted to the viewer's zone (to the minute)`,
            actual: shown ? `"${shown}"${Number.isNaN(shownMs) ? ' (not a recognised date-time)' : ` = ${new Date(shownMs).toISOString()}`}` : 'no Due Date row in the side panel',
            passed: !!shown && !Number.isNaN(shownMs) && !Number.isNaN(dueMs) && Math.abs(shownMs - dueMs) < TOLERANCE_MS,
          },
        ], `${TC} - Step 3 Due Date ${priority}`, [SupportDeskPageMig.PANEL_ROW]);
      }
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
        : 'OVERALL: PASS - the Due Date is move time + 24 h (Medium), + 15 h (High) and + 6 h (Urgent), shown in the viewer\'s zone');
      expect(checks.length, 'two Due Date checks per probe ticket').toBe(PROBES.length * 2);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'every Due Date equals its move time + the priority hours').toEqual([]);
    });
  });
});
