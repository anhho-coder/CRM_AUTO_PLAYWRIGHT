import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-3523 - Phase 1: Contacts should be assigned to the Company they worked at
 * Test Case ID: CRM-3523_1.2
 *
 * Summary: Verify a Company contact will be created automatically if entering
 *          a new Company domain at Lead page
 *
 * Command to run:
 * npx playwright test --grep "CRM-3523_1\.2:" --project=chromium
 *
 * I. Condition for beforeEach - Clean Leads:
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
 * III. Condition#1 - Create Lead#1:
 *   1.  Navigate CRM > Leads > Leads, click CREATE
 *   2.  Fill Lead info:
 *       - Lead name       = TEST CRM-3523_1.2 {timestamp}
 *       - Email           = Test@company{timestamp}.com (Email_Contact#1)
 *       - Company Name    = Company Name Lead 1 (= Company_Name_Lead#1)
 *       - Street          = 123street
 *       - Country         = Chile
 *       - State           = Antofagasta
 *       - Sales Team      = CMR
 *       - Salesperson     = Sergey Karachin
 *       - Created manually = FALSE
 *   3.  CRM Developer tab - Lead form = "Download Free Trial"
 *   4.  Save and wait
 *   5.  Copy URL_Lead#1
 *   6.  Refresh page to verify Company field (up to 5 times, max 5 min)
 *   7.  Get URL of Company field hyperlink = URL_EndUser#1
 *
 * IV. Verification:
 *   1. Company Name field value = Company_Name_Lead#1
 *   2. Company field = Hyperlink with text = Company_Name_Lead#1
 *
 * V. Tear down:
 *   1. Delete auto-created Company contact via URL_EndUser#1
 *   2. Delete Lead#1 via URL_Lead#1
 *   3. Close all browsers
 */

test.describe('CRM-3523_1.2 - Verify a Company contact will be created automatically if entering a new Company domain at Lead page', () => {

  let url_EndUser1   = '';
  let url_Lead1      = '';
  let email_Contact1 = '';

  const company_Name_Lead1 = 'Company Name Lead 1';

  test.beforeEach(async ({ browser, context }) => {
    const SKIP_CLEANUP_LEADS    = true; // Toggle to false to re-enable Leads cleanup
    const SKIP_CLEANUP_CONTACTS = true; // Toggle to false to re-enable Contacts cleanup

    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // I. Clean Leads (Chile / Antofagasta / Sergey Karachin)
    // ============================================================
    if (!SKIP_CLEANUP_LEADS) {
      const cleanLeadsContext = await browser.newContext();
      const cleanLeadsPage    = await cleanLeadsContext.newPage();

      const loginPageLeads       = new LoginPage(cleanLeadsPage);
      const homePageLeads        = new HomePage(cleanLeadsPage);
      const opportunityPageClean = new OpportunityPage(cleanLeadsPage);

      await test.step('beforeEach I: Clean Leads (Login → All → Filters → Delete)', async () => {
        test.setTimeout(config.timeouts.test);
        console.log('beforeEach I.1: Logging in for Leads cleanup');
        await loginPageLeads.navigateTo(baseUrl);
        await loginPageLeads.login(users.admin_crm.username, users.admin_crm.password);
        await loginPageLeads.dismissLocationPermissionDialog();
        await homePageLeads.navigateToCRM();
        await homePageLeads.waitForPageReady();
        console.log('✓ beforeEach I.1: Logged in and navigated to CRM');
        await opportunityPageClean.navigateToAllLeads();
        console.log('✓ beforeEach I.2: Archive > All Leads page loaded');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Salesperson');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Sergey Karachin');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('✓ beforeEach I.3: Salesperson filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Country');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Chile');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('✓ beforeEach I.4: Country filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('State');
        await opportunityPageClean.selectCustomFilterOperator('is equal to');
        await opportunityPageClean.selectCustomFilterValue('Antofagasta');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('✓ beforeEach I.5: State filter applied');
        await opportunityPageClean.clickFilterButton();
        await opportunityPageClean.clickAddCustomFilter();
        await opportunityPageClean.selectCustomFilterField('Active');
        await opportunityPageClean.selectCustomFilterOperator('is true');
        await opportunityPageClean.clickApplyFilter();
        await opportunityPageClean.clickFilterButton();
        console.log('✓ beforeEach I.6: Active filter applied');
        const isEmpty = await opportunityPageClean.isListEmpty();
        if (isEmpty) {
          console.log('✓ beforeEach I.7: No qualified Leads found - skipping delete');
        } else {
          console.log('  ⚠ Qualified Leads found - proceeding to delete');
          await opportunityPageClean.clickSelectAllCheckbox();
          await opportunityPageClean.clickListActionMenu();
          await opportunityPageClean.clickListActionDelete();
          await opportunityPageClean.confirmDeleteDialog();
          console.log('✓ beforeEach I.7: Qualified Leads deleted');
        }
      });

      await cleanLeadsContext.close();
      console.log('✓ beforeEach I: Leads cleanup browser closed');
    } // end !SKIP_CLEANUP_LEADS

    // ============================================================
    // II. Clean Contacts (Chile / Antofagasta / Sergey Karachin)
    // ============================================================
    if (!SKIP_CLEANUP_CONTACTS) {
      const cleanContactsContext = await browser.newContext();
      const cleanContactsPage    = await cleanContactsContext.newPage();

      const loginPageContacts = new LoginPage(cleanContactsPage);
      const homePageContacts  = new HomePage(cleanContactsPage);
      const contactPageClean  = new ContactPage(cleanContactsPage);

      await test.step('beforeEach II: Clean Contacts (Login → List → Filters → Delete)', async () => {
        console.log('beforeEach II.1: Logging in for Contacts cleanup');
        await loginPageContacts.navigateTo(baseUrl);
        await loginPageContacts.login(users.admin_crm.username, users.admin_crm.password);
        await loginPageContacts.dismissLocationPermissionDialog();
        await homePageContacts.navigateToContactsFromHome();
        await homePageContacts.waitForPageReady();
        console.log('✓ beforeEach II.1: Navigated to Contacts page');
        await contactPageClean.removeMyPipelineFilter();
        await contactPageClean.clickViewListButtonIfVisible();
        console.log('✓ beforeEach II.2: List view ready');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Salesperson');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Sergey Karachin');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('✓ beforeEach II.3: Salesperson filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Country');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Chile');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('✓ beforeEach II.4: Country filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('State');
        await contactPageClean.selectCustomFilterOperator('is equal to');
        await contactPageClean.selectCustomFilterValue('Antofagasta');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('✓ beforeEach II.5: State filter applied');
        await contactPageClean.clickFilterButton();
        await contactPageClean.clickAddCustomFilter();
        await contactPageClean.selectCustomFilterField('Active');
        await contactPageClean.selectCustomFilterOperator('is true');
        await contactPageClean.clickApplyFilter();
        await contactPageClean.clickFilterButton();
        console.log('✓ beforeEach II.6: Active filter applied');
        const isEmpty = await contactPageClean.isRecordListEmpty();
        if (isEmpty) {
          console.log('✓ beforeEach II.7: No qualified Contacts found - skipping delete');
        } else {
          console.log('  ⚠ Qualified Contacts found - proceeding to delete');
          await contactPageClean.clickSelectAllCheckbox();
          await contactPageClean.clickListActionMenu();
          await contactPageClean.clickListActionDelete();
          await contactPageClean.confirmDeleteDialog();
          console.log('✓ beforeEach II.7: Qualified Contacts deleted');
        }
      });

      await cleanContactsContext.close();
      console.log('✓ beforeEach II: Contacts cleanup browser closed');
    } // end !SKIP_CLEANUP_CONTACTS
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ Page stabilized');
    }

    console.log('\n=== V. TEAR DOWN ===');

    const teardownPage = new ContactPage(page);

    await test.step('V.1: Delete auto-created Company contact (EndUser#1)', async () => {
      if (!url_EndUser1) { console.log('  ⚠ No URL for EndUser#1 - skipping'); return; }
      console.log(`Step V.1: Deleting auto-created Company contact at ${url_EndUser1}`);
      await teardownPage.deleteContactByURL(url_EndUser1);
      console.log('✓ V.1: Company contact deleted');
    });

    await test.step('V.2: Delete Lead#1', async () => {
      if (!url_Lead1) { console.log('  ⚠ No URL for Lead#1 - skipping'); return; }
      console.log(`Step V.2: Deleting Lead#1 at ${url_Lead1}`);
      await teardownPage.deleteContactByURL(url_Lead1);
      console.log('✓ V.2: Lead#1 deleted');
    });

    await test.step('V.3: Close all browsers', async () => {
      console.log('Step V.3: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) await p.close();
      }
      console.log('✓ V.3: All browsers closed');
    });

    url_EndUser1   = '';
    url_Lead1      = '';
    email_Contact1 = '';
  });

  test('CRM-3523_1.2: Verify a Company contact will be created automatically if entering a new Company domain at Lead page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const leadPage        = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page); // Used for Company field methods (getCompanyFieldValue, getCompanyFieldUrl, getCompanyNameReadonly, waitForContactFieldPopulated)

    const tcId      = 'CRM-3523_1.2';
    const timestamp = CommonUtils.generateTimestamp();

    const leadName = `TEST ${tcId} ${timestamp}`;
    email_Contact1 = `Test@company${timestamp}.com`;

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID               : ${tcId}`);
    console.log(`  Timestamp           : ${timestamp}`);
    console.log(`  Lead name           : ${leadName}`);
    console.log(`  Email_Contact#1     : ${email_Contact1}`);
    console.log(`  Company_Name_Lead#1 : ${company_Name_Lead1}`);

    // ==============================================================
    // III. CONDITION#1: Create Lead#1
    // ==============================================================

    await test.step('Step III.1: Login and navigate to CRM', async () => {
      console.log(`\n=== III. CONDITION#1: Create Lead#1 ===`);
      console.log(`Step III.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('✓ Login successful');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - CRM page');
    });

    await test.step('Step III.1.1: Navigate to CRM > Leads list', async () => {
      console.log('Step III.1.1: Navigating to Leads menu → Leads sub-item');
      await homePage.navigateToLeads();
      console.log('✓ Leads list page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1.1 - Leads list page');
    });

    await test.step('Step III.1.2: Click CREATE button', async () => {
      console.log('Step III.1.2: Clicking CREATE button');
      await leadPage.clickCreate();
      console.log('✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1.2 - Lead creation form');
    });

    await test.step('Step III.2: Fill Lead#1 information', async () => {
      console.log('Step III.2: Filling Lead#1 fields');

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

      console.log('✓ All Lead#1 fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.2 - Lead#1 fields filled');
    });

    await test.step('Step III.3: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step III.3: Clicking CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab activated');
      console.log('  3.1: Lead form = "Download Free Trial"');
      await leadPage.fillLeadForm('Download Free Trial');
      console.log('✓ Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.3 - CRM Developer tab');
    });

    await test.step('Step III.4: Save Lead#1', async () => {
      console.log('Step III.4: Saving Lead#1');
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('✓ Lead#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.4 - Lead#1 saved');
    });

    await test.step('Step III.5: Copy URL of Lead#1', async () => {
      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`Step III.5: URL_Lead#1 = ${url_Lead1}`);
      console.log('✓ URL_Lead#1 captured');
    });

    await test.step('Step III.6: Refresh page to verify Company field (up to 5 times, max 5 min)', async () => {
      console.log('Step III.6: Waiting for Company field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(company_Name_Lead1, 5, 60000);
      console.log(`  Company field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Company field value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.6 - After company field refresh');
    });

    await test.step('Step III.7: Get URL of auto-created Company contact (URL_EndUser#1)', async () => {
      console.log('Step III.7: Getting URL of auto-created Company contact');
      const companyHref = await opportunityPage.getCompanyFieldUrl();
      if (companyHref) {
        url_EndUser1 = companyHref;
        console.log(`✓ URL_EndUser#1 (Company contact) = ${url_EndUser1}`);
      } else {
        console.log('  ⚠ Could not retrieve Company field URL - Company may not have been auto-created yet');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.7 - Company field URL retrieved');
    });

    // ==============================================================
    // IV. VERIFICATION
    // ==============================================================

    let companyNameFieldValue = '';
    let companyFieldText      = '';

    await test.step('Step IV.1: Verify Company Name field = Company_Name_Lead#1', async () => {
      console.log(`\n=== IV. VERIFICATION ===`);
      console.log('Step IV.1: Reading Company Name field value');
      companyNameFieldValue = await opportunityPage.getCompanyNameReadonly();
      console.log(`  Company Name field value       : "${companyNameFieldValue}"`);
      console.log(`  Expected (Company_Name_Lead#1) : "${company_Name_Lead1}"`);
      expect(companyNameFieldValue, `IV.1: Company Name field ("${companyNameFieldValue}") should equal "${company_Name_Lead1}"`).toContain(company_Name_Lead1);
      console.log(`✓ IV.1: Company Name field = "${company_Name_Lead1}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.1 - Company Name field verified');
    });

    await test.step('Step IV.2: Verify Company field is a Hyperlink with value = Company_Name_Lead#1', async () => {
      console.log('Step IV.2: Verifying Company field is a hyperlink with correct text');
      companyFieldText = (await opportunityPage.getCompanyFieldValue()) || '';
      const companyFieldHref = await opportunityPage.getCompanyFieldUrl();
      console.log(`  Company field text : "${companyFieldText}"`);
      console.log(`  Company field href : "${companyFieldHref}"`);
      console.log(`  Expected text      : "${company_Name_Lead1}"`);
      expect(companyFieldText.trim(), `IV.2: Company field text ("${companyFieldText.trim()}") should equal "${company_Name_Lead1}"`).toContain(company_Name_Lead1);
      expect(companyFieldHref, 'IV.2: Company field must be a hyperlink (href must be non-empty)').not.toBe('');
      console.log(`✓ IV.2: Company field is a hyperlink with text "${companyFieldText.trim()}" - confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'IV.2 - Company field hyperlink verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-3523_1.2 verification completed successfully');
      console.log(`   Lead name           : "${leadName}"`);
      console.log(`   Email_Contact#1     : "${email_Contact1}"`);
      console.log(`   Company_Name_Lead#1 : "${company_Name_Lead1}"`);
      console.log(`   URL_Lead#1          : ${url_Lead1}`);
      console.log(`   URL_EndUser#1       : ${url_EndUser1}`);
      console.log(`   IV.1: Company Name field = "${company_Name_Lead1}" - confirmed`);
      console.log(`   IV.2: Company field is a hyperlink with text "${companyFieldText}" - confirmed`);
      console.log('   V   : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
