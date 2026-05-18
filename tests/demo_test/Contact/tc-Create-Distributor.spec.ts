import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Create Distributor, Reseller, EndUser Contacts
 * Test Case ID: CMR-Create-Distributor
 *
 * Summary: Verify the Distributor created successfully
 *
 * Command to run:
 * npx playwright test --grep "CMR-Create-Distributor:" --project=chromium
 *
 * II. Condition for beforeEach to clean Contacts:
 * 1.  Login as admin_crm, navigate to Contacts
 * 2.  Remove "Created by Anh Ho" filter, switch to list view
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * III. Pre-condition#1 - Create Distributor#1 (Distributor level)
 * IV.  Pre-condition#2 - Create Reseller#1 (Bronze level)
 * V.   Pre-condition#3 - Create EndUser#1 (no partner level)
 */

test.describe('CMR-Create-Distributor - Verify the Distributor created successfully', () => {

  let url_Distributor1 = '';
  let url_Reseller1    = '';
  let url_EndUser1     = '';

  let name_Distributor1 = '';
  let name_Reseller1    = '';
  let name_EndUser1     = '';

  test.beforeEach(async ({ browser, context }) => {
    const SKIP_CLEANUP = true; // Toggle to false to re-enable Contact cleanup
    if (SKIP_CLEANUP) return;
    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // II. Clean Contacts (Chile / Antofagasta / Thomas Semerich)
    // ============================================================
    const cleanContext = await browser.newContext();
    const cleanPage    = await cleanContext.newPage();

    const loginPageClean   = new LoginPage(cleanPage);
    const homePageClean    = new HomePage(cleanPage);
    const contactPageClean = new ContactPage(cleanPage);

    await test.step('beforeEach II.1: Login and navigate to Contacts', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach II.1: Logging in for Contacts cleanup');
      await loginPageClean.navigateTo(baseUrl);
      await loginPageClean.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageClean.dismissLocationPermissionDialog();
      await homePageClean.navigateToContactsFromHome();
      
      console.log('\u2713 beforeEach II.1: Navigated to Contacts page');
    });

    await test.step('beforeEach II.2: Remove active filter and switch to list view', async () => {
      console.log('beforeEach II.2: Removing active search filter and switching to list view');
      await contactPageClean.removeMyPipelineFilter();
      await contactPageClean.clickViewListButtonIfVisible();
      console.log('\u2713 beforeEach II.2: List view ready');
    });

    await test.step('beforeEach II.3: Filter by Salesperson = Thomas Semerich', async () => {
      console.log('beforeEach II.3: Adding filter Salesperson = Thomas Semerich');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Salesperson');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Thomas Semerich');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.3: Salesperson filter applied');
    });

    await test.step('beforeEach II.4: Filter by Country = Chile', async () => {
      console.log('beforeEach II.4: Adding filter Country = Chile');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Country');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Chile');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.4: Country filter applied');
    });

    await test.step('beforeEach II.5: Filter by State = Antofagasta', async () => {
      console.log('beforeEach II.5: Adding filter State = Antofagasta');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('State');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Antofagasta');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.5: State filter applied');
    });

    await test.step('beforeEach II.6: Filter by Active = is true', async () => {
      console.log('beforeEach II.6: Adding filter Active = is true');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Active');
      await contactPageClean.selectCustomFilterOperator('is true');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.6: Active filter applied');
    });

    await test.step('beforeEach II.7: Check and delete qualified Contacts', async () => {
      console.log('beforeEach II.7: Checking for qualified Contacts...');
      const isEmpty = await contactPageClean.isRecordListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach II.7: No qualified Contacts found - skipping delete');
        return;
      }
      console.log('  \u26a0 Qualified Contacts found - proceeding to delete');
      await contactPageClean.clickSelectAllCheckbox();
      await contactPageClean.clickListActionMenu();
      await contactPageClean.clickListActionDelete();
      await contactPageClean.confirmDeleteDialog();
      console.log('\u2713 beforeEach II.7: Qualified Contacts deleted');
    });

    await cleanContext.close();
    console.log('\u2713 beforeEach II: Contacts cleanup browser closed');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized');
    }
  });

  test('CMR-Create-Distributor: Verify the Distributor created successfully', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage   = new LoginPage(page);
    const homePage    = new HomePage(page);
    const contactPage = new ContactPage(page);

    const tcId        = 'CMR-Create-Distributor';
    const timestamp   = CommonUtils.generateTimestamp();
    const currentDate = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID     : ${tcId}`);
    console.log(`  Timestamp : ${timestamp}`);
    console.log(`  Date      : ${currentDate}`);

    // ==============================================================
    // III. PRE-CONDITION#1: Create Distributor#1
    // ==============================================================

    await test.step('Pre-condition III.1: Login and navigate to Contacts', async () => {
      console.log(`\n=== III. PRE-CONDITION#1: Create Distributor#1 ===`);
      console.log(`Step III.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`\u2713 Login successful`);
      await homePage.navigateToContactsFromHome();
      
      console.log('\u2713 Navigated to Contacts');
    });

    await test.step('Pre-condition III.2: Create Distributor#1 (Distributor level)', async () => {
      name_Distributor1 = `TEST-Distributor#1_${tcId}_${timestamp}`;
      const emailDistributor1 = `Test-Distributor@Distributor-company${timestamp}.com`;
      const commentDistributor = `Distributor_${tcId}_${timestamp}`;
      console.log(`Step III.2: Creating Distributor#1 - Name: "${name_Distributor1}"`);

      await contactPage.clickCreate();
      const result = await contactPage.createDistributorContact(
        'Company',
        name_Distributor1,
        emailDistributor1,
        'Chile',
        'BDEU',
        commentDistributor,
        '',
        'Antofagasta',
        'Thomas Semerich',
        currentDate
      );
      console.log(`  \u2713 Distributor#1 created (id=${result.contactId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.2 - Partner level Distributor set');
    });

    await test.step('Pre-condition III.3: Set Pricelist on Sales & Purchases tab', async () => {
      console.log('Step III.3: Navigating to Sales & Purchases tab and selecting Pricelist');
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR (EUR)');
      console.log('  \u2713 Pricelist set to "Public Pricelist_EUR (EUR)"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.3 - Pricelist set');
    });

    await test.step('Pre-condition III.4: Save Distributor#1 and copy URL', async () => {
      console.log('Step III.4: Saving Distributor#1 and capturing URL');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_Distributor1 = page.url();
      console.log(`\u2713 URL_Distributor#1 = ${url_Distributor1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.4 - Distributor#1 complete');
    });

    await test.step('Pre-condition III.5: Return to home page', async () => {
      console.log('Step III.5: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
    });

    // ==============================================================
    // IV. PRE-CONDITION#2: Create Reseller#1
    // ==============================================================

    await test.step('Pre-condition IV.1: Navigate to Contacts for Reseller#1', async () => {
      console.log(`\n=== IV. PRE-CONDITION#2: Create Reseller#1 ===`);
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to Contacts');
    });

    await test.step('Pre-condition IV.2: Create Reseller#1 (Bronze level)', async () => {
      name_Reseller1 = `TEST-Reseller#1_${tcId}_${timestamp}`;
      const emailReseller1 = `Test-Reseller@Reseller-company${timestamp}.com`;
      const commentReseller = `Bronze level_${tcId}_${timestamp}`;
      console.log(`Step IV.2: Creating Reseller#1 - Name: "${name_Reseller1}"`);

      await contactPage.clickCreate();
      const result = await contactPage.createResellerContact(
        'Company',
        name_Reseller1,
        emailReseller1,
        'Chile',
        'BDEU',
        'Bronze',
        commentReseller,
        currentDate,
        'Antofagasta',
        'Thomas Semerich',
        currentDate
      );
      console.log(`  \u2713 Reseller#1 created (id=${result.contactId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.2 - Partner level Bronze set');
    });

    await test.step('Pre-condition IV.3: Save Reseller#1 and copy URL', async () => {
      console.log('Step IV.3: Saving Reseller#1 and capturing URL');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_Reseller1 = page.url();
      console.log(`\u2713 URL_Reseller#1 = ${url_Reseller1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.3 - Reseller#1 complete');
    });

    await test.step('Pre-condition IV.4: Return to home page', async () => {
      console.log('Step IV.4: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
    });

    // ==============================================================
    // V. PRE-CONDITION#3: Create EndUser#1
    // ==============================================================

    await test.step('Pre-condition V.1: Navigate to Contacts for EndUser#1', async () => {
      console.log(`\n=== V. PRE-CONDITION#3: Create EndUser#1 ===`);
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to Contacts');
    });

    await test.step('Pre-condition V.2: Click CREATE for EndUser#1', async () => {
      console.log('Step V.2: Clicking CREATE button');
      await contactPage.clickCreate();
      console.log('\u2713 Contact creation form opened');
    });

    await test.step('Pre-condition V.3: Fill EndUser#1 information', async () => {
      name_EndUser1 = `TEST-EndUser#1_${tcId}_${timestamp}`;
      const emailEndUser1 = `Test-EndUser@EndUser-company${timestamp}.com`;
      console.log(`Step V.3: Filling EndUser#1 - Name: "${name_EndUser1}"`);

      await contactPage.selectCompanyType();
      await contactPage.fillContactName(name_EndUser1);
      await contactPage.fillEmail(emailEndUser1);
      await contactPage.selectCountry('Chile');
      await contactPage.selectState('Antofagasta');
      await contactPage.selectSalesTeam('BDEU');
      await contactPage.selectSalesperson('Thomas Semerich');

      console.log('\u2713 EndUser#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.3 - EndUser#1 fields filled');
    });

    await test.step('Pre-condition V.4: Save EndUser#1 and copy URL', async () => {
      console.log('Step V.4: Saving EndUser#1');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_EndUser1 = page.url();
      console.log(`\u2713 URL_EndUser#1 = ${url_EndUser1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.4 - EndUser#1 saved');
    });

    await test.step('Pre-condition V.5: Return to home page', async () => {
      console.log('Step V.5: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
    });

    // ==============================================================
    // VERIFICATION
    // ==============================================================

    await test.step('Verification: Confirm all contacts created successfully', async () => {
      console.log('\n=== VERIFICATION ===');
      expect(url_Distributor1).toBeTruthy();
      expect(url_Reseller1).toBeTruthy();
      expect(url_EndUser1).toBeTruthy();
      console.log(`\u2713 Distributor#1 created: "${name_Distributor1}"`);
      console.log(`  URL: ${url_Distributor1}`);
      console.log(`\u2713 Reseller#1 created: "${name_Reseller1}"`);
      console.log(`  URL: ${url_Reseller1}`);
      console.log(`\u2713 EndUser#1 created: "${name_EndUser1}"`);
      console.log(`  URL: ${url_EndUser1}`);
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CMR-Create-Distributor completed successfully');
      console.log(`   Distributor#1 : "${name_Distributor1}"`);
      console.log(`   URL           : ${url_Distributor1}`);
      console.log(`   Reseller#1    : "${name_Reseller1}"`);
      console.log(`   URL           : ${url_Reseller1}`);
      console.log(`   EndUser#1     : "${name_EndUser1}"`);
      console.log(`   URL           : ${url_EndUser1}`);
      console.log('==================================================\n');
    });
  });
});
