import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-FLOW-020_B - Overdue flag and 'Overdue Tickets' filter - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-020_B   (side B of the A/B row TC-FLOW-020; side A = tc-flow-020-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig)
 * Data             : READ ONLY - existing migrated CS tickets; nothing is created. Filters > Overdue Tickets opens a PUBLIC
 *                    preset view and leaves the user's own saved list state (his default HD View) as it was - this is
 *                    snapshotted in Pre-condition 1 and compared (restored if it ever differs) in afterEach.
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "5. Service-level targets" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0276; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-020_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/5. Service-level targets/tc-flow-020-a-preprod-overdue-flag-and-filter.spec.ts)
 *                    - same list rule (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * All Tickets > Filters > Overdue Tickets must list no Closed ticket and only tickets past their due date (counter, 5 rows,
 * and the whole view counted); one overdue ticket must show its past due date visibly flagged.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-020-b-support --grep "TC-FLOW-020_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-020- --grep "TC-FLOW-020_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 109 = row TC-FLOW-020 (Area Ticket lifecycle & workflow,
 *                   Feature "Overdue flag and 'Overdue Tickets' filter", High, happy, L2 engineer, refs E11, LC-014) - 3 steps
 *  Source version : fingerprint 7894a57626a9308c = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "At least one CS ticket whose due date is in the past and which is not Closed, and one
 *  Closed ticket with a past due date (migrated tickets are fine).")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record; the user's
 *       saved list state (default HD View) is snapshotted
 *    2. [INTERNAL check, Call API] at least one NAKIVO Customer Support ticket with Due Date < now that is not Closed, and at
 *       least one Closed one with Due Date < now (counted, nothing created - CSV test data: "Existing migrated CS tickets;
 *       read-only.")
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Open the ticket list. FF: All Tickets > Filters > Overdue Tickets.
 *    2. Count the tickets and note 5 numbers.
 *    3. Open one: check how the due date is displayed.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The same tickets as Odoo for the same moment (staging data lag aside); past due dates are visibly flagged; no Closed
 *    ticket is listed.
 *
 *  How the list is checked: the Overdue Tickets view filters custom_overdue_pass = 1 (HD View NK-VIEW-OVERDUE-TICKETS) and
 *  the list leaves archived tickets out (custom_archived = 1; get_list_data counted 471 = 472 - 1 archived, measured
 *  2026-10-28). That filter is counted over REST - it must equal the list's "<n> of <total>" counter (proves it is
 *  the list) - then its Closed tickets and its tickets whose Due Date is empty or not yet past are counted: both must be 0.
 *  Due dates are stored in the server's zone (Asia/Ho_Chi_Minh, measured 2026-10-28), so "now" is written in that zone.
 *  "The same tickets as Odoo" is printed as an Observation, not scored: pre-production holds the 22-Jan-2026 Odoo snapshot
 *  and the Support service holds tickets copied up to 2026-08-27, so the two lists cannot be equal at the same moment.
 *  "Visibly flagged" (measured 2026-10-28): the side panel of an overdue ticket shows a row "Overdue" = Yes; the Due Date
 *  itself is drawn in the normal text colour, which is printed as an Observation.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (the Filters menu, before choosing); Step 2 verify shots (the
 * counter; the 5 rows); Step 3 verify shot (the Overdue row of the opened ticket); one end-of-section shot after Step 3.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-020_B';
const SOURCE_ROW = 'TC-FLOW-020';
const SOURCE_FINGERPRINT = '7894a57626a9308c';
const SERVER_ZONE = 'Asia/Ho_Chi_Minh';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2, and his saved list state (default HD View) is noted',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] At least one CS ticket whose due date is in the past and which is not Closed, and one Closed ticket with a past due date (migrated tickets are fine)',
  s1: 'Step 1: Open the ticket list. FF: All Tickets > Filters > Overdue Tickets.',
  s2: 'Step 2: Count the tickets and note 5 numbers (the "<n> of <total>" counter and the first 5 rows; [INTERNAL check, Call API] the whole view is counted by its filter)',
  s3: 'Step 3: Open one: check how the due date is displayed (FF: the first noted ticket, opened by its link; its side panel)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const CS_TEAM = 'NAKIVO Customer Support';
// HD View NK-VIEW-OVERDUE-TICKETS, minus the archived tickets every list leaves out (measured 2026-10-28)
const OVERDUE_FILTER: unknown[][] = [['custom_overdue_pass', '=', 1], ['custom_archived', '!=', 1]];

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

test.describe(`${TC} - Overdue flag and filter on the Support service`, () => {
  let savedView: Awaited<ReturnType<SupportDeskPageMig['readMyDefaultTicketView']>> = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    savedView = null;
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!savedView) console.log('  - No saved list state was noted - nothing to compare');
      else console.log(`  - ${await new SupportDeskPageMig(page).restoreMyDefaultTicketView(ENGINEER.username, savedView)}`);
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Overdue flag and filter - B: Frappe Helpdesk lists no Closed ticket, only past-due ones, and flags the past due date`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    let noted: string[] = [];
    let total = -1;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      savedView = await desk.readMyDefaultTicketView(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] GET HD Agent/<user> + the user\'s default HD View, as Nam:');
      console.log(`     support level     = ${agent.level || '(empty)'}`);
      console.log(`     saved list state  = ${savedView ? `${savedView.name} filters ${savedView.filters}` : '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const now = nowInServerZone();
      const notClosed = await desk.countTicketsOverRest([['agent_group', '=', CS_TEAM], ['custom_overdue', '<', now], ['status', '!=', 'Closed']]);
      const closed = await desk.countTicketsOverRest([['agent_group', '=', CS_TEAM], ['custom_overdue', '<', now], ['status', '=', 'Closed']]);
      console.log(`  - now (${SERVER_ZONE})                                   : ${now}`);
      console.log(`  - CS tickets, Due Date < now, NOT Closed (get_count) : ${notClosed}`);
      console.log(`  - CS tickets, Due Date < now, Closed (get_count)     : ${closed}`);
      expect(notClosed, 'at least one CS ticket is past due and not Closed').toBeGreaterThan(0);
      expect(closed, 'at least one Closed CS ticket has a past due date').toBeGreaterThan(0);
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openAllTicketsFromSidebar();
      const groups = await desk.openFiltersMenuGroups();
      const offered = groups.some((g) => g.entries.includes('Overdue Tickets'));
      console.log(`  - Filters menu offers "Overdue Tickets" : ${offered}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the Filters menu offers Overdue Tickets', expected: '"Overdue Tickets" is an entry of the Filters menu', actual: offered ? 'offered' : 'NOT offered', passed: offered },
      ], `${TC} - Step 1 Filters menu`, [SupportDeskPageMig.MENU], 'top-right');
      await desk.chooseFiltersMenuEntry('Overdue Tickets');
      const crumbs = await desk.getHeaderCrumbs();
      console.log(`  - Crumbs now : ${crumbs} | url ${page.url()}`);
      expect(page.url(), 'the Overdue Tickets view is open').toContain('view=NK-VIEW-OVERDUE-TICKETS');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const now = nowInServerZone();
      const counter = await desk.getListCounter();
      total = counter.total;
      noted = await desk.getListTicketNames(5);
      const viewCount = await desk.countTicketsOverRest(OVERDUE_FILTER);
      const closedInView = await desk.countTicketsOverRest([...OVERDUE_FILTER, ['status', '=', 'Closed']]);
      const notPastInView = await desk.countTicketsOverRest([...OVERDUE_FILTER, ['custom_overdue', '>=', now]]) +
        await desk.countTicketsOverRest([...OVERDUE_FILTER, ['custom_overdue', 'is', 'not set']]);
      console.log(`  - Counter                     : "${counter.text}" -> total ${total}`);
      console.log(`  - 5 numbers noted             : ${noted.join(', ')}`);
      console.log(`  [INTERNAL check, Call API] get_count over ${JSON.stringify(OVERDUE_FILTER)} (now = ${now} ${SERVER_ZONE}):`);
      console.log(`     all                          = ${viewCount}`);
      console.log(`     Closed                       = ${closedInView}`);
      console.log(`     Due Date empty or >= now     = ${notPastInView}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the list is counted', expected: 'a total above 0, equal to the get_count of the view filter (the count is the list)', actual: `counter ${total}, get_count ${viewCount}`, passed: total > 0 && total === viewCount },
        { what: 'Step 2 no Closed ticket is listed', expected: '0 Closed tickets in the view', actual: String(closedInView), passed: closedInView === 0 },
        { what: 'Step 2 every listed ticket is past its due date', expected: '0 tickets with an empty Due Date or one not yet past', actual: String(notPastInView), passed: notPastInView === 0 },
      ], `${TC} - Step 2 counter`, ['body'], 'top-right');
      const perRow: Check[] = [];
      for (const n of noted) {
        const doc = await desk.readTicketDocument(n);
        const due = String(doc.custom_overdue || '');
        console.log(`  - ${n}: status ${doc.status} | Due Date ${due || '(empty)'}`);
        perRow.push({ what: `Step 2 row ${n} is not Closed and past its due date`, expected: `status != Closed, Due Date < ${now}`, actual: `${doc.status}, ${due || '(empty)'}`, passed: doc.status !== 'Closed' && !!due && due < now });
      }
      expect(noted.length, 'the list shows at least 5 rows to note').toBe(5);
      await recordChecks(page, testInfo, checks, perRow, `${TC} - Step 2 five rows`, ['body'], 'top-right');
      console.log(`  Observation (not scored) - "the same tickets as Odoo": Support service lists ${total} overdue tickets; pre-production`);
      console.log('     holds a different snapshot (22-Jan-2026 Odoo DB vs tickets copied up to 2026-08-27), see TC-FLOW-020_A for its count');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const first = noted[0];
      await desk.openTicketByLink(baseUrl_support_mig, first);
      const rows = await desk.getSidePanelRows();
      const due = rows.find((r) => r.label === 'Due Date')?.value || '';
      const flag = rows.find((r) => r.label === 'Overdue')?.value || '';
      const dueColor = await page.evaluate(() => {
        const cap = Array.from(document.querySelectorAll('span[data-grace-area-trigger]')).find((s) => (s.textContent || '').trim() === 'Due Date');
        const input = cap?.parentElement?.parentElement?.querySelector('input') as HTMLInputElement | null;
        return input ? getComputedStyle(input).color : '';
      });
      console.log(`  - Ticket ${first}: Due Date "${due || '(row not shown)'}" | Overdue "${flag || '(row not shown)'}"`);
      console.log(`  Observation (not scored) - Due Date text colour : ${dueColor || '(n/a)'}`);
      await desk.markPanelRow('Overdue');
      await recordChecks(page, testInfo, checks, [
        { what: `Step 3 ticket ${first} flags its past due date`, expected: 'the side panel shows the Due Date and a row "Overdue" = Yes', actual: `Due Date "${due || '(none)'}", Overdue "${flag || '(none)'}"`, passed: !!due && flag === 'Yes' },
      ], `${TC} - Step 3 overdue flag`, [SupportDeskPageMig.PANEL_ROW]);
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
        : `OVERALL: PASS - Overdue Tickets lists ${total} tickets, none Closed, all past due; the opened ticket flags it (Overdue = Yes)`);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'every Overdue check holds').toEqual([]);
    });
  });
});
