import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  O12CE_DATA,
  O12ceOpportunity,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit a CRM Opportunity
 * Test Case ID: CRM-12325_2.2.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a saved CRM Opportunity can be edited on the O12 CE Migration server - changing the State
 *   from "Connecticut" to "CA (US)" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.2.2 "Edit Opp". Section II ports it as a
 * FUNCTIONAL smoke (elapsed time printed for reference; the gate is the persisted change).
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Pipeline opened in list view by URL hash.
 *   - "Lead Form" DOES exist on O12 CE as the module field `lead_form` (pre-prod: Studio field
 *     `x_studio_lead_sorce`); the page objects accept both names, so the value is entered normally.
 *   - Both states exist on the Migration server: "Connecticut (US)" and "CA (US)".
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps (1-7 = the shared Opportunity chain):
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Opp name, Contact name, Email, Country = United States,
 *      State = Connecticut, Sales Team cleared, Salesperson cleared, Create manually = FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Press "EDIT" button.
 *   9. Change the "State" field from "Connecticut" to "CA (US)".
 *  10. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Opportunity is saved on O12 CE (a record id appears in the form URL).
 *   2. After the edit + SAVE, the saved Address shows the State "CA".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.2\.2:" --project=chromium
 */

const SKIP_CLEANUP_OPP = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.2.2 - O12 CE smoke: edit a CRM Opportunity', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`Teardown: SKIP_CLEANUP_OPP=${SKIP_CLEANUP_OPP} - the created Opportunity is kept on O12 CE`);
  });

  test('CRM-12325_2.2.2: Verify a CRM Opportunity can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    const TC_ID = 'CRM-12325_2.2.2';
    let opp: O12ceOpportunity | null = null;
    let addressAfterEdit = '';
    let editSaveMs = 0;

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC_ID);

    await test.step('Step 8: Press "EDIT" button', async () => {
      console.log('\n--- Step 8: Click EDIT ---');
      const inEditMode = await opportunityPage.clickEdit();
      expect(inEditMode, 'the Opportunity form must switch to edit mode (EDIT button found and clicked)').toBeTruthy();
      console.log('  OK - form back in edit mode');
    });

    await test.step(`Step 9: Change the "State" field from "${O12CE_DATA.state}" to "${O12CE_DATA.stateEdited}"`, async () => {
      console.log('\n--- Step 9: Change the State ---');
      console.log(`  From : ${O12CE_DATA.state}`);
      console.log(`  To   : ${O12CE_DATA.stateEdited}`);
      const stateSelected = await opportunityPage.selectState(O12CE_DATA.stateEdited);
      expect(stateSelected, `the State "${O12CE_DATA.stateEdited}" must be selectable on the O12 CE Opportunity form`).toBeTruthy();
      console.log('  OK - State re-selected');
    });

    await test.step('Step 10: Press "SAVE" button', async () => {
      console.log('\n--- Step 10: Save the edited Opportunity ---');
      const start = Date.now();
      await opportunityPage.saveAndWaitForCompletion();
      editSaveMs = Date.now() - start;
      addressAfterEdit = await opportunityPage.getAddressReadonly();
      console.log(`  Save elapsed       : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Address after edit : "${addressAfterEdit}"`);
    });

    await test.step('Verification', async () => {
      const savedOk = Number(opp?.oppId) > 0;
      const stateOk = /CA\s*\(US\)/i.test(addressAfterEdit);

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Opportunity is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${opp?.oppId}`);
      console.log(`     Result   : ${savedOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the saved Address shows the State "CA":');
      console.log(`     Expected : Address contains "CA" (selected "${O12CE_DATA.stateEdited}")`);
      console.log(`     Actual   : "${addressAfterEdit}"`);
      console.log(`     Result   : ${stateOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${savedOk && stateOk ? 'PASS' : 'FAIL'} - Opportunity edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Opportunity edited on O12 CE`);

      expect(savedOk, 'the Opportunity must be saved on O12 CE (a record id appears in the form URL)').toBeTruthy();
      expect(stateOk, `the edited Opportunity must persist State = "${O12CE_DATA.stateEdited}" (Address read back: "${addressAfterEdit}")`).toBeTruthy();
    });
  });
});
