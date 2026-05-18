import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Audience Importing & Leads Verification Test
 * Test Case ID: CRM-2482_4.1.1.1.1
 *
 * Summary: Verify the new contact/Opp link after importing new audience via CSV and
 *          verify the Opportunity, Email, Sales Team, and Salesperson values in the Leads tab
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_4.1.1.1.1" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment with the following fields:
 *    - Investment Name          = TEST Investment <datetime>
 *    - Investment ID            = TEST-Investment-<datetime>
 *    - Type                     = Webinar
 *    - Channel                  = Channel
 *    - Countries                = Albania
 *    - Date start               = current date
 *    - Date end                 = current date
 *    - Responsible - Sales      = Aleksey Galbur
 *    - Responsible - Marketing  = Nadiia Suprun
 *    - NBR Product List         = M365
 *    - Completion Events        = Attended webinar
 *    - Conversion Events        = Download free trial
 *    - Track conversion date start = current date
 *    - Track conversion date end   = current date + 6 months
 * 5. Create an Import Audience file:
 *    5.1. Generate test data:
 *         - Contact Name  = TEST_first_name-TEST_last_name_<timestamp>   (Name_Contact#1)
 *         - Email         = Test@company<YYYY>-<MM>-<DD><HHMMSS>.com     (Email_Contact#1)
 *         - Company       = TEST_company_name_<timestamp>
 *         - Phone         = 1234125125
 *         - Country       = China
 *         - Sales Team    = CMR                                           (Sales_Team_Contact#1)
 *         - Salesperson   = Sergey Karachin                              (Salesperson_Contact#1)
 *         - Tags          = test
 *    5.2. Read template CSV: CSV-AudienceTemplate-1.csv
 *    5.3. Fill test data into respective columns and create CSV-Audience-copy1
 *    5.4. Save the file to test-data/investment-module/CSV-Audience-copy1.csv
 *
 * Steps to reproduce:
 * 1. On Investment page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 * 4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 * 5. Select CSV-Audience-copy1 file and wait
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Click at "Leads" tab
 * 9. Verify the following:
 *    9.1. Value at "Opportunity" row = Name_Contact#1
 *    9.2. Value at "Email" row       = Email_Contact#1
 *    9.3. Value at "Sales Team" row  = Sales_Team_Contact#1
 *    9.4. Value at "Salesperson" row = Salesperson_Contact#1
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 * 2. Delete the created CSV file (CSV-Audience-copy1.csv)
 */

test.describe('CRM-2482_4.1.1.1.1 - Verify new contact/Opp link after importing audience via CSV', () => {

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

  test('CRM-2482_4.1.1.1.1: Verify new contact/Opp link after importing new audience using csv file', async ({ page }, testInfo) => {
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

    const investmentName = `TEST Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);

    // Pre-condition Step 1: Login and navigate to Investments module
    await test.step('Pre-condition Step 1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investments module');
    });

    // Pre-condition Step 2: Navigate to Investment menu item
    await test.step('Pre-condition Step 2: Navigate to Investment', async () => {
      console.log('Step 2: Navigating to Investment menu item');

      await investmentPage.navigateToInvestment();

      console.log('✓ Navigated to Investment page\n');
    });

    // Pre-condition Step 3: Press CREATE button and wait
    await test.step('Pre-condition Step 3: Press CREATE button and wait', async () => {
      console.log('=== PRE-CONDITION STEP 3: CLICK CREATE BUTTON ===');

      await investmentPage.clickCreateButton();

      console.log('✓ Create form opened');
    });

    // Pre-condition Step 4: Create a blank Investment
    await test.step('Pre-condition Step 4: Create a blank Investment', async () => {
      console.log('=== PRE-CONDITION STEP 4: CREATE A BLANK INVESTMENT ===');

      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
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

      console.log('✓ Investment record created and saved successfully');
      console.log(`✓ Investment Name: ${investmentName}`);
      console.log(`✓ Investment ID  : ${investmentID}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // ---- Pre-condition Step 5: Create an Import Audience file ----
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Pre-condition Step 5: Create an Import Audience file (CSV-Audience-copy1.csv)', async () => {
      console.log('=== PRE-CONDITION STEP 5: CREATE IMPORT AUDIENCE FILE ===');

      audienceData = await investmentPage.createImportAudienceFile();

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);

      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');
      console.log(`  ✓ Name_Contact#1        : ${audienceData.contactName}`);
      console.log(`  ✓ Email_Contact#1       : ${audienceData.emailContact1}`);
      console.log(`  ✓ Sales_Team_Contact#1  : ${audienceData.salesTeam}`);
      console.log(`  ✓ Salesperson_Contact#1 : ${audienceData.salesperson}`);
    });

    console.log('\n✅ PRE-CONDITIONS (ALL) COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Press EDIT button
    await test.step('Step 1: On Investment page, press "EDIT" button and wait', async () => {
      console.log('\n=== STEP 1: CLICK EDIT BUTTON ===');

      await investmentPage.clickEditButton();

      console.log('✓ Edit mode activated');
    });

    // Step 2: Click the "Audience" tab
    await test.step('Step 2: Click at "Audience" tab', async () => {
      console.log('=== STEP 2: CLICK AUDIENCE TAB ===');

      await investmentPage.clickAudienceTab();

      console.log('✓ Audience tab clicked');
    });

    // Step 3–5: Click "UPLOAD YOUR FILE" button and upload the CSV
    await test.step('Step 3-5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy1', async () => {
      console.log('=== STEP 3-5: UPLOAD CSV FILE ===');

      await investmentPage.uploadAudienceCSV(audienceData.outputPath);

      console.log(`✓ CSV file uploaded: ${audienceData.outputPath}`);
    });

    // Step 6: Click "IMPORT" button and wait
    await test.step('Step 6: Press "IMPORT" button and wait', async () => {
      console.log('=== STEP 6: CLICK IMPORT BUTTON ===');

      await investmentPage.clickImportButton();

      console.log('✓ Import completed');
    });

    // Step 7: Save the Investment record
    await test.step('Step 7: Press "SAVE" button on Investment page', async () => {
      console.log('=== STEP 7: CLICK SAVE BUTTON ===');

      await investmentPage.clickSaveButton();

      console.log('✓ Investment record saved');
    });

    // Step 8: Click "Leads" tab
    await test.step('Step 8: Click at "Leads" tab', async () => {
      console.log('=== STEP 8: CLICK LEADS TAB ===');

      await investmentPage.clickLeadsTab();

      console.log('✓ Leads tab clicked');
    });

    // Step 9: Verify values in the Leads table first row
    await test.step('Step 9: Verify Opportunity, Email, Sales Team, Salesperson in Leads tab', async () => {
      console.log('=== STEP 9: VERIFY LEADS TABLE VALUES ===');

      // 9.1 Opportunity = Name_Contact#1
      const opportunityText = await investmentPage.getLeadsFirstRowCellText('Opportunity');
      console.log(`  9.1 Opportunity actual  : "${opportunityText}"`);
      console.log(`  9.1 Opportunity expected: "${audienceData.contactName}"`);
      expect(opportunityText, `Step 9.1: Opportunity mismatch`).toBe(audienceData.contactName);
      console.log('  ✓ 9.1 Opportunity verified');

      // 9.2 Email = Email_Contact#1
      const emailText = await investmentPage.getLeadsFirstRowCellText('Email');
      console.log(`  9.2 Email actual  : "${emailText}"`);
      console.log(`  9.2 Email expected: "${audienceData.emailContact1}"`);
      expect(emailText, `Step 9.2: Email mismatch`).toBe(audienceData.emailContact1);
      console.log('  ✓ 9.2 Email verified');

      // 9.3 Sales Team = Sales_Team_Contact#1
      const salesTeamText = await investmentPage.getLeadsFirstRowCellText('Sales Team');
      console.log(`  9.3 Sales Team actual  : "${salesTeamText}"`);
      console.log(`  9.3 Sales Team expected: "${audienceData.salesTeam}"`);
      expect(salesTeamText, `Step 9.3: Sales Team mismatch`).toBe(audienceData.salesTeam);
      console.log('  ✓ 9.3 Sales Team verified');

      // 9.4 Salesperson = Salesperson_Contact#1
      const salespersonText = await investmentPage.getLeadsFirstRowCellText('Salesperson');
      console.log(`  9.4 Salesperson actual  : "${salespersonText}"`);
      console.log(`  9.4 Salesperson expected: "${audienceData.salesperson}"`);
      expect(salespersonText, `Step 9.4: Salesperson mismatch`).toBe(audienceData.salesperson);
      console.log('  ✓ 9.4 Salesperson verified');

      console.log('\n  ✅ ALL LEADS TAB VALUES VERIFIED SUCCESSFULLY');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // Tear down: Delete the Investment record
    // SKIPPED — remove the comment below to enable
    await test.step('Tear down Step 1: Delete Investment record', async () => {
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment record deleted: ${investmentName}`);
    });

    // Tear down Step 2: Delete CSV file
    // SKIPPED — remove the comment below to enable
    await test.step('Tear down Step 2: Delete CSV file CSV-Audience-copy1.csv', async () => {
      if (fs.existsSync(audienceData.outputPath)) {
        fs.unlinkSync(audienceData.outputPath);
        console.log(`✓ CSV file deleted: ${audienceData.outputPath}`);
      }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
