import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opportunity Search Test
 * Test Case ID: tc-select-specific-All-Leads
 *
 * Summary: Verify select specific All Leads
 *
 * Command to run:
 * npx playwright test "tests/demo_test/tc-select-specific-All-Leads.spec.ts" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful
 * 2. Have the following variable and their value:
 *    - "Investment Name"  = TEST Investment 2026-03-16-182740
 *    - "Investment URL"   = http://10.220.222.100/web?debug#id=449&action=2376&model=nakivo.investment.activity&view_type=form&menu_id=866
 *    - "Opp URL"          = http://10.220.222.100/web?#id=984608&action=682&model=crm.lead&view_type=form&menu_id=111
 *    - "Company Name"     = TEST_company_name_2026-03-16-182832
 *    - "Company Email"    = Test@company2026-03-16182832.com
 *
 * Steps to reproduce:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item
 * 3. The "All Leads" page appears
 * 4. On "Search" textbox, enter value of "Company Email" then enter to start to search
 * 5. On "Opp" page, click at the line of "Email" = value of "Company Email"
 */

test.describe('tc-select-specific-All-Leads - Select specific lead from All Leads', () => {

  // Pre-condition variables
  const INVESTMENT_NAME = 'TEST Investment 2026-03-16-182740';
  const INVESTMENT_URL  = 'http://10.220.222.100/web?debug#id=449&action=2376&model=nakivo.investment.activity&view_type=form&menu_id=866';
  const OPP_URL         = 'http://10.220.222.100/web?#id=984608&action=682&model=crm.lead&view_type=form&menu_id=111';
  const COMPANY_NAME    = 'TEST_company_name_2026-03-16-182832';
  const COMPANY_EMAIL   = 'Test@company2026-03-16182832.com';
	

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

  test('tc-select-specific-All-Leads: Select specific lead from All Leads by Company Email', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    // Pre-condition 1: Login
    await test.step('Pre-condition 1: Login', async () => {
      console.log(`\n=== PRE-CONDITION STEP 1: LOGIN ===`);
      console.log(`  Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('  ✓ Login successful');
    });

    // Pre-condition 2: Log the known variables
    await test.step('Pre-condition 2: Known variables', async () => {
      console.log('\n=== PRE-CONDITION STEP 2: KNOWN VARIABLES ===');
      console.log(`  Investment Name : ${INVESTMENT_NAME}`);
      console.log(`  Investment URL  : ${INVESTMENT_URL}`);
      console.log(`  Opp URL         : ${OPP_URL}`);
      console.log(`  Company Name    : ${COMPANY_NAME}`);
      console.log(`  Company Email   : ${COMPANY_EMAIL}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Click CRM button
    await test.step('Step 1: Click at "CRM" button', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO CRM ===');

      await homePage.navigateToCRM();
      await homePage.waitForPageReady();

      console.log('  ✓ Navigated to CRM page');
    });

    // Step 2: Select Archive > All from top menu
    await test.step('Step 2: On "CRM" page, select "Archive" then "All" sub-item from top menu', async () => {
      console.log('\n=== STEP 2: NAVIGATE TO ARCHIVE > ALL ===');

      await opportunityPage.navigateToAllLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      console.log('  ✓ Navigated to Archive > All');
    });

    // Step 3: Verify "All Leads" page appears
    await test.step('Step 3: Verify the "All Leads" page appears', async () => {
      console.log('\n=== STEP 3: VERIFY ALL LEADS PAGE ===');

      // Page visibility already confirmed by navigateToAllLeads()

      console.log('  ✓ All Leads page is displayed');
    });

    // Step 4: Search by Company Email
    await test.step('Step 4: Enter value of "Company Email" in Search and press Enter', async () => {
      console.log('\n=== STEP 4: SEARCH BY COMPANY EMAIL ===');
      console.log(`  Company Email: ${COMPANY_EMAIL}`);

      await opportunityPage.searchByEmail(COMPANY_EMAIL);

      console.log('  ✓ Search applied');
    });

    // Step 5: Click matching Opp row
    await test.step('Step 5: Click the Opp row where Email = Company Email value', async () => {
      console.log('\n=== STEP 5: CLICK MATCHING OPP ROW ===');
      console.log(`  Looking for row with email: ${COMPANY_EMAIL}`);

      await opportunityPage.clickOppRowByEmail(COMPANY_EMAIL);

      console.log('  ✓ Clicked matching Opp row');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
  });
});
