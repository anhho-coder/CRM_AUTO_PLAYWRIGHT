import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-SEC-019_A - No automatic assignment; agents claim tickets - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-SEC-019_A   (side A of the A/B row TC-SEC-019; side B = tc-sec-019-b-support-...)
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
 * Pair             : TC-SEC-019_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/3. Queue, ownership & team/
 *                    tc-sec-019-b-support-no-auto-assignment-claim.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * A new probe ticket with no assignee is left for 5 minutes and reopened - it must still be unassigned (team 1 assigns
 * manually); then "Assign To Me" must make the agent its assignee.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-sec-019-a-preprod --grep "TC-SEC-019_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-sec-019- --grep "TC-SEC-019_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 525 = row TC-SEC-019 (Area Login, roles, security & data,
 *                   Feature "No automatic assignment; agents claim tickets", High, regression, L1 agent, refs E04, E14,
 *                   SE-011, SE-033, DM-044) - 2 steps
 *  Source version : fingerprint 3537b27be8d204fa = sha256 (16 hex) of the row's Preconditions + Steps + A expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12)
 *
 *  Pre-conditions (CSV, verbatim: "Create a new probe ticket (agent create form, raised by customer@example.com) with no
 *  assignee.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. A new probe ticket with no assignee - CREATED by this run on the agent create form:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA SEC probe TC-SEC-019_A <runId>
 *            - Customer Email = customer.<runId>@example.com   (CSV "customer@example.com", made unique per run)
 *            - Assigned to    = blank
 *         SAVE -> Assigned to empty (asserted); [INTERNAL check, Call API] team 1 assign method = manual (printed)
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Wait 5 minutes and reopen the ticket.
 *    2. Click 'Assign to me' (Odoo: on the ticket).
 *  Verification - A expected (Odoo 12), verbatim
 *    The new ticket stays unassigned (team 1 assign method = manual) until someone claims it; 'Assign to me' makes you the
 *    assignee.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (Assigned to after 5 minutes); Step 2
 * verify shot (Assigned to after Assign To Me); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-SEC-019_A';
const SOURCE_ROW = 'TC-SEC-019';
const SOURCE_FINGERPRINT = '3537b27be8d204fa';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: Create a new probe ticket (agent create form, raised by customer@example.com) with no assignee - Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA SEC probe TC-SEC-019_A <runId>, Customer Email = customer.<runId>@example.com, SAVE',
  s1: 'Step 1: Wait 5 minutes and reopen the ticket.',
  s2: "Step 2: Click 'Assign to me' (Odoo: on the ticket - the header button ASSIGN TO ME)",
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const CS_TEAM_ID = 1;

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

test.describe(`${TC} - No automatic assignment on Odoo 12 pre-production`, () => {
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

  test(`${TC}: No automatic assignment; agents claim tickets - A: Odoo 12 leaves a new ticket unassigned until Assign To Me`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA SEC probe ${TC} ${runId}`;
    const email = `customer.${runId}@example.com`;

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
      console.log(`  [INTERNAL check, Call API] support_team = ${me.supportTeam || '(empty)'}   ('l1' = Support L1)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent (employee Support Team = Support L1)').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log('  Probe ticket data:');
      console.log(`     Subject        = ${subject}`);
      console.log(`     Customer Email = ${email}`);
      console.log('     Assigned to    = blank');
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketWithFieldsInCurrentList({ subject, customerEmail: email });
      const assigned = await helpdeskPage.getAssignedTo();
      const method = (await helpdeskPage.readTeamAssignMethodOverRpc(CS_TEAM_ID));
      console.log(`  Read back #${probe.id}: Assigned to = "${assigned}" | [INTERNAL check, Call API] team ${CS_TEAM_ID} assign method = ${method}`);
      expect(assigned, 'the new probe ticket has no assignee').toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - new probe ticket without assignee');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Waiting 5 minutes from ${new Date().toISOString()} ...`);
      await page.waitForTimeout(CommonUtils.waitTimes.helpdeskNoAutoAssignWait);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, probe.id as string);
      const shown = await helpdeskPage.getAssignedTo();
      const stored = await helpdeskPage.readTicketOverRpc(probe.id as string, ['user_id']);
      console.log(`  - Reopened at ${new Date().toISOString()}: Assigned to "${shown}" | stored ${JSON.stringify(stored.user_id)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 after 5 minutes the ticket is still unassigned', expected: 'Assigned to empty (form and stored) - a name here means an automatic assignment ran', actual: `form "${shown || '(empty)'}", stored ${JSON.stringify(stored.user_id)}`, passed: shown === '' && !stored.user_id },
      ], `${TC} - Step 1 unassigned after 5 minutes`, ['.o_form_view [name="user_id"]']);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await helpdeskPage.clickAssignToMe();
      const shown = await helpdeskPage.getAssignedTo();
      const stored = await helpdeskPage.readTicketOverRpc(probe.id as string, ['user_id']);
      const storedName = Array.isArray(stored.user_id) ? String(stored.user_id[1]) : '';
      console.log(`  - Assigned to "${shown}" | stored "${storedName}"`);
      await recordChecks(page, testInfo, checks, [
        { what: "Step 2 'Assign to me' makes the agent the assignee", expected: AGENT.displayName, actual: `form "${shown || '(empty)'}", stored "${storedName || '(none)'}"`, passed: shown === AGENT.displayName && storedName === AGENT.displayName },
      ], `${TC} - Step 2 Assign To Me`, ['.o_form_view [name="user_id"]']);
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
        : 'OVERALL: PASS - the new ticket stays unassigned for 5 minutes and Assign To Me makes the agent its assignee');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'no automatic assignment; the agent claims the ticket').toEqual([]);
    });
  });
});
