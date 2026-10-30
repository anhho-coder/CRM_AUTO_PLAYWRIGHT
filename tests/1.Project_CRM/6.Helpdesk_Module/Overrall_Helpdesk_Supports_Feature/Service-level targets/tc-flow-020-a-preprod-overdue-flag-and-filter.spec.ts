import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-020_A - Overdue flag and 'Overdue Tickets' filter - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-020_A   (side A of the A/B row TC-FLOW-020; side B = tc-flow-020-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = l2, asserted in Pre-condition 1;
 *                    users.support_l2_manager_nam)
 * Data             : READ ONLY - existing migrated CS tickets; nothing is created, changed or saved (no teardown needed;
 *                    the search facets live in the browser tab only)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Service-level targets" =
 *                    the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0276; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-FLOW-020_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Service-level targets/
 *                    tc-flow-020-b-support-overdue-flag-and-filter.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * Helpdesk > All Tickets > Filters > Overdue Tickets must list only non-Closed tickets whose due date is before now (pager
 * count, 5 rows read, and the whole list counted); an overdue ticket's Due Date is shown red on its kanban card and form.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-020-a-preprod --grep "TC-FLOW-020_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-020- --grep "TC-FLOW-020_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 109 = row TC-FLOW-020 (Area Ticket lifecycle & workflow,
 *                   Feature "Overdue flag and 'Overdue Tickets' filter", High, happy, L2 engineer, refs E11, LC-014) - 3 steps
 *  Source version : fingerprint cedb7cafd10fa6ef = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "At least one CS ticket whose due date is in the past and which is not Closed, and one
 *  Closed ticket with a past due date (migrated tickets are fine).")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. [INTERNAL check, Call API] at least one Customer Support ticket with Due Date < now that is not Closed, and at least
 *       one Closed one with Due Date < now (counted, nothing created - CSV test data: "Existing migrated CS tickets; read-only.")
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Open the ticket list. Odoo: Filters > Overdue Tickets.
 *    2. Count the tickets and note 5 numbers.
 *    3. Open one: check how the due date is displayed.
 *  Verification - A expected (Odoo 12), verbatim
 *    The list holds only non-Closed tickets with a due date before now; the due date is shown red on form and kanban.
 *
 *  How the list is checked: the list opens from the navbar All Tickets with the signed-in user's default facet(s), printed -
 *  for Nam that is his own saved search "L2-Tickets" (team 1, stages Open / L2 / ...), not "Open Tickets" (measured
 *  2026-10-28); Overdue Tickets adds `overdue_pass != False`. Each facet is turned into its domain (Overdue / Open Tickets
 *  from the search view, a saved search from ir.filters) and the AND of them is counted over RPC - it must equal the pager total (proves the domain is
 *  the list) - then the list's Closed tickets and its tickets with a Due Date at or after now (or none) are counted: both
 *  must be 0. The 5 noted rows are also read one by one.
 *  Step 3 order: the kanban card of one of the 5 noted tickets is read first (the same filtered list switched to kanban), then
 *  that ticket's form is opened - "shown red on form and kanban".
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (search facets); Step 2 verify shots (the list + pager; the 5 rows);
 * Step 3 verify shots (the kanban card's Due Date; the form's Due Date); one end-of-section shot after Step 3.
 * ================================================================================================
 */

const TC = 'TC-FLOW-020_A';
const SOURCE_ROW = 'TC-FLOW-020';
const SOURCE_FINGERPRINT = 'cedb7cafd10fa6ef';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = l2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] At least one CS ticket whose due date is in the past and which is not Closed, and one Closed ticket with a past due date (migrated tickets are fine)',
  s1: 'Step 1: Open the ticket list. Odoo: Helpdesk > All Tickets (navbar), then Filters > Overdue Tickets.',
  s2: 'Step 2: Count the tickets and note 5 numbers (the pager total and the first 5 rows; [INTERNAL check, Call API] the whole list is counted by its domain)',
  s3: 'Step 3: Open one: check how the due date is displayed (Odoo: the same list switched to kanban - the card, then the ticket form)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const CS_TEAM_ID = 1; // helpdesk.team "Customer Support" (team 1 - measured 2026-10-28)
const OVERDUE_DOMAIN = [['overdue_pass', '!=', false]]; // the search view's "Overdue Tickets" filter (measured 2026-10-28)
const OPEN_DOMAIN = [['stage_id.is_close', '=', false]]; // the search view's "Open Tickets" filter

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

/** Now in UTC as Odoo stores datetimes: 'YYYY-MM-DD HH:mm:ss'. */
function nowUtcOdoo(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** True for a CSS colour that reads as red (rgb with a strong red and weak green / blue). */
function isRed(css: string): boolean {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return !!m && +m[1] >= 150 && +m[2] <= 90 && +m[3] <= 90;
}

test.describe(`${TC} - Overdue flag and filter on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    console.log('  - Read-only case: nothing was created or changed - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Overdue flag and filter - A: Odoo 12 lists only non-Closed tickets due before now and shows their Due Date red`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    let listDomain: unknown[] = [];
    let total = -1;
    let picked = '';
    let noted: string[] = [];

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
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l2' = Support L2)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer (employee Support Team = Support L2)').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const now = nowUtcOdoo();
      const notClosed = await helpdeskPage.countTicketsOverRpc([['team_id', '=', CS_TEAM_ID], ['overdue', '<', now], ['stage_id.is_close', '=', false]]);
      const closed = await helpdeskPage.countTicketsOverRpc([['team_id', '=', CS_TEAM_ID], ['overdue', '<', now], ['stage_id.is_close', '=', true]]);
      console.log(`  - now (UTC)                                         : ${now}`);
      console.log(`  - CS tickets, Due Date < now, NOT Closed (search_count) : ${notClosed}`);
      console.log(`  - CS tickets, Due Date < now, Closed (search_count)     : ${closed}`);
      expect(notClosed, 'at least one CS ticket is past due and not Closed').toBeGreaterThan(0);
      expect(closed, 'at least one Closed CS ticket has a past due date').toBeGreaterThan(0);
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      const before = await helpdeskPage.getSearchFacets();
      console.log(`  - Facets on opening : ${JSON.stringify(before)}`);
      await helpdeskPage.chooseSearchFilter('Overdue Tickets');
      const after = await helpdeskPage.getSearchFacets();
      console.log(`  - Facets now        : ${JSON.stringify(after)}`);
      // The list is the AND of its facets: known filters from the search view, anything else a saved search (ir.filters).
      listDomain = [];
      for (const f of after) {
        if (/ or /i.test(f)) throw new Error(`facet "${f}" ORs several filters - not modelled by this spec`);
        const part = f === 'Overdue Tickets' ? OVERDUE_DOMAIN : f === 'Open Tickets' ? OPEN_DOMAIN : await helpdeskPage.readSavedFilterDomain(f);
        console.log(`  - Facet "${f}" = ${JSON.stringify(part)}`);
        listDomain.push(...part);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the Overdue Tickets filter is applied', expected: 'a search facet reading "Overdue Tickets"', actual: JSON.stringify(after), passed: after.some((f) => /Overdue Tickets/.test(f)) },
      ], `${TC} - Step 1 facets`, ['.o_searchview_facet']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const now = nowUtcOdoo();
      total = await helpdeskPage.getPagerTotal();
      const ids = await helpdeskPage.getListRowTicketIds(5);
      noted = ids;
      const domainCount = await helpdeskPage.countTicketsOverRpc(listDomain);
      const closedInList = await helpdeskPage.countTicketsOverRpc([...listDomain, ['stage_id.is_close', '=', true]]);
      const notDueInList = await helpdeskPage.countTicketsOverRpc([...listDomain, '|', ['overdue', '=', false], ['overdue', '>=', now]]);
      console.log(`  - Pager total                 : ${total}`);
      console.log(`  - 5 numbers noted             : ${ids.join(', ')}`);
      console.log(`  [INTERNAL check, Call API] search_count over the list domain ${JSON.stringify(listDomain)} (now = ${now} UTC):`);
      console.log(`     all                         = ${domainCount}`);
      console.log(`     Closed                      = ${closedInList}`);
      console.log(`     Due Date empty or >= now    = ${notDueInList}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the list is counted', expected: 'a pager total above 0, equal to the search_count of the list domain (the count is the list)', actual: `pager ${total}, search_count ${domainCount}`, passed: total > 0 && total === domainCount },
        { what: 'Step 2 the list holds no Closed ticket', expected: '0 Closed tickets in the list', actual: String(closedInList), passed: closedInList === 0 },
        { what: 'Step 2 every ticket in the list has a due date before now', expected: '0 tickets with an empty Due Date or one at or after now', actual: String(notDueInList), passed: notDueInList === 0 },
      ], `${TC} - Step 2 list and pager`, ['.o_list_view', '.o_pager_counter']);
      const perRow: Check[] = [];
      for (const id of ids) {
        const row = await helpdeskPage.readTicketOverRpc(id, ['overdue', 'stage_id']);
        const closedRow = await helpdeskPage.countTicketsOverRpc([['id', '=', Number(id)], ['stage_id.is_close', '=', true]]);
        const due = String(row.overdue || '');
        const stage = Array.isArray(row.stage_id) ? String(row.stage_id[1]) : '';
        console.log(`  - #${id}: stage ${stage} | Due Date (UTC) ${due || '(empty)'}`);
        perRow.push({ what: `Step 2 row #${id} is non-Closed and due before now`, expected: `not Closed, Due Date < ${now} UTC`, actual: `${stage}${closedRow ? ' (Closed)' : ''}, ${due || '(empty)'}`, passed: closedRow === 0 && !!due && due < now });
      }
      expect(ids.length, 'the list shows at least 5 rows to note').toBe(5);
      await recordChecks(page, testInfo, checks, perRow, `${TC} - Step 2 five rows`, ['.o_list_view tbody']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await helpdeskPage.switchToKanbanView();
      // One of the 5 noted tickets whose card the kanban draws (a column lazy-loads its cards), found by its subject.
      let card = { found: false, text: '', className: '', color: '' };
      for (const id of noted) {
        const subject = String((await helpdeskPage.readTicketOverRpc(id, ['name'])).name || '');
        card = await helpdeskPage.getKanbanCardDueDateStyle(subject);
        console.log(`  - #${id} "${subject.slice(0, 80)}" : card ${card.found ? 'drawn' : 'not drawn'}`);
        if (card.found) { picked = id; break; }
      }
      expect(picked, 'the kanban draws the card of one of the 5 noted tickets').not.toBe('');
      console.log(`  - Kanban card Due Date : "${card.text}" | class "${card.className}" | colour ${card.color}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 3 kanban card #${picked} shows its Due Date red`, expected: 'the Due Date block carries oe_kanban_text_red and reads red', actual: `"${card.text}" class "${card.className}" colour ${card.color}`, passed: card.found && /oe_kanban_text_red/.test(card.className) && isRed(card.color) },
      ], `${TC} - Step 3 kanban card Due Date`, [HelpdeskPage.KANBAN_DUE]);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, picked);
      const form = await helpdeskPage.getVisibleDueDateStyle();
      console.log(`  - Form Due Date : "${form.text}" | colour ${form.color}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 3 form of #${picked} shows its Due Date red`, expected: 'the visible Due Date reads red (rgb(255, 0, 0) - the overdue variant of the field)', actual: `"${form.text}" colour ${form.color || '(no visible Due Date)'}`, passed: !!form.text && isRed(form.color) },
      ], `${TC} - Step 3 form Due Date`, ['.o_form_view [name="overdue"]']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - overdue ticket opened');
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
        : `OVERALL: PASS - Overdue Tickets lists ${total} non-Closed tickets due before now; the Due Date of #${picked} is red on kanban and form`);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'every Overdue check holds').toEqual([]);
    });
  });
});
