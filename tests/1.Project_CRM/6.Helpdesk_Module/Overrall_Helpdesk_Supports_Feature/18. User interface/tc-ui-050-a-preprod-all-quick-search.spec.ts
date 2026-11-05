import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-050_A - 'All' quick search by subject word - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-050_A   (side B = tc-ui-050-b-support-all-quick-search.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-13978 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : 3 probe tickets of this run, archived in afterEach (pre-production sends no e-mail)
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: All Tickets > search box 'QA-UI' > 'Search All for: QA-UI' must list every ticket whose subject contains QA-UI -
 * this run's 3 probes included.
 *
 * Command to run: npx playwright test tc-ui-050-a-preprod --grep "TC-UI-050_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 269 = row TC-UI-050 (Ticket screens, lists & search, High,
 *                     happy, L1 agent, refs E35, UI-052, DM-042); Comparison = same. Xray CRM-13978: 1 step
 *  Source version   : fingerprint 9524de235d4f234d of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L1 agent. QA probe tickets created for this run in both systems: Subject = 'QA-UI probe <n>', Requester =
 *    qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists. Archive or delete them after the run. Probe subjects
 *    contain the word 'QA-UI'.
 *    1. Logged in as L1 agent Giang Le on pre-production
 *    2. [INTERNAL setup, Call API] the 3 probe tickets (team Customer Support):
 *         Subject   = QA-UI probe <n> AUTO-CRM-11859-TC-UI-050_A-<runId>
 *         Requester = qa.ui<n>@example.com
 *         Customer  = ACME Test Ltd (only when that partner exists; else blank)
 *  Steps to reproduce
 *    1. Odoo: All Tickets: type 'QA-UI' in the search box, choose the 'All' option, Enter.
 *       (Helpdesk > All Tickets; every search facet is removed first - Giang's own default favorite and the action's Open
 *       Tickets default would otherwise narrow the result; the 'All' option is the autocomplete entry "Search All for: QA-UI")
 *  Verification - A expected (Odoo 12), verbatim
 *    Every ticket whose subject contains the text is listed.
 *
 *  How it is compared: the tickets whose subject contains 'QA-UI' (search_count / ids of name ilike 'QA-UI', active only, read
 *  at the same moment) must all be among the listed rows, the 3 probes included; the facet must be the All search alone. Rows
 *  matched by the All search through another field (it also searches assignee, team, e-mail, type, tags, customer, id) are
 *  printed, not scored.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 verify shot (facet, list, pager); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-050_A';
const SOURCE_ROW = 'TC-UI-050';
const SOURCE_FINGERPRINT = '9524de235d4f234d';
const SKIP_CLEANUP = false; // true keeps the probe tickets for inspection

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L1 agent Giang Le on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l1',
  pre2: "Pre-condition 2: [INTERNAL setup, Call API] QA probe tickets of this run: Subject = 'QA-UI probe <n>' + run marker, Requester = qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists",
  s1: "Step 1: Odoo: All Tickets: type 'QA-UI' in the search box, choose the 'All' option, Enter. (Helpdesk > All Tickets; the search facets are removed first; my own default saved search, which Odoo applies again with the search, is removed too; 'All' = the autocomplete entry \"Search All for: QA-UI\")",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const WORD = 'QA-UI';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const subjectOf = (n: number) => `${WORD} probe ${n} AUTO-CRM-11859-${TC}-${RUN}`;

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

test.describe(`${TC} - 'All' quick search by subject word on Odoo 12 pre-production`, () => {
  const probes: Array<{ id: number; subject: string }> = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const hp = new HelpdeskPage(page);
    for (const p of probes.splice(0)) {
      if (SKIP_CLEANUP) { console.log(`  - SKIP_CLEANUP: probe #${p.id} kept`); continue; }
      console.log(`  - probe #${p.id} archived: ${await hp.archiveTicketByIdOverRpc(p.id, p.subject).catch((e) => `NOT ARCHIVED ${String(e).split('\n')[0]}`)}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: 'All' quick search by subject word - A: Search All for QA-UI lists every ticket whose subject contains it`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await hp.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        const team = (await hp.searchIdsOverRpc('helpdesk.team', [['name', '=', 'Customer Support']], 1))[0];
        const acme = (await hp.searchIdsOverRpc('res.partner', [['name', '=', 'ACME Test Ltd']], 1))[0];
        console.log(`  [INTERNAL setup, Call API] team Customer Support = ${team}, ACME Test Ltd = ${acme ?? '(none - Customer left blank)'}`);
        for (const n of [1, 2, 3]) {
          const subject = subjectOf(n);
          const id = await hp.createTicketOverRpc({ name: subject, team_id: team, partner_email: `qa.ui${n}@example.com`, ...(acme ? { partner_id: acme } : {}) });
          probes.push({ id, subject });
          console.log(`  - probe ${n} #${id}:\n       Subject   = ${subject}\n       Requester = qa.ui${n}@example.com`);
        }
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition 2 - set-up failed', passed: false, lines: [`SET-UP FAILED - ${STEP.pre2}`, `  error: ${reason}`], corner: 'bottom-right' }).catch(() => {});
        throw e;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe tickets created');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await hp.openAllTicketsListDirect(baseUrl);
      const defaults = await hp.readAllTicketsDefaults();
      await hp.clearSearchFacets();
      await hp.searchWithOption(WORD, 'All');
      let facets = await hp.getSearchFacets();
      // Odoo applies the agent's OWN default saved search again together with the search (measured 2026-11-04) - it would
      // narrow the result, so it is removed (the step text says so)
      if (defaults.myDefaultFavorite && facets.includes(defaults.myDefaultFavorite)) {
        console.log(`  - Odoo applied my own default saved search "${defaults.myDefaultFavorite}" again with the search - removed`);
        await hp.removeSearchFacet(defaults.myDefaultFavorite);
        facets = await hp.getSearchFacets();
      }
      const pager = await hp.getPagerTotal();
      const listed = (await hp.getListRowTicketIds(80)).map(Number);
      const subjectIds = await hp.searchIdsOverRpc('helpdesk.ticket', [['name', 'ilike', WORD]], 80);
      const missing = subjectIds.filter((id) => !listed.includes(id));
      const extra = listed.filter((id) => !subjectIds.includes(id));
      const probeIds = probes.map((p) => p.id);
      console.log(`  - tickets whose subject contains ${WORD} (active): ${JSON.stringify(subjectIds)}`);
      console.log(`  - listed rows: ${JSON.stringify(listed)} (pager total ${pager})`);
      console.log(`  Observation (not scored) - listed through another field of the All search: ${JSON.stringify(extra)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the search applied is the All search for QA-UI alone', expected: `one facet, the All search for "${WORD}"`, actual: `facets ${JSON.stringify(facets)}`, passed: facets.length === 1 && facets[0].includes(WORD) && /^All/.test(facets[0]), difference: `facets ${JSON.stringify(facets)}` },
        { what: `Step 1 every ticket whose subject contains ${WORD} is listed`, expected: `${subjectIds.length} tickets listed: ${subjectIds.join(', ')} (the 3 probes ${probeIds.join(', ')} among them)`,
          actual: `${subjectIds.length - missing.length} of ${subjectIds.length} listed; probes listed: ${probeIds.filter((id) => listed.includes(id)).length} of 3`,
          passed: missing.length === 0 && probeIds.every((id) => listed.includes(id)), difference: `not listed: ${[...new Set([...missing, ...probeIds.filter((id) => !listed.includes(id))])].join(', ')}` },
      ], `${TC} - Step 1 All search`, [HelpdeskPage.SEARCH_FACETS, HelpdeskPage.LIST_VIEW, '.o_pager_counter']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - All search applied');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : `OVERALL: PASS - every ticket whose subject contains ${WORD} is listed`);
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the All search lists every subject match').toEqual([]);
    });
  });
});
