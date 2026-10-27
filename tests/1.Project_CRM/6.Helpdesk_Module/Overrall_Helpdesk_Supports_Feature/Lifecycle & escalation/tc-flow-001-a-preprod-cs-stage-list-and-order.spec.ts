import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-001_A - CS stage list and order - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-001_A   (side A of the A/B row TC-FLOW-001; side B = tc-flow-001-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-22
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = Support L2, asserted in
 *                    Pre-condition 1; groups After-Sales / Manager + User; users.support_l2_manager_nam)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach - Nam holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0268 (the thirteen lifecycle stages); the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-001_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Lifecycle & escalation/
 *                    tc-flow-001-b-support-cs-stage-list-and-order.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L2 engineer, create an open probe ticket on Customer Support, read its form's stage bar row by row, then the
 * team kanban; both must list the 13 CS stages in Odoo's order, Open ... Closed.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-001-a-preprod --grep "TC-FLOW-001_A:" --project=chromium
 *   (both sides: npx playwright test tc-flow-001- --grep "TC-FLOW-001_" --project=chromium)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, row TC-FLOW-001 (Area Ticket lifecycle & workflow, Feature
 *                   "CS stage list and order", High, ui, L2 engineer, refs E10, LC-001) - 4 steps
 *  Source version : fingerprint 853431f87e3ec5b9 = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Logged in as an L2 engineer in both systems; one open probe ticket on team
 *  Customer Support / NAKIVO Customer Support.")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. One open probe ticket on team Customer Support - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-001_A <runId>  (CSV test data "subject 'QA FLOW probe <case id>'",
 *                                                                     made unique per run)
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list; read back after SAVE)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank (CS assignment is manual)
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> expected: stage Open, Helpdesk Team Customer Support (both asserted)
 *       Customer left blank ON PURPOSE (deviation from the CSV test data "customer qa.customer@example.com (ACME Test
 *       Ltd)"): this case never reads the customer, and the CSV itself lists customer-keyed create automations - a
 *       note on the customer's open leads (TC-CUST-012), the CEO alert (TC-CUST-037), priority by customer value
 *       (TC-FLOW-109) - that a stage-list check has no reason to fire on shared pre-production data.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Odoo: https://pre-production.nakivo.site > Helpdesk > Tickets (team Customer Support)
 *    2. Open the probe ticket. Odoo: read the stage bar in the form header.
 *    3. Write down every stage in the order shown.
 *    4. Also open the kanban view (Odoo: kanban icon) and note the column order.
 *  Verification - A expected (Odoo 12), verbatim
 *    13 stages in this order: Open, Preparing Answer (L1), L2, In Progress (L2), Waiting to be sent, Pending (L1),
 *    On Customer, Review, Meeting Expectation, Escalated, Hibernate, Resolving, Closed. Kanban columns follow the
 *    same order.
 *
 *  Gap in the source (reported to the TC author, not invented): steps 1 and 2 carry no Expected Result of their own -
 *  the CSV holds one expected block per case. The spec asserts navigation GUARDS there, labelled "(guard)", so a wrong
 *  screen can never be read as a stage list; the missing step results are for the author to add.
 *
 *  Environment traps (also in the step text):
 *   - A TICKETS click on the Overview that lands before the dashboard has bound its card handlers is silently dropped
 *     (measured 2026-10-22: the page stayed on "Helpdesk Overview"). The click counts once the breadcrumb shows
 *     "Tickets"; otherwise it is repeated, at most 3 clicks.
 *   - The stage bar is drawn in REVERSE DOM order (flex row-reverse + wrap-reverse) and wraps over 3 rows beside the
 *     chatter, so it is read row by row, left to right. The names are UPPERCASE by CSS only; stored names are compared.
 *   - The team's TICKETS open in kanban by default. The probe is searched and opened from the LIST view, so step 4 is a
 *     real switch: breadcrumb "Tickets" back to that list, then the kanban icon. The subject search stays applied and
 *     Odoo still draws every stage column of the team (verified 2026-10-22 with a search that matched nothing).
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot (the created ticket); verify-point shots in Steps 1,
 * 3 and 4 (outlined green = PASS, red = FAIL); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-001_A';
const SOURCE_ROW = 'TC-FLOW-001';
const SOURCE_FINGERPRINT = '853431f87e3ec5b9';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = Support L2',
  pre2: 'Pre-condition 2: One open probe ticket on team Customer Support - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-001_A <runId>, SAVE',
  s1: 'Step 1: Odoo: https://pre-production.nakivo.site > Helpdesk > Tickets (team Customer Support) - Helpdesk > Overview, then the TICKETS button of the Customer Support card; a click landing while the Overview still loads is dropped, so it counts only once the breadcrumb shows Tickets',
  s2: "Step 2: Open the probe ticket. Odoo: read the stage bar in the form header. - switch the team tickets to the list view, search the probe's unique subject and open its only row",
  s3: 'Step 3: Write down every stage in the order shown. - Odoo draws the bar in reverse DOM order over 3 rows, so it is read row by row, left to right',
  s4: 'Step 4: Also open the kanban view (Odoo: kanban icon) and note the column order. - breadcrumb Tickets back to the team list, then the kanban icon; the subject search stays applied and every stage column is still drawn',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const TEAM = 'Customer Support';
/** The A-expected stage list, verbatim from the CSV, in order. */
const EXPECTED_STAGES = [
  'Open', 'Preparing Answer (L1)', 'L2', 'In Progress (L2)', 'Waiting to be sent', 'Pending (L1)', 'On Customer',
  'Review', 'Meeting Expectation', 'Escalated', 'Hibernate', 'Resolving', 'Closed',
] as const;

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

test.describe(`${TC} - CS stage list and order on Odoo 12 pre-production`, () => {
  /** What this run created - read by afterEach. */
  let probe: { id?: string; subject?: string } = {};

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = {};
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe.subject) {
        console.log('  - No probe ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - #${probe.id ?? '?'} "${probe.subject}"`);
      } else if (probe.id) {
        // [INTERNAL, Call API] archive BY ID (Nam holds no unlink): the ticket must carry this run's subject and read
        // back inactive. The UI paths failed as teardown (list search missed the row, form Action has no Archive, the
        // Active toggle left it active - 2026-10-22); the teardown is not what this case verifies.
        const helpdeskPage = new HelpdeskPage(page);
        const archived = await helpdeskPage.archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      } else {
        // The id was never captured: look the probe up by this run's unique subject (covers a create that saved
        // before its id could be read).
        const helpdeskPage = new HelpdeskPage(page);
        await helpdeskPage.openAllTicketsListDirect(baseUrl);
        await helpdeskPage.searchTicket(probe.subject);
        const before = await helpdeskPage.waitForListRowsContaining(probe.subject);
        console.log(`  - Active rows with this run's subject : ${before}`);
        if (before > 1) {
          cleanupError = `${before} active tickets carry this run's subject "${probe.subject}" - more than the run created; nothing archived`;
        } else if (before === 1) {
          const archived = await helpdeskPage.archiveTicketFromListBySubject(probe.subject);
          const after = await helpdeskPage.countListRowsContaining(probe.subject);
          console.log(`  - Archived : ${archived} | active rows left : ${after}`);
          if (!archived || after !== 0) cleanupError = `probe ticket #${probe.id ?? '?'} "${probe.subject}" is still active - archive it by hand`;
          else console.log(`  - Probe ticket #${probe.id ?? '?'} archived`);
        } else if (probe.id) {
          cleanupError = `probe ticket #${probe.id} was created but is not in the active list - check it by hand`;
        } else {
          console.log('  - The create never saved - no probe ticket exists');
        }
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: CS stage list and order - A: Odoo 12 stage bar and kanban list the 13 CS stages, Open to Closed`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;

    let stageBar: { shown: string[]; folded: string[] } = { shown: [], folded: [] };
    let kanbanColumns: string[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production (${baseUrl})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Nam:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l2' = Support L2)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer (employee Support Team = Support L2)').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Subject        = ${subject}`);
      console.log(`     Helpdesk Team  = ${TEAM} (defaulted by the team's TICKETS list)`);
      console.log('     Customer       = blank');
      console.log('     Customer Email = blank');
      console.log('     Assigned to    = blank');
      console.log('     Priority       = default');
      console.log('     Description    = blank');
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const team = await helpdeskPage.getHelpdeskTeam();
      const stage = await helpdeskPage.getCurrentStage();
      console.log('  Read back after SAVE:');
      console.log(`     id            = ${probe.id}`);
      console.log(`     Helpdesk Team = ${team}`);
      console.log(`     stage         = ${stage}`);
      const passed = team === TEAM && stage === 'Open';
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket created`,
        passed,
        highlight: ['.o_statusbar_status'],
        lines: [`Helpdesk Team: expected ${TEAM} | actual ${team}`, `stage: expected Open | actual ${stage}`],
      }).catch(() => {});
      expect(team, 'the probe ticket is on team Customer Support').toBe(TEAM);
      expect(stage, 'the probe ticket is open (stage Open)').toBe('Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.openHelpdeskOverview();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      const crumbs = await helpdeskPage.getBreadcrumbText();
      const facets = await helpdeskPage.getSearchFacets();
      console.log(`  - Breadcrumb : ${crumbs}`);
      console.log(`  - Facets     : ${facets.join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: '(guard) Step 1 team tickets opened - breadcrumb', expected: '"Helpdesk Overview / Tickets" (still "Helpdesk Overview" = the TICKETS click was dropped)', actual: `"${crumbs}"`, passed: crumbs === 'Helpdesk Overview / Tickets' },
        { what: '(guard) Step 1 team tickets opened - search facet', expected: `contains "${TEAM}" (another team = the wrong card was opened)`, actual: facets.join(' | ') || '(none)', passed: facets.some((f) => f.includes(TEAM)) },
      ], `${TC} - Step 1 team tickets opened`, ['.o_control_panel .breadcrumb']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdeskPage.switchToListView();
      await helpdeskPage.searchTicket(subject);
      const rows = await helpdeskPage.waitForListRowsContaining(subject);
      console.log(`  - Rows with the probe's subject : ${rows}`);
      checks.push({ what: '(guard) Step 2 the search finds the probe ticket only', expected: 'exactly 1 row', actual: `${rows} row(s)`, passed: rows === 1 });
      await helpdeskPage.openOnlyListRowContaining(subject);
      const crumbs = await helpdeskPage.getBreadcrumbText();
      stageBar = await helpdeskPage.getStageBarInScreenOrder();
      console.log(`  - Breadcrumb             : ${crumbs}`);
      console.log(`  - Stage bar buttons read : ${stageBar.shown.length} shown, ${stageBar.folded.length} under "More"`);
      checks.push({
        what: '(guard) Step 2 the form opened on the probe ticket',
        expected: `breadcrumb "Helpdesk Overview / Tickets / ${subject} (#${probe.id})"`,
        actual: `"${crumbs}"`,
        passed: crumbs === `Helpdesk Overview / Tickets / ${subject} (#${probe.id})`,
      });
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  Stage bar, in the order shown (row by row, left to right):');
      console.log(numbered(stageBar.shown) || '      (no stage)');
      console.log(`  Observation (not scored) - stages folded under "More" : ${stageBar.folded.join(', ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Stage bar - number of stages', expected: `exactly ${EXPECTED_STAGES.length} (fewer = a stage is missing or folded under "More", more = a stage outside the CS list is offered)`, actual: String(stageBar.shown.length), passed: stageBar.shown.length === EXPECTED_STAGES.length },
        { what: 'Stage bar - stages and their ORDER', expected: EXPECTED_STAGES.join(', '), actual: stageBar.shown.join(', ') || '(none)', passed: sameList(stageBar.shown, EXPECTED_STAGES) },
      ], `${TC} - Step 3 stage bar`, ['.o_statusbar_status']);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await helpdeskPage.goBackToBreadcrumb('Tickets');
      await helpdeskPage.switchToKanbanView();
      const cols = await helpdeskPage.getKanbanColumnCounts();
      kanbanColumns = cols.map((c) => c.column);
      console.log('  Kanban columns, left to right:');
      console.log(cols.map((c, i) => `      ${String(i + 1).padStart(2)}. ${c.column}`).join('\n'));
      console.log(`  Observation (not scored) - cards per column under the subject search : ${cols.map((c) => `${c.column}=${c.count < 0 ? 'folded' : c.count}`).join(', ')}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Kanban - number of columns', expected: `exactly ${EXPECTED_STAGES.length}`, actual: String(kanbanColumns.length), passed: kanbanColumns.length === EXPECTED_STAGES.length },
        { what: 'Kanban - columns follow the same order', expected: `${EXPECTED_STAGES.join(', ')} (a different order = the kanban no longer follows the stage sequence)`, actual: kanbanColumns.join(', ') || '(none)', passed: sameList(kanbanColumns, EXPECTED_STAGES) },
      ], `${TC} - Step 4 kanban columns`, ['div.o_kanban_group']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - team kanban read');
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
        : `OVERALL: PASS - stage bar and kanban both list the ${EXPECTED_STAGES.length} CS stages in Odoo's order`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(stageBar.shown, 'the stage bar: the 13 CS stages, in order').toEqual([...EXPECTED_STAGES]);
      expect(kanbanColumns, 'the kanban columns: the 13 CS stages, in the same order').toEqual([...EXPECTED_STAGES]);
    });
  });
});
