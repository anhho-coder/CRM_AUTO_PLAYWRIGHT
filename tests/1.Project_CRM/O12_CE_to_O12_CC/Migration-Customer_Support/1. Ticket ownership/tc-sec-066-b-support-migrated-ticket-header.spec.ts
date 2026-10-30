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
 *  TC-SEC-066_B - Migrated ticket header equals Odoo - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-SEC-066_B   (side A = tc-sec-066-a-preprod-migrated-ticket-header.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-30
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 engineer Nam Pham (users.support_l2_nam_support_mig,
 *                    HD Agent Support Level = L2 asserted). The Odoo side ("both systems side by side") is read on
 *                    pre-production as the same engineer (users.support_l2_manager_nam) in a second browser context.
 * Data             : READ ONLY on both systems. The one thing the case changes is Nam's own saved list state on the Support
 *                    service: the All search and the cleared filter are SAVED by FF into his default HD View - it is
 *                    snapshotted in Pre-condition 3 and restored in afterEach (deny-list: that one record, those fields)
 * Folder           : "1. Ticket ownership" = Confluence 231246777 spec area of IS-CRM-FUNC-0250 (automation author's mapping)
 *
 * Summary: for the same three tickets as side A (L1-closed, L2-closed, still open), the Support service must show the Odoo
 * subject with '(#N)', the customer e-mail, customer company, phone, created time (same user time zone), assignee and team
 * NAKIVO Customer Support, and carry N in its Odoo ID field (Desk label "Imported Ticket ID").
 *
 * Command to run: npx playwright test tc-sec-066-b-support --grep "TC-SEC-066_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 572 = row TC-SEC-066 (refs E37, E38, DM-001, DM-007,
 *                     DM-004) - 2 steps; Comparison = same
 *  Source version   : fingerprint 9f48668bcb78e650 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim)
 *    Pick a Customer Support ticket created in 2026 that exists in both systems and was closed well before both copies were
 *    taken (so neither changed since); note its Odoo number N. FF: find it with All Tickets > All search for N (a migrated
 *    subject ends with '(#N)'; on the production-built site the FF number is N itself, on helpdesk.localhost it is an FF
 *    number). If the FF site still holds the pre-E37 load, record the differences and the site name in the notes.
 *    1. Logged in as L2 engineer Nam Pham on the Support service
 *    2. Test data (CSV: "3 tickets: one L1-closed, one L2-closed, one still open") - picked on pre-production over the API
 *       with side A's rule (Customer Support, created in 2026, unchanged for 90+ days, oldest of each kind)
 *    3. FF: All Tickets > All search for each N - Nam's own "status != Closed" filter is cleared first (X beside "Filter"),
 *       because it hides closed tickets; his saved list state is snapshotted before and restored after
 *  Steps to reproduce (CSV, verbatim) - run once per ticket, the ticket named in the step label
 *    1. Open the ticket in both systems side by side.  (side B: /helpdesk/tickets/<FF number>, and its Desk form
 *       /app/hd-ticket/<FF number> for the fields the agent page does not draw: Raised By, created, Odoo ID)
 *    2. Compare: subject, customer e-mail (Raised by), customer company, phone, created date/time, assignee, team, Odoo number.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    All equal; team = NAKIVO Customer Support; created time equals Odoo's in the same user time zone; the Odoo number
 *    appears in the subject '(#N)' and the Odoo ID field.
 *
 *  How it is compared (FF value <- where it is drawn | Odoo value <- stored on pre-production):
 *    subject      <- ticket page crumb "<subject> (#N)"            | name + " (#N)"
 *    e-mail       <- Desk Details "Raised By (Email)"               | partner_email - pre-production masks addresses with
 *                    a trailing ".invalid" (sanitised clone), so that suffix is dropped and case ignored before comparing
 *    company      <- side panel "Customer"                          | the partner's company (commercial_company_name, else
 *                                                                     the partner's own name) - author's mapping
 *    phone        <- side panel "Phone"                             | phone ('' when empty)
 *    created      <- Desk sidebar "created this" timestamp title    | create_date (UTC) in Nam's FF time zone, DD-MM-YYYY HH:mm:ss
 *    assignee     <- side panel "Assignee" (avatar letter dropped)  | user_id
 *    team         <- side panel "Team" = NAKIVO Customer Support (the B expected names it)
 *    Odoo number  <- crumb ends "(#N)" AND Desk Feedback "Imported Ticket ID" (custom_odoo_id) = N
 *  Notes (not scored): the FF number of each ticket is printed - on this site it is NOT N (CSV: N on the production-built site).
 *
 * Evidence: Pre-condition 1-3 end shots; Step 2 per ticket: side panel shot, Desk Details shot, Desk created shot (the full
 *           time is the TOOLTIP of the outlined "created this" line, so it is in the banner, not drawn on the page; the
 *           value FF stores is printed as an Observation), Desk Feedback shot; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-SEC-066_B';
const SOURCE_ROW = 'TC-SEC-066';
const SOURCE_FINGERPRINT = '9f48668bcb78e650';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on the Support service (Frappe Helpdesk) /login; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Pick the 3 test tickets on pre-production (one L1-closed, one L2-closed, one still open) with side A\'s rule; note each Odoo number N',
  pre3: 'Pre-condition 3: FF: All Tickets > All search for each N (first clear the "Filter" X - Nam\'s own status != Closed hides closed tickets; his saved list state is snapshotted and restored in afterEach); note the FF ticket',
  s1: 'Step 1: Open the ticket in both systems side by side. (side B: /helpdesk/tickets/<FF number> and its Desk form /app/hd-ticket/<FF number>)',
  s2: 'Step 2: Compare: subject, customer e-mail (Raised by), customer company, phone, created date/time, assignee, team, Odoo number.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ENGINEER_ODOO = users.support_l2_manager_nam;
const FIELDS = ['id', 'name', 'partner_email', 'partner_id', 'phone', 'create_date', 'user_id', 'team_id', 'stage_id', 'write_date'];
const KINDS = [
  { kind: 'L1-closed', domain: [['stage_id.name', '=', 'Closed'], ['user_id.employee_ids.support_team', '=', 'l1']] },
  { kind: 'L2-closed', domain: [['stage_id.name', '=', 'Closed'], ['user_id.employee_ids.support_team', '=', 'l2']] },
  { kind: 'still open', domain: [['stage_id.name', '!=', 'Closed']] },
] as const;
const PANEL = ['Assignee', 'Team', 'Customer', 'Phone'];

type Check = { what: string; expected: string; actual: string; passed: boolean };
type Ticket = { kind: string; id: number; stored: Record<string, unknown>; company: string; ff: string };
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
const txt = (v: unknown): string => (v === false || v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const utcDaysAgo = (days: number): string => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
/** The bare address of an e-mail field ("Name <a@b>" -> a@b), lower-cased, pre-production's ".invalid" mask dropped. */
const mailOf = (v: string): string => ((v.match(/<([^>]+)>/) || [])[1] || v).trim().toLowerCase().replace(/\.invalid$/, '');
/** A stored UTC 'YYYY-MM-DD HH:mm:ss' as DD-MM-YYYY HH:mm:ss in `zone`. */
function utcInZone(utc: string, zone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(`${utc.replace(' ', 'T')}Z`)).map((p) => [p.type, p.value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

test.describe(`${TC} - Migrated ticket header equals Odoo on the Support service`, () => {
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
      // Back to the agent app first: the Desk form (/app/...) carries its CSRF token elsewhere, so the restore's POST
      // from there is refused with 400 "Invalid Request" (measured 2026-10-30).
      await page.goto(`${baseUrl_support_mig.replace(/\/$/, '')}/helpdesk/tickets`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      restored = await desk.restoreMyDefaultTicketView(ENGINEER.username, savedView).catch((e) => `RESTORE FAILED: ${e}`);
      console.log(`  - ${restored}`);
    } else console.log('  - Nam\'s saved list state was not snapshotted - nothing to restore');
    if (odooContext) await odooContext.close().catch(() => {});
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    odooContext = null; desk = null; savedView = null;
    // A user's saved list state left changed is a teardown defect - never a silent log line.
    if (restored.startsWith('RESTORE FAILED')) throw new Error(`Teardown: Nam's saved list state was NOT restored - ${restored}`);
  });

  test(`${TC}: Migrated ticket header equals Odoo - B: Frappe Helpdesk shows the Odoo values, team NAKIVO Customer Support and N in subject and Odoo ID, for 3 tickets`, customerSupportBaselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    desk = new SupportDeskPageMig(page);
    const d = desk;
    const checks: Check[] = [];
    const tickets: Ticket[] = [];
    let zone = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl_support_mig}`);
      await d.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await d.getMyAgentLevel(ENGINEER.username);
      zone = await d.readMyTimeZone(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}, time zone = ${zone || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(agent.level, 'the signed-in agent is an L2 engineer').toBe('L2');
      expect(zone, 'the agent has a time zone to compare in').not.toBe('');
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
      const cutoff = utcDaysAgo(90);
      const base = [['team_id.name', '=', 'Customer Support'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff]];
      console.log(`  - Rule: Customer Support, created >= 2026-01-01, last changed before ${cutoff} UTC, oldest (id asc) of each kind`);
      for (const k of KINDS) {
        const rows = await odoo.searchTicketsOverRpc([...base, ...k.domain], FIELDS, { limit: 1, order: 'id asc' });
        expect(rows.length, `a ${k.kind} test ticket exists on pre-production`).toBe(1);
        const r = rows[0];
        const partner = Array.isArray(r.partner_id) ? await odoo.readPartnerOverRpc(Number(r.partner_id[0]), ['name', 'commercial_company_name']) : {};
        const company = txt(partner.commercial_company_name) || txt(partner.name);
        console.log(`  [INTERNAL check, Call API] ${k.kind}: #${r.id} "${txt(r.name)}" stage ${m2o(r.stage_id)}, assigned ${m2o(r.user_id)}, company "${company}", last changed ${r.write_date}`);
        tickets.push({ kind: k.kind, id: Number(r.id), stored: r, company, ff: '' });
      }
      await CommonUtils.captureAndAttachScreenshot(odooPage, testInfo, 'Pre-condition 2 - test tickets picked (pre-production)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await d.openAllTicketsFromSidebar();
      savedView = await d.readMyDefaultTicketView(ENGINEER.username);
      console.log(`  [INTERNAL check, Call API] saved list state snapshot: ${JSON.stringify(savedView)}`);
      await d.clearListFilters();
      for (const t of tickets) {
        await d.searchListAll(String(t.id));
        const names = await d.getListTicketNamesOrNone(5);
        const rest = await d.listTicketsOverRest([['custom_odoo_id', '=', t.id]], ['name', 'subject'], 3);
        console.log(`  - All = ${t.id}: rows ${JSON.stringify(names)} | [INTERNAL check, Call API] custom_odoo_id = ${t.id}: ${JSON.stringify(rest)}`);
        t.ff = names.length === 1 ? names[0] : '';
        expect(rest.length, `ticket #${t.id} exists once on the Support service`).toBe(1);
        expect(names, `All search for ${t.id} finds exactly that ticket`).toEqual([String(rest[0].name)]);
        console.log(`  Note (not scored): FF number of Odoo #${t.id} = ${t.ff} (${t.ff === String(t.id) ? 'equal to N' : 'not N'})`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - tickets found by All search');
    });

    for (const [i, t] of tickets.entries()) {
      const tag = ` [ticket ${i + 1} of 3: ${t.kind} #${t.id}]`;
      const s1 = `${STEP.s1}${tag}`;
      const s2 = `${STEP.s2}${tag}`;
      const who = `Ticket ${i + 1} (${t.kind} #${t.id})`;
      const s = t.stored;

      await test.step(s1, async () => {
        console.log(`\n--- ${s1} ---`);
        await d.openTicketByLink(baseUrl_support_mig, t.ff);
      });

      await test.step(s2, async () => {
        console.log(`\n--- ${s2} ---`);
        // agent ticket page: crumb + side panel
        const crumb = await d.getTicketHeaderTitle();
        const rows = await d.getSidePanelRows();
        const panel = (label: string) => (rows.find((r) => r.label === label) || { value: '' }).value;
        const assignee = panel('Assignee').replace(/^[A-Z]\s+/, '');
        await d.markPanelRows(PANEL);
        await recordChecks(page, testInfo, checks, [
          { what: `${who} subject`, expected: `"${txt(s.name)} (#${t.id})"`, actual: `crumb "${crumb}"`, passed: crumb === `${txt(s.name)} (#${t.id})` },
          { what: `${who} customer company`, expected: `"${t.company}"`, actual: `Customer "${panel('Customer')}"`, passed: panel('Customer') === t.company },
          { what: `${who} phone`, expected: `"${txt(s.phone)}"`, actual: `Phone "${panel('Phone')}"`, passed: panel('Phone') === txt(s.phone) },
          { what: `${who} assignee`, expected: `"${m2o(s.user_id)}"`, actual: `Assignee "${assignee}"`, passed: assignee === m2o(s.user_id) },
          { what: `${who} team`, expected: '"NAKIVO Customer Support"', actual: `Team "${panel('Team')}"`, passed: panel('Team') === 'NAKIVO Customer Support' },
        ], `${TC} - Step 2 ticket ${i + 1} side panel`, [SupportDeskPageMig.PANEL_ROW, 'header'], 'bottom-left');

        // Desk form: Raised By (Details), created (sidebar), Odoo ID (Feedback)
        await d.openDeskTicketForm(baseUrl_support_mig, t.ff);
        const det = await d.readDeskTabFields('Details', ['raised_by']);
        await recordChecks(page, testInfo, checks, [
          { what: `${who} customer e-mail (Raised By)`, expected: `"${mailOf(txt(s.partner_email))}" (Odoo "${txt(s.partner_email)}", ".invalid" mask dropped, case ignored)`, actual: `Raised By (Email) "${det.raised_by}"`, passed: mailOf(det.raised_by) === mailOf(txt(s.partner_email)) },
        ], `${TC} - Step 2 ticket ${i + 1} Desk Raised By`, [SupportDeskPageMig.DESK_FIELD], 'bottom-right');
        const created = await d.readDeskCreatedTimestamp();
        const expCreated = utcInZone(String(s.create_date), zone);
        // The full time is the TOOLTIP (title) of the "created this" line - the shot shows the line outlined, the value is in its banner.
        const stored = await d.listTicketsOverRest([['name', '=', t.ff]], ['creation', 'opening_date', 'opening_time'], 1);
        console.log(`  Observation (not scored) - [INTERNAL check, Call API] FF stores ${JSON.stringify(stored[0] || {})}; Odoo stores create_date ${s.create_date} (UTC)`);
        await recordChecks(page, testInfo, checks, [
          { what: `${who} created date/time`, expected: `"${expCreated}" (Odoo ${s.create_date} UTC in ${zone})`, actual: `"${created.title}" ("${created.text}")`, passed: created.title === expCreated },
        ], `${TC} - Step 2 ticket ${i + 1} Desk created`, [SupportDeskPageMig.DESK_FIELD], 'bottom-right');
        const fb = await d.readDeskTabFields('Feedback', ['custom_odoo_id']);
        await recordChecks(page, testInfo, checks, [
          { what: `${who} Odoo number in the Odoo ID field`, expected: `Imported Ticket ID "${t.id}" (and the crumb ends "(#${t.id})")`, actual: `Imported Ticket ID "${fb.custom_odoo_id}", crumb ends "(#${t.id})": ${crumb.endsWith(`(#${t.id})`) ? 'yes' : 'no'}`, passed: fb.custom_odoo_id.replace(/[,.\s]/g, '') === String(t.id) && crumb.endsWith(`(#${t.id})`) },
        ], `${TC} - Step 2 ticket ${i + 1} Desk Odoo ID`, [SupportDeskPageMig.DESK_FIELD], 'bottom-right');
      });
    }

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the Support service shows the Odoo header values for all 3 tickets');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 3 tickets').toBe(24);
      expect(failed.map((c) => c.what), 'the Support service shows the Odoo values').toEqual([]);
    });
  });
});
