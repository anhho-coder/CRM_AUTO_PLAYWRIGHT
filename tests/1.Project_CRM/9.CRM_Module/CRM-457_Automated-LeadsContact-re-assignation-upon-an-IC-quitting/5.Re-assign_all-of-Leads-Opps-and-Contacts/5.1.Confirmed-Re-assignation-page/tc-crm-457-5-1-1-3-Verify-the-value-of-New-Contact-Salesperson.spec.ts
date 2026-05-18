import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, LeadPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign all Leads, Opps and Contacts
 * Test Case ID: CRM-457_5.1.1.3
 *
 * Summary: Verify Salesperson is changed to the assigned to salesperson after confirming the re-assignation
 *
 * Command to run:
 * npx playwright test --grep "CRM-457_5\.1\.1\.3:" --project=chromium
 *
 * I. Condition for beforeEach to clean Opps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Austria
 * 5.  Filter: State = Salzburg
 * 6.  Filter: Active = is true
 * 7.  If no records found -> skip
 * 8.  Click select-all checkbox
 * 9.  Press Action menu
 * 10. Select Delete option
 * 11. Confirm deletion dialog
 * 12. Close the browser
 *
 * II. Condition for beforeEach to clean Contacts:
 * 1.  Login as admin_crm and navigate to Contacts module
 * 2.  Remove "Created by Anh Ho" filter; switch to list view
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Austria
 * 5.  Filter: State = Salzburg
 * 6.  Filter: Active = is true
 * 7.  If no records found -> skip
 * 8.  Click select-all checkbox
 * 9.  Press Action menu
 * 10. Select Delete option
 * 11. Confirm deletion dialog
 * 12. Close the browser
 *
 * III. Pre-condition#1 to create Lead#1:
 * 1. Click at "CRM" button -> Leads > Leads sub-item
 *    1.1. Click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox       = TEST Lead 1 CRM-457_5.1.1.3
 *    - Email textbox           = Test@company + current date + current time.com (Email_Lead#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Austria
 *    - State                   = Salzburg
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab -> Lead form = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1 (URL_Lead#1)
 * 6. Press "Application" icon on left-top of screen and wait
 *
 * IV. Condition#1 to create Opp#1:
 * 1. Click at "CRM" button -> view list -> CREATE
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 1 CRM-457_5.1.1.3
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Austria
 *    - State                   = Salzburg
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab -> Lead form = Download Free Trial
 * 4. On "Stage", select the Stage = NEW
 * 5. Press "SAVE" button and wait
 * 6. Copy URL of Opp#1 (URL_Opp#1)
 * 7. Press "Application" icon on left-top of screen and wait
 *
 * V. Pre-condition#1 to create Contact#1:
 * 1. Click at "Contact" button and wait
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. Enter the following information:
 *    - Company checkbox        = TRUE
 *    - Contact name textbox    = TEST-Contact#1_CRM-457_5.1.1.3_<timestamp>
 *    - Email textbox           = Test-company@company<timestamp>.com (Email_Contact#1)
 *    - Country                 = Austria
 *    - State                   = Salzburg
 *    - Sales Team              = BDEU
 *    - Salesperson             = Thomas Semerich
 * 4. Press "SAVE" button and wait (URL_Contact#1 captured automatically)
 * 5. Press "Application" icon to return to Home page
 *
 * VI. Steps to reproduce:
 * 1. On Homepage, click at "CRM" button
 * 2. On "CRM" page (ready)
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"       = "Contact"
 *    5.2. Set : "Customer type"       = "Leads/Opportunities"
 *    5.3. Set : "Current Salesperson" = "Thomas Semerich"
 *    5.4. Set : "Re-assignment to"    = "Alan Osseiran" (selected_Re-assignment_to#1)
 *    5.5. Set : "Country"             = "Austria"
 *    5.6. Set : "Country state"       = "Salzburg"
 *    5.7. Set : "Stage"               = "New"
 * 6. Press "RE-ASSIGNMENT" button and wait
 * 7. Press "CONFIRM" button on "Confirmed Re-assignation" page and wait
 *
 * VII. Verification points:
 * 1. Open URL_Contact#1 and verify Salesperson = selected_Re-assignment_to#1
 * 2. Open URL_Lead#1 and verify Salesperson = selected_Re-assignment_to#1
 * 3. Open URL_Opp#1 and verify Salesperson = selected_Re-assignment_to#1
 *
 * VIII. Tear down (Clean up test data):
 * 1. Delete Contact#1 (URL_Contact#1)
 * 2. Delete Lead#1 (URL_Lead#1)
 * 3. Delete Opp#1 (URL_Opp#1)
 * 4. Close all browsers
 */

test.describe('CRM-457_5.1.1.3 - Verify Salesperson is changed to the assigned to salesperson after confirming the re-assignation', () => {

  let url_Lead1    = '';
  let url_Opp1     = '';
  let url_Contact1 = '';

  test.beforeEach(async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts['5-minutes']);

    // ============================================================
    // CLEANUP ROUND 1: Opps with Austria/Salzburg / Thomas Semerich
    // ============================================================

    const cleanupOppsContext = await browser.newContext();
    const cleanupOppsPage    = await cleanupOppsContext.newPage();

    const loginPageOpps       = new LoginPage(cleanupOppsPage);
    const homePageOpps        = new HomePage(cleanupOppsPage);
    const opportunityPageClean = new OpportunityPage(cleanupOppsPage);

    await test.step('beforeEach Step 1: Login as admin_crm and navigate to CRM (Opps cleanup)', async () => {
      console.log('beforeEach Step 1: Logging in as admin_crm (Opps cleanup)');
      await loginPageOpps.navigateTo(baseUrl);
      await loginPageOpps.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageOpps.dismissLocationPermissionDialog();
      await homePageOpps.navigateToCRM();
      await homePageOpps.waitForPageReady();
      console.log('\u2713 beforeEach Step 1: Logged in and navigated to CRM');
    });

    await test.step('beforeEach Step 2: Navigate to Archive > All', async () => {
      console.log('beforeEach Step 2: Navigating to Archive > All');
      await opportunityPageClean.navigateToAllLeads();
      console.log('\u2713 beforeEach Step 2: Archive > All Opps page loaded');
    });

    await test.step('beforeEach Step 3: Filter Salesperson = Thomas Semerich', async () => {
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

    await test.step('beforeEach Step 4: Filter Country = Austria', async () => {
      console.log('beforeEach Step 4: Adding filter Country = Austria');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Country');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Austria');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 4: Country = Austria filter applied');
    });

    await test.step('beforeEach Step 5: Filter State = Salzburg', async () => {
      console.log('beforeEach Step 5: Adding filter State = Salzburg');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('State');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Salzburg');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 5: State = Salzburg filter applied');
    });

    await test.step('beforeEach Step 6: Filter Active = is true', async () => {
      console.log('beforeEach Step 6: Adding filter Active = is true');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Active');
      await opportunityPageClean.selectCustomFilterOperator('is true');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 6: Active filter applied');
    });

    await test.step('beforeEach Step 7: Delete Austria/Salzburg Opps if any', async () => {
      console.log('beforeEach Step 7: Checking for Austria/Salzburg Opps...');
      const isEmpty = await opportunityPageClean.isListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach Step 7: No Austria/Salzburg Opps found - skipping delete');
      } else {
        console.log('  \u26a0 Austria/Salzburg Opps found - proceeding to delete');

        await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
          await opportunityPageClean.clickSelectAllCheckbox();
          console.log('\u2713 beforeEach Step 8: All Opps selected');
        });

        await test.step('beforeEach Step 9: Press Action menu', async () => {
          await opportunityPageClean.clickListActionMenu();
          console.log('\u2713 beforeEach Step 9: Action menu opened');
        });

        await test.step('beforeEach Step 10: Select Delete option', async () => {
          await opportunityPageClean.clickListActionDelete();
          console.log('\u2713 beforeEach Step 10: Delete option selected');
        });

        await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
          await opportunityPageClean.confirmDeleteDialog();
          console.log('\u2713 beforeEach Step 11: Opps deleted');
        });
      }
    });

    await test.step('beforeEach Step 12: Close Opps cleanup browser', async () => {
      console.log('beforeEach Step 12: Closing Opps cleanup context');
      await cleanupOppsContext.close();
      console.log('\u2713 beforeEach Step 12: Opps cleanup browser closed');
    });

    // ============================================================
    // CLEANUP ROUND 2: Contacts with Austria/Salzburg / Thomas Semerich
    // ============================================================

    let cleanupContactsContext!: import('@playwright/test').BrowserContext;
    let cleanupContactsPage!: import('@playwright/test').Page;
    let loginPageContacts!: LoginPage;
    let homePageContacts!: HomePage;
    let contactPageClean!: ContactPage;

    await test.step('beforeEach Step 13: Open browser and login as admin_crm, navigate to Contacts (Contacts cleanup)', async () => {
      console.log('beforeEach Step 13: Opening new browser context and logging in as admin_crm (Contacts cleanup)');
      cleanupContactsContext = await browser.newContext();
      cleanupContactsPage    = await cleanupContactsContext.newPage();
      loginPageContacts = new LoginPage(cleanupContactsPage);
      homePageContacts  = new HomePage(cleanupContactsPage);
      contactPageClean  = new ContactPage(cleanupContactsPage);
      await loginPageContacts.navigateTo(baseUrl);
      await loginPageContacts.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageContacts.dismissLocationPermissionDialog();
      await homePageContacts.navigateToContactsFromHome();
      await homePageContacts.waitForPageReady();
      console.log('\u2713 beforeEach Step 13: Browser opened, logged in and navigated to Contacts');
    });

    await test.step('beforeEach Step 14: Remove "Created by Anh Ho" filter and select View list', async () => {
      console.log('beforeEach Step 14: Removing pipeline filter and switching to list view');
      await contactPageClean.removeMyPipelineFilter();
      await contactPageClean.clickViewListButtonIfVisible();
      console.log('\u2713 beforeEach Step 14: Filter removed and list view activated');
    });

    await test.step('beforeEach Step 15: Filter Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach Step 15: Adding filter Salesperson = Thomas Semerich');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Salesperson');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Thomas Semerich');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 15: Salesperson filter applied');
    });

    await test.step('beforeEach Step 16: Filter Country = Austria', async () => {
      console.log('beforeEach Step 16: Adding filter Country = Austria');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Country');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Austria');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 16: Country = Austria filter applied');
    });

    await test.step('beforeEach Step 17: Filter State = Salzburg', async () => {
      console.log('beforeEach Step 17: Adding filter State = Salzburg');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('State');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Salzburg');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 17: State = Salzburg filter applied');
    });

    await test.step('beforeEach Step 18: Filter Active = is true', async () => {
      console.log('beforeEach Step 18: Adding filter Active = is true');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Active');
      await contactPageClean.selectCustomFilterOperator('is true');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach Step 18: Active filter applied');
    });

    await test.step('beforeEach Step 19: Delete Austria/Salzburg Contacts if any', async () => {
      console.log('beforeEach Step 19: Checking for Austria/Salzburg Contacts...');
      const isEmpty = await contactPageClean.isRecordListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach Step 19: No Austria/Salzburg Contacts found - skipping delete');
      } else {
        console.log('  \u26a0 Austria/Salzburg Contacts found - proceeding to delete');

        await test.step('beforeEach Step 19.1: Click select-all checkbox', async () => {
          await contactPageClean.clickSelectAllCheckbox();
          console.log('\u2713 beforeEach Step 19.1: All Contacts selected');
        });

        await test.step('beforeEach Step 19.2: Press Action menu', async () => {
          await contactPageClean.clickListActionMenu();
          console.log('\u2713 beforeEach Step 19.2: Action menu opened');
        });

        await test.step('beforeEach Step 19.3: Select Delete option', async () => {
          await contactPageClean.clickListActionDelete();
          console.log('\u2713 beforeEach Step 19.3: Delete option selected');
        });

        await test.step('beforeEach Step 19.4: Confirm deletion dialog', async () => {
          await contactPageClean.confirmDeleteDialog();
          console.log('\u2713 beforeEach Step 19.4: Contacts deleted');
        });
      }
    });

    await test.step('beforeEach Step 20: Close Contacts cleanup browser', async () => {
      console.log('beforeEach Step 20: Closing Contacts cleanup context');
      await cleanupContactsContext.close();
      console.log('\u2713 beforeEach Step 20: Contacts cleanup browser closed');
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
    // VIII. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    console.log('\n=== VIII. TEAR DOWN ===');

    if (url_Contact1) {
      await test.step('VIII. Tear down - Step 1: Delete Contact#1', async () => {
        console.log(`Step VIII.1: Deleting Contact#1 at ${url_Contact1}`);
        await CommonUtils.deleteRecordByUrl(page, url_Contact1, testInfo);
        url_Contact1 = '';
        console.log('\u2713 VIII.1: Contact#1 deleted');
      });
    }

    if (url_Lead1) {
      await test.step('VIII. Tear down - Step 2: Delete Lead#1', async () => {
        console.log(`Step VIII.2: Deleting Lead#1 at ${url_Lead1}`);
        await CommonUtils.deleteRecordByUrl(page, url_Lead1, testInfo);
        url_Lead1 = '';
        console.log('\u2713 VIII.2: Lead#1 deleted');
      });
    }

    if (url_Opp1) {
      await test.step('VIII. Tear down - Step 3: Delete Opp#1', async () => {
        console.log(`Step VIII.3: Deleting Opp#1 at ${url_Opp1}`);
        await CommonUtils.deleteRecordByUrl(page, url_Opp1, testInfo);
        url_Opp1 = '';
        console.log('\u2713 VIII.3: Opp#1 deleted');
      });
    }

    await test.step('VIII. Tear down - Step 4: Close all browsers', async () => {
      console.log('Step VIII.4: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) {
          await p.close();
        }
      }
      console.log('\u2713 VIII.4: All browsers closed');
    });
  });

  test('CRM-457_5.1.1.3: Verify Salesperson is changed to the assigned to salesperson after confirming the re-assignation', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);
    const leadPage          = new LeadPage(page);
    const contactPage       = new ContactPage(page);

    // Generate unique test data
    const tcId      = 'CRM-457_5.1.1.3';
    const leadName1 = `TEST Lead 1 ${tcId}`;
    const oppName1  = `TEST Opp 1 ${tcId}`;
    const emailLead = CommonUtils.generateEmail('Test_Lead1', 'company');
    const emailOpp  = CommonUtils.generateEmail('Test_Opp1', 'company');
    let selectedReAssignmentTo1 = '';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  Lead#1 name  : ${leadName1}`);
    console.log(`  Lead#1 email : ${emailLead}`);
    console.log(`  Opp#1 name   : ${oppName1}`);
    console.log(`  Opp#1 email  : ${emailOpp}`);

    // ==============================================================
    // III. PRE-CONDITION: Create Lead#1 (Austria / Salzburg)
    // ==============================================================

    await test.step('Pre-condition III Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== III. PRE-CONDITION (Lead#1 - Austria/Salzburg) ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`\u2713 Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
    });

    await test.step('Pre-condition III Step 1.1: Navigate to Leads > Leads', async () => {
      console.log('Step 1.1: Navigating to CRM Leads > Leads');
      await homePage.navigateToLeads();
      console.log('\u2713 CRM Leads page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 1.1 - Leads page');
    });

    await test.step('Pre-condition III Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('\u2713 Lead#1 creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 1.2 - Lead#1 creation form');
    });

    await test.step('Pre-condition III Step 2: Fill Lead#1 information', async () => {
      console.log('Step 2: Filling Lead#1 fields');

      console.log(`  2.1: Lead name = "${leadName1}"`);
      await leadPage.fillLeadOpportunity(leadName1);

      console.log(`  2.2: Email = "${emailLead}"`);
      await leadPage.fillEmail(emailLead);

      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await leadPage.fillCompanyName('Company Name Opp 1');

      console.log('  2.4: Street = "123street"');
      await leadPage.fillStreet('123street');

      console.log('  2.5: Country = "Austria"');
      await leadPage.selectCountry('Austria');

      console.log('  2.6: State = "Salzburg"');
      await leadPage.selectState('Salzburg');

      console.log('  2.7: Sales Team = "BDEU"');
      await leadPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await leadPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await leadPage.uncheckCreatedManually();

      console.log('\u2713 All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 2 - Lead#1 fields filled');
    });

    await test.step('Pre-condition III Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "License"');
      await leadPage.fillLeadForm('License');
      console.log('\u2713 Lead form set to "License"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition III Step 4: Press SAVE button', async () => {
      console.log('Step 4: Saving Lead#1');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('\u2713 Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 4 - Lead#1 saved');
    });

    await test.step('Pre-condition III Step 5: Copy URL of Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`Step 5: URL_Lead#1 = ${url_Lead1}`);
      console.log('\u2713 URL_Lead#1 captured');
    });

    await test.step('Pre-condition III Step 6: Press Application icon to return to home page', async () => {
      console.log('Step 6: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III 6 - Home page after Lead#1 created');
    });

    // ==============================================================
    // IV. PRE-CONDITION: Create Opp#1 (Austria / Salzburg)
    // ==============================================================

    await test.step('Pre-condition IV Step 1: Navigate to CRM', async () => {
      console.log(`\n=== IV. PRE-CONDITION (Opp#1 - Austria/Salzburg) ===`);
      console.log('Step 1: Navigating to CRM');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
    });

    await test.step('Pre-condition IV Step 1.1: Switch to list view on CRM Opps page', async () => {
      console.log('Step 1.1: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('\u2713 List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 1.1 - Opps list page');
    });

    await test.step('Pre-condition IV Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp#1 creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 1.2 - Opp#1 creation form');
    });

    await test.step('Pre-condition IV Step 2: Fill Opp#1 information', async () => {
      console.log('Step 2: Filling Opp#1 fields');

      console.log(`  2.1: Opp name = "${oppName1}"`);
      await opportunityPage.fillOpportunityName(oppName1);

      console.log(`  2.2: Email = "${emailOpp}"`);
      await opportunityPage.fillEmail(emailOpp);

      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await opportunityPage.fillCompanyName('Company Name Opp 1');

      console.log('  2.4: Street = "123street"');
      await opportunityPage.fillStreet('123street');

      console.log('  2.5: Country = "Austria"');
      await opportunityPage.selectCountry('Austria');

      console.log('  2.6: State = "Salzburg"');
      await opportunityPage.selectState('Salzburg');

      console.log('  2.7: Sales Team = "BDEU"');
      await opportunityPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await opportunityPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await opportunityPage.uncheckCreatedManually();

      console.log('\u2713 All Opp#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 2 - Opp#1 fields filled');
    });

    await test.step('Pre-condition IV Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step 3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 3 - CRM Developer tab - Lead form');
    });

    await test.step('Pre-condition IV Step 4: Select Stage = NEW', async () => {
      console.log('Step 4: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage set to NEW');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 4 - Stage NEW selected');
    });

    await test.step('Pre-condition IV Step 5: Press SAVE button and wait', async () => {
      console.log('Step 5: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 5 - Opp#1 saved');
    });

    await test.step('Pre-condition IV Step 6: Copy URL of Opp#1', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`Step 6: URL_Opp#1 = ${url_Opp1}`);
      console.log('\u2713 URL_Opp#1 captured');
    });

    await test.step('Pre-condition IV Step 7: Press Application icon to return to home page', async () => {
      console.log('Step 7: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition IV 7 - Home page after Opp#1 created');
    });

    // ==============================================================
    // V. PRE-CONDITION: Create Contact#1 (Austria / Salzburg)
    // ==============================================================

    await test.step('Pre-condition V Step 1: Navigate to Contacts module', async () => {
      console.log(`\n=== V. PRE-CONDITION (Contact#1 - Austria/Salzburg) ===`);
      console.log('Step 1: Navigating to Contacts module');
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to Contacts module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition V 1 - Contacts page');
    });

    await test.step('Pre-condition V Step 2: Click CREATE button and wait', async () => {
      console.log('Step 2: Clicking CREATE button');
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Contact creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition V 2 - Contact creation form');
    });

    await test.step('Pre-condition V Step 3: Fill Contact#1 information', async () => {
      console.log('Step 3: Filling Contact#1 fields');

      const timestamp     = CommonUtils.generateTimestamp();
      const contact1Name  = `TEST-Contact#1_${tcId}_${timestamp}`;
      const contact1Email = `Test-company_Contact1@company${timestamp}.com`;
      const contact1Domain = `@company${timestamp}.com`;

      console.log('  3.1: Company checkbox = TRUE');
      await contactPage.checkCompanyCheckbox();

      console.log(`  3.2: Contact Name = "${contact1Name}"`);
      await contactPage.fillContactName(contact1Name);

      console.log(`  3.3: Email = "${contact1Email}" (Email_Contact#1)`);
      await contactPage.fillEmail(contact1Email);

      console.log('  3.4: Country = "Austria"');
      await contactPage.selectCountry('Austria');

      console.log('  3.5: State = "Salzburg"');
      await contactPage.selectState('Salzburg');

      console.log('  3.6: Sales Team = "BDEU"');
      await contactPage.selectSalesTeam('BDEU');

      console.log('  3.7: Salesperson = "Thomas Semerich"');
      await contactPage.selectSalesperson('Thomas Semerich');

      console.log('\u2713 All Contact#1 fields filled');
      console.log(`  Email_Contact#1        : ${contact1Email}`);
      console.log(`  Domain_Email_Contact#1 : ${contact1Domain}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition V 3 - Contact#1 fields filled');
    });

    await test.step('Pre-condition V Step 4: Press SAVE button and wait', async () => {
      console.log('Step 4: Saving Contact#1');
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('\u2713 Contact#1 saved successfully');

      console.log('Step 4 (cont): Waiting for saved-record URL (with numeric id)...');
      await page.waitForFunction(
        () => /[#&]id=\d+/.test(window.location.href),
        { timeout: config.timeouts.test }
      );
      url_Contact1 = page.url();
      console.log(`\u2713 URL_Contact#1 captured: ${url_Contact1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition V 4 - Contact#1 saved');
    });

    await test.step('Pre-condition V Step 5: Press Application icon to return to Home page', async () => {
      console.log('Step 5: Clicking Application icon');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition V 5 - Home page after Contact#1 created');
    });

    // ==============================================================
    // VI. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step VI.1: Click CRM button on Homepage', async () => {
      console.log(`\n=== VI. STEPS TO REPRODUCE ===`);
      console.log('Step VI.1: Navigating to CRM');
      await homePage.navigateToCRM();
      console.log('\u2713 CRM page ready');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step VI.1 - CRM page');
    });

    await test.step('Step VI.2: Confirm CRM page is loaded', async () => {
      console.log('Step VI.2: Confirming CRM page is ready');
      await homePage.waitForPageReady();
      console.log('\u2713 CRM page confirmed ready');
    });

    await test.step('Step VI.3: Press "Configuration" menu', async () => {
      console.log('Step VI.3: Clicking Configuration menu');
      await opportunityPage.clickConfigurationMenu();
      console.log('\u2713 Configuration menu opened');
    });

    await test.step('Step VI.4: Press "Re-assignation" in "Resellers" section', async () => {
      console.log('Step VI.4: Clicking Re-assignation menu item');
      await opportunityPage.clickReAssignationMenuItem();
      console.log('\u2713 Re-assignation page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step VI.4 - Re-assignation page');
    });

    await test.step('Step VI.5: Set filter field values on Re-assignation page', async () => {
      console.log('Step VI.5: Setting filter field values');
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      console.log('  5.1: Customer type = "Contact"');
      await reAssignationPage.selectCustomerType('Contact');

      console.log('  5.2: Customer type = "Leads/Opportunities"');
      await reAssignationPage.selectCustomerType('Leads/Opportunities');

      console.log('  5.3: Current Salesperson = "Thomas Semerich"');
      await reAssignationPage.selectCurrentSalesperson('Thomas Semerich');

      console.log('  5.4: Re-assignment to = "Alan Osseiran" (remember as selected_Re-assignment_to#1)');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');
      selectedReAssignmentTo1 = 'Alan Osseiran';
      console.log('\u2713 selected_Re-assignment_to#1 = "Alan Osseiran"');

      console.log('  5.5: Country = "Austria"');
      await reAssignationPage.selectCountry('Austria');

      console.log('  5.6: Country state = "Salzburg"');
      await reAssignationPage.selectCountryState('Salzburg');

      console.log('  5.7: Stage = "New"');
      await reAssignationPage.selectStage('New');

      console.log('\u2713 All filter fields set');
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step VI.5 - All filter fields set');
    });

    await test.step('Step VI.6: Press "RE-ASSIGNMENT" button and wait', async () => {
      console.log('Step VI.6: Clicking RE-ASSIGNMENT button');
      await reAssignationPage.clickReAssignmentButton();
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      console.log('\u2713 RE-ASSIGNMENT button clicked');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step VI.6 - RE-ASSIGNMENT clicked');
    });

    await test.step('Step VI.7: Press "CONFIRM" button on "Confirmed Re-assignation" page and wait', async () => {
      console.log('Step VI.7: Clicking CONFIRM button');
      await reAssignationPage.clickConfirmButton();
      await reAssignationPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      console.log('\u2713 CONFIRM button clicked');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step VI.7 - CONFIRM clicked');
    });

    // ==============================================================
    // VII. VERIFICATION POINTS
    // ==============================================================

    await test.step('VII.1: Open Contact#1 and verify Salesperson = selected_Re-assignment_to#1', async () => {
      console.log('\n=== VII. VERIFICATION POINTS ===');
      console.log('VII.1: Opening Contact#1 in new tab');
      const contactTab = await page.context().newPage();
      const contactPageVerify = new ContactPage(contactTab);
      await contactPageVerify.goto(url_Contact1, { waitUntil: 'networkidle' });
      await contactPageVerify.waitForPageReady();
      await contactTab.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 VII.1: Contact#1 page opened');
      await CommonUtils.captureAndAttachScreenshot(contactTab, testInfo, 'VII.1 - Contact#1 opened');
      const actualContactSalesperson = await contactPageVerify.getSalespersonValue();
      console.log('  Contact Salesperson received         : "' + actualContactSalesperson + '"');
      console.log('  Expected (selected_Re-assignment_to#1) : "' + selectedReAssignmentTo1 + '"');
      expect(actualContactSalesperson).toBe(selectedReAssignmentTo1);
      console.log('\u2713 VII.1: Contact Salesperson = "' + selectedReAssignmentTo1 + '" - verified');
      await CommonUtils.captureAndAttachScreenshot(contactTab, testInfo, 'VII.1 - Contact Salesperson verified');
      await contactTab.close();
    });

    await test.step('VII.2: Open Lead#1 and verify Salesperson = selected_Re-assignment_to#1', async () => {
      console.log('VII.2: Opening Lead#1 in new tab');
      const leadTab = await page.context().newPage();
      const leadPageVerify = new LeadPage(leadTab);
      await leadPageVerify.goto(url_Lead1, { waitUntil: 'networkidle' });
      await leadPageVerify.waitForPageReady();
      await leadTab.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 VII.2: Lead#1 page opened');
      await CommonUtils.captureAndAttachScreenshot(leadTab, testInfo, 'VII.2 - Lead#1 opened');
      const actualLeadSalesperson = await leadPageVerify.getSalespersonValue();
      console.log('  Lead Salesperson received            : "' + actualLeadSalesperson + '"');
      console.log('  Expected (selected_Re-assignment_to#1) : "' + selectedReAssignmentTo1 + '"');
      expect(actualLeadSalesperson).toBe(selectedReAssignmentTo1);
      console.log('\u2713 VII.2: Lead Salesperson = "' + selectedReAssignmentTo1 + '" - verified');
      await CommonUtils.captureAndAttachScreenshot(leadTab, testInfo, 'VII.2 - Lead Salesperson verified');
      await leadTab.close();
    });

    await test.step('VII.3: Open Opp#1 and verify Salesperson = selected_Re-assignment_to#1', async () => {
      console.log('VII.3: Opening Opp#1 in new tab');
      const oppTab = await page.context().newPage();
      const oppPageVerify = new LeadPage(oppTab);
      await oppPageVerify.goto(url_Opp1, { waitUntil: 'networkidle' });
      await oppPageVerify.waitForPageReady();
      await oppTab.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 VII.3: Opp#1 page opened');
      await CommonUtils.captureAndAttachScreenshot(oppTab, testInfo, 'VII.3 - Opp#1 opened');
      const actualOppSalesperson = await oppPageVerify.getSalespersonValue();
      console.log('  Opp Salesperson received             : "' + actualOppSalesperson + '"');
      console.log('  Expected (selected_Re-assignment_to#1) : "' + selectedReAssignmentTo1 + '"');
      expect(actualOppSalesperson).toBe(selectedReAssignmentTo1);
      console.log('\u2713 VII.3: Opp Salesperson = "' + selectedReAssignmentTo1 + '" - verified');
      await CommonUtils.captureAndAttachScreenshot(oppTab, testInfo, 'VII.3 - Opp Salesperson verified');
      await oppTab.close();
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-457_5.1.1.3 - Salesperson verified for Contact, Lead and Opp');
      console.log(`   Lead#1 URL    : ${url_Lead1}`);
      console.log(`   Opp#1 URL     : ${url_Opp1}`);
      console.log(`   Contact#1 URL : ${url_Contact1}`);
      console.log('   VII.1/2/3: Contact/Lead/Opp Salesperson = "Alan Osseiran" - all verified');
      console.log('   VIII : Lead#1, Opp#1 and Contact#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
