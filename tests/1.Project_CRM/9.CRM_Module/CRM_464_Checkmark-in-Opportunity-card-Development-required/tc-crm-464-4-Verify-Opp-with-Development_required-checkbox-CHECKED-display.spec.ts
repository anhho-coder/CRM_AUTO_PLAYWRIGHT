import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-464 - Verify Opps with Development required CHECKED display with custom filter "is true"
 * Test Case ID: CRM-464_4
 *
 * Summary: Verify the Opps with "Development required" checkbox CHECKED display if user does
 * custom filter by "Development required" field with the value "is true"
 *
 * Command to run:
 * npx playwright test --grep "CRM-464_4" --project=chromium
 *
 * I. Pre-condition:
 * 1. After login successful, click at "CRM" button
 *
 * I. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox = TEST Opp 1 + current TC ID
 *    - Email textbox = Company email (with template Test@company + current date + current time.com
 *      (Remember the created email, called Email_Opp#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Opp 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is TRUE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 4. Set the "Development required" checkbox is CHECKED
 * 5. Enter the value of the "Development required" = Test
 * 6. Press "SAVE" button and wait
 * 7. Copy URL of Opp#1, called URL_Opp#1
 * 8. Press "CRM" link on the top of page and wait
 * 9. On "CRM" page, click at "view list" button
 * 10. On "Search" textbox, remove "My Pipeline" and wait
 *
 * II. Steps to reproduce:
 * 1. Press "Filter" dropdown list
 * 2. Then press "Add Custom Filter"
 * 3. On Dropdown_List#1, select "Development required"
 * 4. On Dropdown_List#2, select "is true"
 * 5. Press "APPLY" button
 * 6. On "Search" textbox, enter Email_Opp#1 then enter to start to search
 *
 * III. Verification points:
 * 1. On "Opp" page, the line of "Email" = value of "Email_Opp#1"
 */

test.describe('CRM-464_4 - Verify Opp with Development required CHECKED displays with "is true" filter', () => {

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('  - Loading spinner wait skipped');
      });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('  - Network idle wait skipped');
      });
      await page.waitForTimeout(3000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('CRM-464_4: Verify the Opp with Development required CHECKED displays when filtering by "is true"', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-464_4';
    let opp1Name: string;
    let emailOpp1: string;
    let opp1Id: string;
    let opp1Url: string;

    await test.step('Pre-condition Step 1: Login and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    await test.step('Pre-condition Step 2: Navigate to CRM and switch to list view', async () => {
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM page');
      await opportunityPage.switchToListView();
      console.log('✓ Switched to list view');
    });

    await test.step('Condition #1 Step 1: Click CREATE button', async () => {
      console.log('\n=== CONDITION #1: CREATE OPP#1 ===');
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
    });

    await test.step('Condition #1 Step 2: Enter Opp#1 information', async () => {
      opp1Name = `TEST Opp 1 ${tcId}`;
      emailOpp1 = opportunityPage.generateEmail('Test@company');
      await opportunityPage.fillOpportunityName(opp1Name);
      console.log(`  - Opp Name: ${opp1Name}`);
      await opportunityPage.fillEmail(emailOpp1);
      console.log(`  - Email (Email_Opp#1): ${emailOpp1}`);
      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log(`  - Company Name: Company Name Opp 1`);
      await opportunityPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      await opportunityPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);
      await opportunityPage.selectState('Flanders');
      console.log(`  - State: Flanders`);
      await opportunityPage.clearSalesTeam();
      console.log(`  - Sales Team: Cleared`);
      await opportunityPage.clearSalesperson();
      console.log(`  - Salesperson: Cleared`);
      await opportunityPage.checkCreatedManually();
      console.log(`  - Created Manually: TRUE`);
    });

    await test.step('Condition #1 Step 3: Click CRM Developer tab and set Lead Form = Download Free Trial', async () => {
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
    });

    await test.step('Condition #1 Step 4: Check "Development required" checkbox', async () => {
      await opportunityPage.checkDevRequired();
      console.log(`  - Development required: CHECKED`);
    });

    await test.step('Condition #1 Step 5: Enter value "Test" in "Development required" textbox', async () => {
      await opportunityPage.fillDevRequired('Test');
      console.log(`  - Development required value: Test`);
    });

    await test.step('Condition #1 Step 6: Press SAVE and wait', async () => {
      await opportunityPage.saveAndWaitForCompletion();
      opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      console.log(`✓ Opp#1 saved with ID: ${opp1Id}`);
      console.log(`  URL_Opp#1: ${opp1Url}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Opp#1 Created (ID: ${opp1Id})`);
    });

    await test.step('Condition #1 Step 7: Copy URL_Opp#1', async () => {
      console.log(`✓ URL_Opp#1: ${opp1Url}`);
    });

    await test.step('Condition #1 Step 8: Navigate back to CRM page', async () => {
      await opportunityPage.clickCRMMenuLink();
      await opportunityPage.waitForPageReady();
      console.log('✓ Navigated back to CRM page');
    });

    await test.step('Condition #1 Step 9: Switch to list view', async () => {
      await opportunityPage.switchToListView();
      console.log('✓ Switched to list view');
    });

    await test.step('Condition #1 Step 10: Remove "My Pipeline" filter and wait', async () => {
      await opportunityPage.removeMyPipelineFilter();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ "My Pipeline" filter removed');
    });

    // II. STEPS TO REPRODUCE

    await test.step('Step 1: Press "Filter" dropdown list', async () => {
      console.log('\n=== II. STEPS TO REPRODUCE ===');
      await opportunityPage.clickFilterButton();
      console.log('✓ Filter dropdown opened');
    });

    await test.step('Step 2: Press "Add Custom Filter"', async () => {
      await opportunityPage.clickAddCustomFilter();
      console.log('✓ Add Custom Filter clicked');
    });

    await test.step('Step 3: On Dropdown_List#1 - select "Development required"', async () => {
      await opportunityPage.selectCustomFilterField('Development required');
      console.log('✓ Field "Development required" selected in Dropdown_List#1');
    });

    await test.step('Step 4: On Dropdown_List#2 - select "is true"', async () => {
      await opportunityPage.selectCustomFilterOperator('is true');
      console.log('✓ Operator "is true" selected in Dropdown_List#2');
    });

    await test.step('Step 5: Press "APPLY" button', async () => {
      await opportunityPage.clickApplyFilter();
      console.log('✓ Filter applied');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Custom filter applied');
    });

    await test.step('Step 6: Enter Email_Opp#1 in Search textbox and press Enter', async () => {
      await opportunityPage.searchByEmail(emailOpp1);
      console.log(`✓ Searched by email: ${emailOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Search by Email_Opp#1');
    });

    

    // III. VERIFICATION POINTS

    await test.step('III. Verification - Step 1: Verify the line of "Email" = value of Email_Opp#1 is present', async () => {
      console.log('\n=== III. VERIFICATION POINTS ===');
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      const emailValue = await opportunityPage.getEmailReadonly();
      expect(emailValue).toBe(emailOpp1);
      console.log(`  ✓ III.1: "Email" field = "${emailOpp1}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `III.1 - Opp#1 email verified (${emailOpp1})`);
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-464_4 verification completed successfully');
      console.log(`   Opp#1 (${opp1Id}): Development required=CHECKED (true), value=Test`);
      console.log(`   Custom filter applied: "Development required" = "is true"`);
      console.log(`   III.1: Opp#1 email "${emailOpp1}" is visible in filtered list`);
      console.log('==================================================\n');
    });
  });
});
