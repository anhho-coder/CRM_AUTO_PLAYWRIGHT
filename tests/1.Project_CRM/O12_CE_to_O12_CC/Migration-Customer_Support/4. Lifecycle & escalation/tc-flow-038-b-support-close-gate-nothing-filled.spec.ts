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
 *  TC-FLOW-038_B - Close gate: nothing filled - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-038_B   (side B of the A/B row TC-FLOW-038; side A = tc-flow-038-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact Frappe creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0380 (the mandatory closing set); the TC-to-requirement
 *                    mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-038_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-038-a-preprod-close-gate-nothing-filled.spec.ts)
 *                    - the same CSV expected list; map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket in Resolving with no assignee and an empty Classification group, set its Status to
 * Closed from the ticket header; Frappe must refuse with one message listing every missing item and leave the status at
 * Resolving with nothing else changed.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-038-b-support --grep "TC-FLOW-038_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-038- --grep "TC-FLOW-038_" --project=chromium-headless; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 127 = row TC-FLOW-038 (Area Ticket lifecycle & workflow,
 *                   Feature "Close gate: nothing filled", High, negative, L2 engineer, refs E13, LC-018) - 2 steps
 *  Source version : fingerprint f3574f1989c15911 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Resolving, no assignee, Classification group empty.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket in status Resolving with no assignee - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com  (CSV test data qa.customer@example.com, made unique per run)
 *            - Subject = QA FLOW probe TC-FLOW-038_B <runId>;  Description = Automated check of TC-FLOW-038_B ...
 *         Submit -> status Open; then the status dropdown > Resolving (asserted; no assignee asserted)
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Set the stage to Closed (FF: side panel → Status = Closed).
 *    2. Read the error.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    One message 'Please fill in next to close the ticket:' with the same list ('"Assigned to" field', the quality fields,
 *    '"Classification" group: ...'). Status stays Resolving and nothing else changes.
 *
 *  Environment traps (also in the step text):
 *   - The CSV says "side panel → Status = Closed". On Frappe Helpdesk the STATUS is the ticket header dropdown (the button
 *     labelled with the current status); the side panel carries only Sub-status (measured 2026-10-22/23). The step uses the header.
 *   - The close gate is a "Missing required fields" dialog that Frappe draws after the status change; it is waited for.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 and 2 (outlined
 * green = PASS, red = FAIL); one end-of-section shot after Step 2; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-038_B';
const SOURCE_ROW = 'TC-FLOW-038';
const SOURCE_FINGERPRINT = 'f3574f1989c15911';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact Frappe created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One probe ticket in status Resolving with no assignee - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-038_B <runId>, Description, Submit; then the status dropdown > Resolving',
  s1: 'Step 1: FF: Set the stage to Closed (FF: side panel → Status = Closed) - trap: the FF status is the ticket header dropdown; the side panel holds only Sub-status (measured 2026-10-23); the status dropdown > Closed',
  s2: 'Step 2: Read the error.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const STATUS_RESOLVING = 'Resolving';
const STATUS_CLOSED = 'Closed';
const INTRO = 'Please fill in next to close the ticket:';
/** The CSV "B expected" list: the Assigned to field, the quality fields, and the Classification group with its fields. */
const EXPECTED_ITEMS = [
  'Assigned to', 'Severity Level', 'Bug Report', 'FCR', 'Wrongly escalated to L2',
  'Ticket Type', 'Product line', 'Area', 'Sub Area', 'Issue Type', 'Description', 'Root cause', 'Resolution',
];
/** Frappe fields that a refused close must leave untouched (the modified stamp is not a change of content). */
const META_KEYS = ['modified', 'modified_by', '_comments', '_seen', '_liked_by', '_user_tags'];

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

/** The document without its modified stamp, as a stable string - the "nothing else changes" comparison. */
function contentOf(doc: Record<string, unknown>): string {
  const keep = Object.keys(doc).filter((k) => !META_KEYS.includes(k)).sort();
  return JSON.stringify(keep.map((k) => [k, doc[k]]));
}

test.describe(`${TC} - Close gate with nothing filled on the Support service`, () => {
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

  test(`${TC}: Close gate with nothing filled (no assignee, empty Classification) - B: Frappe Helpdesk status refusal and its message`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (close gate with nothing filled) - created and deleted by this run.`;

    let ticketName = '';
    let items: string[] = [];
    let dialogText = '';
    let statusAfter = '';
    let contentSame = false;
    let before: Record<string, unknown> = {};

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
      console.log(`     agent         = ${agent.agent}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      console.log(`     job level     = ${agent.jobLevel || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(who.toLowerCase(), 'the session belongs to the L2 engineer').toBe(ENGINEER.username.toLowerCase());
      expect(agent.level, 'the signed-in agent is an L2 engineer (HD Agent Support Level = L2)').toBe('L2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Raised By (Email) = ${raisedBy}`);
      console.log(`     Subject           = ${subject}`);
      console.log(`     Description       = ${description}`);
      console.log('     Assigned to       = blank');
      console.log(`  Then the status dropdown > ${STATUS_RESOLVING}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.getTicketFields(ticketName);
      await desk.chooseStatusSaved('Open', STATUS_RESOLVING);
      const moved = await desk.getTicketFields(ticketName);
      const assigneeRow = await desk.readAssigneeText();
      console.log('  Read back:');
      console.log(`     ticket    = ${ticketName}`);
      console.log(`     status    = ${created.status} -> ${moved.status}`);
      console.log(`     assignee row = ${assigneeRow || '(empty)'}`);
      const passed = created.status === 'Open' && moved.status === STATUS_RESOLVING && !assigneeRow.includes('Nam Pham');
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe Resolving`,
        passed,
        highlight: ['header button[aria-haspopup="menu"]'],
        lines: [`created status: expected Open | actual ${created.status}`, `status after the dropdown: expected ${STATUS_RESOLVING} | actual ${moved.status}`, `assignee row: expected no Nam Pham | actual ${assigneeRow || '(empty)'}`],
      }).catch(() => {});
      expect(moved.status, 'the probe ticket is moved to Resolving').toBe(STATUS_RESOLVING);
      expect(assigneeRow.includes('Nam Pham'), 'the probe ticket has no assignee').toBe(false);
      before = await desk.readTicketDocument(ticketName);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Resolving');
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
      console.log(`  - Items listed (${items.length}): ${items.join(' | ') || '(none)'}`);
      // The list lives in the dialog: shot while it is still open, the dialog outlined.
      await desk.markCloseGateDialog();
      await recordChecks(page, testInfo, checks, [
        {
          what: 'The message lists every missing item (the CSV list, in order)',
          expected: `${EXPECTED_ITEMS.length} items: ${EXPECTED_ITEMS.join(' | ')}`,
          actual: `${items.length} items: ${items.join(' | ') || '(none)'}`,
          passed: JSON.stringify(items) === JSON.stringify(EXPECTED_ITEMS),
        },
      ], `${TC} - Step 2 message list`, [SupportDeskPageMig.CLOSE_GATE_DIALOG], 'bottom-right');
      // Status and content are read after OK closed the dialog: shot there, the status control outlined.
      await desk.confirmCloseGateDialog();
      statusAfter = (await desk.getTicketFields(ticketName)).status;
      const after = await desk.readTicketDocument(ticketName);
      contentSame = contentOf(after) === contentOf(before);
      console.log(`  - Status after the refusal        : ${statusAfter}`);
      console.log(`  - Nothing else changed (content)  : ${contentSame ? 'yes' : 'NO'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Status stays Resolving', expected: STATUS_RESOLVING, actual: statusAfter || '(none)', passed: statusAfter === STATUS_RESOLVING },
        { what: 'Nothing else changes on the ticket', expected: 'the ticket content is unchanged by the refused close', actual: contentSame ? 'unchanged' : 'CHANGED', passed: contentSame },
      ], `${TC} - Step 2 status and content after the refusal`, ['header button[aria-haspopup="menu"][aria-label="' + STATUS_RESOLVING + '"]']);
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
        : 'OVERALL: PASS - one message lists every missing item; the status stays Resolving; nothing else changed');

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(items, 'the message lists every missing item, in the CSV order').toEqual(EXPECTED_ITEMS);
      expect(statusAfter, 'the status stays Resolving').toBe(STATUS_RESOLVING);
      expect(contentSame, 'nothing else on the ticket changes').toBe(true);
    });
  });
});
