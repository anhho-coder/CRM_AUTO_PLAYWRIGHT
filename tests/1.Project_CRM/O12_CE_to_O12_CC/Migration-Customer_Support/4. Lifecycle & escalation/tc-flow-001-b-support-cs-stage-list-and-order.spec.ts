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
 *  TC-FLOW-001_B - CS stage list and order - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-001_B   (side B of the A/B row TC-FLOW-001; side A = tc-flow-001-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-22
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in
 *                    Pre-condition 1; users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator - an agent cannot delete a ticket here
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0268 (the thirteen lifecycle stages); the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-001_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-001-a-preprod-cs-stage-list-and-order.spec.ts)
 *                    - same 13-stage list asserted as the baseline (CSV Comparison = same) plus the B column's own
 *                    "no other status" check; map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, create an open probe ticket, read every option of its Status dropdown, then the kanban layout;
 * both must list exactly the 13 CS stages in Odoo's order and offer no other status.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-001-b-support --grep "TC-FLOW-001_B:" --project=chromium
 *   (both sides: npx playwright test tc-flow-001- --grep "TC-FLOW-001_" --project=chromium; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, row TC-FLOW-001 (Area Ticket lifecycle & workflow, Feature
 *                   "CS stage list and order", High, ui, L2 engineer, refs E10, LC-001) - 4 steps
 *  Source version : fingerprint cf17c2e9d139e7e9 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Logged in as an L2 engineer in both systems; one open probe ticket on team
 *  Customer Support / NAKIVO Customer Support.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One open probe ticket on team NAKIVO Customer Support - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made
 *                                                                    unique per run - see below)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank (see the customer note on side A)
 *            - Priority          = blank (FF default Medium)
 *            - Assigned to       = blank (CS assignment is manual)
 *            - Subject           = QA FLOW probe TC-FLOW-001_B <runId>
 *            - Description       = Automated check of TC-FLOW-001_B (CS stage list and order) - created and deleted by this run.
 *         Submit -> expected: status Open, team NAKIVO Customer Support, Raised By as entered (all asserted)
 *       Measured 2026-10-22: Submit stays disabled until Subject AND Description hold text; the server refuses a ticket
 *       with neither Raised By nor Contact - HTTP 417 "Set the customer's e-mail or pick a contact." - and shows no
 *       toast; FF then CREATES a Contact named after a new Raised By address. Hence a run-unique address, so the
 *       teardown deletes exactly the Contact this run caused.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. FF: https://support-crm-mig.nakivo.site/helpdesk/tickets.
 *    2. Open the probe ticket. FF: open the Status field in the right-hand side panel.
 *    3. Write down every stage in the order shown.
 *    4. Also open the kanban view (FF: All Tickets > kanban layout) and note the column order.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Exactly the same 13 stages in the same order, including 'Waiting to be sent'. No other status is offered (no
 *    Queued, In Progress L1, In Progress L2, Replied or Resolved). Kanban shows the same 13 columns in that order.
 *    ("the same 13 stages" = the A list: Open, Preparing Answer (L1), L2, In Progress (L2), Waiting to be sent,
 *     Pending (L1), On Customer, Review, Meeting Expectation, Escalated, Hibernate, Resolving, Closed)
 *
 *  Gap in the source (reported to the TC author, not invented): steps 1 and 2 carry no Expected Result of their own -
 *  the CSV holds one expected block per case. The spec asserts navigation GUARDS there, labelled "(guard)".
 *
 *  UI vs TC (measured 2026-10-22, the TC wording should be corrected): step 2 says "the Status field in the right-hand
 *  side panel". The side panel has NO Status row (it has Sub-status); the Status control is the dropdown at the top
 *  right of the ticket header, labelled with the current status (e.g. "Open"). The step keeps the CSV text and says so.
 *
 *  Environment traps (also in the step text):
 *   - The kanban layout opens with the filter status != Closed, so the Closed column is FOLDED (narrow, vertical
 *     title, count 0). It is still one of the columns and is read from its vertical title.
 *   - The Status dropdown's options are read without clicking any; Escape closes it, and the header is re-read
 *     afterwards to prove the status did not change.
 *   - The tickets LIST keeps state per USER, server-side: a quick-filter value (All / Subject / ...) and a plain click on
 *     a list cell ("Contact is <value>" etc.) come back in Nam's next session (measured 2026-10-22 - a run left Nam's
 *     list filtered to an empty result; it was restored by hand). So the probe is opened by its link, never searched
 *     or clicked in the list.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot (the created ticket); verify-point shots in Steps 1,
 * 3 (open Status menu) and 4 (kanban), outlined green = PASS, red = FAIL; one end-of-section shot after Step 4;
 * afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-001_B';
const SOURCE_ROW = 'TC-FLOW-001';
const SOURCE_FINGERPRINT = 'cf17c2e9d139e7e9';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One open probe ticket on team NAKIVO Customer Support - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-001_B <runId>, Description, Submit (FF refuses a ticket without Raised By or Contact; Submit stays disabled without a Description)',
  s1: 'Step 1: FF: https://support-crm-mig.nakivo.site/helpdesk/tickets. - sidebar > All Tickets',
  s2: 'Step 2: Open the probe ticket. FF: open the Status field in the right-hand side panel. - opened by its link /helpdesk/tickets/<number> (a list cell click or a quick-filter value is saved per user by FF, so the spec touches neither); the Status control is the dropdown at the top right of the ticket header (labelled with the current status), the side panel has Sub-status only',
  s3: 'Step 3: Write down every stage in the order shown. - then Escape closes the dropdown without picking an option',
  s4: 'Step 4: Also open the kanban view (FF: All Tickets > kanban layout) and note the column order. - the Kanban button next to the Tickets title; the default filter status != Closed folds the Closed column',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
/** The 13 CS stages of the A list, verbatim from the CSV, in order. */
const EXPECTED_STAGES = [
  'Open', 'Preparing Answer (L1)', 'L2', 'In Progress (L2)', 'Waiting to be sent', 'Pending (L1)', 'On Customer',
  'Review', 'Meeting Expectation', 'Escalated', 'Hibernate', 'Resolving', 'Closed',
] as const;
/** Statuses the B column says must NOT be offered, verbatim. */
const FORBIDDEN_STATUSES = ['Queued', 'In Progress L1', 'In Progress L2', 'Replied', 'Resolved'] as const;

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

const numbered = (list: readonly string[]) => list.map((s, i) => `      ${String(i + 1).padStart(2)}. ${s}`).join('\n');
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

test.describe(`${TC} - CS stage list and order on the Support service`, () => {
  /** What this run created - read by afterEach. */
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

  test(`${TC}: CS stage list and order - B: Status dropdown and kanban list the same 13 CS stages and no other status`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (CS stage list and order) - created and deleted by this run.`;

    let statusOptions: string[] = [];
    let kanbanColumns: string[] = [];
    let ticketStatus = '';

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
      console.log('     Assigned to       = blank');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      probe.ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      const t = await desk.getTicketFields(probe.ticketName);
      ticketStatus = t.status;
      console.log('  Read back after Submit:');
      console.log(`     ticket    = ${probe.ticketName}`);
      console.log(`     subject   = ${t.subject}`);
      console.log(`     status    = ${t.status}`);
      console.log(`     team      = ${t.team}`);
      console.log(`     raised by = ${t.raisedBy}`);
      console.log(`     assigned  = ${t.assigned || '(nobody)'}`);
      console.log(`  Observation (not scored) - Contact on the ticket : ${t.contact || '(none)'}`);
      const passed = t.status === 'Open' && t.team === TEAM && t.raisedBy === raisedBy && t.subject === subject;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket created`,
        passed,
        highlight: ['header button[aria-haspopup="menu"][aria-label="Open"]'],
        lines: [
          `status: expected Open | actual ${t.status}`,
          `team: expected ${TEAM} | actual ${t.team}`,
          `raised by: expected ${raisedBy} | actual ${t.raisedBy}`,
        ],
      }).catch(() => {});
      expect(t.subject, 'the probe ticket keeps the subject typed').toBe(subject);
      expect(t.status, 'the probe ticket is open (status Open)').toBe('Open');
      expect(t.team, 'the probe ticket is on team NAKIVO Customer Support').toBe(TEAM);
      expect(t.raisedBy, 'the probe ticket is raised by the address typed').toBe(raisedBy);
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openAllTicketsFromSidebar();
      const crumbs = await desk.getHeaderCrumbs();
      const rows = await desk.countTicketLinks();
      console.log(`  - URL          : ${page.url()}`);
      console.log(`  - Header crumb : ${crumbs}`);
      console.log(`  - Ticket rows  : ${rows}`);
      await recordChecks(page, testInfo, checks, [
        { what: '(guard) Step 1 All Tickets opened', expected: 'URL /helpdesk/tickets, crumb starts with "Tickets", at least 1 ticket row',
          actual: `${new URL(page.url()).pathname}, "${crumbs}", ${rows} rows`,
          passed: new URL(page.url()).pathname === '/helpdesk/tickets' && crumbs.startsWith('Tickets') && rows > 0 },
      ], `${TC} - Step 1 All Tickets`, ['header div:has(> a[href="/helpdesk/tickets"])']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const name = probe!.ticketName!;
      await desk.openTicketByLink(baseUrl_support_mig, name);
      const title = await desk.getTicketHeaderTitle();
      console.log(`  - Header title : ${title}`);
      checks.push({ what: '(guard) Step 2 the probe ticket opened', expected: `header title = "${subject}"`, actual: `"${title}"`, passed: title === subject });
      await desk.openStatusMenu(ticketStatus);
      statusOptions = await desk.getOpenMenuOptions();
      console.log(`  - Status dropdown options read : ${statusOptions.length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  Status dropdown, in the order shown (top to bottom):');
      console.log(numbered(statusOptions) || '      (no option)');
      const offeredForbidden = FORBIDDEN_STATUSES.filter((s) => statusOptions.includes(s));
      await recordChecks(page, testInfo, checks, [
        { what: 'Status dropdown - number of stages', expected: `exactly ${EXPECTED_STAGES.length}`, actual: String(statusOptions.length), passed: statusOptions.length === EXPECTED_STAGES.length },
        { what: "Status dropdown - the same stages in the same ORDER (incl. 'Waiting to be sent')", expected: EXPECTED_STAGES.join(', '), actual: statusOptions.join(', ') || '(none)', passed: sameList(statusOptions, EXPECTED_STAGES) },
        { what: 'Status dropdown - no other status offered', expected: `none of ${FORBIDDEN_STATUSES.join(', ')} (one offered = FF still exposes a stock Frappe status the CS workflow does not have)`, actual: offeredForbidden.length ? `offered: ${offeredForbidden.join(', ')}` : 'none offered', passed: offeredForbidden.length === 0 },
      ], `${TC} - Step 3 Status dropdown`, ['[role="menu"]']);
      await desk.closeOpenMenu();
      const unchanged = await desk.isStatusTriggerShowing(ticketStatus);
      console.log(`  - After Escape the header still shows status "${ticketStatus}" : ${unchanged}`);
      checks.push({ what: '(guard) Step 3 status unchanged after reading the dropdown', expected: `header still shows "${ticketStatus}" (another status = reading the menu changed the ticket)`, actual: unchanged ? `"${ticketStatus}"` : 'NOT FOUND', passed: unchanged });
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.switchToKanbanLayout();
      const crumbs = await desk.getHeaderCrumbs();
      const cols = await desk.getKanbanColumns();
      kanbanColumns = cols.map((c) => c.column);
      console.log(`  - Header crumb : ${crumbs}`);
      console.log('  Kanban columns, left to right (ticket count in the header):');
      console.log(cols.map((c, i) => `      ${String(i + 1).padStart(2)}. ${c.column} (${c.count < 0 ? 'no counter' : c.count}${c.folded ? ', folded' : ''})`).join('\n'));
      await recordChecks(page, testInfo, checks, [
        { what: '(guard) Step 4 kanban layout opened', expected: 'crumb "Tickets / Kanban"', actual: `"${crumbs}"`, passed: crumbs === 'Tickets / Kanban' },
        { what: 'Kanban - number of columns', expected: `exactly ${EXPECTED_STAGES.length} (the folded Closed column counts)`, actual: String(kanbanColumns.length), passed: kanbanColumns.length === EXPECTED_STAGES.length },
        { what: 'Kanban - the same 13 columns in that order', expected: EXPECTED_STAGES.join(', '), actual: kanbanColumns.join(', ') || '(none)', passed: sameList(kanbanColumns, EXPECTED_STAGES) },
      ], `${TC} - Step 4 kanban columns`, ['div[title="Fold"]', 'div[title="Show"]']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - kanban read');
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
        : `OVERALL: PASS - Status dropdown and kanban both list exactly the ${EXPECTED_STAGES.length} CS stages in Odoo's order, no other status`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(statusOptions, 'the Status dropdown: the 13 CS stages, in order, nothing else').toEqual([...EXPECTED_STAGES]);
      expect(kanbanColumns, 'the kanban columns: the 13 CS stages, in the same order').toEqual([...EXPECTED_STAGES]);
    });
  });
});
