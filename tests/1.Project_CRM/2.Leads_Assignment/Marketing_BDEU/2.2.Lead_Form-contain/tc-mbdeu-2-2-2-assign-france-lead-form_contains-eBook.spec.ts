import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Assignment Test - Marketing BDEU Team - Romania with Lead Form contains "eBook"
 * Test Case ID: TC.MBDEU_2.2.2
 * 
 * Summary: Verify the lead is assigned to Marketing - BDEU team with Country = Romania if Lead Form contains "eBook"
 * 
 * Tags: @smoke-test
 *
 * Command to run:
 * npx playwright test "tests/1.Project_CRM/2.Leads_Assignment/Marketing_BDEU/2.2.Lead_Form-contain/tc-mbdeu-2-2-2-assign-france-lead-form_contains-eBook.spec.ts" --project=chromium
 *
 * Run all Smoke tests:
 * npx playwright test --grep "@smoke-test" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (with template Test@company + current date + current time + millisecond.com)
 *    - (in the Address section)
*      - "Country" dropdown list = Afghanistan
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - "Lead form" textbox = TEST eBook
 * 6. Press "SAVE" button
 * 7. Wait for at least 1.5 minutes until "Sales Team" dropdown list and "Salesperson" dropdown list fulfilled
 * 
 * Verification (2 checkpoints):
 * ✓ Checkpoint 1: The value at "Sales Team" dropdown list = "Marketing - BDEU"
 * ✓ Checkpoint 2: The value at "Salesperson" dropdown list is set (any value)
 */

test.describe('TC.MBDEU_2.2.2 - Marketing BDEU Team Assignment for Afghanistan with Lead Form contains "eBook" @smoke-test', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    
    // Deny geolocation permission to prevent "Know your location" popup
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
  
  test('TC.MBDEU_2.2.2: Verify the lead is assigned to Marketing - BDEU team if Lead Form="TEST eBook", Country=Afghanistan @smoke-test', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test); // 5 minutes timeout for this test (includes wait time)
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    let leadName: string;
    let leadEmail: string;

    // Step 1: Login as admin_crm
    await test.step('Step 1: Login as admin_crm', async () => {
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to CRM module
    await test.step('Step 2: Press at CRM button', async () => {
      console.log('Step 2: Clicking CRM button');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Navigated to CRM module');
    });

    // Step 3: Navigate to CRM > Leads page
    await test.step('Step 3: Navigate to CRM > Leads page', async () => {
      console.log('Step 3: Navigating to CRM > Leads page');
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 4: Click CREATE button and fill lead information
    await test.step('Step 4: Click CREATE button and fill lead information', async () => {
      console.log('Step 4: Clicking CREATE button');
      
      await leadPage.clickCreate();
      
      console.log('✓ Lead creation form opened');
      
      console.log('Step 4: Entering lead information');
      
      // Generate unique lead name with TEST prefix
      leadName = CommonUtils.generateLeadNameWithTestCase('TC.MBDEU_2.2.2');
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Generate and fill email
      leadEmail = CommonUtils.generateEmail('Test', 'company');
      await leadPage.fillEmail(leadEmail);
      console.log(`  - Email: ${leadEmail}`);
      
      // Select country - Afghanistan
      await leadPage.selectCountry('Afghanistan');
      console.log(`  - Country: Afghanistan`);
      
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

    // Step 5: Fill Lead Form in CRM Developer tab
    await test.step('Step 5: Fill Lead Form in CRM Developer tab', async () => {
      console.log('Step 5: Filling Lead Form in CRM Developer tab');
      
      // Fill Lead Form field
      await leadPage.fillLeadForm('TEST eBook');
      console.log(`  - Lead Form: TEST eBook`);
      
      console.log('✓ Lead Form filled');
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
      savedLeadUrl = page.url();
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${savedLeadUrl}`);
    });

    // Step 7: Wait for Sales Team and Salesperson auto-assignment
    await test.step('Step 7: Wait for Sales Team and Salesperson auto-assignment', async () => {
      console.log('Step 7: Waiting for Sales Team and Salesperson auto-assignment');
      console.log('  - Waiting for Sales Team and Salesperson to be assigned...');
      
      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.ibsaTeamAssignment,
        config.timeouts.salesTeamAssignment.checkInterval
      );
      
      console.log(`✓ Auto-assignment check completed in ${result.totalWaitTime} seconds`);
    });

    // Verification: Confirm Sales Team is Marketing - BDEU and Salesperson is assigned
    await test.step('Verification: Confirm Sales Team is Marketing - BDEU and Salesperson is assigned', async () => {
      // Verify and log checkpoint results
      const { salesTeamValue, salespersonValue } = await leadPage.verifySalesTeamAssignment('Marketing - BDEU');
      
      // Capture screenshot as evidence and attach to report
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Lead ${leadId} - Marketing BDEU Team Assignment (Afghanistan with Lead Form contains "eBook")`);
      
      // Assert the Sales Team is Marketing - BDEU
      expect(salesTeamValue).toBe('Marketing - BDEU');
      console.log(`  Result:   ✓ PASSED - Sales Team is "Marketing - BDEU"`);
      
      // Assert Salesperson is assigned (not empty)
      expect(salespersonValue).toBeTruthy();
      expect(salespersonValue).not.toBe('');
      expect(salespersonValue).not.toBe('Salesperson');
      console.log(`  Result:   ✓ PASSED - Salesperson is "${salespersonValue}"`);
      
      console.log('\n==================================================');
      console.log('✅ TEST PASSED: All checkpoints validated successfully');
      console.log('   Lead with Afghanistan, Lead Form contains "eBook"');
      console.log('   correctly assigned to Marketing - BDEU team');
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
      <div class="info-row"><span class="label">Test Case:</span> TC.MBDEU_2.2.2</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${leadId}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${leadName}</div>
      <div class="info-row"><span class="label">Email:</span> ${leadEmail}</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Checkpoint 1: Sales Team validation</div>
      <div class="checkpoint-detail"><span class="expected">Expected:</span> "Marketing - BDEU"</div>
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
        Lead with Afghanistan, Lead Form contains "eBook"<br>
        correctly assigned to Marketing - BDEU team
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
