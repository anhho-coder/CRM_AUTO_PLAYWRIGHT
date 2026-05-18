import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Activity Type Test
 * Test Case ID: CRM-2482_1.1.1
 * 
 * Summary: Verify the authorised user can create/edit an Activity type
 * 
 * Command to run:
 * npx playwright test "tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/1.Configuration/1.1.Activity_Type/tc-crm-2482-1-1-1-create-edit-activity-type.spec.ts" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Configuration" item then "Activity Type" sub-item
 * 
 * Steps to reproduce:
 * 1. Press "CREATE" button and wait
 * 2. In the bottom of page, enter value at:
 *    - "Name" field = TEST (with template Name_Test_company + current date + current time.com)
 *      (Remember the created name, called Activity_Type_Name#1)
 *    - "Code" field = test_to_test (with template Code_Test_company + current date + current time.com)
 *      (Remember the created code, called Activity_Type_Code#1)
 * 3. Press "SAVE" button and wait
 * 4. Verify In the bottom of page, enter value at:
 *    - "Name" field = Activity_Type_Name#1
 *    - "Code" field = Activity_Type_Code#1
 * 
 * Tear down (Clean up test data):
 * 1. Click at checkbox at the new created Activity Type
 * 2. Select "Action" dropdown list on header of page
 * 3. Select "Delete" option
 * 4. Press "OK" button on "Are you sure you want to delete this record?" window
 */

test.describe('CRM-2482_1.1.1 - Create/Edit Activity Type', () => {
  
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

  test('CRM-2482_1.1.1: Verify the authorised user can create/edit an Activity type', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test); // 5 minutes timeout for this test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage_Configuration_ActivityType = new InvestmentPage(page);
    
    // Generate unique names with timestamp to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    const activityTypeName = `Name_Test_company_${timestamp}`;
    const activityTypeCode = `Code_Test_company_${timestamp}`;

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

        // Step 2: Navigate to Configuration > Activity Type
    await test.step('Step 2: Navigate to  Configuration > Activity Type', async () => {
      console.log('Step 2: Navigating toConfiguration > Activity Type');
      await investmentPage_Configuration_ActivityType.navigateToActivityType();
      console.log('✓ Navigated to Activity Type page');
    });

    // Step 3: Click CREATE button
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await investmentPage_Configuration_ActivityType.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Step 4: Enter Activity Type information
    await test.step('Step 4: Enter Activity Type information', async () => {
      console.log('Step 4: Entering Activity Type information');
      await investmentPage_Configuration_ActivityType.fillActivityTypeForm(activityTypeName, activityTypeCode);
      console.log(`  - Name: ${activityTypeName}`);
      console.log(`  - Code: ${activityTypeCode}`);
      console.log('✓ Activity Type information entered');
    });

    // Step 5: Save the Activity Type
    await test.step('Step 5: Save the Activity Type', async () => {
      console.log('Step 5: Saving the Activity Type');
      await investmentPage_Configuration_ActivityType.clickSaveButton();
      console.log('✓ Activity Type saved successfully');
    });

    // Step 6: Verify saved Activity Type data
    await test.step('Step 6: Verify saved Activity Type data', async () => {
      console.log('Step 6: Verifying saved Activity Type data');
      
      // After save, the page redirects to list view
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
            
      // Verify the Activity Type appears in the list with correct data
      await investmentPage_Configuration_ActivityType.verifyActivityTypeInList(activityTypeName, activityTypeCode);
      
      console.log('✓ All data verified successfully from list view');
    });

    // Teardown: Delete the created Activity Type
    await test.step('Teardown: Delete the created Activity Type', async () => {
      console.log('Teardown: Deleting the created Activity Type');
      
      // Select the checkbox for the created Activity Type
      await investmentPage_Configuration_ActivityType.selectActivityTypeRow(activityTypeName);
      console.log('  - Selected Activity Type checkbox');
      console.log('  - Activity Type checkbox is checked');
      
      // Delete the selected Activity Type
      await investmentPage_Configuration_ActivityType.deleteSelectedActivityType();
      console.log('  - Clicked Action dropdown');
      console.log('  - Clicked Delete option');
      console.log('  - Confirmed deletion');
      
      console.log('✓ Activity Type deleted successfully');
    });

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
  });
});
