import { test, expect, Page, TestInfo, Frame } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-REP-013_B - Ticket Analysis pivot - rows Team, columns Stage - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-REP-013_B   (side A = tc-rep-013-a-preprod-pivot-cell-drilldown.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-05
 * Jira             : CRM-14007 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / Helpdesk Manager Julia Petrenko
 *                    (users.helpdesk_manager_julia_support_mig; role Agent Manager asserted) - the "CS manager" of the TC
 * Data             : READ ONLY - no data change
 * Folder           : "12. Reporting & oversight" (master divider)
 *
 * Summary: Reporting > Tickets must show a pivot with rows Team and columns Stage.
 *
 * Command to run: npx playwright test tc-rep-013-b-support --grep "TC-REP-013_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 441 = row TC-REP-013; Comparison = same. Xray CRM-14007: 1 step
 *  Source version   : fingerprint 98550f42a3714563 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: CS manager. Odoo: a test user in the group Helpdesk / Manager; FF: a test user with the role Agent Manager (the same
 *    person's account on both if possible). Test data: Any manager; no data change.
 *    1. Agent account - Support service /login as Helpdesk Manager Julia Petrenko
 *  Steps to reproduce
 *    1. Open Reporting > Tickets, rows = Team, columns = Stage. (sidebar Reporting folder > Tickets - the report opens with these
 *       axes; drawn in the iframe /nk_report?report=ticket_analysis)
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The pivot shows rows = Team, columns = Stage.
 *
 *  How it is compared (automation author's reading, printed in every run): the report names its row and column group-by
 *  fields - rows by "Team", columns by "Stage".
 *  History: until 2026-11-06 this TC was "Click a pivot cell to list its tickets" (Step 2 click a cell, Step 3 count the list
 *  and open one ticket). The tester removed the cell click from TC-REP-013 A + B on 2026-11-06: side A (Odoo 12 pre-
 *  production) opens nothing on a cell click (its pivot carries disable_linking="True").
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (axes); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-REP-013_B';
const SOURCE_ROW = 'TC-REP-013';
const SOURCE_FINGERPRINT = '98550f42a3714563';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as Helpdesk Manager Julia Petrenko; [INTERNAL check, Call API] role Agent Manager',
  s1: 'Step 1: Open Reporting > Tickets, rows = Team, columns = Stage. (sidebar Reporting folder > Tickets - it opens with these axes; drawn in an iframe)',
  verify: 'Verification',
} as const;

const MANAGER = users.helpdesk_manager_julia_support_mig;

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

test.describe(`${TC} - Ticket Analysis pivot axes on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - read only: nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Ticket Analysis pivot - rows Team, columns Stage - B: the pivot shows rows = Team, columns = Stage`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    let frame: Frame = page.mainFrame();

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${MANAGER.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, MANAGER.username, MANAGER.password);
      const roles = await desk.getMyRoles(MANAGER.username);
      console.log(`  [INTERNAL check, Call API] roles ${JSON.stringify(roles)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Julia Petrenko');
      expect(roles, 'the signed-in account holds Agent Manager').toContain('Agent Manager');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      frame = await desk.openReportingEntry('Tickets', 'report=ticket_analysis');
      const r = await desk.readNkReport(frame);
      console.log(`  - rows by "${r.rowsField}" ${JSON.stringify(r.rowHeads)}, columns by "${r.colsField}" ${JSON.stringify(r.colHeads)}`);
      await desk.outlineInReportFrame(frame, [{ selector: 'table.nk-pivot th.nk-head.open', passed: r.rowsField === 'Team' && r.colsField === 'Stage' }]);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 rows = Team, columns = Stage', expected: 'rows grouped by "Team", columns by "Stage"', actual: `rows "${r.rowsField}", columns "${r.colsField}"`,
          passed: r.rowsField === 'Team' && r.colsField === 'Stage', difference: `rows "${r.rowsField}", columns "${r.colsField}"` },
      ], `${TC} - Step 1 axes`, [SupportDeskPageMig.REPORT_FRAME]);
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
