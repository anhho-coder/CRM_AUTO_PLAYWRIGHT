import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-039_A - Close gate: some fields missing - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-039_A   (side A of the A/B row TC-FLOW-039; side B = tc-flow-039-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = l2, asserted in Pre-condition 1;
 *                    users.support_l2_manager_nam)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0380 (the mandatory closing set); the TC-to-requirement
 *                    mapping is the automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-039_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/4. Lifecycle & escalation/
 *                    tc-flow-039-b-support-close-gate-some-fields-missing.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L2 engineer, take a probe ticket in Resolving with an assignee and every field filled except Description and
 * Root cause, set its stage to Closed; the refusal must list only Description and Root cause.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-039-a-preprod --grep "TC-FLOW-039_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-039- --grep "TC-FLOW-039_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 128 = row TC-FLOW-039 (Area Ticket lifecycle & workflow,
 *                   Feature "Close gate: some fields missing", High, negative, L2 engineer, refs E13, LC-018) - 2 steps
 *  Source version : fingerprint 0e730acfeec7f0cb = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of step 1
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in Resolving with an assignee and everything filled except Description and Root cause.")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. One probe ticket in stage Resolving, assigned to Nam Pham, with every field filled except Description and Root cause -
 *       CREATED by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE (Subject = QA FLOW probe
 *       TC-FLOW-039_A <runId>), Assign To Me, stage bar > Resolving, then:
 *         Severity Level = Severity 3          Bug Report = No          FCR = Yes          Wrongly escalated to L2 = No
 *         Ticket Type = Question               Product line = AI        Area = Cloud Compute   Sub Area = AWS
 *         Issue Type = AD Integration          Resolution = <text>      Description = blank    Root cause = blank
 *       SAVE. The values are chosen by the automation author - the CSV names the fields, not the values.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Set the stage to Closed.
 *    2. Read the error.
 *  Verification - A expected (Odoo 12), verbatim
 *    The error lists only Description and Root cause.
 *
 *  Environment traps (also in the step text):
 *   - The close gate is raised when the stage moves to Closed; the refusal is a warning dialog drawn a few seconds after the click.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1 and 2 (outlined
 * green = PASS, red = FAIL); one end-of-section shot after Step 2; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-039_A';
const SOURCE_ROW = 'TC-FLOW-039';
const SOURCE_FINGERPRINT = '0e730acfeec7f0cb';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = l2',
  pre2: 'Pre-condition 2: One probe ticket in stage Resolving, assigned to Nam Pham, every field filled except Description and Root cause - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-039_A <runId>, Assign To Me, stage bar > Resolving, the fields filled, SAVE',
  s1: 'Step 1: Odoo: Set the stage to Closed.',
  s2: 'Step 2: Read the error.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const TEAM = 'Customer Support';
const STAGE_RESOLVING = 'Resolving';
const STAGE_CLOSED = 'Closed';
const INTRO = 'Please fill in next to close the ticket:';
/** The CSV "A expected" list. */
const EXPECTED_ITEMS = ['Description', 'Root cause'];

/** The values this run enters (the CSV names the fields, not the values). */
const VALUES = {
  severity: 'Severity 3', bugReport: 'No', fcr: 'Yes', wronglyEscalated: 'No',
  ticketType: 'Question', productLine: 'AI', area: 'Cloud Compute', subArea: 'AWS', issueType: 'AD Integration',
  resolution: 'Explore Resolution TC-FLOW-039_A',
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

test.describe(`${TC} - Close gate with some fields missing on Odoo 12 pre-production`, () => {
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
        const helpdeskPage = new HelpdeskPage(page);
        const archived = await helpdeskPage.archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      } else {
        console.log('  - The create never saved - no probe ticket exists');
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Close gate with some fields missing (Description and Root cause) - A: Odoo 12 refusal lists only those two`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;

    let dialogText = '';
    let items: string[] = [];

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
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Nam Pham:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l2' = Support L2)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer (employee Support Team = Support L2)').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      await helpdeskPage.clickAssignToMe();
      const stage = await helpdeskPage.moveTicketToStage(STAGE_RESOLVING);
      console.log('  Fields filled (all except Description and Root cause):');
      await helpdeskPage.clickEditTicket();
      await helpdeskPage.setFormSelectByName('x_studio_severity_level', VALUES.severity);
      await helpdeskPage.setFormSelectByName('bug_report', VALUES.bugReport);
      await helpdeskPage.setFormSelectByName('fcr', VALUES.fcr);
      await helpdeskPage.setFormSelectByName('wrongly_escalated_to_l2', VALUES.wronglyEscalated);
      await helpdeskPage.setFormSelectByName('classification_ticket_type', VALUES.ticketType);
      await helpdeskPage.setFormMany2oneByName('product_line_id', 'AI', VALUES.productLine);
      await helpdeskPage.setFormMany2oneByName('classification_area_id', 'Cloud', VALUES.area);
      await helpdeskPage.setFormMany2oneByName('classification_sub_area_id', 'A', VALUES.subArea);
      await helpdeskPage.setFormSelectByName('classification_issue_type', VALUES.issueType);
      await helpdeskPage.setFormTextAreaByName('classification_resolution', VALUES.resolution);
      const savedOk = await helpdeskPage.clickSaveTicket();
      const assignee = await helpdeskPage.getAssignedTo();
      console.log('  Read back:');
      console.log(`     id          = ${probe.id}`);
      console.log(`     stage       = ${stage}`);
      console.log(`     Assigned to = ${assignee || '(empty)'}`);
      console.log(`     saved       = ${savedOk}`);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ready`,
        passed: stage === STAGE_RESOLVING && savedOk && assignee.includes('Nam Pham'),
        highlight: ['.o_statusbar_status'],
        lines: [`stage: expected ${STAGE_RESOLVING} | actual ${stage}`, `Assigned to: expected Nam Pham | actual ${assignee || '(empty)'}`, `saved: expected true | actual ${savedOk}`],
      }).catch(() => {});
      expect(stage, 'the probe ticket is in stage Resolving').toBe(STAGE_RESOLVING);
      expect(assignee, 'the probe ticket is assigned to Nam Pham').toContain('Nam Pham');
      expect(savedOk, 'the fields are saved').toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket Resolving, fields filled');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      dialogText = await helpdeskPage.clickStageExpectingRefusal(STAGE_CLOSED);
      console.log(`  - Dialog text (verbatim): ${dialogText || '(none)'}`);
      const refused = dialogText.includes(INTRO);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the close gate refused the move',
          expected: `a warning dialog carrying "${INTRO}" (no dialog = the stage moved without the gate)`,
          actual: refused ? 'refusal dialog shown' : dialogText ? `other dialog: ${dialogText.slice(0, 120)}` : 'NO dialog',
          passed: refused,
        },
      ], `${TC} - Step 1 close refused`, ['.modal.show .modal-content'], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      items = gateItemNames(dialogText);
      console.log(`  - Items listed (${items.length}): ${items.join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'The error lists only Description and Root cause',
          expected: `${EXPECTED_ITEMS.length} items: ${EXPECTED_ITEMS.join(' | ')}`,
          actual: `${items.length} items: ${items.join(' | ') || '(none)'}`,
          passed: JSON.stringify(items) === JSON.stringify(EXPECTED_ITEMS),
        },
      ], `${TC} - Step 2 error list`, ['.modal.show .modal-content'], 'bottom-right');
      // The list lives in the dialog: shot above while it is open, closed only now.
      await helpdeskPage.closeShownDialog();
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
        : 'OVERALL: PASS - the refusal lists only Description and Root cause');

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(items, 'the error lists only Description and Root cause').toEqual(EXPECTED_ITEMS);
    });
  });
});
