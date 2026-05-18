import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-2338 - Opportunity Expected Revenue Calculation
 * Test Case ID: CRM-2338_2.1.6
 *
 * Summary: Verify the "Expected revenue after probability" on Opportunity is re-calculating correctly
 *          after updating Opp.Stage from New to Won
 *          (Salesperson: Sergey Karachin / Sales Team: CMR / Country: Chile / State: Antofagasta)
 *
 * Command to run:
 * npx playwright test --grep "CRM-2338_2\.1\.6:" --project=chromium
 *
 * I. beforeEach - Clean Opps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Sergey Karachin
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * II. beforeEach - Clean Contacts:
 * 1.  Login as admin_crm and navigate to Contacts
 * 2.  Remove "Created by Anh Ho" filter, switch to list view
 * 3.  Filter: Salesperson = Sergey Karachin
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * V.  Pre-condition#3 - Create EndUser#1 (Contact with Pricelist = Public Pricelist_EUR)
 * VI. Pre-condition#4 - Create Opp#1 (NO Reseller, NO Distributor):
 *     - VI.1:  Navigate CRM, switch to list view, click CREATE
 *     - VI.2:  Fill Opp info (name, email, company, street, Chile, Antofagasta, CMR, Sergey Karachin, uncheck created manually)
 *     - VI.3:  CRM Developer tab → Lead form = "Download Free Trial"
 *     - VI.4:  Qualification info tab → all Environment + Info fields
 *     - VI.5:  Fill Expected Closing = current date
 *     - VI.7:  Save and wait
 *     - VI.8:  Copy URL_Opp#1
 *     - VI.9:  Refresh page to verify Contact field (up to 5 times)
 *     - VI.10: Click DEAL ELEMENT
 *     - VI.11: Set Pricelist = Public Pricelist_USD (USD) ; Payment Term = Immediate Payment
 *     - VI.12: Add [A2144B] and [A2145B] to Order Lines (Qty=1, UoM=Socket each)
 *     - VI.13: Save Deal Element
 *     - VI.14: Back to Opportunity
 *     - VI.15: Select Stage = Won via MORE button
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 * 2. Get Total at bottom of Order Lines tab = Total_Subtotal_After_All_Discounts_Opp#1
 * 3. Press the Link of Opportunity to back to Opportunity screen
 * 4. Get Expected Revenue = Expected_Revenue_Opp#1
 * 5. Get Expected After Probability = Expected_Revenue_After_Probability_Opp#1
 *
 * VIII. Verification:
 * 1. Expected_Revenue_Opp#1 = Total_Subtotal_After_All_Discounts_Opp#1
 * 2. Expected_Revenue_After_Probability_Opp#1 = Total_Subtotal_After_All_Discounts_Opp#1 * Opportunity.Stage.Probability / 100
 *
 * IX. Tear down:
 * 1. Delete EndUser#1 via URL_EndUser#1
 * 2. Delete Opp#1 via URL_Opp#1
 * 3. Close all browsers
 */

test.describe('CRM-2338_2.1.6 - Verify the Expected revenue after probability on Opportunity is re-calculating correctly after updating Opp.Stage from New to Won', () => {

  let url_EndUser1 = '';
  let url_Opp1     = '';

  let name_EndUser1  = '';
  let email_EndUser1 = '';

  const product_line1 = '[A2144B]';
  const product_line2 = '[A2145B]';

  test.beforeEach(async ({ browser, context }) => {
    const SKIP_CLEANUP_OPPS     = true; // Toggle to false to re-enable Opps cleanup
    const SKIP_CLEANUP_CONTACTS = true; // Toggle to false to re-enable Contacts cleanup

    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // I. Clean Opps (Chile / Antofagasta / Sergey Karachin)
    // ============================================================
    if (!SKIP_CLEANUP_OPPS) {
    const cleanOppsContext = await browser.newContext();
    const cleanOppsPage   = await cleanOppsContext.newPage();

    const loginPageOpps        = new LoginPage(cleanOppsPage);
    const homePageOpps         = new HomePage(cleanOppsPage);
    const opportunityPageClean = new OpportunityPage(cleanOppsPage);

    await test.step('beforeEach I: Clean Opps (Login → All → Filters → Delete)', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach I.1: Logging in for Opps cleanup');
      await loginPageOpps.navigateTo(baseUrl);
      await loginPageOpps.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageOpps.dismissLocationPermissionDialog();
      await homePageOpps.navigateToCRM();
      await homePageOpps.waitForPageReady();
      console.log('✓ beforeEach I.1: Logged in and navigated to CRM');
      await opportunityPageClean.navigateToAllLeads();
      console.log('✓ beforeEach I.2: Archive > All Opps page loaded');
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
        console.log('✓ beforeEach I.7: No qualified Opps found - skipping delete');
      } else {
        console.log('  ⚠ Qualified Opps found - proceeding to delete');
        await opportunityPageClean.clickSelectAllCheckbox();
        await opportunityPageClean.clickListActionMenu();
        await opportunityPageClean.clickListActionDelete();
        await opportunityPageClean.confirmDeleteDialog();
        console.log('✓ beforeEach I.7: Qualified Opps deleted');
      }
    });

    await cleanOppsContext.close();
    console.log('✓ beforeEach I: Opps cleanup browser closed');
    } // end !SKIP_CLEANUP_OPPS

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

    console.log('\n=== IX. TEAR DOWN ===');

    const teardownPage = new ContactPage(page);

    await test.step('IX.1: Delete EndUser#1', async () => {
      if (!url_EndUser1) { console.log('  ⚠ No URL for EndUser#1 - skipping'); return; }
      console.log(`Step IX.1: Deleting EndUser#1 at ${url_EndUser1}`);
      await teardownPage.deleteContactByURL(url_EndUser1);
      console.log('✓ IX.1: EndUser#1 deleted');
    });

    await test.step('IX.2: Delete Opp#1', async () => {
      if (!url_Opp1) { console.log('  ⚠ No URL for Opp#1 - skipping'); return; }
      console.log(`Step IX.2: Deleting Opp#1 at ${url_Opp1}`);
      await teardownPage.deleteContactByURL(url_Opp1);
      console.log('✓ IX.2: Opp#1 deleted');
    });

    await test.step('IX.3: Close all browsers', async () => {
      console.log('Step IX.3: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) await p.close();
      }
      console.log('✓ IX.3: All browsers closed');
    });

    url_EndUser1   = '';
    url_Opp1       = '';
    email_EndUser1 = '';
  });

  test('CRM-2338_2.1.6: Verify the Expected revenue after probability on Opportunity is re-calculating correctly after updating Opp.Stage from New to Won', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const contactPage     = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId      = 'CRM-2338_2.1.6';
    const timestamp = CommonUtils.generateTimestamp();
    const today     = new Date();
    const todayStr  = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Timestamp      : ${timestamp}`);
    console.log(`  Today          : ${todayStr}`);
    console.log(`  product_line1  : ${product_line1}`);
    console.log(`  product_line2  : ${product_line2}`);

    // ==============================================================
    // V. PRE-CONDITION#3: Create EndUser#1
    // ==============================================================

    await test.step('Pre-condition V.1: Login and navigate to Contacts', async () => {
      console.log(`\n=== V. PRE-CONDITION#3: Create EndUser#1 ===`);
      console.log(`Step V.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('✓ Login successful');
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to Contacts');
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
        'CMR',
        'Antofagasta',
        'Sergey Karachin'
      );
      console.log(`  ✓ EndUser#1 created (id=${result.contactId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.2 - EndUser#1 created');
    });

    await test.step('Pre-condition V.3: Set Pricelist on Sales & Purchases tab', async () => {
      console.log('Step V.3: Setting Pricelist = "Public Pricelist_EUR" on Sales & Purchases tab');
      await contactPage.clickEdit();
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR');
      console.log('✓ V.3: Pricelist set to "Public Pricelist_EUR"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.3 - Pricelist set');
    });

    await test.step('Pre-condition V.4: Save EndUser#1 and copy URL', async () => {
      console.log('Step V.4: Saving EndUser#1 and capturing URL');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_EndUser1 = page.url();
      console.log(`✓ URL_EndUser#1 = ${url_EndUser1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.4 - EndUser#1 complete');
    });

    await test.step('Pre-condition V.5: Return to home page', async () => {
      console.log('Step V.5: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
    });

    // ==============================================================
    // VI. PRE-CONDITION#4: Create Opp#1
    // ==============================================================

    await test.step('Pre-condition VI.1: Navigate to CRM and switch to list view', async () => {
      console.log(`\n=== VI. PRE-CONDITION#4: Create Opp#1 ===`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      console.log('✓ CRM list view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.1 - CRM list view');
    });

    await test.step('Pre-condition VI.2: Click CREATE for Opp#1', async () => {
      console.log('Step VI.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.2 - Opp creation form');
    });

    await test.step('Pre-condition VI.3: Fill Opp#1 information', async () => {
      const oppName = `TEST Opp 1 ${tcId}`;
      console.log(`Step VI.3: Filling Opp#1 - Name: "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  ✓ Opp name: "${oppName}"`);
      await opportunityPage.fillEmail(email_EndUser1);
      console.log(`  ✓ Email: "${email_EndUser1}" (EndUser#1)`);
      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log('  ✓ Company Name: "Company Name Opp 1"');
      await opportunityPage.fillStreet('123street');
      console.log('  ✓ Street: "123street"');
      await opportunityPage.selectCountry('Chile');
      console.log('  ✓ Country: Chile');
      await opportunityPage.selectState('Antofagasta');
      console.log('  ✓ State: Antofagasta');
      await opportunityPage.selectSalesTeam('CMR');
      console.log('  ✓ Sales Team: CMR');
      await opportunityPage.selectSalesperson('Sergey Karachin');
      console.log('  ✓ Salesperson: Sergey Karachin');
      await opportunityPage.uncheckCreatedManually();
      console.log('  ✓ Created manually: FALSE');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.3 - Opp#1 fields filled');
    });

    await test.step('Pre-condition VI.4: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step VI.4: Setting Lead form = Download Free Trial');
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('✓ Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.4 - CRM Developer tab');
    });

    await test.step('Pre-condition VI.5: Click Qualification info tab and fill all fields', async () => {
      console.log('Step VI.5: Filling Qualification info tab');
      await opportunityPage.clickQualificationInfoTab();
      await opportunityPage.fillQualEnvSocket('1');
      console.log('  * Number of socket = 1');
      await opportunityPage.fillQualEnvVms('1');
      console.log('  * VMs = 1');
      await opportunityPage.fillQualEnvPhysicalHosts('1');
      console.log('  * Physical hosts = 1');
      await opportunityPage.fillQualEnvAwsEc2('1');
      console.log('  * AWS EC2 = 1');
      await opportunityPage.fillQualEnvWorkstations('1');
      console.log('  * Workstations = 1');
      await opportunityPage.fillQualEnvOffice365('1');
      console.log('  * Office365 Users = 1');
      await opportunityPage.fillQualEnvOracle('1');
      console.log('  * Oracle Databases = 1');
      await opportunityPage.fillQualEnvTb('1');
      console.log('  * TB = 1');
      await opportunityPage.selectQualInfoLicensingModel('Perpetual');
      console.log('  * Licensing Model = Perpetual');
      await opportunityPage.fillQualInfoUseCase('1');
      console.log('  * Use case(s) = 1');
      await opportunityPage.fillQualInfoRequirement('1');
      console.log('  * Requirement(s) = 1');
      await opportunityPage.fillQualInfoCurrentSolution('Veeam');
      console.log('  * Current solution = Veeam');
      await opportunityPage.fillQualInfoCompetitor('Veeam');
      console.log('  * Competitor = Veeam');
      console.log('✓ VI.5: Qualification info filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.5 - Qualification info filled');
    });

    await test.step('Pre-condition VI.6: Fill Expected Closing = current date', async () => {
      console.log(`Step VI.6: Setting Expected Closing = ${todayStr}`);
      await opportunityPage.fillExpectedClosing(todayStr);
      console.log(`✓ Expected Closing = ${todayStr}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.6 - Expected Closing filled');
    });

    await test.step('Pre-condition VI.7: Save Opp#1 and wait', async () => {
      console.log('Step VI.7: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('✓ Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.7 - Opp#1 saved');
    });

    await test.step('Pre-condition VI.8: Copy URL_Opp#1', async () => {
      console.log('Step VI.8: Capturing URL_Opp#1');
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`✓ URL_Opp#1 = ${url_Opp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.8 - URL_Opp#1 copied');
    });

    await test.step('Pre-condition VI.9: Refresh page to verify Contact field (up to 5 times)', async () => {
      console.log('Step VI.9: Waiting for Contact field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(name_EndUser1, 5, 60000);
      console.log(`  Contact field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Contact value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.9 - After contact field refresh');
    });

    await test.step('Pre-condition VI.10: Click DEAL ELEMENT button', async () => {
      console.log('Step VI.10: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.10 - Deal Element form opened');
    });

    await test.step('Pre-condition VI.11: Set Pricelist = Public Pricelist_USD and Payment Term = Immediate Payment', async () => {
      console.log('Step VI.11: Setting Pricelist and Payment Term');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  ✓ Pricelist = "Public Pricelist_USD"');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  ✓ Payment Term = "Immediate Payment"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.11 - Pricelist and Payment Term set');
    });

    await test.step(`Pre-condition VI.12: Add products ${product_line1} and ${product_line2} to Order Lines`, async () => {
      console.log(`Step VI.12a: Adding product ${product_line1}, Qty=1, UoM=Socket`);
      await dealElementPage.addProductLine(product_line1, 1, 'Socket');
      console.log(`  ✓ Product ${product_line1} added`);
      console.log(`Step VI.12b: Adding product ${product_line2}, Qty=1, UoM=Socket`);
      await dealElementPage.addProductLine(product_line2, 1, 'Socket');
      console.log(`  ✓ Product ${product_line2} added`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.12 - Both products added');
    });

    await test.step('Pre-condition VI.13: Save Deal Element', async () => {
      console.log('Step VI.13: Saving Deal Element');
      await dealElementPage.save();
      console.log('✓ Deal Element saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.13 - Deal Element saved');
    });

    await test.step('Pre-condition VI.14: Back to Opportunity screen', async () => {
      console.log('Step VI.14: Navigating back to Opportunity');
      await dealElementPage.clickBackToOpportunity();
      console.log('✓ Returned to Opportunity screen');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.14 - Back to Opportunity');
    });

    await test.step('Pre-condition VI.15: Select Stage = Won via MORE button', async () => {
      console.log('Step VI.15: Selecting Stage = Won via MORE button');
      await opportunityPage.selectStageViaMore('Won');
      console.log('✓ Stage = Won');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.15 - Stage Won selected');
    });

    // ==============================================================
    // VII. STEPS TO REPRODUCE
    // ==============================================================

    let totalSubtotalAfterAllDiscountsOpp1 = 0;
    let expectedRevenueOpp1               = 0;
    let expectedAfterProbabilityOpp1      = 0;
    let probabilityOpp1                   = 0;

    await test.step('Step VII.1: Press "DEAL ELEMENT" button', async () => {
      console.log(`\n=== VII. STEPS TO REPRODUCE ===`);
      console.log('Step VII.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.1 - Deal Element form opened');
    });

    await test.step('Step VII.2: Get Total_Subtotal_After_All_Discounts_Opp#1', async () => {
      console.log('Step VII.2: Reading Total at bottom of Order Lines tab');
      totalSubtotalAfterAllDiscountsOpp1 = parseFloat((await dealElementPage.getOrderLinesTotal()).toFixed(2));
      console.log(`  ✓ Total_Subtotal_After_All_Discounts_Opp#1 = ${totalSubtotalAfterAllDiscountsOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.2 - Total read');
    });

    await test.step('Step VII.3: Press the Link of Opportunity to back to Opportunity screen', async () => {
      console.log('Step VII.3: Navigating back to Opportunity');
      await dealElementPage.clickBackToOpportunity();
      console.log('✓ Returned to Opportunity screen');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.3 - Back to Opportunity');
    });

    await test.step('Step VII.4: Get Expected Revenue (Expected_Revenue_Opp#1)', async () => {
      console.log('Step VII.4: Reading Expected Revenue from Opportunity');
      expectedRevenueOpp1 = await opportunityPage.getExpectedRevenue();
      console.log(`  ✓ Expected_Revenue_Opp#1 = ${expectedRevenueOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.4 - Expected Revenue read');
    });

    await test.step('Step VII.5: Get Expected After Probability (Expected_Revenue_After_Probability_Opp#1)', async () => {
      console.log('Step VII.5: Reading Expected After Probability and Probability from Opportunity');
      expectedAfterProbabilityOpp1 = await opportunityPage.getExpectedAfterProbability();
      probabilityOpp1              = await opportunityPage.getProbability();
      console.log(`  ✓ Expected_Revenue_After_Probability_Opp#1 = ${expectedAfterProbabilityOpp1}`);
      console.log(`  ✓ Probability                              = ${probabilityOpp1}%`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.5 - Expected After Probability read');
    });

    // ==============================================================
    // VIII. VERIFICATION
    // ==============================================================

    await test.step('VIII.1: Verify Expected_Revenue_Opp#1 = Total_Subtotal_After_All_Discounts_Opp#1', async () => {
      console.log(`\n=== VIII. VERIFICATION ===`);
      console.log(`Step VIII.1: Expected Revenue vs Total Subtotal After All Discounts`);
      console.log(`  Total_Subtotal_After_All_Discounts_Opp#1 : ${totalSubtotalAfterAllDiscountsOpp1}`);
      console.log(`  Expected_Revenue_Opp#1                   : ${expectedRevenueOpp1}`);
      expect(expectedRevenueOpp1, `VIII.1: Expected_Revenue_Opp#1 (${expectedRevenueOpp1}) should equal Total_Subtotal_After_All_Discounts_Opp#1 (${totalSubtotalAfterAllDiscountsOpp1})`).toBe(totalSubtotalAfterAllDiscountsOpp1);
      console.log(`✓ VIII.1: Expected Revenue ${expectedRevenueOpp1} = Total Subtotal ${totalSubtotalAfterAllDiscountsOpp1} — confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.1 - Expected Revenue verified');
    });

    await test.step('VIII.2: Verify Expected_Revenue_After_Probability_Opp#1 = Total * Probability / 100', async () => {
      console.log(`Step VIII.2: Expected After Probability vs Total * Probability / 100`);
      const expectedComputed               = parseFloat((totalSubtotalAfterAllDiscountsOpp1 * probabilityOpp1 / 100).toFixed(2));
      const expectedAfterProbabilityRounded = parseFloat(expectedAfterProbabilityOpp1.toFixed(2));
      console.log(`  Total_Subtotal_After_All_Discounts_Opp#1   : ${totalSubtotalAfterAllDiscountsOpp1}`);
      console.log(`  Probability                                 : ${probabilityOpp1}%`);
      console.log(`  Computed Expected After Probability         : ${expectedComputed}`);
      console.log(`  Expected_Revenue_After_Probability_Opp#1   : ${expectedAfterProbabilityRounded}`);
      expect(expectedAfterProbabilityRounded, `VIII.2: Expected_Revenue_After_Probability_Opp#1 (${expectedAfterProbabilityRounded}) should equal Total * Probability / 100 (${expectedComputed})`).toBe(expectedComputed);
      console.log(`✓ VIII.2: Expected After Probability ${expectedAfterProbabilityRounded} = ${totalSubtotalAfterAllDiscountsOpp1} × ${probabilityOpp1}% / 100 — confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.2 - Expected After Probability verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-2338_2.1.6 verification completed successfully');
      console.log(`   EndUser#1                                  : "${name_EndUser1}"`);
      console.log(`   URL_Opp#1                                  : ${url_Opp1}`);
      console.log(`   Total_Subtotal_After_All_Discounts_Opp#1   : ${totalSubtotalAfterAllDiscountsOpp1}`);
      console.log(`   Expected_Revenue_Opp#1                     : ${expectedRevenueOpp1}`);
      console.log(`   Probability                                 : ${probabilityOpp1}%`);
      console.log(`   Expected_Revenue_After_Probability_Opp#1   : ${expectedAfterProbabilityOpp1}`);
      console.log(`   VIII.1: Expected Revenue = Total Subtotal After All Discounts — confirmed`);
      console.log(`   VIII.2: Expected After Probability = Total × Probability / 100 — confirmed`);
      console.log('   IX    : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
