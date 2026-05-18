import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Opps
 * Test Case ID: CRM-457_3.1.1.5
 *
 * Summary: Verify the qualified Opps with Stage = Active interest have been transfered to another Salesperson correctly
 *
 * Command to run:
 * npx playwright test --grep CRM-457_3\.1\.1\.5: --project=chromium
 *
 * I. Condition for beforeEach:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Sergey Karachin
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
 * II. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 1 CRM-457_3.1.1.5
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Belgium
 *    - State                   = Flanders
 *    - Sales Team              = CMR
 *    - Salesperson             = Sergey Karachin
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab → Lead form = Download Free Trial
 * 4. Click at "Qualification info" tab:
 *    4.1 Environment area:
 *        - Number of socket    = 1
 *        - VMs                 = 1
 *        - Physical hosts      = 1
 *        - AWS EC2             = 1
 *        - Workstations        = 1
 *        - Office365 Users     = 1
 *        - Oracle Databases    = 1
 *        - TB                  = 1
 *    4.2 Info area:
 *        - Licensing Model     = Perpetual
 *        - Use case(s)         = 1
 *        - Requirement(s)      = 1
 *        - Current solution    = Veeam
 *        - Competitor          = Veeam
 * 5. At "Expected Closing" field, enter the current date
 * 6. On "Stage", select the Stage = Active interest
 * 7. Press "SAVE" button and wait
 * 8. Copy URL of Opp#1 (URL_Opp#1)
 * 9. Press "Application" icon on left-top of screen and wait
 *
 * III. Steps to reproduce:
 * 1. On Homepage, click at "CRM" button
 * 2. On "CRM" page (ready)
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"       = "Leads/Opportunities"
 *    5.2. Set : "Current Salesperson" = "Sergey Karachin"
 *    5.3. Set : "Re-assignment to"    = "Alan Osseiran"
 *    5.4. Set : "Country"             = "Belgium"
 *    5.5. Set : "Country state"       = "Flanders"
 *    5.6. Set : "Stage"               = "Active interest"
 *
 * IV. Verification points:
 * 1. The value at "Total" text = 0/1
 *
 * V. Tear down (Clean up test data):
 * 1. Delete Opp has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Opp#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('CRM-457_3.1.1.5 - Verify qualified Opps with Stage=Active interest transferred to another Salesperson', () => {

  let url_Opp1 = '';

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
      console.log('✓ beforeEach Step 2: Archive > All Opps page loaded');
    });

    // beforeEach Step 3: Filter by Salesperson = Sergey Karachin
    await test.step('beforeEach Step 3: Filter by Salesperson = Sergey Karachin', async () => {
      console.log('beforeEach Step 3: Adding filter Salesperson = Sergey Karachin');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Salesperson');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Sergey Karachin');
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
      console.log('beforeEach Step 7: Checking if any qualified Opps exist...');
      const isEmpty = await opportunityPage.isListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach Step 7: No qualified Opps found - skipping delete steps');
        return;
      }
      console.log('  ⚠ Qualified Opps found - proceeding to delete');

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
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }

    // ==============================================================
    // IV. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    if (url_Opp1) {
      console.log('\n=== IV. TEAR DOWN ===');

      let newTab: import('@playwright/test').Page | null = null;

      await test.step('IV. Tear down - Step 1.1: Open new tab and launch URL_Opp#1', async () => {
        console.log(`Step IV.1.1: Opening new tab and launching URL_Opp#1: ${url_Opp1}`);
        newTab = await page.context().newPage();
        const newTabOppPage = new LeadPage(newTab);
        await newTabOppPage.goto(url_Opp1, { waitUntil: 'networkidle' });
        await newTabOppPage.waitForPageReady();
        await newTab.waitForTimeout(CommonUtils.waitTimes.standard);
        console.log('✓ IV.1.1: Opp#1 page opened in new tab');
        await CommonUtils.captureAndAttachScreenshot(newTab, testInfo, 'IV.1.1 - Opp#1 page opened');
      });

      await test.step('IV. Tear down - Step 1.2: Select "Action" dropdown list', async () => {
        console.log('Step IV.1.2: Clicking Action dropdown');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.clickActionMenu();
        console.log('✓ IV.1.2: Action dropdown opened');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.2 - Action dropdown opened');
      });

      await test.step('IV. Tear down - Step 1.3: Select "Delete" option', async () => {
        console.log('Step IV.1.3: Clicking Delete option');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.clickActionDeleteOption();
        console.log('✓ IV.1.3: Delete option selected');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.3 - Delete confirmation dialog');
      });

      await test.step('IV. Tear down - Step 1.4: Press "OK" on confirmation dialog and wait', async () => {
        console.log('Step IV.1.4: Clicking OK on "Are you sure you want to delete this record?" dialog');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.confirmDeleteDialog();
        console.log('✓ IV.1.4: Opp#1 deleted successfully');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.4 - Opp#1 deleted');
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

      url_Opp1 = '';
    }
  });

  test('CRM-457_3.1.1.5: Verify the qualified Opps with Stage=Active interest have been transfered to another Salesperson correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage        = new LoginPage(page);
    const homePage         = new HomePage(page);
    const opportunityPage  = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);

    // Generate unique test data
    const tcId    = 'CRM-457_3.1.1.5';
    const oppName = `TEST Opp 1 ${tcId}`;
    const email   = CommonUtils.generateEmail('Test', 'company');

    // Format today as MM/DD/YYYY (Odoo date input format)
    const today    = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Opp name  : ${oppName}`);
    console.log(`  Email     : ${email}`);
    console.log(`  Closing   : ${todayStr}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Opp#1
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

    await test.step('Pre-condition Step 1.1: Switch to list view on CRM Opps page', async () => {
      console.log('Step 1.1: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('✓ List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.1 - Opps list page');
    });

    await test.step('Pre-condition Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.2 - Opp creation form');
    });

    await test.step('Pre-condition Step 2: Fill Opp#1 information', async () => {
      console.log('Step 2: Filling Opp#1 fields');

      console.log(`  2.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);

      console.log(`  2.2: Email = "${email}"`);
      await opportunityPage.fillEmail(email);

      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await opportunityPage.fillCompanyName('Company Name Opp 1');

      console.log('  2.4: Street = "123street"');
      await opportunityPage.fillStreet('123street');

      console.log('  2.5: Country = "Belgium"');
      await opportunityPage.selectCountry('Belgium');

      console.log('  2.6: State = "Flanders"');
      await opportunityPage.selectState('Flanders');

      console.log('  2.7: Sales Team = "CMR"');
      await opportunityPage.selectSalesTeam('CMR');

      console.log('  2.8: Salesperson = "Sergey Karachin"');
      await opportunityPage.selectSalesperson('Sergey Karachin');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await opportunityPage.uncheckCreatedManually();

      console.log('✓ All Opp#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Opp#1 fields filled');
    });

    await test.step('Pre-condition Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition Step 4: Click Qualification info tab and fill fields', async () => {
      console.log('\n=== PRE-CONDITION STEP 4: QUALIFICATION INFO TAB ===');
      await opportunityPage.clickQualificationInfoTab();
      console.log('* Qualification info tab activated');

      await opportunityPage.fillQualEnvSocket('1');
      console.log('  * Number of socket = 1');
      await opportunityPage.fillQualEnvVms('1');
      console.log('  * VMs = 1');
      await opportunityPage.fillQualEnvPhysicalHosts('1');
      console.log('  * Physical hosts = 1');
      await opportunityPage.fillQualEnvAwsEc2('1');
      console.log('  * AWS EC2 = 1');
      await opportunityPage.fillQualEnvWorkstations('1');
      console.log('  * Workstations = 1');
      await opportunityPage.fillQualEnvOffice365('1');
      console.log('  * Office365 Users = 1');
      await opportunityPage.fillQualEnvOracle('1');
      console.log('  * Oracle Databases = 1');
      await opportunityPage.fillQualEnvTb('1');
      console.log('  * TB = 1');

      await opportunityPage.selectQualInfoLicensingModel('Perpetual');
      console.log('  * Licensing Model = Perpetual');
      await opportunityPage.fillQualInfoUseCase('1');
      console.log('  * Use case(s) = 1');
      await opportunityPage.fillQualInfoRequirement('1');
      console.log('  * Requirement(s) = 1');
      await opportunityPage.fillQualInfoCurrentSolution('Veeam');
      console.log('  * Current solution = Veeam');
      await opportunityPage.fillQualInfoCompetitor('Veeam');
      console.log('  * Competitor = Veeam');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Qualification info filled');
    });

    await test.step('Pre-condition Step 5: Fill Expected Closing with current date', async () => {
      console.log(`\n=== PRE-CONDITION STEP 5: EXPECTED CLOSING = ${todayStr} ===`);
      await opportunityPage.fillExpectedClosing(todayStr);
      console.log(`* Expected Closing = ${todayStr}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - Expected Closing filled');
    });

    await test.step('Pre-condition Step 6: Select Stage = ACTIVE INTEREST', async () => {
      console.log('Step 6: Selecting Stage = ACTIVE INTEREST');
      await opportunityPage.selectStage('Active interest');
      console.log('\u2713 Stage set to ACTIVE INTEREST');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - Stage ACTIVE INTEREST selected');
    });

    await test.step('Pre-condition Step 7: Press SAVE button and wait', async () => {
      console.log('Step 7: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 7 - Opp#1 saved');
    });

    await test.step('Pre-condition Step 8: Copy URL of Opp#1', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`Step 8: URL_Opp#1 = ${url_Opp1}`);
      console.log('\u2713 URL_Opp#1 captured');
    });

    await test.step('Pre-condition Step 9: Press Application icon to return to home page', async () => {
      console.log('Step 9: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 9 - Home page after Application icon');
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

      console.log('  5.2: Current Salesperson = "Sergey Karachin"');
      await reAssignationPage.selectCurrentSalesperson('Sergey Karachin');

      console.log('  5.3: Re-assignment to = "Alan Osseiran"');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');

      console.log('  5.4: Country = "Belgium"');
      await reAssignationPage.selectCountry('Belgium');

      console.log('  5.5: Country state = "Flanders"');
      await reAssignationPage.selectCountryState('Flanders');

      console.log('  5.6: Stage = "Active interest"');
      await reAssignationPage.selectStage('Active interest');

      console.log('✓ All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - All filter fields set');
    });

    // ==============================================================
    // III. VERIFICATION POINTS
    // ==============================================================

    await test.step('III. Verification - Step 1: Verify Total text = "0 / 1"', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      const totalText = await reAssignationPage.getTotalValueText();
      console.log(`  Total value received: "${totalText}"`);

      // Normalize spaces around "/" to allow "0/1", "0 /1", "0/ 1", "0 / 1"
      const normalizedTotal = totalText.replace(/\s*\/\s*/g, '/');
      expect(normalizedTotal).toBe('0/1');

      console.log('\u2713 III.1: Total text = "0/1" - qualified Opp with Stage=Active interest correctly counted for re-assignment');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Total 0-1 verified - Stage=Active interest');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-457_3.1.1.5 verification completed successfully');
      console.log(`   Opp#1 URL    : ${url_Opp1}`);
      console.log('   III.1: Total = "0/1" - qualified Opp with Stage=Active interest correctly counted for re-assignment');
      console.log('   IV   : Opp#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
