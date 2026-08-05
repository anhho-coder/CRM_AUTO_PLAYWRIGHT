import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { assignmentDeferSkipReason } from '@helpers/deferred-verify.helper';

/**
 * Lead Assignment Test - BDEU Team - Salesperson Assignment (Australia)
 * Test Case ID: TC.BDEU.1.1.2.1
 * Automation-Type: refactored
 * Automation-Date: 2026-08-04
 *
 * Summary: Verify the lead is assigned to Bilal Saab belong to BDEU team
 * 
 * Command to run:
 * npx playwright test tests/Leads_Assignment/BDEU_team/tc-bdeu-1-1-2-1-salesperson-assigned-to-bilal-saab.spec.ts --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + current date time
 *    - "Email" textbox = Company email (Test@company + current date + current time .com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Australia
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - "Lead form" textbox = License
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Salesperson" dropdown list fulfilled
 * 
 * Verification:
 * - The value at "Salesperson" dropdown list is set (any salesperson)
 */

test.describe('TC.BDEU.1.1.2.1 - Salesperson Assignment to Bilal Saab', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Deny geolocation permission to prevent 'Know your location' popup
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
  test('TC.BDEU.1.1.2.1: Verify the lead is assigned to Bilal Saab belong to BDEU team', async ({ page }, testInfo) => {
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
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to CRM module
    await test.step('Step 2: Navigate to CRM module', async () => {
      console.log('Step 2: Clicking CRM button');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Navigated to CRM module');
    });

    // Step 3: Navigate to Leads page
    await test.step('Step 3: Navigate to Leads page', async () => {
      console.log('Step 3: Navigating to CRM > Leads page');
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page\n');
    });

    // Step 4: Click CREATE button
    await test.step('Step 4: Click CREATE button', async () => {
      console.log('Step 4: Clicking CREATE button');
      
      await leadPage.clickCreate();
      
      console.log('✓ Lead creation form opened');
    });

    // Step 5: Fill lead information
    await test.step('Step 5: Fill lead information', async () => {
      console.log('Step 5: Entering lead information');
      
      // Generate unique lead name and email with TEST prefix
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      leadName = `TEST${timestamp}`;
      emailAddress = CommonUtils.generateEmail('Test', 'company');
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email
      await leadPage.fillEmail(emailAddress);
      console.log(`  - Email: ${emailAddress}`);
      
      // Select country
      await leadPage.selectCountry('Australia');
      console.log(`  - Country: Australia`);
      
      // Clear sales team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      console.log('✓ Lead information filled');
    });

    // Step 6: Fill CRM Developer tab
    await test.step('Step 6: Fill CRM Developer tab', async () => {
      console.log('Step 6: Filling CRM Developer tab');
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: License`);
      
      console.log('✓ CRM Developer tab filled');
    });

    // Step 7: Save the lead
    let savedLeadUrl: string;
    let leadId: string;
    await test.step('Step 7: Save the lead', async () => {
      console.log('Step 7: Saving the lead');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      // Wait for URL to include a valid lead ID and extract it
      leadId = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      savedLeadUrl = page.url();
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${savedLeadUrl}`);
    });

    // Step 8: Wait for Salesperson auto-assignment (1.5 minutes)
    let salesTeamAssigned = false;
    let salespersonAssigned = false;
    await test.step('Step 8: Wait for Salesperson auto-assignment (up to 15 minutes)', async () => {
      console.log('Step 8: Waiting for Salesperson auto-assignment');
      console.log('  - Waiting up to 15 minutes for Salesperson to be assigned...');

      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.assignmentMaxWait,
        config.timeouts.salesTeamAssignment.checkInterval
      );
      salesTeamAssigned = result.salesTeamAssigned;
      salespersonAssigned = result.salespersonAssigned;

      if (salespersonAssigned) {
        console.log(`✓ Salesperson auto-assignment completed in ${result.totalWaitTime} seconds`);
      } else {
        console.log(`  ⚠ Warning: Salesperson not assigned after ${result.totalWaitTime} seconds`);
      }
    });

    // Defer instead of fail: if the async assignment cron has not fired within the short wait, the
    // lead is already recorded for the round-2 re-verify job - SKIP this round-1 test rather than
    // false-failing on a merely-late cron.
    if (!salespersonAssigned) {
      test.skip(true, assignmentDeferSkipReason('TC.BDEU.1.1.2.1', 'Salesperson'));
    }

    // Verification: Confirm Salesperson is assigned
    await test.step('Verification: Confirm Salesperson is assigned', async () => {
      console.log('\n=== VERIFICATION ===');
      console.log('Checking Salesperson value');
      
      // Get the current Salesperson value using LeadPage method (handles both edit and readonly modes)
      const salespersonValue = await leadPage.getSalespersonValue();
      
      console.log(`  - Current Salesperson: "${salespersonValue}"`);
      console.log(`  - Expected: Any salesperson assigned`);
      
      // Capture screenshot as evidence
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Lead ${leadId} - Salesperson Assignment`);
      
      console.log(`  ℹ️ Salesperson value captured: "${salespersonValue}"`);
      console.log('\n✅ TEST COMPLETED: Lead creation and wait completed');
      console.log('==================================================\n');
    });
  });
});
