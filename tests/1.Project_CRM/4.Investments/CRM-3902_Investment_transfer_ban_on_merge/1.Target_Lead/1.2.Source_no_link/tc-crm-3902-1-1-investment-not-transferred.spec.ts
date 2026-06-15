import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Verify value of "Investment" field from a Source Lead to Target Lead
 * Test Case ID: CRM-3902_1.1
 *
 * Summary: Verify the value of "Investment" field from a Source Lead is NOT applied to Target Lead
 *          after importing new audience using csv file
 *
 * Command to run:
 * npx playwright test --grep "CRM-3902_1\.1:" --project=chromium
 *
 * Pre-condition #1:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment (Name_Investment#1) with fields:
 *    - Investment Name, Investment ID, Type=Webinar, Channel, Countries=Albania
 *    - Date start/end = current date, Responsible Sales/Marketing, NBR Product List=M365
 *    - Completion/Conversion Events, Track conversion dates
 * 5. Create CSV-Audience-copy1 (SOURCE contact):
 *    - Contact Name  = TEST_SOURCE_name_<timestamp>  (Name_Contact#1)
 *    - Email         = Test@company<datetime>.com     (Email_Contact#1)
 *    - Company       = TEST_company_name_<timestamp>
 *    - Phone         = 1234125125  |  Country = China
 *    - Sales Team    = CMR         |  Salesperson = Sergey Karachin
 *    - Tags          = test        |  Create manually = FALSE
 *
 * Steps to reproduce #1:
 * 1. On Investment#1 page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3-5. Upload CSV-Audience-copy1 file
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Copy the current URL as URL_Investment#1
 * 9. Press "Application" button to back to Home page
 *
 * I. Edit Opportunity:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Search" textbox, remove "My Pipeline" and wait
 * 4. On "Search" textbox, enter value of Email_Contact#1 then press Enter to search
 * 5. On "Opp" page, click at the line of "Email" = value of Email_Contact#1
 * 6. On "Opp" page, press "EDIT" button and wait
 * 7. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 8. Press "SAVE" button
 * 9. Copy URL of Opp#1, called URL_Opp#1
 * 10. Press "Application" button to back to Home page
 *
 * Pre-condition #2:
 * 1. On "Home" page, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox = TEST Investment 2 + current date time
 * 5. Create CSV-Audience-copy2 (TARGET contact — same Email_Contact#1):
 *    - Contact Name  = TEST_TARGET_<timestamp>
 *    - Email         = Email_Contact#1 (reused from Pre-condition #1)
 *    - Company, Phone, Country, Sales Team, Salesperson same as #1
 *    - Tags          = Can_Merge      |  Create manually = TRUE
 *
 * Steps to reproduce #2:
 * 1. On Investment#2 page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3-5. Upload CSV-Audience-copy2 file
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 *
 * Tear down:
 * 1. Delete Investment#2 record
 * 2. Navigate to URL_Investment#1 and delete Investment#1
 * 3. Delete both CSV files
 */

test.describe('CRM-3902_1.1 - Verify new contact/new Opp are created after importing new audience using csv file', () => {

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

  test('CRM-3902_1.1: Verify new contact/new Opp are created after importing new audience using csv file', async ({ page }, testInfo) => {
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
    const opportunityPage = new OpportunityPage(page);

    // Track file paths for tear down
    let csvCopy1Path = '';
    let csvCopy2Path = '';
    let urlInvestment1 = '';
    let urlOpp1 = '';

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

    // Pre-condition #1 Step 5: Create CSV-Audience-copy1 (SOURCE contact, createManually=FALSE)
    let csvData1 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;
    let csvData2 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Pre-condition #1 Step 5: Create CSV-Audience-copy1 (SOURCE contact, createManually=FALSE)', async () => {
      console.log('=== PRE-CONDITION #1 STEP 5: CREATE CSV-AUDIENCE-COPY1 ===');

      csvData1 = await investmentPage.createImportAudienceFile({
        contactName:   `TEST_SOURCE_name_${timestamp}`,
        tags:          'test',
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
      console.log(`✓ URL_Investment#1: ${urlInvestment1}`);
    });

    // Steps to reproduce #1 — Step 9: Navigate back to Home
    await test.step('Steps #1 - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ STEPS TO REPRODUCE #1 COMPLETED');

    // ============================================================
    // I. EDIT OPPORTUNITY
    // ============================================================

    // I. Step 1: Click CRM button
    await test.step('I. Edit Opp - Step 1: Click "CRM" button', async () => {
      console.log('\n=== I. EDIT OPPORTUNITY ===');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM page');
    });

    // I. Step 2: Switch to list view
    await test.step('I. Edit Opp - Step 2: Click "view list" button on CRM page', async () => {
      await opportunityPage.switchToListView();
      console.log('✓ Switched to list view');
    });

    // I. Step 3: Remove "My Pipeline" filter
    await test.step('I. Edit Opp - Step 3: Remove "My Pipeline" filter from Search', async () => {
      await opportunityPage.removeMyPipelineFilter();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ "My Pipeline" filter removed');
    });

    // I. Step 4: Search by Email_Contact#1
    await test.step('I. Edit Opp - Step 4: Search for Email_Contact#1 in Search textbox', async () => {
      await opportunityPage.searchByEmail(csvData1.emailContact1);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Searched for: ${csvData1.emailContact1}`);
    });

    // I. Step 5: Click the Opp row matching Email_Contact#1
    await test.step('I. Edit Opp - Step 5: Click Opp row where Email = Email_Contact#1', async () => {
      await opportunityPage.clickOppRowByEmail(csvData1.emailContact1);
      console.log(`✓ Clicked Opp row with email: ${csvData1.emailContact1}`);
    });

    // I. Step 6: Press EDIT button
    await test.step('I. Edit Opp - Step 6: Press "EDIT" button on Opp page', async () => {
      await opportunityPage.clickEdit();
      console.log('✓ Edit mode activated on Opp');
    });

    // I. Step 7: Click CRM Developer tab and set Lead form = License
    await test.step('I. Edit Opp - Step 7: Click "CRM Developer" tab and fill Lead form = "License"', async () => {
      await opportunityPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab opened');
      await opportunityPage.fillLeadForm('License');
      console.log('✓ Lead form set to: License');
    });

    // I. Step 8: Press SAVE
    await test.step('I. Edit Opp - Step 8: Press "SAVE" button', async () => {
      await opportunityPage.clickSave();
      console.log('✓ Opp saved');
    });

    // I. Step 9: Copy URL of Opp#1
    await test.step('I. Edit Opp - Step 9: Copy URL of Opp#1 as URL_Opp#1', async () => {
      urlOpp1 = page.url();
      console.log(`✓ URL_Opp#1: ${urlOpp1}`);
    });

    // I. Step 10: Press Application button to back to Home page
    await test.step('I. Edit Opp - Step 10: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ I. EDIT OPPORTUNITY COMPLETED');

    // ============================================================
    // PRE-CONDITION #2
    // ============================================================

    // Pre-condition #2 Step 1. On "Home" page, click at "Investments" button
    await test.step('Pre-condition #2 Step 1: Click "Investments" button on Home page', async () => {
      console.log('\n=== PRE-CONDITION #2 ===');
       await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });
// Pre-condition #2 Step 2: Navigate to Investment menu item
    await test.step('Pre-condition #2 Step 2: Navigate to Investment', async () => {
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });
    // Pre-condition #2 Step 3: Press CREATE button
    await test.step('Pre-condition #2 Step 3: Press CREATE button', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Pre-condition #2 Step 4: Create blank Investment#2
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

    // Pre-condition #2 Step 5: Create CSV-Audience-copy2 (TARGET contact, same email, createManually=TRUE)
    await test.step('Pre-condition #2 Step 5: Create CSV-Audience-copy2 (TARGET contact)', async () => {
      console.log('=== PRE-CONDITION #2 STEP 5: CREATE CSV-AUDIENCE-COPY2 ===');

      csvData2 = await investmentPage.createImportAudienceFile({
        contactName:    `TEST_TARGET_${CommonUtils.generateTimestamp()}`,
        email:          csvData1.emailContact1,
        tags:           'Can_Merge',
        createManually: 'TRUE',
        outputFileName: 'CSV-Audience-copy2.csv',
      });
      csvCopy2Path = csvData2.outputPath;

      expect(fs.existsSync(csvCopy2Path), `CSV-Audience-copy2 not found at: ${csvCopy2Path}`).toBeTruthy();

      console.log('  ✓ CSV-Audience-copy2 created');
      console.log(`  ✓ Name (TARGET)    : ${csvData2.contactName}`);
      console.log(`  ✓ Email (reused)   : ${csvData2.emailContact1}`);
      console.log('  ✓ Tags             : Can_Merge');
      console.log('  ✓ Create manually  : TRUE');
    });

    console.log('\n✅ PRE-CONDITION #2 SETUP COMPLETED');

    // Steps to reproduce #2 — Step 1: Edit Investment#2
    await test.step('Steps #2 - Step 1: Press "EDIT" button on Investment#2', async () => {
      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');
    });

    // Steps to reproduce #2 — Step 2: Click Audience tab
    await test.step('Steps #2 - Step 2: Click "Audience" tab', async () => {
      await investmentPage.clickAudienceTab();
      console.log('✓ Audience tab clicked');
    });

    // Steps to reproduce #2 — Steps 3-5: Upload CSV-Audience-copy2
    await test.step('Steps #2 - Step 3-5: Upload CSV-Audience-copy2', async () => {
      await investmentPage.uploadAudienceCSV(csvCopy2Path);
      console.log(`✓ CSV-Audience-copy2 uploaded: ${csvCopy2Path}`);
    });

    // Steps to reproduce #2 — Step 6: Import
    await test.step('Steps #2 - Step 6: Press "IMPORT" button', async () => {
      await investmentPage.clickImportButton();
      console.log('✓ Import completed');
    });

    // Steps to reproduce #2 — Step 7: Save
    await test.step('Steps #2 - Step 7: Press "SAVE" button', async () => {
      await investmentPage.clickSaveButton();
      console.log('✓ Save triggered');
    });

    console.log('\n✅ STEPS TO REPRODUCE #2 COMPLETED');
    console.log(`\n  URL_Investment#1 : ${urlInvestment1}`);
    console.log(`  Name_Investment#1 : ${investmentName1}`);
    console.log(`  Name_Investment#2 : ${investmentName2}`);
    console.log(`  Email_Contact#1   : ${csvData1.emailContact1}`);

    // ---- Tear down ----
    await test.step('Tear down Step 1: Delete Investment#2 record', async () => {
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment#2 deleted: ${investmentName2}`);
    });

    await test.step('Tear down Step 2: Navigate to Investment#1 and delete', async () => {
      await page.goto(urlInvestment1);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment#1 deleted: ${investmentName1}`);
    });

    await test.step('Tear down Step 3: Delete CSV files', async () => {
      if (fs.existsSync(csvCopy1Path)) { fs.unlinkSync(csvCopy1Path); console.log(`✓ Deleted: ${csvCopy1Path}`); }
      if (fs.existsSync(csvCopy2Path)) { fs.unlinkSync(csvCopy2Path); console.log(`✓ Deleted: ${csvCopy2Path}`); }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
