import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Planned Expenses Tab Verification Test
 * Test Case ID: CRM-2482_2.2.2.1.2
 *
 * Summary: Verify the ROI blocks of a Investment record includes "Description" row
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_2.2.2.1.2" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 *
 * Steps to reproduce:
 * 1. Press "CREATE" button and wait
 * 2. Click at "Planned expenses" tab
 * 3. Press "Add a line" link and wait
 * 4. Click at "Description" field
 * 5. Verify "Description" field is a text field
 */

test.describe('CRM-2482_2.2.2.1.2 - Verify Planned Expenses Tab includes Description row', () => {

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

  test('CRM-2482_2.2.2.1.2: Verify the ROI blocks of a Investment record includes "Description" row', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);

    // Pre-condition Step 1: Login and navigate to Investments module
    await test.step('Pre-condition Step 1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investments module');
    });

    // Pre-condition Step 2: Navigate to Investment menu item
    await test.step('Pre-condition Step 2: Navigate to Investment', async () => {
      console.log('Step 2: Navigating to Investment menu item');

      await investmentPage.navigateToInvestment();

      console.log('✓ Navigated to Investment page\n');
    });

    // Step 1: Press CREATE button and wait
    await test.step('Step 1: Press CREATE button and wait', async () => {
      console.log('=== STEP 1: CLICK CREATE BUTTON ===');

      await investmentPage.clickCreateButton();

      console.log('✓ Create form opened');
    });

    // Step 2: Click at Planned expenses tab
    await test.step('Step 2: Click at "Planned expenses" tab', async () => {
      console.log('=== STEP 2: CLICK PLANNED EXPENSES TAB ===');

      await investmentPage.clickPlannedExpensesTab();

      console.log('✓ Planned expenses tab clicked and content loaded');
    });

    // Step 3: Press "Add a line" link and wait
    await test.step('Step 3: Press "Add a line" link and wait', async () => {
      console.log('=== STEP 3: CLICK ADD A LINE ===');

      await investmentPage.clickAddALine();

      console.log('✓ "Add a line" clicked and new row appeared');
    });

    // Step 4: Click at Description field
    await test.step('Step 4: Click at "Description" field', async () => {
      console.log('=== STEP 4: CLICK "Description" FIELD ===');

      await investmentPage.clickPlannedExpensesDescriptionField();

      console.log('\u2713 "Description" field clicked');
    });

    // Step 5: Verify Description field is a text field
    await test.step('Step 5: Verify "Description" field is a text field', async () => {
      console.log('=== STEP 5: VERIFY "Description" FIELD ===');

      const isTextFieldValid = await investmentPage.verifyPlannedExpensesDescriptionField();
      expect(isTextFieldValid).toBeTruthy();

      console.log('  ✓ "Description" field exists');
      console.log('  ✓ "Description" field is a text field');
      console.log('✓ Description field verified successfully');
    });

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
  });
});
