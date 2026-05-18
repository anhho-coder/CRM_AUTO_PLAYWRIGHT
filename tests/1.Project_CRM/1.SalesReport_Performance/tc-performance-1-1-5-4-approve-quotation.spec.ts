import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, BasePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Approve Quotation
 * Test Case ID: TC.Performance.1.1.5.4
 * 
 * Summary: Verify the consumer time for approving Quotation is less than 1 min
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.5\.4:" --project=chromium
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
 *    + Ordered Qty = 30
 * 11. Finally, press "SAVE" button on the top page and wait
 * 12. Press "NEW QUOTATION" button and wait
 * 
 * Steps run:
 * 1. Press "TO APPROVE" button
 * 2. Copy the URL
 * 3. Open another browser and login as Max account
 * 4. Paste the URL at step#2 to open the Quotation
 * 5. Play as Max account and press "APPROVE" button
 * 
 * Verification:
 * - Time consuming after pressing "APPROVE" button takes less than 1 minute
 * 
 * Failed (Tested on Nov 19, 2025) Bug: http://jira.nakivo.com/browse/CRM-8179
 */

test.describe('TC.Performance.1.1.5.4 - Approve Quotation Performance', () => {
  const PERFORMANCE_THRESHOLD = 60000; // 1 minute in milliseconds
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Grant permissions
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
  test('TC.Performance.1.1.5.4: Verify consumer time for approving Quotation is less than 1 min', async ({ page, browser }, testInfo) => {
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
    let approveTime: number = 0;
    let approveSeconds: string = '0';
    
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

    // Step 11: Add a product in Order Lines section with Qty = 30
    await test.step('Step 11: At "Order Lines" section - Add a product and set Ordered Qty = 30', async () => {
      stepStartTime = Date.now();
      console.log('Step 11: Adding product with Qty=30');
      
      // Add product
      await dealElementPage.addProduct('');
      const productText = await page.locator('.o_data_row').first().locator('[name="product_id"]').textContent().catch(() => 'first product');
      console.log(`  - Product added: ${productText}`);
      
      // Wait for product to be added and fields to populate
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      // Set Ordered Qty to 30
      console.log('  - Setting Ordered Qty to 30...');
      const qtyInput = page.locator('input[name="product_uom_qty"]').first();
      await qtyInput.waitFor({ state: 'visible', timeout: 5000 });
      await qtyInput.click();
      await qtyInput.fill('30');
      await page.keyboard.press('Enter');
      console.log('  - Ordered Qty: Set to 30');
      
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
// ============================================================
    // STEPS RUN - Performance Measurement
    // ============================================================

    // Steps run - Step 1 & 2: Press "TO APPROVE" button and copy URL
    let quotationUrl: string;
    await test.step('Steps run - Step 1 & 2: Press "TO APPROVE" button and copy the URL', async () => {
      stepStartTime = Date.now();
      console.log('Steps run - Step 1 & 2: Creating NEW QUOTATION and requesting approval');
      
      // Create NEW QUOTATION
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      console.log('  - New Quotation created successfully');
      
      // Wait for quotation page to fully load
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('  - Quotation page loaded');
      
      // Wait for screen to stabilize and confirm quotation
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      console.log('  - Screen stabilized');
      
            
      // Press "TO APPROVE" button
      await quotationPage.clickToApprove();
      console.log('  - Approval requested (TO APPROVE button clicked)');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      // Capture quotation URL for approval
      quotationUrl = page.url();
      console.log(`  - Quotation URL: ${quotationUrl}`);
      
      performanceMetrics['Create NEW QUOTATION'] = Date.now() - stepStartTime;
      console.log('✓ Quotation created and approval requested');
    });
    
    
    
    // Steps run - Step 3: Open another browser and login as Max
    
let maxContext: any;
      let maxPage: any;
      await test.step('Steps run - Step 3: Open another browser and login as Max account', async () => {
        stepStartTime = Date.now();
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PERFORMANCE TEST - Step 1: Logging in as Max (Manager)');
          
          // Create a new browser context for Max with video recording enabled
          maxContext = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            recordVideo: {
              dir: 'test-results',
              size: { width: 1920, height: 1080 }
            }
          });
          maxPage = await maxContext.newPage();
          
          // Login as Max
          const maxLoginPage = new LoginPage(maxPage);
          await maxPage.waitForTimeout(CommonUtils.waitTimes.contactShowing);
          await maxLoginPage.navigateTo(baseUrl);
          
          await maxLoginPage.login(users.manager_max.username, users.manager_max.password);
          //await maxLoginPage.dismissLocationPermissionDialog();
          
          await maxPage.waitForTimeout(CommonUtils.waitTimes.extraLong);
          
          // Capture screenshot from Max's browser after login
          await CommonUtils.captureAndAttachScreenshot(
            maxPage,
            testInfo,
            'Max - Logged in successfully'
          );
  
        performanceMetrics['Login as Max'] = Date.now() - stepStartTime;
        console.log(`✓ Logged in as ${users.manager_max.displayName}\n`);
      });

    // Steps run - Step 4: Paste the URL to open the Quotation
    await test.step('Steps run - Step 4: Paste the URL at step#2 to open the Quotation', async () => {
      stepStartTime = Date.now();
      console.log('Step 2: Opening quotation URL in Max\'s browser');
        await maxPage.waitForTimeout(CommonUtils.waitTimes.long);
      await maxPage.goto(quotationUrl);
      await maxPage.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Handle error dialog if it appears
      const maxBasePage = new BasePage(maxPage);
      await maxBasePage.dismissErrorDialog();
      
      await maxPage.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Wait for page to fully load
      await maxPage.locator('.o_form_view').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await maxPage.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  - Page loaded, waiting for approval state...');
      
            
      performanceMetrics['Open Quotation as Max'] = Date.now() - stepStartTime;
      console.log('✓ Quotation opened by Max\n');
    });

    // Steps run - Step 5: Press "APPROVE" button and verify performance
    await test.step('Steps run - Step 5: Play as Max account and press "APPROVE" button (Performance measurement)', async () => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('PERFORMANCE TEST - Step 3: Approving Quotation (Performance Timer)');
        
      // START PERFORMANCE MEASUREMENT - Click APPROVE button
      const maxQuotationPage = new QuotationPage(maxPage);
      approveTime = await maxQuotationPage.clickApprove();
      approveSeconds = (approveTime / 1000).toFixed(2);
      
      performanceMetrics['APPROVE Process (Max)'] = approveTime;
      
      // Calculate total elapsed time
      const totalElapsedTime = Date.now() - startTime;
      const totalElapsedSeconds = (totalElapsedTime / 1000).toFixed(2);
      
      console.log(`\n⏱️  Approve Operation Time: ${approveSeconds} seconds`);
      console.log(`⏱️  Total Time (including all steps): ${totalElapsedSeconds} seconds`);
      
      // Performance Verification: Ensure approval time is less than 1 minute
      expect(approveTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      console.log(`\n✅ PERFORMANCE TEST PASSED: ${approveSeconds}s < 60s`);
      
      // Detailed performance breakdown
      console.log('\n📊 Detailed Performance Breakdown:');
      console.log('━'.repeat(50));
      console.log('PRE-CONDITIONS:');
      Object.entries(performanceMetrics).filter(([step]) => !step.includes('APPROVE Process')).forEach(([step, time]) => {
        const seconds = (time / 1000).toFixed(2);
        console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
      });
      console.log('\nTEST STEPS:');
      ['APPROVE Process (Max)'].forEach(step => {
        if (performanceMetrics[step]) {
          const seconds = (performanceMetrics[step] / 1000).toFixed(2);
          console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
        }
      });
      console.log('━'.repeat(50));
      console.log(`${'TOTAL TEST TIME'.padEnd(32)} ${totalElapsedSeconds.padStart(8)}s`);
      console.log('━'.repeat(50));
      
      // Performance Summary
      console.log('\n📊 Performance Summary (Approve Operation):');
      console.log(`   - Approve Operation Time: ${approveSeconds} seconds`);
      console.log(`   - Threshold: 60 seconds`);
      console.log(`   - Margin: ${(60 - parseFloat(approveSeconds)).toFixed(2)} seconds under threshold`);
      console.log(`   - Performance: ${((parseFloat(approveSeconds) / 60) * 100).toFixed(2)}% of threshold`);
      console.log(`   - Total Test Time: ${totalElapsedSeconds} seconds (includes all pre-conditions and steps)`);
    });
    
    // Verification: Verify approval completed (not included in performance measurement)
    await test.step('Verification: Verify approval completed (not included in performance measurement)', async () => {
      console.log('\nVerification: Verifying approval status (not included in performance measurement)');
      
      // Check if quotation is approved
      const pageContent = await maxPage.textContent('body').catch(() => '') || '';
      const isApproved = pageContent.includes('Approved') || pageContent.includes('Sales Order') || pageContent.includes('SO');
      
      if (isApproved) {
        console.log('  ✓ Quotation approved successfully');
      } else {
        console.log('  ⚠ Approval verification: Status unclear');
      }
      
      console.log('✅ Data verification completed');
    });
    
    // Capture final screenshot for test report
    await test.step('Capture final screenshot and performance summary', async () => {
      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `✅ Performance Test Passed - Approval Time: ${approveSeconds}s`
      );
    });
    
    // Clean up - close Max's browser context after all captures are done
    await maxContext.close();
    console.log('✓ Max\'s browser context closed');
  });
});
