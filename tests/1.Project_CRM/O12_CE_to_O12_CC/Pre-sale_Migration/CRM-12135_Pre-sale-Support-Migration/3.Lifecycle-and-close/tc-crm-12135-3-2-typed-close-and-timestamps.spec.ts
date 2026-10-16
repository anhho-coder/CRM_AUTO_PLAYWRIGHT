import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_3.2 - A request moves freely between stages and a typed close records the closed date
 * ============================================================================================
 * Test Case ID   : CRM-12135_3.2
 * Jira           : CRM-12931
 * Requirements   : FUNC-0050, FUNC-0051, FUNC-0052
 * Run as         : admin_crm_mig on the CRM (the TC's "Salesperson admin_crm_mig") with a Pre-Sales
 *                  Application session for the same person, Ho Quoc Anh (anh.ho@nakivo.com)
 * Automation-Type: new
 * Automation-Date: 2026-09-21 (re-automated on the Pre-Sales UI 2026-10-16 - it used to drive the
 *                  steps over RPC)
 * Source TC      : CRM-12931 (Xray Manual Steps, 6 steps)
 * Source version : updated 2026-10-06T12:36:31.683+0300 - re-check before trusting this spec
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture, afterEach
 *                  start/end, video.
 *
 * Summary
 * -------
 *   A request raised from a fresh Opportunity is walked across On Product Team, In Progress, On Support
 *   Team and Closed on the Pre-Sales stage bar; the created date must hold and the closed date be step 5's.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_3\.2:" --project=O12
 *
 * Source manual TC (CRM-12931, verbatim)
 * --------------------------------------
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application
 *         session active
 *      2. Create a new Opportunity AUTO-CRM-12135-TC-17-<runId>-close with Expected Revenue Deal = $900,
 *         from the list view.
 *      3. From that Opportunity, click "Request SE support" and create one request with:
 *            - Subject      = AUTO-CRM-12135-TC-17-<runId>-close
 *            - Description  = Automated check of CRM-12135 TC-17.
 *            - Support type = Offline technical assistance
 *
 *   Steps to reproduce:
 *      1. Open the request on the Pre-Sales Application, read the Classification group, and note the
 *         created date as C.
 *         Expected: Ticket Type is already filled. The created date C is recorded.
 *      2. Click On Product Team on the stage bar.      Expected: No error popup.
 *      3. Click In Progress on the stage bar.          Expected: No error popup.
 *      4. Click On Support Team on the stage bar.      Expected: No error popup.
 *      5. Click Closed on the stage bar.               Expected: No error popup.
 *      6. Refresh the page and re-open the request.
 *         Expected: The stage is Closed. The created date is still C, and the closed date is the time
 *         of step 5.
 *
 * Added by the automation (not in the TC)
 * ---------------------------------------
 *   - Steps 2-5 also assert that the stage bar marks the clicked stage current. "No error popup" alone
 *     passes against a stage bar that silently does nothing (skill REQUIREMENT 6c).
 *   - "Open the request" walks Pre-sale tickets > Tickets > All Tickets and searches its Subject.
 *   - Closed is folded under the stage bar's "More" menu; Closed Date sits in the "Other Information" tab.
 *   - Dates read as the form shows them ("Oct 16, 11:17 AM", minute precision, the browser's zone), so
 *     "the time of step 5" = between the minute the Closed click started and the moment it returned.
 *
 * Data
 * ----
 *   The Opportunity and its request are named AUTO-CRM-12135-TC-17-<runId>-close and removed in
 *   afterEach by an administrator session, on a passing, failing or timed-out run.
 *   SKIP_CLEANUP_PRESALE=true keeps them.
 */

const TC = 'CRM-12135_3.2';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Sign in to the Pre-Sales Application as Ho Quoc Anh, then to the CRM (crm-mig) as admin_crm_mig - logged in to the CRM with a Pre-Sales Application session active',
  pre2:   'Pre-condition 2: Create a new Opportunity AUTO-CRM-12135-TC-17-<runId>-close with Expected Revenue Deal = $900, from the list view (CRM left sidebar > Pipeline > LIST view - in kanban CREATE opens a quick-create card without Expected Revenue Deal)',
  pre3:   'Pre-condition 3: From that Opportunity, click "Request SE support" (under More when the header row is full) and create one request',
  s1:     'Step 1: Open the request on the Pre-Sales Application (Pre-sale tickets > Tickets > All Tickets, search its Subject), read the Classification group, and note the created date as C',
  s2:     'Step 2: Click On Product Team on the stage bar',
  s3:     'Step 3: Click In Progress on the stage bar',
  s4:     'Step 4: Click On Support Team on the stage bar',
  s5:     'Step 5: Click Closed on the stage bar (folded under More)',
  s6:     'Step 6: Refresh the page and re-open the request',
  verify: 'Verification',
} as const;

const EXPECTED_REVENUE = 900;
const SUPPORT_TYPE = 'Offline technical assistance';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

/** What one stage-bar click produced. */
interface StageMove { target: string; current: string; dialog: string }

test.describe(`${TC} - A request moves freely between stages and a typed close records the closed date`, () => {
  test.afterEach(async ({ page, browser }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (!runMarker) {
      console.log('  TEARDOWN: nothing was created');
    } else if (SKIP_CLEANUP) {
      console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${runMarker}`);
    } else {
      // An administrator session of its own, on a pass, a fail and a timeout alike.
      const swept = await MigPreSalePage.sweepLeftovers(browser, runMarker);
      console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]`
        + (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
    }
    runMarker = '';
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: A request moves freely between stages and a typed close records the closed date`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - A request moves freely between stages and a typed close records the closed date ==========`);

    const runId = MigPreSalePage.runId();
    const name = `${MigPreSalePage.marker('TC-17', runId)}-close`;
    const description = 'Automated check of CRM-12135 TC-17.';
    const ui = new MigPreSalePage(page);
    const opportunityPage = new OpportunityPage(page);

    let leadId = 0;
    let saveErrorDialog = '';
    let rowCount = 0;
    let requestId = 0;
    let ticketType = '';
    let createdC = '';
    const moves: StageMove[] = [];
    let closeStartedAt = new Date(0);
    let closeReturnedAt = new Date(0);
    let stageAfterRefresh = '';
    let createdAfterRefresh = '';
    let closedDate = '';

    /** Click one stage and record what the bar and the screen showed. */
    const moveTo = async (target: string): Promise<void> => {
      await ui.clickPresalesStage(target);
      const dialog = await ui.presalesDialog();
      const current = await ui.presalesCurrentStage();
      const text = dialog ? `${dialog.title}: ${dialog.body}`.replace(/\s+/g, ' ').trim() : '';
      moves.push({ target, current, dialog: text });
      console.log(`  Stage bar current : ${current}`);
      console.log(`  Popup             : ${text || 'none'}`);
      if (dialog) await ui.closePresalesDialog();
    };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      const landed = await MigPreSalePage.loginPresalesUi(
        page, users.anh_ho_presales_mig.username, users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales account : ${users.anh_ho_presales_mig.username} (landed on ${landed})`);
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log(`  CRM account       : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in to both servers');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await ui.openPipelineListFromSidebar();
      await opportunityPage.clickCreate();
      runMarker = name;
      console.log(`  - Opportunity name      : ${name}`);
      console.log(`  - Expected Revenue Deal : ${EXPECTED_REVENUE}`);
      await opportunityPage.fillOpportunityName(name);
      await opportunityPage.fillExpectedRevenueDeal(String(EXPECTED_REVENUE));
      await opportunityPage.saveAndWaitForCompletion();
      leadId = Number(await opportunityPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage));
      // CRM-13563 guard: every SAVE on crm-mig used to leave "Odoo Server Error - Missing Record"
      // (mail.followers) over the form. Fixed 2026-10-16, so the dialog now fails the case.
      saveErrorDialog = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long)
        ? await opportunityPage.waitForServerErrorDialog(CommonUtils.waitTimes.standard) : '';
      console.log(`  Opportunity id  : ${leadId}`);
      console.log(`  Opportunity URL : ${MigPreSalePage.opportunityUrl(leadId)}`);
      console.log(`  Error dialog after SAVE (CRM-13563, must be none) : ${saveErrorDialog.replace(/\s+/g, ' ') || 'none'}`);
      expect(leadId, 'the Opportunity this case builds on must be saved').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Opportunity saved');
      expect(saveErrorDialog.replace(/\s+/g, ' '),
        'CRM-13563: no "Odoo Server Error - Missing Record" dialog may stand over the form after SAVE').toBe('');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await ui.openOpportunity(leadId);
      await ui.openRaiseDialog();
      console.log(`  - Subject      : ${name}`);
      console.log(`  - Description  : ${description}`);
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await ui.fillRaiseDialog({ subject: name, description, supportType: SUPPORT_TYPE });
      await ui.saveRaiseDialog();
      await ui.waitForRaiseDialogClosed();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - request raised');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await ui.openPresalesHome();
      await ui.openPresalesAllTickets();
      rowCount = await ui.searchPresalesList(name);
      console.log(`  Rows carrying the Subject : ${rowCount}`);
      expect(rowCount, 'the request raised in pre-condition 3 must be in All Tickets').toBeGreaterThan(0);
      await ui.openPresalesRow(name);
      requestId = (await ui.presalesOpenRequest()).id;
      ticketType = await ui.presalesFieldText('type_id');
      createdC = await ui.presalesFieldText('create_date');
      console.log(`  Request id             : ${requestId}`);
      console.log(`  Request URL            : ${MigPreSalePage.requestUrl(requestId)}`);
      console.log(`  Ticket Type            : ${ticketType || '(empty)'}`);
      console.log(`  Created date C         : ${createdC}`);
      console.log(`  Stage                  : ${await ui.presalesCurrentStage()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - request open, C noted');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await moveTo('On Product Team');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 2 - On Product Team');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await moveTo('In Progress');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 3 - In Progress');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await moveTo('On Support Team');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 4 - On Support Team');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      closeStartedAt = new Date();
      await moveTo('Closed');
      closeReturnedAt = new Date();
      console.log(`  Closed clicked between ${closeStartedAt.toLocaleString()} and ${closeReturnedAt.toLocaleString()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 5 - Closed');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await ui.reloadPresalesForm();
      stageAfterRefresh = await ui.presalesCurrentStage();
      createdAfterRefresh = await ui.presalesFieldText('create_date');
      closedDate = await ui.presalesClosedDate();
      console.log(`  Stage        : ${stageAfterRefresh}`);
      console.log(`  Created date : ${createdAfterRefresh}`);
      console.log(`  Closed Date  : ${closedDate || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 6 - re-opened after refresh');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const closedAt = MigPreSalePage.parseShortDateTime(closedDate);
      const windowStart = new Date(closeStartedAt);
      windowStart.setSeconds(0, 0);
      const closedInWindow = !!closedAt && closedAt >= windowStart && closedAt <= closeReturnedAt;

      const ok1 = ticketType !== '' && createdC !== '';
      const moveOk = (m: StageMove | undefined, target: string) =>
        !!m && m.dialog === '' && m.current.toLowerCase() === target.toLowerCase();
      const targets = ['On Product Team', 'In Progress', 'On Support Team', 'Closed'];
      const okMoves = targets.map((t) => moveOk(moves.find((m) => m.target === t), t));
      const ok6 = stageAfterRefresh.toLowerCase() === 'closed';
      const ok7 = createdAfterRefresh === createdC && createdC !== '';
      const ok8 = closedInWindow;
      const lines = [
        'Verify #1 - Ticket Type is already filled, and the created date C is recorded:',
        '   Expected : Ticket Type not empty, C read',
        `   Actual   : Ticket Type "${ticketType}", C = ${createdC || '(none)'}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        ...targets.flatMap((t, i) => {
          const m = moves.find((x) => x.target === t);
          return [
            `Verify #${i + 2} - Step ${i + 2}: ${t} - no error popup, and the bar marks ${t} current:`,
            `   Expected : no popup, current = ${t}`,
            `   Actual   : popup ${m?.dialog || 'none'}, current = ${m?.current || '(not reached)'}`,
            `   Result   : ${okMoves[i] ? 'PASS' : 'FAIL'}`,
          ];
        }),
        'Verify #6 - After the refresh the stage is Closed:',
        '   Expected : Closed',
        `   Actual   : ${stageAfterRefresh || '(none)'}`,
        `   Result   : ${ok6 ? 'PASS' : 'FAIL'}`,
        'Verify #7 - The created date is still C:',
        `   Expected : ${createdC || '(C not read)'}`,
        `   Actual   : ${createdAfterRefresh || '(none)'}`,
        `   Result   : ${ok7 ? 'PASS' : 'FAIL'}`,
        'Verify #8 - The closed date is the time of step 5:',
        `   Expected : between ${windowStart.toLocaleString()} and ${closeReturnedAt.toLocaleString()} (empty = the close wrote no date)`,
        `   Actual   : ${closedDate || '(empty)'}`,
        `   Result   : ${ok8 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && okMoves.every(Boolean) && ok6 && ok7 && ok8;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - the request ${passed ? 'moved freely and the typed close kept C and recorded the closed date' : 'did NOT behave as specified'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - closed request after refresh`,
        passed,
        highlight: ['.o_statusbar_status', '.o_form_renderer div[name="create_date"]', '.o_form_renderer div[name="closed_date"]'],
        lines,
      }).catch(() => {});

      expect(ticketType, 'Ticket Type must already be filled on the raised request').not.toBe('');
      targets.forEach((t, i) => {
        const m = moves.find((x) => x.target === t);
        expect(m?.dialog ?? 'not clicked', `step ${i + 2}: clicking ${t} must raise no popup`).toBe('');
        expect((m?.current ?? '').toLowerCase(), `step ${i + 2}: the stage bar must mark ${t} current`).toBe(t.toLowerCase());
      });
      expect(stageAfterRefresh.toLowerCase(), 'after the refresh the stage must be Closed').toBe('closed');
      expect(createdAfterRefresh, 'the created date must still be C').toBe(createdC);
      expect(closedInWindow, `the closed date "${closedDate}" must be the time of step 5`).toBe(true);
    });
  });
});
