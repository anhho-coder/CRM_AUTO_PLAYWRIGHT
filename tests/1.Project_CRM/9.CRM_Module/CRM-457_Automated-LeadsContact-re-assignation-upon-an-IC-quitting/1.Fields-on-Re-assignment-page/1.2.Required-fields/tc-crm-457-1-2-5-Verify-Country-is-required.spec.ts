import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify fields on Re-assignment page
 * Test Case ID: CRM-457_1.2.5
 *
 * Summary: Verify "Country" combobox is required field on "Re-assignment" page
 *
 * Command to run:
 * npx playwright test --grep "CRM-457_1\.2\.5:" --project=chromium
 *
 * I. Pre-condition:
 * 1. After login with admin_crm successful, click at "CRM" button
 * 2. On "CRM" page:
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type" = "Leads/Opportunities"
 *    5.2. Set : "Current Salesperson" = "Thomas Semerich"
 *    5.3. Set : "Re-assignment to" = "Alan Osseiran"
 *    5.4. Set : "Country" = BLANK
 *    5.5. Set : "Country state" = "Flanders"
 *    5.6. Set : "Stage" = "New"
 * 6. Press "SAVE" button
 *
 * II. Verification points:
 * 1. The error message displays at right side of Page with the following content:
 *    The following fields are invalid:
 *    Country
 */

test.describe('CRM-457_1.2.5 - Verify Country is required on Re-assignment page', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(2000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('CRM-457_1.2.5: Verify "Country" combobox is required field on "Re-assignment" page', async ({ page }, testInfo) => {
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

    await test.step('Pre-condition Step 5: Set field values on Re-assignation page', async () => {
      console.log('Step 5: Setting field values');
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      console.log('  Step 5.1: Set "Customer type" = "Leads/Opportunities"');
      await reAssignationPage.selectCustomerType('Leads/Opportunities');

      console.log('  Step 5.2: Set "Current Salesperson" = "Thomas Semerich"');
      await reAssignationPage.selectCurrentSalesperson('Thomas Semerich');

      console.log('  Step 5.3: Set "Re-assignment to" = "Alan Osseiran"');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');

      console.log('  Step 5.4: Set "Country" = BLANK');
      await reAssignationPage.clearCountry();

      console.log('  Step 5.5: Set "Country state" = "Flanders"');
      await reAssignationPage.selectCountryState('Flanders');

      console.log('  Step 5.6: Set "Stage" = "New"');
      await reAssignationPage.selectStage('New');

      console.log('✓ All field values set');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 5 - Fields filled');
    });

    await test.step('Pre-condition Step 6: Press "SAVE" button', async () => {
      console.log('Step 6: Clicking SAVE button');
      await reAssignationPage.clickSaveButton();
      console.log('✓ SAVE button clicked');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 6 - After SAVE');
    });

    // II. VERIFICATION POINTS

    await test.step('II. Verification - Step 1: Verify error message displays for "Country"', async () => {
      console.log('\n=== II. VERIFICATION POINTS ===');
      const errorText = await reAssignationPage.getValidationErrorText();
      console.log(`  Error message received: "${errorText}"`);

      expect(errorText).toContain('following field');
      expect(errorText).toContain('Country');

      console.log('  ✓ II.1: Error message displays "The following fields are invalid: Country"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.1 - Validation error for Country');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_1.2.5 verification completed successfully');
      console.log('   II.1: Error message "Country" is required field is displayed');
      console.log('==================================================\n');
    });
  });
});
