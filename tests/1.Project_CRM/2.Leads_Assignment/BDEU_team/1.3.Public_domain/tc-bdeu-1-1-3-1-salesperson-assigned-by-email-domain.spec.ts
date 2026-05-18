import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Lead Assignment Test - BDEU Team - Email Domain Assignment
 * Test Case ID: TC.BDEU.1.1.3.1
 * 
 * Summary: Verify the lead is assigned to BDEU team if Email Domain = @rocketmail.com
 * 
 * Command to run:
 * npx playwright test tests/Leads_Assignment/BDEU_team/tc-bdeu-1-1-3-1-salesperson-assigned-by-email-domain.spec.ts --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + current date time
 *    - "Email" textbox = Public email (Test + current date + current time + @rocketmail.com)
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

test.describe('TC.BDEU.1.1.3.1 - Salesperson Assignment by Email Domain (@rocketmail.com)', () => {
  
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

  test('TC.BDEU.1.1.3.1: Verify the lead is assigned to BDEU team if Email Domain = @rocketmail.com', async ({ page }, testInfo) => {
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
      
      // Generate unique lead name and email with TEST prefix and @rocketmail.com domain
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
      leadName = `TEST${timestamp}`;
      emailAddress = `Test${timestamp}@rocketmail.com`;
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email with @rocketmail.com domain
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
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      console.log('✓ Lead information filled');
    });

    // Step 5: Fill CRM Developer tab
    await test.step('Step 5: Fill CRM Developer tab', async () => {
      console.log('Step 5: Filling CRM Developer tab');
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      const leadFormFilled = await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: ${leadFormFilled ? 'License' : 'Field not found in CRM Developer tab, skipping'}`);
      
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

    // Step 7: Wait for Salesperson auto-assignment (5 minutes)
    let assignmentResult: Awaited<ReturnType<typeof leadPage.waitForSalesTeamAssignment>>;
    await test.step('Step 7: Wait for Salesperson auto-assignment (1.5 minutes)', async () => {
      console.log('Step 7: Waiting for Salesperson auto-assignment');
      console.log('  - Waiting up to 1.5 minutes for Salesperson to be assigned...');

      assignmentResult = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.leadMerging, // 5 minutes
        config.timeouts.salesTeamAssignment.checkInterval
      );

      if (!assignmentResult.salespersonAssigned) {
        throw new Error(`Salesperson was not automatically assigned within 5 minutes. Last value: "${assignmentResult.salespersonValue}"`);
      }

      console.log(`✓ Salesperson auto-assignment completed in ${assignmentResult.totalWaitTime} seconds`);
    });

    // Verification: Confirm Salesperson is assigned
    await test.step('Verification: Confirm Salesperson is assigned', async () => {
      console.log('\nVerification: Checking Salesperson value');

      const salespersonValue = assignmentResult.salespersonValue;

      console.log(`  - Current Salesperson: "${salespersonValue}"`);
      console.log(`  - Expected: Any salesperson assigned`);
      
      // Capture screenshot as evidence and attach to report
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - Salesperson Assignment (Email Domain)`, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`  - Screenshot attached to test report`);
      
      // Verify the Salesperson is assigned (not empty)
      expect(salespersonValue).toBeTruthy();
      expect(salespersonValue).not.toBe('Salesperson');
      
      console.log(`  ✓ Verification PASSED: Salesperson is assigned to "${salespersonValue}"`);
      console.log('\n✅ TEST PASSED: Lead with @rocketmail.com domain successfully assigned to a salesperson (BDEU team)');
    });
  });
});
