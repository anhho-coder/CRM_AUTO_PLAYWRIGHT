import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-3523 - Phase 1: Contacts should be assigned to the Company they worked at
 * Test Case ID: CRM-3523_2.2.2
 *
 * Summary: Verify an Individual contact will be created automatically if entering
 *          an email using existing company domain at Lead page
 *
 * Command to run:
 * npx playwright test --grep "CRM-3523_2\.2\.2:" --project=chromium
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
 *       - Contact name = TEST-EndUser#1 CRM-3523_2.2.2 {timestamp}   (= Name_EndUser#1)
 *       - Email        = Test-EndUser@company{timestamp}.com          (= Email_EndUser#1)
 *       - Country = Chile, State = Antofagasta
 *       - Sales Team = BDEU, Salesperson = Thomas Semerich
 *   4.  Press "Sales & Purchases" tab
 *   5.  Pricelist = Public Pricelist_EUR                              (= Pricelist_EndUser#1)
 *   6.  Save and wait
 *   7.  Copy URL_EndUser#1
 *   8.  Press "Application" icon on left-top of screen and wait
 *
 * IV. Condition#1 - Create Lead#1:
 *   1.  Navigate CRM > Leads > Leads, click CREATE
 *   2.  Fill Lead info:
 *       - Lead name    = TEST CRM-3523_2.2.2 {timestamp}
 *       - Email        = Test@company{timestamp}.com                  (= Email_Contact#1)
 *       - Company Name = Company Name Lead 1                          (= Company_Name_Lead#1)
 *       - Street       = 123street
 *       - Country = Chile, State = Antofagasta
 *       - Sales Team = CMR, Salesperson = Sergey Karachin
 *       - Created manually = FALSE
 *   3.  CRM Developer tab - Lead form = "Download Free Trial"
 *   4.  Save and wait
 *   5.  Copy URL_Lead#1
 *   6.  Convert URL_Lead#1 to URL_All_Lead#1 (replace action=149 with action=682)
 *   7.  Navigate to URL_All_Lead#1
 *   8.  Refresh page to verify Company field contains Name_EndUser#1 (up to 5 times, max 5 min)
 *   9.  Mouse over Company field → get URL_EndUser#1
 *
 * V. Verification:
 *   1. Company Name field value = Name_EndUser#1
 *   2. Company field = Hyperlink with value = Name_EndUser#1
 *
 * VI. Tear down:
 *   1. Delete EndUser#1 contact via URL_EndUser#1
 *   2. Delete Lead#1 via URL_Lead#1
 *   3. Close all browsers
 */

test.describe('CRM-3523_2.2.2 - Verify an Individual contact will be created automatically if entering an email using existing company domain at Lead page', () => {

  let url_EndUser1   = '';
  let url_Lead1      = '';
  let email_EndUser1 = '';
  let email_Contact1 = '';

  const SKIP_CLEANUP_OPPS     = false; // Toggle to true to skip Opps cleanup
  const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

  const company_Name_Lead1 = 'Company Name Lead 1';

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);

    const loginPageCleanup   = new LoginPage(page);
    const homePageCleanup    = new HomePage(page);
    const opportunityPageClean = new OpportunityPage(page);
    const contactPageClean   = new ContactPage(page);

    // ============================================================
    // I. Clean Opps (Chile / Antofagasta / Sergey Karachin)
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

    await test.step('VI.2: Delete Lead#1', async () => {
      if (!url_Lead1) { console.log('  \u26a0 No URL for Lead#1 - skipping'); return; }
      console.log(`Step VI.2: Deleting Lead#1 at ${url_Lead1}`);
      await teardownPage.deleteContactByURL(url_Lead1);
      console.log('\u2713 VI.2: Lead#1 deleted');
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
    url_Lead1      = '';
    email_EndUser1 = '';
    email_Contact1 = '';
  });

  test('CRM-3523_2.2.2: Verify an Individual contact will be created automatically if entering an email using existing company domain at Lead page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const contactPage     = new ContactPage(page);
    const leadPage        = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page); // Used for Company field methods

    const tcId      = 'CRM-3523_2.2.2';
    const timestamp = CommonUtils.generateTimestamp();

    const endUserName  = `TEST-EndUser#1 ${tcId} ${timestamp}`;
    email_EndUser1     = `Test-EndUser@company${timestamp}.com`;

    const leadName     = `TEST ${tcId} ${timestamp}`;
    email_Contact1     = `Test@company${timestamp}.com`;

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID               : ${tcId}`);
    console.log(`  Timestamp           : ${timestamp}`);
    console.log(`  Name_EndUser#1      : ${endUserName}`);
    console.log(`  Email_EndUser#1     : ${email_EndUser1}`);
    console.log(`  Lead name           : ${leadName}`);
    console.log(`  Email_Contact#1     : ${email_Contact1}`);
    console.log(`  Company_Name_Lead#1 : ${company_Name_Lead1}`);

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
    // IV. CONDITION#1: Create Lead#1
    // ==============================================================

    await test.step('Step IV.1: Navigate to CRM > Leads > Leads', async () => {
      console.log(`\n=== IV. CONDITION#1: Create Lead#1 ===`);
      console.log('Step IV.1.1: Navigating to CRM module');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 CRM module loaded');

      console.log('Step IV.1.2: Navigating to Leads menu \u2192 Leads sub-item');
      await homePage.navigateToLeads();
      console.log('\u2713 Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1 - Leads list page');
    });

    await test.step('Step IV.1.2: Click CREATE button', async () => {
      console.log('Step IV.1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('\u2713 Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1.2 - Lead creation form');
    });

    await test.step('Step IV.2: Fill Lead#1 information', async () => {
      console.log('Step IV.2: Filling Lead#1 fields');

      console.log(`  2.1: Lead name = "${leadName}"`);
      await leadPage.fillLeadOpportunity(leadName);

      console.log(`  2.2: Email (Email_Contact#1) = "${email_Contact1}"`);
      await leadPage.fillEmail(email_Contact1);

      console.log(`  2.3: Company Name (Company_Name_Lead#1) = "${company_Name_Lead1}"`);
      await leadPage.fillCompanyName(company_Name_Lead1);

      console.log('  2.4: Street = "123street"');
      await leadPage.fillStreet('123street');

      console.log('  2.5: Country = "Chile"');
      await leadPage.selectCountry('Chile');

      console.log('  2.6: State = "Antofagasta"');
      await leadPage.selectState('Antofagasta');

      console.log('  2.7: Sales Team = "CMR"');
      await leadPage.selectSalesTeam('CMR');

      console.log('  2.8: Salesperson = "Sergey Karachin"');
      await leadPage.selectSalesperson('Sergey Karachin');

      console.log('  2.9: Created manually = FALSE (uncheck if checked)');
      await leadPage.uncheckCreatedManually();

      console.log('\u2713 All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.2 - Lead#1 fields filled');
    });

    await test.step('Step IV.3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step IV.3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('\u2713 CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await leadPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.3 - CRM Developer tab');
    });

    await test.step('Step IV.4: Save Lead#1', async () => {
      console.log('Step IV.4: Saving Lead#1');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.4 - Lead#1 saved');
    });

    await test.step('Step IV.5: Copy URL_Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`Step IV.5: URL_Lead#1 = ${url_Lead1}`);
      console.log('✓ URL_Lead#1 captured');
    });

    let url_All_Lead1 = '';

    await test.step('Step IV.6: Convert URL_Lead#1 to URL_All_Lead#1 (action=149 → action=682)', async () => {
      console.log('Step IV.6: Converting URL_Lead#1 to URL_All_Lead#1');
      console.log(`  Original URL_Lead#1: ${url_Lead1}`);
      url_All_Lead1 = url_Lead1.replace(/action=149/g, 'action=682');
      console.log(`  Converted URL_All_Lead#1: ${url_All_Lead1}`);
      console.log('✓ URL converted (action=149 → action=682)');
    });

    await test.step('Step IV.7: Navigate to URL_All_Lead#1', async () => {
      console.log(`Step IV.7: Navigating to URL_All_Lead#1`);
      await page.goto(url_All_Lead1);
      await leadPage.waitForPageReady();
      console.log('✓ All_Lead#1 page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.7 - All_Lead#1 page');
    });

    await test.step('Step IV.8: Refresh page to verify Company field contains Name_EndUser#1 (up to 5 times, max 5 min)', async () => {
      console.log('Step IV.8: Waiting for Company field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(endUserName, 5, 60000);
      console.log(`  Company field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Company field value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.8 - After company field refresh');
    });

    await test.step('Step IV.9: Mouse move to Company field and get URL (URL_EndUser#1)', async () => {
      console.log('Step IV.9: Hovering over Company field to get URL');
      const companyHref = await opportunityPage.getCompanyFieldUrl();
      if (companyHref) {
        console.log(`✓ Company field URL (EndUser#1) = ${companyHref}`);
      } else {
        console.log('  ⚠ Could not retrieve Company field URL');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.9 - Company field URL retrieved');
    });

    // ==============================================================
    // V. VERIFICATION
    // ==============================================================

    let companyNameFieldValue = '';
    let companyFieldText      = '';

    await test.step('Step V.1: Verify Company Name field = Name_EndUser#1', async () => {
      console.log(`\n=== V. VERIFICATION ===`);
      console.log('Step V.1: Reading Company Name field value');
      companyNameFieldValue = await opportunityPage.getCompanyNameReadonly();
      console.log(`  Company Name field value  : "${companyNameFieldValue}"`);
      console.log(`  Expected (Name_EndUser#1) : "${endUserName}"`);
      expect(companyNameFieldValue, `V.1: Company Name field ("${companyNameFieldValue}") should equal "${endUserName}"`).toContain(endUserName);
      console.log(`\u2713 V.1: Company Name field = "${endUserName}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.1 - Company Name field verified');
    });

    await test.step('Step V.2: Verify Company field is a Hyperlink with value = Name_EndUser#1', async () => {
      console.log('Step V.2: Verifying Company field is a hyperlink with correct text');
      companyFieldText = (await opportunityPage.getCompanyFieldValue()) || '';
      const companyFieldHref = await opportunityPage.getCompanyFieldUrl();
      console.log(`  Company field text        : "${companyFieldText}"`);
      console.log(`  Company field href        : "${companyFieldHref}"`);
      console.log(`  Expected (Name_EndUser#1) : "${endUserName}"`);
      expect(companyFieldText.trim(), `V.2: Company field text ("${companyFieldText.trim()}") should equal "${endUserName}"`).toContain(endUserName);
      expect(companyFieldHref, 'V.2: Company field must be a hyperlink (href must be non-empty)').not.toBe('');
      console.log(`\u2713 V.2: Company field is a hyperlink with text "${companyFieldText.trim()}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.2 - Company field hyperlink verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-3523_2.2.2 verification completed successfully');
      console.log(`   Name_EndUser#1      : "${endUserName}"`);
      console.log(`   Email_EndUser#1     : "${email_EndUser1}"`);
      console.log(`   URL_EndUser#1       : ${url_EndUser1}`);
      console.log(`   Lead name           : "${leadName}"`);
      console.log(`   Email_Contact#1     : "${email_Contact1}"`);
      console.log(`   Company_Name_Lead#1 : "${company_Name_Lead1}"`);
      console.log(`   URL_Lead#1          : ${url_Lead1}`);
      console.log(`   V.1: Company Name field = "${endUserName}" - confirmed`);
      console.log(`   V.2: Company field is a hyperlink with text "${endUserName}" - confirmed`);
      console.log('   VI  : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});