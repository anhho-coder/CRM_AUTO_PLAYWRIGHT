import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * TC ID: CMR-Opp-Stage-to-Win
 * Summary: Convert Stage to Win
 *
 * Command to run:
 * npx playwright test --grep "CMR-Opp-Stage-to-Win:" --project=chromium
 *
 * I. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox        = TEST Opp 1 CMR-Opp-Stage-to-Win
 *    - Email textbox           = Test@company + current date + current time.com (Email_Opp#1)
 *    - Company Name textbox    = Company Name Opp 1
 *    - Street                  = 123street
 *    - Country                 = Belgium
 *    - State                   = Flanders
 *    - Sales Team              = CMR
 *    - Salesperson             = Sergey Karachin
 *    - Created manually        = FALSE
 * 3. Click at "CRM Developer" tab -> Lead form = Download Free Trial
 * 4. Click at "Qualification info" tab:
 *    4.1 Environment area:
 *        - Number of socket    = 1
 *        - VMs                 = 1
 *        - Physical hosts      = 1
 *        - AWS EC2             = 1
 *        - Workstations        = 1
 *        - Office365 Users     = 1
 *        - Oracle Databases    = 1
 *        - TB                  = 1
 *    4.2 Info area:
 *        - Licensing Model     = Perpetual
 *        - Use case(s)         = 1
 *        - Requirement(s)      = 1
 *        - Current solution    = Veeam
 *        - Competitor          = Veeam
 * 5. At "Expected Closing" field, enter the current date
 * 6. Press "SAVE" button and wait
 * 7. Save and copy URL_Opp#1
 * 8. Refresh page to verify Contact field
 *
 * II. Deal Element:
 * 1. Press "DEAL ELEMENT" button
 * 2. Select:
 *    - Pricelist     = Public Pricelist_USD (USD)
 *    - Payment Term  = Immediate Payment
 * 3. At "Order Lines" section, press "Add a product" and select the first product
 * 4. Press "SAVE" button
 * 5. Press the Link of Opportunity to back to Opportunity screen
 *
 * III. Back on Opp:
 * 1. On "Stage", select Stage = Won
 * 2. Copy URL of Opp#1, called URL_Opp#1
 * 3. Press "Application" icon on left-top of screen and wait
 */

test.describe('CMR-Opp-Stage-to-Win: Convert Stage to Win', () => {

  test('CMR-Opp-Stage-to-Win: Create Opp, Deal Element, and set Stage to Qualified', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId    = 'CMR-Opp-Stage-to-Win';
    const oppName = `TEST Opp 1 ${tcId}`;
    const email   = CommonUtils.generateEmail('Test', 'company');

    // Format today as MM/DD/YYYY (Odoo date input format)
    const today    = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    let urlOpp1 = '';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID     : ${tcId}`);
    console.log(`  Opp name  : ${oppName}`);
    console.log(`  Email     : ${email}`);
    console.log(`  Closing   : ${todayStr}`);

    await test.step('Step 1: Login as admin_crm and navigate to CRM', async () => {
      console.log(`\n=== STEP 1: LOGIN ===`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('* Logged in and navigated to CRM');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - CRM page');
    });

    await test.step('Step 1.1: Switch to list view', async () => {
      console.log('Step 1.1: Switching to list view');
      await opportunityPage.switchToListView();
      console.log('* List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1.1 - Opps list view');
    });

    await test.step('Step 1.2: Click CREATE button', async () => {
      console.log('Step 1.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('* Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1.2 - Opp creation form');
    });

    await test.step('Step 2: Fill Opp#1 information', async () => {
      console.log('\n=== STEP 2: FILL FORM ===');
      console.log(`  2.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  2.2: Email = "${email}"`);
      await opportunityPage.fillEmail(email);
      console.log('  2.3: Company Name = "Company Name Opp 1"');
      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log('  2.4: Street = "123street"');
      await opportunityPage.fillStreet('123street');
      console.log('  2.5: Country = "Belgium"');
      await opportunityPage.selectCountry('Belgium');
      console.log('  2.6: State = "Flanders"');
      await opportunityPage.selectState('Flanders');
      console.log('  2.7: Sales Team = "CMR"');
      await opportunityPage.selectSalesTeam('CMR');
      console.log('  2.8: Salesperson = "Sergey Karachin"');
      await opportunityPage.selectSalesperson('Sergey Karachin');
      console.log('  2.9: Created manually = FALSE');
      await opportunityPage.uncheckCreatedManually();
      console.log('* All main fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Main fields filled');
    });

    await test.step('Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('\n=== STEP 3: CRM DEVELOPER TAB ===');
      await opportunityPage.clickCRMDeveloperTab();
      console.log('* CRM Developer tab activated');
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('* Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - CRM Developer tab');
    });

    await test.step('Step 4: Click Qualification info tab and fill fields', async () => {
      console.log('\n=== STEP 4: QUALIFICATION INFO TAB ===');
      await opportunityPage.clickQualificationInfoTab();
      console.log('* Qualification info tab activated');

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

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Qualification info filled');
    });

    await test.step('Step 5: Fill Expected Closing with current date', async () => {
      console.log(`\n=== STEP 5: EXPECTED CLOSING = ${todayStr} ===`);
      await opportunityPage.fillExpectedClosing(todayStr);
      console.log(`* Expected Closing = ${todayStr}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Expected Closing filled');
    });

    await test.step('Step 6: Press SAVE and wait', async () => {
      console.log('\n=== STEP 6: SAVE OPP#1 ===');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      console.log('* Opp#1 saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Opp#1 saved');
    });

    await test.step('Step I.7: Save and copy URL_Opp#1', async () => {
      console.log('\n=== STEP I.7: COPY URL_OPP#1 ===');
      await opportunityPage.waitForIdInUrlAndExtract();
      urlOpp1 = page.url();
      console.log(`* URL_Opp#1 : ${urlOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step I.7 - URL Opp#1 copied');
    });

    await test.step('Step I.8: Refresh page to verify Contact field', async () => {
      console.log('\n=== STEP I.8: REFRESH PAGE ===');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated('Company Name Opp 1', 5, 60000);
      console.log(`  Contact field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Contact value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step I.8 - Contact field verified');
    });

    await test.step('Step II.1: Click DEAL ELEMENT button', async () => {
      console.log('\n=== STEP II.1: DEAL ELEMENT ===');
      await opportunityPage.clickDealElement();
      console.log('* Deal Element screen opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.1 - Deal Element screen');
    });

    await test.step('Step II.2: Set Pricelist and Payment Term', async () => {
      console.log('\n=== STEP II.2: PRICELIST & PAYMENT TERM ===');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  * Pricelist = Public Pricelist_USD (USD)');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  * Payment Term = Immediate Payment');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.2 - Pricelist and Payment Term');
    });

    await test.step('Step II.3: Add a product (first in list)', async () => {
      console.log('\n=== STEP II.3: ADD PRODUCT ===');
      await dealElementPage.addProduct('');
      console.log('  * First product added to Order Lines');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.3 - Product added');
    });

    await test.step('Step II.4: Save Deal Element', async () => {
      console.log('\n=== STEP II.4: SAVE DEAL ELEMENT ===');
      await dealElementPage.save();
      console.log('* Deal Element saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.4 - Deal Element saved');
    });

    await test.step('Step II.5: Press the Link of Opportunity to back to Opportunity screen', async () => {
      console.log('\n=== STEP II.5: BACK TO OPPORTUNITY ===');
      await dealElementPage.clickBackToOpportunity();
      console.log('* Returned to Opportunity screen');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step II.5 - Back to Opportunity');
    });

    await test.step('Step III.1: Select Stage = Won via MORE button', async () => {
      console.log('\n=== STEP III.1: SELECT STAGE = WON ===');
      await opportunityPage.selectStageViaMore('Won');
      console.log('* Stage set to Won');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.1 - Stage Won selected');
    });

    await test.step('Step III.2: Copy URL_Opp#1', async () => {
      console.log('\n=== STEP III.2: COPY URL_OPP#1 ===');
      urlOpp1 = page.url();
      console.log(`* URL_Opp#1 : ${urlOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.2 - URL Opp#1 copied');
    });

    await test.step('Step III.3: Press Application icon', async () => {
      console.log('\n=== STEP III.3: APPLICATION MENU ===');
      await homePage.clickApplicationMenu();
      console.log('* Application menu opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step III.3 - Application menu');
    });

    await test.step('Final Summary', async () => {
      console.log('\n* TEST COMPLETED: CMR-Opp-Stage-to-Win');
      console.log(`   Opp name  : ${oppName}`);
      console.log(`   Email     : ${email}`);
      console.log(`   URL_Opp#1 : ${urlOpp1}`);
      console.log('==================================================\n');
    });
  });
});
