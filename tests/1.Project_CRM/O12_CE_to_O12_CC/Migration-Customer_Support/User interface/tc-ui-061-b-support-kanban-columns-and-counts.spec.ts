import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-061_B - Kanban columns and counts - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-061_B   (side A = tc-ui-061-a-preprod-kanban-columns-and-counts.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (HD Agent Support Level = L1 asserted)
 * Data             : READ ONLY - the user's saved list state (default HD View) is snapshotted first and compared / restored in
 *                    afterEach, in case the layout switch is saved with it
 * Folder           : "User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014 (automation author's mapping)
 *
 * Summary: 'Kanban' must show the crumb 'Tickets / Kanban', a total '<n> tickets' and the 13 CS stages as columns in Odoo's
 * order, each with its count; 'List' must return to the list.
 * Command to run: npx playwright test tc-ui-061-b-support --grep "TC-UI-061_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 280 = row TC-UI-061 (refs E35, UI-050) - 3 steps
 *  Source version   : fingerprint dc609665b4dd3020 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "Agent account; Open Tickets view.")
 *    1. Logged in as L1 agent Giang Le on the Support service; the saved list state is noted
 *    2. Open Tickets view: sidebar All Tickets - [INTERNAL check, Call API] the view it opens on filters like the Open Tickets
 *       preset (measured 2026-10-28)
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: switch All Tickets to kanban; note the columns and counts. - N/A on side B
 *    2. FF: click 'Kanban' next to the title; note the crumb, the total, the columns and their counts.
 *    3. FF: click 'List' to go back.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Crumb 'Tickets / Kanban'; total '<n> tickets'; 13 columns in Odoo order: Open, Preparing Answer (L1), L2, In Progress
 *    (L2), Waiting to be sent, Pending (L1), On Customer, Review, Meeting Expectation, Escalated, Hibernate, Resolving,
 *    Closed, each with its count; 'List' returns to the list.
 *
 *  "Each with its count" is also checked for consistency: the column counts must add up to the shown total.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 2 verify shots (crumb + total; the columns); Step 3 verify shot (the list);
 * afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-061_B';
const SOURCE_ROW = 'TC-UI-061';
const SOURCE_FINGERPRINT = 'dc609665b4dd3020';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1, saved list state noted',
  pre2: 'Pre-condition 2: Open Tickets view - sidebar All Tickets; [INTERNAL check, Call API] it filters like the Open Tickets preset',
  s1: 'Step 1: [N/A on side B - the Odoo kanban belongs to TC-UI-061_A] Odoo: switch All Tickets to kanban; note the columns and counts.',
  s2: "Step 2: FF: click 'Kanban' next to the title; note the crumb, the total, the columns and their counts.",
  s3: "Step 3: FF: click 'List' to go back.",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ODOO_ORDER = ['Open', 'Preparing Answer (L1)', 'L2', 'In Progress (L2)', 'Waiting to be sent', 'Pending (L1)', 'On Customer', 'Review', 'Meeting Expectation', 'Escalated', 'Hibernate', 'Resolving', 'Closed'];

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

test.describe(`${TC} - Kanban columns and counts on the Support service`, () => {
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
      if (savedView) console.log(`  - ${await new SupportDeskPageMig(page).restoreMyDefaultTicketView(AGENT.username, savedView)}`);
      else console.log('  - No saved list state was noted - nothing to compare');
    } catch (e) { cleanupError = e instanceof Error ? e.message : String(e); }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Kanban columns and counts - B: Frappe Helpdesk shows Tickets / Kanban, the total and the 13 stages in Odoo order; List returns`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      savedView = await desk.readMyDefaultTicketView(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'} | saved list state ${savedView ? `${savedView.name} ${savedView.filters}` : '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await desk.openAllTicketsFromSidebar();
      const preset = await desk.readHdViewFilters('NK-VIEW-OPEN-TICKETS');
      const norm = (f: string) => JSON.stringify(JSON.parse(f || '[]'));
      console.log(`  - The list's view filters ${savedView?.filters} | Open Tickets preset ${preset}`);
      expect(!!savedView && norm(savedView.filters) === norm(preset), 'the list opens on the Open Tickets filter').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Open Tickets view');
    });

    await test.step(STEP.s1, async () => { console.log(`\n--- ${STEP.s1} ---\n  - N/A on side B (TC-UI-061_A)`); });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.switchToKanbanLayout();
      const crumbs = await desk.getHeaderCrumbs();
      const total = await desk.getKanbanTotal();
      const cols = await desk.getKanbanColumns();
      for (const c of cols) console.log(`     ${c.column.padEnd(24)} ${c.count}${c.folded ? ' (folded)' : ''}`);
      const titles = cols.map((c) => c.column);
      const sum = cols.reduce((a, c) => a + (c.count > 0 ? c.count : 0), 0);
      const noCount = cols.filter((c) => !(c.count >= 0)).map((c) => c.column);
      console.log(`  - Crumbs "${crumbs}" | total "${total.text}" | sum of counts ${sum}`);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 2 the crumb", expected: 'Tickets / Kanban', actual: crumbs, passed: crumbs === 'Tickets / Kanban' },
        { what: "Step 2 the total '<n> tickets'", expected: '"<n> tickets" shown', actual: total.text || '(none)', passed: total.n >= 0 },
      ], `${TC} - Step 2 crumb and total`, ['header']);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the 13 columns in Odoo order', expected: ODOO_ORDER.join(' | '), actual: titles.join(' | '), passed: JSON.stringify(titles) === JSON.stringify(ODOO_ORDER) },
        { what: 'Step 2 each column with its count', expected: `a count on every column, adding up to the total ${total.n}`, actual: `${noCount.length ? `no count: ${noCount.join(', ')}; ` : ''}sum ${sum}`, passed: noCount.length === 0 && sum === total.n },
      ], `${TC} - Step 2 kanban columns`, ['main']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await desk.switchToListLayout();
      const crumbs = await desk.getHeaderCrumbs();
      const rows = await desk.countTicketLinks();
      console.log(`  - Crumbs "${crumbs}" | rows drawn ${rows}`);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 3 'List' returns to the list", expected: 'crumb Tickets / List and ticket rows drawn', actual: `"${crumbs}", ${rows} rows`, passed: crumbs === 'Tickets / List' && rows > 0 },
      ], `${TC} - Step 3 back to the list`, [SupportDeskPageMig.LIST_HEAD]);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - Tickets / Kanban, the total, 13 stages in Odoo order with counts; List returns');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the kanban matches').toEqual([]);
    });
  });
});
