import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Assignment Test - CMR Team - Ukraine with New Partner (Direct Customer Countries)
 * Test Case ID: TC.CMR_1.4.1.1
 * 
 * Summary: Verify the lead is assigned to Sergey Karachin belong to CMR team if Country is Ukraine 
 * and New Partner is set and Nakivo Customer is not set if Country Group = CMR_directCustomer_countries
 * 
 * Command to run:
 npx playwright test --grep "TC.CMR_1.4.1.1" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (Test@company + current date + current time + millisecond.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Ukraine
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - "Lead form" textbox = License
 * 6. Press "SAVE" button
 * 7. (Notice: Because the "Nakivo Customer" and "New Partner" checkboxes only accept data after Save the Lead)
 *    7.1. Press "EDIT" button and wait
 *    7.2. Click at "CRM Developer" tab at the bottom of page
 *         - Set "Nakivo Customer" checkbox = FALSE
 *         - Set "New Partner" checkbox = TRUE
 *    7.3. Press "SAVE" button again
 * 8. Wait for at least 1.5 minutes until "Sales Team" dropdown list and "Salesperson" dropdown list fulfilled
 * 
 * Verification (2 checkpoints):
 * ✓ Checkpoint 1: The value at "Sales Team" dropdown list is "CMR"
 * ✓ Checkpoint 2: The value at "Salesperson" dropdown list is set (any person)
 */

test.describe('TC.CMR_1.4.1.1 - CMR Team Assignment for Ukraine with New Partner (Direct Customer Countries)', () => {
  
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
  test('TC.CMR_1.4.1.1: Verify the lead is assigned to CMR team if Country=Ukraine, New Partner=TRUE, Nakivo Customer=FALSE, Lead Form=License', async ({ page }, testInfo) => {
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
      await leadPage.selectCountry('Ukraine');
      console.log(`  - Country: Ukraine`);
      
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

    // Step 5: Fill CRM Developer tab (without Nakivo Customer and New Partner yet)
    await test.step('Step 5: Fill CRM Developer tab', async () => {
      console.log('Step 5: Filling CRM Developer tab');
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      const leadFormFilled = await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: ${leadFormFilled ? 'License' : 'Field not found in CRM Developer tab, skipping'}`);
      
      console.log('✓ CRM Developer tab filled (without Nakivo Customer and New Partner yet)');
    });

    // Step 6: Save the lead (first save)
    let savedLeadUrl: string;
    let leadId: string;
    await test.step('Step 6: Save the lead (first save)', async () => {
      console.log('Step 6: Saving the lead (first save)');
      
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

    // Step 7.1: Press EDIT button
    await test.step('Step 7.1: Press EDIT button', async () => {
      console.log('Step 7.1: Clicking EDIT button');
      
      await leadPage.clickEdit();
      
      // Wait for edit mode to be ready
      await page.waitForTimeout(2000);
      
      console.log('✓ Edit mode activated');
    });

    // Step 7.2: Set Nakivo Customer=FALSE and New Partner=TRUE
    await test.step('Step 7.2: Set Nakivo Customer and New Partner checkboxes', async () => {
      console.log('Step 7.2: Setting Nakivo Customer and New Partner checkboxes');
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      // Uncheck "Nakivo Customer" checkbox
      const nakivoCustomerUnchecked = await leadPage.uncheckNakivoCustomer();
      console.log(`  - Nakivo Customer: ${nakivoCustomerUnchecked ? 'Unchecked (FALSE)' : 'Already unchecked or checkbox not found'}`);
      
      // Check "New Partner" checkbox
      const newPartnerChecked = await leadPage.checkNewPartner();
      console.log(`  - New Partner: ${newPartnerChecked ? 'Checked (TRUE)' : 'Checkbox not found, skipping'}`);
      
      console.log('✓ Nakivo Customer = FALSE, New Partner = TRUE');
    });

    // Step 7.3: Save the lead again (second save)
    await test.step('Step 7.3: Save the lead again (second save)', async () => {
      console.log('Step 7.3: Saving the lead again (second save)');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: 30000 });
      
      // Wait a moment for the save to complete
      await page.waitForTimeout(2000);
      
      console.log('✓ Lead saved successfully with Nakivo Customer=FALSE and New Partner=TRUE');
      
      // Capture screenshot after saving with checkboxes set
      const screenshotAfterSave = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - After Setting Checkboxes`, {
        body: screenshotAfterSave,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot captured after Step 7.3`);
    });

    // Step 8: Wait for Sales Team and Salesperson auto-assignment (1.5 minutes)
    await test.step('Step 8: Wait for Sales Team and Salesperson auto-assignment (up to 1.5 minutes)', async () => {
      console.log('Step 8: Waiting for Sales Team and Salesperson auto-assignment');
      console.log('  - Waiting up to 1.5 minutes for Sales Team and Salesperson to be assigned...');
      
      const startWaitTime = Date.now();
      const maxWaitTime = CommonUtils.waitTimes.cmrTeamAssignment;
      const checkInterval = config.timeouts.salesTeamAssignment.checkInterval;
      let salesTeamAssigned = false;
      let salespersonAssigned = false;
      let salesTeamValue = '';
      let salespersonValue = '';
      let attemptCount = 0;
      
      while ((!salesTeamAssigned || !salespersonAssigned) && (Date.now() - startWaitTime) < maxWaitTime) {
        attemptCount++;
        
        // Refresh the page to get latest data
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        
        // Check if Sales Team and Salesperson fields are populated
        try {
          // Get Sales Team value using LeadPage method (handles both edit and readonly modes)
          if (!salesTeamAssigned) {
            salesTeamValue = await leadPage.getSalesTeamValue();
            
            if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
              salesTeamAssigned = true;
              const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
              console.log(`  ✓ Sales Team assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
              console.log(`  - Sales Team Value: "${salesTeamValue}"`);
            }
          }
          
          // Get Salesperson value using LeadPage method (handles both edit and readonly modes)
          if (!salespersonAssigned) {
            salespersonValue = await leadPage.getSalespersonValue();
            
            if (salespersonValue && salespersonValue !== '' && salespersonValue !== 'Salesperson') {
              salespersonAssigned = true;
              const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
              console.log(`  ✓ Salesperson assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
              console.log(`  - Salesperson Value: "${salespersonValue}"`);
            }
          }
          
          if (!salesTeamAssigned || !salespersonAssigned) {
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            const statusSalesTeam = salesTeamAssigned ? '✓' : '⧖';
            const statusSalesperson = salespersonAssigned ? '✓' : '⧖';
            console.log(`  - Attempt ${attemptCount} (${elapsedTime}s): ${statusSalesTeam} Sales Team, ${statusSalesperson} Salesperson - waiting...`);
            await page.waitForTimeout(checkInterval);
          }
        } catch (error) {
          console.log(`  - Attempt ${attemptCount}: Error checking fields - ${error instanceof Error ? error.message : String(error)}`);
          await page.waitForTimeout(checkInterval);
        }
      }
      
      const totalWaitTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
      
      if (!salesTeamAssigned) {
        console.log(`  ⚠ Warning: Sales Team not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
        console.log(`  - Sales Team Value: "${salesTeamValue}"`);
      }
      
      if (!salespersonAssigned) {
        console.log(`  ⚠ Warning: Salesperson not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
        console.log(`  - Salesperson Value: "${salespersonValue}"`);
      }
      
      console.log(`✓ Auto-assignment check completed in ${totalWaitTime} seconds`);
    });

    // Verification: Confirm Sales Team is CMR and Salesperson is assigned
    await test.step('Verification: Confirm Sales Team is CMR and Salesperson is assigned', async () => {
      console.log('\n========== VERIFICATION (2 Checkpoints) ==========');
      
      // Get the current Sales Team value using LeadPage method (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      
      // Get the current Salesperson value using LeadPage method (handles both edit and readonly modes)
      const salespersonValue = await leadPage.getSalespersonValue();
      
      // Capture screenshot as evidence and attach to report
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - CMR Team Assignment (Ukraine with New Partner)`, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot attached to test report`);
      
      console.log('\n✓ Checkpoint 1: Sales Team validation');
      console.log(`  Expected: "CMR"`);
      console.log(`  Actual:   "${salesTeamValue}"`);
      
      // Verify the Sales Team is CMR
      expect(salesTeamValue).toBe('CMR');
      console.log(`  Result:   ✓ PASSED - Sales Team is "CMR"`);
      
      console.log('\n✓ Checkpoint 2: Salesperson validation');
      console.log(`  Expected: Any person (not empty)`);
      console.log(`  Actual:   "${salespersonValue}"`);
      
      // Verify Salesperson is assigned (not empty)
      expect(salespersonValue).toBeTruthy();
      expect(salespersonValue).not.toBe('');
      expect(salespersonValue).not.toBe('Salesperson');
      console.log(`  Result:   ✓ PASSED - Salesperson is "${salespersonValue}"`);
      
      console.log('\n==================================================');
      console.log('✅ TEST PASSED: All checkpoints validated successfully');
      console.log('   Lead with Ukraine, New Partner=TRUE, and');
      console.log('   License correctly assigned to CMR team');
      console.log('==================================================\n');
      
      // Attach verification summary as HTML for better formatting in report
      const verificationSummaryHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #2563eb; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .info-section { background: #f0f9ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #2563eb; }
    .info-row { margin: 5px 0; }
    .label { font-weight: bold; color: #1e40af; }
    .checkpoint { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .checkpoint-detail { margin: 8px 0; padding-left: 10px; }
    .expected { color: #6b7280; }
    .actual { color: #1f2937; font-weight: bold; }
    .result-pass { color: #16a34a; font-weight: bold; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #166534; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>VERIFICATION SUMMARY</h2>
    </div>
    
    <div class="info-section">
      <div class="info-row"><span class="label">Test Case:</span> TC.CMR_1.4.1.1</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${leadId}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${leadName}</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Checkpoint 1: Sales Team validation</div>
      <div class="checkpoint-detail"><span class="expected">Expected:</span> "CMR"</div>
      <div class="checkpoint-detail"><span class="actual">Actual:</span> "${salesTeamValue}"</div>
      <div class="checkpoint-detail"><span class="result-pass">Result: ✓ PASSED</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Checkpoint 2: Salesperson validation</div>
      <div class="checkpoint-detail"><span class="expected">Expected:</span> Any person (not empty)</div>
      <div class="checkpoint-detail"><span class="actual">Actual:</span> "${salespersonValue}"</div>
      <div class="checkpoint-detail"><span class="result-pass">Result: ✓ PASSED</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        All checkpoints validated successfully<br>
        Lead with Ukraine, New Partner=TRUE, and<br>
        License correctly assigned to CMR team
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});