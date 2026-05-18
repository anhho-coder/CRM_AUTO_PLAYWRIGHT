import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Track Conversion Date Start Required Field Test
 * Test Case ID: CRM-3326_3.1.1
 *
 * Summary: Verify the "Track conversion date start" is a required field after clearing the field
 *
 * Command to run:
 * npx playwright test --grep "CRM-3326_3.1.1" --project=chromium
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
 *
 * Steps to reproduce:
 * 1. On Investment page, press "EDIT" button
 * 2. Clear the value:
 *    - "Track conversion date start" date = BLANK
 * 3. Press "SAVE" button
 * 4. Verify "Track conversion date start" date is a required field by showing this warning:
 *    "The following fields are invalid:
 *    Track conversion date start"
 * 5. Set the value:
 *    - "Track conversion date start" date = current date
 * 6. Press "SAVE" button and wait
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 */

test.describe('CRM-3326_3.1.1 - Verify Track conversion date start is a required field after clearing', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        // proceed to screenshot
      }
      await page.waitForTimeout(2000);
    }
  });

  test('CRM-3326_3.1.1: Verify Track conversion date start is a required field after clearing the field', async ({ page }) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const currentDate = `${mm}/${dd}/${yyyy}`;

    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const smMM = String(sixMonthsLater.getMonth() + 1).padStart(2, '0');
    const smDD = String(sixMonthsLater.getDate()).padStart(2, '0');
    const smYYYY = sixMonthsLater.getFullYear();
    const dateEndPlus6Months = `${smMM}/${smDD}/${smYYYY}`;

    const investmentName = `TEST Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

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
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    // Pre-condition Step 3: Press CREATE button and wait
    await test.step('Pre-condition Step 3: Press CREATE button and wait', async () => {
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

    // Step 1: Press EDIT button
    await test.step('Step 1: Press "EDIT" button', async () => {
      console.log('\n=== STEP 1: ACTIVATE EDIT MODE ===');

      await investmentPage.clickEditButton();

      console.log('✓ Edit mode activated');
    });

    // Step 2: Clear "Track conversion date start"
    await test.step('Step 2: Clear "Track conversion date start" date = BLANK', async () => {
      console.log('=== STEP 2: CLEAR TRACK CONVERSION DATE START ===');

      await investmentPage.clearTrackConversionDateStart();

      const valueAfterClear = await investmentPage.getTrackConversionDateStartValue();
      console.log(`✓ Track conversion date start cleared. Current value: "${valueAfterClear}"`);
    });

    // Step 3: Press SAVE button
    await test.step('Step 3: Press "SAVE" button', async () => {
      console.log('=== STEP 3: PRESS SAVE ===');

      await investmentPage.clickSaveButton();

      console.log('✓ Save button clicked');
    });

    // Step 4: Verify the validation warning message
    await test.step('Step 4: Verify warning "The following field are invalid - Track conversion date start"', async () => {
      console.log('=== STEP 4: VERIFY REQUIRED FIELD WARNING MESSAGE ===');

      const warningText = await investmentPage.getInvalidFieldsWarningText();

      console.log(`  Warning message: "${warningText}"`);

      expect(warningText, 'Step 4: Warning should mention invalid fields').toContain('following field');
      expect(warningText, 'Step 4: Warning should list "Track conversion date start"').toContain('Track conversion date start');

      console.log('  ✓ Required field warning correctly displayed for "Track conversion date start"');
    });

    // Step 5: Set Track conversion date start = current date
    await test.step('Step 5: Set "Track conversion date start" date = current date', async () => {
      console.log('=== STEP 5: SET TRACK CONVERSION DATE START ===');

      await investmentPage.fillTrackConversionDateStart(currentDate);

      console.log(`✓ Track conversion date start set to: ${currentDate}`);
    });

    // Step 6: Press SAVE button and wait
    await test.step('Step 6: Press "SAVE" button and wait', async () => {
      console.log('=== STEP 6: SAVE RECORD ===');

      await investmentPage.clickSaveButton();

      console.log('✓ Record saved successfully');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // Tear down: Delete the Investment record
    await test.step('Tear down Step 1: Delete Investment record', async () => {
      console.log('\n=== TEAR DOWN ===');

      await investmentPage.deleteCurrentRecord();

      console.log(`✓ Investment record deleted: ${investmentName}`);
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
