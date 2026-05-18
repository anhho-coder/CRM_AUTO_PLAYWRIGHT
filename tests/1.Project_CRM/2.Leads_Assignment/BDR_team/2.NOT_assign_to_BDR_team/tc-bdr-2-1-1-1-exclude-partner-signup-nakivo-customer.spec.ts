import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Assignment Test - BDR Team - Partner Signup with Nakivo Customer Exclusion
 * Test Case ID: TC.BDR_2.1.1.1
 * 
 * Summary: Verify the lead is NOT assigned to Jayden belong to BDR team if Lead form = Partner Signup and Nakivo Customer is true
 * 
 * Command to run:
 * npx playwright test tests/1.Project_CRM/2.Leads_Assignment/BDR_team/2.NOT_assign_to_BDR_team/tc-bdr-2-1-1-1-exclude-partner-signup-nakivo-customer.spec.ts --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + current date time
 *    - "Email" textbox = Company email (with template Test@company + current date + current time.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Albania
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 *    - "Tags" dropdown list = "Nakivo Customer"
 *    - "Lead form" textbox = Partner Signup
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Sales Team" dropdown list fullfilled
 * 
 * Verification:
 * 7. - The value at "Sales Team" dropdown list is NOT BDR
 */

test.describe('TC.BDR_2.1.1.1 - BDR Team Exclusion for Partner Signup with Nakivo Customer', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(1000);
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
  test('TC.BDR_2.1.1.1: Verify the lead is NOT assigned to BDR team if Lead form = Partner Signup and Nakivo Customer is true', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
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
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to CRM > Leads page
    await test.step('Step 2: Navigate to CRM > Leads page', async () => {
      console.log('Step 1: Click at CRM');
                  await homePage.navigateToCRM();
                  await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('Step 2: Navigating to CRM > Leads page');
      
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
      emailAddress = CommonUtils.generateEmail();
      
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
      
      // Add Tags = "Nakivo Customer"
      await leadPage.addTag('Nakivo Customer');
      console.log(`  - Tags: Nakivo Customer`);
      
      // Fill Lead form = "Partner Signup"
      await leadPage.fillLeadForm('Partner Signup');
      console.log(`  - Lead Form: Partner Signup`);
      
      console.log('✓ Lead information filled');
    });

    // Step 6: Save the lead
    let savedLeadUrl: string;
    let leadId: string;
    await test.step('Step 6: Save the lead', async () => {
      console.log('Step 6: Saving the lead');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: 30000 });
      
      // Wait for URL to include a valid lead ID (not empty)
      await page.waitForFunction(() => {
        const url = window.location.href;
        const match = url.match(/[?&#]id=(\d+)/);
        return match && match[1];
      }, { timeout: 60000 });
      
      // Store the URL of the saved lead for refreshing later
      savedLeadUrl = page.url();
      const idMatch = savedLeadUrl.match(/[?&#]id=(\d+)/);
      leadId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${savedLeadUrl}`);
    });

    // Step 7: Wait for Sales Team auto-assignment (1.5 minutes)
    await test.step('Step 7: Wait for Sales Team auto-assignment (1.5 minutes)', async () => {
      console.log('Step 7: Waiting for Sales Team auto-assignment');
      console.log('  ⏳ Waiting up to 1.5 minutes for Sales Team to be assigned...');
      
      const startWaitTime = Date.now();
      const maxWaitTime = 90000; // 1.5 minutes in milliseconds
      const checkInterval = config.timeouts.salesTeamAssignment.checkInterval;
      let salesTeamAssigned = false;
      let salesTeamValue = '';
      let attemptCount = 0;
      
      while (!salesTeamAssigned && (Date.now() - startWaitTime) < maxWaitTime) {
        attemptCount++;
        
        // Refresh the page to get latest data
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
        
        // Check if Sales Team field is populated
        try {
          // Get Sales Team value using LeadPage method (handles both edit and readonly modes)
          salesTeamValue = await leadPage.getSalesTeamValue();
          
          if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
            salesTeamAssigned = true;
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            console.log(`  ✓ Sales Team assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
            console.log(`  - Sales Team Value: "${salesTeamValue}"`);
          } else {
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            console.log(`  - Attempt ${attemptCount} (${elapsedTime}s): Sales Team not yet assigned, waiting...`);
            await page.waitForTimeout(checkInterval);
          }
        } catch (error) {
          console.log(`  - Attempt ${attemptCount}: Error checking Sales Team field - ${error instanceof Error ? error.message : String(error)}`);
          await page.waitForTimeout(checkInterval);
        }
      }
      
      const totalWaitTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
      
      if (!salesTeamAssigned) {
        console.log(`  ⚠ Warning: Sales Team not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
        console.log(`  ℹ️ Continuing with verification to document current state...`);
      } else {
        console.log(`✓ Sales Team auto-assignment completed in ${totalWaitTime} seconds`);
      }
    });

    // Verification: Confirm Sales Team is NOT BDR
    await test.step('Verification: Confirm Sales Team is NOT BDR', async () => {
      console.log('\n=== VERIFICATION ===');
      console.log('Checking Sales Team value');
      
      // Get the current Sales Team value using LeadPage method (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      
      console.log(`  - Current Sales Team: "${salesTeamValue}"`);
      console.log(`  - Expected: Sales Team is set AND NOT "BDR"`);
      
      // Capture screenshot as evidence
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Lead ${leadId} - Sales Team NOT BDR Verification`);
      
      // Verify the Sales Team is set (not empty)
      if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
        console.log(`  ✓ Sales Team is set: "${salesTeamValue}"`);
        
        // Verify it's NOT BDR
        if (salesTeamValue !== 'BDR') {
          console.log(`  ✓ Verification PASSED: Sales Team "${salesTeamValue}" is NOT BDR`);
          console.log('\n✅ TEST PASSED: Lead is correctly NOT assigned to BDR team');
          console.log('==================================================\n');
        } else {
          console.log(`  ✗ Verification FAILED: Sales Team is BDR (should NOT be BDR)`);
          throw new Error(`Sales Team should NOT be BDR but got: "${salesTeamValue}"`);
        }
      } else {
        console.log(`  ✗ Verification FAILED: Sales Team is not assigned after 1.5 minutes`);
        console.log(`  ✗ Expected: Sales Team should be assigned to a team other than BDR`);
        throw new Error(`Sales Team was not assigned after 1.5 minutes. Current value: "${salesTeamValue}"`);
      }
    });
  });
});
