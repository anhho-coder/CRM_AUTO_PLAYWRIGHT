import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Lead Tab Verification Test
 * Test Case ID: CRM-2482_2.2.8.17
 *
 * Summary: Verify the Lead tab of a Investment record includes "Days to Close" field
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_2.2.8.17" --project=chromium
 *
 * Pre-condition:
 * 1. Login and navigate to the Investments module
 * 2. On "Investments" page, select "Investment" from the top menu
 * 3. Press "CREATE" button and wait for the form to open
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
 *         - Investment ID  = test
 *    5.2. Read template CSV: CSV-AudienceTemplate-1.csv
 *    5.3. Fill test data into respective columns and create CSV-Audience-copy1
 *    5.4. Save the file to test-data/investment-module/CSV-Audience-copy1.csv
 *
 * Steps to reproduce:
 * 1. Import a Company from CSV-Audience-copy1 file
 * 2. Click at "Leads" tab
 * 3. Verify the following:
 *    3.1. Value at "Days to Close" row = 0.00
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 * 2. Delete the created CSV file (CSV-Audience-copy1.csv)
 */

test.describe('CRM-2482_2.2.8.17 - Verify the Lead tab of a Investment record includes "Days to Close" field', () => {

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

  test('CRM-2482_2.2.8.17: Verify the Lead tab of a Investment record includes "Days to Close" field', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDate = `${mm}/${dd}/${yyyy}`;
    const currentDateForID = `${yyyy}-${mm}-${dd}`;

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

    // ---- Step 5: Create an Import Audience file ----
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Step 5: Create an Import Audience file (CSV-Audience-copy1.csv)', async () => {
      console.log('=== STEP 5: CREATE IMPORT AUDIENCE FILE ===');

      audienceData = await investmentPage.createImportAudienceFile({ investmentId: 'test' });

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);
      expect(savedContent).toContain('test'); // Investment ID

      console.log('  ✓ File content verified — Contact Name, Email, Company Name, and Investment ID present');
      console.log(`  ✓ Name_Contact#1        : ${audienceData.contactName}`);
      console.log(`  ✓ Email_Contact#1       : ${audienceData.emailContact1}`);
      console.log(`  ✓ Sales_Team_Contact#1  : ${audienceData.salesTeam}`);
      console.log(`  ✓ Salesperson_Contact#1 : ${audienceData.salesperson}`);
    });

    console.log('\n✅ STEP 5 COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Import a Company from CSV-Audience-copy1 file
    await test.step('Step 1: Import Company audience from CSV-Audience-copy1 file', async () => {
      console.log('\n=== STEP 1: IMPORT COMPANY AUDIENCE ===');

      await investmentPage.importCompanyAudience(audienceData.outputPath);

      console.log(`✓ Audience CSV imported and record saved: ${audienceData.outputPath}`);
    });

    // Step 2: Click at "Leads" tab
    await test.step('Step 2: Click at "Leads" tab', async () => {
      console.log('=== STEP 2: CLICK LEADS TAB ===');

      await investmentPage.clickLeadsTab();

      console.log('✓ Leads tab clicked');
    });

    // Step 3: Verify Days to Close = 0.00
    await test.step('Step 3: Verify "Days to Close" value in Leads tab equals 0.00', async () => {
      console.log('=== STEP 3: VERIFY DAYS TO CLOSE ===');

      const daysToCloseText = await investmentPage.getLeadsFirstRowCellText('Days to Close');
      console.log(`  3.1 Days to Close actual  : "${daysToCloseText}"`);
      console.log(`  3.1 Days to Close expected: "0.00"`);
      expect(daysToCloseText, 'Step 3.1: Days to Close should equal 0.00').toBe('0.00');
      console.log('  ✓ 3.1 Days to Close verified');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // ---- Tear Down ----
    await test.step('Tear Down: Delete Investment record and CSV file', async () => {
      console.log('\n=== TEAR DOWN ===');

      // Delete the Investment record
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment record deleted: ${investmentName}`);

      // Delete the generated CSV file
      if (audienceData?.outputPath && fs.existsSync(audienceData.outputPath)) {
        fs.unlinkSync(audienceData.outputPath);
        console.log(`✓ CSV file deleted: ${audienceData.outputPath}`);
      }

      console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
    });
  });
});
