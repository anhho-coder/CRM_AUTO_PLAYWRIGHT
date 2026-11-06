import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-REP-013_A - Ticket Analysis pivot - rows Team, columns Stage - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-REP-013_A   (side B = tc-rep-013-b-support-pivot-cell-drilldown.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-05
 * Jira             : CRM-13957 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / Helpdesk Manager Julia Petrenko (users.helpdesk_manager_julia_preprod;
 *                    helpdesk.group_helpdesk_manager asserted) - the "CS manager" of the TC
 * Data             : READ ONLY - no data change
 * Folder           : "12. Reporting & oversight" (master divider)
 *
 * Summary: Helpdesk > Reporting > Tickets must show a pivot with rows Team and columns Stage.
 *
 * Command to run: npx playwright test tc-rep-013-a-preprod --grep "TC-REP-013_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 441 = row TC-REP-013 (Reports & dashboards, High, happy,
 *                     CS manager, refs E30, E30-T1, E30-T2, RP-026); Comparison = same. Xray CRM-13957: 1 step
 *  Source version   : fingerprint 555b327114dc6aed of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: CS manager. Odoo: a test user in the group Helpdesk / Manager; FF: a test user with the role Agent Manager (the same
 *    person's account on both if possible). Test data: Any manager; no data change.
 *    1. Logged in as Helpdesk Manager Julia Petrenko on pre-production
 *  Steps to reproduce
 *    1. Open Reporting > Tickets, rows = Team, columns = Stage. (Helpdesk top menu Reporting > Tickets opens on the Graph view -
 *       action 469 lists it first - so the Pivot is opened with the view switcher; it has these axes)
 *  Verification - A expected (Odoo 12), verbatim
 *    The pivot shows rows = Team, columns = Stage.
 *
 *  How it is compared (automation author's reading, printed in every run): Odoo 12 prints no group-by field name in a pivot,
 *  so the axes are recognised by their VALUES - every row head is a helpdesk team name (or "Undefined"), every column head a
 *  helpdesk stage name (Odoo suffixes a repeated name with " (2)").
 *  History: until 2026-11-06 this TC was "Click a pivot cell to list its tickets" (Step 2 click a cell, Step 3 count the list).
 *  The tester removed the cell click from TC-REP-013 A + B on 2026-11-06: the pivot arch of this report
 *  (helpdesk.ticket.pivot.analysis) carries disable_linking="True" (read 2026-11-05) - a click opens nothing on pre-production -
 *  and the requirement the master maps it to (IS-CRM-FUNC-0292) does not mention a cell click.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (pivot heads); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-REP-013_A';
const SOURCE_ROW = 'TC-REP-013';
const SOURCE_FINGERPRINT = '555b327114dc6aed';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as Helpdesk Manager Julia Petrenko on pre-production (Odoo 12 EE); [INTERNAL check, Call API] group Helpdesk / Manager',
  s1: 'Step 1: Open Reporting > Tickets, rows = Team, columns = Stage. (it opens on the Graph view - action 469 lists it first - so the Pivot is opened with the view switcher)',
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
const bare = (s: string): string => s.replace(/\s\(\d+\)$/, '');

test.describe(`${TC} - Ticket Analysis pivot axes on Odoo 12 pre-production`, () => {
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

  test(`${TC}: Ticket Analysis pivot - rows Team, columns Stage - A: the pivot shows rows = Team, columns = Stage`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${MANAGER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginBackendUser(MANAGER.username, MANAGER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const manager = await hp.hasGroupOverRpc('helpdesk.group_helpdesk_manager');
      console.log(`  [INTERNAL check, Call API] helpdesk.group_helpdesk_manager = ${manager}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Julia Petrenko');
      expect(manager, 'the signed-in account is a Helpdesk Manager').toBe(true);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hp.navigateToHelpdesk();
      await hp.openReportingEntry('Tickets');
      if ((await hp.readReportScreen()).activeView !== 'pivot') await hp.switchReportView('pivot');
      const p = await hp.readOdooPivot();
      const teams = new Set((await hp.searchReadOverRpc('helpdesk.team', [['active', 'in', [true, false]]], ['name'], 200)).map((t) => String(t.name)).concat('Undefined'));
      const stages = new Set((await hp.searchReadOverRpc('helpdesk.stage', [], ['name'], 500)).map((t) => String(t.name)).concat('Undefined'));
      const ok = p.rowHeads.length > 0 && p.rowHeads.every((r) => teams.has(bare(r))) && p.colHeads.length > 0 && p.colHeads.every((c) => stages.has(bare(c)));
      console.log(`  - rows ${JSON.stringify(p.rowHeads)}\n  - columns ${JSON.stringify(p.colHeads)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 rows = Team, columns = Stage', expected: 'row heads are teams, column heads are stages', actual: `rows: ${p.rowHeads.join(', ')} | columns: ${p.colHeads.join(', ')}`, passed: ok,
          difference: 'a row head is not a team or a column head is not a stage' },
      ], `${TC} - Step 1 axes`, [HelpdeskPage.PIVOT_HEAD, HelpdeskPage.PIVOT_ROW_HEADS]);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - the pivot shows rows = Team, columns = Stage');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the axes').toBe(1);
      expect(failed.map((c) => c.what), 'the Ticket Analysis pivot axes').toEqual([]);
    });
  });
});
