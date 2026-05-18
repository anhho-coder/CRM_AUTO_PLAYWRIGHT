import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Summary: Before each - Delete all Contacts by Country = Austria
 *
 * Command to run:
 * npx playwright test tests/demo_test/tc-before-each_delete_all_Contacts_from_Austria.spec.ts --project=chromium
 *
 * I. Condition for beforeEach:
 * 1. Login as admin_crm, navigate to "Contacts" module and wait
 * 2. On "Contacts" page do the following:
 *    - At "Search" textbox, remove "Created by Anh Ho"
 *    - Select "View list" button at right corner
 * 3. Find the "Salesperson" = "Thomas Semerich" by doing the steps:
 *    - Press "Filter" dropdown list
 *    - Then press "Add Customer Filter"
 *    - On Dropdown_List#1, select "Salesperson"
 *    - On Dropdown_List#2, select "is equal to"
 *    - On Dropdown_List#3, select "Thomas Semerich"
 *    - Press "APPLY" button
 *    - Press "Filter" dropdown list again to exit "Filter" mode
 * 4. Find the "Country" = "Austria" by doing the steps:
 *    - Press "Filter" dropdown list
 *    - Then press "Add Customer Filter"
 *    - On Dropdown_List#1, select "Country"
 *    - On Dropdown_List#2, select "is equal to"
 *    - On Dropdown_List#3, select "Austria"
 *    - Press "APPLY" button
 *    - Press "Filter" dropdown list again to exit "Filter" mode
 * 5. Find the "State" = "Salzburg" by doing the steps:
 *    - Press "Filter" dropdown list
 *    - Then press "Add Customer Filter"
 *    - On Dropdown_List#1, select "State"
 *    - On Dropdown_List#2, select "is equal to"
 *    - On Dropdown_List#3, select "Salzburg"
 *    - Press "APPLY" button
 *    - Press "Filter" dropdown list again to exit "Filter" mode
 * 6. Find the "Active" = "is true" by doing the steps:
 *    - Press "Filter" dropdown list
 *    - Then press "Add Customer Filter"
 *    - On Dropdown_List#1, select "Active"
 *    - On Dropdown_List#2, select "is true"
 *    - Press "APPLY" button
 *    - Press "Filter" dropdown list again to exit "Filter" mode
 * 7. If there is no qualified items show ("Create an opportunity in your pipeline" screen appears) skip the next steps. Else do the next steps:
 * 8. Click at the "Checkbox" on the top of table
 * 9. Press "Action" on the menu
 * 10. Select "Delete" option
 * 11. Press "OK" button on "Are you sure you want to delete this record?" window and wait
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
 *    (URL_Contact#1 is captured automatically after save)
 * 5. Press "Application" icon on the top-right of screen to return the Home page
 *
 * IV. Tear down (Clean up test data):
 * 1. Delete Contact has just created by doing the following steps:
 *    1.1. Open new tab then launch the URL_Contact#1
 *    1.2. Select "Action" dropdown list on header of page
 *    1.3. Select "Delete" option
 *    1.4. Press "OK" button on "Are you sure you want to delete this record?" window and wait
 * 2. Close all browsers
 */

test.describe('Before each - Delete all Contacts by Country = Austria', () => {

  let url_Contact1 = '';

  test.beforeEach(async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts['5-minutes']);

    // Create a dedicated browser context so step 12 can truly close all browsers
    const cleanupContext = await browser.newContext();
    const cleanupPage    = await cleanupContext.newPage();

    const loginPage   = new LoginPage(cleanupPage);
    const homePage    = new HomePage(cleanupPage);
    const contactPage = new ContactPage(cleanupPage);

    // Step 1: Login as admin_crm and navigate to Contacts module
    await test.step('beforeEach Step 1: Login as admin_crm and navigate to Contacts', async () => {
      console.log('beforeEach Step 1: Logging in as admin_crm');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('✓ beforeEach Step 1: Logged in and navigated to Contacts');
    });

    // Step 2: Remove "Created by Anh Ho" filter and switch to list view
    await test.step('beforeEach Step 2: Remove "Created by Anh Ho" filter and select View list', async () => {
      console.log('beforeEach Step 2: Removing "Created by Anh Ho" search filter');
      await contactPage.removeMyPipelineFilter();
      console.log('beforeEach Step 2: Clicking "View list" button');
      await contactPage.clickViewListButtonIfVisible();
      console.log('✓ beforeEach Step 2: Filter removed and list view selected');
    });

    // Step 3: Filter by Salesperson = Thomas Semerich
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

    // Step 4: Filter by Country = Austria
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

    // Step 5: Filter by State = Salzburg
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

    // Step 6: Filter by Active = is true
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

    // Step 7: Check if any qualified items exist; skip cleanup if none
    await test.step('beforeEach Step 7: Check if list has records', async () => {
      console.log('beforeEach Step 7: Checking if any qualified contacts exist...');
      const isEmpty = await contactPage.isRecordListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach Step 7: No qualified contacts found - skipping delete steps');
        return;
      }
      console.log('  ⚠ Qualified contacts found - proceeding to delete');

      // Step 8: Click the header "select all" checkbox
      await test.step('beforeEach Step 8: Click select-all checkbox', async () => {
        console.log('beforeEach Step 8: Clicking select-all checkbox');
        await contactPage.clickSelectAllCheckbox();
        console.log('✓ beforeEach Step 8: All records selected');
      });

      // Step 9: Press Action menu
      await test.step('beforeEach Step 9: Press Action menu', async () => {
        console.log('beforeEach Step 9: Opening Action menu');
        await contactPage.clickListActionMenu();
        console.log('✓ beforeEach Step 9: Action menu opened');
      });

      // Step 10: Select Delete option
      await test.step('beforeEach Step 10: Select Delete option', async () => {
        console.log('beforeEach Step 10: Clicking Delete option');
        await contactPage.clickListActionDelete();
        console.log('✓ beforeEach Step 10: Delete option selected');
      });

      // Step 11: Confirm deletion
      await test.step('beforeEach Step 11: Confirm deletion dialog', async () => {
        console.log('beforeEach Step 11: Clicking OK on confirmation dialog');
        await contactPage.confirmDeleteDialog();
        console.log('✓ beforeEach Step 11: Records deleted successfully');
      });
    });

    // Step 12: Close all browsers (closes the entire cleanup context)
    const cleanupVideo = cleanupPage.video();
    await test.step('beforeEach Step 12: Close all browsers', async () => {
      console.log('beforeEach Step 12: Closing cleanup browser context');
      await cleanupContext.close();
      console.log('✓ beforeEach Step 12: All cleanup browsers closed');
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

    // Attach main test video with a meaningful label in the report
    if (mainVideo) {
      await testInfo.attach('II. Steps to reproduce + III. Verification points', {
        path: await mainVideo.path(),
        contentType: 'video/webm',
      });
    }
  });

  test('Pre-condition#1: Create Contact#1 (Company, Austria, Salzburg, BDEU, Thomas Semerich)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage   = new LoginPage(page);
    const homePage    = new HomePage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'Before-each-Delete-Austria';

    let contact1Name  = '';
    let contact1Email  = '';
    let contact1Domain = '';

    // Pre-condition Step 1: Login as admin_crm and navigate to Contacts
    await test.step('Pre-condition Step 1: Login as admin_crm and navigate to Contacts', async () => {
      console.log(`\n=== PRE-CONDITION STEP 1 ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();

      console.log('✓ Navigated to Contacts module');
    });

    // Pre-condition Step 2: Click CREATE button
    await test.step('Pre-condition Step 2: Click CREATE button and wait', async () => {
      console.log('=== PRE-CONDITION STEP 2: CLICK CREATE BUTTON ===');

      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      console.log('✓ Contact creation form opened');
    });

    // Pre-condition Step 3: Fill Contact#1 information
    await test.step('Pre-condition Step 3: Fill Contact#1 information', async () => {
      console.log('=== PRE-CONDITION STEP 3: FILL CONTACT #1 INFORMATION ===');

      const timestamp = CommonUtils.generateTimestamp();
      contact1Name   = `TEST-Contact#1_${tcId}_${timestamp}`;
      contact1Email  = `Test-company@company${timestamp}.com`;
      contact1Domain = `@company${timestamp}.com`;

      console.log(`  - Company checkbox         : TRUE`);
      console.log(`  - Contact Name             : ${contact1Name}`);
      console.log(`  - Email (Email_Contact#1)  : ${contact1Email}`);
      console.log(`  - Domain (Domain_Email_Contact#1): ${contact1Domain}`);
      console.log(`  - Country                  : Austria`);
      console.log(`  - State                    : Salzburg`);
      console.log(`  - Sales Team               : BDEU`);
      console.log(`  - Salesperson              : Thomas Semerich`);

      // Set Company checkbox = TRUE
      await contactPage.checkCompanyCheckbox();

      // Fill Contact Name
      await contactPage.fillContactName(contact1Name);

      // Fill Email
      await contactPage.fillEmail(contact1Email);

      // Select Country = Austria
      await contactPage.selectCountry('Austria');

      // Select State = Salzburg
      await contactPage.selectState('Salzburg');

      // Select Sales Team = BDEU
      await contactPage.selectSalesTeam('BDEU');

      // Select Salesperson = Thomas Semerich
      await contactPage.selectSalesperson('Thomas Semerich');

      console.log('✓ Pre-condition Step 3: All Contact#1 fields filled');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 3 - Contact#1 form filled');
    });

    // Pre-condition Step 4: Press SAVE button and wait; capture URL_Contact#1
    await test.step('Pre-condition Step 4: Press SAVE button and wait', async () => {
      console.log('=== PRE-CONDITION STEP 4: SAVE CONTACT #1 ===');

      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log(`✓ Contact#1 saved successfully`);
      console.log(`  Contact Name        : ${contact1Name}`);
      console.log(`  Email_Contact#1     : ${contact1Email}`);
      console.log(`  Domain_Email_Contact#1: ${contact1Domain}`);

      await page.waitForFunction(
        () => /[#&]id=\d+/.test(window.location.href),
        { timeout: config.timeouts.test }
      );
      url_Contact1 = page.url();
      console.log(`✓ URL_Contact#1 captured: ${url_Contact1}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 4 - Contact#1 saved');
    });

    // Pre-condition Step 5: Press Application icon to return Home
    await test.step('Pre-condition Step 5: Press Application icon to return Home page', async () => {
      console.log('=== PRE-CONDITION STEP 5: RETURN TO HOME ===');

      await homePage.returnToHome();

      console.log('✓ Returned to Home page');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition Step 5 - Returned to Home');
    });

    console.log('\n✅ PRE-CONDITION COMPLETED SUCCESSFULLY');
    console.log(`   URL_Contact#1   : ${url_Contact1}`);
    console.log(`   Contact#1 Name  : ${contact1Name}`);
    console.log(`   Email_Contact#1 : ${contact1Email}`);
    console.log(`   Domain_Contact#1: ${contact1Domain}`);
    console.log('==================================================\n');
  });
});
