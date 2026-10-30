import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-018_A - Other moves keep the due date - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-018_A   (side A of the A/B row TC-FLOW-018; side B = tc-flow-018-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = l2, asserted in Pre-condition 1;
 *                    users.support_l2_manager_nam)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach - Nam holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Service-level targets" =
 *                    the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0276; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-FLOW-018_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Service-level targets/
 *                    tc-flow-018-b-support-other-moves-keep-due-date.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * A probe ticket whose Due Date was set by its move to L2 is moved to Resolving, then Escalated, then Open. The Due Date
 * read after each move must equal the one noted before the moves, and must never be empty.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-018-a-preprod --grep "TC-FLOW-018_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-018- --grep "TC-FLOW-018_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 107 = row TC-FLOW-018 (Area Ticket lifecycle & workflow,
 *                   Feature "Other moves keep the due date", High, regression, L2 engineer, refs E11, LC-013, AU-003)
 *                   - 3 steps
 *  Source version : fingerprint 45f2b3110fb91d45 = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12)
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in L2 with a due date set by the move to L2.")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. One probe ticket in L2 with a due date set by the move to L2 - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-018_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open (asserted, Due Date empty); the stage bar > L2 -> stage L2 with a Due Date (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd), subject 'QA FLOW probe <case
 *       id>'): own unique subject, no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Note the Due Date.
 *    2. Move the ticket to Resolving, then to Escalated, then to Open.
 *    3. Read the Due Date after each move.
 *  Verification - A expected (Odoo 12), verbatim
 *    The Due Date never changes and is never cleared by these moves.
 *
 *  Step 2 / Step 3: "after each move" can only be read between the moves, so Step 2 reads the form's Due Date right after
 *  each of its three moves (the read is part of the move, nothing is checked there); Step 3 checks the three reads against
 *  the Step 1 value, with the last one still on screen.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the Due Date); Step 2 end shot; Step 3
 * verify shot (the Due Date after the last move, banner with all three reads); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-018_A';
const SOURCE_ROW = 'TC-FLOW-018';
const SOURCE_FINGERPRINT = '45f2b3110fb91d45';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = l2',
  pre2: 'Pre-condition 2: Probe ticket in L2 with a due date set by the move to L2 - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-018_A <runId>, SAVE; then the stage bar > L2',
  s1: "Step 1: Note the Due Date (Odoo: 'Due Date' on the form)",
  s2: 'Step 2: Move the ticket to Resolving, then to Escalated, then to Open (Odoo: the stage bar; the form\'s Due Date is read right after each move for Step 3)',
  s3: 'Step 3: Read the Due Date after each move.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const TEAM = 'Customer Support';
const MOVES = ['Resolving', 'Escalated', 'Open'];

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

test.describe(`${TC} - Other moves keep the due date on Odoo 12 pre-production`, () => {
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
      } else if (!probe.id) {
        cleanupError = `probe "${probe.subject}" has no captured id - check by hand that it was never saved`;
      } else {
        // [INTERNAL, Call API] archive BY ID (Nam holds no unlink): the ticket must carry this run's subject.
        const archived = await new HelpdeskPage(page).archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Other moves keep the due date - A: Odoo 12 keeps the L2 Due Date through Resolving, Escalated and Open`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    let noted = '';
    const reads: Array<{ stage: string; shown: string; stored: string }> = [];

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
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Nam:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l2' = Support L2)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer (employee Support Team = Support L2)').toBe('l2');
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
      const openStage = await helpdeskPage.getCurrentStage();
      const dueAtOpen = await helpdeskPage.getFieldValueByName('overdue');
      const l2Stage = await helpdeskPage.moveTicketToStage('L2');
      const dueAtL2 = await helpdeskPage.getFieldValueByName('overdue');
      console.log('  Read back:');
      console.log(`     id                 = ${probe.id}`);
      console.log(`     stage after SAVE   = ${openStage} | Due Date "${dueAtOpen || '(empty)'}"`);
      console.log(`     stage after move   = ${l2Stage} | Due Date "${dueAtL2 || '(empty)'}"`);
      expect(openStage, 'the probe ticket is created in stage Open').toBe('Open');
      expect(l2Stage, 'the probe ticket is in stage L2').toBe('L2');
      expect(dueAtL2, 'the move to L2 set a Due Date').not.toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket in L2 with a Due Date');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      noted = await helpdeskPage.getFieldValueByName('overdue');
      const stored = await helpdeskPage.readTicketOverRpc(probe.id as string, ['overdue']);
      console.log(`  - Due Date noted : "${noted}" (stored UTC ${String(stored.overdue)})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the Due Date set by the move to L2 is noted', expected: 'a Due Date (not empty)', actual: noted || '(empty)', passed: !!noted },
      ], `${TC} - Step 1 Due Date noted`, ['[name="overdue"]']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const stage of MOVES) {
        const reached = await helpdeskPage.moveTicketToStage(stage);
        const shown = await helpdeskPage.getFieldValueByName('overdue');
        const stored = await helpdeskPage.readTicketOverRpc(probe.id as string, ['overdue']);
        reads.push({ stage: reached, shown, stored: String(stored.overdue) });
        console.log(`  - Moved to ${reached} | form Due Date "${shown || '(empty)'}" | stored UTC ${String(stored.overdue)}`);
        expect(reached, `the ticket reached stage ${stage}`).toBe(stage);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 2 moved to Resolving, Escalated, Open');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      for (const r of reads) console.log(`  - After the move to ${r.stage}: "${r.shown || '(empty)'}"`);
      await recordChecks(page, testInfo, checks, reads.map((r) => ({
        what: `Step 3 Due Date after the move to ${r.stage}`,
        expected: `"${noted}" - unchanged from Step 1 (a different or empty Due Date is a FAIL: the move recomputed or cleared it)`,
        actual: r.shown || '(empty)',
        passed: !!r.shown && r.shown === noted,
      })), `${TC} - Step 3 Due Date after each move`, ['[name="overdue"]']);
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
        : 'OVERALL: PASS - the Due Date never changes and is never cleared by the moves to Resolving, Escalated and Open');
      expect(reads.length, 'one Due Date read per move').toBe(MOVES.length);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the Due Date is never changed or cleared').toEqual([]);
    });
  });
});
