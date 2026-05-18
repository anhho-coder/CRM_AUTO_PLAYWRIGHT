import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Leads
 * Test Case ID: CRM-457_2.2.2.5
 *
 * Summary: Verify value at "Total" text = 1/1 after confirming the re-assignation with 2 countries
 *
 * Command to run:
 * npx playwright test --grep "CRM-457_2\.2\.2\.5:" --project=chromium
 *
 * I. Condition for beforeEach:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Belgium
 * 5.  Filter: State = Flanders
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip
 * 8.  Click select-all checkbox
 * 9.  Press Action menu
 * 10. Select Delete option
 * 11. Confirm deletion dialog
 * 12. Close the browser
 *
 * I. Pre-condition#1 to create Lead#1:
 * 1. Click at "CRM" button and wait:
 *    1.1. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *    1.2. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox        = TEST Lead 1 CRM-457_2.2.2.5
 *    - Email textbox            = Test@company + current date + current time.com
 *    - Company Name textbox     = Company Name Opp 1
 *    - Street dropdown list     = 123street
 *    - Country dropdown list    = Belgium
 *    - State dropdown list      = Flanders
 *    - Sales Team dropdown list = BDEU
 *    - Salesperson dropdown list = Thomas Semerich
 *    - Created manually checkbox = FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1, called URL_Lead#1
 * 6. Press "Application" icon on left-top of screen and wait
 *
 * II. Steps to reproduce:
 * 1. On Homepage, click at "CRM" button
 * 2. On "CRM" page:
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"       = "Leads/Opportunities"
 *    5.2. Set : "Current Salesperson" = "Thomas Semerich"
 *    5.3. Set : "Re-assignment to"    = "Alan Osseiran"
 *    5.4. Set : "Country"             = "Belgium"
 *    5.5. Set : "Country"             = "Netherlands"  (second country)
 *    5.6. Set : "Country state"       = "Flanders"
 *    5.7. Set : "Stage"               = "New"
 * 6. Press "RE-ASSIGNMENT" button and wait
 * 7. Press "CONFIRM" button on "Confirmed Re-assignation" page and wait
 *
 * III. Verification points:
 * 1. The value at "Total" text = 1/1
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Lead has just created
 * 2. Close all browsers
 */

test.describe('CRM-457_2.2.2.5 - Verify value at "Total" text = 1/1 after confirming re-assignation with 2 countries', () => {

  let url_Lead1 = '';

  test.beforeEach(async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts['5-minutes']);

    const cleanupContext  = await browser.newContext();
    const cleanupPage     = await cleanupContext.newPage();
    const loginPage       = new LoginPage(cleanupPage);
    const homePage        = new HomePage(cleanupPage);
    const opportunityPage = new OpportunityPage(cleanupPage);

    await test.step('beforeEach Step 1: Login as admin_crm and navigate to CRM', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
    });

    await test.step('beforeEach Step 2: Navigate to Archive > All', async () => {
      await opportunityPage.navigateToAllLeads();
    });

    await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Salesperson');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Thomas Semerich');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
    });

    await test.step('beforeEach Step 4: Filter by Country = Belgium', async () => {
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Country');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Belgium');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
    });

    await test.step('beforeEach Step 5: Filter by State = Flanders', async () => {
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('State');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Flanders');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
    });

    await test.step('beforeEach Step 6: Filter by Active = is true', async () => {
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Active');
      await opportunityPage.selectCustomFilterOperator('is true');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
    });

    await test.step('beforeEach Step 7: Check records and delete if any exist', async () => {
      const isEmpty = await opportunityPage.isListEmpty();
      if (!isEmpty) {
        await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
          await opportunityPage.clickSelectAllCheckbox();
        });
        await test.step('beforeEach Step 9: Press Action menu', async () => {
          await opportunityPage.clickListActionMenu();
        });
        await test.step('beforeEach Step 10: Select Delete option', async () => {
          await opportunityPage.clickListActionDelete();
        });
        await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
          await opportunityPage.confirmDeleteDialog();
        });
      }
    });

    const cleanupVideo = cleanupPage.video();
    await test.step('beforeEach Step 12: Close all browsers', async () => {
      await cleanupContext.close();
    });

    if (cleanupVideo) {
      await testInfo.attach('I. Condition for beforeEach', {
        path: await cleanupVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(2000);
    }

    const mainVideo = page.video();

    if (url_Lead1) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        await test.step('IV.1: Delete Lead#1', async () => {
          await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
        });
        await test.step('IV.2: Close all browsers', async () => {
          const allPages = page.context().pages();
          for (const p of allPages) { if (!p.isClosed()) await p.close(); }
          console.log('✓ IV.2: All browsers closed');
        });
        url_Lead1 = '';
      });
    }

    if (mainVideo) {
      await testInfo.attach('II. Steps to reproduce + III. Verification points', {
        path: await mainVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test('CRM-457_2.2.2.5: Verify value at "Total" text = 1/1 after confirming re-assignation with 2 countries', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);
    const leadPage          = new LeadPage(page);

    const tcId     = 'CRM-457_2.2.2.5';
    const leadName = `TEST Lead 1 ${tcId}`;
    const email    = CommonUtils.generateEmail('Test', 'company');

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Lead name : ${leadName}`);
    console.log(`  Email     : ${email}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Lead#1
    // ==============================================================

    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== I. PRE-CONDITION ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Logged in and navigated to CRM');
    });

    await test.step('Pre-condition Step 1.1: Navigate to CRM > Leads list', async () => {
      await homePage.navigateToLeads();
      console.log('✓ Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.1 - Leads list page');
    });

    await test.step('Pre-condition Step 1.2: Click CREATE button', async () => {
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.2 - Lead creation form');
    });

    await test.step('Pre-condition Step 2: Fill Lead#1 information', async () => {
      console.log('Step 2: Filling Lead#1 fields');
      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillEmail(email);
      await leadPage.fillCompanyName('Company Name Opp 1');
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('Belgium');
      await leadPage.selectState('Flanders');
      await leadPage.selectSalesTeam('BDEU');
      await leadPage.selectSalesperson('Thomas Semerich');
      await leadPage.uncheckCreatedManually();
      console.log('✓ All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Lead#1 fields filled');
    });

    await test.step('Pre-condition Step 3: Click CRM Developer tab and set Lead form', async () => {
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('License');
      console.log('✓ Lead form set to "License"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - CRM Developer tab');
    });

    await test.step('Pre-condition Step 4: Press SAVE button', async () => {
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Lead#1 saved');
    });

    await test.step('Pre-condition Step 5: Copy URL of Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`✓ URL_Lead#1 = ${url_Lead1}`);
    });

    await test.step('Pre-condition Step 6: Press Application icon to return to Home page', async () => {
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - Home page');
    });

    // ==============================================================
    // II. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step II.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== II. STEPS TO REPRODUCE ===`);
      await homePage.navigateToCRM();
      console.log('✓ CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.1 - CRM page');
    });

    await test.step('Step II.2: Confirm CRM page is loaded', async () => {
      await homePage.waitForPageReady();
    });

    await test.step('Step II.3: Press "Configuration" menu', async () => {
      await opportunityPage.clickConfigurationMenu();
    });

    await test.step('Step II.4: Press "Re-assignation" in "Resellers" section', async () => {
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

      console.log('  5.5: Country = "Netherlands"  (second country)');
      await reAssignationPage.selectCountry('Netherlands');

      console.log('  5.6: Country state = "Flanders"');
      await reAssignationPage.selectCountryState('Flanders');

      console.log('  5.7: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('✓ All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - Filter fields set');
    });

    await test.step('Step II.6: Press "RE-ASSIGNMENT" button', async () => {
      await reAssignationPage.clickReAssignmentButton();
      console.log('✓ RE-ASSIGNMENT button clicked - Confirmed Re-assignation page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.6 - Confirmed Re-assignation page');
    });

    await test.step('Step II.7: Press "CONFIRM" button on Confirmed Re-assignation page', async () => {
      await reAssignationPage.clickConfirmButton();
      console.log('✓ CONFIRM button clicked - Re-assignation confirmed');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.7 - After CONFIRM button clicked');
    });

    // ==============================================================
    // III. VERIFICATION POINTS
    // ==============================================================

    await test.step('III. Verification - Step 1: Verify "Total" text = 1/1', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      const totalValue = await reAssignationPage.getTotalValueText();
      console.log(`  Total received : "${totalValue}"`);
      const normalizedTotal = totalValue.replace(/\s*\/\s*/g, '/');
      console.log(`  Normalized     : "${normalizedTotal}"`);
      console.log(`  Expected       : "1/1"`);

      expect(normalizedTotal).toBe('1/1');

      console.log('✓ III.1: "Total" = "1/1" - verified correctly after confirming re-assignation with 2 countries');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Total 1-1 verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_2.2.2.5 verification completed successfully');
      console.log(`   Lead#1 URL : ${url_Lead1}`);
      console.log('   III.1: "Total" = "1/1" - verified after confirming re-assignation with 2 countries (Belgium + Netherlands)');
      console.log('   IV   : Lead#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
