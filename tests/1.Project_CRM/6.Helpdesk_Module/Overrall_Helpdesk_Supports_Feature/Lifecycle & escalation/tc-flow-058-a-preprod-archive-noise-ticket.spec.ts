import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-058_A - Archive a noise ticket - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-058_A   (side A of the A/B row TC-FLOW-058; side B = tc-flow-058-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod = the same login and password as users.support_l1_giang_support_mig)
 * Data             : one probe ticket created per run (Pre-condition 2); the case ARCHIVES it itself (Step 1-2), and
 *                    afterEach archives it again by id if the case stopped earlier - Giang holds no unlink (toggle
 *                    SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0274; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-058_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Lifecycle & escalation/
 *                    tc-flow-058-b-support-archive-noise-ticket.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L1 agent, archive an Open probe ticket treated as spam: confirm the archive, then the ticket must be gone from
 * All Tickets (default filters) and the list count must drop by one, and it must show under the Archived filter. Nothing
 * is deleted - the record still exists, inactive.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-058-a-preprod --grep "TC-FLOW-058_A:" --project=chromium
 *   (both sides: npx playwright test tc-flow-058- --grep "TC-FLOW-058_" --project=chromium)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 147 = row TC-FLOW-058 (Area Ticket lifecycle & workflow,
 *                   Feature "Archive a noise ticket", High, happy, L1 agent, refs E15, LC-028) - 4 steps
 *  Source version : fingerprint 3e6553a87e224c5d = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Open (treat it as spam).")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. One probe ticket in stage Open - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-058_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list; read back after SAVE)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open (asserted). Then the baseline: Helpdesk > All Tickets, the list's total is read (N); the probe
 *         is opened again from that list by its unique Subject (exactly one row).
 *       Deviation from the CSV test data (customer qa.customer@example.com, subject 'QA FLOW probe <case id>'): this run
 *       uses its own unique subject and no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Click Archive (Odoo: Archive button / Action > Archive on the form).
 *    2. Read the confirm text and confirm.
 *    3. Go back to All Tickets (default filters) and search the ticket number.
 *    4. Open Filters > Archived.
 *  Verification - A expected (Odoo 12), verbatim
 *    Confirm 'Are you sure you want to archive the ticket?'; the ticket disappears from default lists and counts; it is
 *    listed under Archived; nothing is deleted.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. "Counts" is asserted as a DELTA of the All Tickets list total (baseline N, expected N - 1), never as an
 *  absolute number, because the shared pre-production base moves.
 *
 *  Environment traps (also in the step text):
 *   - The form's Action menu has no Archive for a helpdesk user; the Archive control is the button-box "Active" toggle
 *     (name toggle_active), which asks Odoo's confirmation first.
 *   - "Search the ticket number": this list is searched by the probe's unique Subject (the number is not a search facet).
 *   - "Filters > Archived" is Odoo's Advanced Search filter; it is applied to this page only and saved nowhere.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1, 2, 3 and 4
 * (the confirmation, the list); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-058_A';
const SOURCE_ROW = 'TC-FLOW-058';
const SOURCE_FINGERPRINT = '3e6553a87e224c5d';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: One probe ticket in stage Open - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-058_A <runId>, SAVE; then the baseline: Helpdesk > All Tickets total, and the probe opened from that list',
  s1: 'Step 1: Click Archive (Odoo: Archive button / Action > Archive on the form) - the form\'s button-box Active toggle, which asks for confirmation first (the Action menu has no Archive for a helpdesk user)',
  s2: 'Step 2: Read the confirm text and confirm. - the confirmation is read as shown, then OK; the record is then re-read by id (archived, not deleted)',
  s3: 'Step 3: Go back to All Tickets (default filters) and search the ticket number. - Odoo: the probe is searched by its unique Subject (the number is not a search facet of this list); the list total is read against the baseline',
  s4: 'Step 4: Open Filters > Archived. - Odoo Advanced Search, Filters > Archived, applied to this page only',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const CONFIRM = 'Are you sure you want to archive the ticket?';

/** The confirmation dialog box itself (not '.modal.show', which is the full-screen overlay). */
const DIALOG = '.modal.show .modal-content';

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

test.describe(`${TC} - Archive a noise ticket on Odoo 12 pre-production`, () => {
  /** What this run created - read by afterEach. */
  let probe: { id?: string; subject?: string } = {};

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probe = {};
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    let cleanupError = '';
    try {
      if (!probe.subject) {
        console.log('  - No probe ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - #${probe.id ?? '?'} "${probe.subject}"`);
      } else if (probe.id) {
        // [INTERNAL, Call API] archive BY ID (Giang holds no unlink): the ticket must carry this run's subject and read
        // back inactive. Already archived by the case itself = no write, still inactive.
        const helpdeskPage = new HelpdeskPage(page);
        const archived = await helpdeskPage.archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      } else {
        // The id was never captured: look the probe up by this run's unique subject.
        const helpdeskPage = new HelpdeskPage(page);
        await helpdeskPage.openAllTicketsListDirect(baseUrl);
        await helpdeskPage.searchTicket(probe.subject);
        const before = await helpdeskPage.waitForListRowsContaining(probe.subject);
        console.log(`  - Active rows with this run's subject : ${before}`);
        if (before > 1) {
          cleanupError = `${before} active tickets carry this run's subject "${probe.subject}" - more than the run created; nothing archived`;
        } else if (before === 1) {
          const archived = await helpdeskPage.archiveTicketFromListBySubject(probe.subject);
          const after = await helpdeskPage.countListRowsContaining(probe.subject);
          console.log(`  - Archived : ${archived} | active rows left : ${after}`);
          if (!archived || after !== 0) cleanupError = `probe ticket "${probe.subject}" is still active - archive it by hand`;
          else console.log('  - Probe ticket archived');
        } else {
          console.log('  - The create never saved - no probe ticket exists');
        }
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Archive a noise ticket - A: Odoo 12 confirmation, default lists drop the ticket by one, Archived filter lists it`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;

    let baseline = -1;
    let confirmGuard = '';
    let confirmText = '';
    let activeAfterOk = true;
    let totalAfter = -1;
    let defaultRows = -1;
    let archivedRows = -1;
    let archivedFilterApplied = false;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production (${baseUrl})`);
      console.log(`  - Login : ${ENGINEER.username} (${ENGINEER.displayName})`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Giang:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l1' = Support L1)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent (employee Support Team = Support L1)').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Subject        = ${subject}`);
      console.log(`     Helpdesk Team  = ${TEAM} (defaulted by the team's TICKETS list)`);
      console.log('     Customer       = blank');
      console.log('     Customer Email = blank');
      console.log('     Assigned to    = blank');
      console.log('     Priority       = default');
      console.log('     Description    = blank');
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const team = await helpdeskPage.getHelpdeskTeam();
      const stage = await helpdeskPage.getCurrentStage();
      console.log(`  Read back after SAVE: id ${probe.id} | Helpdesk Team ${team} | stage ${stage}`);
      expect(team, 'the probe ticket is on team Customer Support').toBe(TEAM);
      expect(stage, 'the probe ticket is open (stage Open)').toBe('Open');
      await helpdeskPage.openAllTicketsFromMenu();
      baseline = await helpdeskPage.getPagerTotal();
      console.log(`  Baseline - All Tickets list total (with the probe, active) : ${baseline}`);
      await helpdeskPage.searchTicket(subject);
      await helpdeskPage.openOnlyListRowContaining(subject);
      const reopened = await helpdeskPage.getCurrentStage();
      console.log(`  Probe reopened from the list - stage ${reopened}`);
      const passed = baseline > 0 && reopened === 'Open';
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket Open`,
        passed,
        highlight: ['.o_statusbar_status'],
        lines: [`stage: expected Open | actual ${reopened}`, `All Tickets total: expected a positive baseline | actual ${baseline}`],
      }).catch(() => {});
      expect(reopened, 'the probe ticket is open (stage Open) when reopened').toBe('Open');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Open, baseline read');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.clickActiveToggleOnForm();
      confirmGuard = await helpdeskPage.getShownDialogText();
      console.log(`  - Dialog shown : ${confirmGuard || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the archive confirmation is asked',
          expected: `a confirmation with the text "${CONFIRM}" (no dialog = the Archive control did not open it)`,
          actual: confirmGuard || '(no dialog)',
          passed: confirmGuard.includes(CONFIRM),
        },
      ], `${TC} - Step 1 archive confirmation`, [DIALOG], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      confirmText = await helpdeskPage.getShownDialogText();
      console.log(`  - Confirm text as shown : ${confirmText || '(none)'}`);
      // The confirm text lives in the dialog: shot before OK closes it.
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 confirm text', expected: `"${CONFIRM}"`, actual: `"${confirmText || '(none)'}"`, passed: confirmText.includes(CONFIRM) },
      ], `${TC} - Step 2 confirm text`, [DIALOG], 'bottom-right');
      await helpdeskPage.confirmShownDialogWithOk();
      activeAfterOk = await helpdeskPage.isTicketActive(probe.id!);
      console.log(`  [INTERNAL check, Call API] ticket #${probe.id} read by id (archived ones included) : active = ${activeAfterOk}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 after OK the ticket reads archived and still exists',
          expected: 'active = false (the record exists, inactive - nothing deleted)',
          actual: `active = ${activeAfterOk}`,
          passed: activeAfterOk === false,
        },
      ], `${TC} - Step 2 archived`, ['button[name="toggle_active"]']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await helpdeskPage.openAllTicketsFromMenu();
      totalAfter = await helpdeskPage.getPagerTotal();
      const delta = totalAfter - baseline;
      console.log(`  - All Tickets total : ${baseline} -> ${totalAfter} (delta ${delta})`);
      // The total is read on the unsearched default list: shot there, the pager outlined.
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 3 All Tickets total - delta from the baseline',
          expected: '-1 (the archived probe leaves the default list; any other delta = another change on the shared base)',
          actual: `${delta >= 0 ? '+' : ''}${delta} (${baseline} -> ${totalAfter})`,
          passed: baseline > 0 && totalAfter - baseline === -1,
        },
      ], `${TC} - Step 3 default list total`, ['.o_pager_counter']);
      await helpdeskPage.searchTicket(subject);
      defaultRows = await helpdeskPage.waitForListRowsContaining(subject);
      console.log(`  - Rows for the probe in the default list : ${defaultRows}`);
      // An empty list renders .o_view_nocontent instead of .o_list_view: both are outlined candidates.
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 default list - rows for the probe', expected: '0 rows', actual: `${defaultRows} row(s)`, passed: defaultRows === 0 },
      ], `${TC} - Step 3 default list search`, ['.o_list_view', '.o_view_nocontent']);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      archivedFilterApplied = await helpdeskPage.applyArchivedFilter();
      archivedRows = await helpdeskPage.waitForListRowsContaining(subject);
      console.log(`  - Filters > Archived applied : ${archivedFilterApplied}`);
      console.log(`  - Rows for the probe under Archived : ${archivedRows}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 Filters > Archived - the Archived filter exists', expected: 'the Archived item is on the Filters menu', actual: archivedFilterApplied ? 'applied' : 'NOT ON THE MENU', passed: archivedFilterApplied },
        { what: 'Step 4 Archived - rows for the probe', expected: '1 row (listed under Archived)', actual: `${archivedRows} row(s)`, passed: archivedRows === 1 },
      ], `${TC} - Step 4 Archived filter`, ['.o_list_view']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - archived ticket listed');
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
        : `OVERALL: PASS - the confirmation reads as expected; the ticket leaves the default list (total -1), shows under Archived and is not deleted`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(confirmText, 'the confirmation reads "Are you sure you want to archive the ticket?"').toContain(CONFIRM);
      expect(activeAfterOk, 'the ticket is archived, not deleted').toBe(false);
      expect(totalAfter - baseline, 'the All Tickets total drops by one').toBe(-1);
      expect(defaultRows, 'the archived ticket is gone from the default list').toBe(0);
      expect(archivedRows, 'the archived ticket is listed under Archived').toBe(1);
    });
  });
});
