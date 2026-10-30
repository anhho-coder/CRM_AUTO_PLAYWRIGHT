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
 *  TC-FLOW-039_B - Close gate: some fields missing - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-039_B   (side B of the A/B row TC-FLOW-039; side A = tc-flow-039-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and its Raised By Contact) created per run, DELETED in afterEach as Administrator
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0380 (the mandatory closing set); the TC-to-requirement
 *                    mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-039_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-039-a-preprod-close-gate-some-fields-missing.spec.ts)
 *                    map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket in Resolving with an assignee and every field filled except Description and Root
 * cause, set its Status to Closed from the ticket header; the refusal must list only Description and Root cause.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-039-b-support --grep "TC-FLOW-039_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-039- --grep "TC-FLOW-039_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 128 = row TC-FLOW-039 (Area Ticket lifecycle & workflow,
 *                   Feature "Close gate: some fields missing", High, negative, L2 engineer, refs E13, LC-018) - 2 steps
 *  Source version : fingerprint e63fde0ba8b8a70c = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Resolving with an assignee and everything filled except Description and Root cause.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket in status Resolving, assigned to Nam Pham, every field filled except Description and Root cause -
 *       CREATED by this run: All Tickets > Create (Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe
 *       TC-FLOW-039_B <runId>, Description, Submit) > Assign to me > status dropdown > Resolving, then the side panel:
 *         Severity Level = Severity 3   Bug Report = No   FCR = Yes   Wrongly escalated to L2 = No
 *         Ticket Type = Question        Product Line = AI   Classification Area = Cloud Compute   Sub Area = AWS
 *         Issue Type = AD Integration   Resolution = <text>   Description = blank   Root cause = blank
 *       The values are chosen by the automation author - the CSV names the fields, not the values.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Set the stage to Closed. (FF: status dropdown in the ticket header > Closed)
 *    2. Read the error.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    The message lists only Description and Root cause.
 *
 *  Environment traps (also in the step text):
 *   - The header status dropdown, not the side panel, changes the status (see TC-FLOW-038_B).
 *   - Product Line, Ticket Type and Issue Type are chosen from dropdowns that open on click; each choice is read back.
 *   - Textareas are blurred (Tab) and given time to save before the status changes.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 and 2 (outlined
 * green = PASS, red = FAIL); one end-of-section shot after Step 2; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-039_B';
const SOURCE_ROW = 'TC-FLOW-039';
const SOURCE_FINGERPRINT = 'e63fde0ba8b8a70c';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact Frappe created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One probe ticket in status Resolving, assigned to Nam Pham, every field filled except Description and Root cause - created by this run: All Tickets > Create, Subject = QA FLOW probe TC-FLOW-039_B <runId>, Submit; Assign to me; the status dropdown > Resolving; the side panel fields',
  s1: 'Step 1: FF: Set the stage to Closed (FF: status dropdown in the ticket header > Closed) - trap: the status is the header dropdown, not the side panel',
  s2: 'Step 2: Read the error.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const STATUS_RESOLVING = 'Resolving';
const STATUS_CLOSED = 'Closed';
const INTRO = 'Please fill in next to close the ticket:';
/** The CSV "B expected" list. */
const EXPECTED_ITEMS = ['Description', 'Root cause'];

/** The values this run enters (the CSV names the fields, not the values). */
const VALUES = {
  severity: 'Severity 3', bugReport: 'No', fcr: 'Yes', wronglyEscalated: 'No',
  ticketType: 'Question', productLine: 'AI', area: 'Cloud Compute', subArea: 'AWS', issueType: 'AD Integration',
  resolution: 'Explore Resolution TC-FLOW-039_B',
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

test.describe(`${TC} - Close gate with some fields missing on the Support service`, () => {
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

  test(`${TC}: Close gate with some fields missing (Description and Root cause) - B: Frappe Helpdesk status refusal lists only those two`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (close gate with some fields missing) - created and deleted by this run.`;

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
      await desk.assignToMeSaved();
      await desk.chooseStatusSaved('Open', STATUS_RESOLVING);
      console.log('  Side panel (every field except Description and Root cause):');
      await desk.setSidePanelChoice('Severity Level', VALUES.severity);
      await desk.setSidePanelChoice('Bug Report', VALUES.bugReport);
      await desk.setSidePanelChoice('FCR', VALUES.fcr);
      await desk.setSidePanelChoice('Wrongly escalated to L2', VALUES.wronglyEscalated);
      await desk.setClassificationOption('Ticket Type', 'button', VALUES.ticketType);
      await desk.setClassificationOption('Product Line', 'input', VALUES.productLine);
      await desk.setClassificationOption('Classification Area', 'input', VALUES.area);
      await desk.setClassificationOption('Sub Area', 'input', VALUES.subArea);
      await desk.setClassificationOption('Issue Type', 'button', VALUES.issueType);
      await desk.setClassificationText('Resolution', VALUES.resolution);
      const doc = await desk.readTicketDocument(ticketName);
      const read = await desk.getTicketFields(ticketName);
      const assigneeRow = await desk.readAssigneeText();
      console.log('  Read back:');
      console.log(`     ticket    = ${ticketName}`);
      console.log(`     status    = ${read.status}`);
      console.log(`     assignee row = ${assigneeRow || '(empty)'}`);
      console.log(`     severity  = ${String(doc.custom_severity_level ?? '(empty)')}`);
      console.log(`     root cause= ${String(doc.custom_root_cause ?? '(empty)')}`);
      const passed = read.status === STATUS_RESOLVING && assigneeRow.includes('Nam Pham') && String(doc.custom_severity_level) === VALUES.severity && String(doc.custom_root_cause ?? '') === '';
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ready`,
        passed,
        highlight: ['header'],
        lines: [`status: expected ${STATUS_RESOLVING} | actual ${read.status}`, `assignee row: expected Nam Pham | actual ${assigneeRow || '(empty)'}`, `Root cause: expected (empty) | actual ${String(doc.custom_root_cause ?? '(empty)')}`],
      }).catch(() => {});
      expect(read.status, 'the probe ticket is in Resolving').toBe(STATUS_RESOLVING);
      expect(assigneeRow, 'the probe ticket is assigned to Nam Pham').toContain('Nam Pham');
      expect(String(doc.custom_root_cause ?? ''), 'Root cause is left blank').toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Resolving, all but two fields');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.chooseStatus(STATUS_RESOLVING, STATUS_CLOSED);
      dialogText = await desk.getCloseGateDialogText();
      console.log(`  - Dialog text (verbatim): ${dialogText || '(none)'}`);
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
      ], `${TC} - Step 1 close refused`, [SupportDeskPageMig.CLOSE_GATE_DIALOG], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      items = gateItemNames(dialogText);
      // The list lives in the dialog: shot while it is still open, the dialog outlined; OK only afterwards.
      await desk.markCloseGateDialog();
      console.log(`  - Items listed (${items.length}): ${items.join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'The message lists only Description and Root cause',
          expected: `${EXPECTED_ITEMS.length} items: ${EXPECTED_ITEMS.join(' | ')}`,
          actual: `${items.length} items: ${items.join(' | ') || '(none)'}`,
          passed: JSON.stringify(items) === JSON.stringify(EXPECTED_ITEMS),
        },
      ], `${TC} - Step 2 message list`, [SupportDeskPageMig.CLOSE_GATE_DIALOG], 'bottom-right');
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
        : 'OVERALL: PASS - the message lists only Description and Root cause');

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(items, 'the message lists only Description and Root cause').toEqual(EXPECTED_ITEMS);
    });
  });
});
