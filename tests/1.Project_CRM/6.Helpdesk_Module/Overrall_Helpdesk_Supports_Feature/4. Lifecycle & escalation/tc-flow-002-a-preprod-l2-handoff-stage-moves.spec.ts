import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-002_A - L1/L2 hand-off stages (manual moves) - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-002_A   (side A of the A/B row TC-FLOW-002; side B = tc-flow-002-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = l2, asserted in Pre-condition 1;
 *                    users.support_l2_manager_nam)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach - Nam holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0271; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-002_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/4. Lifecycle & escalation/
 *                    tc-flow-002-b-support-l2-handoff-stage-moves.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket that is in stage L2 and assigned to me, and move it L2 > In Progress (L2) >
 * Waiting to be sent > Preparing Answer (L1). Each move must be accepted and shown on the stage bar, and the chatter must
 * log each stage change with my name.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-002-a-preprod --grep "TC-FLOW-002_A:" --project=chromium
 *   (both sides: npx playwright test tc-flow-002- --grep "TC-FLOW-002_" --project=chromium)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 91 = row TC-FLOW-002 (Area Ticket lifecycle & workflow,
 *                   Feature "L1/L2 hand-off stages (manual moves)", High, happy, L2 engineer, refs E10, LC-034, LC-001) - 4 steps
 *  Source version : fingerprint 83315b30653cc7f2 = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in stage L2 in both systems, assigned to the tester.")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. One probe ticket in stage L2, assigned to the tester - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-002_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list; read back after SAVE)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank (then "Assign To Me" = the tester)
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open; "Assign To Me" -> assigned to Nam Pham; the stage bar > L2 -> stage L2 (all asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com, subject 'QA FLOW probe <case id>'): this run
 *       uses its own unique subject and no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Move the ticket L2 > In Progress (L2) (Odoo: click the stage in the stage bar).
 *    2. Move it In Progress (L2) > Waiting to be sent.
 *    3. Move it Waiting to be sent > Preparing Answer (L1).
 *    4. Check the ticket's history after each move (Odoo: chatter tracking line 'Stage: X > Y').
 *  Verification - A expected (Odoo 12), verbatim
 *    Each move is accepted, the stage bar shows the new stage and the chatter logs each stage change with the tester's name.
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. Each step asserts its own move (the stage bar reads the new stage); Step 4 asserts the three chatter lines.
 *  On screen the arrow between the two stages of a tracking line is an icon, so the line reads "Stage: L2 In Progress (L2)";
 *  the check looks for that text.
 *
 *  Environment traps (also in the step text):
 *   - The stage bar is drawn in REVERSE DOM order over 3 rows; the stage is read from the statusbar's current button and
 *     the bar's order is never used here.
 *   - A stage write is applied asynchronously: moveTicketToStage reloads and re-reads the stage until it matches.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1, 2, 3 and 4
 * (the stage bar, the chatter tracking lines); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-002_A';
const SOURCE_ROW = 'TC-FLOW-002';
const SOURCE_FINGERPRINT = '83315b30653cc7f2';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = l2',
  pre2: 'Pre-condition 2: One probe ticket in stage L2, assigned to the tester - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-002_A <runId>, SAVE; then Assign To Me, then the stage bar > L2',
  s1: 'Step 1: Move the ticket L2 > In Progress (L2) (Odoo: click the stage in the stage bar)',
  s2: 'Step 2: Move it In Progress (L2) > Waiting to be sent (Odoo: click the stage in the stage bar)',
  s3: 'Step 3: Move it Waiting to be sent > Preparing Answer (L1) (Odoo: click the stage in the stage bar)',
  s4: "Step 4: Check the ticket's history after each move (Odoo: chatter tracking line 'Stage: X > Y' - the arrow is an icon on screen; the line reads 'Stage: X Y'; author = the tester)",
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const TEAM = 'Customer Support';
const MOVES: Array<{ from: string; to: string }> = [
  { from: 'L2', to: 'In Progress (L2)' },
  { from: 'In Progress (L2)', to: 'Waiting to be sent' },
  { from: 'Waiting to be sent', to: 'Preparing Answer (L1)' },
];

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

test.describe(`${TC} - L1/L2 hand-off stages on Odoo 12 pre-production`, () => {
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
        // [INTERNAL, Call API] archive BY ID (Nam holds no unlink): the ticket must carry this run's subject and read
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

  test(`${TC}: L1/L2 hand-off stages - A: Odoo 12 accepts the three moves, the stage bar shows each one, the chatter logs each with the tester's name`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const stagesAfter: string[] = [];

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
      console.log('     Assigned to    = blank (then Assign To Me)');
      console.log('     Priority       = default');
      console.log('     Description    = blank');
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const team = await helpdeskPage.getHelpdeskTeam();
      const openStage = await helpdeskPage.getCurrentStage();
      await helpdeskPage.clickAssignToMe();
      const assigned = await helpdeskPage.getAssignedTo();
      const l2Stage = await helpdeskPage.moveTicketToStage('L2');
      console.log('  Read back:');
      console.log(`     id                = ${probe.id}`);
      console.log(`     Helpdesk Team     = ${team}`);
      console.log(`     stage after SAVE  = ${openStage}`);
      console.log(`     assigned to       = ${assigned}`);
      console.log(`     stage after move  = ${l2Stage}`);
      const passed = team === TEAM && openStage === 'Open' && assigned === ENGINEER.displayName && l2Stage === 'L2';
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket in L2`,
        passed,
        highlight: ['.o_statusbar_status'],
        lines: [
          `Helpdesk Team: expected ${TEAM} | actual ${team}`,
          `stage after SAVE: expected Open | actual ${openStage}`,
          `assigned to: expected ${ENGINEER.displayName} | actual ${assigned}`,
          `stage after move: expected L2 | actual ${l2Stage}`,
        ],
      }).catch(() => {});
      expect(team, 'the probe ticket is on team Customer Support').toBe(TEAM);
      expect(openStage, 'the probe ticket is created in stage Open').toBe('Open');
      expect(assigned, 'the probe ticket is assigned to the tester').toBe(ENGINEER.displayName);
      expect(l2Stage, 'the probe ticket is in stage L2').toBe('L2');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket in L2, assigned');
    });

    // ================= Steps to reproduce #1 =================
    const stepLabels = [STEP.s1, STEP.s2, STEP.s3];
    for (let i = 0; i < MOVES.length; i++) {
      const move = MOVES[i];
      await test.step(stepLabels[i], async () => {
        console.log(`\n--- ${stepLabels[i]} ---`);
        console.log(`  - Move: ${move.from} > ${move.to}`);
        const stage = await helpdeskPage.moveTicketToStage(move.to);
        stagesAfter.push(stage);
        console.log(`  - Stage bar now shows : ${stage || '(none)'}`);
        await recordChecks(page, testInfo, checks, [
          {
            what: `Step ${i + 1} move accepted - the stage bar shows the new stage`,
            expected: move.to,
            actual: stage || '(none)',
            passed: stage === move.to,
          },
        ], `${TC} - Step ${i + 1} stage bar`, ['.o_statusbar_status']);
      });
    }

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const expectedLast = `Stage: ${MOVES[2].from} ${MOVES[2].to}`;
      const found = await helpdeskPage.waitForChatterContaining(expectedLast, 4, CommonUtils.waitTimes.checkingChatterLog);
      console.log(`  - Last move's tracking line in the chatter : ${found.found ? 'FOUND' : 'NOT FOUND'}`);
      const lines = await helpdeskPage.getStageTrackingLines();
      console.log('  - Tracking lines read (newest first):');
      for (const l of lines.slice(0, 8)) console.log(`       ${l.author} | ${l.line.slice(0, 120)}`);
      const lineFor = (m: { from: string; to: string }) => lines.find((l) => l.line.includes(`Stage: ${m.from} ${m.to}`));
      const perMove = MOVES.map((m) => {
        const hit = lineFor(m);
        return {
          what: `Step 4 chatter line for ${m.from} > ${m.to}`,
          expected: `"Stage: ${m.from} ${m.to}" by ${ENGINEER.displayName} (the arrow is an icon on screen)`,
          actual: hit ? `"${hit.line.slice(0, 90)}" by ${hit.author}` : 'NOT FOUND',
          passed: !!hit && hit.author === ENGINEER.displayName,
        };
      });
      await recordChecks(page, testInfo, checks, perMove, `${TC} - Step 4 chatter tracking lines`, ['.o_thread_message_content, .o_mail_thread']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - stage moves logged');
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
        : `OVERALL: PASS - the three moves are accepted, shown on the stage bar and logged in the chatter with the tester's name`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(stagesAfter, 'the stage bar shows each new stage after its move').toEqual(MOVES.map((m) => m.to));
      for (const m of MOVES) {
        expect(checks.some((c) => c.what.startsWith('Step 4') && c.what.includes(`${m.from} > ${m.to}`) && c.passed), `the chatter logs ${m.from} > ${m.to} by the tester`).toBe(true);
      }
    });
  });
});
