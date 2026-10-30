import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl_support_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { SupportDeskPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_B, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';
import { deleteSupportProbeAsAdmin, SupportProbe } from '@helpers/support-desk-cleanup.helper';
import { customerSupportBaselineDetails } from '@helpers/customer-support-mig.helper';

/**
 * ================================================================================================
 *  TC-SEC-047_B - Unterminated HTML in a subject is shown as text - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-SEC-047_B   (side A = tc-sec-047-a-preprod-unterminated-html-subject.spec.ts = baseline, map in
 *                    helpers/customer-support-mig.baseline-map.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Status           : SKIPPED - blocked by CRM-13916 (Verify #1/#3/#5 red on 2026-10-28: the escaped subject is displayed);
 *                    re-run and un-skip when CRM-13916 is resolved
 * Host / Run as    : support-crm-mig (Frappe Helpdesk, ignoreHTTPSErrors) / L1 agent Giang Le (HD Agent Support Level = L1
 *                    asserted); teardown as Administrator over the API
 * Data             : one probe ticket (+ its Contact) per run, DELETED in afterEach (toggles SKIP_CLEANUP_*)
 * Folder           : "17. Access, security & scale" (the row maps to no IS-CRM requirement - master Spec ID blank)
 *
 * Summary: a ticket whose subject carries an unterminated <img onerror> tag must show that subject literally as typed on
 * its page, in All Tickets, on the kanban and in the Desk report view - no alert, no broken image; the stored value escaped.
 * Command to run: npx playwright test tc-sec-047-b-support --grep "TC-SEC-047_B:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 553 = row TC-SEC-047 (refs SEC-1, E03, E37) - 2 steps
 *  Source version   : fingerprint 95d56640cdb14dda of Preconditions + Steps + B expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "None.") - 1. Logged in as L1 agent Giang Le on the Support service
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Create a ticket (agent create form) with subject: Invoice <img src=x onerror=alert(1)//
 *            - Subject           = Invoice <img src=x onerror=alert(1)// QA SEC probe TC-SEC-047_B <runId>
 *            - Raised By (Email) = customer.<runId>@example.com   (CSV test data "probe ticket for customer@example.com")
 *            - Description       = Automated check of TC-SEC-047_B - created and deleted by this run.
 *       Deviation: the run marker is appended AFTER the payload (the tag stays unterminated) so teardown finds its own ticket.
 *    2. Open it, then view it in All Tickets, the kanban and (FF) Desk /app/hd-ticket report view.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The subject shows literally as typed in every view; no alert, no broken image; the stored value is escaped (text guard
 *    SEC-1).
 *
 *  How: every browser dialog is counted and dismissed; each view is checked for an <img src="x"> element and for the literal
 *  subject in its visible text. All Tickets and the kanban are read WITHOUT typing in a list filter (the list state is saved
 *  per user): the new ticket is the most recently modified one, and its kanban card is revealed in the Open column. "The
 *  stored value is escaped": the subject read back over REST must hold no raw "<img" (HTML-escaped "&lt;img" passes).
 *
 * Evidence: Pre-condition 1 end shot; Step 1 end shot; Step 2 verify shots (ticket page; list; kanban; Desk report view;
 * stored value); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true });

const TC = 'TC-SEC-047_B';
const SOURCE_ROW = 'TC-SEC-047';
const SOURCE_FINGERPRINT = '95d56640cdb14dda';
const SKIP_CLEANUP_TICKETS = false;
const SKIP_CLEANUP_CONTACTS = false;

const STEP = {
  pre1: 'Pre-condition 1: None - logged in as L1 agent Giang Le on the Support service (Frappe Helpdesk); [INTERNAL check, Call API] HD Agent Support Level = L1',
  s1: 'Step 1: Create a ticket (agent create form) with subject: Invoice <img src=x onerror=alert(1)// (All Tickets > Create; run marker appended; Raised By = customer.<runId>@example.com; Submit)',
  s2: 'Step 2: Open it, then view it in All Tickets, the kanban and (FF) Desk /app/hd-ticket report view. (no list filter typed - the newest ticket is on the first page; [INTERNAL check, Call API] the stored subject)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
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

test.describe(`${TC} - Unterminated HTML subject on the Support service`, () => {
  let probe: SupportProbe | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = null;
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_B, SOURCE_FINGERPRINT);
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe) console.log('  - No probe ticket was created by this run - nothing to clean up');
      else if (SKIP_CLEANUP_TICKETS) console.log(`  - SKIP_CLEANUP_TICKETS = true: kept ${probe.ticketName ?? '?'}`);
      else for (const l of await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, { ticketName: probe.ticketName, subject: probe.subject, contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail })) console.log(`  - ${l}`);
    } catch (e) { cleanupError = e instanceof Error ? e.message : String(e); }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Unterminated HTML in a subject is shown as text - B: Frappe Helpdesk shows it literally in every view and stores it escaped [CRM-13916]`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.skip(true, 'Ticket page, All Tickets and Kanban show the stored escaped subject "Invoice &lt;img ..." instead of the text as typed - blocked by CRM-13916');
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `${PAYLOAD} QA SEC probe ${TC} ${runId}`;
    const raisedBy = `customer.${runId}@example.com`;
    const alerts: string[] = [];
    let ticketName = '';
    page.on('dialog', (d) => { alerts.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
    const viewCheck = async (where: string, highlight: string[]) => {
      const seen = await desk.inspectInjectedMarkup(subject);
      const escaped = (await desk.inspectInjectedMarkup(subject.replace('<', '&lt;'))).textShown;
      console.log(`  - ${where}: literal subject shown ${seen.textShown} | escaped "&lt;img" text shown ${escaped} | <img src="x"> elements ${seen.injectedImages} | alerts so far ${alerts.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 2 ${where} - the subject shows literally as typed`, expected: `the text "${subject}"`, actual: seen.textShown ? 'shown literally' : escaped ? 'NOT as typed - the escaped form "Invoice &lt;img ..." is displayed' : 'NOT found as typed', passed: seen.textShown },
        { what: `Step 2 ${where} - no alert, no broken image`, expected: '0 <img src="x"> elements, 0 alerts', actual: `${seen.injectedImages} image(s), ${alerts.length} alert(s)${alerts.length ? `: ${alerts.join(' | ')}` : ''}`, passed: seen.injectedImages === 0 && alerts.length === 0 },
      ], `${TC} - Step 2 ${where}`, highlight);
    };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${AGENT.username} on ${baseUrl_support_mig}`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log(`  [INTERNAL check, Call API] support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent').toBe('L1');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---\n     Subject           = ${subject}\n     Raised By (Email) = ${raisedBy}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description: `Automated check of ${TC} - created and deleted by this run.` });
      probe.ticketName = ticketName;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 ticket created');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      await viewCheck('ticket page', ['header']);
      await desk.openAllTicketsFromSidebar();
      await viewCheck('All Tickets list', [SupportDeskPageMig.LIST_HEAD]);
      await desk.switchToKanbanLayout();
      const shown = await desk.revealKanbanCard(ticketName, 'Open');
      console.log(`  - Kanban card of ${ticketName} drawn: ${shown}`);
      await viewCheck('kanban', ['main']);
      await desk.switchToListLayout();
      await desk.openDeskTicketReportView(baseUrl_support_mig);
      await viewCheck('Desk report view', ['.layout-main-section']);
      const stored = String((await desk.readTicketDocument(ticketName)).subject || '');
      console.log(`  [INTERNAL check, Call API] stored subject: ${JSON.stringify(stored)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the stored value is escaped (text guard SEC-1)', expected: 'no raw "<img" in the stored subject', actual: JSON.stringify(stored), passed: !!stored && !stored.includes('<img') },
      ], `${TC} - Step 2 stored subject`, []);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : 'OVERALL: PASS - literal in every view, no alert, no image, stored escaped');
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the payload is shown as text and stored escaped').toEqual([]);
    });
  });
});
