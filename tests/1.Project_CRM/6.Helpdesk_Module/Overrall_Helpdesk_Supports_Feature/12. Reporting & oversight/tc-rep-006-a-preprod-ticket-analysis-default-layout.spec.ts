import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-REP-006_A - Helpdesk Ticket Analysis opens with Odoo's default layout - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-REP-006_A   (side B = tc-rep-006-b-support-ticket-analysis-default-layout.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-05
 * Jira             : CRM-13956 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / Helpdesk Manager Julia Petrenko (users.helpdesk_manager_julia_preprod;
 *                    helpdesk.group_helpdesk_manager asserted) - the "CS manager" of the TC
 * Data             : READ ONLY - no data change
 * Folder           : "12. Reporting & oversight" (master divider)
 *
 * Summary: Helpdesk > Reporting > Tickets must offer a pivot with rows Team, columns Stage, measure Count and totals, and a
 * graph that is a stacked bar of Team x Stage.
 *
 * Command to run: npx playwright test tc-rep-006-a-preprod --grep "TC-REP-006_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 434 = row TC-REP-006 (Reports & dashboards, High, ui,
 *                     CS manager, refs E30, E30-T3, RP-002, RP-026); Comparison = same. Xray CRM-13956: 3 steps
 *  Source version   : fingerprint 250708ff873774f4 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: CS manager. Odoo: a test user in the group Helpdesk / Manager; FF: a test user with the role Agent Manager (the same
 *    person's account on both if possible). FF staging holds the 10,618 CS tickets copied from production (ticket content up to
 *    2026-08-27) and the report history loaded up to 2026-10-16 12:48 UTC; compare a closed past period both hold.
 *    Test data: Any manager; no data change.
 *    1. Logged in as Helpdesk Manager Julia Petrenko on pre-production
 *  Steps to reproduce
 *    1. Odoo: Helpdesk > Reporting > Tickets.
 *       (pre-production opens this report on the GRAPH view - action 469 lists its graph view before the pivot)
 *    2. Note the rows, columns, measure and view type.
 *       (the Pivot is opened with the view switcher to read its rows and columns)
 *    3. Switch to the graph view.
 *  Verification - A expected (Odoo 12), verbatim
 *    Pivot: rows Team, columns Stage, measure Count, with totals. Graph: stacked bar Team x Stage.
 *
 *  How it is compared (automation author's reading, printed in every run): Odoo 12 prints no group-by field name in a pivot,
 *  so the axes are recognised by their VALUES - every row head is a helpdesk team name (or "Undefined"), every column head a
 *  helpdesk stage name (Odoo suffixes a repeated name with " (2)"); the measure row reads only "Count"; the "Total" heads of
 *  both axes are drawn. Graph: the bar button is active, nvd3's "Stacked" control is the chosen one, the x labels are team
 *  names and the legend stage names. The view the report OPENS on is printed (the A expected does not name it).
 *  Scoring of "stacked bar" (tester 2026-11-06, option 3 - replaces "Step 3 scored, kept RED"): the report opens on a
 *  STACKED graph, but after Pivot -> Graph (Step 3) pre-production redraws it GROUPED. Verify #5 is scored on the graph as
 *  the report OPENS - the "view type" Step 2 notes; the Grouped redraw of Step 3 is printed as an Observation, not scored.
 *  Should the report ever open on another view, Verify #5 falls back to the first graph drawn (Step 3).
 *
 * Evidence: Pre-condition 1 end shot; Step 2 verify shots (graph as opened, pivot heads); Step 3 verify shot (graph +
 * switcher); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-REP-006_A';
const SOURCE_ROW = 'TC-REP-006';
const SOURCE_FINGERPRINT = '250708ff873774f4';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as Helpdesk Manager Julia Petrenko on pre-production (Odoo 12 EE); [INTERNAL check, Call API] group Helpdesk / Manager',
  s1: 'Step 1: Odoo: Helpdesk > Reporting > Tickets. (pre-production opens it on the Graph view - action 469 lists its graph view first)',
  s2: 'Step 2: Note the rows, columns, measure and view type. (the Pivot is opened with the view switcher to read its rows and columns)',
  s3: 'Step 3: Switch to the graph view.',
  verify: 'Verification',
} as const;

const MANAGER = users.helpdesk_manager_julia_preprod;

type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual), ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}
/** A pivot / graph label without Odoo's " (2)" de-duplication suffix. */
const bare = (s: string): string => s.replace(/\s\(\d+\)$/, '');
/** nvd3 prints a long legend label cut + the full one ("Preparing Answer (L1...Preparing Answer (L1)"): the full name ends it. */
const named = (label: string, names: Set<string>): boolean => names.has(bare(label)) || Array.from(names).some((n) => label.endsWith(n));
type Graph = Awaited<ReturnType<HelpdeskPage['readOdooGraph']>>;
const graphState = (g: Graph): string => `${g.mode || '(no mode)'} chart, ${g.stacked === null ? 'no Grouped/Stacked control' : g.stacked ? 'Stacked' : 'Grouped'}`;
/** Verify #5 - the A expected's "stacked bar". */
const stackedCheck = (what: string, g: Graph): Check => ({ what, expected: 'bar chart, Stacked', actual: graphState(g), passed: g.mode === 'bar' && g.stacked === true,
  difference: `${g.mode !== 'bar' ? `chart ${g.mode || '(none)'}, not bar; ` : ''}${g.stacked !== true ? 'not stacked' : ''}` });

test.describe(`${TC} - Helpdesk Ticket Analysis default layout on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - read only: nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Helpdesk Ticket Analysis default layout - A: pivot rows Team, columns Stage, measure Count with totals; graph stacked bar Team x Stage`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];
    const teams = new Set<string>(['Undefined']);
    const stages = new Set<string>(['Undefined']);
    let openingGraph: Graph | null = null;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${MANAGER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginBackendUser(MANAGER.username, MANAGER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const manager = await hp.hasGroupOverRpc('helpdesk.group_helpdesk_manager');
      (await hp.searchReadOverRpc('helpdesk.team', [['active', 'in', [true, false]]], ['name'], 200)).forEach((t) => teams.add(String(t.name)));
      (await hp.searchReadOverRpc('helpdesk.stage', [], ['name'], 500)).forEach((s) => stages.add(String(s.name)));
      console.log(`  [INTERNAL check, Call API] helpdesk.group_helpdesk_manager = ${manager}; ${teams.size - 1} team names, ${stages.size - 1} stage names read for the axis checks`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Julia Petrenko');
      expect(manager, 'the signed-in account is a Helpdesk Manager').toBe(true);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hp.navigateToHelpdesk();
      await hp.openReportingEntry('Tickets');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const opened = await hp.readReportScreen();
      console.log(`  Observation (not scored) - "${opened.title}" opened on the ${opened.activeView || '(unknown)'} view; views offered ${JSON.stringify(opened.views)}; facets ${JSON.stringify(opened.facets)}`);
      // tester 2026-11-06 (option 3): the "stacked bar" is scored on the graph as the report OPENS - the view type Step 2
      // notes. Its shot is taken now, while it is on screen; the check joins `checks` after the pivot's 4 (Verify #5).
      const opening: Check[] = [];
      if (opened.activeView === 'graph') {
        openingGraph = await hp.readOdooGraph();
        console.log(`  - graph as the report opens: ${graphState(openingGraph)}`);
        await recordChecks(page, testInfo, opening, [stackedCheck('Step 2 graph as the report opens is a stacked bar', openingGraph)],
          `${TC} - Step 2 graph as opened`, [HelpdeskPage.GRAPH_VIEW, HelpdeskPage.REPORT_SWITCHER]);
      }
      if (opened.activeView !== 'pivot') await hp.switchReportView('pivot');
      const p = await hp.readOdooPivot();
      console.log(`  - pivot rows ${JSON.stringify(p.rowHeads)}\n  - pivot columns ${JSON.stringify(p.colHeads)}\n  - measures ${JSON.stringify(p.measures)}, column total ${p.colTotal}, row total ${p.rowTotal}`);
      const badRows = p.rowHeads.filter((r) => !teams.has(bare(r)));
      const badCols = p.colHeads.filter((c) => !stages.has(bare(c)));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 pivot rows = Team', expected: 'every row head is a helpdesk team', actual: `${p.rowHeads.length} row heads: ${p.rowHeads.join(', ')}`, passed: p.rowHeads.length > 0 && !badRows.length,
          difference: p.rowHeads.length ? `not a team: ${badRows.join(', ')}` : 'the pivot draws no row head' },
        { what: 'Step 2 pivot columns = Stage', expected: 'every column head is a helpdesk stage', actual: `${p.colHeads.length} column heads: ${p.colHeads.join(', ')}`, passed: p.colHeads.length > 0 && !badCols.length,
          difference: p.colHeads.length ? `not a stage: ${badCols.join(', ')}` : 'the pivot draws no column head' },
        { what: 'Step 2 pivot measure = Count', expected: 'Count', actual: p.measures.join(', ') || '(none)', passed: JSON.stringify(p.measures) === JSON.stringify(['Count']),
          difference: `measures ${JSON.stringify(p.measures)}, expected ["Count"]` },
        { what: 'Step 2 pivot with totals', expected: 'a "Total" head on the rows and on the columns', actual: `row total ${p.rowTotal ? 'drawn' : 'absent'}, column total ${p.colTotal ? 'drawn' : 'absent'}`,
          passed: p.rowTotal && p.colTotal, difference: `${p.rowTotal ? '' : 'no row Total; '}${p.colTotal ? '' : 'no column Total'}` },
      ], `${TC} - Step 2 pivot layout`, [HelpdeskPage.PIVOT_HEAD, HelpdeskPage.PIVOT_ROW_HEADS]);
      checks.push(...opening);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await hp.switchReportView('graph');
      const g = await hp.readOdooGraph();
      console.log(`  - graph mode ${g.mode}, stacked ${g.stacked}\n  - x labels ${JSON.stringify(g.xLabels)}\n  - legend ${JSON.stringify(g.legend)}`);
      const badX = g.xLabels.filter((x) => !teams.has(bare(x)));
      const badL = g.legend.filter((l) => !named(l, stages));
      if (openingGraph) console.log(`  Observation (not scored) - after Pivot -> Graph the graph is redrawn as: ${graphState(g)} (it opened as: ${graphState(openingGraph)})`);
      await recordChecks(page, testInfo, checks, [
        // the report did not open on the graph: the first graph drawn is this one
        ...(openingGraph ? [] : [stackedCheck('Step 3 graph is a stacked bar (the report did not open on the graph)', g)]),
        { what: 'Step 3 graph Team x Stage', expected: 'x axis = team names, series = stage names', actual: `x: ${g.xLabels.join(', ')} | series: ${g.legend.join(', ')}`,
          passed: g.xLabels.length > 0 && !badX.length && g.legend.length > 0 && !badL.length,
          difference: [g.xLabels.length ? (badX.length ? `x labels not teams: ${badX.join(', ')}` : '') : 'no x label', g.legend.length ? (badL.length ? `series not stages: ${badL.join(', ')}` : '') : 'no series'].filter(Boolean).join('; ') },
      ], `${TC} - Step 3 graph`, [HelpdeskPage.GRAPH_VIEW, HelpdeskPage.REPORT_SWITCHER]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - graph view');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - pivot Team x Stage, Count, totals; graph stacked bar Team x Stage');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the pivot and the graph').toBe(6);
      expect(failed.map((c) => c.what), 'the Ticket Analysis default layout').toEqual([]);
    });
  });
});
