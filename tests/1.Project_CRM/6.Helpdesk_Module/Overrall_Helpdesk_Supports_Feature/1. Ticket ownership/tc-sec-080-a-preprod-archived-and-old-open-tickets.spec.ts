import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-SEC-080_A - Archived Odoo tickets and old open tickets - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-SEC-080_A   (side B = tc-sec-080-b-support-archived-and-old-open-tickets.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-30
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : READ ONLY - two existing Customer Support tickets picked at run time (Pre-condition 2); only searches
 *                    are typed, nothing is saved (the control-panel search is not stored by Odoo)
 * Folder           : "1. Ticket ownership" = Confluence 231246777 spec area of IS-CRM-FUNC-0252 (archived tickets are not
 *                    migrated; automation author's mapping - the CSV carries no link)
 *
 * Summary: an archived 2026 Customer Support ticket is found by the All search only under Filters > Archived, and an open
 * Customer Support ticket created before 2026 is found by the All search in the ticket list.
 *
 * Command to run: npx playwright test tc-sec-080-a-preprod --grep "TC-SEC-080_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 586 = row TC-SEC-080 (Login, roles, security & data,
 *                     "Archived Odoo tickets and old open tickets", High, data, L1 agent, refs E38, DM-002, SE-004) - 1 step;
 *                     Comparison = different-by-design ("DEV decision: 2026 + all open tickets now; full or archived history
 *                     only as an option (E38).")
 *  Source version   : fingerprint 58630984c3f6c7d1 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim)
 *    Odoo: one 2026 CS ticket that is archived (Filters > Archived) and one CS ticket created before 2026 that is still open.
 *    1. Logged in as L1 agent Giang Le on pre-production
 *    2. Test data (CSV: "one archived and one pre-2026 open CS ticket") picked over the API, the SAME rule as side B:
 *       _ archived     = Helpdesk Team Customer Support, archived, created in 2026 - the oldest (lowest number)
 *       _ old open     = Helpdesk Team Customer Support, created before 2026, any stage but Closed - the one changed
 *                        longest ago (so it is in the same state as when the Support service copy was loaded)
 *  Steps to reproduce (CSV, verbatim; side A drops "in FF" - the FF half belongs to TC-SEC-080_B)
 *    1. Search both Odoo numbers (All search and Filters > Archived).
 *       (Helpdesk > All Tickets in the navbar; the agent's OWN default favorite facet is removed first so the action's
 *       own list shows - Giang has one, "All Tickets222"; then the search box option "Search All for: <N>")
 *  Verification - A expected (Odoo 12), verbatim
 *    The archived ticket is visible only under the Archived filter; the old open ticket is in the queues.
 *    -> the old open N is listed by the All search; the archived N is NOT listed by the All search alone, and IS listed
 *       with Filters > Archived added.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 verify shots (one per search, the list outlined); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-SEC-080_A';
const SOURCE_ROW = 'TC-SEC-080';
const SOURCE_FINGERPRINT = '58630984c3f6c7d1';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L1 agent Giang Le on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Odoo: one 2026 CS ticket that is archived (Filters > Archived) and one CS ticket created before 2026 that is still open - pick both, note their Odoo numbers',
  s1: 'Step 1: Search both Odoo numbers (All search and Filters > Archived). (Helpdesk > All Tickets; remove the agent\'s own default favorite facet first; search box "Search All for: <N>")',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const FIELDS = ['id', 'name', 'active', 'create_date', 'write_date', 'stage_id'];

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
const m2o = (v: unknown): string => (Array.isArray(v) ? String(v[1]) : '');

test.describe(`${TC} - Archived Odoo tickets and old open tickets on Odoo 12 pre-production`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up (searches are not saved)');
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Archived Odoo tickets and old open tickets - A: the archived ticket only under Archived, the old open ticket in the list`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    let archived = 0;
    let oldOpen = 0;

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
      const a = await helpdeskPage.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['active', '=', false], ['create_date', '>=', '2026-01-01 00:00:00']], FIELDS, { limit: 1, order: 'id asc' });
      const o = await helpdeskPage.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['create_date', '<', '2026-01-01 00:00:00'], ['stage_id.name', '!=', 'Closed']], FIELDS, { limit: 1, order: 'write_date asc' });
      for (const [label, r] of [['archived 2026', a[0]], ['open, created before 2026', o[0]]] as const) {
        console.log(`  [INTERNAL check, Call API] ${label}: ${r ? `#${r.id} "${String(r.name).replace(/\s+/g, ' ')}" created ${r.create_date}, stage ${m2o(r.stage_id)}, active ${r.active}, last changed ${r.write_date}` : 'NONE'}`);
      }
      expect(a.length, 'an archived 2026 Customer Support ticket exists').toBe(1);
      expect(o.length, 'an open Customer Support ticket created before 2026 exists').toBe(1);
      archived = Number(a[0].id);
      oldOpen = Number(o[0].id);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - test tickets picked');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      console.log(`  - Facets on arrival: ${JSON.stringify(await helpdeskPage.getSearchFacets())}`);

      await helpdeskPage.clearSearchFacets();
      await helpdeskPage.searchListFor('All', String(oldOpen));
      const openRows = await helpdeskPage.getListRowTicketIds(20);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 All search for the old open ticket #${oldOpen}`, expected: `#${oldOpen} is listed (the old open ticket is in the queues)`, actual: `listed: ${JSON.stringify(openRows)}`, passed: openRows.includes(String(oldOpen)) },
      ], `${TC} - Step 1 All search old open ticket`, [HelpdeskPage.LIST_VIEW, '.o_searchview'], 'bottom-right');

      await helpdeskPage.clearSearchFacets();
      await helpdeskPage.searchListFor('All', String(archived));
      const plainRows = await helpdeskPage.getListRowTicketIds(20);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 All search (no Archived filter) for the archived ticket #${archived}`, expected: `#${archived} is NOT listed (visible only under the Archived filter)`, actual: `listed: ${JSON.stringify(plainRows)}`, passed: !plainRows.includes(String(archived)) },
      ], `${TC} - Step 1 All search archived ticket without Archived`, [HelpdeskPage.LIST_VIEW, '.o_searchview'], 'bottom-right');

      const applied = await helpdeskPage.applyArchivedFilter();
      await page.keyboard.press('Escape').catch(() => {});
      const archivedRows = await helpdeskPage.getListRowTicketIds(20);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 Filters > Archived with the All search for #${archived}`, expected: `Filters > Archived applied and #${archived} is listed`, actual: `Archived applied: ${applied}; facets ${JSON.stringify(await helpdeskPage.getSearchFacets())}; listed: ${JSON.stringify(archivedRows)}`, passed: applied && archivedRows.includes(String(archived)) },
      ], `${TC} - Step 1 Filters Archived archived ticket`, [HelpdeskPage.LIST_VIEW, '.o_searchview'], 'bottom-right');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the archived ticket only under Archived, the old open ticket in the list');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(checks.length, 'three searches were checked').toBe(3);
      expect(failed.map((c) => c.what), 'archived and old open tickets behave as expected').toEqual([]);
    });
  });
});
