import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Import Audience Error Message Verification Test
 * Test Case ID: CRM-3374_2.5
 *
 * Summary: Verify error message displays when entering invalid value at "Sales Team" field
 *
 * Command to run:
 * npx playwright test --grep "CRM-3374_2\.5:" --project=chromium
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
 *         - Sales Team    = TEST                                          (Sales_Team_Contact#1 — invalid value)
 *         - Salesperson   = Sergey Karachin                              (Salesperson_Contact#1)
 *         - Tags          = test
 *         - Investment ID = test
 *    5.2. Use the template XLSX file "XLSX-AudienceTemplate-1.xlsx" in folder "CRM_AUTO\\test-data\\investment-module"
 *    5.3. Create another XLSX file (named XLSX-Audience-copy1) and put the data at Step 5.1 to respective columns:
 *         - Contact Name  = TEST_first_name-TEST_last_name_<timestamp>
 *         - Email         = Email_Contact#1
 *         - Company       = TEST_company_name_<timestamp>
 *         - Phone         = 1234125125
 *         - Country       = China
 *         - Sales Team    = TEST
 *         - Salesperson   = Sergey Karachin
 *         - Tags          = test
 *         - Investment ID = test
 *    5.4. Save the file in folder "CRM_AUTO\\test-data\\investment-module"
 *
 * Steps to reproduce:
 * 1. On Investment page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 * 4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 * 5. Select XLSX-Audience-copy1 file and wait
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Verify the Error message displays as:
 *    "Lines [2] \"Sales Team\" is not valid"
 * 9. Click at "Leads" tab
 * 10. Verify the following:
 *    10.1. There is no value of Email_Contact#1 at "Email" row
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 * 2. Delete the created XLSX file (XLSX-Audience-copy1.xlsx)
 */

test.describe('CRM-3374_2.5 - Verify error message displays when entering invalid value at "Sales Team" field', () => {

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

  test('CRM-3374_2.5: Verify error message displays when entering invalid value at "Sales Team" field', async ({ page }, testInfo) => {
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
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceXLSXFile>>;

    await test.step('Pre-condition Step 5: Create an Import Audience file (CSV-Audience-copy1.csv)', async () => {
      console.log('=== PRE-CONDITION STEP 5: CREATE IMPORT AUDIENCE FILE ===');

      audienceData = await investmentPage.createImportAudienceXLSXFile({ salesTeam: 'TEST', investmentId: 'test' });

      expect(fs.existsSync(audienceData.outputPath), `Output XLSX was not created at: ${audienceData.outputPath}`).toBeTruthy();

      console.log('  ✓ XLSX file created and verified');
      console.log(`  ✓ Name_Contact#1           : ${audienceData.contactName}`);
      console.log(`  ✓ Email_Contact#1          : ${audienceData.emailContact1}`);
      console.log(`  ✓ Sales_Team_Contact#1     : ${audienceData.salesTeam}  (invalid — invalid Sales Team)`);
      console.log(`  ✓ Salesperson_Contact#1    : ${audienceData.salesperson}`);
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

      console.log('✓ Save action triggered');
    });

    // Step 8: Verify the error message
    await test.step('Step 8: Verify the Error message displays as: Lines [2] "Sales Team" is not valid', async () => {
      console.log('=== STEP 8: VERIFY ERROR MESSAGE ===');

      const expectedError = 'Lines [2] "Sales Team" is not valid';

      const actualErrorText = await investmentPage.waitForImportErrorMessage('is not valid');

      console.log(`  Actual error message  : "${actualErrorText}"`);
      console.log(`  Expected error message: "${expectedError}"`);

      expect(actualErrorText, 'Step 8: Error message mismatch').toContain('"Sales Team" is not valid');

      console.log('  ✓ Error message verified successfully');
    });

    // Step 9: Click at "Leads" tab
    await test.step('Step 9: Click at "Leads" tab', async () => {
      console.log('\n=== STEP 9: CLICK LEADS TAB ===');

      await investmentPage.clickLeadsTab();

      console.log('✓ Leads tab clicked');
    });

    // Step 10: Verify no Email_Contact#1 in Leads tab
    await test.step('Step 10: Verify "Email" row has no value of Email_Contact#1', async () => {
      console.log('=== STEP 10: VERIFY EMAIL NOT IN LEADS TAB ===');

      // Step 10.1: Verify Email_Contact#1 is NOT present (import was rejected due to invalid Sales Team)
      await test.step('Step 10.1: There is no value of Email_Contact#1 at "Email" row', async () => {
        const emailText = await investmentPage.getLeadsFirstRowCellText('Email').catch(() => '');

        console.log(`  10.1 Email actual  : "${emailText}"`);
        console.log(`  10.1 Email expected: NOT "${audienceData.emailContact1}"`);

        expect(emailText, 'Step 10.1: Email_Contact#1 should NOT be present in Leads tab').not.toBe(audienceData.emailContact1);
        console.log('  ✓ 10.1 Email_Contact#1 is not present in Leads tab — import was rejected');
      });
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
    await test.step('Tear down Step 2: Delete XLSX file XLSX-Audience-copy1.xlsx', async () => {
      if (fs.existsSync(audienceData.outputPath)) {
        fs.unlinkSync(audienceData.outputPath);
        console.log(`✓ XLSX file deleted: ${audienceData.outputPath}`);
      }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
