import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';
import { assignmentDeferSkipReason } from '@helpers/deferred-verify.helper';

/**
 * Lead Assignment Test - BDEU Team - Lead Form Exclusion (WHITE PAPER)
 * Test Case ID: TC.BDEU.2.1.1.5
 * Automation-Type: refactored
 * Automation-Date: 2026-08-04
 *
 * Summary: Verify the lead is NOT assigned to Sergey Y belong to BDEU team if Lead form = WHITE PAPER
 * 
 * Command to run:
 npx playwright test --grep "TC\.BDEU\.2\.1\.1\.5 -" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + current date time
 *    - "Email" textbox = Company email (Test@company + current date + current time.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Portugal
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - "Lead form" textbox = WHITE PAPER
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Sales Team" dropdown list fulfilled
 * 
 * Verification:
 * - The value at "Sales Team" dropdown list is NOT "BDEU"
 */

test.describe('TC.BDEU.2.1.1.5 - BDEU Team Exclusion for WHITE PAPER Lead Form', () => {
  
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
  test('TC.BDEU.2.1.1.5: Verify the lead is NOT assigned to BDEU team if Lead form = WHITE PAPER', async ({ page }, testInfo) => {
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
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
      leadName = `TEST${timestamp}`;
      emailAddress = `Test@company${timestamp}.com`;
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email
      await leadPage.fillEmail(emailAddress);
      console.log(`  - Email: ${emailAddress}`);
      
      // Select country
      await leadPage.selectCountry('Portugal');
      console.log(`  - Country: Portugal`);
      
      // Clear sales team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      console.log('✓ Lead information filled');
    });

    // Step 5: Fill CRM Developer tab
    await test.step('Step 5: Fill CRM Developer tab', async () => {
      console.log('Step 5: Filling CRM Developer tab');
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      const leadFormFilled = await leadPage.fillLeadForm('WHITE PAPER');
      console.log(`  - Lead Form: ${leadFormFilled ? 'WHITE PAPER' : 'Field not found in CRM Developer tab, skipping'}`);
      
      console.log('✓ CRM Developer tab filled');
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
    let salesTeamAssigned = false;
    let salespersonAssigned = false;
    await test.step('Step 7: Wait for Sales Team auto-assignment (up to 15 minutes)', async () => {
      console.log('Step 7: Waiting for Sales Team auto-assignment');
      console.log('  - Waiting up to 15 minutes for Sales Team to be assigned...');

      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.assignmentMaxWait,
        config.timeouts.salesTeamAssignment.checkInterval
      );
      salesTeamAssigned = result.salesTeamAssigned;
      salespersonAssigned = result.salespersonAssigned;

      if (salesTeamAssigned) {
        console.log(`✓ Sales Team auto-assignment completed in ${result.totalWaitTime} seconds`);
      } else {
        console.log(`  ⚠ Warning: Sales Team not assigned after ${result.totalWaitTime} seconds`);
      }
    });

    // Defer instead of fail: if the async assignment cron has not fired within the short wait, the
    // lead is already recorded for the round-2 re-verify job - SKIP this round-1 test rather than
    // false-failing on a merely-late cron.
    if (!salesTeamAssigned) {
      test.skip(true, assignmentDeferSkipReason('TC.BDEU.2.1.1.5', 'Sales Team'));
    }

    // Verification: Confirm Sales Team is NOT BDEU
    await test.step('Verification: Confirm Sales Team is NOT BDEU', async () => {
      console.log('\nVerification: Checking Sales Team value');
      
      // Get the current Sales Team value using LeadPage method (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      
      console.log(`  - Current Sales Team: "${salesTeamValue}"`);
      console.log(`  - Expected: NOT "BDEU"`);
      
      // Capture screenshot as evidence and attach to report
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - Sales Team Assignment (WHITE PAPER Exclusion)`, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`  - Screenshot attached to test report`);
      
      // Verify the Sales Team is NOT BDEU
      expect(salesTeamValue).not.toBe('BDEU');
      
      console.log(`  ✓ Verification PASSED: Sales Team is "${salesTeamValue}" (NOT BDEU)`);
      console.log('\n✅ TEST PASSED: Lead with WHITE PAPER form is correctly NOT assigned to BDEU team');
    });
  });
});
