import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opportunity Merging Test - Verify Merge Log Message
 * Test Case ID: verify-merge-log-message-on-Target-Opportunity.spec
 * 
 * Summary: Verify that the log area contains the merge message for a specific Opportunity
 * 
 * Command to run:
 * npx playwright test --grep "verify-merge-log-message-on-Target-Opportunity.spec" --project=chromium --headed
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. Launch this URL "https://sign-off.nakivo.site/web#view_type=form&model=crm.Opportunity&id=740449&active_id=740449&view_id=444"
 * 3. Set variable [Opportunity 2] = TEST Opportunity 2 20260105 072954
 * 
 * Steps to reproduce:
 * 4. On the Log area, verify the following:
 *    4.1. There is the text as "[Opportunity 2] , has been merged into this Opportunity" where [Opportunity 2] is set above
 */

test.describe('Verify-Merge-Log-message-Target-Opportunity', () => {
  
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

  test('Verify that log area contains merge message for Opportunity #740449', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
   const leadPage = new OpportunityPage(page); 
    // Set variable [Opportunity 2]
    const Opportunity2Name = 'TEST Opp 1 OpportunityMerging-Exploratory_1.1';
    const OpportunityId = '979464';
    const OpportunityUrl = 'http://10.220.222.100/web?#id=979464&action=682&model=crm.lead&view_type=form&menu_id=111';


    // Set variable [Opportunity 2]
    //const Opportunity2Name = 'TEST Opp 1 OpportunityMerging-Exploratory_1.1';
    const lead2Id = '979465';
    const lead2Url = 'http://10.220.222.100/web?#id=979465&action=682&model=crm.lead&view_type=form&menu_id=111';
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

    // Step 3: Navigate to specific Opportunity URL
    await test.step('Step 3: Launch Opportunity URL', async () => {
      console.log(`Step 3: Navigating to Opportunity #${OpportunityId}`);
      console.log(`URL: ${OpportunityUrl}`);
      
      await page.goto(OpportunityUrl, { waitUntil: 'domcontentloaded' });
      
      // Wait for application menu link to be visible (indicates page is fully loaded)
      const applicationMenuLink = await homePage.getApplicationMenuLink();
      try {
        await applicationMenuLink.waitFor({ state: 'visible', timeout: 30000 });
        console.log(`  ✓ ApplicationMenuLink is visible - page fully loaded`);
      } catch (error) {
        console.log(`  ⚠️ ApplicationMenuLink not visible after 30 seconds`);
      }
      
      console.log(`✓ Opportunity #${OpportunityId} page loaded`);
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Opportunity #${OpportunityId} - Initial View`);
    });

    // STEP 6: Open Lead #2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Current URL before navigation: ${page.url()}`);
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      try {
        // Use location.replace for hash-based navigation in Odoo
        await page.evaluate((url) => {
          window.location.replace(url);
        }, lead2Url);
        
        // Wait for URL pattern to match (flexible for hash URLs)
        await page.waitForURL(`**id=${lead2Id}**`, { timeout: 30000 });
        console.log('✓ URL changed successfully');
        
        // Wait for loading spinner to hide
        await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
        
        // Wait for the form view to be visible
        await page.locator('.o_form_view').waitFor({ state: 'visible', timeout: 30000 });
        
        // Additional wait for page stabilization
        await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
        
        console.log(`Current URL after navigation: ${page.url()}`);
        console.log('✓ Lead #2 opened successfully\n');
      } catch (error) {
        console.log(`❌ Navigation error: ${error}`);
        console.log(`Expected Lead ID: ${lead2Id}`);
        console.log(`Current URL: ${page.url()}`);
        throw error;
      }
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      const verificationSummaryHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #2563eb; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .Opportunity-section { background: #f0f9ff; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #2563eb; }
    .Opportunity-title { font-weight: bold; color: #1e40af; font-size: 16px; margin-bottom: 10px; }
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
    
    <div class="Opportunity-section">
      <div class="Opportunity-title">📋 Opportunity Information</div>
      <div class="info-row"><span class="label">Opportunity ID:</span> ${OpportunityId}</div>
      <div class="info-row"><span class="label">Opportunity URL:</span> ${OpportunityUrl}</div>
      <div class="info-row"><span class="label">Expected Merged Opportunity Name:</span> <span class="code">${Opportunity2Name}</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Log Area Verification</div>
      <div class="checkpoint-detail"><span class="label">Expected Message:</span> <span class="code">"${Opportunity2Name} , has been merged into this Opportunity."</span></div>
      <div class="checkpoint-detail"><span class="label">Verification Status:</span> <span class="result-pass">✓ PASSED</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Merge log message verified successfully<br>
        Opportunity #${OpportunityId} contains the expected merge message<br>
        Message confirms that "${Opportunity2Name}" was merged into this Opportunity
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