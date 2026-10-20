import { test, expect } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_3.1 - A request with no Ticket Type cannot be moved to Closed
 * ============================================================================================
 * Test Case ID   : CRM-12135_3.1
 * Jira           : CRM-12930
 * Requirements   : FUNC-0051
 * Run as         : Ho Quoc Anh (anh.ho@nakivo.com) on the Pre-Sales Application - the TC names no role
 * Automation-Type: new
 * Automation-Date: 2026-09-21 (re-automated on the Pre-Sales UI 2026-10-16 - it used to drive the
 *                  steps over RPC)
 * Source TC      : CRM-12930 (Xray Manual Steps, 3 steps)
 * Source version : updated 2026-10-06T12:36:11.467+0300 - re-check before trusting this spec
 * Evidence       : screenshot at the end of each sub-section, a verify-point capture of the refusal
 *                  dialog, afterEach start/end, video.
 *
 * Summary
 * -------
 *   A request saved with Team = Sales Engineers and no Ticket Type is moved to Closed on the stage bar;
 *   the move must be refused with the Classification message and leave the request unchanged.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_3\.1:" --project=O12
 *
 * Source manual TC (CRM-12930, verbatim)
 * --------------------------------------
 *   Pre-condition(s):
 *      1. Signed in to pre-sales-crm-mig.nakivo.site.
 *
 *   Steps to reproduce:
 *      1. Open Pre-sale tickets > Tickets > All Tickets, click New, fill and save, then note the stage
 *         shown on the stage bar as S:
 *            - Title       = AUTO-CRM-12135-TC-16-<runId>-no-type
 *            - Team        = Sales Engineers
 *            - Ticket Type = blank
 *         Expected: The request is created with Ticket Type empty in the Classification group. The
 *         stage S is recorded.
 *      2. Click Closed on the stage bar.
 *         Expected: The move is refused with: Please fill in next to close the ticket: - "Classification" group
 *      3. Refresh the page and re-open the request.
 *         Expected: The stage is still S and Ticket Type is still empty - the refused close changed nothing.
 *
 * What the UI needs that the TC does not say (folded into step 1, measured 2026-10-16)
 * -------------------------------------------------------------------------------------
 *   - The list button reads CREATE, not New.
 *   - Team only offers the teams of the chosen Ticket Type (view domain [('type_ids', 'in', type_id)]):
 *     with Ticket Type blank the Team field offers nothing but "Create ...". So a Ticket Type is picked
 *     first, Team = Sales Engineers is chosen, and Ticket Type is cleared again before saving.
 *   - Description is required by the form ("Missing required fields"):
 *            - Description = Automated check of CRM-12135 TC-16.
 *   - Closed is folded under the stage bar's "More" menu.
 *   Reported to the TC author - the TC as written cannot be followed in this order.
 *
 * Data
 * ----
 *   The request is named AUTO-CRM-12135-TC-16-<runId>-no-type and removed in afterEach by an
 *   administrator session, on a passing, failing or timed-out run. SKIP_CLEANUP_PRESALE=true keeps it.
 */

const TC = 'CRM-12135_3.1';

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Sign in to the Pre-Sales Application (pre-sales-crm-mig.nakivo.site)',
  s1:     'Step 1: Open Pre-sale tickets > Tickets > All Tickets, click New (the button reads CREATE), fill and save, then note the stage shown on the stage bar as S (Team only lists the teams of the chosen Ticket Type, so pick a Ticket Type, choose Team = Sales Engineers, then clear Ticket Type; Description is required by the form)',
  s2:     'Step 2: Click Closed on the stage bar (folded under More)',
  s3:     'Step 3: Refresh the page and re-open the request',
  verify: 'Verification',
} as const;

const TEAM = 'Sales Engineers';
const TYPE_TO_UNLOCK_TEAM = 'Technical assistance';
const REFUSAL = 'Please fill in next to close the ticket: - "Classification" group';

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The marker this run's records carry - set before the first record exists, swept in afterEach. */
let runMarker = '';

test.describe(`${TC} - A request with no Ticket Type cannot be moved to Closed`, () => {
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

  test(`${TC}: A request with no Ticket Type cannot be moved to Closed`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log(`========== ${TC} - A request with no Ticket Type cannot be moved to Closed ==========`);

    const runId = MigPreSalePage.runId();
    const marker = MigPreSalePage.marker('TC-16', runId);
    const title = `${marker}-no-type`;
    const description = 'Automated check of CRM-12135 TC-16.';
    const ui = new MigPreSalePage(page);

    let requestId = 0;
    let stageS = '';
    let typeAfterSave = '';
    let dialog: { title: string; body: string } | undefined;
    let stageWhileRefused = '';
    let stageAfterRefresh = '';
    let typeAfterRefresh = '';

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  Account : ${users.anh_ho_presales_mig.username} (${users.anh_ho_presales_mig.displayName})`);
      const landed = await MigPreSalePage.loginPresalesUi(
        page, users.anh_ho_presales_mig.username, users.anh_ho_presales_mig.password,
      );
      console.log(`  Landed on : ${landed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in to the Pre-Sales Application');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await ui.openPresalesAllTickets();
      await ui.clickPresalesCreate();
      runMarker = marker;
      console.log(`  - Title       : ${title}`);
      console.log(`  - Team        : ${TEAM}  (unlocked by picking Ticket Type = ${TYPE_TO_UNLOCK_TEAM} first)`);
      console.log('  - Ticket Type : blank (cleared again after the Team was chosen)');
      console.log(`  - Description : ${description}  (required by the form)`);
      await ui.fillPresalesChar('name', title);
      await ui.pickPresalesMany2one('type_id', TYPE_TO_UNLOCK_TEAM);
      await ui.pickPresalesMany2one('team_id', TEAM);
      await ui.clearPresalesMany2one('type_id');
      await ui.fillPresalesDescription(description);
      requestId = await ui.savePresalesForm();
      stageS = await ui.presalesCurrentStage();
      typeAfterSave = await ui.presalesFieldText('type_id');
      console.log(`  Request id          : ${requestId}`);
      console.log(`  Request URL         : ${MigPreSalePage.requestUrl(requestId)}`);
      console.log(`  Team after save     : ${await ui.presalesFieldText('team_id')}`);
      console.log(`  Ticket Type (saved) : ${typeAfterSave || '(empty)'}`);
      console.log(`  Stage S             : ${stageS}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1 - request saved with no Ticket Type');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await ui.clickPresalesStage('Closed');
      dialog = await ui.presalesDialog();
      stageWhileRefused = await ui.presalesCurrentStage();
      const shown = (dialog?.body ?? '').replace(/\s+/g, ' ').trim();
      console.log(`  Dialog title : ${dialog?.title ?? '(no dialog)'}`);
      console.log(`  Dialog body  : ${shown || '(no dialog)'}`);
      console.log(`  Stage bar    : ${stageWhileRefused}`);
      // Evidence while the dialog is still up: the refusal AND the empty Ticket Type that caused it.
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - close refused`,
        passed: shown === REFUSAL,
        highlight: ['.modal .modal-content', '.o_form_renderer div[name="type_id"]'],
        lines: [`Expected : ${REFUSAL}`, `Actual   : ${shown || '(no dialog)'}`],
      }).catch(() => {});
      if (dialog) await ui.closePresalesDialog();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 2 - refusal dialog closed');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await ui.reloadPresalesForm();
      stageAfterRefresh = await ui.presalesCurrentStage();
      typeAfterRefresh = await ui.presalesFieldText('type_id');
      console.log(`  Stage after refresh       : ${stageAfterRefresh}`);
      console.log(`  Ticket Type after refresh : ${typeAfterRefresh || '(empty)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 3 - request re-opened');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const shown = (dialog?.body ?? '').replace(/\s+/g, ' ').trim();
      const ok1 = requestId > 0 && typeAfterSave === '' && stageS !== '';
      const ok2 = shown === REFUSAL;
      const ok3 = stageAfterRefresh === stageS && typeAfterRefresh === '';
      const lines = [
        'Verify #1 - The request is created with Ticket Type empty, and its stage S is recorded:',
        '   Expected : saved (id > 0), Ticket Type empty, a stage S on the stage bar',
        `   Actual   : id ${requestId}, Ticket Type "${typeAfterSave}", S = ${stageS || '(none)'}`,
        `   Result   : ${ok1 ? 'PASS' : 'FAIL'}`,
        'Verify #2 - The move to Closed is refused with the Classification message, verbatim:',
        `   Expected : ${REFUSAL}`,
        `   Actual   : ${shown || '(no dialog - the move was NOT refused)'}`,
        `   Result   : ${ok2 ? 'PASS' : 'FAIL'}`,
        'Verify #3 - The refused close changed nothing:',
        `   Expected : stage still ${stageS || 'S'}, Ticket Type still empty (Closed here = the refusal did not hold)`,
        `   Actual   : stage ${stageAfterRefresh || '(none)'}, Ticket Type "${typeAfterRefresh}"`,
        `   Result   : ${ok3 ? 'PASS' : 'FAIL'}`,
      ];
      const passed = ok1 && ok2 && ok3;
      console.log('==================== VERIFY ====================');
      for (const l of lines) console.log(`  ${l}`);
      console.log('===============================================');
      console.log(`OVERALL: ${passed ? 'PASS' : 'FAIL'} - closing without a Ticket Type ${passed ? 'is refused and changes nothing' : 'did NOT behave as specified'}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - request after refresh`,
        passed,
        highlight: ['.o_statusbar_status', '.o_form_renderer div[name="type_id"]'],
        lines,
      }).catch(() => {});

      expect(requestId, 'the request must be saved').toBeGreaterThan(0);
      expect(typeAfterSave, 'the request must be saved with Ticket Type empty').toBe('');
      expect(shown, 'the move to Closed must be refused with the Classification message').toBe(REFUSAL);
      expect(stageAfterRefresh, 'the refused close must leave the stage at S').toBe(stageS);
      expect(typeAfterRefresh, 'the refused close must leave Ticket Type empty').toBe('');
    });
  });
});
