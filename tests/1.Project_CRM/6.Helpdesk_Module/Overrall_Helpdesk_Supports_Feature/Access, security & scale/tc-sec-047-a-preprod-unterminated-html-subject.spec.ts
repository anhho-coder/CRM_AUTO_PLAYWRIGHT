import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-SEC-047_A - Unterminated HTML in a subject is shown as text - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-SEC-047_A   (side B = tc-sec-047-b-support-unterminated-html-subject.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L1 agent Giang Le (users.support_l1_giang_preprod, Support Team = l1 asserted)
 * Data             : one probe ticket per run, ARCHIVED in afterEach (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : "Access, security & scale" = the Confluence 231246777 spec area the master file files this row under;
 *                    the row maps to no IS-CRM requirement (master Spec ID blank)
 *
 * Summary: a ticket whose subject carries an unterminated <img onerror> tag must show that subject literally on its form,
 * in All Tickets and on the kanban - no image element, no alert.
 * Command to run: npx playwright test tc-sec-047-a-preprod --grep "TC-SEC-047_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 553 = row TC-SEC-047 (Login, roles, security & data,
 *                     "Unterminated HTML in a subject is shown as text", High, negative, L1 agent, refs SEC-1, E03, E37) - 2 steps
 *  Source version   : fingerprint c87abbc3456451aa of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "None.") - 1. Logged in as L1 agent Giang Le on pre-production
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Create a ticket (agent create form) with subject: Invoice <img src=x onerror=alert(1)//
 *            - Subject        = Invoice <img src=x onerror=alert(1)// QA SEC probe TC-SEC-047_A <runId>
 *            - Customer Email = customer.<runId>@example.com   (CSV test data "probe ticket for customer@example.com")
 *       Deviation: the run marker is appended AFTER the payload (the tag stays unterminated) so teardown finds its own ticket.
 *    2. Open it, then view it in All Tickets, the kanban and (FF) Desk /app/hd-ticket report view. ("(FF) Desk" = side B)
 *  Verification - A expected (Odoo 12), verbatim
 *    The subject is displayed literally; no image loads and no alert pops up.
 *
 *  How: every browser dialog (alert) during Steps 1-2 is counted and dismissed; on each view the page is checked for an
 *  <img src="x"> element (the payload executed) and for the literal subject in its visible text.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 end shot; Step 2 verify shots (form; All Tickets list; kanban); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-SEC-047_A';
const SOURCE_ROW = 'TC-SEC-047';
const SOURCE_FINGERPRINT = 'c87abbc3456451aa';
const SKIP_CLEANUP_TICKETS = false;

const STEP = {
  pre1: 'Pre-condition 1: None - logged in as L1 agent Giang Le on pre-production (Odoo 12 EE); [INTERNAL check, Call API] Support Team = l1',
  s1: 'Step 1: Create a ticket (agent create form) with subject: Invoice <img src=x onerror=alert(1)// (Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE; run marker appended; Customer Email = customer.<runId>@example.com; SAVE)',
  s2: 'Step 2: Open it, then view it in All Tickets, the kanban and (FF) Desk /app/hd-ticket report view. (Odoo: the form, Helpdesk > All Tickets searched by the run marker, the same list as kanban; the Desk report view is side B)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const PAYLOAD = 'Invoice <img src=x onerror=alert(1)//';

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

test.describe(`${TC} - Unterminated HTML subject on Odoo 12 pre-production`, () => {
  let probe: { id?: string; subject?: string } = {};

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = {};
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe.subject) console.log('  - No probe ticket was created by this run - nothing to clean up');
      else if (SKIP_CLEANUP_TICKETS) console.log(`  - SKIP_CLEANUP_TICKETS = true: kept #${probe.id ?? '?'}`);
      else if (!probe.id) cleanupError = `probe "${probe.subject}" has no captured id - check by hand that it was never saved`;
      else {
        const archived = await new HelpdeskPage(page).archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      }
    } catch (e) { cleanupError = e instanceof Error ? e.message : String(e); }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Unterminated HTML in a subject is shown as text - A: Odoo 12 shows it literally on the form, in All Tickets and on the kanban`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const marker = `QA SEC probe ${TC} ${runId}`;
    const subject = `${PAYLOAD} ${marker}`;
    const alerts: string[] = [];
    page.on('dialog', (d) => { alerts.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
    const viewCheck = async (where: string, highlight: string[]) => {
      const seen = await helpdeskPage.inspectInjectedMarkup(subject);
      console.log(`  - ${where}: literal subject shown ${seen.textShown} | <img src="x"> elements ${seen.injectedImages} | alerts so far ${alerts.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 2 ${where} - the subject is displayed literally`, expected: `the text "${subject}"`, actual: seen.textShown ? 'shown literally' : 'NOT found as text', passed: seen.textShown },
        { what: `Step 2 ${where} - no image loads and no alert`, expected: '0 <img src="x"> elements, 0 alerts', actual: `${seen.injectedImages} image(s), ${alerts.length} alert(s)${alerts.length ? `: ${alerts.join(' | ')}` : ''}`, passed: seen.injectedImages === 0 && alerts.length === 0 },
      ], `${TC} - Step 2 ${where}`, highlight);
    };

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

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`     Subject        = ${subject}\n     Customer Email = customer.${runId}@example.com`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview('Customer Support');
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketWithFieldsInCurrentList({ subject, customerEmail: `customer.${runId}@example.com` });
      const stored = await helpdeskPage.readTicketOverRpc(probe.id, ['name']);
      console.log(`  - Created #${probe.id} | stored name "${String(stored.name)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 ticket created');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, probe.id as string);
      await viewCheck('ticket form', ['.o_form_view [name="name"]']);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      await helpdeskPage.searchTicket(runId);
      await helpdeskPage.waitForListRowsContaining(runId);
      await viewCheck('All Tickets list', ['.o_list_view']);
      await helpdeskPage.switchToKanbanView();
      await viewCheck('kanban', ['.o_kanban_view']);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - the subject is literal everywhere; no image, no alert');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the payload is shown as text').toEqual([]);
    });
  });
});
