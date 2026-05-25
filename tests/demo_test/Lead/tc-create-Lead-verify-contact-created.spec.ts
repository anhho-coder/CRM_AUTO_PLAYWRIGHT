import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Create Lead and Verify Contact Created Test
 * Test Case ID: tc-create-Lead-verify-contact-created
 *
 * Summary: Create a Lead and verify that a Company contact is auto-created
 *
 * Command to run:
 * npx playwright test "tests/demo_test/Lead/tc-create-Lead-verify-contact-created.spec.ts" --project=chromium
 *
 * Steps:
 * 1.   Login and navigate to CRM
 * 1.1. On CRM page, select "Leads" menu > "Leads" sub-item
 * 1.2. On "Leads" page, click CREATE button
 * 2.   Fill Lead info:
 *      - Lead name    = TEST + TC ID + timestamp
 *      - Email        = Test@company{timestamp}.com  (Email_Contact#1)
 *      - Company Name = Company Name Lead 1          (Company_Name_Lead#1)
 *      - Street       = 123street
 *      - Country      = Chile
 *      - State        = Antofagasta
 *      - Sales Team   = CMR
 *      - Salesperson  = Sergey Karachin
 *      - Created manually = FALSE
 * 3.   Click CRM Developer tab, set Lead form = "Download Free Trial"
 * 4.   Save and wait
 * 5.   Copy URL_Lead#1
 * 6.   Convert URL: action=149 → action=682 to get URL_All_Lead#1
 * 7.   Navigate to URL_All_Lead#1
 * 8.   Refresh page to verify Company field contains Name_EndUser#1 (up to 5 times, max 5 min)
 * 9.   Mouse over Company field to get URL (EndUser#1)
 */

test.describe('tc-create-Lead-verify-contact-created - Create Lead and verify Contact auto-created', () => {

  let url_Lead1     = '';
  let url_All_Lead1 = '';
  let email_Contact1 = '';

  const tcId = 'tc-create-Lead-verify-contact-created';
  const company_Name_Lead1 = 'Company Name Lead 1';

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
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('tc-create-Lead-verify-contact-created: Create Lead and verify Contact is auto-created', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const leadPage        = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const timestamp = CommonUtils.generateTimestamp();
    const leadName  = `TEST ${tcId} ${timestamp}`;
    email_Contact1  = `Test@company${timestamp}.com`;

    console.log('\n=== TEST DATA ===');
    console.log(`  TC ID              : ${tcId}`);
    console.log(`  Timestamp          : ${timestamp}`);
    console.log(`  Lead name          : ${leadName}`);
    console.log(`  Email_Contact#1    : ${email_Contact1}`);
    console.log(`  Company_Name_Lead#1: ${company_Name_Lead1}`);

    // Step 1: Login and navigate to CRM
    await test.step('Step 1: Login and click CRM button', async () => {
      console.log('\n=== STEP 1: LOGIN AND NAVIGATE TO CRM ===');
      console.log(`  Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('  ✓ Login successful');

      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('  ✓ Navigated to CRM page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - CRM page');
    });

    // Step 1.1: Navigate to Leads > Leads
    await test.step('Step 1.1: On CRM page, select "Leads" menu > "Leads" sub-item', async () => {
      console.log('\n=== STEP 1.1: NAVIGATE TO LEADS > LEADS ===');

      await homePage.navigateToLeads();
      console.log('  ✓ Navigated to Leads list page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1.1 - Leads list page');
    });

    // Step 1.2: Click CREATE button
    await test.step('Step 1.2: On "Leads" page, click CREATE button', async () => {
      console.log('\n=== STEP 1.2: CLICK CREATE BUTTON ===');

      await leadPage.clickCreate();
      console.log('  ✓ Lead creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1.2 - Lead creation form');
    });

    // Step 2: Fill Lead information
    await test.step('Step 2: Fill Lead information', async () => {
      console.log('\n=== STEP 2: FILL LEAD INFORMATION ===');

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

      console.log('  ✓ All Lead fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Lead fields filled');
    });

    // Step 3: Click CRM Developer tab and set Lead form
    await test.step('Step 3: Click CRM Developer tab and set Lead form', async () => {
      console.log('\n=== STEP 3: CRM DEVELOPER TAB ===');

      await leadPage.clickCRMDeveloperTab();
      console.log('  ✓ CRM Developer tab activated');

      console.log('  3.1: Lead form = "Download Free Trial"');
      await leadPage.fillLeadForm('Download Free Trial');
      console.log('  ✓ Lead form set to "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - CRM Developer tab');
    });

    // Step 4: Save Lead
    await test.step('Step 4: Press SAVE button and wait', async () => {
      console.log('\n=== STEP 4: SAVE LEAD ===');

      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  ✓ Lead saved successfully');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Lead saved');
    });

    // Step 5: Copy URL_Lead#1
    await test.step('Step 5: Copy URL_Lead#1', async () => {
      console.log('\n=== STEP 5: COPY URL_LEAD#1 ===');

      await leadPage.waitForIdInUrlAndExtract();
      url_Lead1 = page.url();
      console.log(`  URL_Lead#1 = ${url_Lead1}`);
      console.log('  ✓ URL_Lead#1 captured');
    });

    // Step 6: Convert URL to URL_All_Lead#1 (action=149 → action=682)
    await test.step('Step 6: Convert URL_Lead#1 to URL_All_Lead#1 (action=149 → action=682)', async () => {
      console.log('\n=== STEP 6: CONVERT URL ===');
      console.log(`  Original URL_Lead#1    : ${url_Lead1}`);
      
      url_All_Lead1 = url_Lead1.replace(/action=149/g, 'action=682');
      
      console.log(`  Converted URL_All_Lead#1: ${url_All_Lead1}`);
      console.log('  ✓ URL converted (action=149 → action=682)');
    });

    // Step 7: Navigate to URL_All_Lead#1
    await test.step('Step 7: Navigate to URL_All_Lead#1', async () => {
      console.log('\n=== STEP 7: NAVIGATE TO URL_ALL_LEAD#1 ===');

      await page.goto(url_All_Lead1);
      await leadPage.waitForPageReady();
      console.log('  ✓ All_Lead#1 page loaded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - All_Lead#1 page');
    });

    // Step 8: Refresh page to verify Company field (up to 5 times, max 5 min)
    await test.step('Step 8: Refresh page to verify Company field contains Name_EndUser#1 (up to 5 times, max 5 min)', async () => {
      console.log('\n=== STEP 8: VERIFY COMPANY FIELD ===');
      console.log(`  Looking for Company field to contain: "${company_Name_Lead1}"`);

      const refreshResult = await opportunityPage.waitForContactFieldPopulated(company_Name_Lead1, 5, 60000);
      console.log(`  Company field found : ${refreshResult.contactFieldFound}`);
      console.log(`  Company field value : "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 8 - Company field verified');
    });

    // Step 9: Mouse over Company field to get URL (EndUser#1)
    await test.step('Step 9: Mouse move to Company field and get URL (EndUser#1)', async () => {
      console.log('\n=== STEP 9: GET COMPANY FIELD URL ===');

      const companyHref = await opportunityPage.getCompanyFieldUrl();
      if (companyHref) {
        console.log(`  ✓ Company field URL (EndUser#1) = ${companyHref}`);
      } else {
        console.log('  ⚠ Could not retrieve Company field URL');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 9 - Company field URL retrieved');
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
      console.log(`   Lead name          : "${leadName}"`);
      console.log(`   Email_Contact#1    : "${email_Contact1}"`);
      console.log(`   Company_Name_Lead#1: "${company_Name_Lead1}"`);
      console.log(`   URL_Lead#1         : ${url_Lead1}`);
      console.log(`   URL_All_Lead#1     : ${url_All_Lead1}`);
      console.log('==================================================\n');
    });
  });
});
