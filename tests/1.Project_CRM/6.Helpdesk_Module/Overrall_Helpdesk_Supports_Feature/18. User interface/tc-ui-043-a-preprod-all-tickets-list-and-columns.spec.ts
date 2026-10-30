import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-043_A - All Tickets landing list and columns - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-043_A   (side A of the A/B row TC-UI-043; side B = tc-ui-043-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted; users.support_l1_giang_preprod)
 * Data             : READ ONLY - nothing is created or changed (search facets live in the browser tab only)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "18. User interface" = the
 *                    Spec area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-UI-0014;
 *                    the TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Pair             : TC-UI-043_B - .../Migration-Customer_Support/18. User interface/tc-ui-043-b-support-all-tickets-list-and-columns.spec.ts
 *
 * Summary
 * -------
 * Helpdesk > All Tickets must open as a list with the 'Open Tickets' filter and the columns Subject (#id), Customer,
 * Classification, Created on, Assigned to, Priority, Stage, Interaction Round, Wrongly escalated to L2 by - in that order.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-043-a-preprod --grep "TC-UI-043_A:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 262 = row TC-UI-043 (Ticket screens, lists & search,
 *                   "All Tickets landing list and columns", High, ui, L1 agent, refs E35, UI-048, U44) - 3 steps
 *  Source version : fingerprint 1b54e56c71264df6 of Preconditions + Steps + A expected + Test data; beforeEach
 *                   fails OUT OF SYNC when the row changed.
 *  Pre-conditions (CSV, verbatim: "Agent account in both systems.")
 *    1. Logged in as an agent - L1 agent Giang Le on pre-production
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: Helpdesk > All Tickets; note the active filter and the list columns in order.
 *    2. FF: sidebar All Tickets; note the selected view and the column headers in order. - N/A on side A
 *    3. FF: read the assignee names in a few rows. - N/A on side A
 *  Verification - A expected (Odoo 12), verbatim
 *    List view first with the 'Open Tickets' filter; columns Subject (#id), Customer, Classification, Created on, Assigned
 *    to, Priority, Stage, Interaction Round, Wrongly escalated to L2 by.
 *
 *  The active filter (measured 2026-10-28): the All Tickets action defaults to 'Open Tickets' (search_default_is_open), but
 *  Odoo applies an agent's OWN default saved search instead when he has one - Giang has "All Tickets222", Vince "Default",
 *  Nam "L2-Tickets". So the filter check reads [INTERNAL check, Call API] the action's default and the agent's own default:
 *  with no own default the facet must be 'Open Tickets'; with one, the action's default must still be is_open and the facet
 *  must be that saved search (both printed). "Subject (#id)" is the first column, checked on its cells ("<subject> (#<id>)") -
 *  Odoo heads it "Display Name" (printed); the other eight columns are compared by their labels, in order.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shots (the search facets; the list header); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-043_A';
const SOURCE_ROW = 'TC-UI-043';
const SOURCE_FINGERPRINT = '1b54e56c71264df6';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  s1: 'Step 1: Odoo: Helpdesk > All Tickets; note the active filter and the list columns in order. ([INTERNAL check, Call API] the action default and the agent\'s own default saved search)',
  s2: 'Step 2: [N/A on side A - the FF list belongs to TC-UI-043_B] FF: sidebar All Tickets; note the selected view and the column headers in order.',
  s3: 'Step 3: [N/A on side A - FF only] FF: read the assignee names in a few rows.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
/**
 * The CSV's columns. "Subject (#id)" describes the first column's CONTENT ("<subject> (#<id>)") - it is checked on its cells,
 * whatever its header reads (Odoo heads it "Display Name", printed as an observation); the other eight by their labels.
 */
const EXPECTED_COLUMNS = ['Subject (#id)', 'Customer', 'Classification', 'Created on', 'Assigned to', 'Priority', 'Stage', 'Interaction Round', 'Wrongly escalated to L2 by'];

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

/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - All Tickets landing list on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing was created or changed - nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: All Tickets landing list and columns - A: Odoo 12 opens a list on Open Tickets with the nine columns in order`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production (${baseUrl})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}   ('l1' = Support L1)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      const isList = await helpdeskPage.isListViewShown();
      const facets = await helpdeskPage.getSearchFacets();
      const defaults = await helpdeskPage.readAllTicketsDefaults();
      const headers = await helpdeskPage.getListHeaders();
      console.log(`  - View on opening        : ${isList ? 'list' : 'NOT list'}`);
      console.log(`  - Active filter (facets) : ${JSON.stringify(facets)}`);
      console.log(`  [INTERNAL check, Call API] action context = ${defaults.actionContext} | own default saved search = "${defaults.myDefaultFavorite || '(none)'}"`);
      console.log(`  - Columns in order       : ${JSON.stringify(headers)}`);
      const actionOpen = /search_default_is_open['"]?\s*:\s*(True|1)/.test(defaults.actionContext);
      const filterOk = defaults.myDefaultFavorite
        ? actionOpen && facets.length === 1 && facets[0] === defaults.myDefaultFavorite
        : facets.length === 1 && facets[0] === 'Open Tickets';
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the list view comes first', expected: 'All Tickets opens as a list', actual: isList ? 'list' : 'not a list', passed: isList },
        { what: "Step 1 the 'Open Tickets' filter", expected: defaults.myDefaultFavorite ? `the action defaults to Open Tickets (search_default_is_open); this agent's own default "${defaults.myDefaultFavorite}" is applied instead` : "one facet: 'Open Tickets'", actual: `facets ${JSON.stringify(facets)}; action context ${defaults.actionContext}`, passed: filterOk },
      ], `${TC} - Step 1 active filter`, ['.o_searchview_facet']);
      const firstCells = await helpdeskPage.getListColumnTexts(0, 5);
      const firstIsSubjectId = firstCells.length > 0 && firstCells.every((t) => /\(#\d+\)\s*$/.test(t));
      console.log(`  - First column cells     : ${JSON.stringify(firstCells)}`);
      console.log(`  Observation (not scored) - the first column's header reads "${headers[0] || ''}"`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the first column is Subject (#id)', expected: 'its cells read "<subject> (#<id>)"', actual: JSON.stringify(firstCells.slice(0, 3)), passed: firstIsSubjectId },
        { what: 'Step 1 the other columns in order', expected: EXPECTED_COLUMNS.slice(1).join(' | '), actual: headers.slice(1).join(' | ') || '(none)', passed: JSON.stringify(headers.slice(1)) === JSON.stringify(EXPECTED_COLUMNS.slice(1)) },
      ], `${TC} - Step 1 list columns`, ['.o_list_view thead']);
    });

    await test.step(STEP.s2, async () => { console.log(`\n--- ${STEP.s2} ---\n  - N/A on side A (TC-UI-043_B)`); });
    await test.step(STEP.s3, async () => { console.log(`\n--- ${STEP.s3} ---\n  - N/A on side A (TC-UI-043_B)`); });

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
      console.log(failed.length ? `OVERALL: FAIL - ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - All Tickets opens as a list on Open Tickets with the nine columns in order');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the landing list matches').toEqual([]);
    });
  });
});
