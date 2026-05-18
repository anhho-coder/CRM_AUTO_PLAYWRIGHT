import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ReAssignationPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-457 - Verify Re-assign Contacts
 * Test Case ID: CRM-457_4.1.1.2
 *
 * Summary: Verify the qualified Contacts with selecting 2 Countries have been transfered to another Salesperson correctly
 *
 * Command to run:
 * npx playwright test --grep "CRM-457_4\.1\.1\.2:" --project=chromium
 *
 * I. Condition for beforeEach:
 * 1.  Login as admin_crm and navigate to Contacts module
 * 2.  Remove "Created by Anh Ho" filter; switch to list view
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Austria
 * 5.  Filter: State = Salzburg
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip
 * 8.  Click select-all checkbox
 * 9.  Press Action menu
 * 10. Select Delete option
 * 11. Confirm deletion dialog
 * 12. Close the browser
 *
 * I. Pre-condition#1 to create Contact#1:
 * 1. Login as admin_crm and navigate to "Contacts" module
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact#1 + Test case ID + current date time millisecond
 *    - "Email" textbox = Test-company@company + current date + current time + millisecond.com
 *      (Remember the created email called Email_Contact#1)
 *      (Remember the Email domain called Domain_Email_Contact#1: [@company + current date + current time + millisecond.com])
 *    - Country dropdown list = Austria
 *    - State dropdown list = Salzburg
 *    - "Sales Team" dropdown list = BDEU
 *    - "Salesperson" dropdown list = Thomas Semerich
 * 4. Press "SAVE" button and wait
 * 5. Copy URL of Contact#1, called URL_Contact#1
 * 6. Press "Application" icon on the top-right of screen to return the Home page
 *
 * II. Steps to reproduce:
 * 1. On Homepage, click at "CRM" button
 * 2. On "CRM" page:
 * 3. Press "Configuration" menu
 * 4. Then press "Re-assignation" in "Resellers" section
 * 5. Once the "Re-assignation" page appeared:
 *    5.1. Set : "Customer type"        = "Contact"
 *    5.2. Set : "Current Salesperson"  = "Thomas Semerich"
 *    5.3. Set : "Re-assignment to"     = "Alan Osseiran"
 *    5.4. Set : "Country"              = "Austria"
 *    5.5. Set : "Country"              = "France"
 *    5.6. Set : "Country state"        = "Salzburg"
 *
 * III. Verification points:
 * 1. The value at "Total" text = 0/1
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Contact has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Contact#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('CRM-457_4.1.1.2 - Verify qualified Contacts with 2 Countries transfered to another Salesperson', () => {

  let url_Contact1 = '';

  test.beforeEach(async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts['5-minutes']);

    // Create a dedicated browser context so step 12 can truly close all browsers
    const cleanupContext = await browser.newContext();
    const cleanupPage    = await cleanupContext.newPage();

    const loginPage   = new LoginPage(cleanupPage);
    const homePage    = new HomePage(cleanupPage);
    const contactPage = new ContactPage(cleanupPage);

    // beforeEach Step 1: Login as admin_crm and navigate to Contacts module
    await test.step('beforeEach Step 1: Login as admin_crm and navigate to Contacts', async () => {
      console.log('beforeEach Step 1: Logging in as admin_crm');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('✓ beforeEach Step 1: Logged in and navigated to Contacts');
    });

    // beforeEach Step 2: Remove "Created by Anh Ho" filter and switch to list view
    await test.step('beforeEach Step 2: Remove "Created by Anh Ho" filter and select View list', async () => {
      console.log('beforeEach Step 2: Removing "Created by Anh Ho" search filter');
      await contactPage.removeMyPipelineFilter();
      console.log('beforeEach Step 2: Clicking "View list" button');
      await contactPage.clickViewListButtonIfVisible();
      console.log('✓ beforeEach Step 2: Filter removed and list view selected');
    });

    // beforeEach Step 3: Filter by Salesperson = Thomas Semerich
    await test.step('beforeEach Step 3: Filter by Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach Step 3: Adding filter Salesperson = Thomas Semerich');
      await contactPage.clickFilterButton();
      await contactPage.clickAddCustomFilter();
      await contactPage.selectCustomFilterField('Salesperson');
      await contactPage.selectCustomFilterOperator('is equal to');
      await contactPage.selectCustomFilterValue('Thomas Semerich');
      await contactPage.clickApplyFilter();
      await contactPage.clickFilterButton();
      console.log('✓ beforeEach Step 3: Salesperson filter applied');
    });

    // beforeEach Step 4: Filter by Country = Austria
    await test.step('beforeEach Step 4: Filter by Country = Austria', async () => {
      console.log('beforeEach Step 4: Adding filter Country = Austria');
      await contactPage.clickFilterButton();
      await contactPage.clickAddCustomFilter();
      await contactPage.selectCustomFilterField('Country');
      await contactPage.selectCustomFilterOperator('is equal to');
      await contactPage.selectCustomFilterValue('Austria');
      await contactPage.clickApplyFilter();
      await contactPage.clickFilterButton();
      console.log('✓ beforeEach Step 4: Country filter applied');
    });

    // beforeEach Step 5: Filter by State = Salzburg
    await test.step('beforeEach Step 5: Filter by State = Salzburg', async () => {
      console.log('beforeEach Step 5: Adding filter State = Salzburg');
      await contactPage.clickFilterButton();
      await contactPage.clickAddCustomFilter();
      await contactPage.selectCustomFilterField('State');
      await contactPage.selectCustomFilterOperator('is equal to');
      await contactPage.selectCustomFilterValue('Salzburg');
      await contactPage.clickApplyFilter();
      await contactPage.clickFilterButton();
      console.log('✓ beforeEach Step 5: State filter applied');
    });

    // beforeEach Step 6: Filter by Active = is true
    await test.step('beforeEach Step 6: Filter by Active = is true', async () => {
      console.log('beforeEach Step 6: Adding filter Active = is true');
      await contactPage.clickFilterButton();
      await contactPage.clickAddCustomFilter();
      await contactPage.selectCustomFilterField('Active');
      await contactPage.selectCustomFilterOperator('is true');
      await contactPage.clickApplyFilter();
      await contactPage.clickFilterButton();
      console.log('✓ beforeEach Step 6: Active filter applied');
    });

    // beforeEach Step 7: Check if any qualified items exist; skip cleanup if none
    await test.step('beforeEach Step 7: Check if list has records', async () => {
      console.log('beforeEach Step 7: Checking if any qualified contacts exist...');
      const isEmpty = await contactPage.isRecordListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach Step 7: No qualified contacts found - skipping delete steps');
        return;
      }
      console.log('  ⚠ Qualified contacts found - proceeding to delete');

      // beforeEach Step 8: Click the header "select all" checkbox
      await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
        console.log('beforeEach Step 8: Clicking select-all checkbox');
        await contactPage.clickSelectAllCheckbox();
        console.log('✓ beforeEach Step 8: All records selected');
      });

      // beforeEach Step 9: Press Action menu
      await test.step('beforeEach Step 9: Press Action menu', async () => {
        console.log('beforeEach Step 9: Opening Action menu');
        await contactPage.clickListActionMenu();
        console.log('✓ beforeEach Step 9: Action menu opened');
      });

      // beforeEach Step 10: Select Delete option
      await test.step('beforeEach Step 10: Select Delete option', async () => {
        console.log('beforeEach Step 10: Clicking Delete option');
        await contactPage.clickListActionDelete();
        console.log('✓ beforeEach Step 10: Delete option selected');
      });

      // beforeEach Step 11: Confirm deletion
      await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
        console.log('beforeEach Step 11: Clicking OK on confirmation dialog');
        await contactPage.confirmDeleteDialog();
        console.log('✓ beforeEach Step 11: Records deleted successfully');
      });
    });

    // beforeEach Step 12: Close all browsers (closes the entire cleanup context)
    // Save video reference BEFORE closing — the file is finalised on context.close()
    const cleanupVideo = cleanupPage.video();
    await test.step('beforeEach Step 12: Close all browsers', async () => {
      console.log('beforeEach Step 12: Closing cleanup browser context');
      await cleanupContext.close();
      console.log('✓ beforeEach Step 12: All cleanup browsers closed - test will start a fresh session');
    });

    // Attach cleanup video with a meaningful name in the report
    if (cleanupVideo) {
      await testInfo.attach(`${testInfo.title} - beforeEach cleanup`, {
        path: await cleanupVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(2000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }

    // Save video reference BEFORE closing pages — the file is finalised on page.close()
    const mainVideo = page.video();

    // ==============================================================
    // IV. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    if (url_Contact1) {
      await test.step('IV. TEAR DOWN: Clean up test data', async () => {
        console.log('\n=== IV. TEAR DOWN ===');
        await test.step('IV.1: Delete Contact#1', async () => {
          await CommonUtils.deleteRecordByUrl(page, url_Contact1, testInfo);
        });
        url_Contact1 = '';
      });
    }

    // IV.2: Always close all pages (also finalises the main test video)
    await test.step('IV.2: Close all browsers', async () => {
      const allPages = page.context().pages();
      for (const p of allPages) { if (!p.isClosed()) await p.close(); }
      console.log('✓ IV.2: All browsers closed');
    });

    // Attach main test video with the test title as the label in the report
    if (mainVideo) {
      await testInfo.attach(testInfo.title, {
        path: await mainVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test('CRM-457_4.1.1.2: Verify the qualified Contacts with 2 Countries have been transfered to another Salesperson correctly', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage         = new LoginPage(page);
    const homePage          = new HomePage(page);
    const opportunityPage   = new OpportunityPage(page);
    const reAssignationPage = new ReAssignationPage(page);
    const contactPage       = new ContactPage(page);

    const tcId = 'CRM-457_4.1.1.2';

    let contact1Name   = '';
    let contact1Email  = '';
    let contact1Domain = '';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID: ${tcId}`);

    // ==============================================================
    // I. PRE-CONDITION: Create Contact#1
    // ==============================================================

    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to Contacts', async () => {
      console.log(`\n=== I. PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to Contacts module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - Contacts page');
    });

    await test.step('Pre-condition Step 2: Click CREATE button and wait', async () => {
      console.log('Step 2: Clicking CREATE button');
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ Contact creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Contact creation form');
    });

    await test.step('Pre-condition Step 3: Fill Contact#1 information', async () => {
      console.log('Step 3: Filling Contact#1 fields');

      const timestamp  = CommonUtils.generateTimestamp();
      contact1Name     = `TEST-Contact#1_${tcId}_${timestamp}`;
      contact1Email    = `Test-company@company${timestamp}.com`;
      contact1Domain   = `@company${timestamp}.com`;

      console.log(`  3.1: Company checkbox = TRUE`);
      await contactPage.checkCompanyCheckbox();

      console.log(`  3.2: Contact Name = "${contact1Name}"`);
      await contactPage.fillContactName(contact1Name);

      console.log(`  3.3: Email = "${contact1Email}" (Email_Contact#1)`);
      await contactPage.fillEmail(contact1Email);

      console.log(`  3.4: Country = "Austria"`);
      await contactPage.selectCountry('Austria');

      console.log(`  3.5: State = "Salzburg"`);
      await contactPage.selectState('Salzburg');

      console.log(`  3.6: Sales Team = "BDEU"`);
      await contactPage.selectSalesTeam('BDEU');

      console.log(`  3.7: Salesperson = "Thomas Semerich"`);
      await contactPage.selectSalesperson('Thomas Semerich');

      console.log('✓ All Contact#1 fields filled');
      console.log(`  Email_Contact#1          : ${contact1Email}`);
      console.log(`  Domain_Email_Contact#1   : ${contact1Domain}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - Contact#1 fields filled');
    });

    await test.step('Pre-condition Step 4: Press SAVE button and wait', async () => {
      console.log('Step 4: Saving Contact#1');
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Contact#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Contact#1 saved');
    });

    await test.step('Pre-condition Step 5: Copy URL of Contact#1', async () => {
      console.log('Step 5: Waiting for saved-record URL (with numeric id)...');
      await page.waitForFunction(
        () => /[#&]id=\d+/.test(window.location.href),
        { timeout: config.timeouts.test }
      );
      url_Contact1 = page.url();
      console.log(`✓ URL_Contact#1 captured: ${url_Contact1}`);
    });

    await test.step('Pre-condition Step 6: Press Application icon to return to Home page', async () => {
      console.log('Step 6: Clicking Application icon');
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
      console.log('Step II.1: Navigating to CRM');
      await homePage.navigateToCRM();
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

      console.log('  5.1: Customer type = "Contact"');
      await reAssignationPage.selectCustomerType('Contact');

      console.log('  5.2: Current Salesperson = "Thomas Semerich"');
      await reAssignationPage.selectCurrentSalesperson('Thomas Semerich');

      console.log('  5.3: Re-assignment to = "Alan Osseiran"');
      await reAssignationPage.selectReAssignmentTo('Alan Osseiran');

      console.log('  5.4: Country = "Austria"');
      await reAssignationPage.selectCountry('Austria');

      console.log('  5.5: Country = "France"');
      await reAssignationPage.selectCountry('France');

      console.log('  5.6: Country state = "Salzburg"');
      await reAssignationPage.selectCountryState('Salzburg');

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

      console.log('✓ III.1: Total text = "0/1" - qualified Contact correctly counted for re-assignment');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Total 0-1 verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-457_4.1.1.2 verification completed successfully');
      console.log(`   Contact#1 URL  : ${url_Contact1}`);
      console.log(`   Contact#1 Name : ${contact1Name}`);
      console.log(`   Email_Contact#1: ${contact1Email}`);
      console.log('   III.1: Total = "0/1" - qualified Contact correctly counted for re-assignment');
      console.log('   IV   : Contact#1 will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
