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
 *  TC-FLOW-030_B - Hibernate a ticket (button and dialog) - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-030_B   (side B of the A/B row TC-FLOW-030; side A = tc-flow-030-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, DELETED in afterEach as Administrator (toggles SKIP_CLEANUP_TICKETS /
 *                    SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0270; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-030_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/4. Lifecycle & escalation/tc-flow-030-a-preprod-hibernate-a-ticket.spec.ts)
 *                    - same expected values as the baseline (CSV Comparison = same); map: helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L1 agent, open a probe ticket that is in On Customer, choose Hibernate from its Actions menu, check the default
 * "Hibernate until" date (today + 14 days), enter the reason and confirm; the ticket must read Hibernate, show the
 * hibernation banner, log the hibernation note in the timeline, and keep "Hibernate until" and "Hibernate reason"
 * read-only in the side panel.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-030-b-support --grep "TC-FLOW-030_B:" --project=chromium
 *   (both sides: npx playwright test tc-flow-030- --grep "TC-FLOW-030_" --project=chromium; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 119 = row TC-FLOW-030 (Area Ticket lifecycle & workflow,
 *                   Feature "Hibernate a ticket (button and dialog)", High, happy, L1 agent, refs E12, LC-025) - 4 steps
 *  Source version : fingerprint 9b80f502fe097e45 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of each step (step 4 has no FF half in the CSV)
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
 *            - Subject           = QA FLOW probe TC-FLOW-030_B <runId>
 *            - Description       = Automated check of TC-FLOW-030_B (Hibernate a ticket) - created and deleted by this run.
 *         Submit -> status Open, team NAKIVO Customer Support (asserted); then the Status dropdown > On Customer (asserted)
 *       Measured 2026-10-22: Submit stays disabled until Subject AND Description hold text; the server refuses a ticket
 *       with neither Raised By nor Contact (HTTP 417 "Set the customer's e-mail or pick a contact."); hence a run-unique
 *       address, so the teardown deletes exactly the Contact this run caused.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Click Hibernate in the ticket header (FF: ticket header button Hibernate).
 *    2. Check the default 'Hibernate until' date.
 *    3. Enter reason 'Waiting for customer maintenance window' and confirm (OK).
 *    4. Read the stage, the banner and the chatter / timeline.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Dialog 'Hibernate ticket' with default today + 14 days; Status = Hibernate; the same banner text and the same note in
 *    the timeline; until and reason are read-only in the panel.
 *    (The expected dates are computed at run time from the test host's clock, never typed.)
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. Step 1 asserts a navigation GUARD (the wizard opened).
 *
 *  UI vs TC (measured 2026-10-23, the TC wording should be corrected): step 1 says "ticket header button Hibernate". FF
 *  does not draw Hibernate as a header button; it is an item of the ticket's Actions menu (the header's "Actions" button,
 *  or its more (…) button once the ticket is assigned). The step keeps the CSV text and says so.
 *
 *  Environment traps (also in the step text):
 *   - The Hibernate wizard keeps "Hibernate until" as a yyyy-mm-dd date box (ISO); the spec compares the ISO value.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell; the
 *     probe is opened by its link.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1, 2 and 4
 * (outlined green = PASS, red = FAIL); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-030_B';
const SOURCE_ROW = 'TC-FLOW-030';
const SOURCE_FINGERPRINT = '9b80f502fe097e45';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: One probe ticket in stage On Customer - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-030_B <runId>, Description, Submit; then the Status dropdown > On Customer',
  s1: "Step 1: Click Hibernate in the ticket header (FF: ticket header button Hibernate) - All Tickets > the probe's Actions menu > Hibernate; FF draws Hibernate in that menu, not as a header button (measured 2026-10-23)",
  s2: "Step 2: Check the default 'Hibernate until' date - read from the wizard's date box (yyyy-mm-dd); expected today + 14 days on the test host's clock",
  s3: "Step 3: Enter reason 'Waiting for customer maintenance window' and confirm (OK).",
  s4: 'Step 4: Read the stage, the banner and the chatter / timeline. - FF: the status, the banner, the note in the Activity timeline, and the Hibernate until / reason fields of the side panel',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const STAGE_ON_CUSTOMER = 'On Customer';
const REASON = 'Waiting for customer maintenance window';

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** MM/DD/YYYY and yyyy-mm-dd of `days` after today, on the test host's clock (the wizard's default is today + 14). */
function dateAfterDays(days: number): { mdy: string; iso: string } {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { mdy: `${mm}/${dd}/${d.getFullYear()}`, iso: `${d.getFullYear()}-${mm}-${dd}` };
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

test.describe(`${TC} - Hibernate a ticket on the Support service`, () => {
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

  test(`${TC}: Hibernate a ticket (button and dialog) - B: Support service Hibernate wizard, default date, banner, timeline note and read-only panel`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (Hibernate a ticket) - created and deleted by this run.`;
    const until = dateAfterDays(14);
    const expectedBanner = `This ticket is hibernated and will be automatically reopened on ${until.mdy}. Reason: ${REASON}`;
    const expectedNote = `Ticket hibernated until ${until.mdy} by ${ENGINEER.displayName}. Reason: ${REASON}`;

    let ticketName = '';
    let wizard: { untilIso: string; hasReason: boolean; buttons: string[] } = { untilIso: '', hasReason: false, buttons: [] };
    let status = '';
    let banner = '';
    let note = '';
    let untilPanel = { found: false, value: '', readOnly: false, disabled: false };
    let reasonPanel = { found: false, value: '', readOnly: false, disabled: false };

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
      console.log(`     subject   = ${created.subject}`);
      console.log(`     status    = ${created.status} -> ${moved.status}`);
      console.log(`     team      = ${created.team}`);
      console.log(`     raised by = ${created.raisedBy}`);
      console.log(`  Observation (not scored) - Contact on the ticket : ${created.contact || '(none)'}`);
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
      expect(created.subject, 'the probe ticket keeps the subject typed').toBe(subject);
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(created.team, 'the probe ticket is on team NAKIVO Customer Support').toBe(TEAM);
      expect(created.raisedBy, 'the probe ticket is raised by the address typed').toBe(raisedBy);
      expect(moved.status, 'the probe ticket is moved to On Customer').toBe(STAGE_ON_CUSTOMER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket On Customer');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.chooseHeaderMenuItem('Hibernate');
      wizard = await desk.getHibernateWizardDefaults();
      console.log(`  - Wizard buttons : ${wizard.buttons.join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the "Hibernate ticket" wizard opened',
          expected: 'the wizard with OK and Cancel is shown (no wizard = Hibernate was not reached in the menu)',
          actual: wizard.buttons.join(' | ') || 'NOT SHOWN',
          passed: wizard.buttons.some((b) => /^OK$/.test(b)) && wizard.buttons.some((b) => /^Cancel$/.test(b)),
        },
      ], `${TC} - Step 1 Hibernate wizard`, ['[role="dialog"], [role="alertdialog"]']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      wizard = await desk.getHibernateWizardDefaults();
      console.log(`  - Hibernate until (as shown, yyyy-mm-dd) : ${wizard.untilIso || '(empty)'}`);
      console.log(`  - Expected (today + 14 days)             : ${until.iso}`);
      console.log(`  Observation (not scored) - Hibernate reason box present : ${wizard.hasReason}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Hibernate until - the default date',
          expected: `${until.iso} (today + 14 days; any other date = the default is not 14 days ahead)`,
          actual: wizard.untilIso || '(empty)',
          passed: wizard.untilIso === until.iso,
        },
      ], `${TC} - Step 2 default date`, ['[role="dialog"], [role="alertdialog"]']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Hibernate reason : ${REASON}`);
      console.log('  - Action           : OK');
      await desk.confirmHibernateWizard(REASON);
      console.log('  - Wizard closed');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      status = (await desk.getTicketFields(ticketName)).status;
      banner = await desk.waitForVisibleMessage('This ticket is hibernated', CommonUtils.waitTimes.abnormalWait);
      note = await desk.waitForTicketText('Ticket hibernated until', 4, CommonUtils.waitTimes.long);
      untilPanel = await desk.getPanelFieldState('Hibernate until');
      reasonPanel = await desk.getPanelFieldState('Hibernate reason');
      console.log(`  - Status (Frappe)       : ${status}`);
      console.log(`  - Banner                : ${banner || '(none)'}`);
      console.log(`  - Timeline note         : ${note || '(none)'}`);
      console.log(`  - Panel "Hibernate until" : found ${untilPanel.found}, value "${untilPanel.value}", read-only ${untilPanel.readOnly || untilPanel.disabled}`);
      console.log(`  - Panel "Hibernate reason": found ${reasonPanel.found}, value "${reasonPanel.value}", read-only ${reasonPanel.readOnly || reasonPanel.disabled}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Status after the hibernation', expected: 'Hibernate', actual: status || '(none)', passed: status === 'Hibernate' },
        { what: 'Banner text', expected: `contains "${expectedBanner}"`, actual: `"${banner || '(none)'}"`, passed: banner.includes(expectedBanner) },
        { what: 'Timeline note by the agent', expected: `contains "${expectedNote}"`, actual: `"${note || '(none)'}"`, passed: note.includes(expectedNote) },
        {
          what: 'Side panel - "Hibernate until" read-only',
          expected: 'read-only (the field is shown, not editable)',
          actual: untilPanel.found ? (untilPanel.readOnly || untilPanel.disabled ? 'read-only' : 'EDITABLE') : 'NOT FOUND',
          passed: untilPanel.found && (untilPanel.readOnly || untilPanel.disabled),
        },
        {
          what: 'Side panel - "Hibernate reason" read-only',
          expected: 'read-only (the field is shown, not editable)',
          actual: reasonPanel.found ? (reasonPanel.readOnly || reasonPanel.disabled ? 'read-only' : 'EDITABLE') : 'NOT FOUND',
          passed: reasonPanel.found && (reasonPanel.readOnly || reasonPanel.disabled),
        },
      ], `${TC} - Step 4 status, banner, note and panel`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - hibernated');
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
        : `OVERALL: PASS - default date today + 14 days; Status Hibernate; banner and timeline note as expected; until and reason read-only`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(wizard.untilIso, 'the Hibernate until default is today + 14 days').toBe(until.iso);
      expect(status, 'the ticket reads Hibernate').toBe('Hibernate');
      expect(banner, 'the banner names the reopen date and the reason').toContain(expectedBanner);
      expect(note, 'the timeline logs the hibernation note by Giang Le').toContain(expectedNote);
      expect(untilPanel.readOnly || untilPanel.disabled, 'Hibernate until is read-only in the panel').toBe(true);
      expect(reasonPanel.readOnly || reasonPanel.disabled, 'Hibernate reason is read-only in the panel').toBe(true);
    });
  });
});
