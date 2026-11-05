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
 *  TC-UI-010_B - Find a ticket by its Odoo number - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-010_B   (side A = tc-ui-010-a-preprod-find-ticket-by-odoo-number.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-14015 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 engineer Nam Pham (users.support_l2_nam_support_mig,
 *                    HD Agent Support Level = L2 asserted). The Odoo half ("both systems") is read on pre-production as the
 *                    same engineer (users.support_l2_manager_nam) in a second browser context.
 * Data             : READ ONLY on both systems. The All search and the cleared filter are SAVED by FF into Nam's own default
 *                    view - snapshotted in Pre-condition 3 and restored in afterEach
 * Folder           : "15. Data & history migration" (master divider)
 *
 * Summary: All Tickets > 'Search (All)' = N must list the ticket whose subject ends '(#N)'; it must open with Odoo's subject,
 * customer and thread (Odoo's first mail drawn in the conversation).
 *
 * Command to run: npx playwright test tc-ui-010-b-support --grep "TC-UI-010_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 229 = row TC-UI-010; Comparison = same. Xray CRM-14015: 2 steps
 *  Source version   : fingerprint 32594d76e1fff8aa of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A migrated CS ticket present in both systems: pick it in FF (All Tickets), read the Odoo number from
 *    the '(#nnnnnn)' end of its subject and open that number in Odoo. Read only. Test data: Any migrated ticket number, e.g.
 *    the one in the subject suffix of FF staging ticket 13111 (read only).
 *    1. Logged in as L2 engineer Nam Pham on the Support service
 *    2. [INTERNAL check, Call API] the migrated ticket N picked on pre-production with side A's rule (Customer Support,
 *       created in 2026, unchanged for 90+ days, 1-25 messages, oldest); Odoo's subject, customer and first mail read there
 *    3. FF: sidebar All Tickets; Nam's saved list state snapshotted; his own filter cleared (the X beside "Filter" - his
 *       status != Closed would hide a closed ticket)
 *  Steps to reproduce
 *    1. FF: All Tickets, click into the 'Search (All)' quick filter, type the same number, press Enter.
 *    2. Open the found ticket in both systems and compare subject, customer and the first mail.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The ticket whose subject ends with '(#<number>)' is listed (the 'All' search matches the ticket number and the subject)
 *    and opens with the same thread.
 *    On the production-loaded site the FF ticket number equals the Odoo number; on staging helpdesk.localhost the FF number
 *    differs and the Odoo number is the subject suffix.
 *
 *  How it is compared: Step 1 - a listed row's subject ends '(#N)'; Step 2 - the FF ticket page shows the subject
 *  '<Odoo subject> (#N)', the side panel Customer = the company part of Odoo's customer ("Company, contact"), and the
 *  conversation draws the start of Odoo's first mail (its first 60 characters of text). The FF number vs N is printed (the
 *  B expected names both cases; which one this site is, is not scored).
 *
 * Evidence: Pre-condition 1-3 end shots; Step 1 verify shot (box + row); Step 2 verify shots (header + panel; conversation);
 *           afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-010_B';
const SOURCE_ROW = 'TC-UI-010';
const SOURCE_FINGERPRINT = '32594d76e1fff8aa';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on the Support service (Frappe Helpdesk) /login; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: "Pre-condition 2: [INTERNAL check, Call API] Pick the migrated ticket N on pre-production with side A's rule; read Odoo's subject, customer and first mail",
  pre3: 'Pre-condition 3: FF: sidebar All Tickets; snapshot Nam\'s saved list state; clear his own filter (the X beside "Filter")',
  s1: "Step 1: FF: All Tickets, click into the 'Search (All)' quick filter, type the same number, press Enter.",
  s2: 'Step 2: Open the found ticket in both systems and compare subject, customer and the first mail.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ENGINEER_ODOO = users.support_l2_manager_nam;

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
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-left'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}
const sp = (s: string): string => (s || '').replace(/\s+/g, ' ').trim();

test.describe(`${TC} - Find a ticket by its Odoo number on the Support service`, () => {
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
      // back to the agent app first - a restore POST from a Desk /app page is refused with 400 CSRF (measured 2026-10-30)
      await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      restored = await desk.restoreMyDefaultTicketView(ENGINEER.username, savedView).catch((e) => `RESTORE FAILED: ${e}`);
      console.log(`  - ${restored}`);
    } else console.log("  - Nam's saved list state was not snapshotted - nothing to restore");
    if (odooContext) await odooContext.close().catch(() => {});
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    odooContext = null; desk = null; savedView = null;
    if (restored.startsWith('RESTORE FAILED')) throw new Error(`Teardown: Nam's saved list state was NOT restored - ${restored}`);
  });

  test(`${TC}: Find a ticket by its Odoo number - B: Search (All) for N lists the ticket ending (#N) and it opens with Odoo's subject, customer and thread`, customerSupportBaselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    desk = new SupportDeskPageMig(page);
    const d = desk;
    const checks: Check[] = [];
    let n = 0;
    let odooSubject = '';
    let odooCompany = '';
    let firstStart = '';
    let found = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl_support_mig}`);
      await d.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await d.getMyAgentLevel(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(agent.level, 'the signed-in agent is an L2 engineer').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---\n  - Login : ${ENGINEER_ODOO.username} on ${baseUrl} (second browser context)`);
      odooContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
      const odooPage = await odooContext.newPage();
      const login = new LoginPage(odooPage);
      const odoo = new HelpdeskPage(odooPage);
      await login.navigateTo(baseUrl);
      await login.login(ENGINEER_ODOO.username, ENGINEER_ODOO.password, CommonUtils.waitTimes.pageLoad);
      await login.dismissLocationPermissionDialog();
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const cands = await odoo.searchTicketsOverRpc([['team_id.name', '=', 'Customer Support'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff]], ['id', 'name', 'partner_id', 'message_ids'], { limit: 10, order: 'id asc' });
      const pick = cands.find((c) => ((c.message_ids as unknown[]) || []).length > 0 && ((c.message_ids as unknown[]) || []).length <= 25);
      expect(pick, 'a migrated ticket with 1-25 messages exists among the 10 oldest of 2026').toBeTruthy();
      n = Number(pick!.id);
      odooSubject = sp(String(pick!.name));
      odooCompany = Array.isArray(pick!.partner_id) ? sp(String(pick!.partner_id[1]).split(', ')[0]) : '';
      const first = await odoo.readFirstMailOverRpc(n);
      firstStart = sp(first?.text || '').slice(0, 60);
      console.log(`  [INTERNAL check, Call API] N = ${n}`);
      console.log(`     Subject    = ${odooSubject}`);
      console.log(`     Customer   = ${Array.isArray(pick!.partner_id) ? pick!.partner_id[1] : '(none)'} (company part "${odooCompany}")`);
      console.log(`     First mail = #${first?.id} by ${first?.author} on ${first?.date}: "${(first?.text || '').slice(0, 120)}"`);
      await odoo.openTicketById(baseUrl, String(n));
      await CommonUtils.captureAndAttachScreenshot(odooPage, testInfo, 'Pre-condition 2 - the ticket in Odoo (pre-production)');
      expect(firstStart, 'the Odoo ticket holds a first mail').not.toBe('');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await d.openAllTicketsFromSidebar();
      savedView = await d.readMyDefaultTicketView(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] saved list state snapshot: ${JSON.stringify(savedView)}`);
      await d.clearListFilters();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - All Tickets, own filter cleared');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await d.searchListAll(String(n));
      const names = await d.getListTicketNamesOrNone(10);
      const rows = names.length ? await d.listTicketsOverRest([['name', 'in', names]], ['name', 'subject', 'custom_odoo_id'], 10) : [];
      for (const r of rows) console.log(`  - listed ${r.name}: "${r.subject}" (Odoo ID ${r.custom_odoo_id})`);
      const hit = rows.filter((r) => String(r.subject || '').endsWith(`(#${n})`));
      found = hit.length === 1 ? String(hit[0].name) : '';
      const mark = await d.markListResult(`(#${n})`);
      console.log(`  Note (not scored): FF number of Odoo #${n} = ${found || '(not found)'} (${found === String(n) ? 'equal to N - production-loaded site' : 'not N - the Odoo number is the subject suffix'})`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 1 the ticket ending '(#${n})' is listed`, expected: `one listed row whose subject ends "(#${n})"`, actual: `${hit.length} such row(s) among ${rows.length} listed; drawn: ${mark.shown ? 'yes' : 'no'}`, passed: hit.length === 1 && mark.shown, difference: `${hit.length} rows ending "(#${n})" (drawn: ${mark.shown})` },
      ], `${TC} - Step 1 found by number`, [SupportDeskPageMig.LIST_HIT], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      expect(found, 'Step 1 found the ticket to open').not.toBe('');
      await d.openTicketByLink(baseUrl_support_mig, found);
      const crumb = sp(await d.getTicketHeaderTitle());
      const customer = sp(await d.getSidePanelRowValue('Customer'));
      await d.markPanelRows(['Customer']);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the subject equals Odoo\'s', expected: `"${odooSubject} (#${n})"`, actual: `"${crumb}"`, passed: crumb === `${odooSubject} (#${n})`, difference: `expected "${odooSubject} (#${n})", got "${crumb}"` },
        { what: 'Step 2 the customer equals Odoo\'s', expected: `"${odooCompany}"`, actual: `Customer "${customer}"`, passed: customer === odooCompany, difference: `expected "${odooCompany}", got "${customer}"` },
      ], `${TC} - Step 2 subject and customer`, [SupportDeskPageMig.PANEL_ROW, 'header']);
      // an e-mail body is drawn inside an iframe - the reader looks in the page and in every frame
      let shown = await d.markConversationText(firstStart);
      if (!shown.found) { await page.waitForTimeout(CommonUtils.waitTimes.extraLong); shown = await d.markConversationText(firstStart); }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 it opens with the same thread (Odoo\'s first mail is drawn)', expected: `the conversation draws "${firstStart}"`, actual: shown.found ? `drawn (${shown.where})` : 'NOT drawn', passed: shown.found, difference: `"${firstStart}" not found on the ticket page or in its e-mail frames` },
      ], `${TC} - Step 2 first mail`, [SupportDeskPageMig.CONVERSATION_HIT], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - ticket opened');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : `OVERALL: PASS - the ticket (#${n}) is found by its number and opens with Odoo's subject, customer and thread`);
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(failed.map((c) => c.what), 'the ticket is found by its Odoo number').toEqual([]);
    });
  });
});
