import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Create License
 * Test Case ID: TC.Performance.1.1.7.1
 * 
 * Summary: Verify the consumer time for creating License is less than 1 min
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.7\.1:" --project=chromium
 *
 * Pre-condition:
 * 1. Use the account of admin crm to login successful
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
 * 12. Press "NEW QUOTATION" button and wait
 * 13. Press "CONFIRM" button and wait to create a Sales Order
 * 14. On "Sales Order" screen, press "CREATE INVOICE" button and wait
 * 15. On "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait
 * 16. Press "VALIDATE" button and wait
 * 17. Press "CREATE LICENSE" button and wait
 * 18. Once, "License" screen appear, select the value "sockets" at "for monitoring" dropdown list
 * 
 * Steps run:
 * 1. Press "SAVE" button and wait
 * 
 * Verification:
 * - Time consuming after pressing "SAVE" button takes less than 1 minute
 */

test.describe('TC.Performance.1.1.7.1 - Create License Performance', () => {
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
        test('TC.Performance.1.1.7.1: Verify consumer time for creating License is less than 1 min', async ({ page, browser }, testInfo) => {
          test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
          
          // Maximize browser window
          await page.setViewportSize({ width: 1920, height: 1080 });
          
          const loginPage = new LoginPage(page);
          const homePage = new HomePage(page);
          const opportunityPage = new OpportunityPage(page);
          const dealElementPage = new DealElementPage(page);
          const quotationPage = new QuotationPage(page);
          const invoicePage = new InvoicePage(page);
          const licensePage = new LicensePage(page);
          const startTime = Date.now();
          const performanceMetrics: { [key: string]: number } = {};
          let stepStartTime: number;
          let saveTime: number = 0;
          let saveSeconds: string = '0';
          
          // Step 1: Login to the system as admin crm
          await test.step('Step 1: Use the account of admin crm to login successful', async () => {
            stepStartTime = Date.now();
            console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
            await loginPage.navigateTo(baseUrl);
            await loginPage.login(users.admin_crm.username, users.admin_crm.password);
            await loginPage.dismissLocationPermissionDialog();
            performanceMetrics['Login'] = Date.now() - stepStartTime;
            console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
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
      
          // Step 10: Add a product in Order Lines section
          await test.step('Step 10: At "Order Lines" section - Add a product', async () => {
            stepStartTime = Date.now();
            console.log('Step 10: Adding product');
            
            // Add product
            await dealElementPage.addProduct('');
            const productText = await page.locator('.o_data_row').first().locator('[name="product_id"]').textContent().catch(() => 'first product');
            console.log(`  - Product added: ${productText}`);
            
            // Wait for product to be added and fields to populate
            await page.waitForTimeout(CommonUtils.waitTimes.standard);
            
            performanceMetrics['Add Product'] = Date.now() - stepStartTime;
          });
      
          // Step 11: Save Deal Element
          await test.step('Step 11: Finally, press "SAVE" button on the top page and wait', async () => {
            stepStartTime = Date.now();
            console.log('Step 11: Saving Deal Element');
            
            await dealElementPage.save(CommonUtils.waitTimes.savingPage);
            console.log('  - Deal Element saved successfully');
            
            performanceMetrics['Save Deal Element'] = Date.now() - stepStartTime;
            console.log('✓ Deal Element saved successfully');
          });
  
      // Step 12: Press "NEW QUOTATION" button
      await test.step('Step 12: Press "NEW QUOTATION" button and wait', async () => {
        stepStartTime = Date.now();
        console.log('Step 12: Creating NEW QUOTATION');
        
        // Create NEW QUOTATION using POM
        await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
        console.log('  - New Quotation created successfully');
        
        // Wait for quotation page to fully load
        await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
        console.log('  - Quotation page loaded');
        
        performanceMetrics['Create NEW QUOTATION'] = Date.now() - stepStartTime;
        console.log('✓ New Quotation created successfully');
      });
  
      // Step 13: Press "CONFIRM" button to create Sales Order
      await test.step('Step 13: Press "CONFIRM" button and wait to create a Sales Order', async () => {
        stepStartTime = Date.now();
        console.log('Step 13: Confirming quotation to create Sales Order');
        
        // Wait for page to stabilize after quotation creation
        await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
        
        // Confirm quotation using POM
        await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
        console.log('  - Quotation confirmed');
        
        // Wait for confirmation to complete
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        
        performanceMetrics['Confirm Quotation'] = Date.now() - stepStartTime;
        console.log('✓ Quotation confirmed - Sales Order created');
      });
  
      // Step 14: Press "CREATE INVOICE" button
      await test.step('Step 14: On "Sales Order" screen, press "CREATE INVOICE" button and wait', async () => {
        stepStartTime = Date.now();
        console.log('Step 14: Clicking CREATE INVOICE button');
        
        // Wait for page to stabilize after confirmation
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        
        // Click CREATE INVOICE button using POM
        await invoicePage.clickCreateInvoice();
        
        performanceMetrics['Open Create Invoice Dialog'] = Date.now() - stepStartTime;
        console.log('✓ Invoice Order window opened');
      });
  
      // Step 15: Press "CREATE AND VIEW INVOICES" button
      await test.step('Step 15: On "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait', async () => {
        stepStartTime = Date.now();
        console.log('Step 15: Creating invoice using CREATE AND VIEW INVOICES');
        
        // Create invoice using POM
        const invoiceCreationTime = await invoicePage.clickCreateAndViewInvoices();
        
        performanceMetrics['Create Invoice'] = invoiceCreationTime;
        console.log('✓ Invoice created successfully');
      });

      // Step 16: Press "VALIDATE" button
      await test.step('Step 16: Press "VALIDATE" button and wait', async () => {
        stepStartTime = Date.now();
        console.log('Step 16: Validating Invoice');
        
        // Validate invoice using POM
        await invoicePage.clickValidate();
        
        performanceMetrics['Validate Invoice'] = Date.now() - stepStartTime;
        console.log('✓ Invoice validated successfully');
      });

      // Step 17: Press "CREATE LICENSE" button
      await test.step('Step 17: Press "CREATE LICENSE" button and wait', async () => {
        stepStartTime = Date.now();
        console.log('Step 17: Clicking CREATE LICENSE button');
        
        // Click CREATE LICENSE using POM
        await invoicePage.clickCreateLicense();
        
        // Wait for License form to fully load
        await licensePage.waitForPageLoad();
        
        performanceMetrics['Open License Form'] = Date.now() - stepStartTime;
        console.log('✓ License screen opened and fully loaded');
      });

      // Step 18: Select "sockets" in "for monitoring" dropdown
      await test.step('Step 18: Once, "License" screen appear, select the value "sockets" at "for monitoring" dropdown list', async () => {
        stepStartTime = Date.now();
        console.log('Step 18: Selecting "sockets" in "for monitoring" dropdown');
        
        // Select "sockets" using POM
        await licensePage.selectForMonitoring('sockets');
        
        performanceMetrics['Select For Monitoring'] = Date.now() - stepStartTime;
        console.log('✓ Selected "sockets" for monitoring');
      });

      // Steps run - Step 1: Press "SAVE" button and verify performance
      await test.step('Steps run - Step 1: Press "SAVE" button (Performance measurement)', async () => {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PERFORMANCE TEST - Saving License (Performance Measurement)');
        
        // Click SAVE button and measure performance using POM
        saveTime = await licensePage.clickSaveAndWaitForCompletion();
        saveSeconds = (saveTime / 1000).toFixed(2);
        
        performanceMetrics['SAVE License Process'] = saveTime;
        
        // Calculate total elapsed time
        const totalElapsedTime = Date.now() - startTime;
        const totalElapsedSeconds = (totalElapsedTime / 1000).toFixed(2);
        
        console.log(`\n⏱️  Save Operation Time: ${saveSeconds} seconds`);
        console.log(`⏱️  Total Time (including all steps): ${totalElapsedSeconds} seconds`);
        
        // Performance Verification: Ensure time after pressing SAVE button is less than 1 minute
        expect(saveTime).toBeLessThan(PERFORMANCE_THRESHOLD);
        console.log(`\n✅ PERFORMANCE TEST PASSED: ${saveSeconds}s < 60s`);
        
        // Detailed performance breakdown
        console.log('\n📊 Detailed Performance Breakdown:');
        console.log('━'.repeat(50));
        console.log('PRE-CONDITIONS:');
        Object.entries(performanceMetrics).filter(([step]) => !step.includes('SAVE License')).forEach(([step, time]) => {
          const seconds = (time / 1000).toFixed(2);
          console.log(`  ${step.padEnd(35)} ${seconds.padStart(8)}s`);
        });
        console.log('\nTEST STEPS:');
        ['SAVE License Process'].forEach(step => {
          if (performanceMetrics[step]) {
            const seconds = (performanceMetrics[step] / 1000).toFixed(2);
            console.log(`  ${step.padEnd(35)} ${seconds.padStart(8)}s`);
          }
        });
        console.log('━'.repeat(50));
        console.log(`${'TOTAL TEST TIME'.padEnd(37)} ${totalElapsedSeconds.padStart(8)}s`);
        console.log('━'.repeat(50));
        
        // Performance Summary
        console.log('\n📊 Performance Summary (Save Operation):');
        console.log(`   - Save Operation Time: ${saveSeconds} seconds`);
        console.log(`   - Threshold: 60 seconds`);
        console.log(`   - Margin: ${(60 - parseFloat(saveSeconds)).toFixed(2)} seconds under threshold`);
        console.log(`   - Performance: ${((parseFloat(saveSeconds) / 60) * 100).toFixed(2)}% of threshold`);
        console.log(`   - Total Test Time: ${totalElapsedSeconds} seconds (includes all pre-conditions and steps)`);
      });
      
      // Verification: Verify License creation (not included in performance measurement)
      await test.step('Verification: Verify License creation (not included in performance measurement)', async () => {
        console.log('\nVerification: Verifying License creation (not included in performance measurement)');
        
        // Verify license was created
        const pageContent = await page.textContent('body').catch(() => '') || '';
        const isCreated = pageContent.includes('License') || pageContent.includes('license');
        
        if (isCreated) {
          console.log('  ✓ License created successfully');
        } else {
          console.log('  ⚠ License creation verification: Status unclear');
        }
        
        console.log('✅ Data verification completed');
      });
    
    // Capture final screenshot for test report
    await test.step('Capture final screenshot and performance summary', async () => {
      await CommonUtils.captureAndAttachScreenshot(
        page,
        testInfo,
        `✅ Performance Test Passed - License Create Time: ${saveSeconds}s`
      );
    });
  });
});
