import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-SEC-066_A - Migrated ticket header equals Odoo - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-SEC-066_A   (side B = tc-sec-066-b-support-migrated-ticket-header.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-30
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L2 engineer Nam Pham (users.support_l2_manager_nam, Support Team = l2 asserted)
 * Data             : READ ONLY - three existing Customer Support tickets, picked at run time (Pre-condition 2); nothing is
 *                    created, edited or archived
 * Folder           : "1. Ticket ownership" = Confluence 231246777 spec area of IS-CRM-FUNC-0250 (a ticket belongs to the
 *                    workstream by its Customer Support team; automation author's mapping - the CSV carries no link)
 *
 * Summary: for an L1-closed, an L2-closed and a still-open 2026 Customer Support ticket, the Odoo form must draw subject,
 * customer e-mail, customer, phone, created date/time, assignee, team and Odoo number exactly as Odoo stores them.
 *
 * Command to run: npx playwright test tc-sec-066-a-preprod --grep "TC-SEC-066_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 572 = row TC-SEC-066 (Login, roles, security & data,
 *                     "Migrated ticket header equals Odoo", High, data, L2 engineer, refs E37, E38, DM-001, DM-007, DM-004)
 *                     - 2 steps; Comparison = same
 *  Source version   : fingerprint 17c36a883d80dc53 of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim)
 *    Pick a Customer Support ticket created in 2026 that exists in both systems and was closed well before both copies were
 *    taken (so neither changed since); note its Odoo number N. FF: find it with All Tickets > All search for N (...).
 *    1. Logged in as L2 engineer Nam Pham on pre-production
 *    2. Test data (CSV: "3 tickets: one L1-closed, one L2-closed, one still open") picked over the API, the SAME rule as
 *       side B so both sides read the same three tickets: Helpdesk Team = Customer Support, created in 2026, last changed
 *       more than 90 days ago (computed at run time - "well before both copies were taken": the Support service copy was
 *       loaded 2026-08-27), the OLDEST one (lowest number) of each kind:
 *         _ L1-closed = stage Closed, assigned to an employee whose Support Team = l1
 *         _ L2-closed = stage Closed, assigned to an employee whose Support Team = l2
 *         _ still open = any stage but Closed
 *       Existence on the Support service is side B's check (same rule, its Pre-condition 2).
 *  Steps to reproduce (CSV, verbatim) - run once per ticket, the ticket named in the step label
 *    1. Open the ticket in both systems side by side.  (side A: Helpdesk > the ticket's form, /web#id=N&model=helpdesk.ticket)
 *    2. Compare: subject, customer e-mail (Raised by), customer company, phone, created date/time, assignee, team, Odoo number.
 *  Verification - A expected (Odoo 12), verbatim: "Values as stored in Odoo."
 *
 *  How it is compared: each value the form DRAWS against the value Odoo STORES (read over the API as Nam):
 *    subject = title (name) | customer e-mail = Customer Email (partner_email) | customer company = Customer (partner_id) |
 *    phone = Phone (phone, '' when empty) | created = Created on (create_date, stored UTC, drawn in the browser zone
 *    MM/DD/YYYY HH:mm:ss) | assignee = Assigned to (user_id) | team = Helpdesk Team (team_id) | Odoo number = the record
 *    id in the URL and the "(#N)" end of the breadcrumb.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 2 verify shot per ticket (the form, the compared rows outlined); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-SEC-066_A';
const SOURCE_ROW = 'TC-SEC-066';
const SOURCE_FINGERPRINT = '17c36a883d80dc53';

const STEP = {
  pre1: 'Pre-condition 1: Logged in as L2 engineer Nam Pham on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l2',
  pre2: 'Pre-condition 2: [INTERNAL check, Call API] Pick the 3 test tickets (one L1-closed, one L2-closed, one still open): Customer Support, created in 2026, unchanged for 90+ days, the oldest of each kind; note each Odoo number N',
  s1: 'Step 1: Open the ticket in both systems side by side. (side A: the ticket form /web#id=N&model=helpdesk.ticket)',
  s2: 'Step 2: Compare: subject, customer e-mail (Raised by), customer company, phone, created date/time, assignee, team, Odoo number.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const FIELDS = ['id', 'name', 'partner_email', 'partner_id', 'phone', 'create_date', 'user_id', 'team_id', 'stage_id', 'write_date'];
const KINDS = [
  { kind: 'L1-closed', domain: [['stage_id.name', '=', 'Closed'], ['user_id.employee_ids.support_team', '=', 'l1']] },
  { kind: 'L2-closed', domain: [['stage_id.name', '=', 'Closed'], ['user_id.employee_ids.support_team', '=', 'l2']] },
  { kind: 'still open', domain: [['stage_id.name', '!=', 'Closed']] },
] as const;

type Check = { what: string; expected: string; actual: string; passed: boolean };
type Ticket = { kind: string; id: number; stored: Record<string, unknown> };
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
/** 'YYYY-MM-DD HH:mm:ss' UTC, `days` before now. */
const utcDaysAgo = (days: number): string => new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');

test.describe(`${TC} - Migrated ticket header equals Odoo on Odoo 12 pre-production`, () => {
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

  test(`${TC}: Migrated ticket header equals Odoo - A: the Odoo form draws the 8 header values as stored, for 3 tickets`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const tickets: Ticket[] = [];

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      const cutoff = utcDaysAgo(90);
      const base = [['team_id.name', '=', 'Customer Support'], ['create_date', '>=', '2026-01-01 00:00:00'], ['write_date', '<', cutoff]];
      console.log(`  - Rule: Customer Support, created >= 2026-01-01, last changed before ${cutoff} UTC, oldest (id asc) of each kind`);
      for (const k of KINDS) {
        const rows = await helpdeskPage.searchTicketsOverRpc([...base, ...k.domain], FIELDS, { limit: 1, order: 'id asc' });
        console.log(`  [INTERNAL check, Call API] ${k.kind}: ${rows.length ? `#${rows[0].id} "${txt(rows[0].name)}" stage ${m2o(rows[0].stage_id)}, assigned ${m2o(rows[0].user_id)}, last changed ${rows[0].write_date}` : 'NONE'}`);
        expect(rows.length, `a ${k.kind} test ticket exists`).toBe(1);
        tickets.push({ kind: k.kind, id: Number(rows[0].id), stored: rows[0] });
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - test tickets picked');
    });

    for (const [i, t] of tickets.entries()) {
      const tag = ` [ticket ${i + 1} of 3: ${t.kind} #${t.id}]`;
      const s1 = `${STEP.s1}${tag}`;
      const s2 = `${STEP.s2}${tag}`;

      await test.step(s1, async () => {
        console.log(`\n--- ${s1} ---`);
        await helpdeskPage.openTicketById(baseUrl, t.id);
      });

      await test.step(s2, async () => {
        console.log(`\n--- ${s2} ---`);
        const drawn = await helpdeskPage.readFormFieldsByName(['name', 'partner_email', 'partner_id', 'phone', 'create_date', 'user_id', 'team_id']);
        const crumb = await helpdeskPage.getFormBreadcrumb();
        const urlId = (page.url().match(/[#&?]id=(\d+)/) || [])[1] || '';
        const created = await helpdeskPage.formatUtcAsOdooDatetime(String(t.stored.create_date));
        const s = t.stored;
        const pairs: Array<[string, string, string]> = [
          ['subject (title)', txt(s.name), drawn.name],
          ['customer e-mail (Customer Email)', txt(s.partner_email), drawn.partner_email],
          ['customer company (Customer)', m2o(s.partner_id), drawn.partner_id],
          ['phone (Phone)', txt(s.phone), drawn.phone],
          ['created date/time (Created on)', created, drawn.create_date],
          ['assignee (Assigned to)', m2o(s.user_id), drawn.user_id],
          ['team (Helpdesk Team)', m2o(s.team_id), drawn.team_id],
        ];
        await recordChecks(page, testInfo, checks, [
          ...pairs.map(([what, exp, act]) => ({ what: `Ticket ${i + 1} (${t.kind} #${t.id}) ${what}`, expected: `as stored: "${exp}"`, actual: `drawn: "${act}"`, passed: exp === act })),
          { what: `Ticket ${i + 1} (${t.kind} #${t.id}) Odoo number`, expected: `URL id ${t.id} and breadcrumb ending "(#${t.id})"`, actual: `URL id ${urlId || '(none)'}, breadcrumb "${crumb}"`, passed: urlId === String(t.id) && crumb.endsWith(`(#${t.id})`) },
        ], `${TC} - Step 2 ticket ${i + 1} ${t.kind} #${t.id}`, [HelpdeskPage.FORM_FIELD, '.o_control_panel .breadcrumb'], 'bottom-right');
      });
    }

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the form draws the 8 values as stored, for all 3 tickets');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(checks.length, 'checks were recorded for the 3 tickets').toBe(24);
      expect(failed.map((c) => c.what), 'the form draws the stored values').toEqual([]);
    });
  });
});
