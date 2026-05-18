import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-3523 - Phase 1: Contacts should be assigned to the Company they worked at
 * Test Case ID: CRM-3523_2.2.1
 *
 * Summary: Verify an Individual contact will be created automatically if entering
 *          an email using existing company domain at Opp page
 *
 * Command to run:
 * npx playwright test --grep "CRM-3523_2\.2\.1:" --project=chromium
 *
 * I. Condition for beforeEach - Clean Opps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Sergey Karachin
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * II. Condition for beforeEach - Clean Contacts:
 * 1.  Login as admin_crm and navigate to Contacts
 * 2.  Remove "Created by Anh Ho" filter, switch to list view
 * 3.  Filter: Salesperson = Sergey Karachin
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * III. Pre-condition#3 - Create EndUser#1:
 *   1.  Navigate to Contacts, click CREATE
 *   2.  Set Company checkbox = TRUE
 *   3.  Fill Contact info:
 *       - Contact name = TEST-EndUser#1 CRM-3523_2.2.1 {timestamp}   (= Name_EndUser#1)
 *       - Email        = Test-EndUser@EndUser-company{timestamp}.com  (= Email_EndUser#1)
 *       - Country = Chile, State = Antofagasta
 *       - Sales Team = BDEU, Salesperson = Thomas Semerich
 *   4.  Press "Sales & Purchases" tab
 *   5.  Pricelist = Public Pricelist_EUR                              (= Pricelist_EndUser#1)
 *   6.  Save and wait
 *   7.  Copy URL_EndUser#1
 *   8.  Press "Application" icon on left-top of screen and wait
 *
 * IV. Condition#4 - Create Opp#1:
 *   1.  Navigate CRM list view, click CREATE
 *   2.  Fill Opp info:
 *       - Opp name    = TEST Opp 1 CRM-3523_2.2.1
 *       - Email       = Email_EndUser#1 (created above)
 *       - Company Name = Company Name Opp 1                          (= Company_Name_Opp#1)
 *       - Street      = 123street
 *       - Country = Chile, State = Antofagasta
 *       - Sales Team = BDEU, Salesperson = Thomas Semerich
 *       - Created manually = FALSE
 *   3.  CRM Developer tab - Lead form = "Download Free Trial"
 *   4.  Stage = New
 *   5.  Save and wait
 *   6.  Copy URL_Opp#1
 *   7.  Refresh page to verify Company field (up to 5 times, max 5 min)
 *
 * V. Verification:
 *   1. Company Name field value = Company_Name_Opp#1
 *   2. Company field = Hyperlink with text = Company_Name_Opp#1
 *
 * VI. Tear down:
 *   1. Delete EndUser#1 contact via URL_EndUser#1
 *   2. Delete Opp#1 via URL_Opp#1
 *   3. Close all browsers
 */

test.describe('CRM-3523_2.2.1 - Verify an Individual contact will be created automatically if entering an email using existing company domain at Opp page', () => {

  let url_EndUser1   = '';
  let url_Opp1       = '';
  let email_EndUser1 = '';

  const SKIP_CLEANUP_OPPS     = false; // Toggle to true to skip Opps cleanup
  const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

  const company_Name_Opp1 = 'Company Name Opp 1';

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);

    const loginPageCleanup     = new LoginPage(page);
    const homePageCleanup      = new HomePage(page);
    const opportunityPageClean = new OpportunityPage(page);
    const contactPageClean     = new ContactPage(page);

    // ============================================================
    // I. Clean Opps (Chile / Antofagasta / Sergey Karachin / Active)
    // ============================================================
    if (!SKIP_CLEANUP_OPPS) {
      await test.step('beforeEach I: Clean Opps (Login - All - Filters - Delete)', async () => {
        test.setTimeout(config.timeouts.test);
        console.log('beforeEach I.1: Logging in for Opps cleanup on recorded page');
        await loginPageCleanup.navigateTo(baseUrl);
        await loginPageCleanup.login(users.admin_crm.username, users.admin_crm.password);
        await loginPageCleanup.dismissLocationPermissionDialog();
        await homePageCleanup.navigateToCRM();
        await homePageCleanup.waitForPageReady();
        console.log('\u2713 beforeEach I.1: Logged in and navigated to CRM');
        await opportunityPageClean.navigateToAllLeads();
        console.log('\u2713 beforeEach I.2: Archive > All Opps page loaded');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Salesperson');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Sergey Karachin');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('\u2713 beforeEach I.3: Salesperson filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Country');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Chile');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('\u2713 beforeEach I.4: Country filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('State');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Antofagasta');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('\u2713 beforeEach I.5: State filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Active');
        await opportunityPageClean.selectCustomFilterOperator('is true');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('\u2713 beforeEach I.6: Active filter applied');
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
    } // end !SKIP_CLEANUP_OPPS

    // ============================================================
    // II. Clean Contacts (Chile / Antofagasta / Sergey Karachin)
    // ============================================================
    if (!SKIP_CLEANUP_CONTACTS) {
      await test.step('beforeEach II: Clean Contacts (Login - List - Filters - Delete)', async () => {
        console.log('beforeEach II.1: Navigating to Contacts cleanup on recorded page');
        await homePageCleanup.clickApplicationMenu();
        await homePageCleanup.navigateToContactsFromHome();
        await homePageCleanup.waitForPageReady();
        console.log('\u2713 beforeEach II.1: Navigated to Contacts page');
        await contactPageClean.removeMyPipelineFilter();
        await contactPageClean.clickViewListButtonIfVisible();
        console.log('\u2713 beforeEach II.2: List view ready');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Salesperson');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Sergey Karachin');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('\u2713 beforeEach II.3: Salesperson filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Country');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Chile');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('\u2713 beforeEach II.4: Country filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('State');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Antofagasta');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('\u2713 beforeEach II.5: State filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Active');
        await contactPageClean.selectCustomFilterOperator('is true');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('\u2713 beforeEach II.6: Active filter applied');
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
    } // end !SKIP_CLEANUP_CONTACTS

    await test.step('beforeEach III: Reset recorded page to fresh login state', async () => {
      console.log('beforeEach III.1: Resetting recorded page to fresh login state');
      await context.clearCookies();
      await context.grantPermissions([]);
      await loginPageCleanup.navigateTo(baseUrl);
      console.log('\u2713 beforeEach III.1: Recorded page reset');
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized');
    }

    console.log('\n=== VI. TEAR DOWN ===');

    const teardownPage = new ContactPage(page);

    await test.step('VI.1: Delete EndUser#1 contact', async () => {
      if (!url_EndUser1) { console.log('  \u26a0 No URL for EndUser#1 - skipping'); return; }
      console.log(`Step VI.1: Deleting EndUser#1 contact at ${url_EndUser1}`);
      await teardownPage.deleteContactByURL(url_EndUser1);
      console.log('\u2713 VI.1: EndUser#1 deleted');
    });

    await test.step('VI.2: Delete Opp#1', async () => {
      if (!url_Opp1) { console.log('  \u26a0 No URL for Opp#1 - skipping'); return; }
      console.log(`Step VI.2: Deleting Opp#1 at ${url_Opp1}`);
      await teardownPage.deleteContactByURL(url_Opp1);
      console.log('\u2713 VI.2: Opp#1 deleted');
    });

    await test.step('VI.3: Close all browsers', async () => {
      console.log('Step VI.3: Closing additional pages in context (main page left for Playwright video save)');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed() && p !== page) await p.close();
      }
      console.log('\u2713 VI.3: Additional browsers closed');
    });

    url_EndUser1   = '';
    url_Opp1       = '';
    email_EndUser1 = '';
  });

  test('CRM-3523_2.2.1: Verify an Individual contact will be created automatically if entering an email using existing company domain at Opp page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const contactPage     = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId      = 'CRM-3523_2.2.1';
    const timestamp = CommonUtils.generateTimestamp();

    const endUserName = `TEST-EndUser#1 ${tcId} ${timestamp}`;
    email_EndUser1    = `Test-EndUser@EndUser-company${timestamp}.com`;

    const oppName = `TEST Opp 1 ${tcId}`;

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID               : ${tcId}`);
    console.log(`  Timestamp           : ${timestamp}`);
    console.log(`  Name_EndUser#1      : ${endUserName}`);
    console.log(`  Email_EndUser#1     : ${email_EndUser1}`);
    console.log(`  Opp name            : ${oppName}`);
    console.log(`  Company_Name_Opp#1  : ${company_Name_Opp1}`);

    // ==============================================================
    // III. PRE-CONDITION: Create EndUser#1 (Company contact)
    // ==============================================================

    await test.step('Step III.1: Login and navigate to Contacts', async () => {
      console.log(`\n=== III. PRE-CONDITION: Create EndUser#1 ===`);
      console.log(`Step III.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\u2713 Login successful');
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to Contacts module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Contacts page');
    });

    await test.step('Step III.2: Click CREATE button', async () => {
      console.log('Step III.2: Clicking CREATE button');
      await contactPage.clickCreate();
      console.log('\u2713 Contact creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.2 - Contact creation form');
    });

    await test.step('Step III.3: Set Company checkbox = TRUE', async () => {
      console.log('Step III.3: Setting Company checkbox = TRUE');
      await contactPage.checkCompanyCheckbox();
      console.log('\u2713 Company type selected');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.3 - Company checkbox set');
    });

    await test.step('Step III.4: Fill EndUser#1 information', async () => {
      console.log('Step III.4: Filling EndUser#1 fields');

      console.log(`  4.1: Contact name (Name_EndUser#1) = "${endUserName}"`);
      await contactPage.fillContactName(endUserName);

      console.log(`  4.2: Email (Email_EndUser#1) = "${email_EndUser1}"`);
      await contactPage.fillEmail(email_EndUser1);

      console.log('  4.3: Country = "Chile"');
      await contactPage.selectCountry('Chile');

      console.log('  4.4: State = "Antofagasta"');
      await contactPage.selectState('Antofagasta');

      console.log('  4.5: Sales Team = "BDEU"');
      await contactPage.selectSalesTeam('BDEU');

      console.log('  4.6: Salesperson = "Thomas Semerich"');
      await contactPage.selectSalesperson('Thomas Semerich');

      console.log('\u2713 All EndUser#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.4 - EndUser#1 fields filled');
    });

    await test.step('Step III.5: Press Sales & Purchases tab and set Pricelist', async () => {
      console.log('Step III.5: Clicking Sales & Purchases tab');
      await contactPage.clickSalesPurchasesTab();
      console.log('\u2713 Sales & Purchases tab activated');

      console.log('  5.1: Pricelist (Pricelist_EndUser#1) = "Public Pricelist_EUR"');
      await contactPage.selectPricelist('Public Pricelist_EUR');
      console.log('\u2713 Pricelist set to "Public Pricelist_EUR"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.5 - Sales & Purchases tab - Pricelist set');
    });

    await test.step('Step III.6: Save EndUser#1', async () => {
      console.log('Step III.6: Saving EndUser#1');
      await contactPage.clickSave();
      await contactPage.waitForSaveComplete();
      console.log('\u2713 EndUser#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.6 - EndUser#1 saved');
    });

    await test.step('Step III.7: Copy URL_EndUser#1', async () => {
      url_EndUser1 = page.url();
      console.log(`Step III.7: URL_EndUser#1 = ${url_EndUser1}`);
      console.log('\u2713 URL_EndUser#1 captured');
    });

    await test.step('Step III.8: Press Application icon and wait', async () => {
      console.log('Step III.8: Clicking Application menu icon');
      await homePage.clickApplicationMenu();
      console.log('\u2713 Application menu opened');
    });

    // ==============================================================
    // IV. CONDITION#4: Create Opp#1
    // ==============================================================

    await test.step('Step IV.1: Navigate to CRM and switch to list view', async () => {
      console.log(`\n=== IV. CONDITION#4: Create Opp#1 ===`);
      console.log('Step IV.1: Navigating to CRM module');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 CRM module loaded');

      console.log('Step IV.1.1: Switching to list view');
      await opportunityPage.switchToListView();
      console.log('\u2713 CRM list view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1 - CRM list view');
    });

    await test.step('Step IV.1.2: Click CREATE button', async () => {
      console.log('Step IV.1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1.2 - Opp creation form');
    });

    await test.step('Step IV.2: Fill Opp#1 information', async () => {
      console.log('Step IV.2: Filling Opp#1 fields');

      console.log(`  2.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);

      console.log(`  2.2: Email (Email_EndUser#1) = "${email_EndUser1}"`);
      await opportunityPage.fillEmail(email_EndUser1);

      console.log(`  2.3: Company Name (Company_Name_Opp#1) = "${company_Name_Opp1}"`);
      await opportunityPage.fillCompanyName(company_Name_Opp1);

      console.log('  2.4: Street = "123street"');
      await opportunityPage.fillStreet('123street');

      console.log('  2.5: Country = "Chile"');
      await opportunityPage.selectCountry('Chile');

      console.log('  2.6: State = "Antofagasta"');
      await opportunityPage.selectState('Antofagasta');

      console.log('  2.7: Sales Team = "BDEU"');
      await opportunityPage.selectSalesTeam('BDEU');

      console.log('  2.8: Salesperson = "Thomas Semerich"');
      await opportunityPage.selectSalesperson('Thomas Semerich');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await opportunityPage.uncheckCreatedManually();

      console.log('\u2713 All Opp#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.2 - Opp#1 fields filled');
    });

    await test.step('Step IV.3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step IV.3: Clicking CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.3 - CRM Developer tab');
    });

    await test.step('Step IV.4: Select Stage = New', async () => {
      console.log('Step IV.4: Selecting Stage = New');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage = New');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.4 - Stage New selected');
    });

    await test.step('Step IV.5: Save Opp#1', async () => {
      console.log('Step IV.5: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('\u2713 Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.5 - Opp#1 saved');
    });

    await test.step('Step IV.6: Copy URL_Opp#1', async () => {
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`Step IV.6: URL_Opp#1 = ${url_Opp1}`);
      console.log('\u2713 URL_Opp#1 captured');
    });

    await test.step('Step IV.7: Refresh page to verify Company field (up to 5 times, max 5 min)', async () => {
      console.log('Step IV.7: Waiting for Company field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(company_Name_Opp1, 5, 60000);
      console.log(`  Company field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Company field value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.7 - After company field refresh');
    });

    // ==============================================================
    // V. VERIFICATION
    // ==============================================================

    let companyNameFieldValue = '';
    let companyFieldText      = '';

    await test.step('Step V.1: Verify Company Name field = Company_Name_Opp#1', async () => {
      console.log(`\n=== V. VERIFICATION ===`);
      console.log('Step V.1: Reading Company Name field value');
      companyNameFieldValue = await opportunityPage.getCompanyNameReadonly();
      console.log(`  Company Name field value      : "${companyNameFieldValue}"`);
      console.log(`  Expected (Company_Name_Opp#1) : "${company_Name_Opp1}"`);
      expect(companyNameFieldValue, `V.1: Company Name field ("${companyNameFieldValue}") should equal "${company_Name_Opp1}"`).toContain(company_Name_Opp1);
      console.log(`\u2713 V.1: Company Name field = "${company_Name_Opp1}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.1 - Company Name field verified');
    });

    await test.step('Step V.2: Verify Company field is a Hyperlink with value = Company_Name_Opp#1', async () => {
      console.log('Step V.2: Verifying Company field is a hyperlink with correct text');
      companyFieldText = (await opportunityPage.getCompanyFieldValue()) || '';
      const companyFieldHref = await opportunityPage.getCompanyFieldUrl();
      console.log(`  Company field text : "${companyFieldText}"`);
      console.log(`  Company field href : "${companyFieldHref}"`);
      console.log(`  Expected text      : "${company_Name_Opp1}"`);
      expect(companyFieldText.trim(), `V.2: Company field text ("${companyFieldText.trim()}") should equal "${company_Name_Opp1}"`).toContain(company_Name_Opp1);
      expect(companyFieldHref, 'V.2: Company field must be a hyperlink (href must be non-empty)').not.toBe('');
      console.log(`\u2713 V.2: Company field is a hyperlink with text "${companyFieldText.trim()}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.2 - Company field hyperlink verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-3523_2.2.1 verification completed successfully');
      console.log(`   Name_EndUser#1      : "${endUserName}"`);
      console.log(`   Email_EndUser#1     : "${email_EndUser1}"`);
      console.log(`   URL_EndUser#1       : ${url_EndUser1}`);
      console.log(`   Opp name            : "${oppName}"`);
      console.log(`   Company_Name_Opp#1  : "${company_Name_Opp1}"`);
      console.log(`   URL_Opp#1           : ${url_Opp1}`);
      console.log(`   V.1: Company Name field = "${company_Name_Opp1}" - confirmed`);
      console.log(`   V.2: Company field is a hyperlink with text "${companyFieldText}" - confirmed`);
      console.log('   VI  : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
