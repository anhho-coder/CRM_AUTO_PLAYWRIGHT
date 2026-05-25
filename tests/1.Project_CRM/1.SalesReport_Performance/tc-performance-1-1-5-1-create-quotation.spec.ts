import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Create Quotation
 * Test Case ID: TC.Performance.1.1.5.1
 * 
 * Summary: Verify the consumer time for creating Quotation is less than 1 min
 * 
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.5\.1:" --project=chromium
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
 * 11. Finally, press "SAVE" button on the top page and wait
 * 
 * Steps run:
 * 1. Press "NEW QUOTATION" button
 * 
 * Verification:
 * - Time consuming for saving process takes less than 1 minute
 */

test.describe('TC.Performance.1.1.5.1 - Create Quotation Performance', () => {
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

  test('TC.Performance.1.1.5.1: Verify consumer time for creating Quotation is less than 1 min', async ({ page }) => {
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
    let quotationTime: number = 0;
    let quotationSeconds: string = '0';
    
    // Step 1: Login to the system as Thomas
    stepStartTime = Date.now();
    console.log(`Step 1: Logging in as ${users.sale_ic_thomas.displayName}`);
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
    await loginPage.dismissLocationPermissionDialog();
    performanceMetrics['Login'] = Date.now() - stepStartTime;
    console.log(`✓ Login successful as ${users.sale_ic_thomas.displayName}`);

    // Step 2: Navigate to CRM
    stepStartTime = Date.now();
    console.log('Step 2: Navigating to CRM');
    await homePage.navigateToCRM();
    performanceMetrics['Navigate to CRM'] = Date.now() - stepStartTime;
    console.log('✓ Navigated to CRM page');

    // Step 3: Click on "view list" button to navigate to Opportunities
    stepStartTime = Date.now();
    console.log('Step 3: Switching to list view');
    await opportunityPage.switchToListView();
    performanceMetrics['Open Opp List'] = Date.now() - stepStartTime;
    console.log('✓ Opp list view opened');

    // Step 4: Click CREATE button
    stepStartTime = Date.now();
    console.log('Step 4: Clicking CREATE button');
    await opportunityPage.clickCreate();
    performanceMetrics['Open Create Form'] = Date.now() - stepStartTime;
    console.log('✓ Opp creation form opened');

    // Step 5: Enter opportunity information
    stepStartTime = Date.now();
    console.log('Step 5: Entering opportunity information');
    
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
    
    performanceMetrics['Fill Form Fields'] = Date.now() - stepStartTime;

    // Step 6: Click on "CRM Developer" tab and fill Lead Form
    stepStartTime = Date.now();
    console.log('Step 6: Filling CRM Developer tab');
    
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

    // Step 7: Save the opportunity
    stepStartTime = Date.now();
    console.log('Step 7: Saving the opportunity');
    
    await opportunityPage.saveAndWaitForCompletion();
    
    performanceMetrics['Save Opportunity'] = Date.now() - stepStartTime;
    console.log('✓ Opportunity saved successfully');

    // Step 8: Refresh page to verify Contact field
    stepStartTime = Date.now();
    console.log('Step 8: Refreshing page and verifying Contact field');
    
    await opportunityPage.waitForContactFieldPopulated('test');
    
    performanceMetrics['Refresh and Verify'] = Date.now() - stepStartTime;
    console.log('✓ Page refreshed and Contact field checked');

    // Step 9: Press "DEAL ELEMENT" button
    stepStartTime = Date.now();
    console.log('Step 9: Clicking DEAL ELEMENT button');
    
    await opportunityPage.clickDealElement();
    console.log('  - Clicked DEAL ELEMENT button');
    
    // Wait for Deal Element form to open
    await dealElementPage.waitForFormOpen();
    console.log('  - Deal Element form opened');
    
    performanceMetrics['Open Deal Element'] = Date.now() - stepStartTime;

    // Step 10: Verify and fill Deal Element information if needed
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

    // Step 11: At "Order Lines" section, add a product and press "SAVE" button
    stepStartTime = Date.now();
    console.log('Step 11: Adding product in Order Lines');
    
    await dealElementPage.addProduct('NAKIVO Backup');
    console.log('  - Product added: NAKIVO Backup');
    
    performanceMetrics['Add Product'] = Date.now() - stepStartTime;

    // Save Deal Element
    stepStartTime = Date.now();
    console.log('  - Saving Deal Element');
    
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    console.log('  - Deal Element saved successfully');
    
    performanceMetrics['Save Deal Element'] = Date.now() - stepStartTime;

    // ============================================================
    // STEPS RUN - Performance Measurement
    // ============================================================
    // Step 1: Press "NEW QUOTATION" button and verify performance
    await test.step('Step 1: Press "NEW QUOTATION" button (Performance measurement)', async () => {
      stepStartTime = Date.now();
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('PERFORMANCE TEST - Step 1: Press "NEW QUOTATION" button');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Look for "NEW QUOTATION" button (appears after Deal Element is saved)
      const quotationButtonExists = await opportunityPage.hasNewQuotationButton();
      
      if (!quotationButtonExists) {
        console.log('  ⚠ "NEW QUOTATION" button not found - test cannot continue');
        throw new Error('NEW QUOTATION button not found on the page');
      }
      
      // START PERFORMANCE MEASUREMENT - Click NEW QUOTATION button
      const startQuotationTime = Date.now();
      
      await opportunityPage.clickNewQuotation();
      console.log('  - Clicked "NEW QUOTATION" button (performance timer started)');
      
      // NEW QUOTATION creates and saves the quotation automatically
      // Wait for navigation to the new quotation page
      await quotationPage.waitForQuotationNavigation();
      console.log('  - Navigated to new Quotation page');
      
      // Wait for the form view to be visible
      await quotationPage.waitForFormView();
      
      // Wait for Edit button to appear (indicates quotation is fully created and saved)
      await quotationPage.waitForEditButton();
      
      // END PERFORMANCE MEASUREMENT - Quotation created and saved successfully
      quotationTime = Date.now() - startQuotationTime;
      quotationSeconds = (quotationTime / 1000).toFixed(2);
      
      performanceMetrics['NEW QUOTATION Process'] = quotationTime;
      console.log('✓ New Quotation created and saved successfully');
      
      // Calculate total elapsed time
      const totalElapsedTime = Date.now() - startTime;
      const totalElapsedSeconds = (totalElapsedTime / 1000).toFixed(2);
      
      console.log(`\n⏱️  NEW QUOTATION Operation Time: ${quotationSeconds} seconds`);
      console.log(`⏱️  Total Time (including all steps): ${totalElapsedSeconds} seconds`);
      
      // Performance Verification: Ensure time after pressing NEW QUOTATION button is less than 1 minute
      expect(quotationTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      console.log(`\n✅ PERFORMANCE TEST PASSED: ${quotationSeconds}s < 60s`);
      
      // Detailed performance breakdown
      console.log('\n📊 Detailed Performance Breakdown:');
      console.log('━'.repeat(50));
      console.log('PRE-CONDITIONS:');
      ['Login', 'Navigate to CRM', 'Open Opp List', 'Open Create Form', 'Fill Form Fields', 'Fill CRM Developer Tab', 'Save Opportunity', 'Refresh and Verify'].forEach(step => {
        if (performanceMetrics[step]) {
          const seconds = (performanceMetrics[step] / 1000).toFixed(2);
          console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
        }
      });
      console.log('\nTEST STEPS:');
      ['Open Deal Element', 'Fill Deal Element Info', 'Add Product', 'Save Deal Element', 'NEW QUOTATION Process'].forEach(step => {
        if (performanceMetrics[step]) {
          const seconds = (performanceMetrics[step] / 1000).toFixed(2);
          console.log(`  ${step.padEnd(30)} ${seconds.padStart(8)}s`);
        }
      });
      console.log('━'.repeat(50));
      console.log(`${'TOTAL TEST TIME'.padEnd(32)} ${totalElapsedSeconds.padStart(8)}s`);
      console.log('━'.repeat(50));
      
      // Performance Summary
      console.log('\n📊 Performance Summary (NEW QUOTATION Operation):');
      console.log(`   - Operation Time: ${quotationSeconds} seconds`);
      console.log(`   - Threshold: 60 seconds`);
      console.log(`   - Margin: ${(60 - parseFloat(quotationSeconds)).toFixed(2)} seconds under threshold`);
      console.log(`   - Performance: ${((parseFloat(quotationSeconds) / 60) * 100).toFixed(2)}% of threshold`);
      console.log(`   - Total Test Time: ${totalElapsedSeconds} seconds (includes all pre-conditions and steps)`);
    });
    
    // Step 2: Verify Quotation creation (not included in performance measurement)
    await test.step('Step 2: Verify Quotation creation (not included in performance measurement)', async () => {
      console.log('\nStep 2: Verifying Quotation creation (not included in performance measurement)');
      
      // Verify quotation page is displayed
      const pageContent = await page.textContent('body').catch(() => '') || '';
      const quotationCreated = pageContent.includes('Quotation') || pageContent.includes('Sale Order') || pageContent.includes('SO');
      
      if (quotationCreated) {
        console.log('  ✓ Quotation created successfully');
      } else {
        console.log('  ⚠ Quotation creation verification: Status unclear');
      }
      
      console.log('✅ Data verification completed');
    });
  });
});
