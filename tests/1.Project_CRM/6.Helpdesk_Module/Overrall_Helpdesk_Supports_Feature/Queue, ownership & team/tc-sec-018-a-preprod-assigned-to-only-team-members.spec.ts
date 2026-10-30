import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-SEC-018_A - 'Assigned to' offers only Customer Support team members - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-SEC-018_A   (side A of the A/B row TC-SEC-018; side B = tc-sec-018-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-28
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Queue, ownership & team"
 *                    = the Spec area (h2) of Confluence page 231246777 whose requirement this case verifies -
 *                    IS-CRM-FUNC-0267; the TC-to-requirement mapping is the automation author's, the CSV carries no link
 * Pair             : TC-SEC-018_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Queue, ownership & team/
 *                    tc-sec-018-b-support-assigned-to-only-team-members.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * On a Customer Support probe ticket, the "Assigned to" picker is searched for a user outside the team (Thomas Semerich - a
 * Helpdesk user who is not a Customer Support member) and an assignment to him is tried; he must not be offered and the
 * ticket must not end up assigned to him.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-sec-018-a-preprod --grep "TC-SEC-018_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-sec-018- --grep "TC-SEC-018_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 524 = row TC-SEC-018 (Area Login, roles, security & data,
 *                   Feature "'Assigned to' offers only Customer Support team members", High, negative, L1 agent, refs E04,
 *                   E14, SE-011, SE-010) - 2 steps
 *  Source version : fingerprint 8622407cb1277af2 = sha256 (16 hex) of the row's Preconditions + Steps + A expected
 *                   + Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12)
 *
 *  Pre-conditions (CSV, verbatim: "A probe ticket in team Customer Support / NAKIVO Customer Support; a user outside the team
 *  (e.g. an occasional writer seat) exists.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. One probe ticket in team Customer Support - CREATED by this run (team TICKETS list > CREATE, Subject = QA SEC probe
 *       TC-SEC-018_A <runId>, SAVE) - and [INTERNAL check, Call API] the outside user exists: Thomas Semerich, an active
 *       user who is NOT a member of team 1 Customer Support. He is a Helpdesk user (After-Sales / User - measured as an
 *       administrator on 2026-10-28; an agent cannot read group membership), so only the team rule can keep him out.
 *  Steps to reproduce #1 (CSV, verbatim; the "FF:" part belongs to side B)
 *    1. Open the probe ticket's 'Assigned to' picker and search the outside user.
 *    2. Try to assign the ticket to that user.
 *  Verification - A expected (Odoo 12), verbatim
 *    Only Helpdesk users who are team members are offered; the outside user cannot be chosen.
 *
 *  How Step 2 tries: EDIT, type the outside user's full name in "Assigned to", press Enter (Odoo takes the first offered
 *  item, if any), SAVE; then [INTERNAL check, Call API] the stored Assigned to is read. Every offered name is also compared
 *  with the team's member names.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 end shot; Step 1 verify shot (the open autocomplete); Step 2 verify
 * shot (Assigned to after the try); afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-SEC-018_A';
const SOURCE_ROW = 'TC-SEC-018';
const SOURCE_FINGERPRINT = '8622407cb1277af2';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: "Pre-condition 2: A probe ticket in team Customer Support; a user outside the team exists - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA SEC probe TC-SEC-018_A <runId>, SAVE; [INTERNAL check, Call API] Thomas Semerich is a Helpdesk user outside team 1",
  s1: "Step 1: Open the probe ticket's 'Assigned to' picker and search the outside user (Odoo: EDIT, type Thomas Semerich in Assigned to)",
  s2: 'Step 2: Try to assign the ticket to that user (Odoo: the full name + Enter in Assigned to, then SAVE)',
  verify: 'Verification',
} as const;

const AGENT = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const CS_TEAM_ID = 1;
const OUTSIDE_USER = { login: 'thomas.semerich@nakivo.com', name: 'Thomas Semerich' };

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

test.describe(`${TC} - Assigned to offers only team members on Odoo 12 pre-production`, () => {
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
      const helpdeskPage = new HelpdeskPage(page);
      await helpdeskPage.discardTicketEdits().catch(() => {});
      if (!probe.subject) {
        console.log('  - No probe ticket was created by this run - nothing to clean up');
      } else if (SKIP_CLEANUP_TICKETS) {
        console.log(`  - SKIP_CLEANUP_TICKETS = true: probe ticket kept - #${probe.id ?? '?'} "${probe.subject}"`);
      } else if (!probe.id) {
        cleanupError = `probe "${probe.subject}" has no captured id - check by hand that it was never saved`;
      } else {
        const archived = await helpdeskPage.archiveTicketByIdOverRpc(probe.id, probe.subject);
        if (!archived) cleanupError = `probe ticket #${probe.id} "${probe.subject}" still reads active - archive it by hand`;
        else console.log(`  - Probe ticket #${probe.id} archived (re-read: inactive)`);
      }
    } catch (e) {
      cleanupError = e instanceof Error ? e.message : String(e);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (cleanupError) throw new Error(`afterEach cleanup: ${cleanupError}`);
  });

  test(`${TC}: 'Assigned to' offers only Customer Support team members - A: Odoo 12 neither offers nor takes a user outside the team`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA SEC probe ${TC} ${runId}`;
    let memberNames: string[] = [];

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
      const team = await helpdeskPage.readTeamMembersOverRpc(CS_TEAM_ID);
      memberNames = team.members.map((m) => m.name);
      const outsideIsMember = team.members.some((m) => m.login === OUTSIDE_USER.login);
      const outsideExists = await helpdeskPage.userExistsOverRpc(OUTSIDE_USER.login);
      console.log(`  [INTERNAL check, Call API] team #${CS_TEAM_ID} "${team.name}": ${memberNames.length} members`);
      console.log(`     outside user ${OUTSIDE_USER.name} (${OUTSIDE_USER.login}): member = ${outsideIsMember}, active user = ${outsideExists}`);
      expect(outsideIsMember, `${OUTSIDE_USER.name} is NOT a member of ${TEAM}`).toBe(false);
      expect(outsideExists, `${OUTSIDE_USER.name} exists as an active user`).toBe(true);
      console.log('  Probe ticket data:');
      console.log(`     Subject        = ${subject}`);
      console.log(`     Helpdesk Team  = ${TEAM} (defaulted by the team's TICKETS list)`);
      console.log('     Customer       = blank');
      console.log('     Assigned to    = blank');
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const t = await helpdeskPage.getHelpdeskTeam();
      console.log(`  Read back #${probe.id}: team = ${t}`);
      expect(t, 'the probe ticket is in team Customer Support').toBe(TEAM);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket in Customer Support');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.clickEditTicket();
      const offered = await helpdeskPage.getAssignedToOptions(OUTSIDE_USER.name, true);
      const people = offered.filter((o) => !/^Search More|^Create|^No records|^No results/i.test(o));
      const strangers = people.filter((p) => !memberNames.includes(p));
      console.log(`  - Offered for "${OUTSIDE_USER.name}": ${JSON.stringify(offered)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 the outside user is not offered', expected: `no "${OUTSIDE_USER.name}" among the offered names`, actual: JSON.stringify(offered), passed: !people.includes(OUTSIDE_USER.name) },
        { what: 'Step 1 every offered name is a team member', expected: `only ${TEAM} members`, actual: strangers.length ? `not members: ${strangers.join(', ')}` : `${people.length} offered, all members`, passed: strangers.length === 0 },
      ], `${TC} - Step 1 Assigned to search`, [HelpdeskPage.AUTOCOMPLETE, '.o_form_view [name="user_id"]']);
      await helpdeskPage.closeAssignedToDropdown();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const typed = await helpdeskPage.typeAssignedToAndEnter(OUTSIDE_USER.name);
      const saved = await helpdeskPage.clickSaveTicket();
      const shown = await helpdeskPage.getAssignedTo();
      const stored = await helpdeskPage.readTicketOverRpc(probe.id as string, ['user_id']);
      const storedName = Array.isArray(stored.user_id) ? String(stored.user_id[1]) : '';
      console.log(`  - Field after Enter "${typed}" | saved ${saved} | form Assigned to "${shown}" | stored "${storedName || '(none)'}"`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 the outside user cannot be chosen', expected: `the ticket is NOT assigned to ${OUTSIDE_USER.name} (form and stored value)`, actual: `form "${shown || '(empty)'}", stored "${storedName || '(none)'}"`, passed: shown !== OUTSIDE_USER.name && storedName !== OUTSIDE_USER.name },
      ], `${TC} - Step 2 Assigned to after the try`, ['.o_form_view [name="user_id"]']);
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
        : `OVERALL: PASS - only ${TEAM} members are offered and ${OUTSIDE_USER.name} cannot be chosen`);
      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(failed.map((c) => c.what), 'Assigned to keeps to the team members').toEqual([]);
    });
  });
});
