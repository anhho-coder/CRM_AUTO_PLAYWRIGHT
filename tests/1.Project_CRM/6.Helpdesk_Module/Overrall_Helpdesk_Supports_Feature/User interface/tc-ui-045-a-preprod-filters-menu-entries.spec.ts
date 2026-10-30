import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-045_A - Filters menu entries - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-045_A   (side B = tc-ui-045-b-support-filters-menu-entries.spec.ts)
 * Automation-Type  : refactored     Automation-Date : 2026-10-30
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY
 * Folder           : "User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014 (automation author's mapping)
 *
 * Summary: All Tickets > Filters must list My Tickets, Unassigned, Open, Closed / Review needed / Review needed without me /
 * Metric3a, Metric3b / Unread Messages, Message Date, Overdue Tickets, My L2, My open, My meeting expectation / Archived / My, Late, Today, Future
 * Activities / SLA filters - in that order.
 *
 * Command to run: npx playwright test tc-ui-045-a-preprod --grep "TC-UI-045_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 264 = row TC-UI-045 (Ticket screens, lists & search,
 *                     "Filters menu entries", High, ui, L1 agent, refs E35, E41, UI-053) - 2 steps; Comparison =
 *                     different-by-design ("Odoo's activity and SLA filters have no FF view ... Message Date is a filter
 *                     field instead")
 *  Source version   : fingerprint 97311bdbc7d0cf98 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "Agent account.") - 1. Logged in as L1 agent Giang Le on pre-production
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: All Tickets > Filters: note the entries and separators.
 *    2. FF: All Tickets > 'Filters' button: ... - N/A on side A
 *  Verification - A expected (Odoo 12), verbatim
 *    My Tickets, Unassigned, Open, Closed / Review needed / Review needed without me / Unread Messages, Message Date, Overdue
 *    Tickets, My L2, My open, My meeting expectation / Archived / My, Late, Today, Future Activities / SLA filters.
 *  Expected amended by the tester on 2026-10-30 (not in the CSV row): Metric3a, Metric3b are expected too, right after
 *    "Review needed without me" - EXPECTED_ENTRIES carries them; the CSV quote above stays verbatim.
 *
 *  How it is compared: the CSV shortens Odoo's labels ("Unassigned" = Unassigned Tickets, "Open"/"Closed" = Open/Closed
 *  Tickets, "My, Late, Today, Future Activities" = My / Late / Today / Future Activities) and names the last group only
 *  "SLA filters" (= every entry containing "SLA"). The ENTRIES are compared in order (scored); the separators are printed and
 *  compared to the CSV's "/" as an Observation - the CSV's "/" summarises groups and does not say where every divider sits.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 verify shot (the open Filters menu); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-045_A';
const SOURCE_ROW = 'TC-UI-045';
const SOURCE_FINGERPRINT = '97311bdbc7d0cf98';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] Support Team = l1',
  s1: 'Step 1: Odoo: All Tickets > Filters: note the entries and separators. (Helpdesk > All Tickets in the navbar, control panel Filters)',
  s2: "Step 2: [N/A on side A - the FF menu belongs to TC-UI-045_B] FF: All Tickets > 'Filters' button: note the sections and entries, and the Favorites group at the end.",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
/** The CSV's entries in Odoo's own words, in order; 'SLA*' = the "SLA filters" group (any number of entries containing SLA). */
const EXPECTED_ENTRIES = ['My Tickets', 'Unassigned Tickets', 'Open Tickets', 'Closed Tickets', 'Review needed', 'Review needed without me', 'Metric3a', 'Metric3b', 'Unread Messages', 'Message Date', 'Overdue Tickets', 'My L2', 'My open', 'My meeting expectation', 'Archived', 'My Activities', 'Late Activities', 'Today Activities', 'Future Activities', 'SLA*'];
const CSV_GROUPS = 'My Tickets, Unassigned, Open, Closed / Review needed / Review needed without me / Unread Messages, Message Date, Overdue Tickets, My L2, My open, My meeting expectation / Archived / My, Late, Today, Future Activities / SLA filters';

/** `difference` = REQUIREMENT #4c conclusion, printed on a FAIL only. */
type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
/** REQUIREMENT #4c - the FAIL conclusion of an ordered-list check, built from the asserted values. */
function listDifference(expected: string[], actual: string[]): string {
  const parts: string[] = [];
  const extra = actual.filter((e) => !expected.includes(e));
  const missing = expected.filter((e) => !actual.includes(e));
  if (actual.length !== expected.length) parts.push(`count ${actual.length}, expected ${expected.length} (${actual.length > expected.length ? '+' : ''}${actual.length - expected.length})`);
  if (extra.length) parts.push(`not expected but shown: ${extra.map((e) => { const i = actual.indexOf(e); return `'${e}' (#${i + 1}${i > 0 ? `, after '${actual[i - 1]}'` : ''})`; }).join(', ')}`);
  if (missing.length) parts.push(`expected but missing: ${missing.map((e) => `'${e}'`).join(', ')}`);
  const shared = actual.filter((e) => expected.includes(e));
  const want = expected.filter((e) => actual.includes(e));
  const k = shared.findIndex((e, i) => e !== want[i]);
  parts.push(k < 0 ? 'the entries both lists share are in the expected order' : `order differs from '${want[k]}': expected it before '${shared[k]}'`);
  return extra.length || missing.length || k >= 0 || actual.length !== expected.length ? parts.join('; ') : 'none';
}
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual),
    ...(!c.passed && c.difference ? wrap('   Difference : ', c.difference) : [])];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - Filters menu entries on Odoo 12 pre-production`, () => {
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

  test(`${TC}: Filters menu entries - A: Odoo 12 lists the CSV's filter entries in order`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];

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

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      const raw = await helpdeskPage.getFiltersMenuEntries();
      // "Add Advanced Filter" is Odoo's built-in custom-filter control at the foot of the menu, not a filter entry.
      const entries = raw.filter((e) => e !== '---' && !/^Add (Advanced|Custom) Filter$/.test(e));
      const sla = entries.filter((e) => /SLA/.test(e));
      const head = entries.filter((e) => !/SLA/.test(e));
      const expectedHead = EXPECTED_ENTRIES.filter((e) => e !== 'SLA*');
      const groups = raw.join(' , ').split(' , --- , ').map((g) => g.replace(/ , /g, ', ')).join(' / ');
      console.log(`  - Entries with separators: ${groups}`);
      console.log(`  Observation (not scored) - CSV groups: ${CSV_GROUPS}`);
      const slaLast = sla.length > 0 && entries.slice(-sla.length).every((e) => /SLA/.test(e));
      const difference = `${listDifference(expectedHead, head)}; SLA filters last: ${slaLast ? 'yes' : 'no'} (${sla.join(', ') || 'none shown'})`;
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the entries in order', expected: `${expectedHead.join(', ')}, then the SLA filters`, actual: entries.join(', ') || '(none)', passed: JSON.stringify(head) === JSON.stringify(expectedHead) && slaLast, difference },
      ], `${TC} - Step 1 Filters menu`, ['.o_filters_menu']);
    });

    await test.step(STEP.s2, async () => { console.log(`\n--- ${STEP.s2} ---\n  - N/A on side A (TC-UI-045_B)`); });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference ?? c.what}`).join(' | ')}` : 'OVERALL: PASS - the Filters menu lists the CSV entries in order');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference ? `Difference: ${c.difference}` : `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Filters menu matches').toEqual([]);
    });
  });
});
