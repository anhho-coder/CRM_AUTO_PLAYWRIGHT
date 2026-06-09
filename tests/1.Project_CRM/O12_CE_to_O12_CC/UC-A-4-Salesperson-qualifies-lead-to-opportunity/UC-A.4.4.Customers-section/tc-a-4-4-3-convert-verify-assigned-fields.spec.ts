import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead-to-Opportunity Conversion Test - Verify assigned fields on the converted Opportunity
 * Test Case ID: TC.-A.4.4.3
 *
 * Summary: Verify the converting process of a qualified lead to Opportunity is successful AND
 *          the assigned/preserved fields (Sales Team, Salesperson, Lead form, Email) are correct
 *          on the resulting Opportunity.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.4\.4\.3:" --project=chromium
 *
 * Pre-condition / Steps:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on the top menu select "Leads" > "Leads"
 * 3. On "Leads" page, click "CREATE"
 * 4. Enter the following information:
 *    - Lead name        = TEST Lead 1 + TC ID
 *    - Company Name     = Company Name Lead 1
 *    - Email            = Company email (Test@company + current date + current time .com)
 *    - Country          = United States
 *    - State            = Connecticut
 *    - Sales Team       = cleared
 *    - Salesperson      = cleared
 *    - Created manually = FALSE
 *    - CRM Developer tab > Lead form = License
 * 5. Press "SAVE" and wait for a minute (lets the async Contact creation complete before converting)
 * 6. Press "CONVERT TO OPPORTUNITY"
 * 7. Conversion Action  = "Convert to opportunity"
 * 8. Assign this opportunity to:
 *    - Sales Team       = CMR
 *    - Salesperson      = Sergey Karachin
 * 9. Customers          = "Link to an existing customer"
 * 10. Press "CREATE OPPORTUNITY" and wait
 *
 * Verification:
 * - Stage "New" appears on the Opportunity form, AND
 * - Sales Team = CMR, Salesperson = Sergey Karachin, Lead form = License, Email is preserved.
 */

const SKIP_CLEANUP_OPP = false; // Toggle to true to skip deleting the created Opportunity

test.describe('TC.-A.4.4.3 - Convert qualified Lead to Opportunity and verify assigned fields', () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, let Odoo loading spinners settle before Playwright's auto-screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
    // Cleanup: delete the Opportunity created by this test
    if (!SKIP_CLEANUP_OPP && createdOppUrl) {
      console.log('Cleanup: deleting created Opportunity');
      await CommonUtils.deleteRecordByUrl(page, createdOppUrl, testInfo).catch(() => {});
    }
  });

  test('TC.-A.4.4.3: Verify the converting process of a qualified lead to Opportunity and the assigned fields are correct', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    // Test data (captured at test scope for verification in Step 11)
    let emailAddress = '';

    // Pre-condition 1: Login and navigate to CRM
    await test.step('Step 1: Login and click CRM', async () => {
      console.log('Step 1: Logging in and navigating to CRM');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log('✓ Logged in and CRM opened');
    });

    // Pre-condition 2: Navigate to Leads > Leads
    await test.step('Step 2: Navigate to Leads', async () => {
      console.log('Step 2: Navigating to CRM > Leads');
      await homePage.navigateToLeads();
      console.log('✓ Navigated to Leads page');
    });

    // Pre-condition 3: Open the create form
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
    });

    // Pre-condition 4: Enter the lead information
    await test.step('Step 4: Enter lead information', async () => {
      const leadName = 'TEST Lead 1 TC.-A.4.4.3';
      emailAddress = leadPage.generateEmail();

      console.log('Step 4: Entering lead information');
      console.log(`  - Lead name: ${leadName}`);
      console.log('  - Company Name: Company Name Lead 1');
      console.log(`  - Email: ${emailAddress}`);
      console.log('  - Country: United States');
      console.log('  - State: Connecticut');

      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillCompanyName('Company Name Lead 1');
      await leadPage.fillEmail(emailAddress);
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Connecticut');

      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(salesTeamCleared ? '  - Sales Team: Cleared' : '  - Sales Team: Field not found, skipping');

      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(salespersonCleared ? '  - Salesperson: Cleared' : '  - Salesperson: Field not found, skipping');

      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      console.log(createdManuallyUnchecked ? '  - Created Manually: Unchecked (FALSE)' : '  - Created Manually: Field not found, skipping');

      await leadPage.clickCRMDeveloperTab();
      const leadFormFilled = await leadPage.fillLeadForm('License');
      console.log(leadFormFilled ? '  - Lead Form: License' : '  - Lead Form: Field not found, skipping');
    });

    // Pre-condition 5: Save the lead and wait a minute for the async Contact creation to complete
    await test.step('Step 5: Save the lead and wait for a minute', async () => {
      console.log('Step 5: Saving the lead');
      // Re-confirm "Create manually" stays FALSE before saving
      await leadPage.uncheckCreatedManually();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  - Waiting 1 minute for the Contact to be created in the background...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      console.log('✓ Lead saved and waited 1 minute');
    });

    // Step 6: Open the conversion wizard
    await test.step('Step 6: Click CONVERT TO OPPORTUNITY', async () => {
      console.log('Step 6: Clicking CONVERT TO OPPORTUNITY');
      await leadPage.clickConvertToOpportunity();
      console.log('✓ Conversion wizard opened');
    });

    // Step 7: Select the conversion action
    await test.step('Step 7: Select Conversion Action - Convert to opportunity', async () => {
      console.log('Step 7: Selecting "Convert to opportunity" radio');
      await leadPage.selectConversionActionConvert();
      console.log('✓ Conversion Action set to "Convert to opportunity"');
    });

    // Step 8: Assign the opportunity
    await test.step('Step 8: Assign Sales Team and Salesperson', async () => {
      console.log('Step 8: Assigning the opportunity');
      console.log('  - Sales Team: CMR');
      await leadPage.selectConvertSalesTeam('CMR');
      console.log('  - Salesperson: Sergey Karachin');
      await leadPage.selectConvertSalesperson('Sergey Karachin');
      console.log('✓ Sales Team and Salesperson assigned');
    });

    // Step 9: Customer section - link to an existing customer
    await test.step('Step 9: Select "Link to an existing customer"', async () => {
      console.log('Step 9: Selecting "Link to an existing customer"');
      await leadPage.selectLinkToExistingCustomer();
      console.log('✓ Customer option set to "Link to an existing customer"');
    });

    // Step 10: Create the opportunity
    await test.step('Step 10: Click CREATE OPPORTUNITY', async () => {
      console.log('Step 10: Clicking CREATE OPPORTUNITY');
      await leadPage.clickCreateOpportunity();
      createdOppUrl = page.url();
      console.log(`✓ Opportunity creation submitted (URL: ${createdOppUrl})`);
    });

    // Step 11: Verify conversion success + assigned/preserved fields
    await test.step('Step 11: Verify Stage "New" and the assigned fields on the Opportunity', async () => {
      console.log('Step 11: Verifying Stage "New" and assigned fields');
      const stageNewVisible = await opportunityPage.isStageNewVisible();

      const salesTeam = await opportunityPage.getSalesTeamValue();
      const salesperson = await opportunityPage.getSalespersonValue();
      const leadForm = await opportunityPage.getLeadFormValue();
      const email = await opportunityPage.getEmailReadonly();

      console.log(`  - Stage New visible: ${stageNewVisible}`);
      console.log(`  - Sales Team: "${salesTeam}"`);
      console.log(`  - Salesperson: "${salesperson}"`);
      console.log(`  - Lead form: "${leadForm}"`);
      console.log(`  - Email: "${email}" (expected to contain "${emailAddress}")`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.4.3 - Converted Opportunity (assigned fields)');

      expect(stageNewVisible, 'Stage "New" should appear after a successful Lead-to-Opportunity conversion').toBeTruthy();
      expect(salesTeam, 'Sales Team should be CMR on the converted Opportunity').toContain('CMR');
      expect(salesperson, 'Salesperson should be Sergey Karachin on the converted Opportunity').toContain('Sergey Karachin');
      expect(leadForm, 'Lead form should be License on the converted Opportunity').toContain('License');
      expect(email.toLowerCase(), 'Email should be preserved on the converted Opportunity').toContain(emailAddress.toLowerCase());
      console.log('✅ Conversion successful and all assigned fields verified');
    });
  });
});
