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
 *  TC-UI-015_B - Side panel fields in Odoo's form order - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-UI-015_B   (side A = tc-ui-015-a-preprod-side-panel-field-order.spec.ts = reference, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-14024 (Xray Test, feature CRM-11859)
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L2 engineer Nam Pham (users.support_l2_nam_support_mig,
 *                    HD Agent Support Level = L2 asserted). The Odoo values are read on pre-production (the field widgets of the Odoo form) as the same engineer
 *                    (users.support_l2_manager_nam) in a second browser context - the TC compares the two systems.
 * Data             : READ ONLY on both systems
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: for the same 3 migrated tickets as side A, the FF side panel must show the overview rows, then the sections
 * 'Ticket', 'Customer', 'Classification' with the CSV's rows in order, and every value must equal Odoo's.
 *
 * Command to run: npx playwright test tc-ui-015-b-support --grep "TC-UI-015_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 234 = row TC-UI-015; Comparison = same. Xray CRM-14024: 2 steps
 *  Source version   : fingerprint 4aafac39f0d41fd1 of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A migrated CS ticket present in both systems: pick it in FF (All Tickets), read the Odoo number from
 *    the '(#nnnnnn)' end of its subject and open that number in Odoo. Read only. Prefer a closed ticket with classification,
 *    Jira key and CC filled. Test data: 3 pair tickets (read only).
 *    1. Logged in as L2 engineer Nam Pham on the Support service
 *    2. [INTERNAL check, Call API] the 3 pair tickets, picked on pre-production with side A's rule (Customer Support, Closed,
 *       created in 2026, unchanged for 90+ days, Jira reference + Carbon Copy + classification Ticket Type set, 3 oldest)
 *    3. [INTERNAL check, Call API] each one's FF ticket: custom_odoo_id = N, subject ending '(#N)'
 *  Steps to reproduce - run once per ticket, the ticket named in the step label
 *    1. FF: open the ticket and read the side panel from top to bottom (overview rows, then the sections 'Ticket', 'Customer',
 *       'Classification').
 *    2. Compare field by field.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Panel overview rows (Team, Assigned to, Priority, Customer, legacy Classification, Tags), then heading 'Ticket' (Total
 *    Duration, Severity Level, Closed by, Shift, Timezone, Due Date, Sub-status, Jira reference, Jira key, Bug Report, Jira
 *    Priority, Affects Version/s, FCR, Wrongly escalated to L2, Interaction Round + customer / agent / meeting counters),
 *    'Customer' (CC, Opportunity type, Opportunity, Phone, Customer type, Is reseller, Is distributor, End user, End support
 *    date, Support type, Customer value, Escalation Person, L1 Notes, Customer Note, Country), 'Classification' (Ticket Type,
 *    Product line, Area, Sub Area, Issue Type, Description, Root cause, Resolution).
 *    Every value equals Odoo's.
 *
 *  How it is compared (automation author's reading, printed in every run):
 *    - Sections: after the overview, the panel's section headings must be 'Ticket', 'Customer', 'Classification' in that order.
 *      FF draws them as sub-section captions (uppercase) inside "More Details" (measured 2026-11-04); a heading that only wraps
 *      sub-sections and the related-tickets list "Customer Tickets (N)" are printed, not scored.
 *    - Rows: the CSV names -> FF captions (Assigned to = "Assignee", legacy Classification = "Classification", Jira key = "JIRA
 *      Key", the counters = Customer Interactions / Support Interactions / Meetings, CC = "Carbon Copy", Country = "Customer
 *      Country", Area = "Classification Area", other names as drawn). The drawn rows must keep the CSV order; a CSV row FF does
 *      not draw is a FAIL unless Odoo's value is empty too (FF hides some empty rows); a control caption such as "Closed By:
 *      add / remove" is printed, not scored.
 *    - Values: each drawn row with an Odoo counterpart on the Odoo form (side A's reader) must equal it after the drawing
 *      differences are removed - dates MM/DD/YYYY -> DD-MM-YYYY, money "$ 1,234.50" -> 1234.50, lists compared as sets,
 *      Team "Customer Support" = "NAKIVO Customer Support" (the team's FF name, TC-SEC-066_B), Customer = the company part of
 *      Odoo's "Company, contact", the Assignee avatar letter dropped; Jira reference compared to Odoo's STORED URL and JIRA Key
 *      to the key Odoo draws; Carbon Copy compared to the e-mails of Odoo's CC partners (pre-production's ".invalid" mask
 *      dropped). Customer Note and Customer Country have no counterpart on the Odoo form head - printed, not scored.
 *
 * Evidence: Pre-condition 1-3 end shots; Step 2 per ticket: sections + rows shot, values shot (panel rows outlined);
 *           afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-UI-015_B';
const SOURCE_ROW = 'TC-UI-015';
const SOURCE_FINGERPRINT = '4aafac39f0d41fd1';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on the Support service (Frappe Helpdesk) /login; [INTERNAL check, Call API] HD Agent Support Level = L2',
  pre2: "Pre-condition 2: [INTERNAL check, Call API] Pick the 3 pair tickets on pre-production with side A's rule; read the Odoo form of each",
  pre3: "Pre-condition 3: [INTERNAL check, Call API] Find each ticket on the Support service: custom_odoo_id = N, subject ending '(#N)'",
  s1: "Step 1: FF: open the ticket and read the side panel from top to bottom (overview rows, then the sections 'Ticket', 'Customer', 'Classification').",
  s2: 'Step 2: Compare field by field.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ENGINEER_ODOO = users.support_l2_manager_nam;
const SECTIONS = ['Ticket', 'Customer', 'Classification'];
type Row = { csv: string; ff: string; odoo: string | null; kind?: 'date' | 'money' | 'list' | 'team' | 'customer' | 'jiraUrl' | 'jiraKey' | 'cc' };
/** The CSV rows in order: CSV name -> FF caption -> the Odoo field drawn on the form (null = no counterpart on the Odoo form head). */
const ROWS: Row[] = [
  { csv: 'Team', ff: 'Team', odoo: 'team_id', kind: 'team' }, { csv: 'Assigned to', ff: 'Assignee', odoo: 'user_id' },
  { csv: 'Priority', ff: 'Priority', odoo: 'priority' }, { csv: 'Customer', ff: 'Customer', odoo: 'partner_id', kind: 'customer' },
  { csv: 'legacy Classification', ff: 'Classification', odoo: 'ticket_type_id' }, { csv: 'Tags', ff: 'Tags', odoo: 'tag_ids', kind: 'list' },
  { csv: 'Total Duration', ff: 'Total Duration', odoo: 'real_duration' }, { csv: 'Severity Level', ff: 'Severity Level', odoo: 'x_studio_severity_level' },
  { csv: 'Closed by', ff: 'Closed By', odoo: 'x_studio_field_cgl6S', kind: 'list' }, { csv: 'Shift', ff: 'Shift', odoo: 'shift' },
  { csv: 'Timezone', ff: 'Timezone', odoo: 'tz' }, { csv: 'Due Date', ff: 'Due Date', odoo: 'overdue', kind: 'date' },
  { csv: 'Sub-status', ff: 'Sub-status', odoo: 'status_id' }, { csv: 'Jira reference', ff: 'Jira reference', odoo: 'jira_edit_mode_field', kind: 'jiraUrl' },
  { csv: 'Jira key', ff: 'JIRA Key', odoo: 'jira_edit_mode_field', kind: 'jiraKey' }, { csv: 'Bug Report', ff: 'Bug Report', odoo: 'bug_report' },
  { csv: 'Jira Priority', ff: 'Jira Priority', odoo: 'jira_priority' }, { csv: 'Affects Version/s', ff: 'Affects Version/s', odoo: 'affect_version_ids', kind: 'list' },
  { csv: 'FCR', ff: 'FCR', odoo: 'fcr' }, { csv: 'Wrongly escalated to L2', ff: 'Wrongly escalated to L2', odoo: 'wrongly_escalated_to_l2' },
  { csv: 'Interaction Round', ff: 'Interaction Round', odoo: 'interaction_round' }, { csv: 'customer counter', ff: 'Customer Interactions', odoo: 'customer_interaction' },
  { csv: 'agent counter', ff: 'Support Interactions', odoo: 'support_interaction' }, { csv: 'meeting counter', ff: 'Meetings', odoo: 'meeting_interaction' },
  { csv: 'CC', ff: 'Carbon Copy', odoo: 'carbon_copy_ids', kind: 'cc' }, { csv: 'Opportunity type', ff: 'Opportunity type', odoo: 'x_studio_opportunity_type' },
  { csv: 'Opportunity', ff: 'Opportunity', odoo: 'x_studio_opportunity_supp' }, { csv: 'Phone', ff: 'Phone', odoo: 'phone' },
  { csv: 'Customer type', ff: 'Customer Type', odoo: 'customer_type' }, { csv: 'Is reseller', ff: 'Is reseller', odoo: 'is_reseller' },
  { csv: 'Is distributor', ff: 'Is distributor', odoo: 'is_distributor' }, { csv: 'End user', ff: 'End User', odoo: 'end_user_id' },
  { csv: 'End support date', ff: 'End Support Date', odoo: 'end_support_date', kind: 'date' }, { csv: 'Support type', ff: 'Support Type', odoo: 'support_type' },
  { csv: 'Customer value', ff: 'Customer Value', odoo: 'customer_value', kind: 'money' }, { csv: 'Escalation Person', ff: 'Escalation Person', odoo: 'x_studio_escalation_person' },
  { csv: 'L1 Notes', ff: 'L1 Notes', odoo: 'note_L1' }, { csv: 'Customer Note', ff: 'Customer Note', odoo: null }, { csv: 'Country', ff: 'Customer Country', odoo: null },
  { csv: 'Ticket Type', ff: 'Ticket Type', odoo: 'classification_ticket_type' }, { csv: 'Product line', ff: 'Product Line', odoo: 'product_line_id' },
  { csv: 'Area', ff: 'Classification Area', odoo: 'classification_area_id' }, { csv: 'Sub Area', ff: 'Sub Area', odoo: 'classification_sub_area_id' }, { csv: 'Issue Type', ff: 'Issue Type', odoo: 'classification_issue_type' },
  { csv: 'Description', ff: 'Description', odoo: 'classification_description' }, { csv: 'Root cause', ff: 'Root cause', odoo: 'classification_root_cause' }, { csv: 'Resolution', ff: 'Resolution', odoo: 'classification_resolution' },
];
const EMPTYISH = ['', 'No', '0', '00:00:00'];

type Check = { what: string; expected: string; actual: string; passed: boolean; difference?: string };
type Pair = { id: number; name: string; ff: string; odoo: Record<string, string>; jiraUrl: string; ccMails: string[] };
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
const set = (s: string): string => sp(s).split(/\s*,\s*/).filter(Boolean).sort().join(', ');
const mail = (s: string): string => sp(s).toLowerCase().replace(/\.invalid$/, '');
/** Odoo's drawn value in FF's drawing for the comparison (see the header). */
function odooAsFf(r: Row, p: Pair): string {
  const v = sp(p.odoo[r.odoo as string] ?? '');
  switch (r.kind) {
    case 'date': return v.replace(/^(\d{2})\/(\d{2})\/(\d{4})/, '$2-$1-$3');
    case 'money': return v ? Number(v.replace(/[^0-9.-]/g, '')).toFixed(2) : '';
    case 'list': return set(v);
    case 'team': return v === 'Customer Support' ? 'NAKIVO Customer Support' : v;
    case 'customer': return sp(v.split(', ')[0]);
    case 'jiraUrl': return p.jiraUrl;
    case 'cc': return p.ccMails.sort().join(', ');
    default: return v;
  }
}
function ffForCompare(r: Row, v: string): string {
  const s = sp(v);
  switch (r.kind) {
    case 'money': return s ? Number(s.replace(/[^0-9.-]/g, '')).toFixed(2) : '';
    case 'list': case 'cc': return set(s.split(/\s*,\s*/).map((x) => (r.kind === 'cc' ? mail(x) : x)).join(', '));
    default: return r.ff === 'Assignee' ? s.replace(/^[A-Z]\s+/, '') : s;
  }
}

test.describe(`${TC} - Side panel fields and values on the Support service`, () => {
  let odooContext: BrowserContext | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---\n  - Read-only case: nothing to clean up; the pre-production context is closed');
    if (odooContext) await odooContext.close().catch(() => {});
    odooContext = null;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Side panel fields in Odoo's form order - B: Frappe Helpdesk shows the sections Ticket / Customer / Classification in order with Odoo's values, for 3 tickets`, customerSupportBaselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const pairs: Pair[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
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
      const domain = [['team_id.name', '=', 'Customer Support'], ['stage_id.name', '=', 'Closed'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff],
        ['jira_edit_mode_field', '!=', false], ['carbon_copy_ids', '!=', false], ['classification_ticket_type', '!=', false]];
      console.log(`  - Rule (side A): ${JSON.stringify(domain)} - 3 oldest (id asc)`);
      const rows = await odoo.searchTicketsOverRpc(domain, ['id', 'name', 'jira_edit_mode_field', 'carbon_copy_ids'], { limit: 3, order: 'id asc' });
      expect(rows.length, '3 pair tickets exist on pre-production').toBe(3);
      for (const r of rows) {
        const ccIds = (r.carbon_copy_ids as number[]) || [];
        const ccMails: string[] = [];
        for (const pid of ccIds.slice(0, 10)) { const p = await odoo.readPartnerOverRpc(pid, ['email']); if (p.email) ccMails.push(mail(String(p.email))); }
        await odoo.openTicketById(baseUrl, String(r.id));
        const layout = await odoo.readFormLayout();
        const form: Record<string, string> = {};
        for (const l of layout) for (const w of l.widgets) if (!(w.name in form)) form[w.name] = w.value;
        console.log(`  [INTERNAL check, Call API] #${r.id} "${r.name}": Jira URL ${r.jira_edit_mode_field}, CC e-mails ${JSON.stringify(ccMails)}; Odoo form rows ${layout.length}`);
        pairs.push({ id: Number(r.id), name: String(r.name), ff: '', odoo: form, jiraUrl: String(r.jira_edit_mode_field || ''), ccMails });
      }
      await CommonUtils.captureAndAttachScreenshot(odooPage, testInfo, 'Pre-condition 2 - pair tickets read (pre-production)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      for (const p of pairs) {
        const rest = await desk.listTicketsOverRest([['custom_odoo_id', '=', p.id]], ['name', 'subject'], 3);
        console.log(`  [INTERNAL check, Call API] custom_odoo_id = ${p.id}: ${JSON.stringify(rest)}`);
        expect(rest.length, `Odoo #${p.id} exists once on the Support service`).toBe(1);
        expect(String(rest[0].subject), `its subject ends with (#${p.id})`).toMatch(new RegExp(`\\(#${p.id}\\)$`));
        p.ff = String(rest[0].name);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - FF tickets found');
    });

    for (const [i, p] of pairs.entries()) {
      const tag = ` [ticket ${i + 1} of 3: FF ${p.ff} = Odoo #${p.id}]`;
      const s1 = `${STEP.s1}${tag}`;
      const s2 = `${STEP.s2}${tag}`;
      let sections: Awaited<ReturnType<SupportDeskPageMig['getSidePanelSections']>> = [];

      await test.step(s1, async () => {
        console.log(`\n--- ${s1} ---`);
        await desk.openTicketByLink(baseUrl_support_mig, p.ff);
        sections = await desk.getSidePanelSections();
        for (const s of sections) console.log(`  - Section "${s.heading}": ${s.rows.map((r) => `${r.label} = ${r.value}`).join(' | ')}`);
      });

      await test.step(s2, async () => {
        console.log(`\n--- ${s2} ---`);
        const who = `Ticket ${i + 1} (FF ${p.ff} / Odoo #${p.id})`;
        const related = sections.filter((s) => /^Customer Tickets/.test(s.heading));
        // a heading that only wraps sub-sections ("More Details") holds no row of its own - it is printed, not compared
        const wrappers = sections.filter((s, k) => k > 0 && !s.rows.length && !/^Customer Tickets/.test(s.heading));
        const fieldSecs = sections.filter((s, k) => !/^Customer Tickets/.test(s.heading) && (k === 0 || s.rows.length > 0));
        if (related.length) console.log(`  Observation (not scored) - related-tickets list: ${related.map((s) => s.heading).join(', ')}`);
        if (wrappers.length) console.log(`  Observation (not scored) - section(s) wrapping the sub-sections: ${wrappers.map((s) => s.heading).join(', ')}`);
        const headsAfter = fieldSecs.slice(1).map((s) => s.heading);
        const drawn = fieldSecs.flatMap((s) => s.rows);
        const controls = drawn.filter((r) => /: add \/ remove$/.test(r.label));
        if (controls.length) console.log(`  Observation (not scored) - control captions: ${controls.map((r) => r.label).join(', ')}`);
        const fields = drawn.filter((r) => !/: add \/ remove$/.test(r.label));
        const at = (r: Row) => fields.findIndex((f) => f.label === r.ff);
        const shown = ROWS.filter((r) => at(r) >= 0);
        const notShown = ROWS.filter((r) => at(r) < 0);
        const missing = notShown.filter((r) => r.odoo !== null && !EMPTYISH.includes(odooAsFf(r, p)));
        const inOrder = shown.every((r, k) => k === 0 || at(r) > at(shown[k - 1]));
        const extra = fields.filter((f) => !ROWS.some((r) => r.ff === f.label)).map((f) => f.label);
        const firstBad = shown.findIndex((r, k) => k > 0 && at(r) < at(shown[k - 1]));
        await recordChecks(page, testInfo, checks, [
          { what: `${who} sections after the overview`, expected: SECTIONS.join(', '), actual: headsAfter.join(', ') || '(none)', passed: JSON.stringify(headsAfter) === JSON.stringify(SECTIONS),
            difference: `expected headings ${SECTIONS.map((h) => `'${h}'`).join(', ')}, the panel draws ${headsAfter.map((h) => `'${h}'`).join(', ') || 'none'}` },
          { what: `${who} the CSV rows in order (empty ones may be hidden)`, expected: ROWS.map((r) => r.ff).join(', '),
            actual: `drawn: ${fields.map((f) => f.label).join(', ')}${notShown.length ? `; not drawn: ${notShown.map((r) => r.ff).join(', ')}` : ''}`,
            passed: missing.length === 0 && inOrder && extra.length === 0,
            difference: [missing.length ? `not drawn although Odoo has a value: ${missing.map((r) => `${r.ff} (Odoo "${odooAsFf(r, p)}")`).join(', ')}` : '', extra.length ? `drawn but not in the CSV: ${extra.join(', ')}` : '',
              inOrder ? '' : `order differs at '${shown[firstBad].ff}': expected after '${shown[firstBad - 1].ff}'`].filter(Boolean).join('; ') },
        ], `${TC} - Step 2 ticket ${i + 1} sections and rows`, [SupportDeskPageMig.PANEL_SECTION_ROW, '.section-header']);

        const compared = shown.filter((r) => r.odoo !== null);
        const diffs: string[] = [];
        for (const r of compared) {
          const ffv = ffForCompare(r, fields[at(r)].value);
          const od = r.kind === 'jiraKey' ? sp(p.odoo.jira_edit_mode_field ?? '') : odooAsFf(r, p);
          if (ffv !== od) diffs.push(`${r.ff}: FF "${ffv}" vs Odoo "${od}"`);
        }
        for (const r of shown.filter((x) => x.odoo === null)) console.log(`  Observation (not scored) - ${r.ff} = "${fields[at(r)].value}" (no counterpart on the Odoo form head)`);
        await recordChecks(page, testInfo, checks, [
          { what: `${who} every value equals Odoo's`, expected: `${compared.length} drawn rows equal to the Odoo form`, actual: diffs.length ? `${compared.length - diffs.length} of ${compared.length} equal` : `all ${compared.length} equal`,
            passed: diffs.length === 0, difference: diffs.join('; ') },
        ], `${TC} - Step 2 ticket ${i + 1} values`, [SupportDeskPageMig.PANEL_SECTION_ROW]);
      });
    }

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - the panel draws the CSV sections and rows in order with the Odoo values on all 3 tickets');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 3 tickets').toBe(9);
      expect(failed.map((c) => c.what), 'the side panel matches the CSV and Odoo').toEqual([]);
    });
  });
});
