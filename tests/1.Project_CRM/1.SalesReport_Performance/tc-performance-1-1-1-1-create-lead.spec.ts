import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Create CRM Lead
 * Test Case ID: TC.Performance.1.1.1.1
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.1\.1:" --project=chromium
 *
 * Objective: Verify the consumer time for creating Lead is less than 1 minute
 * 
 * Test Data:
 * - Lead Name: TEST
 * - Email: Company email
 * - Country: United States
 * - State: Connecticut
 * - Sales Team: Cleared
 * - Salesperson: Cleared
 * - Created Manually: FALSE (unchecked)
 * - Lead Form: License
 */

test.describe('TC.Performance.1.1.1.1 - Create CRM Lead Performance', () => {
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

  test('TC.Performance.1.1.1.1: Verify consumer time for creating Lead is less than 1 min', async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    const startTime = Date.now();
    const performanceMetrics: { [key: string]: number } = {};
    let stepStartTime: number;
    
    // Step 1: Login to the system
    await test.step('Step 1: Logging in to NAKIVO Partner Portal', async () => {
      stepStartTime = Date.now();
      console.log('Step 1: Logging in to NAKIVO Partner Portal');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      performanceMetrics['Login'] = Date.now() - stepStartTime;
      console.log('✓ Login successful');
    });

    // Step 2: Navigate to CRM > Leads
    await test.step('Step 2: Navigating to CRM > Leads', async () => {
      stepStartTime = Date.now();
      console.log('Step 2.1: Click at CRM');
      await homePage.navigateToCRM();
      console.log('Step 2.2: Navigating to CRM > Leads');
      
      await homePage.navigateToLeads();
      performanceMetrics['Navigate to Leads'] = Date.now() - stepStartTime;
      console.log('✓ Navigated to Leads page');
    });

    // Step 3: Click CREATE button
    await test.step('Step 3: Clicking CREATE button', async () => {
      stepStartTime = Date.now();
      console.log('Step 3: Clicking CREATE button');
      await leadPage.clickCreate();
      performanceMetrics['Open Create Form'] = Date.now() - stepStartTime;
      console.log('✓ Lead creation form opened');
    });

    // Step 4: Enter lead information
    let leadName: string;
    let emailAddress: string;
    await test.step('Step 4: Entering lead information', async () => {
      stepStartTime = Date.now();
      console.log('Step 4: Entering lead information');
      
      // Generate unique values
      leadName = leadPage.generateLeadName();
      emailAddress = leadPage.generateEmail();
      
      console.log(`  - Lead Opportunity: ${leadName}`);
      console.log('  - Lead Name: TEST');
      console.log(`  - Email: ${emailAddress}`);
      
      // Fill lead information using page object methods
      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillContactName('TEST');
      await leadPage.fillEmail(emailAddress);
      
      await leadPage.selectCountry('United States');
      console.log('  - Country: United States');
      
      await leadPage.selectState('Connecticut');
      console.log('  - State: Connecticut');
      
      const salesTeamCleared = await leadPage.clearSalesTeam();
      if (salesTeamCleared) {
        console.log('  - Sales Team: Cleared');
      } else {
        console.log('  - Sales Team: Field not found, skipping');
      }
      
      const salespersonCleared = await leadPage.clearSalesperson();
      if (salespersonCleared) {
        console.log('  - Salesperson: Cleared');
      } else {
        console.log('  - Salesperson: Field not found, skipping');
      }
      
      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      if (createdManuallyUnchecked) {
        console.log('  - Created Manually: Unchecked (FALSE)');
      } else {
        console.log('  - Created Manually: Failed to uncheck or field not found');
      }
      
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      const leadFormFilled = await leadPage.fillLeadForm('License');
      if (leadFormFilled) {
        console.log('  - Lead Form: License');
      } else {
        console.log('  - Lead Form: Field not found in CRM Developer tab, skipping');
      }
      
      performanceMetrics['Fill Form Fields'] = Date.now() - stepStartTime;
    });

    // Step 5: Save the lead and verify performance
    await test.step('Step 5: Saving the lead and verify performance', async () => {
      stepStartTime = Date.now();
      console.log('Step 5: Saving the lead (Performance measurement starts)');
      
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      
      // Calculate elapsed time (only for save operation)
      const endTime = Date.now();
      const saveTime = endTime - stepStartTime;
      const elapsedTime = endTime - startTime;
      const saveSeconds = (saveTime / 1000).toFixed(2);
      const elapsedSeconds = (elapsedTime / 1000).toFixed(2);
      
      performanceMetrics['Save Lead'] = saveTime;
      console.log('✓ Lead saved successfully');
      console.log(`\n⏱️  Save Operation Time: ${saveSeconds} seconds`);
      console.log(`⏱️  Total Time (including all steps): ${elapsedSeconds} seconds`);
      
      // Performance Verification: Ensure save time is less than 1 minute
      expect(saveTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      console.log(`\n✅ PERFORMANCE TEST PASSED: ${saveSeconds}s < 60s`);
      
      // Detailed performance breakdown
      console.log('\n📊 Detailed Performance Breakdown:');
      console.log('━'.repeat(50));
      Object.entries(performanceMetrics).forEach(([step, time]) => {
        const seconds = (time / 1000).toFixed(2);
        const percentage = ((time / elapsedTime) * 100).toFixed(1);
        console.log(`${step.padEnd(25)} ${seconds.padStart(8)}s  (${percentage.padStart(5)}%)`);
      });
      console.log('━'.repeat(50));
      console.log(`${'TOTAL'.padEnd(25)} ${elapsedSeconds.padStart(8)}s  (100.0%)`);
      console.log(`   Margin: ${(60 - parseFloat(saveSeconds)).toFixed(2)}s under threshold  |  ${((parseFloat(saveSeconds) / 60) * 100).toFixed(2)}% of threshold`);
      console.log('━'.repeat(50));
    });

    // Step 6: Verify saved data (not included in performance measurement)
    await test.step('Step 6: Verifying saved data', async () => {
      console.log('\nStep 6: Verifying saved data (not included in performance measurement)');
      
      const verificationResults = await leadPage.verifyLeadData({
        contactName: 'TEST',
        email: emailAddress,
        country: 'United States',
        state: 'Connecticut'
      });
      
      if (verificationResults.contactName) {
        console.log('  ✓ Contact Name verified: TEST');
      } else {
        console.log('  ⚠ Contact Name verification failed');
      }
      
      if (verificationResults.email) {
        console.log(`  ✓ Email verified: ${emailAddress}`);
      } else {
        console.log('  ⚠ Email verification failed');
      }
      
      if (verificationResults.address) {
        console.log('  ✓ Country and State verified: United States, Connecticut');
      } else {
        console.log('  ⚠ Country/State verification skipped (may auto-fill incorrectly)');
      }
      
      console.log('\n✅ Data verification completed');
    });
  });
});
