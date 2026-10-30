import { test, expect, Page, TestInfo, BrowserContext } from '@playwright/test';
import { users, baseUrl, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-SEC-080_B - Archived Odoo tickets and old open tickets - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-SEC-080_B   (side A = tc-sec-080-a-preprod-archived-and-old-open-tickets.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-30
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (users.support_l1_giang_support_mig,
 *                    HD Agent Support Level = L1 asserted). The Odoo tickets are picked and re-read on pre-production as the
 *                    same agent (users.support_l1_giang_preprod) in a second browser context.
 * Data             : READ ONLY on both systems. The case changes only Giang's own saved list state on the Support service (the
 *                    All search, the cleared filter and the Archived view are SAVED by FF) - snapshotted in Pre-condition 3,
 *                    Archived switched back off and the view restored in afterEach (deny-list: that one record)
 * Folder           : "1. Ticket ownership" = Confluence 231246777 spec area of IS-CRM-FUNC-0252 (automation author's mapping)
 *
 * Summary: the open Customer Support ticket created before 2026 must be on the Support service with its thread; the archived
 * 2026 ticket must not be there (neither by the All search nor under Archived) and must stay readable in Odoo.
 *
 * Command to run: npx playwright test tc-sec-080-b-support --grep "TC-SEC-080_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 586 = row TC-SEC-080 (refs E38, DM-002, SE-004) - 1 step;
 *                     Comparison = different-by-design ("DEV decision: 2026 + all open tickets now; full or archived history
 *                     only as an option (E38).")
 *  Source version   : fingerprint fe2107828b7e7cc7 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim)
 *    Odoo: one 2026 CS ticket that is archived (Filters > Archived) and one CS ticket created before 2026 that is still open.
 *    1. Logged in as L1 agent Giang Le on the Support service
 *    2. Test data (CSV: "one archived and one pre-2026 open CS ticket") picked on pre-production over the API with side A's
 *       rule: archived = Customer Support, archived, created in 2026, oldest; old open = Customer Support, created before
 *       2026, any stage but Closed, the one changed longest ago (its state is then the one the Support service copy saw)
 *    3. FF: All Tickets - Giang's saved list state is snapshotted, then every list filter is cleared (X beside "Filter") so
 *       her own status filter cannot hide a ticket
 *  Steps to reproduce (CSV, verbatim; the Odoo half belongs to TC-SEC-080_A)
 *    1. Search both Odoo numbers in FF (All search and Filters > Archived).
 *       (All Tickets quick filter "All" = N for each; then the header Filters > Archived and the All search again)
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The old open ticket is present with its thread; the archived one is not in FF (only active 2026 tickets and every open
 *    ticket were migrated) and stays readable in Odoo.
 *    -> the old open N is listed (a row "... (#N)") and its thread holds at least one mail; the archived N is listed neither
 *       by the All search nor under Archived; on pre-production the archived ticket's form opens ("... (#N)" breadcrumb).
 *    A row is "listed" when the list draws the text "(#N)" - the Archived view draws its rows without ticket links
 *    (measured 2026-10-23), so the drawn text is read, not the links.
 *
 * Evidence: Pre-condition 1-3 end shots; Step 1 verify shots (old open search, archived search, archived under Archived,
 *           the archived ticket on pre-production); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-SEC-080_B';
const SOURCE_ROW = 'TC-SEC-080';
const SOURCE_FINGERPRINT = 'fe2107828b7e7cc7';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L1 agent Giang Le on the Support service (Frappe Helpdesk) /login; [INTERNAL check, Call API] HD Agent Support Level = L1',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Odoo: one 2026 CS ticket that is archived (Filters > Archived) and one CS ticket created before 2026 that is still open - picked on pre-production with side A\'s rule',
  pre3: 'Pre-condition 3: FF: All Tickets - snapshot Giang\'s saved list state (restored in afterEach), then clear every list filter (the X beside "Filter")',
  s1: 'Step 1: Search both Odoo numbers in FF (All search and Filters > Archived). (All Tickets quick filter "All" = N; then header Filters > Archived and the All search again)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const AGENT_ODOO = users.support_l1_giang_preprod;
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
test.describe(`${TC} - Archived Odoo tickets and old open tickets on the Support service`, () => {
  let odooContext: BrowserContext | null = null;
  let desk: SupportDeskPageMig | null = null;
  let savedView: Awaited<ReturnType<SupportDeskPageMig['readMyDefaultTicketView']>> = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let restored = '';
    if (desk && savedView) {
      await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      if (await desk.isArchivedViewShown().catch(() => false)) {
        await desk.toggleListArchivedFilter().catch((e) => console.log(`  - Archived view could not be switched off: ${e}`));
      }
      restored = await desk.restoreMyDefaultTicketView(AGENT.username, savedView).catch((e) => `RESTORE FAILED: ${e}`);
      console.log(`  - ${restored} | Archived view still on: ${await desk.isArchivedViewShown().catch(() => 'unknown')}`);
    } else console.log('  - Giang\'s saved list state was not snapshotted - nothing to restore');
    if (odooContext) await odooContext.close().catch(() => {});
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    odooContext = null; desk = null; savedView = null;
    if (restored.startsWith('RESTORE FAILED')) throw new Error(`Teardown: Giang's saved list state was NOT restored - ${restored}`);
  });

  test(`${TC}: Archived Odoo tickets and old open tickets - B: the old open ticket is in FF with its thread, the archived one is not and stays readable in Odoo`, customerSupportBaselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    desk = new SupportDeskPageMig(page);
    const d = desk;
    const checks: Check[] = [];
    let odoo: HelpdeskPage | null = null;
    let odooPage: Page | null = null;
    let archived = 0;
    let oldOpen = 0;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await d.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await d.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---\n  - Login : ${AGENT_ODOO.username} on ${baseUrl} (second browser context)`);
      odooContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
      odooPage = await odooContext.newPage();
      const login = new LoginPage(odooPage);
      odoo = new HelpdeskPage(odooPage);
      await login.navigateTo(baseUrl);
      await login.login(AGENT_ODOO.username, AGENT_ODOO.password, CommonUtils.waitTimes.pageLoad);
      await login.dismissLocationPermissionDialog();
      const a = await odoo.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['active', '=', false], ['create_date', '>=', '2026-01-01 00:00:00']], FIELDS, { limit: 1, order: 'id asc' });
      const o = await odoo.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['create_date', '<', '2026-01-01 00:00:00'], ['stage_id.name', '!=', 'Closed']], FIELDS, { limit: 1, order: 'write_date asc' });
      for (const [label, r] of [['archived 2026', a[0]], ['open, created before 2026', o[0]]] as const) {
        console.log(`  [INTERNAL check, Call API] ${label}: ${r ? `#${r.id} "${String(r.name).replace(/\s+/g, ' ')}" created ${r.create_date}, stage ${m2o(r.stage_id)}, active ${r.active}, last changed ${r.write_date}` : 'NONE'}`);
      }
      expect(a.length, 'an archived 2026 Customer Support ticket exists on pre-production').toBe(1);
      expect(o.length, 'an open Customer Support ticket created before 2026 exists on pre-production').toBe(1);
      archived = Number(a[0].id);
      oldOpen = Number(o[0].id);
      await CommonUtils.captureAndAttachScreenshot(odooPage, testInfo, 'Pre-condition 2 - test tickets picked (pre-production)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await d.openAllTicketsFromSidebar();
      savedView = await d.readMyDefaultTicketView(AGENT.username);
      console.log(`  [INTERNAL check, Call API] saved list state snapshot: ${JSON.stringify(savedView)}`);
      expect(savedView, 'Giang has a saved list state to restore').not.toBeNull();
      if (await d.isArchivedViewShown()) throw new Error('the list already shows the Archived view - not the agent\'s normal state');
      await d.clearListFilters();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - list filters cleared');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const rest = await d.listTicketsOverRest([['custom_odoo_id', 'in', [String(oldOpen), String(archived)]]], ['name', 'subject', 'custom_odoo_id', 'custom_archived'], 5);
      console.log(`  [INTERNAL check, Call API] FF tickets with custom_odoo_id in (${oldOpen}, ${archived}): ${JSON.stringify(rest)}`);

      // the old open ticket: listed, with its thread
      await d.searchListAll(String(oldOpen));
      const open = await d.markListResult(`(#${oldOpen})`);
      const openNames = await d.getListTicketNamesOrNone(5);
      let thread = -1;
      if (openNames.length === 1) thread = await d.countTicketCommunicationsOverRest(openNames[0]);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 All search for the old open ticket #${oldOpen}`, expected: `a row "... (#${oldOpen})" is listed`, actual: open.shown ? `listed (FF ${JSON.stringify(openNames)})` : `not listed${open.empty ? ' - "No tickets found"' : ''}`, passed: open.shown },
        { what: `Step 1 the old open ticket #${oldOpen} has its thread`, expected: 'at least one mail in its thread', actual: thread < 0 ? 'no ticket to read a thread from' : `[INTERNAL check, Call API] ${thread} mail(s)`, passed: thread > 0 },
      ], `${TC} - Step 1 All search old open ticket`, [SupportDeskPageMig.LIST_HIT], 'bottom-right');

      // the archived ticket: not listed by the All search
      await d.searchListAll(String(archived));
      const plain = await d.markListResult(`(#${archived})`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 All search for the archived ticket #${archived}`, expected: `no row "... (#${archived})" (not in FF)`, actual: plain.shown ? 'listed' : `not listed${plain.empty ? ' - "No tickets found"' : ''}`, passed: !plain.shown },
      ], `${TC} - Step 1 All search archived ticket`, [SupportDeskPageMig.LIST_HIT], 'bottom-right');

      // ... nor under Filters > Archived
      await d.toggleListArchivedFilter();
      const archivedOn = await d.isArchivedViewShown();
      await d.searchListAll(String(archived));
      const underArchived = await d.markListResult(`(#${archived})`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 Filters > Archived with the All search for #${archived}`, expected: `the Archived view is on and no row "... (#${archived})"`, actual: `Archived view on: ${archivedOn}; ${underArchived.shown ? 'listed' : `not listed${underArchived.empty ? ' - "No tickets found"' : ''}`}`, passed: archivedOn && !underArchived.shown },
      ], `${TC} - Step 1 Filters Archived archived ticket`, [SupportDeskPageMig.LIST_HIT], 'bottom-right');

      // ... and stays readable in Odoo
      if (!odoo || !odooPage) throw new Error('the pre-production context is not open');
      const o = odoo as HelpdeskPage;
      const op = odooPage as Page;
      await o.openTicketById(baseUrl, archived);
      const crumb = await o.getFormBreadcrumb().catch(() => '');
      await recordChecks(op, testInfo, checks, [
        { what: `Step 1 the archived ticket #${archived} stays readable in Odoo`, expected: `its form opens on pre-production, breadcrumb ending "(#${archived})"`, actual: crumb ? `breadcrumb "${crumb}"` : 'the form did not open', passed: crumb.endsWith(`(#${archived})`) },
      ], `${TC} - Step 1 archived ticket readable in Odoo`, ['.o_control_panel .breadcrumb', '.o_form_view .oe_title'], 'bottom-right');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the old open ticket is in FF with its thread; the archived one is not, and is readable in Odoo');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(checks.length, 'five checks were recorded').toBe(5);
      expect(failed.map((c) => c.what), 'archived and old open tickets behave as expected').toEqual([]);
    });
  });
});
