import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Opps
 * Test Case ID: CRM-457_3.1.3.1
 *
 * Summary: Verify the qualified Opps from 2 States from 1 country on the field have been transfered to another Salesperson correctly
 *
 * Command to run:
 * npx playwright test --grep CRM-457_3\.1\.3\.1: --project=chromium
 *
 * I. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 1 CRM-457_3.1.3.1
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Belgium
 *    - State                   = Flanders
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab - Lead form = Download Free Trial
 * 4. On "Stage", select the Stage = NEW
 * 5. Press "SAVE" button and wait
 * 6. Copy URL of Opp#1 (URL_Opp#1)
 * 7. Press "Application" icon on left-top of screen and wait
 *
 * II. Condition#2 to create Opp#2:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 2 CRM-457_3.1.3.1
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#2)
 *    - Company Name textbox    = Company Name Opp 2
 *    - Street                  = 123street
 *    - Country                 = Belgium
 *    - State                   = Wallonia
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab - Lead form = Download Free Trial
 * 4. On "Stage", select the Stage = NEW
 * 5. Press "SAVE" button and wait
 * 6. Copy URL of Opp#2 (URL_Opp#2)
 * 7. Press "Application" icon on left-top of screen and wait
 *
 * III. Steps to reproduce:
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
 *    5.6. Set : "Country state"       = "Wallonia"
 *    5.7. Set : "Stage"               = "New"
 *
 * IV. Verification points:
 * 1. The value at "Total" text = 0/2
 *
 * V. Tear down (Clean up test data):
 * 1. Delete Opp#1 by doing the following steps:
 *    1.1. Open new tab then launch the URL_Opp#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Delete Opp#2 by doing the following steps:
 *    2.1. Open new tab then launch the URL_Opp#2
 *    2.2. Select "Action" dropdown list on header of page
 *    2.3. Select "Delete" option
 *    2.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 3. Close all browsers
 */

test.describe('CRM-457_3.1.3.1 - Verify qualified Opps from 2 States transferred to another Salesperson', () => {

  let url_Opp1 = '';
  let url_Opp2 = '';


  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts['5-minutes']);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized, Playwright will now capture screenshot');
    }

    // ==============================================================
    // V. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    const oppEntries: Array<[string, string, string]> = [
      ['1', 'Opp#1', url_Opp1],
      ['2', 'Opp#2', url_Opp2],
    ];

    const hasTeardown = oppEntries.some(([, , url]) => !!url);
    if (hasTeardown) {
      console.log('\n=== V. TEAR DOWN ===');
    }

    for (const [num, label, url] of oppEntries) {
      if (!url) continue;

      let newTab: import('@playwright/test').Page | null = null;

      await test.step(`V. Tear down - Step ${num}.1: Open new tab and launch URL_${label}`, async () => {
        console.log(`Step V.${num}.1: Opening new tab and launching URL_${label}: ${url}`);
        newTab = await page.context().newPage();
        const tabPage = new LeadPage(newTab);
        await tabPage.goto(url, { waitUntil: 'networkidle' });
        await tabPage.waitForPageReady();
        await newTab.waitForTimeout(CommonUtils.waitTimes.standard);
        console.log(`\u2713 V.${num}.1: ${label} page opened in new tab`);
        await CommonUtils.captureAndAttachScreenshot(newTab, testInfo, `V.${num}.1 - ${label} page opened`);
      });

      await test.step(`V. Tear down - Step ${num}.2: Select "Action" dropdown list`, async () => {
        console.log(`Step V.${num}.2: Clicking Action dropdown for ${label}`);
        const tabPage = new LeadPage(newTab!);
        await tabPage.clickActionMenu();
        console.log(`\u2713 V.${num}.2: ${label} Action dropdown opened`);
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, `V.${num}.2 - ${label} Action dropdown opened`);
      });

      await test.step(`V. Tear down - Step ${num}.3: Select "Delete" option`, async () => {
        console.log(`Step V.${num}.3: Clicking Delete option for ${label}`);
        const tabPage = new LeadPage(newTab!);
        await tabPage.clickActionDeleteOption();
        console.log(`\u2713 V.${num}.3: ${label} Delete option selected`);
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, `V.${num}.3 - ${label} Delete confirmation dialog`);
      });

      await test.step(`V. Tear down - Step ${num}.4: Press "OK" button on confirmation dialog and wait`, async () => {
        console.log(`Step V.${num}.4: Clicking OK on "Are you sure you want to delete this record?" for ${label}`);
        const tabPage = new LeadPage(newTab!);
        await tabPage.confirmDeleteDialog();
        console.log(`\u2713 V.${num}.4: ${label} deleted successfully`);
        await CommonUtils.captureAndAttachScreenshot(newTab!, testInfo, `V.${num}.4 - ${label} deleted`);
        await newTab!.close();
        console.log(`\u2713 V.${num}.4: New tab closed`);
      });
    }

    url_Opp1 = '';
    url_Opp2 = '';

    await test.step('V. Tear down - Step 3: Close all browsers', async () => {
      console.log('Step V.3: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) {
          await p.close();
        }
      }
      console.log('\u2713 V.3: All browsers closed');
    });
  });

  test('CRM-457_3.1.3.1: Verify the qualified Opps from 2 States from 1 country have been transfered to another Salesperson correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);

    // Generate unique test data
    const tcId     = 'CRM-457_3.1.3.1';
    const oppName1 = `TEST Opp 1 ${tcId}`;
    const oppName2 = `TEST Opp 2 ${tcId}`;
    const email1   = CommonUtils.generateEmail('Test1', 'company');
    const email2   = CommonUtils.generateEmail('Test2', 'company');

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Opp#1 name  : ${oppName1}`);
    console.log(`  Opp#1 email : ${email1}`);
    console.log(`  Opp#2 name  : ${oppName2}`);
    console.log(`  Opp#2 email : ${email2}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Opp#1 (Belgium / Flanders)
    // ==============================================================

    await test.step('Pre-condition I Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== I. PRE-CONDITION (Opp#1 - Belgium/Flanders) ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`\u2713 Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
    });

    await test.step('Pre-condition I Step 1.1: Switch to list view on CRM Opps page', async () => {
      console.log('Step 1.1: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('\u2713 List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 1.1 - Opps list page');
    });

    await test.step('Pre-condition I Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp#1 creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 1.2 - Opp#1 creation form');
    });

    await test.step('Pre-condition I Step 2: Fill Opp#1 information', async () => {
      console.log('Step 2: Filling Opp#1 fields');

      console.log(`  2.1: Opp name = "${oppName1}"`);
      await opportunityPage.fillOpportunityName(oppName1);

      console.log(`  2.2: Email = "${email1}"`);
      await opportunityPage.fillEmail(email1);

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 2 - Opp#1 fields filled');
    });

    await test.step('Pre-condition I Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition I Step 4: Select Stage = NEW', async () => {
      console.log('Step 4: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage set to NEW');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 4 - Stage NEW selected');
    });

    await test.step('Pre-condition I Step 5: Press SAVE button and wait', async () => {
      console.log('Step 5: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 5 - Opp#1 saved');
    });

    await test.step('Pre-condition I Step 6: Copy URL of Opp#1', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`Step 6: URL_Opp#1 = ${url_Opp1}`);
      console.log('\u2713 URL_Opp#1 captured');
    });

    await test.step('Pre-condition I Step 7: Press Application icon to return to home page', async () => {
      console.log('Step 7: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I 7 - Home page after Opp#1 created');
    });

    // ==============================================================
    // II. PRE-CONDITION: Create Opp#2 (Belgium / Wallonia)
    // ==============================================================

    await test.step('Pre-condition II Step 1: Navigate to CRM', async () => {
      console.log(`\n=== II. PRE-CONDITION (Opp#2 - Belgium/Wallonia) ===`);
      console.log('Step 1: Navigating to CRM');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
    });

    await test.step('Pre-condition II Step 1.1: Switch to list view on CRM Opps page', async () => {
      console.log('Step 1.1: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('\u2713 List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 1.1 - Opps list page');
    });

    await test.step('Pre-condition II Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp#2 creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 1.2 - Opp#2 creation form');
    });

    await test.step('Pre-condition II Step 2: Fill Opp#2 information', async () => {
      console.log('Step 2: Filling Opp#2 fields');

      console.log(`  2.1: Opp name = "${oppName2}"`);
      await opportunityPage.fillOpportunityName(oppName2);

      console.log(`  2.2: Email = "${email2}"`);
      await opportunityPage.fillEmail(email2);

      console.log('  2.3: Company Name = "Company Name Opp 2"');
      await opportunityPage.fillCompanyName('Company Name Opp 2');

      console.log('  2.4: Street = "123street"');
      await opportunityPage.fillStreet('123street');

      console.log('  2.5: Country = "Belgium"');
      await opportunityPage.selectCountry('Belgium');

      console.log('  2.6: State = "Wallonia"');
      await opportunityPage.selectState('Wallonia');

      console.log('  2.7: Sales Team = "BDEU"');
      await opportunityPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await opportunityPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await opportunityPage.uncheckCreatedManually();

      console.log('\u2713 All Opp#2 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 2 - Opp#2 fields filled');
    });

    await test.step('Pre-condition II Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition II Step 4: Select Stage = NEW', async () => {
      console.log('Step 4: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage set to NEW');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 4 - Stage NEW selected');
    });

    await test.step('Pre-condition II Step 5: Press SAVE button and wait', async () => {
      console.log('Step 5: Saving Opp#2');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#2 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 5 - Opp#2 saved');
    });

    await test.step('Pre-condition II Step 6: Copy URL of Opp#2', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp2 = page.url();
      console.log(`Step 6: URL_Opp#2 = ${url_Opp2}`);
      console.log('\u2713 URL_Opp#2 captured');
    });

    await test.step('Pre-condition II Step 7: Press Application icon to return to home page', async () => {
      console.log('Step 7: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II 7 - Home page after Opp#2 created');
    });

    // ==============================================================
    // III. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step III.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== III. STEPS TO REPRODUCE ===`);
      console.log('Step III.1: Navigating to CRM');
      await homePage.navigateToCRM();
      console.log('\u2713 CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.1 - CRM page');
    });

    await test.step('Step III.2: Confirm CRM page is loaded', async () => {
      console.log('Step III.2: Confirming CRM page is ready');
      await homePage.waitForPageReady();
      console.log('\u2713 CRM page confirmed ready');
    });

    await test.step('Step III.3: Press "Configuration" menu', async () => {
      console.log('Step III.3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('\u2713 Configuration menu opened');
    });

    await test.step('Step III.4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step III.4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('\u2713 Re-assignation page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.4 - Re-assignation page');
    });

    await test.step('Step III.5: Set filter field values on Re-assignation page', async () => {
      console.log('Step III.5: Setting filter field values');
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

      console.log('  5.6: Country state = "Wallonia"');
      await reAssignationPage.selectCountryState('Wallonia');

      console.log('  5.7: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('\u2713 All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.5 - All filter fields set');
    });

    // ==============================================================
    // IV. VERIFICATION POINTS
    // ==============================================================

    await test.step('IV. Verification - Step 1: Verify Total text = "0/2"', async () => {
      console.log('\n=== IV. VERIFICATION POINTS ===');
      const totalText = await reAssignationPage.getTotalValueText();
      console.log(`  Total value received: "${totalText}"`);

      // Normalize spaces around "/" to allow "0/2", "0 /2", "0/ 2", "0 / 2"
      const normalizedTotal = totalText.replace(/\s*\/\s*/g, '/');
      expect(normalizedTotal).toBe('0/2');

      console.log('\u2713 IV.1: Total text = "0/2" - qualified Opps from 2 States correctly counted for re-assignment');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1 - Total 0-2 verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-457_3.1.3.1 verification completed successfully');
      console.log(`   Opp#1 URL : ${url_Opp1}`);
      console.log(`   Opp#2 URL : ${url_Opp2}`);
      console.log('   IV.1: Total = "0/2" - qualified Opps from 2 States correctly counted for re-assignment');
      console.log('   V   : Opp#1 and Opp#2 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
