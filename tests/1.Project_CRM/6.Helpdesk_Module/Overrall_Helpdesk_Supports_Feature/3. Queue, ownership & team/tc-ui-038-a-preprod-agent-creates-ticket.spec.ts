import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-038_A - Agent creates a ticket - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-038_A   (side A of the A/B row TC-UI-038; side B = tc-ui-038-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod)
 * Data             : the ticket this case creates (Step 1) is ARCHIVED in afterEach (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "3. Queue, ownership & team"
 *                    = the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0265; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-UI-038_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/3. Queue, ownership & team/
 *                    tc-ui-038-b-support-agent-creates-ticket.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * An L1 agent creates a ticket from All Tickets > Create with a customer e-mail, priority High and himself as assignee; the
 * saved ticket must be in the Customer Support team with that e-mail, priority and assignee.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-038-a-preprod --grep "TC-UI-038_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-ui-038- --grep "TC-UI-038_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 257 = row TC-UI-038 (Area Ticket screens, lists & search,
 *                   Feature "Agent creates a ticket", High, happy, L1 agent, refs E34, UI-080) - 3 steps
 *  Source version : fingerprint c0718cfc5676c186 = sha256 (16 hex) of the row's Preconditions + Steps + A expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - step 1 ("Odoo:") and step 3; step 2 is the FF form (side B)
 *
 *  Pre-conditions (CSV, verbatim: "Agent account; requester address qa.ui1@example.com; test customer 'ACME Test Ltd' if it
 *  exists.")
 *    1. Logged in as an agent - L1 agent Giang Le on pre-production; the L1 tier is read from the employee record
 *    Test data deviation: requester qa.ui1.<runId>@example.com and Subject "QA-UI probe 1 <runId>" (run-unique, so the run
 *    finds and archives exactly its own ticket). The Odoo step names no customer company, so 'ACME Test Ltd' is not used.
 *  Steps to reproduce #1 (CSV, verbatim)
 *    1. Odoo: All Tickets > Create: Subject 'QA-UI probe 1', Customer / Email qa.ui1@example.com, Priority High, Assigned to
 *       yourself; Save.
 *            - Subject        = QA-UI probe 1 <runId>
 *            - Customer       = blank
 *            - Customer Email = qa.ui1.<runId>@example.com
 *            - Priority       = High
 *            - Assigned to    = Giang Le (yourself)
 *            - Helpdesk Team  = as Odoo defaults it (read back in Step 3)
 *    2. FF: All Tickets > Create (new ticket form): ... - N/A on side A (the FF form - TC-UI-038_B)
 *    3. Open the new ticket and read requester, customer, priority, team and assignee.
 *  Verification - A expected (Odoo 12), verbatim
 *    Ticket created in the CS team with the given customer e-mail, priority and assignee.
 *
 * Evidence: Pre-condition 1 end shot; Step 1 end shot; Step 3 verify shot (the form fields read); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-038_A';
const SOURCE_ROW = 'TC-UI-038';
const SOURCE_FINGERPRINT = 'c0718cfc5676c186';
const SKIP_CLEANUP_TICKETS = false; // true keeps the created ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Agent account - pre-production (Odoo 12 EE) as L1 agent Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  s1: "Step 1: Odoo: All Tickets > Create: Subject 'QA-UI probe 1', Customer / Email qa.ui1@example.com, Priority High, Assigned to yourself; Save. (Helpdesk > All Tickets in the navbar; run-unique subject and e-mail)",
  s2: 'Step 2: [N/A on side A - the FF new ticket form belongs to TC-UI-038_B] FF: All Tickets > Create (new ticket form) ...; create.',
  s3: 'Step 3: Open the new ticket and read requester, customer, priority, team and assignee.',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const CS_TEAM = 'Customer Support';

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

test.describe(`${TC} - Agent creates a ticket on Odoo 12 pre-production`, () => {
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
        console.log('  - No ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: ticket kept - #${probe.id ?? '?'} "${probe.subject}"`);
      } else if (!probe.id) {
        cleanupError = `ticket "${probe.subject}" has no captured id - check by hand that it was never saved`;
      } else {
        const archived = await new HelpdeskPage(page).archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Ticket #${probe.id} archived (re-read: inactive)`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: Agent creates a ticket - A: Odoo 12 files it in Customer Support with the given e-mail, priority and assignee`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA-UI probe 1 ${runId}`;
    const email = `qa.ui1.${runId}@example.com`;

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

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  New ticket data:');
      console.log(`     Subject        = ${subject}`);
      console.log('     Customer       = blank');
      console.log(`     Customer Email = ${email}`);
      console.log('     Priority       = High');
      console.log(`     Assigned to    = ${AGENT.displayName} (yourself)`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openAllTicketsFromMenu();
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketWithFieldsInCurrentList({ subject, customerEmail: email, priority: 'High', assignedTo: AGENT.displayName });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Step 1 ticket saved');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  - N/A on side A: the Support service (FF) form is driven by TC-UI-038_B');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await helpdeskPage.openTicketInHelpdeskApp(baseUrl, probe.id as string);
      const requester = await helpdeskPage.getFieldValueByName('partner_email');
      const customer = await helpdeskPage.getFieldValueByName('partner_id');
      const priority = await helpdeskPage.getPriorityLabel();
      const team = await helpdeskPage.getHelpdeskTeam();
      const assignee = await helpdeskPage.getAssignedTo();
      console.log('  Read on the form:');
      console.log(`     Customer Email (requester) = ${requester}`);
      console.log(`     Customer                   = ${customer || '(empty)'}`);
      console.log(`     Priority                   = ${priority}`);
      console.log(`     Helpdesk Team              = ${team}`);
      console.log(`     Assigned to                = ${assignee}`);
      console.log('  Observation (not scored) - Customer: the Odoo step gives an e-mail only; the partner Odoo links is printed above');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 team', expected: `${CS_TEAM} (the CS team)`, actual: team || '(empty)', passed: team === CS_TEAM },
        { what: 'Step 3 requester (Customer Email)', expected: email, actual: requester || '(empty)', passed: requester === email },
        { what: 'Step 3 priority', expected: 'High', actual: priority, passed: priority === 'High' },
        { what: 'Step 3 assignee', expected: `${AGENT.displayName} (the agent who created it)`, actual: assignee || '(empty)', passed: assignee === AGENT.displayName },
      ], `${TC} - Step 3 ticket fields`, ['.o_form_view .o_form_sheet']);
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
        : 'OVERALL: PASS - the ticket is created in the CS team with the given customer e-mail, priority High and the agent as assignee');
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'the created ticket carries the team, e-mail, priority and assignee').toEqual([]);
    });
  });
});
