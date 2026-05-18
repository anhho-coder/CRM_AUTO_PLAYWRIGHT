import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Leads
 * Test Case ID: CRM-457_2.2.1.1
 *
 * Summary: Verify value of "Selected Salesperson" = value of "Current Salesperson" on "Confirmed Re-assignation" page correctly
 *
 * Command to run:
 * npx playwright test --grep CRM-457_2\.2\.1\.1: --project=chromium
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
 *    - Lead name textbox        = TEST Lead 1 CRM-457_2.2.1.1
 *    - Email textbox            = Test@company + current date + current time.com (Email_Opp#1)
 *                                 (Remember the created email, called Email_Opp#1)
 *                                 (in the Address section)
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
 *         (Remember the value of selected "Current Salesperson", called selected_salesperson#1)
 *    5.3. Set : "Re-assignment to"    = "Alan Osseiran"
 *    5.4. Set : "Country"             = "Belgium"
 *    5.5. Set : "Country state"       = "Flanders"
 *    5.6. Set : "Stage"               = "New"
 * 6. Press "RE-ASSIGNMENT" button and wait
 *
 * III. Verification points:
 * 1. The value at "Selected Salesperson" field = selected_salesperson#1
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Lead has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Lead#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('CRM-457_2.2.1.1 - Verify Selected Salesperson = Current Salesperson on Confirmed Re-assignation page', () => {

  let url_Lead1 = '';

  test.beforeEach(async ({ browser, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);

    // Create a separate browser context for cleanup so step 12 can truly close all browsers
    const cleanupContext = await browser.newContext();
    const cleanupPage    = await cleanupContext.newPage();

    const loginPage       = new LoginPage(cleanupPage);
    const homePage        = new HomePage(cleanupPage);
    const opportunityPage = new OpportunityPage(cleanupPage);

    // beforeEach Step 1: Login as admin_crm and navigate to CRM
    await test.step('beforeEach Step 1: Login as admin_crm and navigate to CRM', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach Step 1: Logging in as admin_crm');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ beforeEach Step 1: Logged in and navigated to CRM');
    });

    // beforeEach Step 2: Navigate to Archive > All
    await test.step('beforeEach Step 2: Navigate to Archive > All', async () => {
      console.log('beforeEach Step 2: Navigating to Archive > All');
      await opportunityPage.navigateToAllLeads();
      console.log('✓ beforeEach Step 2: Archive > All leads page loaded');
    });

    // beforeEach Step 3: Filter by Salesperson = Thomas Semerich
    await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach Step 3: Adding filter Salesperson = Thomas Semerich');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Salesperson');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Thomas Semerich');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('✓ beforeEach Step 3: Salesperson filter applied');
    });

    // beforeEach Step 4: Filter by Country = Belgium
    await test.step('beforeEach Step 4: Filter by Country = Belgium', async () => {
      console.log('beforeEach Step 4: Adding filter Country = Belgium');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Country');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Belgium');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('✓ beforeEach Step 4: Country filter applied');
    });

    // beforeEach Step 5: Filter by State = Flanders
    await test.step('beforeEach Step 5: Filter by State = Flanders', async () => {
      console.log('beforeEach Step 5: Adding filter State = Flanders');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('State');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Flanders');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('✓ beforeEach Step 5: State filter applied');
    });

    // beforeEach Step 6: Filter by Active = is true
    await test.step('beforeEach Step 6: Filter by Active = is true', async () => {
      console.log('beforeEach Step 6: Adding filter Active = is true');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Active');
      await opportunityPage.selectCustomFilterOperator('is true');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('✓ beforeEach Step 6: Active filter applied');
    });

    // beforeEach Step 7: Check if any qualified items exist; skip cleanup if none
    await test.step('beforeEach Step 7: Check if list has records', async () => {
      console.log('beforeEach Step 7: Checking if any qualified leads exist...');
      const isEmpty = await opportunityPage.isListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach Step 7: No qualified leads found - skipping delete steps');
        return;
      }
      console.log('  ⚠ Qualified leads found - proceeding to delete');

      // beforeEach Step 8: Click the header "select all" checkbox
      await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
        console.log('beforeEach Step 8: Clicking select-all checkbox');
        await opportunityPage.clickSelectAllCheckbox();
        console.log('✓ beforeEach Step 8: All records selected');
      });

      // beforeEach Step 9: Press Action menu
      await test.step('beforeEach Step 9: Press Action menu', async () => {
        console.log('beforeEach Step 9: Opening Action menu');
        await opportunityPage.clickListActionMenu();
        console.log('✓ beforeEach Step 9: Action menu opened');
      });

      // beforeEach Step 10: Select Delete option
      await test.step('beforeEach Step 10: Select Delete option', async () => {
        console.log('beforeEach Step 10: Clicking Delete option');
        await opportunityPage.clickListActionDelete();
        console.log('✓ beforeEach Step 10: Delete option selected');
      });

      // beforeEach Step 11: Confirm deletion
      await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
        console.log('beforeEach Step 11: Clicking OK on confirmation dialog');
        await opportunityPage.confirmDeleteDialog();
        console.log('✓ beforeEach Step 11: Records deleted successfully');
      });
    });

    // beforeEach Step 12: Close all browsers (closes the entire cleanup context)
    await test.step('beforeEach Step 12: Close all browsers', async () => {
      console.log('beforeEach Step 12: Closing cleanup browser context');
      await cleanupContext.close();
      console.log('✓ beforeEach Step 12: All cleanup browsers closed - test will start a fresh session');
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(2000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }

    // ==============================================================
    // IV. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    if (url_Lead1) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        await test.step('IV.1: Delete Lead#1', async () => {
          await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
        });
        await test.step('IV.2: Close all browsers', async () => {
          const allPages = page.context().pages();
          for (const p of allPages) { if (!p.isClosed()) await p.close(); }
          console.log('âœ“ IV.2: All browsers closed');
        });
        url_Lead1 = '';
      });
    }
  });

  test('CRM-457_2.2.1.1: Verify value of "Selected Salesperson" = value of "Current Salesperson" on "Confirmed Re-assignation" page correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage        = new LoginPage(page);
    const homePage         = new HomePage(page);
    const opportunityPage  = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);
    const leadPage         = new LeadPage(page);

    // Generate unique test data
    const tcId     = 'CRM-457_2.2.1.1';
    const leadName = `TEST Lead 1 ${tcId}`;
    const email    = CommonUtils.generateEmail('Test', 'company');
    let selectedSalesperson1 = '';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Lead name : ${leadName}`);
    console.log(`  Email     : ${email}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Lead#1
    // ==============================================================

    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== I. PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM module');
    });

    await test.step('Pre-condition Step 1.1: Navigate to CRM > Leads list', async () => {
      console.log('Step 1.1: Navigating to Leads menu → Leads sub-item');
      await homePage.navigateToLeads();
      console.log('✓ Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.1 - Leads list page');
    });

    await test.step('Pre-condition Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.2 - Lead creation form');
    });

    await test.step('Pre-condition Step 2: Fill Lead#1 information', async () => {
      console.log('Step 2: Filling Lead#1 fields');

      console.log(`  2.1: Lead name = "${leadName}"`);
      await leadPage.fillLeadOpportunity(leadName);

      console.log(`  2.2: Email = "${email}"`);
      await leadPage.fillEmail(email);

      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await leadPage.fillCompanyName('Company Name Opp 1');

      console.log('  2.4: Street = "123street"');
      await leadPage.fillStreet('123street');

      console.log('  2.5: Country = "Belgium"');
      await leadPage.selectCountry('Belgium');

      console.log('  2.6: State = "Flanders"');
      await leadPage.selectState('Flanders');

      console.log('  2.7: Sales Team = "BDEU"');
      await leadPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await leadPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await leadPage.uncheckCreatedManually();

      console.log('✓ All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Lead#1 fields filled');
    });

    await test.step('Pre-condition Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab activated');

      console.log('  3.1: Lead form = "License"');
      await leadPage.fillLeadForm('License');
      console.log('✓ Lead form set to "License"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition Step 4: Press SAVE button', async () => {
      console.log('Step 4: Saving Lead#1');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Lead#1 saved');
    });

    await test.step('Pre-condition Step 5: Copy URL of Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`Step 5: URL_Lead#1 = ${url_Lead1}`);
      console.log('✓ URL_Lead#1 captured');
    });

    await test.step('Pre-condition Step 6: Press Application icon to return to home page', async () => {
      console.log('Step 6: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - Home page after Application icon');
    });

    // ==============================================================
    // II. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step II.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== II. STEPS TO REPRODUCE ===`);
      console.log('Step II.1: Navigating to CRM');
      await homePage.navigateToCRM();
      //await homePage.waitForPageReady();
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

      console.log('  5.2: Current Salesperson = "Thomas Semerich" (remember as selected_salesperson#1)');
      await reAssignationPage.selectCurrentSalesperson('Thomas Semerich');
      selectedSalesperson1 = 'Thomas Semerich';
      console.log(`  ✓ selected_salesperson#1 = "${selectedSalesperson1}"`);

      console.log('  5.3: Re-assignment to = "Alan Osseiran"');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');

      console.log('  5.4: Country = "Belgium"');
      await reAssignationPage.selectCountry('Belgium');

      console.log('  5.5: Country state = "Flanders"');
      await reAssignationPage.selectCountryState('Flanders');

      console.log('  5.6: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('✓ All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - Filter fields set - Ready for RE-ASSIGNMENT');
    });

    await test.step('Step II.6: Press "RE-ASSIGNMENT" button', async () => {
      console.log('Step II.6: Clicking RE-ASSIGNMENT button');
      await reAssignationPage.clickReAssignmentButton();
      console.log('✓ RE-ASSIGNMENT button clicked - Confirmed Re-assignation page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.6 - Confirmed Re-assignation page');
    });

    // ==============================================================
    // III. VERIFICATION POINTS
    // ==============================================================

    await test.step('III. Verification - Step 1: Verify "Selected Salesperson" = selected_salesperson#1', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      const selectedSalespersonText = await reAssignationPage.getSelectedSalespersonText();
      console.log(`  Selected Salesperson received : "${selectedSalespersonText}"`);
      console.log(`  Expected (selected_salesperson#1) : "${selectedSalesperson1}"`);

      expect(selectedSalespersonText).toBe(selectedSalesperson1);

      console.log(`✓ III.1: "Selected Salesperson" = "${selectedSalesperson1}" - verified correctly on Confirmed Re-assignation page`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Selected Salesperson verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_2.2.1.1 verification completed successfully');
      console.log(`   Lead#1 URL             : ${url_Lead1}`);
      console.log(`   selected_salesperson#1 : ${selectedSalesperson1}`);
      console.log(`   III.1: "Selected Salesperson" = "${selectedSalesperson1}" - verified on Confirmed Re-assignation page`);
      console.log('   IV   : Lead#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
