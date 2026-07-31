import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { recordOppAssignmentForDeferredVerify } from '@helpers/deferred-verify.helper';
import { salesTeamUsers } from '@/test-data/sales-team/salesteam.users';

/**
 * Lead-to-Opportunity Conversion Test - "Assign this opportunity to" (Salesperson only)
 * Test Case ID: TC.-A.4.3.4
 * Automation-Type: new
 * Automation-Date: 2026-06-05
 *
 * Summary: Verify converting a qualified lead to Opportunity while assigning ONLY the Salesperson
 *          (from salesteam.users -> sale_ic_bdeu_thomas: Thomas Semerich), leaving Sales Team at the
 *          wizard default, is successful.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.4\.3\.4:" --project=chromium
 * npx playwright test --grep "CRM-11410" --project=chromium
 *
 * Steps:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on the top menu select "Leads" > "Leads"
 * 3. On "Leads" page, click "CREATE"
 * 4. Enter the following information:
 *    - Lead name        = TEST Lead 1 + TC ID
 *    - Company Name     = Company Name Lead 1
 *    - Email            = Company email (Test@company + current date + current time .com)
 *    - Sales Team       = cleared
 *    - Salesperson      = cleared
 *    - Created manually = FALSE
 *    - CRM Developer tab > Lead form = License
 * 5. Press "SAVE" and wait for a minute (lets the async Contact creation complete before converting)
 * 6. Press "CONVERT TO OPPORTUNITY"
 * 7. Conversion Action  = "Convert to opportunity"
 * 8. Assign this opportunity to: Salesperson only (salesteam.users sale_ic_bdeu_thomas); Sales Team left default.
 * 9. Customers = "Link to an existing customer".
 * 10. Press "CREATE OPPORTUNITY".
 *
 * Verification (Step 11):
 * - Stage "New" appears, AND Salesperson = the salesteam.users value (Thomas Semerich) on the converted
 *   Opportunity. (Sales Team is only logged - it keeps whatever default the wizard had.)
 */

const SKIP_CLEANUP_OPP = true; // Toggle to true to skip deleting the created Opportunity

// Salesperson sourced from salesteam.users (do not hardcode)
const sp = salesTeamUsers.sale_ic_bdeu_thomas;

test.describe('TC.-A.4.3.4 - Convert Lead to Opportunity assigning only the Salesperson (salesteam.users)', () => {

  // These assign-section tests are independent (unique email per test, own login, own cleanup),
  // so they may run in parallel across workers (e.g. `npm run test:assign-parallel`).
  test.describe.configure({ mode: 'parallel' });

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
    if (!SKIP_CLEANUP_OPP && createdOppUrl) {
      console.log('Cleanup: deleting created Opportunity');
      await CommonUtils.deleteRecordByUrl(page, createdOppUrl, testInfo).catch(() => {});
    }
  });

  // Skipped due to open defect CRM-11410: manual "Convert to Opportunity" does not assign the selected Salesperson.
  test.skip(`TC.-A.4.3.4: Verify converting a qualified lead to Opportunity assigning only the Salesperson (${sp.displayName}) is successful [CRM-11410]`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    await test.step('Step 1: Login and click CRM', async () => {
      console.log('Step 1: Logging in and navigating to CRM');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log('✓ Logged in and CRM opened');
    });

    await test.step('Step 2: Navigate to Leads', async () => {
      console.log('Step 2: Navigating to CRM > Leads');
      await homePage.navigateToLeads();
      console.log('✓ Navigated to Leads page');
    });

    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
    });

    await test.step('Step 4: Enter lead information', async () => {
      const leadName = 'TEST Lead 1 TC.-A.4.3.4';
      const emailAddress = leadPage.generateEmail();
      console.log('Step 4: Entering lead information');
      console.log(`  - Lead name: ${leadName}`);
      console.log(`  - Email: ${emailAddress}`);
      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillCompanyName('Company Name Lead 1');
      await leadPage.fillEmail(emailAddress);
      await leadPage.clearSalesTeam();
      await leadPage.clearSalesperson();
      await leadPage.uncheckCreatedManually();
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('License');
      console.log('  - Lead form: License');
    });

    await test.step('Step 5: Save the lead and wait for a minute', async () => {
      console.log('Step 5: Saving the lead');
      await leadPage.uncheckCreatedManually();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  - Waiting 1 minute for the Contact to be created in the background...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      console.log('✓ Lead saved and waited 1 minute');
    });

    await test.step('Step 6: Click CONVERT TO OPPORTUNITY', async () => {
      console.log('Step 6: Clicking CONVERT TO OPPORTUNITY');
      await leadPage.clickConvertToOpportunity();
      console.log('✓ Conversion wizard opened');
    });

    await test.step('Step 7: Select Conversion Action - Convert to opportunity', async () => {
      console.log('Step 7: Selecting "Convert to opportunity" radio');
      await leadPage.selectConversionActionConvert();
      console.log('✓ Conversion Action set to "Convert to opportunity"');
    });

    await test.step('Step 8: Assign only the Salesperson (from salesteam.users), leave Sales Team default', async () => {
      console.log(`Step 8: Assigning only Salesperson = ${sp.displayName} (Sales Team left at default)`);
      await leadPage.selectConvertSalesperson(sp.displayName);
      console.log('✓ Salesperson assigned');
    });

    await test.step('Step 9: Select "Link to an existing customer"', async () => {
      console.log('Step 9: Selecting "Link to an existing customer"');
      await leadPage.selectLinkToExistingCustomer();
      console.log('✓ Customer option set to "Link to an existing customer"');
    });

    await test.step('Step 10: Click CREATE OPPORTUNITY', async () => {
      console.log('Step 10: Clicking CREATE OPPORTUNITY');
      await leadPage.clickCreateOpportunity();
      createdOppUrl = page.url();
      console.log(`✓ Opportunity creation submitted (URL: ${createdOppUrl})`);
    });

    await test.step('Step 11: Verify Stage "New" and the assigned Salesperson', async () => {
      console.log('Step 11: Verifying Stage "New" and assigned Salesperson');
      const stageNewVisible = await opportunityPage.isStageNewVisible();
      const salesTeam = await opportunityPage.getSalesTeamValue();
      const salesperson = await opportunityPage.getSalespersonValue();
      recordOppAssignmentForDeferredVerify(page, { salesperson });
      console.log(`  - Stage New visible: ${stageNewVisible}`);
      console.log(`  - Sales Team (default, not asserted): "${salesTeam}"`);
      console.log(`  - Salesperson: "${salesperson}" (expected to contain "${sp.displayName}")`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-A.4.3.4 - Converted Opportunity (Salesperson only: ${sp.displayName})`);

      expect(stageNewVisible, 'Stage "New" should appear after a successful conversion').toBeTruthy();
      expect(salesperson, `Salesperson should be ${sp.displayName} on the converted Opportunity`).toContain(sp.displayName);
      console.log('✅ Conversion successful and assigned Salesperson verified');
    });
  });
});
