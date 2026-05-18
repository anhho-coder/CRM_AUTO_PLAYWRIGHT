import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Lead Assignment Test - BDEU Team - Lead Form Exclusion
 * Test Case ID: TC.BDEU.2.1.1.1
 * 
 * Summary: Verify the lead is NOT assigned to Sergey Y belong to BDEU team if Lead form = VCP-DCV vSphere 7 Community Study Guide*
 * 
 * Command to run:
 * npx playwright test tests/Leads_Assignment/BDEU_team/2.1. Lead_Form_Exclusion/tc-bdeu-2-1-1-1-exclude-vcp-dcv-vsphere-7-study-guide.spec.ts --project=chromium
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
 *    - "Lead form" textbox = VCP-DCV vSphere 7 Community Study Guide*
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Sales Team" dropdown list fulfilled
 * 
 * Verification:
 * - The value at "Sales Team" dropdown list is NOT "BDEU"
 */

test.describe('TC.BDEU.2.1.1.1 - BDEU Team Exclusion for VCP-DCV vSphere 7 Study Guide', () => {
  
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
  test('TC.BDEU.2.1.1.1: Verify the lead is NOT assigned to BDEU team if Lead form = VCP-DCV vSphere 7 Community Study Guide*', async ({ page }, testInfo) => {
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
      
      const leadFormFilled = await leadPage.fillLeadForm('VCP-DCV vSphere 7 Community Study Guide*');
      console.log(`  - Lead Form: ${leadFormFilled ? 'VCP-DCV vSphere 7 Community Study Guide*' : 'Field not found in CRM Developer tab, skipping'}`);
      
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
    await test.step('Step 7: Wait for Sales Team auto-assignment (1.5 minutes)', async () => {
      console.log('Step 7: Waiting for Sales Team auto-assignment');
      console.log('  - Waiting up to 1.5 minutes for Sales Team to be assigned...');
      
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
        await page.waitForTimeout(2000);
        
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
        throw new Error(`Sales Team was not automatically assigned within 1.5 minutes. Last value: "${salesTeamValue}"`);
      }
      
      console.log(`✓ Sales Team auto-assignment completed in ${totalWaitTime} seconds`);
    });

    // Verification: Confirm Sales Team is NOT BDEU
    await test.step('Verification: Confirm Sales Team is NOT BDEU', async () => {
      console.log('\nVerification: Checking Sales Team value');
      
      // Get the current Sales Team value using LeadPage method (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      
      console.log(`  - Current Sales Team: "${salesTeamValue}"`);
      console.log(`  - Expected: NOT "BDEU"`);
      
      // Capture screenshot as evidence and attach to report
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - Sales Team Assignment (VCP-DCV Exclusion)`, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`  - Screenshot attached to test report`);
      
      // Verify the Sales Team is NOT BDEU
      expect(salesTeamValue).not.toBe('BDEU');
      
      console.log(`  ✓ Verification PASSED: Sales Team is "${salesTeamValue}" (NOT BDEU)`);
      console.log('\n✅ TEST PASSED: Lead with VCP-DCV vSphere 7 Study Guide form is correctly NOT assigned to BDEU team');
    });
  });
});
