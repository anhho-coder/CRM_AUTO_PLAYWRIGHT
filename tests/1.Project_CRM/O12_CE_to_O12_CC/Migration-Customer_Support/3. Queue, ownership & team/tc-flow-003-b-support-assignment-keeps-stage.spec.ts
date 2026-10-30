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
 *  TC-FLOW-003_B - Assignment does not change the stage - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-003_B   (side B of the A/B row TC-FLOW-003; side A = tc-flow-003-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "3. Queue, ownership & team" = the Spec
 *                    area (h2) of Confluence page 231246777 whose requirement this case verifies - IS-CRM-FUNC-0266; the
 *                    TC-to-requirement mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-003_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/3. Queue, ownership & team/tc-flow-003-a-preprod-assignment-keeps-stage.spec.ts)
 *                    - same assignment and the same "stays Open" check (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * An L1 agent takes an unassigned probe ticket in status Open with "Assign to me". The status must stay Open after the save
 * and after a page reload - never In Progress (L1) / In Progress (L2), the IT team's auto-stage rule.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-003-b-support --grep "TC-FLOW-003_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-003- --grep "TC-FLOW-003_" --project=chromium-headless; --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 92 = row TC-FLOW-003 (Area Ticket lifecycle & workflow,
 *                   Feature "Assignment does not change the stage", High, regression, L1 agent, refs E10, E14, LC-033,
 *                   LC-061) - 3 steps
 *  Source version : fingerprint 61f9eb164420f396 = sha256 (16 hex) of the row's Preconditions + Steps + B expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 2
 *
 *  Pre-conditions (CSV, verbatim: "Unassigned probe ticket in stage Open in both systems.")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. One unassigned probe ticket in status Open - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made unique)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Priority          = blank (FF default Medium)
 *            - Assigned to       = blank
 *            - Subject           = QA FLOW probe TC-FLOW-003_B <runId>
 *            - Description       = Automated check of TC-FLOW-003_B (assignment keeps the stage) - created and deleted by this run.
 *         Submit -> status Open, no assignee (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd)): no customer - "ACME Test Ltd"
 *       is not an HD Customer on the Support service (measured 2026-10-28).
 *  Steps to reproduce #1 (CSV, verbatim; the "Odoo:" half belongs to side A)
 *    1. Open the probe ticket.
 *    2. Set Assigned to = the tester (FF: side panel > Assign to me).
 *    3. Read the stage / Status after saving and after a page reload.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Status stays Open; it is NOT moved to 'In Progress L1' or 'In Progress L2' (the IT-team auto-stage rule must not fire on
 *    CS tickets).
 *
 *  UI vs TC (measured 2026-10-28, the TC wording should be corrected): "Assign to me" is a button of the ticket HEADER, not
 *  of the side panel (the side panel's Assignee row is a picker). The step keeps the CSV text and says so.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 end shot; Step 2 verify shot (the Assignee row);
 * Step 3 verify shots (the Status after the save, after the reload); afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-003_B';
const SOURCE_ROW = 'TC-FLOW-003';
const SOURCE_FINGERPRINT = '61f9eb164420f396';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: Unassigned probe ticket in stage Open - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-003_B <runId>, Description, Submit',
  s1: 'Step 1: Open the probe ticket (FF: by its link /helpdesk/tickets/<number>)',
  s2: 'Step 2: Set Assigned to = the tester (FF: side panel > Assign to me) - "Assign to me" is the ticket HEADER button; the side panel only has the Assignee picker (measured 2026-10-28)',
  s3: 'Step 3: Read the stage / Status after saving and after a page reload.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const IT_AUTO_STAGES = ['In Progress (L1)', 'In Progress (L2)', 'In Progress L1', 'In Progress L2'];

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

test.describe(`${TC} - Assignment does not change the stage on the Support service`, () => {
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

  test(`${TC}: Assignment does not change the stage - B: Frappe Helpdesk keeps the ticket Open after Assign to me`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (assignment keeps the stage) - created and deleted by this run.`;
    let ticketName = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await desk.login(baseUrl_support_mig, AGENT.username, AGENT.password);
      const agent = await desk.getMyAgentLevel(AGENT.username);
      console.log('  [INTERNAL check, Call API] GET HD Agent/<user>, as Giang:');
      console.log(`     support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(agent.level, 'the signed-in agent is an L1 agent (HD Agent Support Level = L1)').toBe('L1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log('     Contact           = blank');
      console.log('     Customer          = blank');
      console.log('     Priority          = blank');
      console.log('     Assigned to       = blank');
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.getTicketFields(ticketName);
      const who = await desk.getAssigneeInfo(ticketName);
      console.log(`  Read back ${ticketName}: status = ${created.status} | _assign "${who.assignField || '(empty)'}" | open ToDo ${who.openTodos.join(', ') || '(none)'}`);
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(who.openTodos.length === 0 && !who.assignField.includes('@'), 'the probe ticket is unassigned').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - unassigned probe ticket in Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 probe ticket opened');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.assignToMeSaved();
      const who = await desk.getAssigneeInfo(ticketName);
      const shown = await desk.getSidePanelRowValue('Assignee');
      const mine = who.assignField.includes(AGENT.username) || who.openTodos.some((t) => t.startsWith(AGENT.username));
      console.log(`  - _assign "${who.assignField || '(empty)'}" | open ToDo ${who.openTodos.join(', ') || '(none)'} | side panel Assignee "${shown}"`);
      await desk.markPanelRow('Assignee');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the ticket is assigned to the tester', expected: `${AGENT.username} in _assign or an open ToDo`, actual: mine ? `assigned (${who.assignField || who.openTodos.join(', ')})` : 'NOT assigned', passed: mine },
      ], `${TC} - Step 2 Assignee`, [SupportDeskPageMig.PANEL_ROW]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const afterSave = (await desk.getTicketFields(ticketName)).status;
      const headerSave = await desk.isStatusTriggerShowing('Open');
      console.log(`  - Status after saving : ${afterSave} | header shows Open : ${headerSave}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the Status after saving', expected: `Open on the header and as stored (NOT ${IT_AUTO_STAGES.slice(0, 2).join(' / ')} - that would be the IT-team auto-stage rule firing on a CS ticket)`, actual: `${afterSave} (header Open: ${headerSave})`, passed: afterSave === 'Open' && headerSave },
      ], `${TC} - Step 3 Status after saving`, ['header button[aria-haspopup="menu"]']);
      await desk.reloadPage();
      const afterReload = (await desk.getTicketFields(ticketName)).status;
      const headerReload = await desk.isStatusTriggerShowing('Open');
      console.log(`  - Status after reload : ${afterReload} | header shows Open : ${headerReload}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the Status after a page reload', expected: 'Open on the header and as stored', actual: `${afterReload} (header Open: ${headerReload})`, passed: afterReload === 'Open' && headerReload && !IT_AUTO_STAGES.includes(afterReload) },
      ], `${TC} - Step 3 Status after reload`, ['header button[aria-haspopup="menu"]']);
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
        : 'OVERALL: PASS - the ticket is assigned to the tester and its Status stays Open after the save and after a reload');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the assignment leaves the Status at Open').toEqual([]);
    });
  });
});
