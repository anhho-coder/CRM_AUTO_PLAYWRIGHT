import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-003_A - Assignment does not change the stage - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-003_A   (side A of the A/B row TC-FLOW-003; side B = tc-flow-003-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "3. Queue, ownership & team"
 *                    = the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0266; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-FLOW-003_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/3. Queue, ownership & team/
 *                    tc-flow-003-b-support-assignment-keeps-stage.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * An L1 agent assigns an unassigned probe ticket in stage Open to himself. The stage must stay Open after the save and
 * after a page reload - Odoo never moves a CS ticket on assignment.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-003-a-preprod --grep "TC-FLOW-003_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-003- --grep "TC-FLOW-003_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 92 = row TC-FLOW-003 (Area Ticket lifecycle & workflow,
 *                   Feature "Assignment does not change the stage", High, regression, L1 agent, refs E10, E14, LC-033,
 *                   LC-061) - 3 steps
 *  Source version : fingerprint c58d4d7c02445daa = sha256 (16 hex) of the row's Preconditions + Steps + A expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of step 2
 *
 *  Pre-conditions (CSV, verbatim: "Unassigned probe ticket in stage Open in both systems.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. One unassigned probe ticket in stage Open - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-003_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open, Assigned to empty (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd), subject 'QA FLOW probe <case
 *       id>'): own unique subject, no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim; the "FF:" half belongs to side B)
 *    1. Open the probe ticket.
 *    2. Set Assigned to = the tester (Odoo: 'Assigned to' field then Save).
 *    3. Read the stage / Status after saving and after a page reload.
 *  Verification - A expected (Odoo 12), verbatim
 *    Stage stays Open; Odoo never moves a CS ticket on assignment (team 1 is manual).
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 end shot; Step 2 verify shot (Assigned to);
 * Step 3 verify shots (the stage bar after the save, after the reload); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-003_A';
const SOURCE_ROW = 'TC-FLOW-003';
const SOURCE_FINGERPRINT = 'c58d4d7c02445daa';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: Unassigned probe ticket in stage Open - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-003_A <runId>, SAVE',
  s1: 'Step 1: Open the probe ticket (Odoo: the ticket form, opened by its id)',
  s2: "Step 2: Set Assigned to = the tester (Odoo: 'Assigned to' field then Save)",
  s3: 'Step 3: Read the stage / Status after saving and after a page reload.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';

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

test.describe(`${TC} - Assignment does not change the stage on Odoo 12 pre-production`, () => {
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
        // [INTERNAL, Call API] archive BY ID: the ticket must carry this run's subject.
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

  test(`${TC}: Assignment does not change the stage - A: Odoo 12 keeps the ticket in Open after it is assigned`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production (${baseUrl})`);
      console.log(`  - Login : ${AGENT.username} (${AGENT.displayName})`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(AGENT.username, AGENT.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Giang:');
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
      const stage = await helpdeskPage.getCurrentStage();
      const assigned = await helpdeskPage.getAssignedTo();
      console.log(`  Read back #${probe.id}: stage = ${stage} | Assigned to = "${assigned}"`);
      expect(stage, 'the probe ticket is in stage Open').toBe('Open');
      expect(assigned, 'the probe ticket is unassigned').toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - unassigned probe ticket in Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, probe.id as string);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 probe ticket opened');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdeskPage.clickEditTicket();
      await helpdeskPage.setAssignedTo(AGENT.displayName);
      const saved = await helpdeskPage.clickSaveTicket();
      const assigned = await helpdeskPage.getAssignedTo();
      console.log(`  - Saved : ${saved} | Assigned to = "${assigned}"`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the ticket is saved assigned to the tester', expected: `Assigned to = ${AGENT.displayName}, the form back in read mode`, actual: `"${assigned}", saved ${saved}`, passed: saved && assigned === AGENT.displayName },
      ], `${TC} - Step 2 Assigned to`, ['.o_form_view [name="user_id"]']);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const afterSave = await helpdeskPage.getCurrentStage();
      console.log(`  - Stage after saving : ${afterSave}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the stage after saving', expected: 'Open (a different stage is a FAIL: the assignment moved the ticket)', actual: afterSave, passed: afterSave === 'Open' },
      ], `${TC} - Step 3 stage after saving`, ['.o_statusbar_status']);
      await helpdeskPage.reloadTicket();
      const afterReload = await helpdeskPage.getCurrentStage();
      const stored = await helpdeskPage.readStageOverRpc(probe.id as string);
      console.log(`  - Stage after reload : ${afterReload} (stored: ${stored})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the stage after a page reload', expected: 'Open (as stored)', actual: `${afterReload} (stored ${stored})`, passed: afterReload === 'Open' && stored === 'Open' },
      ], `${TC} - Step 3 stage after reload`, ['.o_statusbar_status']);
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
        : 'OVERALL: PASS - the ticket is assigned to the tester and stays in stage Open after the save and after a reload');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the assignment leaves the stage at Open').toEqual([]);
    });
  });
});
