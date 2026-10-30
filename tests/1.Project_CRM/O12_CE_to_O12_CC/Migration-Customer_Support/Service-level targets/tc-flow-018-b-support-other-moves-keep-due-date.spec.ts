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
 *  TC-FLOW-018_B - Other moves keep the due date - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-018_B   (side B of the A/B row TC-FLOW-018; side A = tc-flow-018-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator with its NK Stage Transition rows
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "Service-level targets" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0276; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-018_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/Service-level targets/tc-flow-018-a-preprod-other-moves-keep-due-date.spec.ts)
 *                    - same moves and the same "unchanged" check (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * A probe ticket whose Due Date was set by its move to L2 is moved to Resolving, then Escalated, then Open. The Due Date
 * read after each move must equal the one noted before the moves, and must never be empty.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-018-b-support --grep "TC-FLOW-018_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-018- --grep "TC-FLOW-018_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 107 = row TC-FLOW-018 (Area Ticket lifecycle & workflow,
 *                   Feature "Other moves keep the due date", High, regression, L2 engineer, refs E11, LC-013, AU-003)
 *                   - 3 steps
 *  Source version : fingerprint 5be76e6570a98dd2 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk)
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in L2 with a due date set by the move to L2.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket in L2 with a due date set by the move to L2 - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made unique)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Priority          = blank (FF default Medium)
 *            - Subject           = QA FLOW probe TC-FLOW-018_B <runId>
 *            - Description       = Automated check of TC-FLOW-018_B (other moves keep the due date) - created and deleted by this run.
 *         Submit -> status Open (asserted); the Status dropdown > L2 -> status L2 with a Due Date row (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd)): no customer.
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Note the Due Date.
 *    2. Move the ticket to Resolving, then to Escalated, then to Open.
 *    3. Read the Due Date after each move.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The due date never changes and is never cleared by these moves.
 *
 *  Step 2 / Step 3: "after each move" can only be read between the moves, so Step 2 reads the side panel's Due Date right
 *  after each of its three moves (a reload first, so the panel is the server's state); Step 3 checks the three reads
 *  against the Step 1 value, with the last one still on screen.
 *
 *  Environment traps (also in the step text):
 *   - The Status control is the header dropdown (labelled with the current status), not a side-panel row.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the Due Date row); Step 2 end shot;
 * Step 3 verify shot (the Due Date row after the last move, banner with all three reads); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-018_B';
const SOURCE_ROW = 'TC-FLOW-018';
const SOURCE_FINGERPRINT = '5be76e6570a98dd2';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: Probe ticket in L2 with a due date set by the move to L2 - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-018_B <runId>, Description, Submit; then the Status dropdown > L2',
  s1: 'Step 1: Note the Due Date (FF: Due Date row in the side panel)',
  s2: 'Step 2: Move the ticket to Resolving, then to Escalated, then to Open (FF: the Status dropdown in the ticket header; the side panel\'s Due Date is read right after each move, after a reload, for Step 3)',
  s3: 'Step 3: Read the Due Date after each move.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const MOVES: Array<{ from: string; to: string }> = [
  { from: 'L2', to: 'Resolving' },
  { from: 'Resolving', to: 'Escalated' },
  { from: 'Escalated', to: 'Open' },
];

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** One check as banner lines - what / Expected / Actual, wrapped at word boundaries so no value runs off the image. */
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length);
    const out: string[] = [];
    let cur = head;
    for (const word of text.split(' ')) {
      if (cur.length + word.length > width && cur.trim().length > head.trim().length) {
        out.push(cur.trimEnd());
        cur = pad;
      }
      cur += `${word} `;
    }
    out.push(cur.trimEnd());
    return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}

/**
 * Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b).
 * One call per OWNING element: `highlight` is the element the checks read; the outline colour is the verdict of THESE
 * checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-left'
): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, {
    name,
    passed: stepChecks.every((c) => c.passed),
    highlight,
    lines: stepChecks.flatMap((c) => bannerLines(c)),
    corner,
  }).catch(() => {});
}

test.describe(`${TC} - Other moves keep the due date on the Support service`, () => {
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
      if (!probe) {
        console.log('  - No probe ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - ${probe.ticketName ?? '?'} "${probe.subject}"`);
      } else {
        console.log(`  - Deleting this run's data as ${ADMIN.username} (API, deny-list by this run's markers):`);
        const lines = await deleteSupportProbeAsAdmin(baseUrl_support_mig, ADMIN, {
          ticketName: probe.ticketName,
          subject: probe.subject,
          contactEmail: SKIP_CLEANUP_CONTACTS ? undefined : probe.contactEmail,
        });
        for (const l of lines) console.log(`  - ${l}`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Other moves keep the due date - B: Frappe Helpdesk keeps the L2 Due Date through Resolving, Escalated and Open`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (other moves keep the due date) - created and deleted by this run.`;
    let ticketName = '';
    let noted = '';
    const reads: Array<{ status: string; shown: string; stored: string }> = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const who = await desk.getLoggedUser();
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] frappe.auth.get_logged_user + GET HD Agent/<user>, as Nam:');
      console.log(`     session user  = ${who}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(who.toLowerCase(), 'the session belongs to the L2 engineer').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log('     Contact           = blank');
      console.log('     Customer          = blank');
      console.log('     Priority          = blank');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.readTicketDocument(ticketName);
      await desk.chooseStatusSaved('Open', 'L2');
      await desk.reloadPage();
      const atL2 = await desk.readTicketDocument(ticketName);
      const shown = await desk.getSidePanelRowValue('Due Date');
      console.log('  Read back:');
      console.log(`     ticket            = ${ticketName}`);
      console.log(`     status            = ${created.status} -> ${atL2.status}`);
      console.log(`     Due Date at Open  = ${String(created.custom_overdue || '(empty)')}`);
      console.log(`     Due Date at L2    = stored ${String(atL2.custom_overdue || '(empty)')} | side panel "${shown || '(row not shown)'}"`);
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(atL2.status, 'the probe ticket is moved to stage L2').toBe('L2');
      expect(shown, 'the move to L2 set a Due Date shown in the side panel').not.toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket in L2 with a Due Date');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      noted = await desk.getSidePanelRowValue('Due Date');
      const stored = String((await desk.readTicketDocument(ticketName)).custom_overdue || '');
      console.log(`  - Due Date noted : "${noted}" (stored ${stored || '(empty)'})`);
      await desk.markPanelRow('Due Date');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the Due Date set by the move to L2 is noted', expected: 'a Due Date (not empty)', actual: noted || '(empty)', passed: !!noted },
      ], `${TC} - Step 1 Due Date noted`, [SupportDeskPageMig.PANEL_ROW]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const m of MOVES) {
        await desk.chooseStatusSaved(m.from, m.to);
        await desk.reloadPage();
        const doc = await desk.readTicketDocument(ticketName);
        const shown = await desk.getSidePanelRowValue('Due Date');
        reads.push({ status: String(doc.status), shown, stored: String(doc.custom_overdue || '') });
        console.log(`  - Moved ${m.from} > ${doc.status} | side panel Due Date "${shown || '(row not shown)'}" | stored ${String(doc.custom_overdue || '(empty)')}`);
        expect(String(doc.status), `the ticket reached status ${m.to}`).toBe(m.to);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 2 moved to Resolving, Escalated, Open');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const r of reads) console.log(`  - After the move to ${r.status}: "${r.shown || '(empty)'}"`);
      await desk.markPanelRow('Due Date');
      await recordChecks(page, testInfo, checks, reads.map((r) => ({
        what: `Step 3 Due Date after the move to ${r.status}`,
        expected: `"${noted}" - unchanged from Step 1 (a different or empty Due Date is a FAIL: the move recomputed or cleared it)`,
        actual: r.shown || '(empty)',
        passed: !!r.shown && r.shown === noted,
      })), `${TC} - Step 3 Due Date after each move`, [SupportDeskPageMig.PANEL_ROW]);
    });

    // ================= Verification =================
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length
        ? `OVERALL: FAIL - ${failed.length} of ${checks.length} checks failed: ${failed.map((c) => c.what).join('; ')}`
        : 'OVERALL: PASS - the due date never changes and is never cleared by the moves to Resolving, Escalated and Open');
      expect(reads.length, 'one Due Date read per move').toBe(MOVES.length);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the due date is never changed or cleared').toEqual([]);
    });
  });
});
