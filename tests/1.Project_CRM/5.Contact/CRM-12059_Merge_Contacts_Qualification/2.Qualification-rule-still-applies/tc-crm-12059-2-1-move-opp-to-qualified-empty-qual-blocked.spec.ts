import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_2.1
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-10
 *  Actor           : Thomas Semerich (normal Sales role, per the dev's "as a normal sales role").
 *                    The gate is a role-independent server-side Validation Error. No records are
 *                    created and the blocked move persists nothing, so there is no teardown (admin
 *                    would only be needed if a record had to be cleaned up).
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Regression guard for the CRM-12059 fix (dev "Test case 2"): the everyday Qualification-info
 *    rule must still apply. Opens a HISTORICAL inbound Opportunity that has EMPTY Qualification info
 *    and sits BELOW the Qualified stage, tries to move it to "Qualified", and asserts it is blocked
 *    with the "fill in Qualification info" Validation Error and does NOT advance - confirming only
 *    the merge case was relaxed, not the rule itself.
 *
 *    Why a historical Opp: the gate only applies to genuine INBOUND leads (verified: three freshly
 *    UI-created opps - Manager/free-trial, and normal sales role with Created-manually FALSE - all
 *    advanced to Qualified with NO block). So this regression uses a known reproducing inbound Opp
 *    (per the tester's own reproduction). Safe: it verifies the Opp is empty-qual + below Qualified
 *    BEFORE attempting the move, so the blocked save never mutates the record (it stays put).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_2.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (dev verification comment, Khang - "Test case 2 - Regression"):
 *    Pre-condition(s):
 *      I.  Log in (owner/admin) and open a historical inbound Opportunity that has EMPTY
 *          Qualification info and is BELOW the Qualified stage.
 *    Steps to reproduce:
 *      1. Try to move the Opportunity to the "Qualified" stage (Qualification info still empty).
 *    Verification / Expected Result:
 *      Still blocked with "Please fill in all necessary fields in \"Qualification info\" tab before
 *      moving the opportunity to the Qualified stage or further"; the Opp does NOT advance.
 * =============================================================================================
 */

const QUAL_ERROR_RE = /necessary fields|Qualification info/i;

/**
 * Known reproducing inbound Opportunity (empty Qualification info, below Qualified). Repoint this
 * to any other inbound Opp with empty Qual info if this record's data ever changes. It is NOT
 * modified by this test (the move is blocked, so the record stays put).
 */
const REPRO_OPP_URL = `${baseUrl}web#id=1024113&action=152&model=crm.lead&view_type=form&menu_id=111`;

test.describe('CRM-12059_2.1 - Empty Qualification info still blocks moving an inbound Opp to Qualified', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_2.1: Verify moving an Opportunity to Qualified with empty Qualification info is still blocked', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login and open a historical inbound Opp with empty Qualification info
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login and open a historical inbound Opp (empty Qualification info, below Qualified)', async () => {
      console.log(`\n=== PRE-CONDITION I: Login as ${users.sale_ic_thomas.displayName} (normal sales role) and open the reproducing Opp ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await opportunityPage.goto(REPRO_OPP_URL, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await opportunityPage.dismissErrorDialog().catch(() => {});
      await page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
      console.log(`  ✓ Opened Opp: ${page.url()}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - reproducing Opp opened').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Pre-condition II: SAFETY - confirm the Opp is empty-qual and below Qualified before moving
    // ----------------------------------------------------------------------------------------
    let origStage = '';
    await test.step('Pre-condition II: Confirm the Opp has empty Qualification info and is below Qualified', async () => {
      origStage = await opportunityPage.getActiveStageName();
      console.log(`  - Current stage: "${origStage}"`);
      await opportunityPage.clickEdit().catch(() => {});
      await opportunityPage.clickQualificationInfoTab().catch(() => {});
      const emptyQual = await opportunityPage.isQualificationInfoEmpty().catch(() => false);
      console.log(`  - Qualification info empty: ${emptyQual}`);
      // Guard: only proceed if the record is genuinely empty-qual and NOT already Qualified, so the
      // move will be blocked (never advancing/mutating the historical Opp).
      expect(emptyQual, 'the reproducing Opp must have EMPTY Qualification info (repoint REPRO_OPP_URL otherwise)').toBe(true);
      expect(origStage.toUpperCase(), 'the reproducing Opp must be BELOW the Qualified stage').not.toBe('QUALIFIED');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - empty qual confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let blockingText = '';
    let optimisticStage = '';
    await test.step('Step 1: Try to move the Opp to the Qualified stage (Qualification info empty)', async () => {
      await opportunityPage.selectStage('Qualified');
      await opportunityPage.clickSave().catch((e) => console.log(`  ℹ SAVE note: ${(e as Error).message}`));
      blockingText = await opportunityPage.getBlockingPopupText(CommonUtils.waitTimes.savingPage);
      optimisticStage = await opportunityPage.getActiveStageName(); // optimistic (unsaved) UI highlight
      console.log(`  - Blocking popup: "${blockingText.slice(0, 260)}"`);
      console.log(`  - Optimistic (unsaved) stage highlight: "${optimisticStage}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - Qualified move blocked').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    let persistedStage = '';
    await test.step('Verification: the move to Qualified is blocked with the Qualification-info message', async () => {
      const blocked = QUAL_ERROR_RE.test(blockingText);

      // The blocked save leaves the status bar showing the OPTIMISTIC (unsaved) "Qualified" highlight.
      // Dismiss the error, discard the rejected edit, reload, and read the PERSISTED stage to confirm
      // the Opp did not actually advance.
      await opportunityPage.dismissBlockingPopup().catch(() => {});
      await opportunityPage.discardFormIfInEditMode().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await opportunityPage.dismissErrorDialog().catch(() => {});
      persistedStage = await opportunityPage.getActiveStageName();
      const notAdvanced = persistedStage.toUpperCase() !== 'QUALIFIED';
      const overall = blocked && notAdvanced;

      console.log('==================== VERIFY ====================');
      console.log(`  Opp                : ${REPRO_OPP_URL}`);
      console.log(`  Original stage     : ${origStage}`);
      console.log('  Verify #1 - a Validation Error mentions Qualification info:');
      console.log('     Expected : text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${blockingText ? `FOUND: "${blockingText.slice(0, 200)}"` : 'NOT FOUND'}`);
      console.log(`     Result   : ${blocked ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the Opp did NOT actually advance (persisted stage after reload):');
      console.log('     Expected : persisted stage != "Qualified"');
      console.log(`     Actual   : optimistic="${optimisticStage || '(unknown)'}" | persisted="${persistedStage || '(unknown)'}"`);
      console.log(`     Result   : ${notAdvanced ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - the everyday Qualification-info rule ${overall ? 'still blocks the move to Qualified' : 'did NOT block as expected'}`);

      expect(blocked, `A Qualification-info Validation Error must block the move to Qualified. Popup was: "${blockingText}"`).toBe(true);
      expect(notAdvanced, `The Opp must NOT persist at Qualified. Persisted stage after reload was: "${persistedStage}"`).toBe(true);
    });
  });

  test.afterEach(async ({ page }) => {
    // The move was blocked, so nothing persisted. Discard any lingering edit state so the historical
    // Opp is left exactly as found (no cleanup/delete - this is a shared historical record).
    const opp = new OpportunityPage(page);
    await opp.dismissBlockingPopup().catch(() => {});
    await opp.discardFormIfInEditMode().catch(() => {});
  });
});
