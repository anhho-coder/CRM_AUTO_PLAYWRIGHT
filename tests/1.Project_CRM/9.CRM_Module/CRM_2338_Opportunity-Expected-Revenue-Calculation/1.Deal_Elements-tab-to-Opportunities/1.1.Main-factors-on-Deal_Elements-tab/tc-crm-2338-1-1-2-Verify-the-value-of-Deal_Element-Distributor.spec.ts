import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-2338 - Opportunity Expected Revenue Calculation
 * Test Case ID: CRM-2338_1.1.2
 *
 * Summary: Verify the Deal Element.Distributor getting from Opp.Distributor
 *
 * Command to run:
 * npx playwright test --grep "CRM-2338_1\.1\.2:" --project=chromium
 *
 * I. beforeEach - Clean Opps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * II. beforeEach - Clean Contacts:
 * 1.  Login as admin_crm and navigate to Contacts
 * 2.  Remove "Created by Anh Ho" filter, switch to list view
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * III. Pre-condition#1 - Create Distributor#1 (Contact with Distributor level)
 * IV.  Pre-condition#2 - Create Reseller#1 (Contact with Bronze level)
 * V.   Pre-condition#3 - Create EndUser#1 (Contact, no partner level)
 * VI.  Pre-condition#4 - Create Opp#1 (Reseller=Reseller#1, Distributor=Distributor#1)
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 *
 * VIII. Verification:
 * 1. Distributor field value = Name_Distributor#1
 *
 * IX. Tear down:
 * 1. Delete Distributor#1 via URL_Distributor#1
 * 2. Delete Reseller#1 via URL_Reseller#1
 * 3. Delete EndUser#1 via URL_EndUser#1
 * 4. Delete Opp#1 via URL_Opp#1
 * 5. Close all browsers
 */

test.describe('CRM-2338_1.1.2 - Verify the Deal Element.Distributor getting from Opp.Distributor', () => {

  let url_Distributor1 = '';
  let url_Reseller1    = '';
  let url_EndUser1     = '';
  let url_Opp1         = '';

  let name_Distributor1 = '';
  let name_Reseller1    = '';
  let name_EndUser1     = '';
  let email_EndUser1    = '';

  test.beforeEach(async ({ browser, context }) => {
    const SKIP_CLEANUP_OPPS     = true; // Toggle to false to re-enable Opps cleanup
    const SKIP_CLEANUP_CONTACTS = true; // Toggle to false to re-enable Contacts cleanup

    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // I. Clean Opps (Chile / Antofagasta / Thomas Semerich)
    // ============================================================
    if (!SKIP_CLEANUP_OPPS) {
    const cleanOppsContext = await browser.newContext();
    const cleanOppsPage   = await cleanOppsContext.newPage();

    const loginPageOpps       = new LoginPage(cleanOppsPage);
    const homePageOpps        = new HomePage(cleanOppsPage);
    const opportunityPageClean = new OpportunityPage(cleanOppsPage);

    await test.step('beforeEach I: Clean Opps (Login → All → Filters → Delete)', async () => {
      test.setTimeout(config.timeouts.test);
      // I.1: Login and navigate to CRM
      console.log('beforeEach I.1: Logging in for Opps cleanup');
      await loginPageOpps.navigateTo(baseUrl);
      await loginPageOpps.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageOpps.dismissLocationPermissionDialog();
      await homePageOpps.navigateToCRM();
      await homePageOpps.waitForPageReady();
      console.log('\u2713 beforeEach I.1: Logged in and navigated to CRM');
      // I.2: Navigate to Archive > All
      await opportunityPageClean.navigateToAllLeads();
      console.log('\u2713 beforeEach I.2: Archive > All Opps page loaded');
      // I.3: Filter Salesperson = Thomas Semerich
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Salesperson');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Thomas Semerich');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach I.3: Salesperson filter applied');
      // I.4: Filter Country = Chile
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Country');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Chile');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach I.4: Country filter applied');
      // I.5: Filter State = Antofagasta
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('State');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Antofagasta');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach I.5: State filter applied');
      // I.6: Filter Active = is true
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Active');
      await opportunityPageClean.selectCustomFilterOperator('is true');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('\u2713 beforeEach I.6: Active filter applied');
      // I.7: Check and delete qualified Opps
      const isEmpty = await opportunityPageClean.isListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach I.7: No qualified Opps found - skipping delete');
      } else {
        console.log('  \u26a0 Qualified Opps found - proceeding to delete');
        await opportunityPageClean.clickSelectAllCheckbox();
        await opportunityPageClean.clickListActionMenu();
        await opportunityPageClean.clickListActionDelete();
        await opportunityPageClean.confirmDeleteDialog();
        console.log('\u2713 beforeEach I.7: Qualified Opps deleted');
      }
    });

    await cleanOppsContext.close();
    console.log('\u2713 beforeEach I: Opps cleanup browser closed');
    } // end !SKIP_CLEANUP_OPPS

    // ============================================================
    // II. Clean Contacts (Chile / Antofagasta / Thomas Semerich)
    // ============================================================
    if (!SKIP_CLEANUP_CONTACTS) {
    const cleanContactsContext = await browser.newContext();
    const cleanContactsPage    = await cleanContactsContext.newPage();

    const loginPageContacts = new LoginPage(cleanContactsPage);
    const homePageContacts  = new HomePage(cleanContactsPage);
    const contactPageClean  = new ContactPage(cleanContactsPage);

    await test.step('beforeEach II: Clean Contacts (Login → List → Filters → Delete)', async () => {
      // II.1: Login and navigate to Contacts
      console.log('beforeEach II.1: Logging in for Contacts cleanup');
      await loginPageContacts.navigateTo(baseUrl);
      await loginPageContacts.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageContacts.dismissLocationPermissionDialog();
      await homePageContacts.navigateToContactsFromHome();
      await homePageContacts.waitForPageReady();
      console.log('\u2713 beforeEach II.1: Navigated to Contacts page');
      // II.2: Remove active filter and switch to list view
      await contactPageClean.removeMyPipelineFilter();
      await contactPageClean.clickViewListButtonIfVisible();
      console.log('\u2713 beforeEach II.2: List view ready');
      // II.3: Filter Salesperson = Thomas Semerich
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Salesperson');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Thomas Semerich');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.3: Salesperson filter applied');
      // II.4: Filter Country = Chile
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Country');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Chile');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.4: Country filter applied');
      // II.5: Filter State = Antofagasta
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('State');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Antofagasta');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.5: State filter applied');
      // II.6: Filter Active = is true
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Active');
      await contactPageClean.selectCustomFilterOperator('is true');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('\u2713 beforeEach II.6: Active filter applied');
      // II.7: Check and delete qualified Contacts
      const isEmpty = await contactPageClean.isRecordListEmpty();
      if (isEmpty) {
        console.log('\u2713 beforeEach II.7: No qualified Contacts found - skipping delete');
      } else {
        console.log('  \u26a0 Qualified Contacts found - proceeding to delete');
        await contactPageClean.clickSelectAllCheckbox();
        await contactPageClean.clickListActionMenu();
        await contactPageClean.clickListActionDelete();
        await contactPageClean.confirmDeleteDialog();
        console.log('\u2713 beforeEach II.7: Qualified Contacts deleted');
      }
    });

    await cleanContactsContext.close();
    console.log('\u2713 beforeEach II: Contacts cleanup browser closed');
    } // end !SKIP_CLEANUP_CONTACTS
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized');
    }

    // ==============================================================
    // IX. TEAR DOWN: Clean up test data (runs always, pass or fail)
    // ==============================================================
    console.log('\n=== IX. TEAR DOWN ===');

    const teardownPage = new ContactPage(page);

    await test.step('IX.1: Delete Distributor#1', async () => {
      if (!url_Distributor1) { console.log('  \u26a0 No URL for Distributor#1 - skipping'); return; }
      console.log(`Step IX.1: Deleting Distributor#1 at ${url_Distributor1}`);
      await teardownPage.deleteContactByURL(url_Distributor1);
      console.log('\u2713 IX.1: Distributor#1 deleted');
    });

    await test.step('IX.2: Delete Reseller#1', async () => {
      if (!url_Reseller1) { console.log('  \u26a0 No URL for Reseller#1 - skipping'); return; }
      console.log(`Step IX.2: Deleting Reseller#1 at ${url_Reseller1}`);
      await teardownPage.deleteContactByURL(url_Reseller1);
      console.log('\u2713 IX.2: Reseller#1 deleted');
    });

    await test.step('IX.3: Delete EndUser#1', async () => {
      if (!url_EndUser1) { console.log('  \u26a0 No URL for EndUser#1 - skipping'); return; }
      console.log(`Step IX.3: Deleting EndUser#1 at ${url_EndUser1}`);
      await teardownPage.deleteContactByURL(url_EndUser1);
      console.log('\u2713 IX.3: EndUser#1 deleted');
    });

    await test.step('IX.4: Delete Opp#1', async () => {
      if (!url_Opp1) { console.log('  \u26a0 No URL for Opp#1 - skipping'); return; }
      console.log(`Step IX.4: Deleting Opp#1 at ${url_Opp1}`);
      await teardownPage.deleteContactByURL(url_Opp1);
      console.log('\u2713 IX.4: Opp#1 deleted');
    });

    await test.step('IX.5: Close all browsers', async () => {
      console.log('Step IX.5: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) await p.close();
      }
      console.log('\u2713 IX.5: All browsers closed');
    });

    url_Distributor1 = '';
    url_Reseller1    = '';
    url_EndUser1     = '';
    url_Opp1         = '';
    email_EndUser1   = '';
  });

  test('CRM-2338_1.1.2: Verify the Deal Element.Distributor getting from Opp.Distributor', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const contactPage     = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId      = 'CRM-2338_1.1.2';
    const timestamp = CommonUtils.generateTimestamp();
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
      await homePage.waitForPageReady();
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

    await test.step('Pre-condition III.3: Save Distributor#1 and copy URL', async () => {
      console.log('Step III.3: Saving Distributor#1 and capturing URL');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_Distributor1 = page.url();
      console.log(`\u2713 URL_Distributor#1 = ${url_Distributor1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.3 - Distributor#1 complete');
    });

    await test.step('Pre-condition III.4: Return to home page', async () => {
      console.log('Step III.4: Returning to home page');
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

    await test.step('Pre-condition V.2: Create EndUser#1', async () => {
      name_EndUser1  = `TEST-EndUser#1_${tcId}_${timestamp}`;
      email_EndUser1 = `Test-EndUser@EndUser-company${timestamp}.com`;
      console.log(`Step V.2: Creating EndUser#1 - Name: "${name_EndUser1}"`);

      await contactPage.clickCreate();
      const result = await contactPage.createContact(
        'Company',
        name_EndUser1,
        email_EndUser1,
        'Chile',
        'BDEU',
        'Antofagasta',
        'Thomas Semerich'
      );
      url_EndUser1 = page.url();
      console.log(`  \u2713 EndUser#1 created (id=${result.contactId})`);
      console.log(`\u2713 URL_EndUser#1 = ${url_EndUser1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.2 - EndUser#1 saved');
    });

    await test.step('Pre-condition V.3: Return to home page', async () => {
      console.log('Step V.3: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('\u2713 Home page loaded');
    });

    // ==============================================================
    // VI. PRE-CONDITION#4: Create Opp#1
    // ==============================================================

    await test.step('Pre-condition VI.1: Navigate to CRM and switch to list view', async () => {
      console.log(`\n=== VI. PRE-CONDITION#4: Create Opp#1 ===`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      console.log('\u2713 CRM list view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.1 - CRM list view');
    });

    await test.step('Pre-condition VI.2: Click CREATE for Opp#1', async () => {
      console.log('Step VI.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.2 - Opp creation form');
    });

    await test.step('Pre-condition VI.3: Fill Opp#1 information', async () => {
      const oppName = `TEST Opp 1 ${tcId}`;
      console.log(`Step VI.3: Filling Opp#1 - Name: "${oppName}"`);

      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  \u2713 Opp name: "${oppName}"`);

      await opportunityPage.fillEmail(email_EndUser1);
      console.log(`  \u2713 Email: "${name_EndUser1}" (EndUser#1)`);

      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log('  \u2713 Company Name: "Company Name Opp 1"');

      await opportunityPage.fillStreet('123street');
      console.log('  \u2713 Street: "123street"');

      await opportunityPage.selectCountry('Chile');
      console.log('  \u2713 Country: Chile');

      await opportunityPage.selectState('Antofagasta');
      console.log('  \u2713 State: Antofagasta');

      await opportunityPage.selectSalesTeam('BDEU');
      console.log('  \u2713 Sales Team: BDEU');

      await opportunityPage.selectSalesperson('Thomas Semerich');
      console.log('  \u2713 Salesperson: Thomas Semerich');

      await opportunityPage.uncheckCreatedManually();
      console.log('  \u2713 Created manually: FALSE');

      await opportunityPage.fillReseller(name_Reseller1);
      console.log(`  \u2713 Reseller: "${name_Reseller1}"`);

      await opportunityPage.fillDistributor(name_Distributor1);
      console.log(`  \u2713 Distributor: "${name_Distributor1}"`);

      console.log('\u2713 All Opp#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.3 - Opp#1 fields filled');
    });

    await test.step('Pre-condition VI.4: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step VI.4: Setting Lead form = Download Free Trial');
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.4 - CRM Developer tab');
    });

    await test.step('Pre-condition VI.5: Select Stage = NEW', async () => {
      console.log('Step VI.5: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage = NEW');
    });

    await test.step('Pre-condition VI.6: Save Opp#1 and copy URL', async () => {
      console.log('Step VI.6: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`\u2713 URL_Opp#1 = ${url_Opp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.6 - Opp#1 saved');
    });

    await test.step('Pre-condition VI.7: Refresh page to verify Contact field (up to 5 times)', async () => {
      console.log('Step VI.7: Waiting for Contact field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(name_EndUser1, 5, 60000);
      console.log(`  Contact field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Contact value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.7 - After contact field refresh');
    });

    // ==============================================================
    // VII. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step VII.1: Press "DEAL ELEMENT" button', async () => {
      console.log(`\n=== VII. STEPS TO REPRODUCE ===`);
      console.log('Step VII.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('\u2713 Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.1 - Deal Element form opened');
    });

    // ==============================================================
    // VIII. VERIFICATION POINTS
    // ==============================================================

    await test.step('VIII. Verification - Step 1: Verify Distributor = Name_Distributor#1', async () => {
      console.log(`\n=== VIII. VERIFICATION POINTS ===`);
      const distributorValue = await dealElementPage.getDistributorValue();
      console.log(`  Distributor value received: "${distributorValue}"`);
      console.log(`  Expected                  : "${name_Distributor1}"`);
      expect(distributorValue).toBe(name_Distributor1);
      console.log(`\u2713 VIII.1: Distributor = "${name_Distributor1}" - Distributor correctly set from Opp.Distributor`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.1 - Distributor verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-2338_1.1.2 verification completed successfully');
      console.log(`   Distributor#1     : "${name_Distributor1}"`);
      console.log(`   Reseller#1        : "${name_Reseller1}"`);
      console.log(`   EndUser#1         : "${name_EndUser1}"`);
      console.log(`   URL_Opp#1         : ${url_Opp1}`);
      console.log('   VIII.1: Deal Element.Distributor = Name_Distributor#1 (from Opp.Distributor)');
      console.log('   IX    : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
