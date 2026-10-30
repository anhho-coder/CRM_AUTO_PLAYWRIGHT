import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-061_A - Kanban columns and counts - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-061_A   (side B = tc-ui-061-b-support-kanban-columns-and-counts.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY
 * Folder           : "User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014 (automation author's mapping)
 *
 * Summary: All Tickets switched to kanban must group the tickets by stage, each column showing a count.
 * Command to run: npx playwright test tc-ui-061-a-preprod --grep "TC-UI-061_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 280 = row TC-UI-061 (Ticket screens, lists & search,
 *                     "Kanban columns and counts", High, ui, L1 agent, refs E35, UI-050) - 3 steps
 *  Source version   : fingerprint 0dc9feb4d17d9825 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "Agent account; Open Tickets view.")
 *    1. Logged in as L1 agent Giang Le on pre-production
 *    2. Open Tickets view: Helpdesk > All Tickets, then Filters > Open Tickets when it is not already the active filter (the
 *       agent's own default saved search may replace it - measured 2026-10-28); every facet is printed
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: switch All Tickets to kanban; note the columns and counts.
 *    2. FF: click 'Kanban' next to the title; ... - N/A on side A
 *    3. FF: click 'List' to go back. - N/A on side A
 *  Verification - A expected (Odoo 12), verbatim
 *    Columns grouped by stage with counts.
 *
 *  "Grouped by stage with counts" is checked as: at least one column; every column title is a CS stage name (the stage
 *  registry is read, [INTERNAL check, Call API]); every column shows a numeric count; and the counts add up to the list's
 *  pager total of the same view (baseline-then-compare on one screen, no absolute number).
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the kanban columns); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-061_A';
const SOURCE_ROW = 'TC-UI-061';
const SOURCE_FINGERPRINT = '0dc9feb4d17d9825';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: Open Tickets view - Helpdesk > All Tickets; Filters > Open Tickets when it is not the active filter',
  s1: 'Step 1: Odoo: switch All Tickets to kanban; note the columns and counts. ([INTERNAL check, Call API] the CS stage names; the list total of the same view is noted first)',
  s2: "Step 2: [N/A on side A - FF only] FF: click 'Kanban' next to the title; note the crumb, the total, the columns and their counts.",
  s3: "Step 3: [N/A on side A - FF only] FF: click 'List' to go back.",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;

type Check = { what: string; expected: string; actual: string; passed: boolean };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - Kanban columns and counts on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Kanban columns and counts - A: Odoo 12 groups the Open Tickets view by stage with a count per column`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    let listTotal = -1;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      let facets = await helpdeskPage.getSearchFacets();
      if (!facets.includes('Open Tickets')) await helpdeskPage.chooseSearchFilter('Open Tickets');
      facets = await helpdeskPage.getSearchFacets();
      listTotal = await helpdeskPage.getPagerTotal();
      console.log(`  - Facets : ${JSON.stringify(facets)} | list total ${listTotal}`);
      expect(facets.some((f) => /Open Tickets/.test(f)), 'the Open Tickets filter is active').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Open Tickets view');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.switchToKanbanView();
      const cols = await helpdeskPage.getKanbanColumnCounts();
      const stages = await helpdeskPage.readCsStageNamesOverRpc();
      const sum = cols.reduce((a, c) => a + (c.count > 0 ? c.count : 0), 0);
      for (const c of cols) console.log(`     ${c.column.padEnd(26)} ${c.count}`);
      console.log(`  - Sum of the counts ${sum} | list total ${listTotal} | CS stages ${JSON.stringify(stages)}`);
      const notStage = cols.filter((c) => !stages.includes(c.column)).map((c) => c.column);
      const noCount = cols.filter((c) => !(c.count >= 0)).map((c) => c.column);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the columns are the stages', expected: 'at least one column, every title a CS stage', actual: cols.length ? (notStage.length ? `not stages: ${notStage.join(', ')}` : `${cols.length} columns, all stages`) : 'no column', passed: cols.length > 0 && notStage.length === 0 },
        { what: 'Step 1 every column shows its count', expected: 'a number on every column; together they add up to the view\'s list total', actual: `${noCount.length ? `no count: ${noCount.join(', ')}; ` : ''}sum ${sum} vs list total ${listTotal}`, passed: noCount.length === 0 && sum === listTotal },
      ], `${TC} - Step 1 kanban columns`, ['.o_kanban_view']);
    });

    await test.step(STEP.s2, async () => { console.log(`\n--- ${STEP.s2} ---\n  - N/A on side A (TC-UI-061_B)`); });
    await test.step(STEP.s3, async () => { console.log(`\n--- ${STEP.s3} ---\n  - N/A on side A (TC-UI-061_B)`); });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the kanban groups the view by stage, each column with its count');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the kanban columns and counts match').toEqual([]);
    });
  });
});
