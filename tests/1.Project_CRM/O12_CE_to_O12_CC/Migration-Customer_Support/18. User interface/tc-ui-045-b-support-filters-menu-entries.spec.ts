import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-UI-045_B - Filters menu entries - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-045_B   (side A = tc-ui-045-a-preprod-filters-menu-entries.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted)
 * Data             : READ ONLY - the menu is opened and closed; nothing is chosen, so the saved list state is untouched
 * Folder           : "18. User interface" = Confluence 231246777 spec area of IS-CRM-UI-0014 (automation author's mapping)
 *
 * Summary: All Tickets > 'Filters' must show the sections My Tickets, Unassigned Tickets | Open Tickets, Closed Tickets |
 * Review needed | Review needed without me | Unread Messages, Overdue Tickets, My L2, My open, My meeting expectation |
 * Archived, then Favorites with the saved searches and 'Save current search'.
 *
 * Command to run: npx playwright test tc-ui-045-b-support --grep "TC-UI-045_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 264 = row TC-UI-045 (refs E35, E41, UI-053) - 2 steps;
 *                     Comparison = different-by-design
 *  Source version   : fingerprint 3c2bd3295f8f8cfc of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "Agent account.") - 1. Logged in as L1 agent Giang Le on the Support service
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: All Tickets > Filters: note the entries and separators. - N/A on side B
 *    2. FF: All Tickets > 'Filters' button: note the sections and entries, and the Favorites group at the end.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Sections: My Tickets, Unassigned Tickets | Open Tickets, Closed Tickets | Review needed | Review needed without me |
 *    Unread Messages, Overdue Tickets, My L2, My open, My meeting expectation | Archived; then Favorites with your saved
 *    searches and 'Save current search'.
 *
 *  The sections are compared exactly, in order. Favorites: it must be the LAST group, headed "Favorites", and end with
 *  "Save current search"; the saved searches in it belong to the account and are printed, not scored.
 *
 * Evidence: Pre-condition 1 end shot; Step 2 verify shot (the open Filters menu); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-045_B';
const SOURCE_ROW = 'TC-UI-045';
const SOURCE_FINGERPRINT = '3c2bd3295f8f8cfc';

const STEP = {
  pre1: 'Pre-condition 1: Agent account - Support service (Frappe Helpdesk) /login as L1 agent Giang Le; [INTERNAL check, Call API] HD Agent Support Level = L1',
  s1: 'Step 1: [N/A on side B - the Odoo menu belongs to TC-UI-045_A] Odoo: All Tickets > Filters: note the entries and separators.',
  s2: "Step 2: FF: All Tickets > 'Filters' button: note the sections and entries, and the Favorites group at the end. (the menu is closed again with Escape - nothing is chosen)",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const EXPECTED_SECTIONS = [
  ['My Tickets', 'Unassigned Tickets'],
  ['Open Tickets', 'Closed Tickets'],
  ['Review needed'],
  ['Review needed without me'],
  ['Unread Messages', 'Overdue Tickets', 'My L2', 'My open', 'My meeting expectation'],
  ['Archived'],
];

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

test.describe(`${TC} - Filters menu entries on the Support service`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Filters menu entries - B: Frappe Helpdesk shows the six sections in order, then Favorites with Save current search`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.s1, async () => { console.log(`\n--- ${STEP.s1} ---\n  - N/A on side B (TC-UI-045_A)`); });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      const groups = await desk.openFiltersMenuGroups();
      for (const g of groups) console.log(`  - Section${g.heading ? ` "${g.heading}"` : ''}: ${g.entries.join(', ')}`);
      const last = groups[groups.length - 1];
      const sections = groups.slice(0, -1).map((g) => g.entries);
      const favEntries = last ? last.entries : [];
      console.log(`  Observation (not scored) - saved searches in Favorites: ${JSON.stringify(favEntries.filter((e) => e !== 'Save current search'))}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the sections and entries in order', expected: EXPECTED_SECTIONS.map((s) => s.join(', ')).join(' | '), actual: sections.map((s) => s.join(', ')).join(' | ') || '(none)', passed: JSON.stringify(sections) === JSON.stringify(EXPECTED_SECTIONS) },
        { what: 'Step 2 Favorites is the last group, with Save current search', expected: 'last group headed "Favorites", ending with "Save current search"', actual: last ? `"${last.heading}": ${last.entries.join(', ')}` : '(no groups)', passed: !!last && /Favorites/i.test(last.heading) && last.entries[last.entries.length - 1] === 'Save current search' },
      ], `${TC} - Step 2 Filters menu`, [SupportDeskPageMig.MENU], 'top-right');
      await desk.closeOpenMenu();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - six sections in order, then Favorites with Save current search');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the Filters menu matches').toEqual([]);
    });
  });
});
