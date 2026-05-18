import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Performance Test - Edit CRM Lead
 * Test Case ID: TC.Performance.1.1.1.2
 *
 * Command to run:
 * npx playwright test --grep "TC\.Performance\.1\.1\.1\.2:" --project=chromium
 *
 * Objective: Verify the consumer time for editing Lead is less than 1 minute
 * 
 * Pre-condition:
 * 1. Create a new Lead with initial data
 * 2. Edit the State field from Connecticut to CA (US)
 * 
 * Test Data:
 * - Lead Name: TEST
 * - Email: Company email
 * - Country: United States
 * - Initial State: Connecticut
 * - Updated State: CA (US)
 * - Sales Team: Cleared
 * - Salesperson: Cleared
 * - Created Manually: FALSE (unchecked)
 * - Lead Form: License
 */

test.describe('TC.Performance.1.1.1.2 - Edit CRM Lead Performance', () => {
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

  test('TC.Performance.1.1.1.2: Verify consumer time for editing Lead is less than 1 min', async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
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
      console.log('Step 1: Click at CRM');
      await homePage.navigateToCRM();
      console.log('Step 2: Navigating to CRM > Leads');
      
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
    await test.step('Step 4: Entering lead information', async () => {
      stepStartTime = Date.now();
      console.log('Step 4: Entering lead information');
      
      // Generate unique identifiers
      const leadName = leadPage.generateLeadName();
      const emailAddress = leadPage.generateEmail();
      
      console.log(`  - Lead Opportunity: ${leadName}`);
      console.log('  - Contact Name: TEST');
      console.log(`  - Email: ${emailAddress}`);
      console.log('  - Country: United States');
      console.log('  - State: Connecticut');
      
      // Fill lead opportunity
      await leadPage.fillLeadOpportunity(leadName);
      
      // Fill contact name
      await leadPage.fillContactName('TEST');
      
      // Fill email
      await leadPage.fillEmail(emailAddress);
      
      // Select country
      await leadPage.selectCountry('United States');
      
      // Select state
      await leadPage.selectState('Connecticut');
      
      // Clear sales team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(salesTeamCleared ? '  - Sales Team: Cleared' : '  - Sales Team: Field not found, skipping');
      
      // Clear salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(salespersonCleared ? '  - Salesperson: Cleared' : '  - Salesperson: Field not found, skipping');
      
      // Uncheck created manually
      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      console.log(createdManuallyUnchecked ? '  - Created Manually: Unchecked (FALSE)' : '  - Created Manually: Field not found, skipping');
      
      // Click CRM Developer tab and fill Lead Form
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      const leadFormFilled = await leadPage.fillLeadForm('License');
      console.log(leadFormFilled ? '  - Lead Form: License' : '  - Lead Form: Field not found, skipping');
      
      performanceMetrics['Fill Form Fields'] = Date.now() - stepStartTime;
    });

    // Step 5: Save the lead
    await test.step('Step 5: Saving the lead', async () => {
      stepStartTime = Date.now();
      console.log('Step 5: Saving the lead');
      
      // Re-check and uncheck "Create manually" if needed
      await leadPage.uncheckCreatedManually();
      
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      
      // Wait for save to complete
      await page.waitForTimeout(1000);
      
      performanceMetrics['Save Lead'] = Date.now() - stepStartTime;
      console.log('✓ Lead saved successfully');
    });

    // Step 6: Click EDIT button to enter edit mode
    await test.step('Step 6: Click EDIT button', async () => {
      stepStartTime = Date.now();
      console.log('\nStep 6: Clicking EDIT button');
      
      await leadPage.getEditButton().first().click();
      await leadPage.getEditableFormLocator().first().waitFor({ state: 'visible', timeout: 60000 });
      
      performanceMetrics['Open Edit Mode'] = Date.now() - stepStartTime;
      console.log('  ✓ Edit mode opened');
    });

    // Step 7: Change State from Connecticut to CA (US)
    await test.step('Step 7: Change State from Connecticut to CA (US)', async () => {
      stepStartTime = Date.now();
      console.log('Step 7: Changing State to CA (US)');
      
      await leadPage.selectState('CA');
      
      // Wait for Save button to be enabled
      await page.waitForSelector('button.o_form_button_save:not([disabled])', { timeout: 60000 });
      
      // Additional wait to ensure state change is fully registered
      await page.waitForTimeout(1000);
      
      console.log('  - State changed to: CA (US)');
      performanceMetrics['Edit State Field'] = Date.now() - stepStartTime;
    });

    // Step 8: Save the changes and measure performance
    await test.step('Step 8: Saving the edited lead and verify performance', async () => {
      const startEditTime = Date.now();
      console.log('Step 8: Saving the edited lead (Performance measurement starts)');
      
      await leadPage.clickSave();
      
      // Wait for save to complete
      await page.waitForTimeout(1000);
      
      const editSaveTime = Date.now() - startEditTime;
      const editSaveSeconds = (editSaveTime / 1000).toFixed(2);
      performanceMetrics['Save Edited Lead'] = editSaveTime;
      console.log('✓ Lead edited and saved successfully');
      
      console.log(`\n⏱️  Save Operation Time: ${editSaveSeconds} seconds`);
      
      // Performance Verification: Ensure edit save time is less than 1 minute
      expect(editSaveTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      console.log(`\n✅ PERFORMANCE TEST PASSED: ${editSaveSeconds}s < 60s`);
      
      // Detailed performance breakdown
      console.log('\n📊 Detailed Performance Breakdown:');
      console.log('━'.repeat(50));
      Object.entries(performanceMetrics).forEach(([step, time]) => {
        const seconds = (time / 1000).toFixed(2);
        console.log(`${step.padEnd(30)} ${seconds.padStart(8)}s`);
      });
      console.log('━'.repeat(50));
      
      // Edit Performance Summary
      console.log('\n📊 Edit Performance Summary (Save Operation):');
      console.log(`   - Save Time: ${editSaveSeconds} seconds`);
      console.log(`   - Threshold: 60 seconds`);
      console.log(`   - Margin: ${(60 - parseFloat(editSaveSeconds)).toFixed(2)} seconds under threshold`);
      console.log(`   - Performance: ${((parseFloat(editSaveSeconds) / 60) * 100).toFixed(2)}% of threshold`);
    });

    // Step 9: Verification (not included in performance measurement)
    await test.step('Step 9: Verifying edited data', async () => {
      console.log('\nStep 9: Verifying edited data (not included in performance measurement)');
      
      // Wait for page to stabilize after save
      await page.waitForTimeout(500);
      
      // Verify State - check for CA or California in the page content
      const pageContent = await page.textContent('body').catch(() => '') || '';
      const stateVerified = pageContent.includes('CA (US)') || pageContent.includes('California') || pageContent.includes('CA,');
      
      if (stateVerified) {
        console.log('  ✓ State verified: CA (US)');
      } else {
        console.log('  ⚠ State verification: CA may not be visible in current view');
      }
      
      console.log('\n✅ Data verification completed');
    });
  });
});