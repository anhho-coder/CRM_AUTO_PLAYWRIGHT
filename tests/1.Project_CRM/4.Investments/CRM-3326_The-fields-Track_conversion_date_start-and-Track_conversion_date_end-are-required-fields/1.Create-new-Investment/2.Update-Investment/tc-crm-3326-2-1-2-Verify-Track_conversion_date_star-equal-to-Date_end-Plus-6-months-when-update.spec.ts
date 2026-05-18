import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Track Conversion Date End Auto-update Test
 * Test Case ID: CRM-3326_2.1.2
 *
 * Summary: Verify the "Track conversion date end" is set equal to "Date start" + 6 months
 *          when updating an existing Investment
 *
 * Command to run:
 * npx playwright test --grep "CRM-3326_2.1.2" --project=chromium
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
 * 2. Set the new value:
 *    - "Date start" date = current date - 3 days
 *    (Remember the value of "Date start" date)
 * 3. Verify that the value at the following field is automatically updated:
 *    - "Track conversion date end" date = the value of "Date start" date + 6 months
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 */

test.describe('CRM-3326_2.1.2 - Verify Track conversion date end equals Date start + 6 months when updating Investment', () => {

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

  test('CRM-3326_2.1.2: Verify Track conversion date end is set equal to Date start + 6 months when updating Investment', async ({ page }) => {
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

    // current date - 3 days
    const threeDaysBack = new Date(now);
    threeDaysBack.setDate(threeDaysBack.getDate() - 3);
    const tbMM = String(threeDaysBack.getMonth() + 1).padStart(2, '0');
    const tbDD = String(threeDaysBack.getDate()).padStart(2, '0');
    const tbYYYY = threeDaysBack.getFullYear();
    const newDateStart = `${tbMM}/${tbDD}/${tbYYYY}`;

    // expected Track conversion date end = newDateStart + 6 months
    const newDateStartPlusSix = new Date(threeDaysBack);
    newDateStartPlusSix.setMonth(newDateStartPlusSix.getMonth() + 6);
    const nsMM = String(newDateStartPlusSix.getMonth() + 1).padStart(2, '0');
    const nsDD = String(newDateStartPlusSix.getDate()).padStart(2, '0');
    const nsYYYY = newDateStartPlusSix.getFullYear();
    const expectedTrackEndDate = `${nsMM}/${nsDD}/${nsYYYY}`;

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

    // Step 1: Press EDIT button and update Date start to current date - 3 days
    await test.step('Step 1: Press "EDIT" button and set Date start = current date - 3 days', async () => {
      console.log('\n=== STEP 1: EDIT DATE START ===');

      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');

      await investmentPage.fillDateStart(newDateStart);

      console.log(`✓ Date start updated to: ${newDateStart} (current date - 3 days)`);
      console.log(`✓ Expected Track conversion date end: ${expectedTrackEndDate} (Date start + 6 months)`);
    });

    // Step 2: Verify Track conversion date end = new Date start + 6 months
    await test.step('Step 2: Verify "Track conversion date end" = new Date start + 6 months', async () => {
      console.log('=== STEP 2: VERIFY TRACK CONVERSION DATE END ===');

      const trackEndActual = await investmentPage.getTrackConversionDateEndValue();

      console.log(`  Track conversion date end actual  : "${trackEndActual}"`);
      console.log(`  Track conversion date end expected: "${expectedTrackEndDate}"`);

      expect(trackEndActual, 'Step 2: Track conversion date end should equal updated Date start + 6 months').toBe(expectedTrackEndDate);

      console.log('  ✓ Track conversion date end verified');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // Tear down: Delete the Investment record
    await test.step('Tear down Step 1: Delete Investment record', async () => {
      console.log('\n=== TEAR DOWN ===');

      await investmentPage.clickSaveButton();
      await investmentPage.deleteCurrentRecord();

      console.log(`✓ Investment record deleted: ${investmentName}`);
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
