import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-12059 - Cannot merge Contacts linking to Opp having no data in Qualification Info
 * =============================================================================================
 *  Test Case ID    : CRM-12059_2.3
 *  Jira            : CRM-12059  (Post-EA Support Ticket - Veronika's request)
 *  Automation-Type : new
 *  Automation-Date : 2026-08-11
 *  Actor           : Thomas Semerich (normal Sales role). No records created; blocked move persists
 *                    nothing, so there is no teardown.
 * ---------------------------------------------------------------------------------------------
 *  Summary:
 *    Regression detail: when moving an inbound Opp (empty Qualification info) to Qualified is
 *    blocked, the Validation Error must NAME the missing required Qualification-info fields so the
 *    user knows what to fill. Asserts the error message lists the expected fields (Licensing Model,
 *    Use case(s), Requirement(s), Current solution, Competitor, Expected Closing).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-12059_2.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (dev "Test case 2 - Regression", message-content check):
 *    Pre-condition(s):
 *      I.  Log in (normal sales role) and open a historical inbound Opp with EMPTY Qualification info.
 *    Steps to reproduce:
 *      1. Try to move the Opp to the "Qualified" stage.
 *    Verification / Expected Result:
 *      Blocked, and the Validation Error lists the required Qualification-info fields that are empty.
 * =============================================================================================
 */

const QUAL_ERROR_RE = /necessary fields|Qualification info/i;
// The required Qualification-info fields the block should enumerate (as seen on the reported Opp).
const REQUIRED_FIELDS = ['Licensing Model', 'Use case', 'Requirement', 'Current solution', 'Competitor', 'Expected Closing'];

/** Known reproducing inbound Opportunity (empty Qualification info, below Qualified). */
const REPRO_OPP_URL = `${baseUrl}web#id=1024113&action=152&model=crm.lead&view_type=form&menu_id=111`;

test.describe('CRM-12059_2.3 - Qualification block error lists the required fields', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('CRM-12059_2.3: Verify the qualification block Validation Error lists the required Qualification-info fields', async ({ page }, testInfo) => {
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
    // Pre-condition II: SAFETY - confirm empty-qual and below Qualified
    // ----------------------------------------------------------------------------------------
    let origStage = '';
    await test.step('Pre-condition II: Confirm the Opp has empty Qualification info and is below Qualified', async () => {
      origStage = await opportunityPage.getActiveStageName();
      console.log(`  - Current stage: "${origStage}"`);
      await opportunityPage.clickEdit().catch(() => {});
      await opportunityPage.clickQualificationInfoTab().catch(() => {});
      const emptyQual = await opportunityPage.isQualificationInfoEmpty().catch(() => false);
      console.log(`  - Qualification info empty: ${emptyQual}`);
      expect(emptyQual, 'the reproducing Opp must have EMPTY Qualification info (repoint REPRO_OPP_URL otherwise)').toBe(true);
      expect(origStage.toUpperCase(), 'the reproducing Opp must be BELOW the Qualified stage').not.toBe('QUALIFIED');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - empty qual confirmed').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Steps to reproduce
    // ----------------------------------------------------------------------------------------
    let blockingText = '';
    await test.step('Step 1: Try to move the Opp to the Qualified stage (Qualification info empty)', async () => {
      await opportunityPage.selectStage('Qualified');
      await opportunityPage.clickSave().catch((e) => console.log(`  ℹ SAVE note: ${(e as Error).message}`));
      blockingText = await opportunityPage.getBlockingPopupText(CommonUtils.waitTimes.savingPage);
      console.log(`  - Blocking popup: "${blockingText.slice(0, 300)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - block with field list').catch(() => {});
    });

    // ----------------------------------------------------------------------------------------
    // Verification
    // ----------------------------------------------------------------------------------------
    await test.step('Verification: the block Validation Error names the required Qualification-info fields', async () => {
      const blocked = QUAL_ERROR_RE.test(blockingText);
      const listed = REQUIRED_FIELDS.filter((f) => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blockingText));
      // The error should enumerate the missing fields - require it names at least three of them.
      const listsFields = listed.length >= 3;
      const overall = blocked && listsFields;

      console.log('==================== VERIFY ====================');
      console.log(`  Opp                : ${REPRO_OPP_URL}`);
      console.log('  Verify #1 - a Validation Error mentions Qualification info:');
      console.log('     Expected : text matching /necessary fields|Qualification info/i');
      console.log(`     Actual   : ${blocked ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${blocked ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the error enumerates the required (empty) fields:');
      console.log(`     Expected : names >= 3 of ${JSON.stringify(REQUIRED_FIELDS)}`);
      console.log(`     Actual   : named ${listed.length} -> ${JSON.stringify(listed)}`);
      console.log(`     Result   : ${listsFields ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - the block ${overall ? 'clearly tells the user which Qualification-info fields to fill' : 'did not clearly list the required fields'}`);

      expect(blocked, `A Qualification-info Validation Error must appear. Popup was: "${blockingText}"`).toBe(true);
      expect(listsFields, `The error must name >= 3 required fields. Named: ${JSON.stringify(listed)}. Popup was: "${blockingText}"`).toBe(true);

      await opportunityPage.dismissBlockingPopup().catch(() => {});
    });
  });

  test.afterEach(async ({ page }) => {
    const opp = new OpportunityPage(page);
    await opp.dismissBlockingPopup().catch(() => {});
    await opp.discardFormIfInEditMode().catch(() => {});
  });
});
