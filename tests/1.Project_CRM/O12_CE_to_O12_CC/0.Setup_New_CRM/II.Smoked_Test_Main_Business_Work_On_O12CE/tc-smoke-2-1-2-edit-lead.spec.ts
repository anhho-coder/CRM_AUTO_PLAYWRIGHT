import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { LeadPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { loginToO12CE, O12CE_DATA } from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Edit a CRM Lead
 * Test Case ID: CRM-12325_2.1.2
 * Automation-Type: new
 * Automation-Date: 2026-08-21
 *
 * Summary:
 *   Verify a saved CRM Lead can be edited on the O12 CE Migration server (crm-mig.nakivo.site) -
 *   changing the State from "Connecticut" to "CA (US)" is persisted after SAVE.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.1.2 "Edit Lead". Section II ports the flow
 * as a FUNCTIONAL smoke - the save time is printed for reference, the gate is the persisted change.
 *
 * O12 CE deviations vs the pre-prod scenario (grounded on crm-mig, 2026-08-21):
 *   - Login as Admin (`users.admin_crm_mig`); CRM > Leads opened by URL hash (menu 138 / action 182).
 *   - "Lead Form" DOES exist on O12 CE as the module field `lead_form` (pre-prod: Studio field
 *     `x_studio_lead_sorce`); the page objects accept both names, so the value is entered normally.
 *   - Both states exist on the Migration server: "Connecticut (US)" and "CA (US)".
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Navigate to CRM > Leads.
 *   3. Click at "CREATE" button.
 *   4. Enter the lead information (Lead name, Contact name = TEST, Email, Country = United States,
 *      State = Connecticut, Sales Team cleared, Salesperson cleared, Create manually = FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Press "EDIT" button.
 *   8. Change the "State" field from "Connecticut" to "CA (US)".
 *   9. Press "SAVE" button.
 *
 * Verification Points:
 *   1. The Lead is saved on O12 CE (a record id appears in the form URL).
 *   2. After the edit + SAVE, the State field reads "CA".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.1\.2:" --project=chromium
 */

const SKIP_CLEANUP_LEAD = true; // true = skip teardown-delete (O12 CE convention: keep created records)

test.describe('CRM-12325_2.1.2 - O12 CE smoke: edit a CRM Lead', () => {

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
    console.log(`Teardown: SKIP_CLEANUP_LEAD=${SKIP_CLEANUP_LEAD} - the created Lead is kept on O12 CE`);
  });

  test('CRM-12325_2.1.2: Verify a CRM Lead can be edited on the O12 CE Migration server', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const homePage = new HomePageMig(page);
    const leadPage = new LeadPage(page);

    const TC_ID = 'CRM-12325_2.1.2';
    let leadName = '';
    let emailAddress = '';
    let leadId = '';
    let editSaveMs = 0;
    let stateAfterEdit = '';

    await loginToO12CE(page);

    await test.step('Step 2: Navigate to CRM > Leads', async () => {
      console.log('\n--- Step 2: Open CRM > Leads (list view) ---');
      await homePage.navigateToLeads();
      console.log('  OK - Leads list view opened');
    });

    await test.step('Step 3: Click at "CREATE" button', async () => {
      console.log('\n--- Step 3: Click CREATE ---');
      await leadPage.clickCreate();
      console.log('  OK - Lead creation form opened');
    });

    await test.step('Step 4: Enter the lead information', async () => {
      leadName = `TEST ${TC_ID} ${leadPage.generateLeadName()}`;
      emailAddress = leadPage.generateEmail();
      console.log('\n--- Step 4: Enter the lead information ---');
      console.log(`  Lead name    : ${leadName}`);
      console.log('  Contact name : TEST');
      console.log(`  Email        : ${emailAddress}`);
      console.log(`  Country      : ${O12CE_DATA.country}`);
      console.log(`  State        : ${O12CE_DATA.state}`);

      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillContactName('TEST');
      await leadPage.fillEmail(emailAddress);
      await leadPage.selectCountry(O12CE_DATA.country);
      await leadPage.selectState(O12CE_DATA.state);
      const teamCleared = await leadPage.clearSalesTeam();
      console.log(`  Sales Team cleared      : ${teamCleared}`);
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  Salesperson cleared     : ${salespersonCleared}`);
      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      console.log(`  "Create manually" FALSE : ${createdManuallyUnchecked}`);
    });

    await test.step('Step 5: Click at "CRM Developer" tab at the bottom of page (Lead form = License)', async () => {
      console.log('\n--- Step 5: CRM Developer tab ---');
      await leadPage.clickCRMDeveloperTab();
      const leadFormFilled = await leadPage.fillLeadForm(O12CE_DATA.leadForm);
      console.log(`  Lead Form : ${O12CE_DATA.leadForm} (field found and filled: ${leadFormFilled})`);
      expect(
        leadFormFilled,
        'the "Lead Form" field must be present in the CRM Developer tab on O12 CE (module field `lead_form`)'
      ).toBeTruthy();
    });

    await test.step('Step 6: Press "SAVE" button', async () => {
      console.log('\n--- Step 6: Save the Lead ---');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete(CommonUtils.waitTimes.savingPage);
      leadId = await leadPage.waitForIdInUrlAndExtract(CommonUtils.waitTimes.savingPage);
      console.log(`  Lead id  : ${leadId}`);
      console.log(`  Lead URL : ${page.url()}`);
      expect(Number(leadId), 'the Lead must be saved on O12 CE before it can be edited').toBeGreaterThan(0);
    });

    await test.step('Step 7: Press "EDIT" button', async () => {
      console.log('\n--- Step 7: Click EDIT ---');
      await leadPage.clickEdit();
      console.log('  OK - form back in edit mode');
    });

    await test.step(`Step 8: Change the "State" field from "${O12CE_DATA.state}" to "${O12CE_DATA.stateEdited}"`, async () => {
      console.log('\n--- Step 8: Change the State ---');
      console.log(`  From : ${O12CE_DATA.state}`);
      console.log(`  To   : ${O12CE_DATA.stateEdited}`);
      await leadPage.selectState(O12CE_DATA.stateEdited);
      console.log('  OK - State re-selected');
    });

    await test.step('Step 9: Press "SAVE" button', async () => {
      console.log('\n--- Step 9: Save the edited Lead ---');
      const start = Date.now();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete(CommonUtils.waitTimes.savingPage);
      editSaveMs = Date.now() - start;
      // Read the saved (readonly) Address block - it renders Street / City / State / Country as text.
      stateAfterEdit = await leadPage.getAddressReadonly();
      console.log(`  Save elapsed        : ${(editSaveMs / 1000).toFixed(2)}s (recorded for reference, not asserted)`);
      console.log(`  Address after edit  : "${stateAfterEdit}"`);
    });

    await test.step('Verification', async () => {
      const stateOk = /CA\s*\(US\)/i.test(stateAfterEdit);
      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - The Lead is saved on O12 CE (record id in the form URL):');
      console.log('     Expected : record id > 0');
      console.log(`     Actual   : id=${leadId}`);
      console.log(`     Result   : ${Number(leadId) > 0 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - After the edit + SAVE the saved Address shows the State "CA":');
      console.log(`     Expected : Address contains "CA" (selected "${O12CE_DATA.stateEdited}")`);
      console.log(`     Actual   : "${stateAfterEdit}"`);
      console.log(`     Result   : ${stateOk ? 'PASS' : 'FAIL'}`);
      console.log(`  Info - Save elapsed after edit: ${(editSaveMs / 1000).toFixed(2)}s`);
      console.log('===============================================');
      console.log(`OVERALL: ${Number(leadId) > 0 && stateOk ? 'PASS' : 'FAIL'} - Lead edit on the O12 CE Migration server`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC_ID} - Lead edited on O12 CE`);

      expect(Number(leadId), 'the Lead must be saved on O12 CE (a record id appears in the form URL)').toBeGreaterThan(0);
      expect(stateOk, `the edited Lead must persist State = "${O12CE_DATA.stateEdited}" (Address read back: "${stateAfterEdit}")`).toBeTruthy();
    });
  });
});
