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
 *  TC-FLOW-040_B - Close gate: assignee required - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-040_B   (side B of the A/B row TC-FLOW-040; side A = tc-flow-040-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and its Raised By Contact) created per run, DELETED in afterEach as Administrator
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0380 (the mandatory closing set); the TC-to-requirement
 *                    mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-040_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-040-a-preprod-close-gate-assignee-missing.spec.ts)
 *                    map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket with every classification and quality field filled but no assignee, set its Status
 * to Closed from the ticket header; the refusal must list 'Assigned to' as missing.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-040-b-support --grep "TC-FLOW-040_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-040- --grep "TC-FLOW-040_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 129 = row TC-FLOW-040 (Area Ticket lifecycle & workflow,
 *                   Feature "Close gate: assignee required", High, negative, L2 engineer, refs E13, E14, LC-018, LC-033) - 1 step
 *  Source version : fingerprint ca82a4038605ec27 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket with every classification and quality field filled but no assignee.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket with every classification and quality field filled and no assignee - CREATED by this run:
 *         All Tickets > Create (Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-040_B <runId>,
 *         Description, Submit); the side panel: Severity Level = Severity 3, Bug Report = No, FCR = Yes, Wrongly escalated
 *         to L2 = No, Ticket Type = Question, Product Line = AI, Classification Area = Cloud Compute, Sub Area = AWS,
 *         Issue Type = AD Integration, Description / Root cause / Resolution = run-unique text. Assigned to = blank.
 *       The CSV names no stage; the probe stays in the stage it is created in (Open).
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Set the stage to Closed. (FF: status dropdown in the ticket header > Closed)
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Refused: '"Assigned to" field' is listed as missing.
 *
 *  Environment traps (also in the step text):
 *   - The status is the ticket header dropdown (see TC-FLOW-038_B); the refusal is a "Missing required fields" dialog.
 *   - The assignee is read from the side panel's Assignee row: the REST document of this Frappe build does not carry it.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Step 1 and the refusal
 * list (outlined green = PASS, red = FAIL); one end-of-section shot after Step 1; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-040_B';
const SOURCE_ROW = 'TC-FLOW-040';
const SOURCE_FINGERPRINT = 'ca82a4038605ec27';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact Frappe created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One probe ticket with every classification and quality field filled and no assignee - created by this run: All Tickets > Create, Subject = QA FLOW probe TC-FLOW-040_B <runId>, Submit; then the side panel fields; the stage is not named by the CSV and stays Open',
  s1: 'Step 1: FF: Set the stage to Closed (FF: status dropdown in the ticket header > Closed) - trap: the status is the header dropdown, not the side panel',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const STATUS_CLOSED = 'Closed';
const INTRO = 'Please fill in next to close the ticket:';
/** The CSV "B expected" item. */
const EXPECTED_ITEMS = ['Assigned to'];

/** The values this run enters (the CSV names the fields, not the values). */
const VALUES = {
  severity: 'Severity 3', bugReport: 'No', fcr: 'Yes', wronglyEscalated: 'No',
  ticketType: 'Question', productLine: 'AI', area: 'Cloud Compute', subArea: 'AWS', issueType: 'AD Integration',
  description: 'Explore Description TC-FLOW-040_B', rootCause: 'Explore Root cause TC-FLOW-040_B', resolution: 'Explore Resolution TC-FLOW-040_B',
};

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** Close-gate items as field names: '"Assigned to" field' -> 'Assigned to'; a group with listed fields is expanded. */
function gateItemNames(message: string): string[] {
  const at = message.indexOf(INTRO);
  if (at < 0) return [];
  const body = message.slice(at + INTRO.length).replace(/\s+OK\s*$/, '').trim().replace(/^-\s+/, '');
  const names: string[] = [];
  for (const part of body.split(/\s+-\s+(?=")/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^"([^"]+)"\s+(field|group)(?::\s*(.*))?$/);
    if (!m) {
      names.push(`?${part}`);
      continue;
    }
    const [, name, kind, fields] = m;
    if (kind === 'group' && fields) names.push(...fields.split(/,\s*/).map((s) => s.trim()).filter(Boolean));
    else names.push(name);
  }
  return names;
}

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
 * One call per OWNING element: `highlight` is the element the checks read (the dialog, the stage bar, the list), and it
 * must still be on screen - a dialog / toast value is shot before the dialog is closed or the toast fades. The outline
 * colour is the verdict of THESE checks only. `corner` keeps the banner off the outlined element.
 */
async function recordChecks(
  page: Page,
  testInfo: TestInfo,
  all: Check[],
  stepChecks: Check[],
  name: string,
  highlight: string[] = [],
  corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'
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

test.describe(`${TC} - Close gate with the assignee missing on the Support service`, () => {
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

  test(`${TC}: Close gate with every field filled but no assignee - B: Frappe Helpdesk refusal lists Assigned to`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (close gate, assignee missing) - created and deleted by this run.`;

    let ticketName = '';
    let items: string[] = [];
    let dialogText = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const who = await desk.getLoggedUser();
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] frappe.auth.get_logged_user + GET HD Agent/<user>, as Nam Pham:');
      console.log(`     session user  = ${who}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(who.toLowerCase(), 'the session belongs to the L2 engineer').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      console.log('  Side panel (every classification and quality field; Assigned to left blank):');
      await desk.setSidePanelChoice('Severity Level', VALUES.severity);
      await desk.setSidePanelChoice('Bug Report', VALUES.bugReport);
      await desk.setSidePanelChoice('FCR', VALUES.fcr);
      await desk.setSidePanelChoice('Wrongly escalated to L2', VALUES.wronglyEscalated);
      await desk.setClassificationOption('Ticket Type', 'button', VALUES.ticketType);
      await desk.setClassificationOption('Product Line', 'input', VALUES.productLine);
      await desk.setClassificationOption('Classification Area', 'input', VALUES.area);
      await desk.setClassificationOption('Sub Area', 'input', VALUES.subArea);
      await desk.setClassificationOption('Issue Type', 'button', VALUES.issueType);
      await desk.setClassificationText('Description', VALUES.description);
      await desk.setClassificationText('Root cause', VALUES.rootCause);
      await desk.setClassificationText('Resolution', VALUES.resolution);
      const doc = await desk.readTicketDocument(ticketName);
      const status = (await desk.getTicketFields(ticketName)).status;
      const assigneeRow = await desk.readAssigneeText();
      console.log('  Read back:');
      console.log(`     ticket       = ${ticketName}`);
      console.log(`     status       = ${status}`);
      console.log(`     assignee row = ${assigneeRow || '(empty)'}`);
      console.log(`     severity     = ${String(doc.custom_severity_level ?? '(empty)')}`);
      const passed = status === 'Open' && !assigneeRow.includes('Nam Pham') && String(doc.custom_severity_level) === VALUES.severity;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe filled, no assignee`,
        passed,
        highlight: ['header'],
        lines: [`status: expected Open | actual ${status}`, `assignee row: expected no Nam Pham | actual ${assigneeRow || '(empty)'}`, `severity: expected ${VALUES.severity} | actual ${String(doc.custom_severity_level ?? '(empty)')}`],
      }).catch(() => {});
      expect(status, 'the probe ticket is in status Open').toBe('Open');
      expect(assigneeRow.includes('Nam Pham'), 'the probe ticket has no assignee').toBe(false);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket filled, no assignee');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.chooseStatus('Open', STATUS_CLOSED);
      dialogText = await desk.getCloseGateDialogText();
      console.log(`  - Dialog text (verbatim): ${dialogText || '(none)'}`);
      items = gateItemNames(dialogText);
      // The FF close-gate dialog carries no role="dialog": tag it so the evidence shot can outline it.
      await desk.markCloseGateDialog();
      const refused = dialogText.includes(INTRO);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the close gate refused the status change',
          expected: `a dialog carrying "${INTRO}" (no dialog = the status changed without the gate)`,
          actual: refused ? 'refusal dialog shown' : dialogText ? `other dialog: ${dialogText.slice(0, 120)}` : 'NO dialog',
          passed: refused,
        },
        {
          what: "Refused: '\"Assigned to\" field' is listed as missing",
          expected: `${EXPECTED_ITEMS.length} item: ${EXPECTED_ITEMS.join(' | ')}`,
          actual: `${items.length} item(s): ${items.join(' | ') || '(none)'}`,
          passed: JSON.stringify(items) === JSON.stringify(EXPECTED_ITEMS),
        },
      ], `${TC} - Step 1 refusal list`, [SupportDeskPageMig.CLOSE_GATE_DIALOG], 'bottom-right');
      // The list lives in the dialog: shot above while it is open, OK only now.
      await desk.confirmCloseGateDialog();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - refused');
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
        : "OVERALL: PASS - the refusal lists '\"Assigned to\" field' as missing");

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(items, "the refusal lists 'Assigned to' as missing").toEqual(EXPECTED_ITEMS);
    });
  });
});
