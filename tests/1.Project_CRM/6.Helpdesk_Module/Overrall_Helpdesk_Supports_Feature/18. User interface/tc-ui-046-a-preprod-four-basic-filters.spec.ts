import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-046_A - My Tickets, Unassigned, Open and Closed filters - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-046_A   (side B = tc-ui-046-b-support-four-basic-filters.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-13977 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : 3 probe tickets of this run, archived in afterEach (pre-production sends no e-mail)
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: each of My Tickets, Unassigned Tickets, Open Tickets and Closed Tickets, applied alone, must show the count of its
 * rule and rows that obey it (assigned to me / no assignee / not closed / closed stage).
 *
 * Command to run: npx playwright test tc-ui-046-a-preprod --grep "TC-UI-046_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 265 = row TC-UI-046 (Ticket screens, lists & search, High,
 *                     data, L1 agent, refs E35, UI-053, DM-042); Comparison = same. Xray CRM-13977: 1 step
 *  Source version   : fingerprint e241e309b814f409 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L1 agent. QA probe tickets created for this run in both systems: Subject = 'QA-UI probe <n>', Requester =
 *    qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists. Archive or delete them after the run. One probe assigned
 *    to you, one unassigned, one closed.
 *    1. Logged in as L1 agent Giang Le on pre-production
 *    2. [INTERNAL setup, Call API] the 3 probe tickets (team Customer Support):
 *         Subject   = QA-UI probe <n> AUTO-CRM-11859-TC-UI-046_A-<runId>
 *         Requester = qa.ui<n>@example.com
 *         Customer  = ACME Test Ltd (only when that partner exists; else blank)
 *       probe 1: Assigned to = Giang Le; probe 2: Assigned to = blank; probe 3: Closed - its classification, severity and
 *       Bug Report / FCR / Wrongly escalated are copied from the newest closed Customer Support ticket, Closed by = Giang Le,
 *       Assigned to = Giang Le (the Odoo close gate refuses a ticket without them)
 *  Steps to reproduce
 *    1. Odoo: apply My Tickets, then Unassigned, then Open, then Closed; note the counts and check 5 rows of each.
 *       (Helpdesk > All Tickets; every search facet is removed before each filter, so each count is that filter alone)
 *  Verification - A expected (Odoo 12), verbatim
 *    My Tickets = assigned to you; Unassigned = no assignee; Open = not closed; Closed = closed stage.
 *
 *  How it is compared: per filter (a) the only facet is the filter - plus Giang's own default saved search ("All Tickets222"),
 *  which Odoo applies again when a filter is chosen after the facets were removed (TC-UI-112_A, measured 2026-11-04); it then
 *  also narrows the count - (b) the pager total equals search_count of the filter's
 *  domain from the helpdesk.ticket search view (My Tickets user_id = me, Unassigned user_id = False, Open stage not closing,
 *  Closed stage closing - measured 2026-11-04) read at the same moment, (c) the first 5 rows obey the rule (their assignee /
 *  stage are read and printed). Where each probe lands is printed (side B scores it - side A's expected does not name it).
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 verify shot per filter (facets, list, pager); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-046_A';
const SOURCE_ROW = 'TC-UI-046';
const SOURCE_FINGERPRINT = 'e241e309b814f409';
const SKIP_CLEANUP = false; // true keeps the probe tickets for inspection

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L1 agent Giang Le on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l1',
  pre2: "Pre-condition 2: [INTERNAL setup, Call API] QA probe tickets of this run: Subject = 'QA-UI probe <n>' + run marker, Requester = qa.ui<n>@example.com, Customer = 'ACME Test Ltd' when it exists; one assigned to me, one unassigned, one closed",
  s1: 'Step 1: Odoo: apply My Tickets, then Unassigned, then Open, then Closed; note the counts and check 5 rows of each. (Helpdesk > All Tickets; the search facets are removed before each filter)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const subjectOf = (n: number) => `QA-UI probe ${n} AUTO-CRM-11859-${TC}-${RUN}`;
const COPIED = ['classification_ticket_type', 'product_line_id', 'classification_area_id', 'classification_sub_area_id', 'classification_issue_type', 'x_studio_severity_level', 'bug_report', 'fcr', 'wrongly_escalated_to_l2'];

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
const m2o = (v: unknown): string => (Array.isArray(v) ? String(v[1]) : '');
const toM2o = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

test.describe(`${TC} - The four basic ticket filters on Odoo 12 pre-production`, () => {
  const probes: Array<{ id: number; subject: string; kind: string }> = [];

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
      console.log(`  - probe #${p.id} (${p.kind}) archived: ${await hp.archiveTicketByIdOverRpc(p.id, p.subject).catch((e) => `NOT ARCHIVED ${String(e).split('\n')[0]}`)}`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: My Tickets, Unassigned, Open and Closed filters - A: each filter alone shows the count of its rule and rows that obey it`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];
    let uid = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await hp.getMyEmployeeSupportTeam();
      uid = (await hp.searchIdsOverRpc('res.users', [['login', '=', AGENT.username]], 1))[0];
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}, uid = ${uid}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      try {
        const team = (await hp.searchIdsOverRpc('helpdesk.team', [['name', '=', 'Customer Support']], 1))[0];
        const acme = (await hp.searchIdsOverRpc('res.partner', [['name', '=', 'ACME Test Ltd']], 1))[0];
        const closed = (await hp.searchIdsOverRpc('helpdesk.stage', [['name', '=', 'Closed'], ['team_ids', 'in', [team]]], 1))[0];
        const ref = (await hp.searchTicketsOverRpc([['team_id', '=', team], ['stage_id', '=', closed], ['classification_ticket_type', '!=', false], ['product_line_id', '!=', false], ['classification_area_id', '!=', false]], COPIED, { limit: 1, order: 'id desc' }))[0] || {};
        console.log(`  [INTERNAL setup, Call API] team Customer Support = ${team}, stage Closed = ${closed}, ACME Test Ltd = ${acme ?? '(none - Customer left blank)'}, classification copied from #${ref.id}`);
        for (const n of [1, 2, 3]) {
          const kind = ['assigned to me', 'unassigned', 'closed'][n - 1];
          const subject = subjectOf(n);
          const id = await hp.createTicketOverRpc({ name: subject, team_id: team, partner_email: `qa.ui${n}@example.com`, ...(acme ? { partner_id: acme } : {}) });
          probes.push({ id, subject, kind });
          if (n === 1) await hp.writeTicketOverRpc(id, { user_id: uid });
          if (n === 2) await hp.writeTicketOverRpc(id, { user_id: false });
          if (n === 3) {
            await hp.writeTicketOverRpc(id, { user_id: uid, ...Object.fromEntries(COPIED.map((f) => [f, toM2o(ref[f])])), x_studio_field_cgl6S: [[6, 0, [uid]]],
              classification_description: `${subject} description`, classification_root_cause: `${subject} root cause`, classification_resolution: `${subject} resolution` });
            await hp.writeTicketOverRpc(id, { stage_id: closed });
          }
          const back = await hp.readTicketOverRpc(id, ['name', 'user_id', 'stage_id', 'partner_email']);
          console.log(`  - probe ${n} #${id} (${kind}):`);
          console.log(`       Subject     = ${back.name}`);
          console.log(`       Requester   = ${back.partner_email}`);
          console.log(`       Assigned to = ${m2o(back.user_id) || '(blank)'}`);
          console.log(`       Stage       = ${m2o(back.stage_id)}`);
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
      const FILTERS: Array<{ label: string; rule: string; domain: unknown[] }> = [
        { label: 'My Tickets', rule: 'assigned to you', domain: [['user_id', '=', uid]] },
        { label: 'Unassigned Tickets', rule: 'no assignee', domain: [['user_id', '=', false]] },
        { label: 'Open Tickets', rule: 'not closed', domain: [['stage_id.is_close', '=', false]] },
        { label: 'Closed Tickets', rule: 'closed stage', domain: [['stage_id.is_close', '=', true]] },
      ];
      await hp.openAllTicketsListDirect(baseUrl);
      const defaults = await hp.readAllTicketsDefaults();
      for (const f of FILTERS) {
        await hp.clearSearchFacets();
        await hp.chooseSearchFilter(f.label);
        const facets = await hp.getSearchFacets();
        // Odoo applies the agent's OWN default saved search again when a filter is chosen after the facets were removed
        // (TC-UI-112_A, measured 2026-11-04) - it is expected among the facets and narrows the count; any other facet FAILs.
        const own = defaults.myDefaultFavorite && facets.includes(defaults.myDefaultFavorite) ? { facet: defaults.myDefaultFavorite, domain: await hp.readSavedFilterDomain(defaults.myDefaultFavorite) } : { facet: '', domain: [] as unknown[] };
        if (own.facet) console.log(`  - Odoo applied my own default saved search "${own.facet}" again (domain ${JSON.stringify(own.domain)})`);
        const want = [...(own.facet ? [own.facet] : []), f.label];
        const pager = await hp.getPagerTotal();
        const count = await hp.countTicketsOverRpc([...f.domain, ...own.domain]);
        const five = (await hp.getListRowTicketIds(5)).map(Number);
        const obey = five.length ? await hp.countTicketsOverRpc([['id', 'in', five], ...f.domain]) : 0;
        for (const id of five) { const r = await hp.readTicketOverRpc(id, ['user_id', 'stage_id']); console.log(`  - ${f.label} row #${id}: Assigned to = ${m2o(r.user_id) || '(blank)'}, Stage = ${m2o(r.stage_id)}`); }
        const landed = probes.filter((p) => p.kind).map(async (p) => `${p.kind} #${p.id}: ${(await hp.countTicketsOverRpc([['id', '=', p.id], ...f.domain])) ? 'in' : 'not in'}`);
        console.log(`  Observation (not scored) - probes in ${f.label}: ${(await Promise.all(landed)).join('; ')}`);
        await recordChecks(page, testInfo, checks, [
          { what: `${f.label} applied alone (plus my own default saved search when Odoo applies it)`, expected: `facets ${JSON.stringify(want)}`, actual: `facets ${JSON.stringify(facets)}`, passed: JSON.stringify(facets) === JSON.stringify(want), difference: `facets ${JSON.stringify(facets)}, expected ${JSON.stringify(want)}` },
          { what: `${f.label} count = tickets ${f.rule}`, expected: `pager total ${count} (search_count of ${JSON.stringify([...f.domain, ...own.domain])})`, actual: `pager total ${pager}`, passed: pager === count, difference: `expected ${count}, got ${pager} (${pager - count >= 0 ? '+' : ''}${pager - count})` },
          { what: `${f.label} first rows (up to 5) are ${f.rule}`, expected: `${Math.min(5, count)} rows, all ${f.rule}`, actual: `${five.length} rows, ${obey} ${f.rule}`, passed: five.length === Math.min(5, count) && obey === five.length, difference: `${five.length - obey} of ${five.length} rows are not ${f.rule}` },
        ], `${TC} - Step 1 ${f.label}`, [HelpdeskPage.SEARCH_FACETS, HelpdeskPage.LIST_VIEW, '.o_pager_counter']);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - four filters applied');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - each filter shows the count of its rule and rows that obey it');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 4 filters').toBe(12);
      expect(failed.map((c) => c.what), 'the four filters obey their rules').toEqual([]);
    });
  });
});
