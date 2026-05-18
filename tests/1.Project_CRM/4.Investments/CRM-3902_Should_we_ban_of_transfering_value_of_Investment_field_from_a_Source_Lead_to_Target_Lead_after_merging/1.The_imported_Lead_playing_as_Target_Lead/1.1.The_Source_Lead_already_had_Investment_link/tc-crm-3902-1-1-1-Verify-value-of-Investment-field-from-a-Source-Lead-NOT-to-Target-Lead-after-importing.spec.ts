import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';

/**
 * Investments - Verify value of "Investment" field from a Source Lead to Target Lead
 * Test Case ID: CRM-3902_1.1.1
 *
 * Summary: Verify the value of "Investment" field from a Source Lead NOT to Target Lead
 *          after importing new audience using csv file
 *
 * Command to run:
 * npx playwright test --grep "CRM-3902_1\.1\.1:" --project=chromium
 *
 * Pre-condition #1:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox = TEST Investment + current date time
 *      (Remember the created name, called Name_Investment#1)
 *    - "Investment ID" textbox = TEST-Investment-current date time
 *    - "Type" combobox = Webinar
 *    - "Channel" combobox = Channel (search name of CMR in channel field)
 *    - "Countries" combobox = Albania
 *    - "Date start" date = current date
 *    - "Date end" date = current date
 *    - "Responsible - Sales" combobox = Aleksey Galbur
 *    - "Responsible - Marketing" combobox = Nadiia Suprun
 *    - "NBR Product List" combobox = M365
 *    - "Completion Events" combobox = Attended webinar
 *    - "Conversion Events" combobox = Download free trial
 *    - "Track conversion date start" date = current date
 *    - "Track conversion date end" date = current date + 6 months
 * 5. Create an Import Audience file by doing the following:
 *    5.1. Create the test data with the following information:
 *         - "Contact Name" = TEST_TARGET_name + current date time (Name_Contact#1)
 *         - "Email" = Test@company + current date + current time.com (Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *           (Remember the created name, called Name_Company_Contact#1)
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = test
 *    5.2. Use the template CSV file "CSV-AudienceTemplate-1.csv" in folder "CRM_AUTO\test-data\investment-module"
 *    5.3. Create another CSV file (named CSV-Audience-copy1) and put the data at Step#1 to respective columns:
 *         - "Contact Name" = TEST_TARGET_name + current date time
 *         - "Email" = Test@company + current date + current time.com (Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *           (Remember the created name, called Name_Company_Contact#1)
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = Test
 *         - "Create manually" = FALSE
 *    5.4. Save the file in folder "CRM_AUTO\test-data\investment-module"
 *
 * Steps to reproduce #1:
 * 1. On Investment page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 * 4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 * 5. Select CSV-Audience-copy1 file and wait
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Copy the current URL called, URL_Investment#1
 * 9. Press "Application" button to back to Home page
 *
 * Pre-condition #2:
 * 1. On "Home" page, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox = TEST Investment 2 + current date time
 *      (Remember the created name, called Name_Investment#2)
 *    - "Investment ID" textbox = TEST-Investment-current date time
 *    - "Type" combobox = Webinar
 *    - "Channel" combobox = Channel (search name of CMR in channel field)
 *    - "Countries" combobox = Albania
 *    - "Date start" date = current date
 *    - "Date end" date = current date
 *    - "Responsible - Sales" combobox = Aleksey Galbur
 *    - "Responsible - Marketing" combobox = Nadiia Suprun
 *    - "NBR Product List" combobox = M365
 *    - "Completion Events" combobox = Attended webinar
 *    - "Conversion Events" combobox = Download free trial
 *    - "Track conversion date start" date = current date
 *    - "Track conversion date end" date = current date + 6 months
 * 5. Create an Import Audience file by doing the following:
 *    5.1. Create the test data with the following information:
 *         - "Contact Name" = TEST_SOURCE + current date time (Name_Contact#2)
 *         - "Email" = use the Email_Contact#1 created before
 *         - "Company" = TEST_company_name + current date time
 *           (Remember the created name, called Name_Company_Contact#2)
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *    5.2. Use the template CSV file "CSV-AudienceTemplate-1.csv" in folder "CRM_AUTO\test-data\investment-module"
 *    5.3. Create another CSV file (named CSV-Audience-copy2) and put the data at Step#1 to respective columns:
 *         - "Contact Name" = TEST_SOURCE + current date time
 *         - "Email" = use the Email_Contact#1 created before
 *         - "Company" = TEST_company_name + current date time
 *           (Remember the created name, called Name_Company_Contact#2)
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = Test
 *         - "Create manually" = FALSE
 *    5.4. Save the file in folder "CRM_AUTO\test-data\investment-module"
 *
 * Steps to reproduce #2:
 * 1. On Investment page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 * 4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 * 5. Select CSV-Audience-copy2 file and wait
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Copy the current URL called, URL_Investment#2
 * 9. Press "Application" button to back to Home page
 *
 * II. Verify point - Target Opp:
 * 1. Click at "CRM" button and wait for Lead Merging
 * 2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item
 * 3. The "All Leads" page appears
 * 4. On "Search" textbox, enter value of Email_Contact#1 then enter to start to search
 * 5. On "Opp" page, click at the line of "Opportunity" = value of "Name_Contact#1" and wait
 * 6. Verify the following:
 *    6.1. Tag field contains 1 value: "Test"
 *    6.2. Company Name textbox = Name_Company_Contact#1
 *    6.3. Country dropdown list = China
 *    6.4. Sales Team dropdown list = CMR
 *    6.5. Email textbox = Email_Contact#1 that created previously
 * 7. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    7.1. Lead form textbox = the template of "Investment: ID-[InvestmentID]" where [InvestmentID] is
 *         getting the number in ID of URL_Investment#1 above
 *    7.2. Active checkbox = TRUE
 *    7.3. Is Won = Pending
 *    7.4. Lost Reason = BLANK
 * 8. On the Log area, verify the following:
 *    8.1. There is the text as "[Opp 2], has been merged into this lead."
 *         where [Opp 2] is Name_Contact#2 created previously
 * 9. Press "Application" button to back to Home page
 *
 * III. Verify point - Source Opp:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item
 * 3. The "All Leads" page appears
 * 4. On "Search" textbox, enter value of Email_Contact#2 then enter to start to search
 * 5. On "Opp" page, click at the line of "Opportunity" = value of "Name_Contact#2" and wait
 * 6. Verify the following:
 *    6.1. Tag field contains 1 value: "Test"
 *    6.2. Company Name textbox = Name_Company_Contact#2
 *    6.3. Country dropdown list = China
 *    6.4. Sales Team dropdown list = CMR
 *    6.5. Email textbox = Email_Contact#1 that created previously
 * 7. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    7.1. Lead form textbox = the template of "Investment: ID-[InvestmentID]" where [InvestmentID] is
 *         getting the number in ID of URL_Investment#2 above
 *    7.2. Active checkbox = FALSE
 *    7.3. Is Won = Lost
 *    7.4. Lost Reason = Duplicate
 * 8. On the Log area, verify the following:
 *    8.1. There is the text as "This lead has been merged into [Opp 1]."
 *         where [Opp 1] is Opp Name of Name_Contact#1 created previously
 * 9. Press "Application" button to back to Home page
 *
 * Tear down (Clean up test data):
 * 1. Launch URL_Investment#1 and delete Investment item has just created by doing the following steps:
 *    1.1. Select "Action" dropdown list on header of page
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" button on "Are you sure you want to delete this record?" window
 * 2. Delete CSV file (CSV-Audience-copy1) has just created
 * 3. Launch URL_Investment#2 and delete Investment item has just created by doing the following steps:
 *    3.1. Select "Action" dropdown list on header of page
 *    3.2. Select "Delete" option
 *    3.3. Press "OK" button on "Are you sure you want to delete this record?" window
 * 4. Delete CSV file (CSV-Audience-copy2) has just created
 */

test.describe('CRM-3902_1.1.1 - Verify value of Investment field from Source Lead NOT to Target Lead after importing', () => {

  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();

    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);

    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');

      // Wait for any loading spinners to disappear
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');

      // Wait for all spinners to hide
      await page.waitForTimeout(3000);

      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }

      // Additional wait for page to fully stabilize
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('CRM-3902_1.1.1: Verify value of Investment field from Source Lead NOT to Target Lead after importing', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDate = `${mm}/${dd}/${yyyy}`;

    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const smYYYY = sixMonthsLater.getFullYear();
    const smMM = String(sixMonthsLater.getMonth() + 1).padStart(2, '0');
    const smDD = String(sixMonthsLater.getDate()).padStart(2, '0');
    const dateEndPlus6Months = `${smMM}/${smDD}/${smYYYY}`;

    const timestamp = CommonUtils.generateTimestamp();
    const investmentName1 = `TEST Investment ${timestamp}`;
    const investmentID1   = `TEST-Investment-${timestamp}`;
    const investmentName2 = `TEST Investment 2 ${CommonUtils.generateTimestamp()}`;
    const investmentID2   = `TEST-Investment-2-${CommonUtils.generateTimestamp()}`;

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    // Track file paths for tear down
    let csvCopy1Path = '';
    let csvCopy2Path = '';
    let urlInvestment1 = '';
    let urlInvestment2 = '';
    let investmentId1OnURL = '';
    let investmentId2OnURL = '';

    // ============================================================
    // PRE-CONDITION #1
    // ============================================================

    // Pre-condition #1 Step 1: Login and navigate to Investments
    await test.step('Pre-condition #1 Step 1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION #1 ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investments module');
    });

    // Pre-condition #1 Step 2: Navigate to Investment menu item
    await test.step('Pre-condition #1 Step 2: Navigate to Investment', async () => {
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    // Pre-condition #1 Step 3: Press CREATE button
    await test.step('Pre-condition #1 Step 3: Press CREATE button', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Pre-condition #1 Step 4: Create blank Investment#1
    await test.step('Pre-condition #1 Step 4: Create blank Investment#1 (Name_Investment#1)', async () => {
      console.log('=== PRE-CONDITION #1 STEP 4: CREATE INVESTMENT#1 ===');

      await investmentPage.createBlankInvestment({
        investmentName: investmentName1,
        investmentID: investmentID1,
        type: 'Webinar',
        channel: 'Channel',
        countries: 'Albania',
        dateStart: currentDate,
        dateEnd: currentDate,
        responsibleSales: 'Aleksey Galbur',
        responsibleMarketing: 'Nadiia Suprun',
        nbrProductList: 'M365',
        completionEvents: 'Attended webinar',
        conversionEvents: 'Download free trial',
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });

      console.log(`✓ Investment#1 created: ${investmentName1}`);
    });

    // Pre-condition #1 Step 5: Create CSV-Audience-copy1 (TARGET contact, createManually=FALSE)
    let csvData1 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;
    let csvData2 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Pre-condition #1 Step 5: Create CSV-Audience-copy1 (TARGET contact, createManually=FALSE)', async () => {
      console.log('=== PRE-CONDITION #1 STEP 5: CREATE CSV-AUDIENCE-COPY1 ===');

      csvData1 = await investmentPage.createImportAudienceFile({
        contactName:    `TEST_TARGET_name_${timestamp}`,
        company:        `TEST_company_name_${timestamp}`,
        tags:           'Test',
        createManually: 'FALSE',
        outputFileName: 'CSV-Audience-copy1.csv',
      });
      csvCopy1Path = csvData1.outputPath;

      expect(fs.existsSync(csvCopy1Path), `CSV-Audience-copy1 not found at: ${csvCopy1Path}`).toBeTruthy();

      console.log('  ✓ CSV-Audience-copy1 created');
      console.log(`  ✓ Name_Contact#1    : ${csvData1.contactName}`);
      console.log(`  ✓ Email_Contact#1   : ${csvData1.emailContact1}  (will be reused in copy2)`);
      console.log(`  ✓ Create manually   : FALSE`);
    });

    console.log('\n✅ PRE-CONDITION #1 SETUP COMPLETED');

    // Steps to reproduce #1 — Step 1: Edit Investment#1
    await test.step('Steps #1 - Step 1: Press "EDIT" button on Investment#1', async () => {
      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');
    });

    // Steps to reproduce #1 — Step 2: Click Audience tab
    await test.step('Steps #1 - Step 2: Click "Audience" tab', async () => {
      await investmentPage.clickAudienceTab();
      console.log('✓ Audience tab clicked');
    });

    // Steps to reproduce #1 — Steps 3-5: Upload CSV-Audience-copy1
    await test.step('Steps #1 - Step 3-5: Upload CSV-Audience-copy1', async () => {
      await investmentPage.uploadAudienceCSV(csvCopy1Path);
      console.log(`✓ CSV-Audience-copy1 uploaded: ${csvCopy1Path}`);
    });

    // Steps to reproduce #1 — Step 6: Import
    await test.step('Steps #1 - Step 6: Press "IMPORT" button', async () => {
      await investmentPage.clickImportButton();
      console.log('✓ Import completed');
    });

    // Steps to reproduce #1 — Step 7: Save
    await test.step('Steps #1 - Step 7: Press "SAVE" button', async () => {
      await investmentPage.clickSaveButton();
      console.log('✓ Save triggered');
    });

    // Steps to reproduce #1 — Step 8: Copy URL
    await test.step('Steps #1 - Step 8: Copy current URL as URL_Investment#1', async () => {
      urlInvestment1 = page.url();
      const investmentId1Match = urlInvestment1.match(/[?&#]id=(\d+)/);
      investmentId1OnURL = investmentId1Match ? investmentId1Match[1] : '';
      console.log(`✓ URL_Investment#1: ${urlInvestment1}`);
      console.log(`✓ Investment ID#1: ${investmentId1OnURL}`);
    });

    // Steps to reproduce #1 — Step 9: Navigate back to Home
    await test.step('Steps #1 - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ STEPS TO REPRODUCE #1 COMPLETED');

    // ============================================================
    // PRE-CONDITION #2
    // ============================================================

    await test.step('Pre-condition #2 Step 1: Click "Investments" button on Home page', async () => {
      console.log('\n=== PRE-CONDITION #2 ===');
      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to Investments module');
    });

    await test.step('Pre-condition #2 Step 2: Navigate to Investment', async () => {
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    await test.step('Pre-condition #2 Step 3: Press CREATE button', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    await test.step('Pre-condition #2 Step 4: Create blank Investment#2 (Name_Investment#2)', async () => {
      console.log('=== PRE-CONDITION #2 STEP 4: CREATE INVESTMENT#2 ===');

      await investmentPage.createBlankInvestment({
        investmentName: investmentName2,
        investmentID: investmentID2,
        type: 'Webinar',
        channel: 'Channel',
        countries: 'Albania',
        dateStart: currentDate,
        dateEnd: currentDate,
        responsibleSales: 'Aleksey Galbur',
        responsibleMarketing: 'Nadiia Suprun',
        nbrProductList: 'M365',
        completionEvents: 'Attended webinar',
        conversionEvents: 'Download free trial',
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });

      console.log(`✓ Investment#2 created: ${investmentName2}`);
    });

    await test.step('Pre-condition #2 Step 5: Create CSV-Audience-copy2 (SOURCE contact, reuses Email_Contact#1)', async () => {
      console.log('=== PRE-CONDITION #2 STEP 5: CREATE CSV-AUDIENCE-COPY2 ===');

      const timestamp2 = CommonUtils.generateTimestamp();
      csvData2 = await investmentPage.createImportAudienceFile({
        contactName:    `TEST_SOURCE_${timestamp2}`,
        company:        `TEST_company_name_${timestamp2}`,
        email:          csvData1.emailContact1,
        tags:           'Test',
        createManually: 'FALSE',
        outputFileName: 'CSV-Audience-copy2.csv',
      });
      csvCopy2Path = csvData2.outputPath;

      expect(fs.existsSync(csvCopy2Path), `CSV-Audience-copy2 not found at: ${csvCopy2Path}`).toBeTruthy();

      console.log('  ✓ CSV-Audience-copy2 created');
      console.log(`  ✓ Name_Contact#2  : ${csvData2.contactName}`);
      console.log(`  ✓ Email (reused)  : ${csvData2.emailContact1}`);
      console.log('  ✓ Tags            : Test');
      console.log('  ✓ Create manually : FALSE');
    });

    console.log('\n✅ PRE-CONDITION #2 SETUP COMPLETED');

    // ============================================================
    // STEPS TO REPRODUCE #2
    // ============================================================

    await test.step('Steps #2 - Step 1: Press "EDIT" button on Investment#2', async () => {
      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');
    });

    await test.step('Steps #2 - Step 2: Click "Audience" tab', async () => {
      await investmentPage.clickAudienceTab();
      console.log('✓ Audience tab clicked');
    });

    await test.step('Steps #2 - Steps 3-5: Upload CSV-Audience-copy2', async () => {
      await investmentPage.uploadAudienceCSV(csvCopy2Path);
      console.log(`✓ CSV-Audience-copy2 uploaded: ${csvCopy2Path}`);
    });

    await test.step('Steps #2 - Step 6: Press "IMPORT" button', async () => {
      await investmentPage.clickImportButton();
      console.log('✓ Import completed');
    });

    await test.step('Steps #2 - Step 7: Press "SAVE" button', async () => {
      await investmentPage.clickSaveButton();
      console.log('✓ Save triggered');
    });

    await test.step('Steps #2 - Step 8: Copy current URL as URL_Investment#2', async () => {
      urlInvestment2 = page.url();
      const investmentId2Match = urlInvestment2.match(/[?&#]id=(\d+)/);
      investmentId2OnURL = investmentId2Match ? investmentId2Match[1] : '';
      console.log(`✓ URL_Investment#2: ${urlInvestment2}`);
      console.log(`✓ Investment ID#2: ${investmentId2OnURL}`);
    });

    await test.step('Steps #2 - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ STEPS TO REPRODUCE #2 COMPLETED');

    // ============================================================
    // II. VERIFY POINT - TARGET OPP
    // ============================================================

    await test.step('II. Target Opp - Step 1: Click "CRM" button and wait for Lead Merging', async () => {
      console.log('\n=== II. VERIFY POINT - TARGET OPP ===');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM page');
    });

    await test.step('II. Target Opp - Step 2: On "CRM" page, select "Archive" then "All" sub-item from top menu', async () => {
      await opportunityPage.navigateToAllLeads();
      console.log('✓ Navigated to Archive > All Leads');
    });

    await test.step('II. Target Opp - Step 3: Verify the "All Leads" page appears', async () => {
      // Page visibility already confirmed by navigateToAllLeads()
      console.log('✓ All Leads page is displayed');
    });

    await test.step('II. Target Opp - Step 4: Search for Email_Contact#1 in Search textbox', async () => {
      await opportunityPage.searchByEmail(csvData1.emailContact1);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Searched for: ${csvData1.emailContact1}`);
    });

    await test.step('II. Target Opp - Step 5: Click the Opp row where Opportunity = value of Name_Contact#1 and wait for Lead Merging', async () => {
      await opportunityPage.clickOppRowByOppName(csvData1.contactName);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Clicked Opp row with opportunity name: ${csvData1.contactName}`);
      console.log('⏳ Waiting dynamically for Lead Merging to happen (polling chatter)...');
      const mergeHappened = await leadPage.waitForLeadMergingHappen_OnTargetLead(csvData2.contactName);
      expect(mergeHappened).toBeTruthy();
      console.log('✓ Lead Merging confirmed via chatter log');
    });

    await test.step('II. Target Opp - Step 6: Verify fields on Target Opp', async () => {
      console.log('=== II. TARGET OPP - STEP 6: VERIFY FIELDS ===');

      await test.step('Step 6.1: Tag field contains "Test"', async () => {
        const tagsText = await opportunityPage.getTagsText();
        expect(tagsText).toContain('Test');
        console.log(`  ✓ Step 6.1: Tags contain "Test"`);
      });

      await test.step('Step 6.2: Company Name textbox = Name_Contact#1', async () => {
        const companyName = await opportunityPage.getCompanyNameReadonly();
        expect(companyName).toContain(csvData1.companyName);
        console.log(`  ✓ Step 6.2: Company Name = ${csvData1.companyName}`);
      });

      await test.step('Step 6.3: Country dropdown list = China', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        expect(addressText).toContain('China');
        console.log(`  ✓ Step 6.3: Country = China`);
      });

      await test.step('Step 6.4: Sales Team dropdown list = CMR', async () => {
        const salesTeam = await opportunityPage.getSalesTeamValue();
        expect(salesTeam).toContain('CMR');
        console.log(`  ✓ Step 6.4: Sales Team = CMR`);
      });

      await test.step('Step 6.5: Email textbox = Email_Contact#1', async () => {
        const email = await opportunityPage.getEmailReadonly();
        expect(email).toContain(csvData1.emailContact1);
        console.log(`  ✓ Step 6.5: Email = ${csvData1.emailContact1}`);
      });
    });

    await test.step('II. Target Opp - Step 7: Click "CRM Developer" tab and verify fields', async () => {
      console.log('=== II. TARGET OPP - STEP 7: VERIFY CRM DEVELOPER TAB ===');

      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      await test.step(`Step 7.1: Lead form textbox = "Investment: ID-${investmentId1OnURL}"`, async () => {
        const expectedLeadForm = `Investment: ID-${investmentId1OnURL}`;
        const leadForm = await opportunityPage.getLeadFormValue();
        expect(leadForm).toBe(expectedLeadForm);
        console.log(`  ✓ Step 7.1: Lead form = ${expectedLeadForm}`);
      });

      await test.step('Step 7.2: Active checkbox = TRUE', async () => {
        const isActive = await opportunityPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 7.2: Active = TRUE`);
      });

      await test.step('Step 7.3: Is Won = Pending', async () => {
        const isWon = await opportunityPage.getIsWonValue();
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 7.3: Is Won = Pending`);
      });

      await test.step('Step 7.4: Lost Reason = BLANK', async () => {
        const lostReason = await opportunityPage.getLostReasonValueViaTextContent();
        expect(lostReason).toBe('');
        console.log(`  ✓ Step 7.4: Lost Reason = BLANK`);
      });
    });

    await test.step('II. Target Opp - Step 8: Verify Log area', async () => {
      console.log('=== II. TARGET OPP - STEP 8: VERIFY LOG AREA ===');

      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);

      await test.step('Step 8.1: Log contains "[Opp 2], has been merged into this lead."', async () => {
        const hasMergeMessage = await opportunityPage.hasSourceLeadMergeMessage(csvData2.contactName);
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 8.1: Found log message: "${csvData2.contactName}, has been merged into this lead."`);
      });
    });

    await test.step('II. Target Opp - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ II. VERIFY POINT - TARGET OPP COMPLETED');

    // ============================================================
    // III. VERIFY POINT - SOURCE OPP
    // ============================================================

    await test.step('III. Source Opp - Step 1: Click "CRM" button', async () => {
      console.log('\n=== III. VERIFY POINT - SOURCE OPP ===');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM page');
     
    });

    await test.step('III. Source Opp - Step 2: On "CRM" page, select "Archive" then "All" sub-item from top menu', async () => {
      await opportunityPage.navigateToAllLeads();
      console.log('✓ Navigated to Archive > All Leads');
    });

    await test.step('III. Source Opp - Step 3: Verify the "All Leads" page appears', async () => {
      // Page visibility already confirmed by navigateToAllLeads()
      console.log('✓ All Leads page is displayed');
    });

    await test.step('III. Source Opp - Step 4: Search for Email_Contact#2 in Search textbox', async () => {
      await opportunityPage.searchByEmail(csvData2.emailContact1);
      //await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Searched for: ${csvData2.emailContact1}`);
    });

    await test.step('III. Source Opp - Step 5: Click the Opp row where Opportunity = value of Name_Contact#2 and wait for Lead Merging', async () => {
      await opportunityPage.clickOppRowByOppName(csvData2.contactName);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Clicked Opp row with opportunity name: ${csvData2.contactName}`);
      console.log('⏳ Waiting dynamically for Lead Merging to happen (polling chatter)...');
      const mergeHappened = await leadPage.waitForLeadMergingHappen(csvData1.contactName);
      expect(mergeHappened).toBeTruthy();
      console.log('✓ Lead Merging confirmed via chatter log');
    });

    await test.step('III. Source Opp - Step 6: Verify fields on Source Opp', async () => {
      console.log('=== III. SOURCE OPP - STEP 6: VERIFY FIELDS ===');

      await test.step('Step 6.1: Tag field contains "Test"', async () => {
        const tagsText = await opportunityPage.getTagsText();
        expect(tagsText).toContain('Test');
        console.log(`  ✓ Step 6.1: Tags contain "Test"`);
      });

      await test.step('Step 6.2: Company Name textbox = Name_Company_Contact#2', async () => {
        const companyName = await opportunityPage.getCompanyNameReadonly();
        expect(companyName).toContain(csvData2.companyName);
        console.log(`  ✓ Step 6.2: Company Name = ${csvData2.companyName}`);
      });

      await test.step('Step 6.3: Country dropdown list = China', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        expect(addressText).toContain('China');
        console.log(`  ✓ Step 6.3: Country = China`);
      });

      await test.step('Step 6.4: Sales Team dropdown list = CMR', async () => {
        const salesTeam = await opportunityPage.getSalesTeamValue();
        expect(salesTeam).toContain('CMR');
        console.log(`  ✓ Step 6.4: Sales Team = CMR`);
      });

      await test.step('Step 6.5: Email textbox = Email_Contact#1', async () => {
        const email = await opportunityPage.getEmailReadonly();
        expect(email).toContain(csvData1.emailContact1);
        console.log(`  ✓ Step 6.5: Email = ${csvData1.emailContact1}`);
      });
    });

    await test.step('III. Source Opp - Step 7: Click "CRM Developer" tab and verify fields', async () => {
      console.log('=== III. SOURCE OPP - STEP 7: VERIFY CRM DEVELOPER TAB ===');

      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      await test.step(`Step 7.1: Lead form textbox = "Investment: ID-${investmentId2OnURL}"`, async () => {
        const expectedLeadForm = `Investment: ID-${investmentId2OnURL}`;
        const leadForm = await opportunityPage.getLeadFormValue();
        expect(leadForm).toBe(expectedLeadForm);
        console.log(`  ✓ Step 7.1: Lead form = ${expectedLeadForm}`);
      });

      await test.step('Step 7.2: Active checkbox = FALSE', async () => {
        const isActive = await opportunityPage.isActiveChecked();
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 7.2: Active = FALSE`);
      });

      await test.step('Step 7.3: Is Won = Lost', async () => {
        const isWon = await opportunityPage.getIsWonValue();
        expect(isWon.trim()).toBe('Lost');
        console.log(`  ✓ Step 7.3: Is Won = Lost`);
      });

      await test.step('Step 7.4: Lost Reason = Duplicate', async () => {
        const lostReason = await opportunityPage.getLostReasonValueViaTextContent();
        expect(lostReason).toBe('Duplicate');
        console.log(`  ✓ Step 7.4: Lost Reason = Duplicate`);
      });
    });

    await test.step('III. Source Opp - Step 8: Verify Log area', async () => {
      console.log('=== III. SOURCE OPP - STEP 8: VERIFY LOG AREA ===');

      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);

      await test.step('Step 8.1: Log contains "This lead has been merged into [Opp 1]."', async () => {
        const hasMergeMessage = await opportunityPage.hasTargetLeadMergeMessage(csvData1.contactName);
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 8.1: Found log message: "This lead has been merged into ${csvData1.contactName}."`);
      });
    });

    await test.step('III. Source Opp - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ III. VERIFY POINT - SOURCE OPP COMPLETED');

    // ============================================================
    // TEAR DOWN
    // ============================================================

    await test.step('Tear down Step 1: Launch URL_Investment#1 and delete Investment#1', async () => {
      await page.goto(urlInvestment1);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment#1 deleted: ${investmentName1}`);
    });

    await test.step('Tear down Step 2: Delete CSV-Audience-copy1', async () => {
      if (fs.existsSync(csvCopy1Path)) { fs.unlinkSync(csvCopy1Path); console.log(`✓ Deleted: ${csvCopy1Path}`); }
    });

    await test.step('Tear down Step 3: Launch URL_Investment#2 and delete Investment#2', async () => {
      await page.goto(urlInvestment2);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment#2 deleted: ${investmentName2}`);
    });

    await test.step('Tear down Step 4: Delete CSV-Audience-copy2', async () => {
      if (fs.existsSync(csvCopy2Path)) { fs.unlinkSync(csvCopy2Path); console.log(`✓ Deleted: ${csvCopy2Path}`); }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});

