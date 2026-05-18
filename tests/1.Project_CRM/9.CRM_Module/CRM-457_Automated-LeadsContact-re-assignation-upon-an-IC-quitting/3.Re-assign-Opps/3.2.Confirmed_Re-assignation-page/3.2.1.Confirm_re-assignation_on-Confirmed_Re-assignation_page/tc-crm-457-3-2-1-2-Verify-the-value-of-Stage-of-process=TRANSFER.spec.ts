import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Opps
 * Test Case ID: CRM-457_3.2.1.2
 *
 * Summary: Verify Stage of process = "TRANSFER" after confirming the re-assignation
 *
 * Command to run:
 * npx playwright test --grep CRM-457_3\.2\.1\.2: --project=chromium
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
 * I. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 1 CRM-457_3.2.1.2
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Belgium
 *    - State                   = Flanders
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab → Lead form = Download Free Trial
 * 4. On "Stage", select the Stage = NEW
 * 5. Press "SAVE" button and wait
 * 6. Copy URL of Opp#1 (URL_Opp#1)
 * 7. Press "Application" icon on left-top of screen and wait
 *
 * II. Steps to reproduce:
 * 1. On Homepage, click at "CRM" button
 * 2. On "CRM" page (ready)
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"       = "Leads/Opportunities"
 *    5.2. Set : "Current Salesperson" = "Thomas Semerich"
 *    5.3. Set : "Re-assignment to"    = "Alan Osseiran"
 *    5.4. Set : "Country"             = "Belgium"
 *    5.5. Set : "Country state"       = "Flanders"
 *    5.6. Set : "Stage"               = "New"
 * 6. Press "RE-ASSIGNMENT" button and wait
 * 7. Press "CONFIRM" button on "Confirmed Re-assignation" page and wait
 *
 * III. Verification points:
 * 1. Stage of process = "TRANSFER"
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Opp has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Opp#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('CRM-457_3.2.1.2 - Verify Stage of process = "TRANSFER" after confirming the re-assignation', () => {

  let url_Opp1 = '';

  test.beforeEach(async ({ browser, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);

    const cleanupContext = await browser.newContext();
    const cleanupPage    = await cleanupContext.newPage();

    const loginPage       = new LoginPage(cleanupPage);
    const homePage        = new HomePage(cleanupPage);
    const opportunityPage = new OpportunityPage(cleanupPage);

    await test.step('beforeEach Step 1: Login as admin_crm and navigate to CRM', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach Step 1: Logging in as admin_crm');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 beforeEach Step 1: Logged in and navigated to CRM');
    });

    await test.step('beforeEach Step 2: Navigate to Archive > All', async () => {
      console.log('beforeEach Step 2: Navigating to Archive > All');
      await opportunityPage.navigateToAllLeads();
      console.log('\u2713 beforeEach Step 2: Archive > All Opps page loaded');
    });

    await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach Step 3: Adding filter Salesperson = Thomas Semerich');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Salesperson');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Thomas Semerich');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('\u2713 beforeEach Step 3: Salesperson filter applied');
    });

    await test.step('beforeEach Step 4: Filter by Country = Belgium', async () => {
      console.log('beforeEach Step 4: Adding filter Country = Belgium');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Country');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Belgium');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('\u2713 beforeEach Step 4: Country filter applied');
    });

    await test.step('beforeEach Step 5: Filter by State = Flanders', async () => {
      console.log('beforeEach Step 5: Adding filter State = Flanders');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('State');
      await opportunityPage.selectCustomFilterOperator('is equal to');
      await opportunityPage.selectCustomFilterValue('Flanders');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('\u2713 beforeEach Step 5: State filter applied');
    });

    await test.step('beforeEach Step 6: Filter by Active = is true', async () => {
      console.log('beforeEach Step 6: Adding filter Active = is true');
      await opportunityPage.clickFilterButton();
      await opportunityPage.clickAddCustomFilter();
      await opportunityPage.selectCustomFilterField('Active');
      await opportunityPage.selectCustomFilterOperator('is true');
      await opportunityPage.clickApplyFilter();
      await opportunityPage.clickFilterButton();
      console.log('\u2713 beforeEach Step 6: Active filter applied');
    });

    await test.step('beforeEach Step 7: Check if list has records', async () => {
      console.log('beforeEach Step 7: Checking if any qualified Opps exist...');
      const isEmpty = await opportunityPage.isListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach Step 7: No qualified Opps found - skipping delete steps');
        return;
      }
      console.log('  \u26a0 Qualified Opps found - proceeding to delete');

      await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
        console.log('beforeEach Step 8: Clicking select-all checkbox');
        await opportunityPage.clickSelectAllCheckbox();
        console.log('\u2713 beforeEach Step 8: All records selected');
      });

      await test.step('beforeEach Step 9: Press Action menu', async () => {
        console.log('beforeEach Step 9: Opening Action menu');
        await opportunityPage.clickListActionMenu();
        console.log('\u2713 beforeEach Step 9: Action menu opened');
      });

      await test.step('beforeEach Step 10: Select Delete option', async () => {
        console.log('beforeEach Step 10: Clicking Delete option');
        await opportunityPage.clickListActionDelete();
        console.log('\u2713 beforeEach Step 10: Delete option selected');
      });

      await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
        console.log('beforeEach Step 11: Clicking OK on confirmation dialog');
        await opportunityPage.confirmDeleteDialog();
        console.log('\u2713 beforeEach Step 11: Records deleted successfully');
      });
    });

    await test.step('beforeEach Step 12: Close all browsers', async () => {
      console.log('beforeEach Step 12: Closing cleanup browser context');
      await cleanupContext.close();
      console.log('\u2713 beforeEach Step 12: All cleanup browsers closed - test will start a fresh session');
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized, Playwright will now capture screenshot');
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
        console.log('\u2713 IV.1.1: Opp#1 page opened in new tab');
        await CommonUtils.captureAndAttachScreenshot(newTab, testInfo, 'IV.1.1 - Opp#1 page opened');
      });

      await test.step('IV. Tear down - Step 1.2: Select "Action" dropdown list', async () => {
        console.log('Step IV.1.2: Clicking Action dropdown');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.clickActionMenu();
        console.log('\u2713 IV.1.2: Action dropdown opened');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.2 - Action dropdown opened');
      });

      await test.step('IV. Tear down - Step 1.3: Select "Delete" option', async () => {
        console.log('Step IV.1.3: Clicking Delete option');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.clickActionDeleteOption();
        console.log('\u2713 IV.1.3: Delete option selected');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.3 - Delete confirmation dialog');
      });

      await test.step('IV. Tear down - Step 1.4: Press "OK" on confirmation dialog and wait', async () => {
        console.log('Step IV.1.4: Clicking OK on "Are you sure you want to delete this record?" dialog');
        const newTabOppPage = new LeadPage(newTab!);
        await newTabOppPage.confirmDeleteDialog();
        console.log('\u2713 IV.1.4: Opp#1 deleted successfully');
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, 'IV.1.4 - Opp#1 deleted');
        await newTab!.close();
        console.log('\u2713 IV.1.4: New tab closed');
      });

      await test.step('IV. Tear down - Step 2: Close all browsers', async () => {
        console.log('Step IV.2: Closing all pages in context');
        const allPages = page.context().pages();
        for (const p of allPages) {
          if (!p.isClosed()) {
            await p.close();
          }
        }
        console.log('\u2713 IV.2: All browsers closed');
      });

      url_Opp1 = '';
    }
  });

  test('CRM-457_3.2.1.2: Verify Stage of process = "TRANSFER" after confirming the re-assignation', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);

    // Generate unique test data
    const tcId    = 'CRM-457_3.2.1.2';
    const oppName = `TEST Opp 1 ${tcId}`;
    const email   = CommonUtils.generateEmail('Test', 'company');

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Opp name  : ${oppName}`);
    console.log(`  Email     : ${email}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Opp#1
    // ==============================================================

    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== I. PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`\u2713 Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
    });

    await test.step('Pre-condition Step 1.1: Switch to list view on CRM Opps page', async () => {
      console.log('Step 1.1: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('\u2713 List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1.1 - Opps list page');
    });

    await test.step('Pre-condition Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp creation form opened');
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

      console.log('  2.7: Sales Team = "BDEU"');
      await opportunityPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await opportunityPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await opportunityPage.uncheckCreatedManually();

      console.log('\u2713 All Opp#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Opp#1 fields filled');
    });

    await test.step('Pre-condition Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition Step 4: Select Stage = NEW', async () => {
      console.log('Step 4: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage set to NEW');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Stage NEW selected');
    });

    await test.step('Pre-condition Step 5: Press SAVE button and wait', async () => {
      console.log('Step 5: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - Opp#1 saved');
    });

    await test.step('Pre-condition Step 6: Copy URL of Opp#1', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`Step 6: URL_Opp#1 = ${url_Opp1}`);
      console.log('\u2713 URL_Opp#1 captured');
    });

    await test.step('Pre-condition Step 7: Press Application icon to return to home page', async () => {
      console.log('Step 7: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 7 - Home page after Application icon');
    });

    // ==============================================================
    // II. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step II.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== II. STEPS TO REPRODUCE ===`);
      console.log('Step II.1: Navigating to CRM');
      await homePage.navigateToCRM();
      console.log('\u2713 CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.1 - CRM page');
    });

    await test.step('Step II.2: Confirm CRM page is loaded', async () => {
      console.log('Step II.2: Confirming CRM page is ready');
      await homePage.waitForPageReady();
      console.log('\u2713 CRM page confirmed ready');
    });

    await test.step('Step II.3: Press "Configuration" menu', async () => {
      console.log('Step II.3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('\u2713 Configuration menu opened');
    });

    await test.step('Step II.4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step II.4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('\u2713 Re-assignation page loaded');
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

      console.log('\u2713 All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - All filter fields set');
    });

    await test.step('Step II.6: Press "RE-ASSIGNMENT" button and wait', async () => {
      console.log('Step II.6: Clicking RE-ASSIGNMENT button');
      await reAssignationPage.clickReAssignmentButton();
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      console.log('\u2713 RE-ASSIGNMENT button clicked');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.6 - RE-ASSIGNMENT clicked');
    });

    await test.step('Step II.7: Press "CONFIRM" button on "Confirmed Re-assignation" page and wait', async () => {
      console.log('Step II.7: Clicking CONFIRM button');
      await reAssignationPage.clickConfirmButton();
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      console.log('\u2713 CONFIRM button clicked');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.7 - CONFIRM clicked');
    });

    // ==============================================================
    // III. VERIFICATION POINTS
    // ==============================================================

    await test.step('III. Verification - Step 1: Verify Stage of process = "TRANSFER"', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      const stageText = await reAssignationPage.getStageOfProcessText();
      console.log(`  Stage of process received: "${stageText}"`);
      expect(stageText).toBe('TRANSFER');
      console.log('\u2713 III.1: Stage of process = "TRANSFER" - re-assignation confirmed correctly');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Stage TRANSFER verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-457_3.2.1.2 verification completed successfully');
      console.log(`   Opp#1 URL    : ${url_Opp1}`);
      console.log('   III.1: Stage of process = "TRANSFER" - confirmed correctly after CONFIRM button');
      console.log('   IV   : Opp#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
