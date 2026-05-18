import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Investment Record Field Verification Test
 * Test Case ID: CRM-2482_2.1.1.10
 * 
 * Summary: Verify the main fields of a Investment record includes "Completion Events" field
 * 
 * Command to run:
 * npx playwright test --grep "CRM-2482_2.1.1.10" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 
 * Steps to reproduce:
 * 1. Press "CREATE" button and wait
 * 2. Verify "Completion Events" field is a multiple selections field
 */

test.describe('CRM-2482_2.1.1.10 - Verify Completion Events Field', () => {
  
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

  test('CRM-2482_2.1.1.10: Verify the main fields of a Investment record includes "Completion Events" field', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test); // 5 minutes timeout for this test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage_MainSection = new InvestmentPage(page);

    // Step 1: Login to the system
    await test.step('Step 1: Login to NAKIVO Partner Portal', async () => {
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('✓ Login successful');

       // Step 2: Navigate to Investments module
      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Navigated to Investments module');
    });

    // Step 2: Navigate to Investment menu
    await test.step('Step 2: Navigate to Investment', async () => {
      console.log('Step 2: Navigating to Investment');
      await investmentPage_MainSection.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    // Step 3: Click CREATE button
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await investmentPage_MainSection.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Step 4: Verify Completion Events field
    await test.step('Step 4: Verify "Completion Events" field is a multiple selections field', async () => {
      console.log('Step 4: Verifying "Completion Events" field');
      
      const isMultiSelectFieldValid = await investmentPage_MainSection.verifyCompletionEventsField();
      expect(isMultiSelectFieldValid).toBeTruthy();
      
      console.log('  ✓ "Completion Events" field exists');
      console.log('  ✓ "Completion Events" field is a multiple selections field');
      console.log('✓ Completion Events field verified successfully');
    });

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
  });
});
