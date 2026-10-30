import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-UI-059_A - Set status on several tickets - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-UI-059_A   (side A of the A/B row TC-UI-059; side B = tc-ui-059-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod)
 * Data             : three probe tickets created per run (Pre-condition 2), each ARCHIVED by id in afterEach
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "4. Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0268 (stage moves); the TC-to-requirement mapping is
 *                    the automation author's, the CSV carries no link to that page
 * Pair             : TC-UI-059_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/4. Lifecycle & escalation/
 *                    tc-ui-059-b-support-set-stage-on-three-tickets.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L1 agent, select three probe tickets in the Customer Support list, run Action > Mass Editing (Stage) > Pending (L1)
 * > Apply, reload the list; all three must read Pending (L1).
 *
 * Command to run
 * --------------
 *   npx playwright test tc-ui-059-a-preprod --grep "TC-UI-059_A:" --project=chromium-headless
 *   (both sides: npx playwright test tc-ui-059- --grep "TC-UI-059_" --project=chromium-headless)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 278 = row TC-UI-059 (Area Ticket screens, lists & search,
 *                   Feature "Set status on several tickets", High, happy, L1 agent, refs E35, UI-060) - 3 steps
 *  Source version : fingerprint 327725b1a7a41ddf = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of step 1; step 2 is the FF half (side B); step 3 is shared
 *
 *  Pre-conditions (CSV, verbatim: "Three probe tickets in status Open.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. Three probe tickets in stage Open - CREATED by this run, Subject = QA FLOW probe TC-UI-059_A <runId> #1 / #2 / #3
 *       (Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE; SAVE; back to the list). The CSV's
 *       'QA-UI probe <n>' subject and requester are replaced by this run's unique subjects, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">")
 *    1. Odoo: select the 3 probes > Action > Mass Editing (Stage) > Pending (L1) > Apply.
 *    2. FF: tick the 3 probes > 'Set status' > Status 'Pending (L1)' > 'Apply to 3 tickets'.
 *    3. Reload the list.
 *  Verification - A expected (Odoo 12), verbatim
 *    All 3 tickets move to Pending (L1).
 *
 *  Environment traps (also in the step text):
 *   - The list's Action menu is drawn only while rows are selected; rows are selected through their row checkboxes only.
 *   - The Mass Editing wizard takes the stage as a many2one: the option is picked from the autocomplete list.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Step 1 (selection and
 * wizard) and Step 3 (outlined green = PASS, red = FAIL); end-of-section shots after Step 1 and Step 3; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-UI-059_A';
const SOURCE_ROW = 'TC-UI-059';
const SOURCE_FINGERPRINT = '327725b1a7a41ddf';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe tickets for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: Three probe tickets in status Open - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-UI-059_A <runId> #1 / #2 / #3, SAVE, back to the list',
  s1: 'Step 1: Odoo: select the 3 probes > Action > Mass Editing (Stage) > Pending (L1) > Apply.',
  s2: "Step 2: [N/A on Odoo - the FF half of this step runs on side B, TC-UI-059_B] FF: tick the 3 probes > 'Set status' > Status 'Pending (L1)' > 'Apply to 3 tickets'.",
  s3: 'Step 3: Reload the list.',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const STAGE_OPEN = 'Open';
const STAGE_PENDING = 'Pending (L1)';
const PROBES = 3;

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

test.describe(`${TC} - Set the stage of three tickets on Odoo 12 pre-production`, () => {
  /** What this run created - read by afterEach. */
  let probes: Array<{ id: string; subject: string }> = [];
  let created: string[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    probes = [];
    created = [];
    console.log('\n--- beforeEach: source version check (REQUIREMENT #7) ---');
    assertHelpdeskAbSourceInSync(SOURCE_ROW, AB_FIELDS_SIDE_A, SOURCE_FINGERPRINT);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.error) console.log(`\n!! FAILURE REASON: ${(testInfo.error.message || String(testInfo.error)).split('\n').slice(0, 6).join('\n   ')}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach ---');
    const problems: string[] = [];
    const helpdeskPage = new HelpdeskPage(page);
    if (SKIP_CLEANUP_TICKETS) {
      console.log('  - SKIP_CLEANUP_TICKETS = true: probe tickets kept');
    } else {
      for (const p of probes) {
        try {
          const archived = await helpdeskPage.archiveTicketByIdOverRpc(p.id, p.subject);
          if (!archived) problems.push(`probe #${p.id} "${p.subject}" still reads active`);
          else console.log(`  - Probe ticket #${p.id} archived (re-read: inactive)`);
        } catch (e) {
          problems.push(`probe #${p.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (created.length > probes.length) problems.push(`${created.length - probes.length} probe(s) were created but not captured by id`);
      if (!probes.length && !created.length) console.log('  - No probe ticket was created by this run - nothing to clean up');
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (problems.length) throw new Error(`afterEach cleanup: ${problems.join('; ')}`);
  });

  test(`${TC}: Set the stage of three selected tickets (Mass Editing, Pending (L1)) - A: Odoo 12 list mass edit`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const marker = `TC-UI-059_A ${runId}`;
    const subjects = Array.from({ length: PROBES }, (_, i) => `QA FLOW probe ${marker} #${i + 1}`);
    let before: string[] = [];
    let after: string[] = [];
    let serverError = '';

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
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Giang Le:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
      console.log(`     support_team = ${me.supportTeam || '(empty)'}   ('l1' = Support L1)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as Giang Le');
      expect(me.supportTeam, 'the signed-in account is an L1 agent (employee Support Team = Support L1)').toBe('l1');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      for (const subject of subjects) {
        created.push(subject);
        const id = await helpdeskPage.createTicketInCurrentList(subject);
        probes.push({ id, subject });
        await helpdeskPage.goBackToBreadcrumb('Tickets');
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      await helpdeskPage.searchTicket(marker);
      const rows = await helpdeskPage.waitForListRowsContaining(marker);
      const stages: string[] = [];
      for (const p of probes) stages.push(await helpdeskPage.readStageOverRpc(p.id));
      console.log('  Read back (before the mass edit):');
      probes.forEach((p, i) => console.log(`     #${p.id} stage = ${stages[i]}   "${p.subject}"`));
      console.log(`     list rows containing the run marker = ${rows}`);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 three probes Open`,
        passed: rows === PROBES && stages.every((s) => s === STAGE_OPEN),
        highlight: ['tr.o_data_row'],
        lines: [`list rows with the marker: expected ${PROBES} | actual ${rows}`, `stages: expected all ${STAGE_OPEN} | actual ${stages.join(', ')}`],
      }).catch(() => {});
      expect(rows, 'the three probes are listed').toBe(PROBES);
      expect(stages, 'the three probes are in stage Open').toEqual(Array(PROBES).fill(STAGE_OPEN));
      before = stages;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - three probes Open');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const selected = await helpdeskPage.selectListRowsBySubjects(subjects);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 1 three rows selected`,
        passed: selected === PROBES,
        highlight: ['tr.o_data_row'],
        lines: [`rows selected: expected ${PROBES} | actual ${selected}`],
      }).catch(() => {});
      expect(selected, 'the three probes are selected').toBe(PROBES);
      await helpdeskPage.chooseListActionItem('Mass Editing (Stage)');
      serverError = await helpdeskPage.applyMassEditStage(STAGE_PENDING);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 Apply completes without a server error',
          expected: 'no "Odoo Server Error" dialog after Apply',
          actual: serverError || 'none',
          passed: serverError === '',
        },
      ], `${TC} - Step 1 Apply`, ['.modal.show .modal-content'], 'bottom-right');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - mass edit applied');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  - Not run on Odoo: the FF half of this step is executed by TC-UI-059_B (Frappe Helpdesk).');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await helpdeskPage.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await helpdeskPage.searchTicket(marker);
      await helpdeskPage.waitForListRowsContaining(marker);
      after = [];
      for (const p of probes) after.push(await helpdeskPage.readStageOverRpc(p.id));
      const headers = await helpdeskPage.getListHeaders().catch(() => [] as string[]);
      console.log(`  - Odoo list column headers (observation, not scored): ${JSON.stringify(headers)}`);
      probes.forEach((p, i) => console.log(`  - #${p.id} stage: ${before[i]} -> ${after[i]}`));
      await recordChecks(page, testInfo, checks, probes.map((p, i) => ({
        what: `Probe #${p.id} stage after the mass edit (baseline ${before[i]})`,
        expected: STAGE_PENDING,
        actual: after[i] || '(none)',
        passed: after[i] === STAGE_PENDING,
      })), `${TC} - Step 3 stages after reload`, ['tr.o_data_row']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - reloaded');
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
        : 'OVERALL: PASS - all three tickets read Pending (L1) after the reload');

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(after, 'all three tickets read Pending (L1)').toEqual(Array(PROBES).fill(STAGE_PENDING));
    });
  });
});
