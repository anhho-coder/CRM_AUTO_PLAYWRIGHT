import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-CUST-051_A - Schedule meeting requires an assigned engineer - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-CUST-051_A   (side B = tc-cust-051-b-support-meeting-needs-engineer.spec.ts)
 * Automation-Type  : new            Automation-Date : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859)
 * Host / Run as    : pre-production Odoo 12 / L2 engineer Nam Pham (users.support_l2_manager_nam, Support Team = l2 asserted)
 * Data             : one unassigned probe ticket per run, ARCHIVED in afterEach; the activity dialog is discarded
 * Folder           : "CRM context & adjacent workflows" = Confluence 231246777 spec area of IS-CRM-FUNC-0289 (author's mapping)
 *
 * Summary: on an unassigned ticket, Schedule activity > Schedule Support Meeting > Save & open calendar must be refused with
 * 'Please assign engineer to ticket', and no activity or event may be created.
 * Command to run: npx playwright test tc-cust-051-a-preprod --grep "TC-CUST-051_A:" --project=chromium-headless
 *
 *  Source manual TC : Helpdesk-AB-Test-Cases - Pre-pro.csv, record 381 = row TC-CUST-051 (Customers, meetings & integrations,
 *                     "Schedule meeting requires an assigned engineer", High, negative, L2 engineer, refs E25, E25-T1,
 *                     IN-009, AU-031) - 3 steps
 *  Source version   : fingerprint c74608702688056d of Preconditions + Steps + A expected + Test data (beforeEach)
 *  Pre-conditions (CSV, verbatim: "A probe ticket with no assignee. No booking happens in this case.")
 *    1. Logged in as L2 engineer Nam Pham on pre-production
 *    2. One probe ticket with no assignee - CREATED by this run (team TICKETS list > CREATE, Subject = QA CUST probe
 *       TC-CUST-051_A <runId>, SAVE; Assigned to empty asserted)
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Open the probe ticket.
 *    2. Start a support meeting: A: 'Schedule activity' > 'Schedule Support Meeting' > 'Save & open calendar'
 *    3. Read the message.
 *  Verification - A expected (Odoo 12), verbatim
 *    'Please assign engineer to ticket'; no activity or event is created.
 *
 * Evidence: Pre-condition 1 + 2 end shots; Step 1 end shot; Step 3 verify shots (the warning dialog, open; the activity /
 * event counts); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-CUST-051_A';
const SOURCE_ROW = 'TC-CUST-051';
const SOURCE_FINGERPRINT = 'c74608702688056d';
const SKIP_CLEANUP_TICKETS = false;

const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] Support Team = l2',
  pre2: 'Pre-condition 2: A probe ticket with no assignee - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA CUST probe TC-CUST-051_A <runId>, SAVE',
  s1: 'Step 1: Open the probe ticket.',
  s2: "Step 2: Start a support meeting: A: 'Schedule activity' > 'Schedule Support Meeting' > 'Save & open calendar' (chatter Schedule activity; Activity Type = Schedule Support Meeting; Meeting Type = Regular meeting and the activity Assignee = the tester - both required, without them SAVE does nothing; the visible SAVE & OPEN CALENDAR)",
  s3: 'Step 3: Read the message. ([INTERNAL check, Call API] the activities and events of the ticket are counted after)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const MESSAGE = 'Please assign engineer to ticket';

type Check = { what: string; expected: string; actual: string; passed: boolean };
function bannerLines(c: Check, width = 96): string[] {
  const wrap = (head: string, text: string): string[] => {
    const pad = ' '.repeat(head.length); const out: string[] = []; let cur = head;
    for (const word of text.split(' ')) { if (cur.length + word.length > width && cur.trim().length > head.trim().length) { out.push(cur.trimEnd()); cur = pad; } cur += `${word} `; }
    out.push(cur.trimEnd()); return out;
  };
  return [...wrap('', `${c.what}:`), ...wrap('   Expected : ', c.expected), ...wrap('   Actual   : ', c.actual)];
}
/** Record a step's checks and take their verify-point evidence shot BEFORE any expect() (REQUIREMENT #3b). */
async function recordChecks(page: Page, testInfo: TestInfo, all: Check[], stepChecks: Check[], name: string, highlight: string[] = [], corner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'bottom-right'): Promise<void> {
  all.push(...stepChecks);
  for (const c of stepChecks) console.log(`  - ${c.what} : ${c.actual} (${c.passed ? 'PASS' : 'FAIL'})`);
  await CommonUtils.captureVerifyEvidence(page, testInfo, { name, passed: stepChecks.every((c) => c.passed), highlight, lines: stepChecks.flatMap((c) => bannerLines(c)), corner }).catch(() => {});
}

test.describe(`${TC} - Schedule meeting requires an engineer on Odoo 12 pre-production`, () => {
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
      const hd = new HelpdeskPage(page);
      await hd.discardActivityDialog().catch(() => {});
      if (!probe.subject) console.log('  - No probe ticket was created by this run - nothing to clean up');
      else if (SKIP_CLEANUP_TICKETS) console.log(`  - SKIP_CLEANUP_TICKETS = true: kept #${probe.id ?? '?'}`);
      else if (!probe.id) cleanupError = `probe "${probe.subject}" has no captured id - check by hand`;
      else if (!(await hd.archiveTicketByIdOverRpc(probe.id, probe.subject))) cleanupError = `probe ticket #${probe.id} still reads active`;
      else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
    } catch (e) { cleanupError = e instanceof Error ? e.message : String(e); }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Schedule meeting requires an assigned engineer - A: Odoo 12 refuses with 'Please assign engineer to ticket' and creates nothing`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA CUST probe ${TC} ${runId}`;
    let message = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---\n  - Login : ${ENGINEER.username} on ${baseUrl}`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ENGINEER.username, ENGINEER.password, CommonUtils.waitTimes.pageLoad);
      await loginPage.dismissLocationPermissionDialog();
      const me = await helpdeskPage.getMyEmployeeSupportTeam();
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Nam Pham');
      expect(me.supportTeam, 'the signed-in account is an L2 engineer').toBe('l2');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---\n     Subject     = ${subject}\n     Assigned to = blank`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview('Customer Support');
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const assigned = await helpdeskPage.getAssignedTo();
      console.log(`  Read back #${probe.id}: Assigned to "${assigned}"`);
      expect(assigned, 'the probe ticket has no assignee').toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - unassigned probe ticket');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, probe.id as string);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 probe ticket opened');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      message = await helpdeskPage.trySaveSupportMeetingAndOpenCalendar(ENGINEER.displayName);
      console.log(`  - Shown after SAVE & OPEN CALENDAR: "${message || '(nothing)'}" | url ${page.url()}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 the message', expected: `"${MESSAGE}"`, actual: message ? `"${message.slice(0, 160)}"` : '(no message)', passed: message.includes(MESSAGE) },
      ], `${TC} - Step 3 warning`, [HelpdeskPage.MESSAGE], 'top-left');
      await helpdeskPage.discardActivityDialog();
      const made = await helpdeskPage.countActivitiesAndEventsOverRpc(probe.id as string);
      console.log(`  [INTERNAL check, Call API] activities ${made.activities} | calendar events ${made.events} on #${probe.id}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 no activity or event is created', expected: '0 activities and 0 calendar events on the ticket', actual: `${made.activities} activities, ${made.events} events`, passed: made.activities === 0 && made.events === 0 },
      ], `${TC} - Step 3 nothing created`, ['.o_mail_thread, .o_chatter']);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---\n==================== VERIFY ====================`);
      checks.forEach((c, i) => console.log(`  Verify #${i + 1} - ${c.what}:\n     Expected : ${c.expected}\n     Actual   : ${c.actual}\n     Result   : ${c.passed ? 'PASS' : 'FAIL'}`));
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed);
      console.log(failed.length ? `OVERALL: FAIL - ${failed.map((c) => c.what).join('; ')}` : `OVERALL: PASS - '${MESSAGE}' and nothing created`);
      for (const c of checks) expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      expect(failed.map((c) => c.what), 'the meeting needs an engineer').toEqual([]);
    });
  });
});
