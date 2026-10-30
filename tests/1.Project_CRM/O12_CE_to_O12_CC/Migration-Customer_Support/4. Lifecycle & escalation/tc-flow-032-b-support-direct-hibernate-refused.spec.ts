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
 *  TC-FLOW-032_B - Direct move to Hibernate refused - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-032_B   (side B of the A/B row TC-FLOW-032; side A = tc-flow-032-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS /
 *                    SKIP_CLEANUP_CONTACTS); the stage moves' NK Stage Transition rows and the ticket's comments are
 *                    deleted with it (they block the ticket's delete)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0270; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-032_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-032-a-preprod-direct-hibernate-refused.spec.ts)
 *                    - same refusal message and same stage as the baseline (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L1 agent, with a probe ticket in On Customer, try to put it into Hibernate directly - once from the Status
 * dropdown and once by dragging its kanban card into the Hibernate column. Both attempts must be refused with the same
 * message and the ticket must stay On Customer.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-032-b-support --grep "TC-FLOW-032_B:" --project=chromium
 *   (both sides: npx playwright test tc-flow-032- --grep "TC-FLOW-032_" --project=chromium; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 121 = row TC-FLOW-032 (Area Ticket lifecycle & workflow,
 *                   Feature "Direct move to Hibernate refused", High, negative, L1 agent, refs E12, LC-025, AU-004) - 2 steps
 *  Source version : fingerprint 5202e824903252a2 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1; step 2 has no platform half in the CSV
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in On Customer.")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. One probe ticket in stage On Customer - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made
 *                                                                    unique per run - see below)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Priority          = blank (FF default Medium)
 *            - Assigned to       = blank
 *            - Subject           = QA FLOW probe TC-FLOW-032_B <runId>
 *            - Description       = Automated check of TC-FLOW-032_B (Direct move to Hibernate refused) - created and deleted by this run.
 *         Submit -> status Open, team NAKIVO Customer Support (asserted); then the Status dropdown > On Customer (asserted)
 *       Measured 2026-10-22: Submit stays disabled until Subject AND Description hold text; the server refuses a ticket
 *       with neither Raised By nor Contact (HTTP 417); hence a run-unique address, so the teardown deletes exactly the
 *       Contact this run caused.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Try to set the stage to Hibernate directly (FF: side panel > Status = Hibernate).
 *    2. Try again by dragging the kanban card into the Hibernate column.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Same error text for both the Status field and the kanban drop; the ticket stays On Customer.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. The refusal text and the stage are asserted after BOTH steps, each step recording its own result.
 *  The expected error text is taken verbatim from the A column ("Do not change to Hibernate stage directly. Use Hibernate
 *  button instead"): the B column says "Same error text".
 *
 *  UI vs TC (measured 2026-10-23, the TC wording should be corrected): step 1 says "side panel > Status". The side panel
 *  has Sub-status only; the Status control is the dropdown in the ticket header, labelled with the current status. The
 *  step keeps the CSV text and says so.
 *
 *  Environment traps (also in the step text):
 *   - The kanban has 13 stage columns; the Hibernate column is beyond the 1920 px viewport, so the drag widens the viewport
 *     to 3800 px for the drag only and restores 1920 x 1080 after it.
 *   - The kanban draws only 20 cards per column; the probe is loaded with "Load more" when it is not among them.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 and 2 (the
 * refusal message, the stage / column, outlined green = PASS, red = FAIL); one end-of-section shot after Step 2; afterEach
 * start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-032_B';
const SOURCE_ROW = 'TC-FLOW-032';
const SOURCE_FINGERPRINT = '5202e824903252a2';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: One probe ticket in stage On Customer - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-032_B <runId>, Description, Submit; then the Status dropdown > On Customer',
  s1: 'Step 1: Try to set the stage to Hibernate directly (FF: side panel > Status = Hibernate) - the Status control is the header dropdown (the side panel has Sub-status only, measured 2026-10-22)',
  s2: 'Step 2: Try again by dragging the kanban card into the Hibernate column. - All Tickets > Kanban; the viewport is widened to 3800 px for the drag only; the card is loaded with "Load more" when it is not among the first 20 of its column',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const STAGE_ON_CUSTOMER = 'On Customer';
const REFUSAL = 'Do not change to Hibernate stage directly. Use Hibernate button instead';

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

test.describe(`${TC} - Direct move to Hibernate refused on the Support service`, () => {
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
        console.log(`     ticket   = ${probe.ticketName ?? '(number not captured - looked up by subject)'}`);
        console.log(`     subject  = ${probe.subject}`);
        console.log(`     contact  = ${SKIP_CLEANUP_CONTACTS ? '(kept - SKIP_CLEANUP_CONTACTS)' : probe.contactEmail}`);
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

  test(`${TC}: Direct move to Hibernate refused - B: Status dropdown and kanban drop both refused with the same message, ticket stays On Customer`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (Direct move to Hibernate refused) - created and deleted by this run.`;

    let ticketName = '';
    let refusalStatus = '';
    let statusAfterStatus = '';
    let refusalDrag = '';
    let columnBefore = '';
    let columnAfter = '';
    let statusAfterReload = '';

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : Support service (${baseUrl_support_mig})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await desk.login(baseUrl_support_mig, ENGINEER.username, ENGINEER.password);
      const who = await desk.getLoggedUser();
      const agent = await desk.getMyAgentLevel(ENGINEER.username);
      console.log('  [INTERNAL check, Call API] frappe.auth.get_logged_user + GET HD Agent/<user>, as Giang:');
      console.log(`     session user  = ${who}`);
      console.log(`     agent         = ${agent.agent}`);
      console.log(`     support level = ${agent.level || '(empty)'}`);
      console.log(`     job level     = ${agent.jobLevel || '(empty)'}`);
      console.log(`     active        = ${agent.active}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(who.toLowerCase(), 'the session belongs to the L1 agent').toBe(ENGINEER.username.toLowerCase());
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
      console.log(`  Then the Status dropdown > ${STAGE_ON_CUSTOMER}`);
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.getTicketFields(ticketName);
      await desk.chooseStatus('Open', STAGE_ON_CUSTOMER);
      const moved = await desk.getTicketFields(ticketName);
      console.log('  Read back:');
      console.log(`     ticket    = ${ticketName}`);
      console.log(`     status    = ${created.status} -> ${moved.status}`);
      console.log(`     team      = ${created.team}`);
      console.log(`     raised by = ${created.raisedBy}`);
      const passed = created.status === 'Open' && created.team === TEAM && created.raisedBy === raisedBy && moved.status === STAGE_ON_CUSTOMER;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket On Customer`,
        passed,
        highlight: ['header button[aria-haspopup="menu"]'],
        lines: [
          `created status: expected Open | actual ${created.status}`,
          `team: expected ${TEAM} | actual ${created.team}`,
          `raised by: expected ${raisedBy} | actual ${created.raisedBy}`,
          `status after the dropdown: expected ${STAGE_ON_CUSTOMER} | actual ${moved.status}`,
        ],
      }).catch(() => {});
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(created.team, 'the probe ticket is on team NAKIVO Customer Support').toBe(TEAM);
      expect(created.raisedBy, 'the probe ticket is raised by the address typed').toBe(raisedBy);
      expect(moved.status, 'the probe ticket is moved to On Customer').toBe(STAGE_ON_CUSTOMER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket On Customer');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.chooseStatus(STAGE_ON_CUSTOMER, 'Hibernate');
      refusalStatus = await desk.waitForVisibleMessage('Do not change', CommonUtils.waitTimes.abnormalWait);
      console.log(`  - Message shown : ${refusalStatus || '(none)'}`);
      // The message is a toast that fades: tagged and shot the moment it is read, the toast outlined.
      const toastTagged = await desk.markVisibleMessage('Do not change');
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 Status = Hibernate - the refusal message',
          expected: `"${REFUSAL}"`,
          actual: `"${refusalStatus || '(no message)'}"`,
          passed: refusalStatus.includes(REFUSAL),
        },
      ], `${TC} - Step 1 Status refusal message`, toastTagged ? [SupportDeskPageMig.MESSAGE] : ['header button[aria-haspopup="menu"]'], 'bottom-right');
      statusAfterStatus = (await desk.getTicketFields(ticketName)).status;
      console.log(`  - Status after  : ${statusAfterStatus}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 status after the refusal',
          expected: STAGE_ON_CUSTOMER,
          actual: statusAfterStatus || '(none)',
          passed: statusAfterStatus === STAGE_ON_CUSTOMER,
        },
      ], `${TC} - Step 1 status after the refusal`, ['header button[aria-haspopup="menu"]']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await desk.openAllTicketsFromSidebar();
      await desk.switchToKanbanLayout();
      const dropMessageCheck = (text: string): Check => ({
        what: 'Step 2 kanban drop into Hibernate - the refusal message',
        expected: `"${REFUSAL}"`,
        actual: `"${text || '(no message)'}"`,
        passed: text.includes(REFUSAL),
      });
      let dropMessageShot = false;
      const drag = await desk.dragKanbanCardToColumn(ticketName, STAGE_ON_CUSTOMER, 'Hibernate', {
        // The message is a toast that fades: shot the moment it is drawn (the page object tagged it).
        onMessage: async (text) => {
          if (dropMessageShot) return;
          dropMessageShot = true;
          await recordChecks(page, testInfo, checks, [dropMessageCheck(text)], `${TC} - Step 2 kanban drop refusal message`, [SupportDeskPageMig.MESSAGE], 'top-right');
        },
      });
      refusalDrag = drag.message;
      columnBefore = drag.columnBefore;
      columnAfter = drag.columnAfter;
      statusAfterReload = (await desk.getTicketFields(ticketName)).status;
      console.log(`  - Card column before the drop : ${columnBefore || '(not drawn)'}`);
      console.log(`  - Message after the drop      : ${refusalDrag || '(none)'}`);
      console.log(`  - Card column after the drop  : ${columnAfter || '(not drawn)'}`);
      console.log(`  - Status (Frappe)             : ${statusAfterReload}`);
      // No message was drawn: the message check is still recorded (FAIL), on the board.
      if (!dropMessageShot) await recordChecks(page, testInfo, checks, [dropMessageCheck(refusalDrag)], `${TC} - Step 2 kanban drop refusal message`, ['div[title="Fold"]', 'div[title="Show"]']);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 the card stays in its column',
          expected: `${STAGE_ON_CUSTOMER} (the card returns to where it was)`,
          actual: columnAfter || '(not drawn)',
          passed: columnBefore === STAGE_ON_CUSTOMER && columnAfter === STAGE_ON_CUSTOMER,
        },
        {
          what: 'Step 2 status after the drop (Frappe)',
          expected: STAGE_ON_CUSTOMER,
          actual: statusAfterReload || '(none)',
          passed: statusAfterReload === STAGE_ON_CUSTOMER,
        },
      ], `${TC} - Step 2 card and status after the drop`, ['div[title="Fold"]', 'div[title="Show"]']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - kanban drop refused');
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
        : `OVERALL: PASS - the Status change and the kanban drop are both refused with the same message; the ticket stays On Customer`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(refusalStatus, 'the Status change to Hibernate is refused with the product message').toContain(REFUSAL);
      expect(statusAfterStatus, 'the ticket stays On Customer after the Status attempt').toBe(STAGE_ON_CUSTOMER);
      expect(refusalDrag, 'the kanban drop is refused with the same message').toContain(REFUSAL);
      expect(columnAfter, 'the card stays in On Customer after the kanban drop').toBe(STAGE_ON_CUSTOMER);
      expect(statusAfterReload, 'the ticket stays On Customer after the drop').toBe(STAGE_ON_CUSTOMER);
    });
  });
});
