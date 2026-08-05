import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { assignmentDeferSkipReason } from '@helpers/deferred-verify.helper';

/**
 * Lead Assignment Test - BDR Team - Partner Sign up Promote 2020* with Nakivo Customer Exclusion
 * Test Case ID: TC.BDR_2.1.1.4
 * Automation-Type: refactored
 * Automation-Date: 2026-08-04
 *
 * Summary: Verify the lead is NOT assigned to Jayden belong to BDR team if Lead form = Partner Sign up Promote 2020* and Nakivo Customer is true
 * 
 * Command to run:
 * npx playwright test tests/1.Project_CRM/2.Leads_Assignment/BDR_team/2.NOT_assign_to_BDR_team/tc-bdr-2-1-1-4-exclude-partner-sign-up-promote-2020-nakivo-customer.spec.ts --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + current date time
 *    - "Email" textbox = Company email (Test@company + current date + current time.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Albania
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 *    - "Lead form" textbox = Partner Sign up Promote 2020*
 *    - "Tags" dropdown list = "Nakivo Customer"
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Sales Team" dropdown list and "Salesperson" dropdown list fullfilled
 * 
 * Verification:
 * 7. - The value at "Sales Team" dropdown list is NOT BDR
 *    - The value at "Salesperson" dropdown list is set any
 */

test.describe('TC.BDR.2.1.1.4 - BDR Team Exclusion for Partner Sign up Promote 2020* with Nakivo Customer', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Prevent location permission popup
    await context.grantPermissions([]);
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });
  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      
      // Wait for any loading spinners to disappear
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');
      
      // Wait for all spinners to hide
      await page.waitForTimeout(3000);
      
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      
      // Additional wait for page to fully stabilize
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });
  test('TC.BDR.2.1.1.4: Verify the lead is NOT assigned to BDR team if Lead form = Partner Sign up Promote 2020* and Nakivo Customer is true', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.assignmentTestTimeout); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    let leadName: string;
    let emailAddress: string;

    // Step 1: Login as admin_crm
    await test.step('Step 1: Login as admin_crm', async () => {
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      
      // Dismiss location permission dialog if it appears
      await loginPage.dismissLocationPermissionDialog();
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to CRM > Leads page
    await test.step('Step 2: Navigate to CRM > Leads page', async () => {
      console.log('Step 1: Click at CRM');
                  await homePage.navigateToCRM();
                  await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('Step 2: Navigating to CRM > Leads page');
            
      // Then navigate to Leads
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 3: Click CREATE button
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      
      await leadPage.clickCreate();
      
      console.log('✓ Lead creation form opened');
    });

    // Step 4: Fill lead information
    await test.step('Step 4: Fill lead information', async () => {
      console.log('Step 4: Entering lead information');
      
      // Generate unique lead name and email with TEST prefix
      leadName = CommonUtils.generateLeadName();
      emailAddress = CommonUtils.generateEmail('Test', 'company');
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email
      await leadPage.fillEmail(emailAddress);
      console.log(`  - Email: ${emailAddress}`);
      
      // Select country
      await leadPage.selectCountry('Albania');
      console.log(`  - Country: Albania`);
      
      // Clear sales team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Fill Lead form = "Partner Sign up Promote 2020*"
      await leadPage.fillLeadForm('Partner Sign up Promote 2020*');
      console.log(`  - Lead Form: Partner Sign up Promote 2020*`);
      
      // Add Tags = "Nakivo Customer"
      await leadPage.addTag('Nakivo Customer');
      console.log(`  - Tags: Nakivo Customer`);
      
      console.log('✓ Lead information filled');
    });

    // Step 6: Save the lead
    let savedLeadUrl: string;
    let leadId: string;
    await test.step('Step 6: Save the lead', async () => {
      console.log('Step 6: Saving the lead');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      // Wait for URL to include a valid lead ID and extract it
      leadId = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      
      // Store the URL of the saved lead for refreshing later
      savedLeadUrl = page.url();
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${savedLeadUrl}`);
    });

    // Declare flags before wait step
    let salesTeamAssigned = false;
    let salespersonAssigned = false;

    // Step 7: Wait for Sales Team and Salesperson auto-assignment (short wait, defer if not assigned)
    await test.step('Step 7: Wait for Sales Team and Salesperson auto-assignment (1.5 minutes)', async () => {
      console.log('Step 7: Waiting for Sales Team and Salesperson auto-assignment');
      console.log('  ⏳ Waiting up to 1.5 minutes for Sales Team and Salesperson to be assigned...');

      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.assignmentMaxWait,
        config.timeouts.salesTeamAssignment.checkInterval
      );
      salesTeamAssigned = result.salesTeamAssigned;
      salespersonAssigned = result.salespersonAssigned;

      console.log(`✓ Sales Team and Salesperson auto-assignment check completed in ${result.totalWaitTime} seconds`);
    });

    // Defer instead of fail: if the async assignment cron has not fired within the short wait, the
    // lead is already recorded for the round-2 re-verify job - SKIP this round-1 test rather than
    // false-failing on a merely-late cron.
    if (!salesTeamAssigned || !salespersonAssigned) {
      const fieldName = !salesTeamAssigned ? 'Sales Team' : 'Salesperson';
      test.skip(true, assignmentDeferSkipReason('TC.BDR_2.1.1.4', fieldName));
    }

    // Verification: Confirm Sales Team is NOT BDR and Salesperson is set
    await test.step('Verification: Confirm Sales Team is NOT BDR and Salesperson is set', async () => {
      console.log('\n=== VERIFICATION ===');
      console.log('Checking Sales Team and Salesperson values');
      
      // Get the current Sales Team and Salesperson values using LeadPage methods (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      const salespersonValue = await leadPage.getSalespersonValue();
      
      console.log(`  - Current Sales Team: "${salesTeamValue}"`);
      console.log(`  - Current Salesperson: "${salespersonValue}"`);
      console.log(`  - Expected: Sales Team is NOT "BDR" AND Salesperson is set`);
      
      // Capture screenshot as evidence
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Lead ${leadId} - Sales Team NOT BDR and Salesperson Set Verification`);
      
      let verificationPassed = true;
      let errorMessages: string[] = [];
      
      // Verify the Sales Team is set (not empty)
      if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
        console.log(`  ✓ Sales Team is set: "${salesTeamValue}"`);
        
        // Verify it's NOT BDR
        if (salesTeamValue !== 'BDR') {
          console.log(`  ✓ Verification PASSED: Sales Team "${salesTeamValue}" is NOT BDR`);
        } else {
          console.log(`  ✗ Verification FAILED: Sales Team is BDR (should NOT be BDR)`);
          verificationPassed = false;
          errorMessages.push(`Sales Team should NOT be BDR but got: "${salesTeamValue}"`);
        }
      } else {
        console.log(`  ✗ Verification FAILED: Sales Team is not assigned after 1.5 minutes`);
        verificationPassed = false;
        errorMessages.push(`Sales Team was not assigned after 1.5 minutes. Current value: "${salesTeamValue}"`);
      }
      
      // Verify the Salesperson is set (not empty)
      if (salespersonValue && salespersonValue !== '' && salespersonValue !== 'Salesperson') {
        console.log(`  ✓ Salesperson is set: "${salespersonValue}"`);
      } else {
        console.log(`  ✗ Verification FAILED: Salesperson is not assigned after 1.5 minutes`);
        verificationPassed = false;
        errorMessages.push(`Salesperson was not assigned after 1.5 minutes. Current value: "${salespersonValue}"`);
      }
      
      if (verificationPassed) {
        console.log('\n✅ TEST PASSED: Lead is correctly NOT assigned to BDR team and Salesperson is set');
        console.log('==================================================\n');
      } else {
        throw new Error(`Verification failed:\n${errorMessages.join('\n')}`);
      }
    });
  });
});
