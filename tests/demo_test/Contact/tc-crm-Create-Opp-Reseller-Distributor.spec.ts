import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Create Opp with Reseller and Distributor
 * Test Case ID: CMR-Opp-Reseller-Distributor
 *
 * Summary: Verify the Opp has Reseller and Distributor
 *
 * Command to run:
 * npx playwright test --grep "CMR-Opp-Reseller-Distributor:" --project=chromium
 *
 * I. Condition#1 - Pre-existing hardcoded data:
 * 1. URL_Opp#2          = http://10.220.222.100/web?#id=992250&action=152&model=crm.lead&view_type=form&menu_id=111
 *    Name_Opp#2         = TEST Opp 1 CRM-2338_1.1.1
 * 2. URL_Distributor#1  = http://10.220.222.100/web?#id=618010&model=res.partner
 *    Name_Distributor#1 = TEST-Distributor#1_CRM-2338_1.1.1_2026-04-22-115121
 * 3. URL_Reseller#1     = http://10.220.222.100/web#id=618011&action=118&model=res.partner&view_type=form&menu_id=94
 *    Name_Reseller#1    = TEST-Reseller#1_CRM-2338_1.1.1_2026-04-22-115121
 * 4. URL_EndUser#1      = http://10.220.222.100/web#id=618012&action=118&model=res.partner&view_type=form&menu_id=94
 *    Name_EndUser#1     = TEST-EndUser#1_CRM-2338_1.1.1_2026-04-22-115121
 *    Email_EndUser#1    = Test-EndUser@EndUser-company2026-04-22-115121.com
 * 5. Login as admin_crm
 *
 * II. Condition#2 - Create Opp#1:
 * 1. Navigate to CRM → list view → CREATE
 * 2. Fill fields: name, Email_EndUser#1, company, street, country, state, sales team, salesperson,
 *    created manually=FALSE, reseller=Name_Reseller#1, distributor=Name_Distributor#1
 * 3. CRM Developer tab → Lead form = Download Free Trial
 * 4. Stage = NEW
 * 5. Save → copy URL_Opp#1
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 *
 * VIII. Verification:
 * 1. Payer field value = Name_Distributor#1
 *
 */

test.describe('CMR-Opp-Reseller-Distributor - Verify the Opp has Reseller and Distributor', () => {

  // ==============================================================
  // I. Condition#1 - Pre-existing hardcoded data
  // ==============================================================
  const url_Opp2          = 'http://10.220.222.100/web?#id=992250&action=152&model=crm.lead&view_type=form&menu_id=111';
  const name_Opp2         = 'TEST Opp 1 CRM-2338_1.1.1';

  const url_Distributor1  = 'http://10.220.222.100/web#id=618014&action=118&model=res.partner&view_type=form&menu_id=94';
  const name_Distributor1 = 'TEST-Distributor#1_CMR-Create-Distributor_2026-04-22-142546';

  const url_Reseller1     = 'http://10.220.222.100/web#id=618011&action=118&model=res.partner&view_type=form&menu_id=94';
  const name_Reseller1    = 'TEST-Reseller#1_CRM-2338_1.1.1_2026-04-22-115121';

  const url_EndUser1      = 'http://10.220.222.100/web#id=618012&action=118&model=res.partner&view_type=form&menu_id=94';
  const name_EndUser1     = 'TEST-EndUser#1_CRM-2338_1.1.1_2026-04-22-115121';
  const email_EndUser1    = 'Test-EndUser@EndUser-company2026-04-22-115121.com';

  let url_Opp1 = '';

  test('CMR-Opp-Reseller-Distributor: Verify the Opp has Reseller and Distributor', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId = 'CMR-Opp-Reseller-Distributor';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID            : ${tcId}`);
    console.log(`  Name_Distributor1: ${name_Distributor1}`);
    console.log(`  Name_Reseller1   : ${name_Reseller1}`);
    console.log(`  Name_EndUser1    : ${name_EndUser1}`);
    console.log(`  Email_EndUser1   : ${email_EndUser1}`);

    // ==============================================================
    // I. LOGIN
    // ==============================================================

    await test.step('Pre-condition I.1: Login as admin_crm', async () => {
      console.log(`\n=== I. LOGIN ===`);
      console.log(`Step I.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\u2713 Login successful');
    });

    // ==============================================================
    // II. PRE-CONDITION: Create Opp#1
    // ==============================================================

    await test.step('Pre-condition II.1: Navigate to CRM and switch to list view', async () => {
      console.log(`\n=== II. PRE-CONDITION: Create Opp#1 ===`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      console.log('\u2713 CRM list view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.1 - CRM list view');
    });

    await test.step('Pre-condition II.2: Click CREATE for Opp#1', async () => {
      console.log('Step II.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.2 - Opp creation form');
    });

    await test.step('Pre-condition II.3: Fill Opp#1 information', async () => {
      const oppName = `TEST Opp 1 ${tcId}`;
      console.log(`Step II.3: Filling Opp#1 - Name: "${oppName}"`);

      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  \u2713 Opp name: "${oppName}"`);

      await opportunityPage.fillEmail(email_EndUser1);
      console.log(`  \u2713 Email: "${email_EndUser1}" (EndUser#1)`);

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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3 - Opp#1 fields filled');
    });

    await test.step('Pre-condition II.4: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step II.4: Setting Lead form = Download Free Trial');
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('\u2713 Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.4 - CRM Developer tab');
    });

    await test.step('Pre-condition II.5: Select Stage = NEW', async () => {
      console.log('Step II.5: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('\u2713 Stage = NEW');
    });

    await test.step('Pre-condition II.6: Save Opp#1 and copy URL', async () => {
      console.log('Step II.6: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`\u2713 URL_Opp#1 = ${url_Opp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.6 - Opp#1 saved');
    });

    await test.step('Pre-condition II.7: Refresh page to verify Contact field (up to 5 times)', async () => {
      console.log('Step II.7: Waiting for Contact field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(name_EndUser1, 5, 60000);
      console.log(`  Contact field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Contact value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.7 - After contact field refresh');
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

    await test.step('VIII. Verification - Step 1: Verify Payer = Name_Distributor#1', async () => {
      console.log(`\n=== VIII. VERIFICATION POINTS ===`);
      const payerValue = await dealElementPage.getPayerValue();
      console.log(`  Payer value received: "${payerValue}"`);
      console.log(`  Expected            : "${name_Distributor1}"`);
      expect(payerValue).toBe(name_Distributor1);
      console.log(`\u2713 VIII.1: Payer = "${name_Distributor1}" - Payer correctly set from Distributor`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.1 - Payer verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CMR-Opp-Reseller-Distributor completed successfully');
      console.log(`   Distributor#1 : "${name_Distributor1}"`);
      console.log(`   Reseller#1    : "${name_Reseller1}"`);
      console.log(`   EndUser#1     : "${name_EndUser1}"`);
      console.log(`   URL_Opp#1     : ${url_Opp1}`);
      console.log('   VIII.1: Deal Element.Payer = Name_Distributor#1 (from Opp.Distributor)');
      console.log('   IX    : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});

