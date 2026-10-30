import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-032_A - Direct move to Hibernate refused - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-032_A   (side A of the A/B row TC-FLOW-032; side B = tc-flow-032-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod = the same login and password as users.support_l1_giang_support_mig)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach - Giang holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0270; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-032_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/4. Lifecycle & escalation/
 *                    tc-flow-032-b-support-direct-hibernate-refused.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L1 agent, with a probe ticket in On Customer, try to put it into Hibernate directly - once from the stage bar and
 * once by dragging its kanban card into the Hibernate column. Both attempts must be refused with the product's message
 * and the ticket must stay On Customer.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-032-a-preprod --grep "TC-FLOW-032_A:" --project=chromium
 *   (both sides: npx playwright test tc-flow-032- --grep "TC-FLOW-032_" --project=chromium)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 121 = row TC-FLOW-032 (Area Ticket lifecycle & workflow,
 *                   Feature "Direct move to Hibernate refused", High, negative, L1 agent, refs E12, LC-025, AU-004) - 2 steps
 *  Source version : fingerprint b6ed5a5bda783593 = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in On Customer.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. One probe ticket in stage On Customer - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-032_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list; read back after SAVE)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open; then the stage bar > On Customer -> stage On Customer (both asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com, subject 'QA FLOW probe <case id>'): this run
 *       uses its own unique subject and no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Try to set the stage to Hibernate directly (Odoo: click Hibernate in the stage bar).
 *    2. Try again by dragging the kanban card into the Hibernate column.
 *  Verification - A expected (Odoo 12), verbatim
 *    Error 'Do not change to Hibernate stage directly. Use Hibernate button instead'; the ticket stays On Customer.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. The refusal text and the stage are asserted after BOTH steps, each step recording its own result.
 *
 *  Environment traps (also in the step text):
 *   - The refusal is an Odoo warning dialog ("Odoo Server Error - Warning") with an OK button; it is closed before the
 *     stage is read, so the next check does not run under a open dialog.
 *   - The kanban has 13 stage columns (272 px each): the Hibernate column starts at x = 2720, beyond the 1920 px viewport.
 *     The drag widens the viewport to 3800 px for the drag only and restores 1920 x 1080 after it.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 and 2 (the
 * refusal dialog and the ticket's stage / column, outlined green = PASS, red = FAIL); one end-of-section shot after
 * Step 2; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-032_A';
const SOURCE_ROW = 'TC-FLOW-032';
const SOURCE_FINGERPRINT = 'b6ed5a5bda783593';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: One probe ticket in stage On Customer - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-032_A <runId>, SAVE; then the stage bar > On Customer',
  s1: 'Step 1: Try to set the stage to Hibernate directly (Odoo: click Hibernate in the stage bar) - the stage bar refuses it with a warning; the Hibernate button is the only way in (TC-FLOW-030)',
  s2: 'Step 2: Try again by dragging the kanban card into the Hibernate column - the kanban is 13 columns wide: the viewport is widened to 3800 px for the drag only',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const STAGE_ON_CUSTOMER = 'On Customer';
const REFUSAL = 'Do not change to Hibernate stage directly. Use Hibernate button instead';

/** The refusal dialog box itself (not '.modal.show', which is the full-screen overlay). */
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

test.describe(`${TC} - Direct move to Hibernate refused on Odoo 12 pre-production`, () => {
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
        // back inactive.
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

  test(`${TC}: Direct move to Hibernate refused - A: Odoo 12 stage bar and kanban drop both refused, ticket stays On Customer`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;

    let refusalStageBar = '';
    let stageAfterStageBar = '';
    let refusalDrag = '';
    let columnBefore = '';
    let columnAfter = '';

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
      console.log(`  Then the stage bar > ${STAGE_ON_CUSTOMER}`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const team = await helpdeskPage.getHelpdeskTeam();
      const openStage = await helpdeskPage.getCurrentStage();
      const onCustomer = await helpdeskPage.moveTicketToStage(STAGE_ON_CUSTOMER);
      console.log('  Read back:');
      console.log(`     id                 = ${probe.id}`);
      console.log(`     Helpdesk Team      = ${team}`);
      console.log(`     stage after SAVE   = ${openStage}`);
      console.log(`     stage after move   = ${onCustomer}`);
      const passed = team === TEAM && openStage === 'Open' && onCustomer === STAGE_ON_CUSTOMER;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket On Customer`,
        passed,
        highlight: ['.o_statusbar_status'],
        lines: [`Helpdesk Team: expected ${TEAM} | actual ${team}`, `stage after SAVE: expected Open | actual ${openStage}`, `stage after move: expected ${STAGE_ON_CUSTOMER} | actual ${onCustomer}`],
      }).catch(() => {});
      expect(team, 'the probe ticket is on team Customer Support').toBe(TEAM);
      expect(openStage, 'the probe ticket is created in stage Open').toBe('Open');
      expect(onCustomer, 'the probe ticket is moved to stage On Customer').toBe(STAGE_ON_CUSTOMER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket On Customer');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      refusalStageBar = await helpdeskPage.clickStageExpectingRefusal('Hibernate');
      console.log(`  - Dialog shown : ${refusalStageBar || '(none)'}`);
      // The message lives in the dialog: shot while it is open, the dialog outlined.
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 stage-bar Hibernate - the refusal message',
          expected: `"${REFUSAL}"`,
          actual: `"${refusalStageBar || '(no dialog)'}"`,
          passed: refusalStageBar.includes(REFUSAL),
        },
      ], `${TC} - Step 1 stage-bar refusal message`, refusalStageBar ? [DIALOG] : ['.o_statusbar_status'], 'bottom-right');
      await helpdeskPage.closeShownDialog();
      stageAfterStageBar = await helpdeskPage.getCurrentStage();
      console.log(`  - Stage after the refusal : ${stageAfterStageBar}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 stage after the refusal',
          expected: STAGE_ON_CUSTOMER,
          actual: stageAfterStageBar || '(none)',
          passed: stageAfterStageBar === STAGE_ON_CUSTOMER,
        },
      ], `${TC} - Step 1 stage after the refusal`, ['.o_statusbar_status']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdeskPage.goBackToBreadcrumb('Tickets');
      await helpdeskPage.switchToKanbanView();
      await helpdeskPage.searchTicket(subject);
      const dropMessageCheck = (text: string): Check => ({
        what: 'Step 2 kanban drop into Hibernate - the refusal message',
        expected: `"${REFUSAL}"`,
        actual: `"${text || '(no dialog)'}"`,
        passed: text.includes(REFUSAL),
      });
      let dropMessageShot = false;
      const drag = await helpdeskPage.dragKanbanCardToColumn(subject, 'Hibernate', {
        // The message lives in the dialog: shot while it is open (the page object closes it right after).
        onDialog: async (text) => {
          if (dropMessageShot) return;
          dropMessageShot = true;
          await recordChecks(page, testInfo, checks, [dropMessageCheck(text)], `${TC} - Step 2 kanban drop refusal message`, [DIALOG], 'bottom-right');
        },
      });
      refusalDrag = drag.dialog;
      columnBefore = drag.columnBefore;
      columnAfter = drag.columnAfter;
      console.log(`  - Card column before the drop : ${columnBefore || '(not drawn)'}`);
      console.log(`  - Dialog after the drop       : ${refusalDrag || '(none)'}`);
      console.log(`  - Card column after the drop  : ${columnAfter || '(not drawn)'}`);
      // No dialog was drawn: the message check is still recorded (FAIL), on the board.
      if (!dropMessageShot) await recordChecks(page, testInfo, checks, [dropMessageCheck(refusalDrag)], `${TC} - Step 2 kanban drop refusal message`, ['div.o_kanban_group']);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 the card stays in its column',
          expected: `${STAGE_ON_CUSTOMER} (the card returns to where it was)`,
          actual: columnAfter || '(not drawn)',
          passed: columnBefore === STAGE_ON_CUSTOMER && columnAfter === STAGE_ON_CUSTOMER,
        },
      ], `${TC} - Step 2 card stays in its column`, ['div.o_kanban_group']);
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
        : `OVERALL: PASS - both attempts are refused with the product's message; the ticket stays On Customer`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(refusalStageBar, 'the stage-bar move is refused with the product message').toContain(REFUSAL);
      expect(stageAfterStageBar, 'the ticket stays On Customer after the stage-bar attempt').toBe(STAGE_ON_CUSTOMER);
      expect(refusalDrag, 'the kanban drop is refused with the same message').toContain(REFUSAL);
      expect(columnAfter, 'the card stays in On Customer after the kanban drop').toBe(STAGE_ON_CUSTOMER);
    });
  });
});
