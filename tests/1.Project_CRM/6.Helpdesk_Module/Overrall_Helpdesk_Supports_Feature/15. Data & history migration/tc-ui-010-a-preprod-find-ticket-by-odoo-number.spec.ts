import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-010_A - Find a ticket by its Odoo number - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-010_A   (side B = tc-ui-010-b-support-find-ticket-by-odoo-number.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-13965 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L2 engineer Nam Pham (users.support_l2_manager_nam, Support Team = l2 asserted)
 * Data             : READ ONLY - one migrated ticket is searched for and opened
 * Folder           : "15. Data & history migration" (master divider)
 *
 * Summary: All Tickets > search box N > 'Search All for: N' must list the ticket 'Subject (#N)'; it must open with its
 * subject, its customer and its thread, the first mail included.
 *
 * Command to run: npx playwright test tc-ui-010-a-preprod --grep "TC-UI-010_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 229 = row TC-UI-010 (Ticket screens, lists & search, High,
 *                     happy, L2 engineer, refs E35, E34, UI-052, DM-001, DM-042); Comparison = same. Xray CRM-13965: 2 steps
 *  Source version   : fingerprint 8165b8b3782ebd37 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A migrated CS ticket present in both systems: pick it in FF (All Tickets), read the Odoo number from
 *    the '(#nnnnnn)' end of its subject and open that number in Odoo. Read only: never reply on or change a migrated ticket.
 *    Test data: Any migrated ticket number, e.g. the one in the subject suffix of FF staging ticket 13111 (read only).
 *    1. Logged in as L2 engineer Nam Pham on pre-production
 *    2. [INTERNAL check, Call API] the migrated ticket N: Customer Support, created in 2026 (the Support service holds the
 *       tickets created in 2026), unchanged for 90+ days, at most 25 messages (Odoo's chatter shows the newest 30 before
 *       "Load more"), the oldest of those (id asc); its stored subject, customer and FIRST mail (the oldest e-mail /
 *       comment) are read
 *  Steps to reproduce
 *    1. Odoo: All Tickets, type the Odoo number in the search box, choose the 'All' (or ID) search, press Enter.
 *       (Helpdesk > All Tickets; the search facets are removed first; my own default saved search, which Odoo applies again with the search, is removed too; 'All' = "Search All for: N")
 *    2. Open the found ticket in both systems and compare subject, customer and the first mail.
 *       (side A opens it in Odoo; the Support service half is TC-UI-010_B)
 *  Verification - A expected (Odoo 12), verbatim
 *    The ticket 'Subject (#<number>)' is listed and opens with its thread.
 *
 *  How it is compared: Step 1 - the list holds the row "<stored subject> (#N)"; Step 2 - the opened form shows the stored
 *  subject and customer, and its chatter draws the start of the first mail (its first 60 characters of text).
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 verify shot (facet + list); Step 2 verify shot (form + chatter);
 *           afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-010_A';
const SOURCE_ROW = 'TC-UI-010';
const SOURCE_FINGERPRINT = '8165b8b3782ebd37';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Pick the migrated ticket N (Customer Support, created in 2026, unchanged for 90+ days, at most 25 messages, oldest); read its subject, customer and first mail',
  s1: "Step 1: Odoo: All Tickets, type the Odoo number in the search box, choose the 'All' (or ID) search, press Enter. (Helpdesk > All Tickets; the search facets are removed first; my own default saved search, which Odoo applies again with the search, is removed too)",
  s2: 'Step 2: Open the found ticket in both systems and compare subject, customer and the first mail. (side A: the Odoo form; the Support service half is TC-UI-010_B)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;

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
const sp = (s: string): string => (s || '').replace(/\s+/g, ' ').trim();

test.describe(`${TC} - Find a ticket by its Odoo number on Odoo 12 pre-production`, () => {
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

  test(`${TC}: Find a ticket by its Odoo number - A: Search All for N lists 'Subject (#N)' and it opens with its thread`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];
    let n = 0;
    let stored: Record<string, unknown> = {};
    let first: Awaited<ReturnType<HelpdeskPage['readFirstMailOverRpc']>> = null;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await hp.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const cands = await hp.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff]], ['id', 'name', 'partner_id', 'message_ids'], { limit: 10, order: 'id asc' });
      const pick = cands.find((c) => ((c.message_ids as unknown[]) || []).length > 0 && ((c.message_ids as unknown[]) || []).length <= 25);
      expect(pick, 'a migrated ticket with 1-25 messages exists among the 10 oldest of 2026').toBeTruthy();
      stored = pick as Record<string, unknown>;
      n = Number(stored.id);
      first = await hp.readFirstMailOverRpc(n);
      console.log(`  [INTERNAL check, Call API] N = ${n}`);
      console.log(`     Subject    = ${stored.name}`);
      console.log(`     Customer   = ${Array.isArray(stored.partner_id) ? stored.partner_id[1] : '(none)'}`);
      console.log(`     Messages   = ${((stored.message_ids as unknown[]) || []).length}`);
      console.log(`     First mail = #${first?.id} by ${first?.author} on ${first?.date}: "${(first?.text || '').slice(0, 120)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - migrated ticket picked');
      expect(first, 'the ticket holds a first mail').not.toBeNull();
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hp.openAllTicketsListDirect(baseUrl);
      const defaults = await hp.readAllTicketsDefaults();
      await hp.clearSearchFacets();
      await hp.searchWithOption(String(n), 'All');
      let facets = await hp.getSearchFacets();
      // Odoo applies the agent's OWN default saved search again together with the search (measured 2026-11-04) - it would
      // narrow the result, so it is removed (the step text says so)
      if (defaults.myDefaultFavorite && facets.includes(defaults.myDefaultFavorite)) {
        console.log(`  - Odoo applied my own default saved search "${defaults.myDefaultFavorite}" again with the search - removed`);
        await hp.removeSearchFacet(defaults.myDefaultFavorite);
        facets = await hp.getSearchFacets();
      }
      const row = `${sp(String(stored.name))} (#${n})`;
      const hits = await hp.waitForListRowsContaining(`(#${n})`);
      const listedIds = await hp.getListRowTicketIds(10);
      console.log(`  - rows containing "(#${n})": ${hits}; listed ids ${JSON.stringify(listedIds)}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 the ticket '${row}' is listed`, expected: `a row "${row}"`, actual: `${hits} row(s) containing "(#${n})" (facets ${JSON.stringify(facets)})`, passed: hits === 1 && (await hp.countListRowsContaining(row)) === 1, difference: `rows with "${row}": ${await hp.countListRowsContaining(row)}` },
      ], `${TC} - Step 1 found by number`, [HelpdeskPage.SEARCH_FACETS, HelpdeskPage.LIST_VIEW]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await hp.openOnlyListRowContaining(`(#${n})`);
      const subject = await hp.getTicketSubject();
      const customer = await hp.getCustomerName();
      const chatter = sp(await hp.getChatterLogText());
      const start = sp(first?.text || '').slice(0, 60);
      const expCustomer = Array.isArray(stored.partner_id) ? sp(String(stored.partner_id[1])) : '';
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the ticket opens with its subject', expected: `"${sp(String(stored.name))}"`, actual: `"${sp(subject)}"`, passed: sp(subject) === sp(String(stored.name)), difference: `expected "${sp(String(stored.name))}", got "${sp(subject)}"` },
        { what: 'Step 2 the ticket opens with its customer', expected: `"${expCustomer}"`, actual: `"${sp(customer)}"`, passed: sp(customer) === expCustomer, difference: `expected "${expCustomer}", got "${sp(customer)}"` },
        { what: 'Step 2 the thread holds the first mail', expected: `the chatter draws "${start}"`, actual: chatter.includes(start) ? 'drawn' : 'NOT drawn', passed: !!start && chatter.includes(start), difference: `"${start}" not found in the chatter` },
      ], `${TC} - Step 2 ticket opened`, ['.o_form_view .o_form_sheet', '.o_chatter']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - ticket opened');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : `OVERALL: PASS - the ticket (#${n}) is found by its number and opens with its thread`);
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the ticket is found by its Odoo number').toEqual([]);
    });
  });
});
