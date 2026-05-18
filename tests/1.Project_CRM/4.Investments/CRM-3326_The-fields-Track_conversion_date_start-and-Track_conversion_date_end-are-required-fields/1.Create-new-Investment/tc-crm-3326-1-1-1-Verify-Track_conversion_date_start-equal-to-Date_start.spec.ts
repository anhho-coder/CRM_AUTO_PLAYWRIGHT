import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Track Conversion Date Start Auto-fill Test
 * Test Case ID: CRM-3326_1.1.1
 *
 * Summary: Verify the "Track conversion date start" is set equal to "Date start"
 *          when newly creating an Investment
 *
 * Command to run:
 * npx playwright test --grep "CRM-3326_1.1.1" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 *
 * Steps to reproduce:
 * 1. On Investment page, enter the value to the following fields:
 *    - "Date start" date = current date
 * 2. Verify that the value at the following fields are automatically added:
 *    - "Track conversion date start" date = current date
 *
 * Tear down: None (record is never saved)
 */

test.describe('CRM-3326_1.1.1 - Verify Track conversion date start equals Date start on new Investment', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        // proceed to screenshot
      }
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-3326_1.1.1: Verify Track conversion date start is set equal to Date start when creating Investment', async ({ page }) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute current date (MM/DD/YYYY)
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const currentDate = `${mm}/${dd}/${yyyy}`;

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
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    // Pre-condition Step 3: Press CREATE button and wait
    await test.step('Pre-condition Step 3: Press CREATE button and wait', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // Step 1: Enter "Date start" = current date
    await test.step('Step 1: Enter "Date start" = current date', async () => {
      console.log('\n=== STEP 1: FILL DATE START ===');

      await investmentPage.fillDateStart(currentDate);

      console.log(`✓ Date start entered: ${currentDate}`);
    });

    // Step 2: Verify "Track conversion date start" = current date (auto-populated)
    await test.step('Step 2: Verify "Track conversion date start" = current date', async () => {
      console.log('=== STEP 2: VERIFY TRACK CONVERSION DATE START ===');

      const trackStartActual = await investmentPage.getTrackConversionDateStartValue();

      console.log(`  Track conversion date start actual  : "${trackStartActual}"`);
      console.log(`  Track conversion date start expected: "${currentDate}"`);

      expect(trackStartActual, 'Step 2: Track conversion date start should equal Date start').toBe(currentDate);

      console.log('  ✓ Track conversion date start verified');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
    console.log('\n✅ TEAR DOWN: No saved record — nothing to clean up');
  });
});
