import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify fields on Re-assignment page
 * Test Case ID: CRM-457_1.1.3
 *
 * Summary: Verify "Re-assignment to" combobox display on "Re-assignment" page
 *
 * Command to run:
 * npx playwright test --grep "CRM-457_1\.1\.3:" --project=chromium
 *
 * I. Pre-condition:
 * 1. After login with admin_crm successful, click at "CRM" button
 * 2. On "CRM" page:
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 *
 * II. Verification points:
 * 1. The "Re-assignment to" combobox displays
 */

test.describe('CRM-457_1.1.3 - Verify Re-assignment to combobox displays on Re-assignment page', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('  - Loading spinner wait skipped');
      });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('  - Network idle wait skipped');
      });
      await page.waitForTimeout(3000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('CRM-457_1.1.3: Verify "Re-assignment to" combobox displays on Re-assignment page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);

    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM page');
    });

    await test.step('Pre-condition Step 2: Verify we are on the CRM page', async () => {
      console.log('Step 2: Confirming CRM page is loaded');
      await homePage.waitForPageReady();
      console.log('✓ CRM page is ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 2 - CRM page');
    });

    await test.step('Pre-condition Step 3: Press "Configuration" menu', async () => {
      console.log('Step 3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('✓ Configuration menu opened');
    });

    await test.step('Pre-condition Step 4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step 4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('✓ Navigated to Re-assignation page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 4 - Re-assignation page');
    });

    // II. VERIFICATION POINTS

    await test.step('II. Verification - Step 1: Verify "Re-assignment to" combobox displays', async () => {
      console.log('\n=== II. VERIFICATION POINTS ===');
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      const reAssignmentToLabel = reAssignationPage.getReAssignmentToLabel();
      await expect(reAssignmentToLabel).toBeVisible({ timeout: 10000 });
      console.log('  ✓ II.1: "Re-assignment to" combobox is visible on Re-assignment page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.1 - Re-assignment to combobox visible');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_1.1.3 verification completed successfully');
      console.log('   II.1: "Re-assignment to" combobox is displayed on Re-assignment page');
      console.log('==================================================\n');
    });
  });
});
