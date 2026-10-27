import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HelpdeskPage, LoginPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { AB_FIELDS_SIDE_A, assertHelpdeskAbSourceInSync } from '@helpers/helpdesk-ab-source.helper';

/**
 * ================================================================================================
 *  TC-FLOW-030_A - Hibernate a ticket (button and dialog) - side A: Odoo 12 pre-production
 * ================================================================================================
 * Test Case ID     : TC-FLOW-030_A   (side A of the A/B row TC-FLOW-030; side B = tc-flow-030-b-support-...)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-23
 * Jira             : N/A - not imported to Xray yet (feature CRM-11859, Customer Support migration)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE, db nakivo)
 * Run as           : L1 agent - Giang Le (giang.le@nakivo.com; employee Support Team = l1, asserted in Pre-condition 1;
 *                    users.support_l1_giang_preprod = the same login and password as users.support_l1_giang_support_mig)
 * Data             : one probe ticket created per run (Pre-condition 2) and ARCHIVED in afterEach - Giang holds no unlink
 *                    on helpdesk.ticket, so archive is the cleanup (toggle SKIP_CLEANUP_TICKETS)
 * Folder           : tests/1.Project_CRM/6.Helpdesk_Module/Overrall_Helpdesk_Supports_Feature / "Lifecycle & escalation" =
 *                    the Spec area (h2) of Confluence page 231246777 "[Migration] Customer Support (Helpdesk Ticketing)"
 *                    whose requirement this case verifies - IS-CRM-FUNC-0270; the TC-to-requirement mapping is the
 *                    automation author's, the CSV carries no link to that page
 * Pair             : TC-FLOW-030_B - tests/1.Project_CRM/O12_CE_to_O12_CC/Migration-Customer_Support/Lifecycle & escalation/
 *                    tc-flow-030-b-support-hibernate-a-ticket.spec.ts (CSV Comparison = same)
 *
 * Summary
 * -------
 * As an L1 agent, open a probe ticket that is in On Customer, click the header button Hibernate, check the default
 * "Hibernate until" date (today + 14 days), enter the reason and confirm; the ticket must read Hibernate, show the
 * hibernation banner and log the hibernation note with the agent's name.
 *
 * Command to run
 * --------------
 *   npx playwright test tc-flow-030-a-preprod --grep "TC-FLOW-030_A:" --project=chromium
 *   (both sides: npx playwright test tc-flow-030- --grep "TC-FLOW-030_" --project=chromium)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC
 * ------------------------------------------------------------------------------------------------
 *  Source         : test-data/CRM-11859-[Odoo migration] Customer Support module - Test cases/
 *                   Helpdesk-AB-Test-Cases - Pre-pro.csv, record 119 = row TC-FLOW-030 (Area Ticket lifecycle & workflow,
 *                   Feature "Hibernate a ticket (button and dialog)", High, happy, L1 agent, refs E12, LC-025) - 4 steps
 *  Source version : fingerprint f204d181c38051c1 = sha256 (16 hex) of the row's Preconditions + Steps + A expected +
 *                   Test data (helpers/helpdesk-ab-source.helper.ts). beforeEach recomputes it and FAILS the run as
 *                   OUT OF SYNC when that text changed - re-read the row, re-sync this spec, then re-pin.
 *  This spec      : the A column (Odoo 12) - the "Odoo:" half of each step
 *
 *  Pre-conditions (CSV, verbatim: "Probe ticket in On Customer.")
 *    1. Logged in as an L1 agent - here pre-production; the L1 tier is read from the employee record
 *    2. One probe ticket in stage On Customer - CREATED by this run:
 *         Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE
 *            - Subject        = QA FLOW probe TC-FLOW-030_A <runId>
 *            - Helpdesk Team  = Customer Support (defaulted by the team's TICKETS list; read back after SAVE)
 *            - Customer       = blank
 *            - Customer Email = blank
 *            - Assigned to    = blank
 *            - Priority       = default
 *            - Description    = blank
 *         SAVE -> stage Open; then the stage bar > On Customer -> stage On Customer (both asserted)
 *       Deviation from the CSV test data (customer qa.customer@example.com, subject 'QA FLOW probe <case id>'): this run
 *       uses its own unique subject and no customer, per the batch data rules.
 *  Steps to reproduce #1 (CSV, verbatim - arrows written ">"; the "FF:" half belongs to side B)
 *    1. Click Hibernate in the ticket header (Odoo: form header button).
 *    2. Check the default 'Hibernate until' date.
 *    3. Enter reason 'Waiting for customer maintenance window' and confirm (OK).
 *    4. Read the stage, the banner and the chatter / timeline.
 *  Verification - A expected (Odoo 12), verbatim
 *    Default date = today + 14 days. Stage = Hibernate; yellow banner 'This ticket is hibernated and will be automatically
 *    reopened on <MM/DD/YYYY>. Reason: ...'; note 'Ticket hibernated until <MM/DD/YYYY> by <user>. Reason: ...'.
 *    (The expected dates are computed at run time from the test host's clock, never typed.)
 *
 *  Gap in the source (reported to the TC author, not invented): the CSV holds one expected block for the whole case, not
 *  one per step. Step 1 therefore asserts a navigation GUARD (the wizard opened); the expected block is asserted on
 *  steps 2 and 4.
 *
 *  Environment traps (also in the step text):
 *   - Hibernate is a HEADER BUTTON, not a stage: a click on the stage bar's Hibernate is refused (TC-FLOW-032).
 *   - The "Hibernate until" date is pre-filled by Odoo; the spec reads it and never types it.
 *
 * Evidence: Pre-condition 1 end shot; Pre-condition 2 verify shot and end shot; verify-point shots in Steps 1, 2 and 4
 * (outlined green = PASS, red = FAIL); one end-of-section shot after Step 4; afterEach start + end.
 * ================================================================================================
 */

const TC = 'TC-FLOW-030_A';
const SOURCE_ROW = 'TC-FLOW-030';
const SOURCE_FINGERPRINT = 'f204d181c38051c1';
const SKIP_CLEANUP_TICKETS = false; // true keeps the probe ticket for inspection (otherwise archived in afterEach)

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Logged in as an L1 agent - pre-production (Odoo 12 EE) as Giang Le; [INTERNAL check, Call API] the employee record of this account reads Support Team = l1',
  pre2: 'Pre-condition 2: One probe ticket in stage On Customer - created by this run: Helpdesk > Overview > Customer Support > TICKETS > list view > CREATE, Subject = QA FLOW probe TC-FLOW-030_A <runId>, SAVE; then the stage bar > On Customer',
  s1: 'Step 1: Click Hibernate in the ticket header (Odoo: form header button) - Hibernate is a header button, not a stage: the stage bar refuses it (TC-FLOW-032)',
  s2: "Step 2: Check the default 'Hibernate until' date - read, never typed; expected today + 14 days on the test host's clock",
  s3: "Step 3: Enter reason 'Waiting for customer maintenance window' and confirm (OK).",
  s4: 'Step 4: Read the stage, the banner and the chatter / timeline - the banner on the form, and the note in the chatter read after a reload (the note can post a moment after OK)',
  verify: 'Verification',
} as const;

const ENGINEER = users.support_l1_giang_preprod;
const TEAM = 'Customer Support';
const STAGE_ON_CUSTOMER = 'On Customer';
const REASON = 'Waiting for customer maintenance window';

type Check = { what: string; expected: string; actual: string; passed: boolean };

/** MM/DD/YYYY of `days` after today, on the test host's clock (the wizard's default is today + 14). */
function dateAfterDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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

test.describe(`${TC} - Hibernate a ticket on Odoo 12 pre-production`, () => {
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
        // [INTERNAL, Call API] archive BY ID (Giang holds no unlink): the ticket must carry this run's subject and read
        // back inactive. The UI paths are not the teardown this case verifies.
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

  test(`${TC}: Hibernate a ticket (button and dialog) - A: Odoo 12 header button, wizard default date, banner and note`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    const loginPage = new LoginPage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const checks: Check[] = [];
    const runId = CommonUtils.generateUniqueId();
    const subject = `QA FLOW probe ${TC} ${runId}`;
    const expectedUntil = dateAfterDays(14);
    const expectedBanner = `This ticket is hibernated and will be automatically reopened on ${expectedUntil}. Reason: ${REASON}`;
    const expectedNote = `Ticket hibernated until ${expectedUntil} by ${ENGINEER.displayName}. Reason: ${REASON}`;

    let wizard: { until: string; reasonRequired: boolean; buttons: string[] } = { until: '', reasonRequired: false, buttons: [] };
    let stageAfter = '';
    let banner = '';
    let chatter: { found: boolean; chatterText: string } = { found: false, chatterText: '' };

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
      console.log('  [INTERNAL check, Call API] hr.employee search_read user_id = session uid, as Giang:');
      console.log(`     uid          = ${me.uid}`);
      console.log(`     employee     = ${me.employee}`);
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
      console.log(`  Then the stage bar > ${STAGE_ON_CUSTOMER}`);
      probe.subject = subject;
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openTeamTicketsFromOverview(TEAM);
      await helpdeskPage.switchToListView();
      probe.id = await helpdeskPage.createTicketInCurrentList(subject);
      const team = await helpdeskPage.getHelpdeskTeam();
      const openStage = await helpdeskPage.getCurrentStage();
      const onCustomer = await helpdeskPage.moveTicketToStage(STAGE_ON_CUSTOMER);
      console.log('  Read back:');
      console.log(`     id                 = ${probe.id}`);
      console.log(`     Helpdesk Team      = ${team}`);
      console.log(`     stage after SAVE   = ${openStage}`);
      console.log(`     stage after move   = ${onCustomer}`);
      const passed = team === TEAM && openStage === 'Open' && onCustomer === STAGE_ON_CUSTOMER;
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Pre-condition 2 probe ticket On Customer`,
        passed,
        highlight: ['.o_statusbar_status'],
        lines: [`Helpdesk Team: expected ${TEAM} | actual ${team}`, `stage after SAVE: expected Open | actual ${openStage}`, `stage after move: expected ${STAGE_ON_CUSTOMER} | actual ${onCustomer}`],
      }).catch(() => {});
      expect(team, 'the probe ticket is on team Customer Support').toBe(TEAM);
      expect(openStage, 'the probe ticket is created in stage Open').toBe('Open');
      expect(onCustomer, 'the probe ticket is moved to stage On Customer').toBe(STAGE_ON_CUSTOMER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - probe ticket On Customer');
    });

    // ================= Steps to reproduce #1 =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await helpdeskPage.openHibernateDialog();
      wizard = await helpdeskPage.getHibernateDialogDefaults();
      console.log(`  - Wizard buttons : ${wizard.buttons.join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: '(guard) Step 1 the "Hibernate ticket" wizard opened',
          expected: 'the wizard with OK and Cancel is shown (no wizard = the header button did not open it)',
          actual: wizard.buttons.join(' | ') || 'NOT SHOWN',
          passed: wizard.buttons.some((b) => /^OK$/i.test(b)) && wizard.buttons.some((b) => /^Cancel$/i.test(b)),
        },
      ], `${TC} - Step 1 Hibernate wizard`, ['.modal.show .modal-content'], 'bottom-right');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      wizard = await helpdeskPage.getHibernateDialogDefaults();
      console.log(`  - Hibernate until (as shown)  : ${wizard.until || '(empty)'}`);
      console.log(`  - Expected (today + 14 days)  : ${expectedUntil}`);
      console.log(`  Observation (not scored) - Hibernate reason marked as required : ${wizard.reasonRequired}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Hibernate until - the default date',
          expected: `${expectedUntil} (today + 14 days; any other date = the default is not 14 days ahead)`,
          actual: wizard.until || '(empty)',
          passed: wizard.until === expectedUntil,
        },
      ], `${TC} - Step 2 default date`, ['.modal.show .modal-content'], 'bottom-right');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Hibernate reason : ${REASON}`);
      console.log('  - Action           : OK');
      await helpdeskPage.confirmHibernate(REASON);
      console.log('  - Wizard closed; the form shows the hibernated ticket');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      stageAfter = await helpdeskPage.getCurrentStage();
      banner = await helpdeskPage.getHibernationBannerText();
      chatter = await helpdeskPage.waitForChatterContaining(expectedNote, 4, CommonUtils.waitTimes.checkingChatterLog);
      console.log(`  - Stage (statusbar)     : ${stageAfter}`);
      console.log(`  - Banner                : ${banner || '(none)'}`);
      console.log(`  - Note in the chatter   : ${chatter.found ? 'FOUND' : 'NOT FOUND'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Stage after the hibernation', expected: 'Hibernate', actual: stageAfter || '(none)', passed: stageAfter === 'Hibernate' },
        {
          what: 'Yellow banner text',
          expected: `"${expectedBanner}"`,
          actual: `"${banner || '(none)'}"`,
          passed: banner.includes(expectedBanner),
        },
        {
          what: 'Chatter note by the agent',
          expected: `"${expectedNote}" (author ${ENGINEER.displayName})`,
          actual: chatter.found ? 'FOUND' : 'NOT FOUND',
          passed: chatter.found,
        },
      ], `${TC} - Step 4 stage, banner and note`, ['.o_statusbar_status']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - hibernated');
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
        : `OVERALL: PASS - the default date is today + 14 days; the ticket reads Hibernate with the banner and the note`);

      for (const c of checks) {
        expect.soft(c.passed, `${c.what} - expected ${c.expected}, actual ${c.actual}`).toBe(true);
      }
      expect(wizard.until, 'the Hibernate until default is today + 14 days').toBe(expectedUntil);
      expect(stageAfter, 'the stage reads Hibernate').toBe('Hibernate');
      expect(banner, 'the yellow banner names the reopen date and the reason').toContain(expectedBanner);
      expect(chatter.found, 'the chatter logs the hibernation note by Giang Le').toBe(true);
    });
  });
});
