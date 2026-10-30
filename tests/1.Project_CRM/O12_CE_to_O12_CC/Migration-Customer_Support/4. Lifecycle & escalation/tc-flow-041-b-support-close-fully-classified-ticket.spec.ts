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
 *  TC-FLOW-041_B - Close a fully classified ticket - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-041_B   (side B of the A/B row TC-FLOW-041; side A = tc-flow-041-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; HD Agent Support Level = L2, asserted in Pre-condition 1;
 *                    users.support_l2_nam_support_mig) - the "tester" of the CSV. Teardown only: Administrator over the API.
 * Data             : one probe ticket (and its Raised By Contact) created per run, DELETED in afterEach as Administrator
 *                    (toggles SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0380 (the mandatory closing set); the TC-to-requirement
 *                    mapping is the automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-041_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-041-a-preprod-close-fully-classified-ticket.spec.ts)
 *                    map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket in Resolving that is assigned to the tester, fill the quality and classification
 * fields, add the tester in Closed by, and set the status to Closed from the ticket header; the ticket must read Closed with a
 * close date, and Product Line, Ticket Type and Description must stay editable in the Classification group.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-041-b-support --grep "TC-FLOW-041_B:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-041- --grep "TC-FLOW-041_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 130 = row TC-FLOW-041 (Area Ticket lifecycle & workflow,
 *                   Feature "Close a fully classified ticket", High, happy, L2 engineer, refs E13, LC-018, LC-020) - 3 steps
 *  Source version : fingerprint 0c56e143b6fbf545 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Resolving, assigned to the tester.")
 *    1. Logged in as an L2 engineer - here the Support service; the L2 tier is read from the HD Agent record
 *    2. One probe ticket in status Resolving, assigned to Nam Pham - CREATED by this run: All Tickets > Create (Raised By =
 *       qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-041_B <runId>, Description, Submit) > Assign to me >
 *       status dropdown > Resolving (asserted)
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Fill Severity Level, Bug Report = No, FCR = Yes, Wrongly escalated to L2 = No, Ticket Type, Product line, Area, Sub Area,
 *       Issue Type, Description, Root cause, Resolution.
 *    2. Add the tester in Closed by.
 *    3. Set the stage to Closed. (FF: status dropdown in the ticket header > Closed)
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Ticket is Closed; close date set; Product line, Ticket Type and Description are editable in the side panel's
 *    Classification group.
 *
 *  Values (the CSV names the fields, not the values - chosen by the automation author):
 *    Severity Level = Severity 3 | Bug Report = No | FCR = Yes | Wrongly escalated to L2 = No | Ticket Type = Question
 *    Product Line = AI | Classification Area = Cloud Compute | Sub Area = AWS | Issue Type = AD Integration
 *    Description / Root cause / Resolution = run-unique text | Closed by = Nam Pham
 *
 *  Environment traps (also in the step text):
 *   - Step 2 (Closed by): the picker is a headless combobox; a click on Nam Pham closes it and the value is read back from
 *     the server document. A value that is not stored is a FAIL of the guard, and the spec continues to the close.
 *   - The status is the ticket header dropdown (see TC-FLOW-038_B); close date and the Classification editability are read
 *     from the server and from the side panel after the status change.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1-3 and the
 * verification (outlined green = PASS, red = FAIL); end-of-section shots after Step 1 and Step 3; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-041_B';
const SOURCE_ROW = 'TC-FLOW-041';
const SOURCE_FINGERPRINT = '0c56e143b6fbf545';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact Frappe created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - Support service (Frappe Helpdesk) /login as Nam Pham; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L2',
  pre2: 'Pre-condition 2: One probe ticket in status Resolving, assigned to the tester (Nam Pham) - created by this run: All Tickets > Create, Subject = QA FLOW probe TC-FLOW-041_B <runId>, Submit; Assign to me; the status dropdown > Resolving',
  s1: 'Step 1: FF: Fill Severity Level, Bug Report = No, FCR = Yes, Wrongly escalated to L2 = No, Ticket Type, Product line, Area, Sub Area, Issue Type, Description, Root cause, Resolution (side panel; each text box is blurred and saved)',
  s2: 'Step 2: FF: Add the tester in Closed by.',
  s3: 'Step 3: FF: Set the stage to Closed (FF: status dropdown in the ticket header > Closed) - trap: the status is the header dropdown, not the side panel',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_nam_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const STATUS_RESOLVING = 'Resolving';
const STATUS_CLOSED = 'Closed';
const TESTER = 'Nam Pham';
const TESTER_EMAIL = 'nam.pham@nakivo.com';

/** The values this run enters (the CSV names the fields, not the values). */
const VALUES = {
  severity: 'Severity 3', bugReport: 'No', fcr: 'Yes', wronglyEscalated: 'No',
  ticketType: 'Question', productLine: 'AI', area: 'Cloud Compute', subArea: 'AWS', issueType: 'AD Integration',
  description: 'Explore Description TC-FLOW-041_B', rootCause: 'Explore Root cause TC-FLOW-041_B', resolution: 'Explore Resolution TC-FLOW-041_B',
};

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

/** The status the server holds, read again (bounded) while the save of the status pick that just happened settles. */
async function settledStatus(desk: SupportDeskPageMig, name: string, want: string): Promise<string> {
  let status = '';
  for (let attempt = 1; attempt <= 6; attempt++) {
    status = (await desk.getTicketFields(name)).status;
    console.log(`  - status read ${attempt}/6 : ${status}`);
    if (status === want) break;
    await desk.wait(CommonUtils.waitTimes.long);
  }
  return status;
}

test.describe(`${TC} - Close a fully classified ticket on the Support service`, () => {
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

  test(`${TC}: Close a fully classified ticket (Closed by the tester) - B: Frappe Helpdesk closes it, close date set, Classification stays editable`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (close a fully classified ticket) - created and deleted by this run.`;

    let ticketName = '';
    let statusAfter = '';
    let closeDate = '';
    let closedBy: string[] = [];
    let editable: Record<string, { found: boolean; editable: boolean }> = {};

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
      const status = await settledStatus(desk, ticketName, STATUS_RESOLVING);
      const assigneeRow = await desk.readAssigneeText();
      console.log('  Read back:');
      console.log(`     ticket       = ${ticketName}`);
      console.log(`     status       = ${status}`);
      console.log(`     assignee row = ${assigneeRow || '(empty)'}`);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe Resolving, assigned`,
        passed: status === STATUS_RESOLVING && assigneeRow.includes(TESTER),
        highlight: ['header'],
        lines: [`status: expected ${STATUS_RESOLVING} | actual ${status}`, `assignee row: expected ${TESTER} | actual ${assigneeRow || '(empty)'}`],
      }).catch(() => {});
      expect(status, 'the probe ticket is in Resolving').toBe(STATUS_RESOLVING);
      expect(assigneeRow, 'the probe ticket is assigned to the tester').toContain(TESTER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Resolving, assigned');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
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
      const stored = [VALUES.severity, VALUES.bugReport, VALUES.fcr, VALUES.wronglyEscalated, VALUES.ticketType, VALUES.area, VALUES.rootCause, VALUES.resolution]
        .filter((v) => !JSON.stringify(doc).includes(v));
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the fields are stored on the ticket',
          expected: 'every value entered is in the server document',
          actual: stored.length ? `not stored: ${stored.join(' | ')}` : 'all stored',
          passed: stored.length === 0,
        },
      ], `${TC} - Step 1 fields stored`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - fields filled');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.pickClosedBy(TESTER);
      closedBy = await desk.readClosedByOverRest(ticketName);
      const stored = closedBy.some((r) => r.includes(TESTER_EMAIL));
      console.log(`  - Closed By rows on the server: ${closedBy.length ? closedBy.join(' | ') : '(none)'}`);
      // The value lives in the side panel's Closed By row: outline that row, not the ticket header.
      const rowTagged = await desk.markPanelRow('Closed By');
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 2 Closed by stores the tester',
          expected: `${TESTER} (${TESTER_EMAIL}) in the server's Closed By rows`,
          actual: stored ? `stored: ${TESTER}` : `not stored - ${closedBy.length} row(s) on the server`,
          passed: stored,
        },
      ], `${TC} - Step 2 Closed by`, rowTagged ? [SupportDeskPageMig.PANEL_ROW] : ['header']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await desk.chooseStatusSaved(STATUS_RESOLVING, STATUS_CLOSED);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const doc = await desk.readTicketDocument(ticketName);
      statusAfter = String(doc.status ?? '');
      closeDate = String(doc.custom_close_date ?? '');
      editable = {
        'Product Line': await desk.getSidePanelEditable('Product Line', 'input'),
        'Ticket Type': await desk.getSidePanelEditable('Ticket Type', 'button'),
        Description: await desk.getSidePanelEditable('Description', 'textarea'),
      };
      console.log(`  - Status after Closed : ${statusAfter}`);
      console.log(`  - Close date (server) : ${closeDate || '(empty)'}`);
      for (const [k, v] of Object.entries(editable)) console.log(`  - ${k} : found ${v.found}, editable ${v.editable}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Ticket is Closed', expected: STATUS_CLOSED, actual: statusAfter || '(none)', passed: statusAfter === STATUS_CLOSED },
        { what: 'Close date is set', expected: 'a date (non-empty)', actual: closeDate || '(empty)', passed: closeDate.trim() !== '' },
        ...(['Product Line', 'Ticket Type', 'Description'] as const).map((k) => ({
          what: `Side panel Classification - "${k}" is editable after the close`,
          expected: 'shown and editable',
          actual: !editable[k].found ? 'NOT FOUND' : editable[k].editable ? 'editable' : 'READ-ONLY / disabled',
          passed: editable[k].found && editable[k].editable,
        })),
      ], `${TC} - Step 3 closed`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - closed');
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
        : 'OVERALL: PASS - Closed with a close date; Product line, Ticket Type and Description editable');

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(statusAfter, 'the ticket is Closed').toBe(STATUS_CLOSED);
      expect(closeDate.trim(), 'the close date is set').not.toBe('');
      expect(editable['Product Line'].editable, 'Product line is editable after the close').toBe(true);
      expect(editable['Ticket Type'].editable, 'Ticket Type is editable after the close').toBe(true);
      expect(editable.Description.editable, 'Description is editable after the close').toBe(true);
    });
  });
});
