import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Leads
 * Test Case ID: CRM-457_2.1.2.1
 *
 * Summary: Verify the qualified Leads from 2 countries have been transferred to another Salesperson correctly
 *
 * Command to run:
 * npx playwright test --grep CRM-457_2\.1\.2\.1: --project=chromium
 *
 * I. Condition for beforeEach:
 * 1. Login as admin_crm and navigate to CRM and wait:
 * 2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item and wait
 * 3. Find the "Salesperson" = "Thomas Semerich" by doing the steps:
 *    . Press "Filter" dropdown list
 *    . Then press "Add Customer Filter"
 *    . On Dropdown_List#1, select "Salesperson"
 *    . On Dropdown_List#2, select "is equal to"
 *    . On Dropdown_List#3, select "Thomas Semerich"
 *    . Press "APPLY" button
 *    . Press "Filter" dropdown list again to exit "Filter" mode
 * 4. Find the "Country" = "Poland" or "Germany" by doing the steps:
 *    . Press "Filter" dropdown list
 *    . Then press "Add Customer Filter"
 *    . On Dropdown_List#1, select "Country"
 *    . On Dropdown_List#2, select "is equal to"
 *    . On Dropdown_List#3, select "Poland"
 *    . Press "Add a Condition" button and wait
 *    . On Dropdown_List#1, select "Country"
 *    . On Dropdown_List#2, select "is equal to"
 *    . On Dropdown_List#3, select "Germany"
 *    . Press "APPLY" button
 *    . Press "Filter" dropdown list again to exit "Filter" mode
 * 5. Find the "Active" = "is true" by doing the steps:
 *    . Press "Filter" dropdown list
 *    . Then press "Add Customer Filter"
 *    . On Dropdown_List#1, select "Active"
 *    . On Dropdown_List#2, select "is true"
 *    . Press "APPLY" button
 *    . Press "Filter" dropdown list again to exit "Filter" mode
 * 6. If there is no qualified items show ("Create an opportunity in your pipeline" screen appears) skip the next steps. Else do the next steps:
 * 7. Click at the "Checkbox" on the top of table
 * 8. Press "Action" on the menu
 * 9. Select "Delete" option
 * 10. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 11. Close the browser
 *
 * I. Pre-condition#1 - Create Lead#1:
 * 1. Click at "CRM" button → "Leads" menu → "Leads" sub-item
 *    1.1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox      = TEST Lead 1 CRM-457_2.1.2.1
 *    - Email textbox          = Test@company1 + current date + current time.com (Email_Lead#1)
 *    - Company Name textbox   = Company Name Opp 1
 *    - Street                 = 123street
 *    - Country                = Poland
 *    - State                  = Lublin
 *    - Sales Team             = BDEU
 *    - Salesperson            = Thomas Semerich
 *    - Created manually       = FALSE
 * 3. Click at "CRM Developer" tab → Lead form = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1 (URL_Lead#1)
 * 6. Press "Application" icon on left-top of screen and wait
 *
 * II. Pre-condition#2 - Create Lead#2:
 * 1. Click at "CRM" button → "Leads" menu → "Leads" sub-item
 *    1.1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox      = TEST Lead 2 CRM-457_2.1.2.1
 *    - Email textbox          = Test@company2 + current date + current time.com (Email_Lead#2)
 *    - Company Name textbox   = Company Name Opp 2
 *    - Street                 = 123street
 *    - Country                = Germany
 *    - State                  = Hilden
 *    - Sales Team             = BDEU
 *    - Salesperson            = Thomas Semerich
 *    - Created manually       = FALSE
 * 3. Click at "CRM Developer" tab → Lead form = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#2 (URL_Lead#2)
 * 6. Press "Application" icon on left-top of screen and wait
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
 *    5.4. Set : "Country"             = "Poland"
 *    5.5. Set : "Country"             = "Germany"
 *    5.6. Set : "Stage"               = "New"
 *
 * IV. Verification points:
 * 1. The value at "Total" text = 0/2
 *
 * V. Tear down (Clean up test data):
 * 1. Delete Lead#1:
 *    1.1. Open new tab then launch the URL_Lead#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Delete Lead#2:
 *    2.1. Open new tab then launch the URL_Lead#2
 *    2.2. Select "Action" dropdown list on header of page
 *    2.3. Select "Delete" option
 *    2.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 3. Close all browsers
 */

test.describe('CRM-457_2.1.2.1 - Verify qualified Leads from 2 countries transferred to another Salesperson', () => {

  let url_Lead1 = '';
  let url_Lead2 = '';
  const SKIP_CLEANUP_LEADS    = false; // Toggle to true to skip Leads cleanup
  const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

  test.beforeEach(async ({ browser, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // I. Clean Leads (Poland OR Germany / Thomas Semerich / Active)
    // ============================================================
    if (!SKIP_CLEANUP_LEADS) {
    const cleanLeadsContext = await browser.newContext();
    const cleanLeadsPage   = await cleanLeadsContext.newPage();

    const loginPageLeads       = new LoginPage(cleanLeadsPage);
    const homePageLeads        = new HomePage(cleanLeadsPage);
    const opportunityPageClean = new OpportunityPage(cleanLeadsPage);

    // beforeEach Step 1: Login and navigate to All Leads
    await test.step('beforeEach Step 1: Login as admin_crm and navigate to All Leads', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach Step 1: Logging in for Leads cleanup');
      await loginPageLeads.navigateTo(baseUrl);
      await loginPageLeads.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageLeads.dismissLocationPermissionDialog();
      await homePageLeads.navigateToCRM();
      await homePageLeads.waitForPageReady();
      console.log('\u2713 beforeEach Step 1: Logged in and navigated to CRM');
      await opportunityPageClean.navigateToAllLeads();
      console.log('\u2713 beforeEach Step 2: Archive > All leads page loaded');
    });

    // beforeEach Step 3: Filter by Salesperson = Thomas Semerich
    await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach Step 3: Adding filter Salesperson = Thomas Semerich');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Salesperson');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Thomas Semerich');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 3: Salesperson filter applied');
    });

    // beforeEach Step 4: Filter by Country = Poland OR Germany (single filter-panel session)
    await test.step('beforeEach Step 4: Filter by Country = Poland or Germany', async () => {
      console.log('beforeEach Step 4: Adding Country filter — Poland OR Germany');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Country');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Poland');
      await opportunityPageClean.clickAddCondition();
      await opportunityPageClean.selectLastCustomFilterField('Country');
      await opportunityPageClean.selectLastCustomFilterOperator('is equal to');
      await opportunityPageClean.selectLastCustomFilterValue('Germany');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 4: Country = Poland OR Germany filter applied');
    });

    // beforeEach Step 5: Filter by Active = is true
    await test.step('beforeEach Step 5: Filter by Active = is true', async () => {
      console.log('beforeEach Step 5: Adding filter Active = is true');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Active');
      await opportunityPageClean.selectCustomFilterOperator('is true');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 5: Active filter applied');
    });

    // beforeEach Step 6-10: Check and delete if any records exist
    await test.step('beforeEach Step 6: Check if any qualified records exist', async () => {
      console.log('beforeEach Step 6: Checking if any qualified leads exist...');
      const isEmpty = await opportunityPageClean.isListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach Step 6: No qualified Leads found - skipping delete steps');
        return;
      }
      console.log('  \u26a0 Qualified Leads found - proceeding to delete');

      await test.step('beforeEach Step 7: Click select-all checkbox', async () => {
        console.log('beforeEach Step 7: Clicking select-all checkbox');
        await opportunityPageClean.clickSelectAllCheckbox();
        console.log('\u2713 beforeEach Step 7: All records selected');
      });

      await test.step('beforeEach Step 8: Press Action menu', async () => {
        console.log('beforeEach Step 8: Opening Action menu');
        await opportunityPageClean.clickListActionMenu();
        console.log('\u2713 beforeEach Step 8: Action menu opened');
      });

      await test.step('beforeEach Step 9: Select Delete option', async () => {
        console.log('beforeEach Step 9: Clicking Delete option');
        await opportunityPageClean.clickListActionDelete();
        console.log('\u2713 beforeEach Step 9: Delete option selected');
      });

      await test.step('beforeEach Step 10: Confirm deletion dialog', async () => {
        console.log('beforeEach Step 10: Clicking OK on confirmation dialog');
        await opportunityPageClean.confirmDeleteDialog();
        console.log('\u2713 beforeEach Step 10: Records deleted successfully');
      });
    });

    // beforeEach Step 11: Close all browsers
    await test.step('beforeEach Step 11: Close all browsers', async () => {
      console.log('beforeEach Step 11: Closing cleanup browser context');
      await cleanLeadsContext.close();
      console.log('\u2713 beforeEach Step 11: All cleanup browsers closed - test will start a fresh session');
    });
    } // end !SKIP_CLEANUP_LEADS

    // ============================================================
    // II. Clean Contacts (Poland + Germany / Thomas Semerich)
    // ============================================================
    if (!SKIP_CLEANUP_CONTACTS) {
    } // end !SKIP_CLEANUP_CONTACTS
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
    if (!SKIP_CLEANUP_LEADS && (url_Lead1 || url_Lead2)) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        if (url_Lead1) {
          await test.step('IV.1: Delete Lead#1', async () => {
            await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
          });
          url_Lead1 = '';
        }
        if (url_Lead2) {
          await test.step('IV.2: Delete Lead#2', async () => {
            await CommonUtils.deleteRecordByUrl(page, url_Lead2, testInfo);
          });
          url_Lead2 = '';
        }
        await test.step('IV.3: Close all browsers', async () => {
          const allPages = page.context().pages();
          for (const p of allPages) { if (!p.isClosed()) await p.close(); }
          console.log('\u2713 IV.3: All browsers closed');
        });
      });
    }
  });

  test('CRM-457_2.1.2.1: Verify the qualified Leads from 2 countries have been transferred to another Salesperson correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);
    const leadPage          = new LeadPage(page);

    // Generate unique test data
    const tcId      = 'CRM-457_2.1.2.1';
    const leadName1 = `TEST Lead 1 ${tcId}`;
    const leadName2 = `TEST Lead 2 ${tcId}`;
    const email1    = CommonUtils.generateEmail('Test', 'company1');
    const email2    = CommonUtils.generateEmail('Test', 'company2');

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Lead#1 name : ${leadName1}`);
    console.log(`  Lead#1 email: ${email1}`);
    console.log(`  Lead#2 name : ${leadName2}`);
    console.log(`  Lead#2 email: ${email2}`);

    // ==============================================================
    // I. PRE-CONDITION#1: Create Lead#1 (Poland / Lublin)
    // ==============================================================

    await test.step('Pre-condition#1 Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== I. PRE-CONDITION#1 (Lead#1) ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM module');
    });

    await test.step('Pre-condition#1 Step 1.1: Navigate to CRM > Leads list', async () => {
      console.log('Step 1.1: Navigating to Leads menu → Leads sub-item');
      await homePage.navigateToLeads();
      console.log('✓ Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 1.1 - Leads list page');
    });

    await test.step('Pre-condition#1 Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 1.2 - Lead creation form');
    });

    await test.step('Pre-condition#1 Step 2: Fill Lead#1 information', async () => {
      console.log('Step 2: Filling Lead#1 fields');

      console.log(`  2.1: Lead name = "${leadName1}"`);
      await leadPage.fillLeadOpportunity(leadName1);

      console.log(`  2.2: Email = "${email1}"`);
      await leadPage.fillEmail(email1);

      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await leadPage.fillCompanyName('Company Name Opp 1');

      console.log('  2.4: Street = "123street"');
      await leadPage.fillStreet('123street');

      console.log('  2.5: Country = "Poland"');
      await leadPage.selectCountry('Poland');

      console.log('  2.6: State = "Lublin"');
      await leadPage.selectState('Lublin');

      console.log('  2.7: Sales Team = "BDEU"');
      await leadPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await leadPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await leadPage.uncheckCreatedManually();

      console.log('✓ All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 2 - Lead#1 fields filled');
    });

    await test.step('Pre-condition#1 Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab activated');

      console.log('  3.1: Lead form = "License"');
      await leadPage.fillLeadForm('License');
      console.log('✓ Lead form set to "License"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition#1 Step 4: Press SAVE button', async () => {
      console.log('Step 4: Saving Lead#1');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 4 - Lead#1 saved');
    });

    await test.step('Pre-condition#1 Step 5: Copy URL of Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`Step 5: URL_Lead#1 = ${url_Lead1}`);
      console.log('✓ URL_Lead#1 captured');
    });

    await test.step('Pre-condition#1 Step 6: Press Application icon to return to home page', async () => {
      console.log('Step 6: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#1 6 - Home page');
    });

    // ==============================================================
    // II. PRE-CONDITION#2: Create Lead#2 (Germany / Hilden)
    // ==============================================================

    await test.step('Pre-condition#2 Step 1: Navigate to CRM', async () => {
      console.log(`\n=== II. PRE-CONDITION#2 (Lead#2) ===`);
      console.log('Step 1: Navigating to CRM module');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM module');
    });

    await test.step('Pre-condition#2 Step 1.1: Navigate to CRM > Leads list', async () => {
      console.log('Step 1.1: Navigating to Leads menu → Leads sub-item');
      await homePage.navigateToLeads();
      console.log('✓ Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 1.1 - Leads list page');
    });

    await test.step('Pre-condition#2 Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 1.2 - Lead creation form');
    });

    await test.step('Pre-condition#2 Step 2: Fill Lead#2 information', async () => {
      console.log('Step 2: Filling Lead#2 fields');

      console.log(`  2.1: Lead name = "${leadName2}"`);
      await leadPage.fillLeadOpportunity(leadName2);

      console.log(`  2.2: Email = "${email2}"`);
      await leadPage.fillEmail(email2);

      console.log('  2.3: Company Name = "Company Name Opp 2"');
      await leadPage.fillCompanyName('Company Name Opp 2');

      console.log('  2.4: Street = "123street"');
      await leadPage.fillStreet('123street');

      console.log('  2.5: Country = "Germany"');
      await leadPage.selectCountry('Germany');

      console.log('  2.6: State = "Hilden"');
      await leadPage.selectState('Hilden');

      console.log('  2.7: Sales Team = "BDEU"');
      await leadPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await leadPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await leadPage.uncheckCreatedManually();

      console.log('✓ All Lead#2 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 2 - Lead#2 fields filled');
    });

    await test.step('Pre-condition#2 Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab activated');

      console.log('  3.1: Lead form = "License"');
      await leadPage.fillLeadForm('License');
      console.log('✓ Lead form set to "License"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition#2 Step 4: Press SAVE button', async () => {
      console.log('Step 4: Saving Lead#2');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#2 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 4 - Lead#2 saved');
    });

    await test.step('Pre-condition#2 Step 5: Copy URL of Lead#2', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead2 = page.url();
      console.log(`Step 5: URL_Lead#2 = ${url_Lead2}`);
      console.log('✓ URL_Lead#2 captured');
    });

    await test.step('Pre-condition#2 Step 6: Press Application icon to return to home page', async () => {
      console.log('Step 6: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition#2 6 - Home page');
    });

    // ==============================================================
    // III. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step III.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== III. STEPS TO REPRODUCE ===`);
      console.log('Step III.1: Navigating to CRM');
      await homePage.navigateToCRM();
      console.log('✓ CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.1 - CRM page');
    });

    await test.step('Step III.2: Confirm CRM page is loaded', async () => {
      console.log('Step III.2: Confirming CRM page is ready');
      await homePage.waitForPageReady();
      console.log('✓ CRM page confirmed ready');
    });

    await test.step('Step III.3: Press "Configuration" menu', async () => {
      console.log('Step III.3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('✓ Configuration menu opened');
    });

    await test.step('Step III.4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step III.4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('✓ Re-assignation page loaded');
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

      console.log('  5.4: Country = "Poland"');
      await reAssignationPage.selectCountry('Poland');

      console.log('  5.5: Country = "Germany"');
      await reAssignationPage.selectCountry('Germany');

      console.log('  5.6: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('✓ All filter fields set');
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

      console.log('\u2713 IV.1: Total text = "0/2" - qualified Leads from 2 countries correctly counted for re-assignment');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1 - Total 0-2 verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_2.1.2.1 verification completed successfully');
      console.log(`   Lead#1 URL : ${url_Lead1}`);
      console.log(`   Lead#2 URL : ${url_Lead2}`);
      console.log('   IV.1: Total = "0/2" - qualified Leads from 2 countries correctly counted for re-assignment');
      console.log('   V    : Lead#1 and Lead#2 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
