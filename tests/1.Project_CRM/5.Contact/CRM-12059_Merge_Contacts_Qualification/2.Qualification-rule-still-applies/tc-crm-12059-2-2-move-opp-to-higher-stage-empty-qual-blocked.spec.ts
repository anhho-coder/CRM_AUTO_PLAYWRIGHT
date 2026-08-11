import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_2.2
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-11
 *  Actor           : Thomas Semerich (normal Sales role). Role-independent server-side Validation
 *                    Error; no records created, blocked move persists nothing, so there is no teardown.
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Regression guard: the everyday Qualification-info rule blocks moving an Opp to the Qualified
 *    stage OR FURTHER. This variant moves a historical inbound Opp (empty Qualification info) to a
 *    stage BEYOND Qualified ("Hot Deal") and asserts it is blocked with the same Validation Error
 *    and does NOT advance - confirming "or further" is enforced, not just the Qualified step.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_2.2:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (dev "Test case 2 - Regression", boundary variant):
 *    Pre-condition(s):
 *      I.  Log in (normal sales role) and open a historical inbound Opp with EMPTY Qualification
 *          info, below the Hot Deal stage.
 *    Steps to reproduce:
 *      1. Try to move the Opp to the "Hot Deal" stage (a stage beyond Qualified).
 *    Verification / Expected Result:
 *      Blocked with "...before moving the opportunity to the Qualified stage or further"; the Opp
 *      does NOT advance to Hot Deal.
 * =============================================================================================
 */

const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
const TARGET_STAGE = 'Hot Deal';

/** Known reproducing inbound Opportunity (empty Qualification info, below the target stage). */
const REPRO_OPP_URL = `${baseUrl}web#id=1024113&action=152&model=crm.lead&view_type=form&menu_id=111`;

test.describe('CRM-12059_2.2 - Empty Qualification info still blocks moving an inbound Opp beyond Qualified', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_2.2: Verify moving an Opportunity to a stage beyond Qualified (Hot Deal) with empty Qualification info is blocked', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);

    // ----------------------------------------------------------------------------------------
    // Pre-condition I: Login and open a historical inbound Opp with empty Qualification info
    // ----------------------------------------------------------------------------------------
    await test.step('Pre-condition I: Login and open a historical inbound Opp (empty Qualification info)', async () => {
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
    // Pre-condition II: SAFETY - confirm empty-qual and not already at the target stage
    // ----------------------------------------------------------------------------------------
    let origStage = '';
    await test.step('Pre-condition II: Confirm the Opp has empty Qualification info and is not already at the target stage', async () => {
      origStage = await opportunityPage.getActiveStageName();
      console.log(`  - Current stage: "${origStage}"`);
      await opportunityPage.clickEdit().catch(() => {});
      await opportunityPage.clickQualificationInfoTab().catch(() => {});
      const emptyQual = await opportunityPage.isQualificationInfoEmpty().catch(() => false);
      console.log(`  - Qualification info empty: ${emptyQual}`);
      expect(emptyQual, 'the reproducing Opp must have EMPTY Qualification info (repoint REPRO_OPP_URL otherwise)').toBe(true);
      expect(origStage.toUpperCase(), `the reproducing Opp must be below "${TARGET_STAGE}"`).not.toBe(TARGET_STAGE.toUpperCase());
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - empty qual confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let blockingText = '';
    let optimisticStage = '';
    await test.step(`Step 1: Try to move the Opp to the "${TARGET_STAGE}" stage (Qualification info empty)`, async () => {
      await opportunityPage.selectStage(TARGET_STAGE);
      await opportunityPage.clickSave().catch((e) => console.log(`  ℹ SAVE note: ${(e as Error).message}`));
      blockingText = await opportunityPage.getBlockingPopupText(CommonUtils.waitTimes.savingPage);
      optimisticStage = await opportunityPage.getActiveStageName();
      console.log(`  - Blocking popup: "${blockingText.slice(0, 260)}"`);
      console.log(`  - Optimistic (unsaved) stage highlight: "${optimisticStage}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - move beyond Qualified blocked').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    let persistedStage = '';
    await test.step(`Verification: the move to "${TARGET_STAGE}" is blocked with the Qualification-info message`, async () => {
      const blocked = QUAL_ERROR_RE.test(blockingText);

      await opportunityPage.dismissBlockingPopup().catch(() => {});
      await opportunityPage.discardFormIfInEditMode().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await opportunityPage.dismissErrorDialog().catch(() => {});
      persistedStage = await opportunityPage.getActiveStageName();
      const notAdvanced = persistedStage.toUpperCase() !== TARGET_STAGE.toUpperCase();
      const overall = blocked && notAdvanced;

      console.log('==================== VERIFY ====================');
      console.log(`  Opp                : ${REPRO_OPP_URL}`);
      console.log(`  Original stage     : ${origStage}   Target: ${TARGET_STAGE}`);
      console.log('  Verify #1 - a Validation Error mentions Qualification info:');
      console.log('     Expected : text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${blockingText ? `FOUND: "${blockingText.slice(0, 200)}"` : 'NOT FOUND'}`);
      console.log(`     Result   : ${blocked ? 'PASS' : 'FAIL'}`);
      console.log(`  Verify #2 - the Opp did NOT advance to "${TARGET_STAGE}" (persisted stage after reload):`);
      console.log(`     Expected : persisted stage != "${TARGET_STAGE}"`);
      console.log(`     Actual   : optimistic="${optimisticStage || '(unknown)'}" | persisted="${persistedStage || '(unknown)'}"`);
      console.log(`     Result   : ${notAdvanced ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - the "Qualified stage or further" rule ${overall ? 'still blocks the move beyond Qualified' : 'did NOT block as expected'}`);

      expect(blocked, `A Qualification-info Validation Error must block the move to ${TARGET_STAGE}. Popup was: "${blockingText}"`).toBe(true);
      expect(notAdvanced, `The Opp must NOT persist at ${TARGET_STAGE}. Persisted stage after reload was: "${persistedStage}"`).toBe(true);
    });
  });

  test.afterEach(async ({ page }) => {
    // Blocked move persists nothing; discard any lingering edit so the historical Opp is left as found.
    const opp = new OpportunityPage(page);
    await opp.dismissBlockingPopup().catch(() => {});
    await opp.discardFormIfInEditMode().catch(() => {});
  });
});
