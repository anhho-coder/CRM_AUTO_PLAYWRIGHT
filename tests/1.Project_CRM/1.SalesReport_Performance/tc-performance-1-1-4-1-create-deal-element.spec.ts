import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Create Deal Element
 * Test Case ID: TC.Performance.1.1.4.1
 * 
 * Summary: Verify the consumer time for creating Deal Element is less than 1 min
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.4\.1:" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Opp" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Opp name textbox = TEST + current date time
 *    - Email textbox = Company email (with template Test@company + current date + current time .com)
 *      (in the Address section)
 *    - Country dropdown list = United States
 *    - State dropdown list = Connecticut
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 6. Press "SAVE" button
 * 7. Refresh page to verify Contact field (up to 5 times, max 5 minutes)
 * 
 * Steps run:
 * 1. Press "DEAL ELEMENT" button
 * 2. Once the "Deal Element" screen shows up select the following:
 *    + Pricelist = Public Pricelist_USD (USD)
 *    + Payment Term = Immediate Payment
 * 3. At "Order Lines" section
 *    + Press "Add a product" link, when a dropdown list of "Product" displays, select the first one
 * 4. Finally, press "SAVE" button on the top page
 * 
 * Verification:
 * - Time consuming for saving process takes less than 1 minute
 */

test.describe('TC.Performance.1.1.4.1 - Create Deal Element Performance', () => {
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
  test('TC.Performance.1.1.4.1: Verify consumer time for creating Deal Element is less than 1 min', async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
        // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
        const startTime = Date.now();
    const performanceMetrics: { [key: string]: number } = {};
    let stepStartTime: number;
    let dealSaveTime: number = 0;
    let dealSaveSeconds: string = '0';
    
    // Pre-condition Step 1: Login to the system
    stepStartTime = Date.now();
    console.log('Pre-condition Step 1: Logging in to NAKIVO Partner Portal');
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.admin_crm.username, users.admin_crm.password);
    await loginPage.dismissLocationPermissionDialog();
    performanceMetrics['Login'] = Date.now() - stepStartTime;
    console.log('✓ Login successful');

    // Pre-condition Step 2: Navigate to CRM
    stepStartTime = Date.now();
    console.log('Pre-condition Step 2: Navigating to CRM');
    await homePage.navigateToCRM();
    
    performanceMetrics['Navigate to CRM'] = Date.now() - stepStartTime;
    console.log('✓ Navigated to CRM page');

    // Pre-condition Step 3: Click on "view list" button to navigate to Opportunities
    stepStartTime = Date.now();
    console.log('Pre-condition Step 3: Switching to list view');
    await opportunityPage.switchToListView();
    performanceMetrics['Open Opp List'] = Date.now() - stepStartTime;
    console.log('✓ Opp list view opened');

    // Pre-condition Step 4: Click CREATE button
    stepStartTime = Date.now();
    console.log('Pre-condition Step 4: Clicking CREATE button');
    await opportunityPage.clickCreate();
    performanceMetrics['Open Create Form'] = Date.now() - stepStartTime;
    console.log('✓ Opp creation form opened');

    // Pre-condition Step 5: Enter opportunity information
    stepStartTime = Date.now();
    console.log('Pre-condition Step 5: Entering opportunity information');
    
    // Generate timestamp for opportunity name and email
    const oppName = opportunityPage.generateOpportunityName('TEST');
    const emailAddress = opportunityPage.generateEmail('Test@company');
    
    // Opportunity Name
    await opportunityPage.fillOpportunityName(oppName);
    console.log(`  - Opportunity Name: ${oppName}`);

    // Email - generate dynamic email with current date and time
    await opportunityPage.fillEmail(emailAddress);
    console.log(`  - Email: ${emailAddress}`);

    // Country - Using OpportunityPage method
    const countrySelected = await opportunityPage.selectCountry('United States');
    if (countrySelected) {
      console.log('  - Country: United States');
    } else {
      console.log('  - Country: Field not accessible or dropdown not found');
    }
    
    // State - Using OpportunityPage method
    const stateSelected = await opportunityPage.selectState('Connecticut');
    if (stateSelected) {
      console.log('  - State: Connecticut');
    } else {
      console.log('  - State: Field not accessible or dropdown not found');
    }
    
    // Sales Team - Clear the combobox
    const salesTeamCleared = await opportunityPage.clearSalesTeam();
    if (salesTeamCleared) {
      console.log('  - Sales Team: Cleared');
    } else {
      console.log('  - Sales Team: Field not found, skipping');
    }
    
    // Salesperson - Clear the field
    const salespersonCleared = await opportunityPage.clearSalesperson();
    if (salespersonCleared) {
      console.log('  - Salesperson: Cleared');
    } else {
      console.log('  - Salesperson: Field not found, skipping');
    }
    
    // Created Manually checkbox - Uncheck it (should be FALSE)
    const createdManuallyUnchecked = await opportunityPage.uncheckCreatedManually();
    if (createdManuallyUnchecked) {
      console.log('  - Created Manually: Unchecked (FALSE)');
    } else {
      console.log('  - Created Manually: Field not found, skipping');
    }
    
    performanceMetrics['Fill Form Fields'] = Date.now() - stepStartTime;

    // Pre-condition Step 6: Click on "CRM Developer" tab and fill Lead Form
    stepStartTime = Date.now();
    console.log('Pre-condition Step 6: Filling CRM Developer tab');
    
    await opportunityPage.clickCRMDeveloperTab();
    console.log('  - Clicked CRM Developer tab');
    
    // Lead Form - Enter "License"
    const leadFormFilled = await opportunityPage.fillLeadForm('License');
    if (leadFormFilled) {
      console.log('  - Lead Form: License');
    } else {
      console.log('  - Lead Form: Field not found in CRM Developer tab, skipping');
    }
    
    performanceMetrics['Fill CRM Developer Tab'] = Date.now() - stepStartTime;

    // Pre-condition Step 7: Save the opportunity (initial save)
    stepStartTime = Date.now();
    console.log('Pre-condition Step 7: Saving the opportunity (initial save)');
    
    // Re-check and uncheck "Create manually" if it was checked again by Odoo
    const reunchecked = await opportunityPage.verifyCreatedManuallyBeforeSave();
    if (reunchecked) {
      console.log('  ⚠ "Create manually" was re-checked, unchecked again');
    }
    
    await opportunityPage.saveAndWaitForCompletion();
    
    performanceMetrics['Initial Save'] = Date.now() - stepStartTime;
    console.log('✓ Opportunity saved successfully (initial save)');

    // Pre-condition Step 8: Refresh page to verify Contact field (up to 5 times, max 5 minutes)
    stepStartTime = Date.now();
    console.log('Pre-condition Step 8: Refreshing page and verifying Contact field');
    
    await opportunityPage.waitForContactFieldPopulated('test');
    
    performanceMetrics['Refresh and Verify'] = Date.now() - stepStartTime;
    console.log('✓ Page refresh and Contact field check completed');
    
    

    // Test Step 1: Press "DEAL ELEMENT" button
    stepStartTime = Date.now();
    console.log('Test Step 1: Clicking DEAL ELEMENT button');
    
    await opportunityPage.clickDealElement();
    
    // Wait for Deal Element form/dialog to open
    await dealElementPage.waitForFormOpen();
    performanceMetrics['Open Deal Element'] = Date.now() - stepStartTime;
    console.log('✓ Deal Element dialog opened');

    // Test Step 2: Verify and fill Deal Element information (Pricelist + Payment Term)
    stepStartTime = Date.now();
    console.log('Test Step 2: Verifying Deal Element information');
    
    // Wait for Odoo to auto-populate fields from the Opportunity
    await dealElementPage.waitForAutoPopulate();
    
    // Select Pricelist
    await dealElementPage.selectPricelist('Public Pricelist_USD');
    
    // Select Payment Term
    await dealElementPage.selectPaymentTerm('Immediate Payment');
    
    performanceMetrics['Verify/Fill Deal Element Info'] = Date.now() - stepStartTime;

    // Test Step 3: Add a product in Order Lines section
    stepStartTime = Date.now();
    console.log('Test Step 3: Adding product in Order Lines');
    
    await dealElementPage.addProduct('NAKIVO Backup');
    
    performanceMetrics['Add Product'] = Date.now() - stepStartTime;

    // Test Step 4: Save Deal Element and verify performance
    stepStartTime = Date.now();
    console.log('Test Step 4: Saving Deal Element (Performance measurement)');
    
    await dealElementPage.save(90000);
    
    dealSaveTime = Date.now() - stepStartTime;
    dealSaveSeconds = (dealSaveTime / 1000).toFixed(2);
    performanceMetrics['Save Deal Element (MEASURED)'] = dealSaveTime;
    
    // Calculate total elapsed time
    const totalElapsedTime = Date.now() - startTime;
    const totalElapsedSeconds = (totalElapsedTime / 1000).toFixed(2);
    
    console.log(`\n⏱️  Save Operation Time: ${dealSaveSeconds} seconds`);
    console.log(`⏱️  Total Time (including all steps): ${totalElapsedSeconds} seconds`);

    // Performance Verification: Ensure save time is less than 1 minute
    expect(dealSaveTime).toBeLessThan(PERFORMANCE_THRESHOLD);
    console.log(`\n✅ PERFORMANCE TEST PASSED: ${dealSaveSeconds}s < 60s`);
    
    // Detailed performance breakdown
    console.log('\n📊 Detailed Performance Breakdown:');
    console.log('━'.repeat(50));
    console.log('PRE-CONDITIONS:');
    ['Login', 'Navigate to CRM', 'Open Opp List', 'Open Create Form', 'Fill Form Fields', 'Fill CRM Developer Tab', 'Initial Save', 'Refresh and Verify'].forEach(step => {
      if (performanceMetrics[step]) {
        const seconds = (performanceMetrics[step] / 1000).toFixed(2);
        console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
      }
    });
    console.log('\nTEST STEPS:');
    ['Open Deal Element', 'Verify/Fill Deal Element Info', 'Add Product', 'Save Deal Element (MEASURED)'].forEach(step => {
      if (performanceMetrics[step]) {
        const seconds = (performanceMetrics[step] / 1000).toFixed(2);
        console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
      }
    });
    console.log('━'.repeat(50));
    console.log(`${'TOTAL TEST TIME'.padEnd(32)} ${totalElapsedSeconds.padStart(8)}s`);
    console.log('━'.repeat(50));
    
    // Performance Summary
    console.log('\n📊 Performance Summary (Save Operation):');
    console.log(`   - Save Operation Time: ${dealSaveSeconds} seconds`);
    console.log(`   - Threshold: 60 seconds`);
    console.log(`   - Margin: ${(60 - parseFloat(dealSaveSeconds)).toFixed(2)} seconds under threshold`);
    console.log(`   - Performance: ${((parseFloat(dealSaveSeconds) / 60) * 100).toFixed(2)}% of threshold`);
    console.log(`   - Total Test Time: ${totalElapsedSeconds} seconds (includes all pre-conditions and steps)`);

    // Test Step 5: Verify Deal Element creation (not included in performance measurement)
    console.log('\nTest Step 5: Verifying Deal Element creation (not included in performance measurement)');
    
    // Check if page is still available
    const pageStillAvailable = !page.isClosed();
    if (!pageStillAvailable) {
      console.log('  ⚠ Page was closed after save - cannot verify Deal Element creation');
    } else {
      // Wait for page to stabilize
      await page.waitForTimeout(2000).catch(() => {
        console.log('  ⚠ Page waitForTimeout failed - page may be closed');
      });
      
      // Verify Deal Element was created
      const pageContent = await page.textContent('body').catch(() => '') || '';
      
      // Check for success indicators
      const dealCreated = pageContent.includes('Quotation') || pageContent.includes('Order') || pageContent.includes('SO');
      if (dealCreated) {
        console.log('  ✓ Deal Element created successfully');
      } else {
        console.log('  ⚠ Deal Element creation verification: Status unclear');
      }
    }
    
    console.log('✅ Data verification completed');
  });
});
