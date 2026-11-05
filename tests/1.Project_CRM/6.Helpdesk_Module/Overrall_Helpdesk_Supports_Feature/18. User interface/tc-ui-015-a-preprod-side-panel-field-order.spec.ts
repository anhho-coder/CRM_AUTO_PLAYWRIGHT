import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-015_A - Side panel fields in Odoo's form order - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-015_A   (side B = tc-ui-015-b-support-side-panel-field-order.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-11-04
 * Jira             : CRM-13974 (Xray Test, feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L2 engineer Nam Pham (users.support_l2_manager_nam, Support Team = l2 asserted)
 * Data             : READ ONLY - 3 migrated Customer Support tickets are opened, nothing is changed
 * Folder           : "18. User interface" (master divider)
 *
 * Summary: on 3 closed migrated tickets with Jira reference, Carbon Copy and a classification, the Odoo form must show the
 * CSV's fields in the CSV's order within each group (head of the form, then the Classification section), with their values.
 *
 * Command to run: npx playwright test tc-ui-015-a-preprod --grep "TC-UI-015_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 234 = row TC-UI-015 (Ticket screens, lists & search, High,
 *                     data, L2 engineer, refs E34, UI-001, UI-066, UI-020..UI-028); Comparison = same. Xray CRM-13974: 2 steps
 *  Source version   : fingerprint 51e92b33922a2d4d of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (master, verbatim)
 *    Role: L2 engineer. A migrated CS ticket present in both systems (...). Read only: never reply on or change a migrated
 *    ticket. Prefer a closed ticket with classification, Jira key and CC filled. Test data: 3 pair tickets (read only).
 *    1. Logged in as L2 engineer Nam Pham on pre-production
 *    2. [INTERNAL check, Call API] the 3 pair tickets: Customer Support, Closed, created >= 2026-01-01 (the Support service
 *       holds tickets created in 2026), unchanged for 90+ days, with Jira reference, Carbon Copy and classification Ticket
 *       Type set - the 3 oldest (id asc)
 *  Steps to reproduce - run once per ticket, the ticket named in the step label
 *    1. Odoo: open the ticket form and note the left group, right group and Classification group fields with their values.
 *    2. Compare field by field.
 *  Verification - A expected (Odoo 12), verbatim
 *    Form: Team, Assigned to, Priority, Customer, Classification, Tags; Severity Level, Closed by, Shift, Timezone, Due Date,
 *    Status, Jira reference, Bug Report, Jira Priority, Affects Version/s, FCR, Wrongly escalated to L2, Interaction Round and
 *    counters; CC, Phone, Customer type, End support date, Support type, Customer value, Escalation Person, L1 notes;
 *    Classification: Ticket Type, Product line, Area, Sub Area, Issue Type, Description, Root cause, Resolution.
 *
 *  How it is compared (automation author's reading, printed in every run):
 *    - The four ";"-groups are compared one by one. Odoo's own captions differ from the CSV's short names: Team = "Helpdesk
 *      Team", CC = "Carbon Copy", "counters" = Customer Interactions, Support Interactions, Meetings; the rest match by name.
 *    - Presence: a CSV field whose stored value is not empty must be drawn (in the head of the form for the first three
 *      groups, under the "Classification" separator for the last). Odoo hides an EMPTY field in read mode, so a field with
 *      an empty stored value is printed as "hidden (empty)" and not scored.
 *    - Order: inside each group the drawn fields keep the CSV's order (screen order = left column top to bottom, then the
 *      right column, as Odoo lays the inner groups out).
 *    - Drawn fields the CSV does not name (e.g. Total Duration, Created on, Customer Name / Email) are printed, not scored.
 *  Step 1 carries no expected result in Xray (the CSV's expected belongs to the comparison) - it reads and prints.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 2 verify shot per ticket (every row read, outlined); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-015_A';
const SOURCE_ROW = 'TC-UI-015';
const SOURCE_FINGERPRINT = '51e92b33922a2d4d';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Pick the 3 pair tickets: Customer Support, Closed, created in 2026, unchanged for 90+ days, with Jira reference, Carbon Copy and classification Ticket Type set',
  s1: 'Step 1: Odoo: open the ticket form and note the left group, right group and Classification group fields with their values.',
  s2: 'Step 2: Compare field by field.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
type Want = { csv: string; label: string; field: string };
/** The CSV's four groups: CSV name -> Odoo caption -> stored field (author's mapping of the short names). */
const GROUPS: Array<{ name: string; section: string; fields: Want[] }> = [
  { name: 'group 1 (Team .. Tags)', section: '', fields: [
    { csv: 'Team', label: 'Helpdesk Team', field: 'team_id' }, { csv: 'Assigned to', label: 'Assigned to', field: 'user_id' },
    { csv: 'Priority', label: 'Priority', field: 'priority' }, { csv: 'Customer', label: 'Customer', field: 'partner_id' },
    { csv: 'Classification', label: 'Classification', field: 'ticket_type_id' }, { csv: 'Tags', label: 'Tags', field: 'tag_ids' }] },
  { name: 'group 2 (Severity Level .. counters)', section: '', fields: [
    { csv: 'Severity Level', label: 'Severity Level', field: 'x_studio_severity_level' }, { csv: 'Closed by', label: 'Closed by', field: 'x_studio_field_cgl6S' },
    { csv: 'Shift', label: 'Shift', field: 'shift' }, { csv: 'Timezone', label: 'Timezone', field: 'tz' }, { csv: 'Due Date', label: 'Due Date', field: 'overdue' },
    { csv: 'Status', label: 'Status', field: 'status_id' }, { csv: 'Jira reference', label: 'Jira reference', field: 'jira_edit_mode_field' },
    { csv: 'Bug Report', label: 'Bug Report', field: 'bug_report' }, { csv: 'Jira Priority', label: 'Jira Priority', field: 'jira_priority' },
    { csv: 'Affects Version/s', label: 'Affects Version/s', field: 'affect_version_ids' }, { csv: 'FCR', label: 'FCR', field: 'fcr' },
    { csv: 'Wrongly escalated to L2', label: 'Wrongly escalated to L2', field: 'wrongly_escalated_to_l2' },
    { csv: 'Interaction Round', label: 'Interaction Round', field: 'interaction_round' },
    { csv: 'counters (customer)', label: 'Customer Interactions', field: 'customer_interaction' },
    { csv: 'counters (support)', label: 'Support Interactions', field: 'support_interaction' },
    { csv: 'counters (meetings)', label: 'Meetings', field: 'meeting_interaction' }] },
  { name: 'group 3 (CC .. L1 notes)', section: '', fields: [
    { csv: 'CC', label: 'Carbon Copy', field: 'carbon_copy_ids' }, { csv: 'Phone', label: 'Phone', field: 'phone' },
    { csv: 'Customer type', label: 'Customer Type', field: 'customer_type' }, { csv: 'End support date', label: 'End Support Date', field: 'end_support_date' },
    { csv: 'Support type', label: 'Support Type', field: 'support_type' }, { csv: 'Customer value', label: 'Customer Value', field: 'customer_value' },
    { csv: 'Escalation Person', label: 'Escalation Person', field: 'x_studio_escalation_person' }, { csv: 'L1 notes', label: 'L1 notes', field: 'note_L1' }] },
  { name: 'Classification', section: 'Classification', fields: [
    { csv: 'Ticket Type', label: 'Ticket Type', field: 'classification_ticket_type' }, { csv: 'Product line', label: 'Product line', field: 'product_line_id' },
    { csv: 'Area', label: 'Area', field: 'classification_area_id' }, { csv: 'Sub Area', label: 'Sub Area', field: 'classification_sub_area_id' },
    { csv: 'Issue Type', label: 'Issue Type', field: 'classification_issue_type' }, { csv: 'Description', label: 'Description', field: 'classification_description' },
    { csv: 'Root cause', label: 'Root cause', field: 'classification_root_cause' }, { csv: 'Resolution', label: 'Resolution', field: 'classification_resolution' }] },
];
const STORED = Array.from(new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.field))));

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
/** An empty stored value - Odoo hides such a field in read mode. 0 is a value (Odoo draws the counter). */
const isEmpty = (v: unknown): boolean => v === false || v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

test.describe(`${TC} - Ticket form fields in the CSV order on Odoo 12 pre-production`, () => {
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

  test(`${TC}: Side panel fields in Odoo's form order - A: Odoo 12 draws the CSV's fields in its order on 3 migrated tickets`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const hp = new HelpdeskPage(page);
    const checks: Check[] = [];
    const tickets: Array<Record<string, unknown>> = [];

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
      const domain = [['team_id.name', '=', 'Customer Support'], ['stage_id.name', '=', 'Closed'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff],
        ['jira_edit_mode_field', '!=', false], ['carbon_copy_ids', '!=', false], ['classification_ticket_type', '!=', false]];
      console.log(`  - Rule: ${JSON.stringify(domain)} - 3 oldest (id asc)`);
      const rows = await hp.searchTicketsOverRpc(domain, ['id', 'name', ...STORED], { limit: 3, order: 'id asc' });
      for (const r of rows) console.log(`  [INTERNAL check, Call API] #${r.id} "${r.name}"`);
      tickets.push(...rows);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - pair tickets picked');
      expect(rows.length, '3 pair tickets exist on pre-production').toBe(3);
    });

    for (const [i, t] of tickets.entries()) {
      const tag = ` [ticket ${i + 1} of 3: #${t.id}]`;
      const s1 = `${STEP.s1}${tag}`;
      const s2 = `${STEP.s2}${tag}`;
      let layout: Awaited<ReturnType<HelpdeskPage['readFormLayout']>> = [];

      await test.step(s1, async () => {
        console.log(`\n--- ${s1} ---`);
        await hp.openTicketById(baseUrl, String(t.id));
        layout = await hp.readFormLayout();
        for (const r of layout) console.log(`  - ${r.section || 'head'} / ${r.column.padEnd(5)} : ${r.label} = ${r.widgets.length > 1 ? r.widgets.map((w) => `${w.name} "${w.value}"`).join(' + ') : r.value}`);
      });

      await test.step(s2, async () => {
        console.log(`\n--- ${s2} ---`);
        const stepChecks: Check[] = [];
        for (const g of GROUPS) {
          // matched by the stored field name: a caption-less field drawn in another field's row (Sub Area beside Area) counts
          const drawn = g.fields.map((f) => ({ f, at: layout.findIndex((r) => r.widgets.some((w) => w.name === f.field) && r.section === g.section) }));
          const missing = drawn.filter((d) => d.at < 0 && !isEmpty(t[d.f.field])).map((d) => `${d.f.csv} (stored ${JSON.stringify(t[d.f.field])})`);
          const hidden = drawn.filter((d) => d.at < 0 && isEmpty(t[d.f.field])).map((d) => d.f.csv);
          const shown = drawn.filter((d) => d.at >= 0);
          const order = shown.map((d) => d.f.label);
          const inOrder = shown.every((d, k) => k === 0 || d.at >= shown[k - 1].at);
          const screen = [...shown].sort((a, b) => a.at - b.at).map((d) => d.f.label);
          if (hidden.length) console.log(`  Observation (not scored) - ${g.name}: hidden because empty on this ticket: ${hidden.join(', ')}`);
          stepChecks.push({
            what: `Ticket ${i + 1} #${t.id} ${g.name}: every filled field drawn${g.section ? ' under "Classification"' : ' in the head of the form'}, in the CSV order`,
            expected: `${g.fields.map((f) => f.label).join(', ')} (empty ones hidden)`,
            actual: `drawn in screen order: ${screen.join(', ') || '(none)'}${hidden.length ? `; hidden (empty): ${hidden.join(', ')}` : ''}`,
            passed: missing.length === 0 && inOrder,
            difference: [missing.length ? `filled but not drawn: ${missing.join(', ')}` : '', inOrder ? '' : `order differs: CSV order ${order.join(', ')}, screen order ${screen.join(', ')}`].filter(Boolean).join('; '),
          });
        }
        const named = new Set(STORED);
        console.log(`  Observation (not scored) - drawn but not named by the CSV: ${layout.filter((r) => !r.widgets.some((w) => named.has(w.name))).map((r) => `${r.label} (${r.section || 'head'})`).join(', ') || 'none'}`);
        await recordChecks(page, testInfo, checks, stepChecks, `${TC} - Step 2 ticket ${i + 1} form fields`, [HelpdeskPage.FORM_LAYOUT_ROW], 'bottom-right');
      });
    }

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}${!c.passed && c.difference ? `\n     Difference : ${c.difference}` : ''}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => `Verify #${checks.indexOf(c) + 1}: ${c.difference}`).join(' | ')}` : 'OVERALL: PASS - Odoo draws the CSV fields in its order on all 3 tickets');
      for (const c of checks) expect.soft(c.passed, `${c.what} - ${c.difference || `expected ${c.expected}, actual ${c.actual}`}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 3 tickets').toBe(12);
      expect(failed.map((c) => c.what), 'the Odoo form draws the CSV fields in order').toEqual([]);
    });
  });
});
