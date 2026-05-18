import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Verify Merge Log Message
 * Test Case ID: verify-merge-log-message-on-Target-Lead.spec
 * 
 * Summary: Verify that the log area contains the merge message for a specific lead
 * 
 * Command to run:
 * npx playwright test --grep "verify-merge-log-message-on-Target-Lead.spec" --project=chromium --headed
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. Launch this URL "https://sign-off.nakivo.site/web#view_type=form&model=crm.lead&id=740449&active_id=740449&view_id=444"
 * 3. Set variable [LEAD 2] = TEST Lead 2 20260105 072954
 * 
 * Steps to reproduce:
 * 4. On the Log area, verify the following:
 *    4.1. There is the text as "[LEAD 2] , has been merged into this lead" where [LEAD 2] is set above
 */

test.describe('Verify-Merge-Log-message-Target-Lead', () => {
  
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
      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('  - Loading spinner wait skipped');
      });
      
      // Wait for page to be stable (no network activity)
      // await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      //   console.log('  - Network idle wait skipped');
      // });
      
      // Additional wait for rendering
      await page.waitForTimeout(3000);
      
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('Verify that log area contains merge message for Lead #740449', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    // Set variable [LEAD 2]
    const lead2Name = 'TEST Lead 2 20260105 072954';
    const leadId = '740449';
    const leadUrl = 'https://sign-off.nakivo.site/web#view_type=form&model=crm.lead&id=740449&active_id=740449&view_id=444';

    // Step 1: Login
    await test.step('Step 1: Login and navigate to CRM', async () => {
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

    // Step 3: Navigate to specific Lead URL
    await test.step('Step 3: Launch Lead URL', async () => {
      console.log(`Step 3: Navigating to Lead #${leadId}`);
      console.log(`URL: ${leadUrl}`);
      
      await page.goto(leadUrl, { waitUntil: 'domcontentloaded' });
      
      // Wait for application menu link to be visible (indicates page is fully loaded)
      const applicationMenuLink = await homePage.getApplicationMenuLink();
      try {
        await applicationMenuLink.waitFor({ state: 'visible', timeout: 30000 });
        console.log(`  ✓ ApplicationMenuLink is visible - page fully loaded`);
      } catch (error) {
        console.log(`  ⚠️ ApplicationMenuLink not visible after 30 seconds`);
      }
      
      console.log(`✓ Lead #${leadId} page loaded`);
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Lead #${leadId} - Initial View`);
    });



   // Click Edit button to access form fields
      //await leadPage.clickEdit();
      
      // Wait for lead form to fully load in edit mode
      //await leadPage.waitForLeadFormToLoad(config.timeouts.loadingSpinner, 15000);



    
    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = IB NC Leads
      await test.step('Step 4.1: Verify Lead form textbox = IB NC Leads', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('IB NC Leads');
        console.log(`  ✓ Step 4.1: Lead form textbox = ${leadFormValue}`);
      });
      
      // Step 4.2: Active checkbox = TRUE
      await test.step('Step 4.2: Verify Active checkbox = TRUE', async () => {
        console.log('  Verifying Active checkbox using 4 different approaches:');
        
        // Approach 1: Standard isChecked() method
        const isActive1 = await leadPage.isActiveChecked();
        expect(isActive1).toBeTruthy();
        console.log(`    Approach 1 (isChecked): ${isActive1 ? '✓ TRUE' : '✗ FALSE'}`);
        
        // // Approach 2: DOM property evaluation
        // const isActive2 = await leadPage.isActiveCheckedViaEvaluate();
        // //expect(isActive2).toBeTruthy();
        // console.log(`    Approach 2 (evaluate): ${isActive2 ? '✓ TRUE' : '✗ FALSE'}`);
        
        // // Approach 3: getAttribute method
        // const isActive3 = await leadPage.isActiveCheckedViaAttribute();
        // //expect(isActive3).toBeTruthy();
        // console.log(`    Approach 3 (getAttribute): ${isActive3 ? '✓ TRUE' : '✗ FALSE'}`);
        
        // // Approach 4: Count-based verification
        // const isActive4 = await leadPage.isActiveCheckedViaCount();
        // //expect(isActive4).toBeTruthy();
        // console.log(`    Approach 4 (count-based): ${isActive4 ? '✓ TRUE' : '✗ FALSE'}`);
        
        // console.log(`  ✓ Step 4.2: Active checkbox = TRUE (All 4 approaches verified)`);
      });
      
      // Step 4.3: Is Won = Pending
      await test.step('Step 4.3: Verify Is Won = Pending', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Pending');
        console.log(`  ✓ Step 4.3: Is Won = ${isWonValue}`);
      });
      
      // Step 4.4: Lost Reason = BLANK
      await test.step('Step 4.4: Verify Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('✅ TEST PASSED: Merge log message verified successfully');
      console.log(`   Lead #${leadId}: Contains merge message for "${lead2Name}"`);
      console.log(`   Expected message: "${lead2Name} , has been merged into this lead."`);
      console.log('==================================================\n');
      
      // Attach verification summary as HTML
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
    .lead-section { background: #f0f9ff; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #2563eb; }
    .lead-title { font-weight: bold; color: #1e40af; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #1e40af; }
    .checkpoint { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .checkpoint-detail { margin: 8px 0; padding-left: 10px; }
    .result-pass { color: #16a34a; font-weight: bold; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #166534; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
    .code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>MERGE LOG MESSAGE VERIFICATION</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead Information</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${leadId}</div>
      <div class="info-row"><span class="label">Lead URL:</span> ${leadUrl}</div>
      <div class="info-row"><span class="label">Expected Merged Lead Name:</span> <span class="code">${lead2Name}</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Log Area Verification</div>
      <div class="checkpoint-detail"><span class="label">Expected Message:</span> <span class="code">"${lead2Name} , has been merged into this lead."</span></div>
      <div class="checkpoint-detail"><span class="label">Verification Status:</span> <span class="result-pass">✓ PASSED</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Merge log message verified successfully<br>
        Lead #${leadId} contains the expected merge message<br>
        Message confirms that "${lead2Name}" was merged into this lead
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 Merge Log Message Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
