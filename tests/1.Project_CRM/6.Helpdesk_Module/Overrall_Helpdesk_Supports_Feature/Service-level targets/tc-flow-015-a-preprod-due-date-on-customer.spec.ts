import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-015_A - Due date when moved to On Customer - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-015_A   (side A of the A/B row TC-FLOW-015; side B = tc-flow-015-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L2 engineer - Nam Pham (nam.pham@nakivo.com; employee Support Team = l2, asserted in Pre-condition 1;
 *                    users.support_l2_manager_nam)
 * Data             : two probe tickets created per run (Pre-condition 3) and ARCHIVED in afterEach - Nam holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Service-level targets" =
 *                    the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0276; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-FLOW-015_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Service-level targets/
 *                    tc-flow-015-b-support-due-date-on-customer.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * Two probe tickets in Open (Low and Urgent; Standard support) are moved to On Customer by an L2 engineer. Both Due Dates
 * must equal their move time + 24 h, whatever the priority.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-015-a-preprod --grep "TC-FLOW-015_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-flow-015- --grep "TC-FLOW-015_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 104 = row TC-FLOW-015 (Area Ticket lifecycle & workflow,
 *                   Feature "Due date when moved to On Customer", High, happy, L2 engineer, refs E11, LC-013, AU-003)
 *                   - 2 steps
 *  Source version : fingerprint 84a0207b04a78dec = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12)
 *
 *  Pre-conditions (CSV, verbatim: "Two probe tickets in Open, priorities Low and Urgent; Standard support; weekday run.")
 *    1. Logged in as an L2 engineer - here pre-production; the L2 tier is read from the employee record
 *    2. Weekday run (Monday-Friday, Asia/Ho_Chi_Minh, the account's time zone) - on Saturday or Sunday the case is SKIPPED
 *    3. Two probe tickets in stage Open - CREATED by this run, one per priority:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-015_A <priority> <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = Low / Urgent (EDIT > star > SAVE; Low = no star)
 *            - Description    = blank
 *         Read back on each: stage Open, priority, Support Type = Standard (asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com (ACME Test Ltd), subject 'QA FLOW probe <case
 *       id>'): this run uses its own unique subjects and no customer, per the batch data rules; with no customer Odoo files
 *       the ticket as Support Type Standard (measured 2026-10-28), which is what the pre-condition asks for.
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Move each ticket to On Customer.
 *    2. Read the Due Date of each.
 *  Verification - A expected (Odoo 12), verbatim
 *    Both: move time + 24 h, whatever the priority.
 *
 *  How "move time" is measured: the UTC clock is read right before and right after each move (Step 1); the Due Date must
 *  fall inside [before + N h - 60 s, after + N h + 60 s]. The form shows the Due Date in the browser's local time
 *  (MM/DD/YYYY HH:mm:ss); it is converted to UTC with the same machine clock. The stored UTC value is printed beside it.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 3 end shot; Step 1 end shot; one verify-point shot per ticket in Step 2
 * (the Due Date field outlined); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-015_A';
const SOURCE_ROW = 'TC-FLOW-015';
const SOURCE_FINGERPRINT = '84a0207b04a78dec';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe tickets for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L2 engineer - pre-production (Odoo 12 EE) as Nam Pham; [INTERNAL check, Call API] the employee record of this account reads Support Team = l2',
  pre2: 'Pre-condition 2: Weekday run - today (Asia/Ho_Chi_Minh) is a Monday to Friday',
  pre3: 'Pre-condition 3: Two probe tickets in Open, priorities Low and Urgent; Standard support - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-015_A <priority> <runId>, SAVE; EDIT > priority star > SAVE',
  s1: 'Step 1: Move each ticket to On Customer (Odoo: click On Customer on the stage bar of each ticket; the UTC clock is read right before and right after each move)',
  s2: "Step 2: Read the Due Date of each (Odoo: 'Due Date' on the form)",
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l2_manager_nam;
const TEAM = 'Customer Support';
/** Priority -> hours the CSV expects between the move to On Customer and the Due Date (24 h whatever the priority). */
const PROBES: Array<{ priority: string; hours: number }> = [
  { priority: 'Low', hours: 24 },
  { priority: 'Urgent', hours: 24 },
];
const TOLERANCE_MS = 60 * 1000;

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

/** "10/29/2026 06:51:30" (the form's local display) -> epoch ms on this machine's clock; NaN when it does not parse. */
function parseOdooLocal(text: string): number {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0)).getTime();
}

/** Weekday of `now` in Asia/Ho_Chi_Minh (0 = Sunday). */
function weekdayInVietnam(now: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

test.describe(`${TC} - Due date when moved to On Customer on Odoo 12 pre-production`, () => {
  /** What this run created - read by afterEach. */
  let probes: Array<{ id?: string; subject: string }> = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probes = [];
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const problems: string[] = [];
    if (!probes.length) console.log('  - No probe ticket was created by this run - nothing to clean up');
    for (const p of probes) {
      try {
        if (SKIP_CLEANUP_TICKETS) {
          console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - #${p.id ?? '?'} "${p.subject}"`);
        } else if (!p.id) {
          problems.push(`probe "${p.subject}" has no captured id - check by hand that it was never saved`);
        } else {
          // [INTERNAL, Call API] archive BY ID (Nam holds no unlink): the ticket must carry this run's subject.
          const archived = await new HelpdeskPage(page).archiveTicketByIdOverRpc(p.id, p.subject);
          if (!archived) problems.push(`probe ticket #${p.id} "${p.subject}" still reads active - archive it by hand`);
          else console.log(`  - Probe ticket #${p.id} archived (re-read: inactive)`);
        }
      } catch (e) {
        problems.push(e instanceof Error ? e.message : String(e));
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (problems.length) throw new Error(`afterEach cleanup: ${problems.join(' | ')}`);
  });

  test(`${TC}: Due date when moved to On Customer - A: Odoo 12 sets move time + 24 h for Low and for Urgent`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const moves: Array<{ before: number; after: number; stage: string }> = [];

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
      const day = weekdayInVietnam(new Date());
      console.log(`  - Today (Asia/Ho_Chi_Minh) : ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`);
      test.skip(day < 1 || day > 5, 'CSV pre-condition: weekday run - today is Saturday or Sunday');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      const readBack: string[] = [];
      for (const [i, p] of PROBES.entries()) {
        const subject = `QA FLOW probe ${TC} ${p.priority} ${runId}`;
        console.log(`  Probe ticket ${i + 1} data:`);
        console.log(`     Subject        = ${subject}`);
        console.log(`     Helpdesk Team  = ${TEAM} (defaulted by the team's TICKETS list)`);
        console.log('     Customer       = blank');
        console.log('     Customer Email = blank');
        console.log('     Assigned to    = blank');
        console.log(`     Priority       = ${p.priority}`);
        console.log('     Description    = blank');
        const probe: { id?: string; subject: string } = { subject };
        probes.push(probe);
        if (i > 0) await helpdeskPage.goBackToBreadcrumb('Tickets');
        probe.id = await helpdeskPage.createTicketInCurrentList(subject);
        await helpdeskPage.setPriorityAndSave(p.priority);
        const stage = await helpdeskPage.getCurrentStage();
        const priority = await helpdeskPage.getPriorityLabel();
        const supportType = await helpdeskPage.getFieldValueByName('support_type');
        console.log(`  Read back #${probe.id}: stage = ${stage} | priority = ${priority} | Support Type = ${supportType}`);
        readBack.push(`#${probe.id}: ${stage} / ${priority} / ${supportType}`);
        expect(stage, `probe ${p.priority} is in stage Open`).toBe('Open');
        expect(priority, `probe ${p.priority} carries priority ${p.priority}`).toBe(p.priority);
        expect(supportType, `probe ${p.priority} has customer support type Standard`).toBe('Standard');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - two probe tickets in Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      for (const [i, p] of probes.entries()) {
        await helpdeskPage.openTicketInHelpdeskApp(baseUrl, p.id as string);
        const before = Date.now();
        const stage = await helpdeskPage.moveTicketToStage('On Customer');
        const after = Date.now();
        moves.push({ before, after, stage });
        console.log(`  - #${p.id} (${PROBES[i].priority}) moved to ${stage} | before ${new Date(before).toISOString()} | after ${new Date(after).toISOString()}`);
        expect(stage, `the ${PROBES[i].priority} probe reached stage On Customer`).toBe('On Customer');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 two tickets in On Customer');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      for (const [i, p] of probes.entries()) {
        await helpdeskPage.openTicketInHelpdeskApp(baseUrl, p.id as string);
        const shown = await helpdeskPage.getFieldValueByName('overdue');
        const stored = await helpdeskPage.readTicketOverRpc(p.id as string, ['overdue']);
        const dueMs = parseOdooLocal(shown);
        const { hours, priority } = PROBES[i];
        const lo = moves[i].before + hours * 3600_000 - TOLERANCE_MS;
        const hi = moves[i].after + hours * 3600_000 + TOLERANCE_MS;
        const offsetH = Number.isNaN(dueMs) ? NaN : (dueMs - moves[i].before) / 3600_000;
        console.log(`  - #${p.id} ${priority}: form Due Date "${shown}" | stored (UTC) ${String(stored.overdue)} | = move + ${Number.isNaN(offsetH) ? '?' : offsetH.toFixed(3)} h`);
        await recordChecks(page, testInfo, checks, [
          {
            what: `Step 2 ${priority} ticket #${p.id} - Due Date = move time + ${hours} h`,
            expected: `between ${new Date(lo).toISOString()} and ${new Date(hi).toISOString()} (UTC) - an empty Due Date or one off by an hour or more is a FAIL`,
            actual: shown ? `"${shown}" local = ${Number.isNaN(dueMs) ? 'unparsable' : new Date(dueMs).toISOString()} (move + ${Number.isNaN(offsetH) ? '?' : offsetH.toFixed(2)} h)` : '(empty)',
            passed: !Number.isNaN(dueMs) && dueMs >= lo && dueMs <= hi,
          },
        ], `${TC} - Step 2 Due Date ${priority}`, ['[name="overdue"]']);
      }
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
        : 'OVERALL: PASS - both Due Dates are move time + 24 h, whatever the priority');
      expect(checks.length, 'one Due Date check per probe ticket').toBe(PROBES.length);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'every Due Date equals its move time + 24 h').toEqual([]);
    });
  });
});
