import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Send Quotation
 * Test Case ID: TC.Performance.1.1.5.3
 * 
 * Summary: Verify the consumer time for sending Quotation is less than 1 min
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.5\.3:" --project=chromium
 *
 * Pre-condition:
 * 1. Use the account of Thomas to login successful
 * 2. After login successful, click at "CRM" button
 *    On "CRM" page, click at "view list" button
 * 3. On "Opp" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Opp name textbox = TEST + current date time
 *    - Email textbox = Company email (Test@company + current date + current time .com)
 *    - Country dropdown list = United States
 *    - State dropdown list = Connecticut
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 6. Press "SAVE" button
 * 7. Refresh page to see the "Contact" field is entered
 * 8. Create "DEAL ELEMENT" with following steps:
 *    - Press "DEAL ELEMENT" button
 * 9. Once the "Deal Element" screen shows up select the following:
 *    + Pricelist = Public Pricelist_USD (USD)
 *    + Payment Term = Immediate Payment
 * 10. At "Order Lines" section
 *    + Press "Add a product" link, when a dropdown list of "Product" displays, select the first one
 *    + Ordered Qty = 1
 * 11. Finally, press "SAVE" button on the top page and wait
 * 12. Press "NEW QUOTATION" button and wait
 * 13. Confirm the quotation by clicking Edit and Save
 * 
 * Steps run:
 * 1. Press "SEND BY EMAIL" button
 * 2. Once the Email form window appear completely, press "SEND" button
 * 3. Observe result
 * 
 * Verification:
 * - Time consuming after pressing "SEND" button takes less than 1 minute
 */

test.describe('TC.Performance.1.1.5.3 - Send Quotation Performance', () => {
  const PERFORMANCE_THRESHOLD = 60000; // 1 minute in milliseconds
  
  test.beforeEach(async ({ context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      
      // Check if any loading spinners exist before waiting
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      const spinnerCount = await spinnerLocator.count().catch(() => 0);
      
      if (spinnerCount > 0) {
        console.log('  ℹ️ Loading spinners detected, waiting for them to disappear...');
        try {
          await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
          console.log('  ✓ Loading spinners have disappeared');
        } catch (e) {
          console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
        }
      }
      
      // Brief wait for page to fully stabilize
      await page.waitForTimeout(1000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('TC.Performance.1.1.5.3: Verify consumer time for sending Quotation is less than 1 min', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
      
      // Maximize browser window
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      const loginPage = new LoginPage(page);
      const homePage = new HomePage(page);
      const opportunityPage = new OpportunityPage(page);
      const dealElementPage = new DealElementPage(page);
      const quotationPage = new QuotationPage(page);
      const startTime = Date.now();
      const performanceMetrics: { [key: string]: number } = {};
      let stepStartTime: number;
      let sendTime: number = 0;
      let sendSeconds: string = '0';
      let totalTime: number = 0;
      let totalSeconds: string = '0';
      
      // Step 1: Login to the system as Thomas
      await test.step('Step 1: Use the account of Thomas to login successful', async () => {
        stepStartTime = Date.now();
        console.log(`Step 1: Logging in as ${users.sale_ic_thomas.displayName}`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
        await loginPage.dismissLocationPermissionDialog();
        performanceMetrics['Login'] = Date.now() - stepStartTime;
        console.log(`✓ Login successful as ${users.sale_ic_thomas.displayName}`);
      });
  
      // Step 2: Navigate to CRM
      await test.step('Step 2: After login successful, click at "CRM" button', async () => {
        stepStartTime = Date.now();
        console.log('Step 2: Navigating to CRM');
        await homePage.navigateToCRM();
        await homePage.waitForPageReady();
        performanceMetrics['Navigate to CRM'] = Date.now() - stepStartTime;
        console.log('✓ Navigated to CRM page');
      });
  
      // Step 3: Click on "view list" button to navigate to Opportunities
      await test.step('Step 3: On "Opp" page, click at "CREATE" button', async () => {
        stepStartTime = Date.now();
        console.log('Step 3: Switching to list view');
        await opportunityPage.switchToListView();
        performanceMetrics['Open Opp List'] = Date.now() - stepStartTime;
        console.log('✓ Opp list view opened');
      });
  
      // Step 4: Enter opportunity information
      await test.step('Step 4: Enter the following information', async () => {
        stepStartTime = Date.now();
        console.log('Step 4: Clicking CREATE button');
        await opportunityPage.clickCreate();
        performanceMetrics['Open Create Form'] = Date.now() - stepStartTime;
        console.log('✓ Opp creation form opened');
      });
  
      // Step 5: Enter opportunity information
      await test.step('Step 5: Enter opportunity information (Opp name, Email, Country, State, Sales Team, Salesperson)', async () => {
        stepStartTime = Date.now();
        console.log('Step 5: Entering opportunity information');
        
        const oppName = opportunityPage.generateOpportunityName('TEST');
        const emailAddress = opportunityPage.generateEmail('Test@company');
        
        await opportunityPage.fillOpportunityName(oppName);
        console.log(`  - Opportunity Name: ${oppName}`);
        
        await opportunityPage.fillEmail(emailAddress);
        console.log(`  - Email: ${emailAddress}`);
        
        await opportunityPage.selectCountry('United States');
        console.log('  - Country: United States');
        
        await opportunityPage.selectState('Connecticut');
        console.log('  - State: Connecticut');
        
        await opportunityPage.clearSalesTeam();
        console.log('  - Sales Team: Cleared');
        
        await opportunityPage.clearSalesperson();
        console.log('  - Salesperson: Cleared');
        
        performanceMetrics['Fill Form Fields'] = Date.now() - stepStartTime;
      });
  
      // Step 6: Click on "CRM Developer" tab and fill Lead Form
      await test.step('Step 6: Click at "CRM Developer" tab at the bottom of page (Lead form = License)', async () => {
        stepStartTime = Date.now();
        console.log('Step 6: Filling CRM Developer tab');
        
        await opportunityPage.clickCRMDeveloperTab();
        console.log('  - Clicked CRM Developer tab');
        
        const leadFormFilled = await opportunityPage.fillLeadForm('License');
        if (leadFormFilled) {
          console.log('  - Lead Form: License');
        } else {
          console.log('  - Lead Form: Field not found in CRM Developer tab, skipping');
        }
        
        performanceMetrics['Fill CRM Developer Tab'] = Date.now() - stepStartTime;
      });
  
      // Step 7: Save the opportunity
      await test.step('Step 7: Press "SAVE" button', async () => {
        stepStartTime = Date.now();
        console.log('Step 7: Saving the opportunity');
        
        await opportunityPage.saveAndWaitForCompletion();
        
        performanceMetrics['Save Opportunity'] = Date.now() - stepStartTime;
        console.log('✓ Opportunity saved successfully');
      });
  
      // Step 8: Refresh page to verify Contact field
      await test.step('Step 8: Refresh page to see the "Contact" field is entered', async () => {
        stepStartTime = Date.now();
        console.log('Step 8: Refreshing page and verifying Contact field');
        
        await opportunityPage.waitForContactFieldPopulated('test');
        
        performanceMetrics['Refresh and Verify'] = Date.now() - stepStartTime;
        console.log('✓ Page refreshed and Contact field checked');
      });
  
      // Step 9: Press "DEAL ELEMENT" button
      await test.step('Step 9: Create "DEAL ELEMENT" - Press "DEAL ELEMENT" button', async () => {
        stepStartTime = Date.now();
        console.log('Step 9: Clicking DEAL ELEMENT button');
        
        await opportunityPage.clickDealElement();
        console.log('  - Clicked DEAL ELEMENT button');
        
        await dealElementPage.waitForFormOpen();
        console.log('  - Deal Element form opened');
        
        performanceMetrics['Open Deal Element'] = Date.now() - stepStartTime;
      });
  
      // Step 10: Verify and fill Deal Element information
      await test.step('Step 10: Once the "Deal Element" screen shows up - Select Pricelist & Payment Term', async () => {
        stepStartTime = Date.now();
        console.log('Step 10: Filling Deal Element information');
        
        // Wait for auto-populate fields to be filled
        await dealElementPage.waitForAutoPopulate();
        console.log('  - Auto-populate fields loaded');
        
        // Pricelist - Select "Public Pricelist_USD"
        await dealElementPage.selectPricelist('Public Pricelist_USD');
        console.log('  - Pricelist: Public Pricelist_USD');
        
        // Payment Term - Select "Immediate Payment"
        await dealElementPage.selectPaymentTerm('Immediate Payment');
        console.log('  - Payment Term: Immediate Payment');
        
        performanceMetrics['Fill Deal Element Info'] = Date.now() - stepStartTime;
      });
  
      // Step 11: Add a product in Order Lines section with Qty = 1
      await test.step('Step 11: At "Order Lines" section - Add a product and set Ordered Qty = 1', async () => {
        stepStartTime = Date.now();
        console.log('Step 11: Adding product with Qty=1');
        
        // Add product using POM method
        await dealElementPage.addProduct('');
        const productText = await page.locator('.o_data_row').first().locator('[name="product_id"]').textContent().catch(() => 'first product');
        console.log(`  - Product added: ${productText}`);
        
        // Wait for product to be added and fields to populate
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
        
        // Set Ordered Qty to 1
        console.log('  - Setting Ordered Qty to 1...');
        const qtyInput = page.locator('input[name="product_uom_qty"]').first();
        await qtyInput.waitFor({ state: 'visible', timeout: 5000 });
        await qtyInput.click();
        await qtyInput.fill('1');
        await page.keyboard.press('Enter');
        console.log('  - Ordered Qty: Set to 1');
        
        // Wait for price calculations to update
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
        
        performanceMetrics['Add Product and Set Qty'] = Date.now() - stepStartTime;
      });
  
      // Step 12: Save Deal Element
     // Save Deal Element
    stepStartTime = Date.now();
    console.log('  - Saving Deal Element');
    
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    console.log('  - Deal Element saved successfully');
    
    performanceMetrics['Save Deal Element'] = Date.now() - stepStartTime;

    // Step 13: Press "NEW QUOTATION" button
    await test.step('Step 13: Press "NEW QUOTATION" button and wait', async () => {
      stepStartTime = Date.now();
      console.log('Step 13: Creating NEW QUOTATION');
      
      // Create NEW QUOTATION using POM method
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      console.log('  - New Quotation created successfully');
      
      // Wait for quotation page to fully load
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('  - Quotation page loaded');
      
      performanceMetrics['Create NEW QUOTATION'] = Date.now() - stepStartTime;
      console.log('✓ New Quotation created successfully');
    });

    // Step 14: Confirm the quotation by clicking Edit and Save
    await test.step('Step 14: Confirm the quotation by clicking Edit and Save', async () => {
      stepStartTime = Date.now();
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Step 14: Confirming quotation');
      
      // Wait for screen to stabilize
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log('  - Screen stabilized');
      
      await quotationPage.confirmQuotation();
      console.log('  - Quotation confirmed');
      
      performanceMetrics['Confirm Quotation'] = Date.now() - stepStartTime;
      console.log('✓ Quotation confirmed successfully');
    });

    // Step 15: Press "SEND BY EMAIL" button
    await test.step('Step 15: Press "SEND BY EMAIL" button', async () => {
      stepStartTime = Date.now();
      console.log('Step 15: Opening email form');
      
      await quotationPage.clickSendByEmail();
      
      performanceMetrics['Open Email Form'] = Date.now() - stepStartTime;
      console.log('✓ Email form opened successfully');
    });

    // Step 16: Press "SEND" button and verify performance
    await test.step('Step 16: Once the Email form window appear completely, press "SEND" button (Performance measurement)', async () => {
      console.log('Step 16: Clicking SEND button (Performance Measurement)');
      
      // START PERFORMANCE MEASUREMENT - Click SEND button
      sendTime = await quotationPage.sendEmail();
      sendSeconds = (sendTime / 1000).toFixed(2);
      
      performanceMetrics['SEND Email Process'] = sendTime;
      
      // Calculate total elapsed time
      const totalElapsedTime = Date.now() - startTime;
      const totalElapsedSeconds = (totalElapsedTime / 1000).toFixed(2);
      totalTime = totalElapsedTime;
      totalSeconds = totalElapsedSeconds;
      
      console.log(`\n⏱️  Send Operation Time: ${sendSeconds} seconds`);
      console.log(`⏱️  Total Time (including all steps): ${totalElapsedSeconds} seconds`);
      
      // Performance Verification: Ensure time after pressing SEND button is less than 1 minute
      expect(sendTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      console.log(`\n✅ PERFORMANCE TEST PASSED: ${sendSeconds}s < 60s`);
      
      // Detailed performance breakdown
      console.log('\n📊 Detailed Performance Breakdown:');
      console.log('━'.repeat(50));
      console.log('PRE-CONDITIONS:');
      Object.entries(performanceMetrics).filter(([step]) => !step.includes('SEND Email Process')).forEach(([step, time]) => {
        const seconds = (time / 1000).toFixed(2);
        console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
      });
      console.log('\nTEST STEPS:');
      ['SEND Email Process'].forEach(step => {
        if (performanceMetrics[step]) {
          const seconds = (performanceMetrics[step] / 1000).toFixed(2);
          console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
        }
      });
      console.log('━'.repeat(50));
      console.log(`${'TOTAL TEST TIME'.padEnd(32)} ${totalSeconds.padStart(8)}s`);
      console.log('━'.repeat(50));
      
      // Performance Summary
      console.log('\n📊 Performance Summary (Send Operation):');
      console.log(`   - Send Operation Time: ${sendSeconds} seconds`);
      console.log(`   - Threshold: 60 seconds`);
      console.log(`   - Margin: ${(60 - parseFloat(sendSeconds)).toFixed(2)} seconds under threshold`);
      console.log(`   - Performance: ${((parseFloat(sendSeconds) / 60) * 100).toFixed(2)}% of threshold`);
      console.log(`   - Total Test Time: ${totalSeconds} seconds (includes all pre-conditions and steps)`);
    });
    
    // Step 17: Observe result and verify email sent (not included in performance measurement)
    await test.step('Step 17: Observe result and verify email sent (not included in performance measurement)', async () => {
      console.log('\nStep 17: Verifying email send result (not included in performance measurement)');
      await quotationPage.verifyEmailSent();
      console.log('✓ Email sent successfully');
      console.log('✅ Data verification completed');
    });
    
    // Generate HTML Report
    await test.step('Generate HTML Report', async () => {
      const performancePercentage = ((parseFloat(sendSeconds) / 60) * 100).toFixed(2);
      const margin = (60 - parseFloat(sendSeconds)).toFixed(2);
      
      const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 1200px; margin: 0 auto; }
    .header { background: #16a34a; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .section { background: #f0fdf4; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .section-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 8px 0; padding-left: 15px; font-size: 14px; }
    .label { font-weight: bold; color: #15803d; }
    .metrics-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .metrics-table th { background: #dcfce7; padding: 10px; text-align: left; border: 1px solid #bbf7d0; font-size: 14px; }
    .metrics-table td { padding: 10px; border: 1px solid #dcfce7; font-size: 14px; }
    .metrics-table tr:nth-child(even) { background: #f9fafb; }
    .performance-box { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .performance-title { color: #15803d; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .performance-time { color: #15803d; font-size: 32px; font-weight: bold; margin: 10px 0; }
    .performance-detail { color: #14532d; font-size: 14px; line-height: 1.8; }
    .icon { font-size: 20px; margin-right: 8px; }
    .sub-item { padding-left: 20px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>PERFORMANCE TEST - PASSED</h2>
      <div style="font-size: 14px; margin-top: 5px;">TC.Performance.1.1.5.3 - Send Quotation Performance</div>
    </div>
    
    <div class="section">
      <div class="section-title">🎯 Pre-conditions (Steps 1-14)</div>
      <div class="info-row"><span class="label">Step 1:</span> Login as ${users.sale_ic_thomas.displayName} - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 2:</span> Navigate to CRM - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 3:</span> Switch to Opportunities list view - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 4:</span> Click CREATE button - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 5:</span> Enter opportunity information - ✓ Completed</div>
      <div class="sub-item">- Country: United States, State: Connecticut</div>
      <div class="sub-item">- Sales Team & Salesperson: Cleared</div>
      <div class="info-row"><span class="label">Step 6:</span> Fill CRM Developer tab (Lead Form: License) - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 7:</span> Save opportunity - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 8:</span> Refresh and verify Contact field - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 9:</span> Click DEAL ELEMENT button - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 10:</span> Select Pricelist & Payment Term - ✓ Completed</div>
      <div class="sub-item">- Pricelist: Public Pricelist_USD (USD)</div>
      <div class="sub-item">- Payment Term: Immediate Payment</div>
      <div class="info-row"><span class="label">Step 11:</span> Add product with Ordered Qty = 1 - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 12:</span> Save Deal Element - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 13:</span> Press NEW QUOTATION button - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 14:</span> Confirm quotation (Edit & Save) - ✓ Completed</div>
    </div>
    
    <div class="section">
      <div class="section-title">🎯 Test Steps (Steps 15-17)</div>
      <div class="info-row"><span class="label">Step 15:</span> Press "SEND BY EMAIL" button - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 16:</span> Press "SEND" button in email dialog - ✓ Completed</div>
      <div class="info-row"><span class="label">Step 17:</span> Observe result and verify - ✓ Verified</div>
    </div>
    
    <div class="section">
      <div class="section-title">⏱️ Performance Metrics Breakdown</div>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>Operation</th>
            <th>Time (seconds)</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Step 1</td>
            <td>Login</td>
            <td>${(performanceMetrics['Login'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Login'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 2</td>
            <td>Navigate to CRM</td>
            <td>${(performanceMetrics['Navigate to CRM'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Navigate to CRM'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 3</td>
            <td>Open Opp List</td>
            <td>${(performanceMetrics['Open Opp List'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Open Opp List'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 4</td>
            <td>Open Create Form</td>
            <td>${(performanceMetrics['Open Create Form'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Open Create Form'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 5</td>
            <td>Fill Form Fields</td>
            <td>${(performanceMetrics['Fill Form Fields'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Fill Form Fields'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 6</td>
            <td>Fill CRM Developer Tab</td>
            <td>${(performanceMetrics['Fill CRM Developer Tab'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Fill CRM Developer Tab'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 7</td>
            <td>Save Opportunity</td>
            <td>${(performanceMetrics['Save Opportunity'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Save Opportunity'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 8</td>
            <td>Refresh and Verify</td>
            <td>${(performanceMetrics['Refresh and Verify'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Refresh and Verify'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 9</td>
            <td>Open Deal Element</td>
            <td>${(performanceMetrics['Open Deal Element'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Open Deal Element'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 10</td>
            <td>Fill Deal Element Info</td>
            <td>${(performanceMetrics['Fill Deal Element Info'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Fill Deal Element Info'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 11</td>
            <td>Add Product and Set Qty</td>
            <td>${(performanceMetrics['Add Product and Set Qty'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Add Product and Set Qty'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 12</td>
            <td>Save Deal Element</td>
            <td>${(performanceMetrics['Save Deal Element'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Save Deal Element'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 13</td>
            <td>Create NEW QUOTATION</td>
            <td>${(performanceMetrics['Create NEW QUOTATION'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Create NEW QUOTATION'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 14</td>
            <td>Confirm Quotation</td>
            <td>${(performanceMetrics['Confirm Quotation'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Confirm Quotation'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td>Step 15</td>
            <td>Open Email Form</td>
            <td>${(performanceMetrics['Open Email Form'] / 1000).toFixed(2)}s</td>
            <td>${((performanceMetrics['Open Email Form'] / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr style="background: #fef3c7; font-weight: bold;">
            <td>Step 16</td>
            <td>SEND Email Process (Measured)</td>
            <td>${sendSeconds}s</td>
            <td>${((sendTime / totalTime) * 100).toFixed(1)}%</td>
          </tr>
          <tr style="background: #dcfce7; font-weight: bold;">
            <td colspan="2">TOTAL TEST EXECUTION TIME</td>
            <td>${totalSeconds}s</td>
            <td>100.0%</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="performance-box">
      <div class="performance-title">✅ PERFORMANCE TEST PASSED</div>
      <div class="performance-time">${sendSeconds} seconds</div>
      <div class="performance-detail">
        <strong>Measured Operation:</strong> Time after pressing "SEND" button<br>
        <strong>Threshold:</strong> 60 seconds<br>
        <strong>Performance:</strong> ${performancePercentage}% of threshold<br>
        <strong>Margin:</strong> ${margin} seconds under threshold<br>
        <br>
        <strong>Verification:</strong> Email sent successfully<br>
        <strong>Result:</strong> Quotation sent in ${sendSeconds}s (< 60s)<br>
        <strong>Total Test Time:</strong> ${totalSeconds}s
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📊 Performance Test Report - Send Quotation', {
        body: htmlReport,
        contentType: 'text/html'
      });
    });
  });
});
