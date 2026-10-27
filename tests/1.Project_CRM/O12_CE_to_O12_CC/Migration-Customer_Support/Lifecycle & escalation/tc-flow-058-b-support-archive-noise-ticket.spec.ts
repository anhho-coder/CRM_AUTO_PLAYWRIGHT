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
 *  TC-FLOW-058_B - Archive a noise ticket - side B: Support service (Frappe Helpdesk)
 * ================================================================================================
 * Test Case ID     : TC-FLOW-058_B   (side B of the A/B row TC-FLOW-058; side A = tc-flow-058-a-preprod-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : Support service (https://support-crm-mig.nakivo.site, Frappe Helpdesk - NOT Odoo; self-signed
 *                    certificate chain, hence ignoreHTTPSErrors)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; HD Agent Support Level = L1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_support_mig). Teardown only: Administrator over the API.
 * Data             : one probe ticket (and the Contact FF creates for its Raised By address) created per run in
 *                    Pre-condition 2, archived by the case itself and DELETED in afterEach as Administrator (toggles
 *                    SKIP_CLEANUP_TICKETS / SKIP_CLEANUP_CONTACTS)
 * Folder           : tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0274; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Baseline         : TC-FLOW-058_A (Jira: not imported to Xray yet; tests/1.Project_CRM/6.Helpdesk_Module/
 *                    Overrall_Helpdesk_Supports_Feature/Lifecycle & escalation/tc-flow-058-a-preprod-archive-noise-ticket.spec.ts)
 *                    - same confirmation text and the same default-list / Archived outcome (CSV Comparison = same); map:
 *                    helpers/customer-support-mig.baseline-map.ts
 *
 * Summary
 * -------
 * As an L1 agent, archive an Open probe ticket treated as spam: the confirmation must read as in the CSV; afterwards the
 * ticket must be gone from the default data and the Open column must drop by one; under Filters > Archived it must be
 * listed. Nothing is deleted - the record still exists, archived.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-058-b-support --grep "TC-FLOW-058_B:" --project=chromium
 *   (both sides: npx playwright test tc-flow-058- --grep "TC-FLOW-058_" --project=chromium; baseline-mapped B specs: --grep @baseline-preprod)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 147 = row TC-FLOW-058 (Area Ticket lifecycle & workflow,
 *                   Feature "Archive a noise ticket", High, happy, L1 agent, refs E15, LC-028) - 4 steps
 *  Source version : fingerprint 083b186bf20be150 = sha256 (16 hex) of the row's Preconditions + Steps + B expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the B column (Frappe Helpdesk) - the "FF:" half of step 1; the other steps carry no platform half
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Open (treat it as spam).")
 *    1. Logged in as an L1 agent - here the Support service; the L1 tier is read from the HD Agent record
 *    2. One probe ticket in stage Open - CREATED by this run:
 *         All Tickets > Create (header) -> New Ticket form
 *            - Raised By (Email) = qa.customer.<runId>@example.com   (CSV test data qa.customer@example.com, made
 *                                                                    unique per run - see below)
 *            - Contact           = blank (FF fills it with the Contact it creates for the Raised By address)
 *            - Customer          = blank
 *            - Priority          = blank (FF default Medium)
 *            - Assigned to       = blank
 *            - Subject           = QA FLOW probe TC-FLOW-058_B <runId>
 *            - Description       = Automated check of TC-FLOW-058_B (Archive a noise ticket) - created and deleted by this run.
 *         Submit -> status Open, team NAKIVO Customer Support (asserted). Baseline: All Tickets > Kanban, the Open column's
 *         count is read (N) with the probe in it.
 *       Measured 2026-10-22: Submit stays disabled until Subject AND Description hold text; the server refuses a ticket
 *       with neither Raised By nor Contact (HTTP 417); hence a run-unique address, so the teardown deletes exactly the
 *       Contact this run caused.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "Odoo:" half belongs to side A)
 *    1. Click Archive (FF: Archive in the ticket header).
 *    2. Read the confirm text and confirm.
 *    3. Go back to All Tickets (default filters) and search the ticket number.
 *    4. Open Filters > Archived.
 *  Verification - B expected (Frappe Helpdesk), verbatim
 *    Same confirm text; gone from default lists, kanban and counts; listed under Filters > Archived with its whole history.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. "Counts" is asserted as a DELTA of the Open column (baseline N, expected N - 1), never as an absolute
 *  number, because the shared base moves.
 *
 *  UI vs TC (measured 2026-10-23, the TC wording should be corrected): step 1 says "Archive in the ticket header". FF keeps
 *  Archive in the ticket's Actions menu (the header's Actions button before the ticket is assigned, its more (…) button
 *  after). The step keeps the CSV text and says so.
 *
 *  BLOCKED - step 3 (search the ticket number) is not automated: the list's quick filter is typed into only by a person,
 *  because FF saves what is typed there per user and this suite never types into it. Step 3 asserts what it can instead:
 *  the probe is archived (REST), the default data no longer holds it (REST, custom_archived = 0), and the Open column count
 *  drops by one (kanban).
 *
 *  Environment traps (also in the step text):
 *   - Archive is an item of the ticket's Actions menu and FF asks for confirmation ("Are you sure you want to archive the
 *     ticket?") in a dialog; the archived flag is custom_archived (no status change).
 *   - The list's Filters > Archived is switched on and must be switched off again: the spec restores the default view in
 *     a finally block, and the crumb is read to prove it.
 *   - The kanban draws 20 cards per column ("Load more"); the Open count is read from the column header.
 *   - FF saves the ticket LIST state per user: this spec never types in a list filter and never clicks a list cell.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1, 2, 3 and 4
 * (the dialog, the default data, the Archived view); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

test.use({ ignoreHTTPSErrors: true }); // the Support service serves a self-signed certificate chain

const TC = 'TC-FLOW-058_B';
const SOURCE_ROW = 'TC-FLOW-058';
const SOURCE_FINGERPRINT = '083b186bf20be150';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket (otherwise deleted as Administrator in afterEach)
const SKIP_CLEANUP_CONTACTS = false; // true keeps the Contact FF created for the probe's Raised By address

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - Support service (Frappe Helpdesk) /login as Giang Le; [INTERNAL check, Call API] the HD Agent of this account reads Support Level = L1',
  pre2: 'Pre-condition 2: One probe ticket in stage Open - created by this run: All Tickets > Create, Raised By = qa.customer.<runId>@example.com, Subject = QA FLOW probe TC-FLOW-058_B <runId>, Description, Submit; then the baseline: All Tickets > Kanban, the Open column count is read',
  s1: "Step 1: Click Archive (FF: Archive in the ticket header) - the probe is opened by its link; FF keeps Archive in the ticket's Actions menu, not as a header button (measured 2026-10-23)",
  s2: 'Step 2: Read the confirm text and confirm. - the confirmation is read as shown, then OK; the record is re-read by its number (archived, not deleted)',
  s3: '[MANUAL ONLY - the search types the ticket number into the list quick filter, which FF saves per user; this suite never types into it] Step 3: Go back to All Tickets (default filters) and search the ticket number. - the default data and the Open column count are checked instead',
  s4: 'Step 4: Open Filters > Archived. - the Filters popover, Archived item; the Archived view is switched off again afterwards (FF saves the list state per user)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_support_mig;
const ADMIN = users.admin_support_mig;
const TEAM = 'NAKIVO Customer Support';
const CONFIRM = 'Are you sure you want to archive the ticket?';

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

test.describe(`${TC} - Archive a noise ticket on the Support service`, () => {
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

  test(`${TC}: Archive a noise ticket - B: Support service confirmation, default data and Open count drop by one, Archived view lists it`, customerSupportBaselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const desk = new SupportDeskPageMig(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const raisedBy = `qa.customer.${runId}@example.com`;
    const description = `Automated check of ${TC} (Archive a noise ticket) - created and deleted by this run.`;

    let ticketName = '';
    let openBaseline = -1;
    let openAfter = -1;
    let confirmGuard = '';
    let confirmText = '';
    let archivedAfterOk = false;
    let archivedBy = '';
    let inDefaultData: boolean | null = null;
    let archivedRowShown = false;
    let restoredCrumb = '';

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
      probe = { subject, contactEmail: raisedBy };
      await desk.openAllTicketsFromSidebar();
      ticketName = await desk.createTicketFromList({ raisedBy, subject, description });
      probe.ticketName = ticketName;
      const created = await desk.getTicketFields(ticketName);
      await desk.openAllTicketsFromSidebar();
      await desk.switchToKanbanLayout();
      const openColumn = (await desk.getKanbanColumns()).find((c) => c.column === 'Open');
      openBaseline = openColumn ? openColumn.count : -1;
      console.log('  Read back after Submit:');
      console.log(`     ticket    = ${ticketName}`);
      console.log(`     status    = ${created.status}`);
      console.log(`     team      = ${created.team}`);
      console.log(`     raised by = ${created.raisedBy}`);
      console.log(`  Baseline - Open column count (kanban, with the probe in it) : ${openBaseline}`);
      const passed = created.status === 'Open' && created.team === TEAM && created.raisedBy === raisedBy && openBaseline >= 1;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket Open, baseline read`,
        passed,
        highlight: ['div[title="Fold"]', 'div[title="Show"]'],
        lines: [`status: expected Open | actual ${created.status}`, `team: expected ${TEAM} | actual ${created.team}`, `Open column count: expected a count including the probe | actual ${openBaseline}`],
      }).catch(() => {});
      expect(created.status, 'the probe ticket is created Open').toBe('Open');
      expect(created.team, 'the probe ticket is on team NAKIVO Customer Support').toBe(TEAM);
      expect(created.raisedBy, 'the probe ticket is raised by the address typed').toBe(raisedBy);
      expect(openBaseline, 'the Open column count is read with the probe in it').toBeGreaterThanOrEqual(1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Open, baseline read');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await desk.openTicketByLink(baseUrl_support_mig, ticketName);
      await desk.chooseHeaderMenuItem('Archive');
      confirmGuard = await desk.getShownDialogTextFF();
      console.log(`  - Dialog shown : ${confirmGuard || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the archive confirmation is asked',
          expected: `a confirmation with the text "${CONFIRM}" (no dialog = Archive was not reached in the menu)`,
          actual: confirmGuard || '(no dialog)',
          passed: confirmGuard.includes(CONFIRM),
        },
      ], `${TC} - Step 1 archive confirmation`, ['[role="dialog"], [role="alertdialog"]'], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      confirmText = await desk.getShownDialogTextFF();
      console.log(`  - Confirm text as shown : ${confirmText || '(none)'}`);
      // The confirm text lives in the dialog: shot before OK closes it.
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 confirm text', expected: `"${CONFIRM}"`, actual: `"${confirmText || '(none)'}"`, passed: confirmText.includes(CONFIRM) },
      ], `${TC} - Step 2 confirm text`, ['[role="dialog"], [role="alertdialog"]'], 'bottom-right');
      await desk.confirmShownDialogOk();
      const state = await desk.getArchiveState(ticketName);
      archivedAfterOk = state.archived;
      archivedBy = state.by;
      console.log(`  [INTERNAL check, Call API] HD Ticket/${ticketName} read by its number: custom_archived = ${state.archived}, by ${state.by}, on ${state.on}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 after OK the ticket is archived and still exists',
          expected: 'custom_archived = 1 (the record exists, archived - nothing deleted)',
          actual: `archived = ${state.archived}`,
          passed: state.archived === true,
        },
      ], `${TC} - Step 2 archived`, ['header']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const found = await desk.findNewestTicket([['name', '=', ticketName], ['custom_archived', '=', 0]]);
      inDefaultData = found !== null;
      await desk.openAllTicketsFromSidebar();
      await desk.switchToKanbanLayout();
      const openColumn = (await desk.getKanbanColumns()).find((c) => c.column === 'Open');
      openAfter = openColumn ? openColumn.count : -1;
      console.log(`  - Ticket in the default data (custom_archived = 0) : ${inDefaultData ? 'YES' : 'no'}`);
      console.log(`  - Open column count : ${openBaseline} -> ${openAfter} (delta ${openAfter - openBaseline})`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 3 default data - the archived ticket is not in it',
          expected: 'not in the default data (custom_archived = 0)',
          actual: inDefaultData ? 'IN the default data' : 'not in the default data',
          passed: inDefaultData === false,
        },
        {
          what: 'Step 3 Open column count - delta from the baseline',
          expected: '-1 (the archived probe leaves the Open column; any other delta = another change on the shared base)',
          actual: `${openAfter - openBaseline >= 0 ? '+' : ''}${openAfter - openBaseline} (${openBaseline} -> ${openAfter})`,
          passed: openBaseline >= 1 && openAfter - openBaseline === -1,
        },
      ], `${TC} - Step 3 default data and count`, ['div[title="Fold"]', 'div[title="Show"]']);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await desk.switchToListLayout();
      try {
        await desk.toggleListArchivedFilter();
        archivedRowShown = await desk.revealListRow(ticketName, subject);
        console.log(`  - Probe row drawn in the Archived view : ${archivedRowShown}`);
      } finally {
        if (await desk.isArchivedViewShown()) await desk.toggleListArchivedFilter();
        restoredCrumb = await desk.getHeaderCrumbs();
        console.log(`  - Default view restored - header reads "${restoredCrumb}"`);
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 Archived view - the probe is listed', expected: '1 row for the probe under Archived', actual: archivedRowShown ? '1 row' : '0 rows', passed: archivedRowShown },
        {
          what: 'Step 4 list restored after the check',
          expected: 'the default list again (header without "Archived")',
          actual: `"${restoredCrumb}"`,
          passed: !/Archived/.test(restoredCrumb),
        },
      ], `${TC} - Step 4 Archived view`, ['header']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - archived view checked');
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
        : `OVERALL: PASS - same confirmation; the ticket leaves the default data and the Open count drops by one; it is listed under Archived and not deleted`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(confirmText, 'the confirmation reads "Are you sure you want to archive the ticket?"').toContain(CONFIRM);
      expect(archivedAfterOk, 'the ticket is archived, not deleted').toBe(true);
      expect(inDefaultData, 'the archived ticket is not in the default data').toBe(false);
      expect(openAfter - openBaseline, 'the Open column count drops by one').toBe(-1);
      expect(archivedRowShown, 'the archived ticket is listed under Archived').toBe(true);
      expect(restoredCrumb, 'the list is back to the default view').not.toMatch(/Archived/);
    });
  });
});
