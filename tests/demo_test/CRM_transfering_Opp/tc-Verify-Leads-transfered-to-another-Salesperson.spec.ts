import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Test Case ID: CRM-Verify-re-assigment
 *
 * Summary: Verify the qualified Leads with Stage = New have been transferred to another Salesperson correctly
 *
 * Command to run:
 * npx playwright test --grep "CRM-Verify-re-assigment" --project=chromium
 *
 * II. Steps to reproduce:
 * 1. After login with admin_crm successful, click at "CRM" button
 * 2. On "CRM" page:
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"       = "Leads/Opportunities"
 *    5.2. Set : "Current Salesperson" = "Thomas Semerich"
 *    5.3. Set : "Re-assignment to"    = "Alan Osseiran"
 *    5.4. Set : "Country"             = "Belgium"
 *    5.5. Set : "Country state"       = "Flanders"
 *    5.6. Set : "Stage"               = "New"
 *
 * III. Verification points:
 * 1. The value at "Total" text = 0/1
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Lead has just created by doing the following steps:
 *    1.1. Launch the URL_Lead#1
 *        (Handle unexpected dialog: press "OK" on
 *         "The record has been modified, your changes will be discarded. Do you want to proceed?")
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 */

// Pre-existing lead URL (fixed, no creation needed)
const URL_LEAD1 = 'http://10.220.222.100/web?#id=989315&action=149&model=crm.lead&view_type=form&menu_id=111';

test.describe('CRM-Verify-re-assigment - Verify qualified Leads with Stage=New transferred to another Salesperson', () => {

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

    // ==============================================================
    // IV. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    console.log('\n=== IV. TEAR DOWN ===');

    let newTab: import('@playwright/test').Page | null = null;

    await test.step('IV. Tear down - Step 1.1: Open new tab and launch URL_Lead#1', async () => {
      console.log(`Step IV.1.1: Opening new tab and launching URL_Lead#1: ${URL_LEAD1}`);
      newTab = await page.context().newPage();
      const newTabLeadPage = new LeadPage(newTab);
      await newTabLeadPage.goto(URL_LEAD1);
      await newTabLeadPage.waitForPageReady();
      await newTab.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ IV.1.1: Lead#1 page opened in new tab');
      await CommonUtils.captureAndAttachScreenshot(newTab, testInfo, 'IV.1.1 - Lead#1 page opened');
    });

    await test.step('IV. Tear down - Step 1.2: Select "Action" dropdown list', async () => {
      console.log('Step IV.1.2: Clicking Action dropdown');
      const newTabLeadPage = new LeadPage(newTab!);
      await newTabLeadPage.clickActionMenu();
      console.log('✓ IV.1.2: Action dropdown opened');
      await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.2 - Action dropdown opened');
    });

    await test.step('IV. Tear down - Step 1.3: Select "Delete" option', async () => {
      console.log('Step IV.1.3: Clicking Delete option');
      const newTabLeadPage = new LeadPage(newTab!);
      await newTabLeadPage.clickActionDeleteOption();
      console.log('✓ IV.1.3: Delete option selected');
      await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.3 - Delete confirmation dialog');
    });

    await test.step('IV. Tear down - Step 1.4: Press "OK" on confirmation dialog and wait', async () => {
      console.log('Step IV.1.4: Clicking OK on "Are you sure you want to delete this record?" dialog');
      const newTabLeadPage = new LeadPage(newTab!);
      await newTabLeadPage.confirmDeleteDialog();
      console.log('✓ IV.1.4: Lead#1 deleted successfully');
      await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.4 - Lead#1 deleted');
      await newTab!.close();
      console.log('✓ IV.1.4: New tab closed');
    });

    await test.step('IV. Tear down - Step 2: Close all browsers', async () => {
      console.log('Step IV.2: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) {
          await p.close();
        }
      }
      console.log('✓ IV.2: All browsers closed');
    });
  });

  test('CRM-Verify-re-assigment: Verify qualified Leads with Stage=New transferred to another Salesperson correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);

    console.log(`\n=== TEST DATA ===`);
    console.log(`  URL_Lead#1 : ${URL_LEAD1}`);

    // ==============================================================
    // II. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step II.1: Login as admin_crm and click "CRM" button', async () => {
      console.log(`\n=== II. STEPS TO REPRODUCE ===`);
      console.log(`Step II.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.1 - CRM page');
    });

    await test.step('Step II.2: Confirm CRM page is loaded', async () => {
      console.log('Step II.2: Confirming CRM page is ready');
      await homePage.waitForPageReady();
      console.log('✓ CRM page confirmed ready');
    });

    await test.step('Step II.3: Press "Configuration" menu', async () => {
      console.log('Step II.3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('✓ Configuration menu opened');
    });

    await test.step('Step II.4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step II.4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('✓ Re-assignation page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.4 - Re-assignation page');
    });

    await test.step('Step II.5: Set filter field values on Re-assignation page', async () => {
      console.log('Step II.5: Setting filter field values');
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      console.log('  5.1: Customer type = "Leads/Opportunities"');
      await reAssignationPage.selectCustomerType('Leads/Opportunities');

      console.log('  5.2: Current Salesperson = "Thomas Semerich"');
      await reAssignationPage.selectCurrentSalesperson('Thomas Semerich');

      console.log('  5.3: Re-assignment to = "Alan Osseiran"');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');

      console.log('  5.4: Country = "Belgium"');
      await reAssignationPage.selectCountry('Belgium');

      console.log('  5.5: Country state = "Flanders"');
      await reAssignationPage.selectCountryState('Flanders');

      console.log('  5.6: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('  5.7: Stage = "In Process"');
      await reAssignationPage.selectStage('In Process');
      console.log('✓ All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - All filter fields set');
    });

    // ==============================================================
    // III. VERIFICATION POINTS
    // ==============================================================

    await test.step('III. Verification - Step 1: Verify Total text = "0/1"', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      const totalText = await reAssignationPage.getTotalValueText();
      console.log(`  Total value received: "${totalText}"`);

      // Normalize spaces around "/" to allow "0/1", "0 /1", "0/ 1", "0 / 1"
      const normalizedTotal = totalText.replace(/\s*\/\s*/g, '/');
      expect(normalizedTotal).toBe('0/1');

      console.log('✓ III.1: Total text = "0/1" - 1 qualified Lead with Stage=New matched the filter criteria');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Total 0-1 verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-Verify-re-assigment verification completed successfully');
      console.log(`   URL_Lead#1 : ${URL_LEAD1}`);
      console.log('   III.1: Total = "0/1" - qualified Lead with Stage=New correctly counted for re-assignment');
      console.log('   IV   : Lead#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});

