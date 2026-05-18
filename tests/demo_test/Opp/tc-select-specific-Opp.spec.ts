import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opportunity Search Test
 * Test Case ID: tc-select-specific-Opp
 *
 * Summary: Navigate to CRM > List view, remove "My Pipeline" filter,
 *          search by Company Email, and click the matching Opp row.
 *
 * Command to run:
 * npx playwright test "tests/demo_test/tc-select-specific-Opp.spec.ts" --project=chromium
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
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Search" textbox, remove "My Pipeline" and wait
 * 4. On "Search" textbox, enter value of "Company Email" then enter to start to search
 * 5. On "Opp" page, click at the line of "Email" = value of "Company Email"
 * 6. Verify the following:
 *    6.1. Tag field contains 1 value: "Test"
 *    6.2. Company Name textbox = "Company Name"
 *    6.3. Country dropdown list = China
 *    6.4. Sales Team dropdown list = CMR
 *    6.5. Email textbox = "Company Email"
 * 7. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    7.1. Lead form textbox = the template of "Investment: ID-[InvestmentID]" where [InvestmentID] is
 *         getting the number of 449 in "id=449" of "Investment URL" above
 *    7.2. Active checkbox = TRUE
 *    7.3. Is Won = Pending
 *    7.4. Lost Reason = BLANK
 */

test.describe('tc-select-specific-Opp - Search and select Opportunity by Company Email', () => {

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

  test('tc-select-specific-Opp: Search and select Opportunity by Company Email', async ({ page }, testInfo) => {
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

    // Extract Investment ID from INVESTMENT_URL (e.g. "id=449" → "449")
    const investmentIdMatch = INVESTMENT_URL.match(/[?&#]id=(\d+)/);
    const investmentId = investmentIdMatch ? investmentIdMatch[1] : '';
    const expectedLeadForm = `Investment: ID-${investmentId}`;

    // ---- Steps to reproduce ----

    // Step 1: Click CRM button
    await test.step('Step 1: Click at "CRM" button', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO CRM ===');

      await homePage.navigateToCRM();
      await homePage.waitForPageReady();

      console.log('  ✓ Navigated to CRM page');
    });

    // Step 2: Switch to list view
    await test.step('Step 2: Click "view list" button to switch to list view', async () => {
      console.log('\n=== STEP 2: SWITCH TO LIST VIEW ===');

      await opportunityPage.switchToListView();

      console.log('  ✓ Switched to Opportunity list view');
    });

    // Step 3: Remove "My Pipeline" filter
    await test.step('Step 3: On Search textbox, remove "My Pipeline" filter and wait', async () => {
      console.log('\n=== STEP 3: REMOVE "MY PIPELINE" FILTER ===');

      await opportunityPage.removeMyPipelineFilter();

      console.log('  ✓ Step 3 complete');
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

    // Step 6: Verify fields
    await test.step('Step 6: Verify fields on Opp', async () => {
      console.log('\n=== STEP 6: VERIFY FIELDS ===');

      await test.step('Step 6.1: Tag field contains "Test"', async () => {
        const tagsText = await opportunityPage.getTagsText();
        expect(tagsText).toContain('Test');
        console.log('  ✓ Step 6.1: Tags contain "Test"');
      });

      await test.step('Step 6.2: Company Name textbox = "Company Name"', async () => {
        const companyName = await opportunityPage.getCompanyNameReadonly();
        expect(companyName).toContain(COMPANY_NAME);
        console.log(`  ✓ Step 6.2: Company Name = ${COMPANY_NAME}`);
      });

      await test.step('Step 6.3: Country dropdown list = China', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        expect(addressText).toContain('China');
        console.log('  ✓ Step 6.3: Country = China');
      });

      await test.step('Step 6.4: Sales Team dropdown list = CMR', async () => {
        const salesTeam = await opportunityPage.getSalesTeamValue();
        expect(salesTeam).toContain('CMR');
        console.log('  ✓ Step 6.4: Sales Team = CMR');
      });

      await test.step('Step 6.5: Email textbox = "Company Email"', async () => {
        const email = await opportunityPage.getEmailReadonly();
        expect(email).toContain(COMPANY_EMAIL);
        console.log(`  ✓ Step 6.5: Email = ${COMPANY_EMAIL}`);
      });
    });

    // Step 7: Click CRM Developer tab and verify
    await test.step('Step 7: Click "CRM Developer" tab and verify fields', async () => {
      console.log('\n=== STEP 7: VERIFY CRM DEVELOPER TAB ===');

      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      await test.step(`Step 7.1: Lead form textbox = "${expectedLeadForm}"`, async () => {
        const leadForm = await opportunityPage.getLeadFormValue();
        expect(leadForm).toBe(expectedLeadForm);
        console.log(`  ✓ Step 7.1: Lead form = ${expectedLeadForm}`);
      });

      await test.step('Step 7.2: Active checkbox = TRUE', async () => {
        const isActive = await opportunityPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log('  ✓ Step 7.2: Active = TRUE');
      });

      await test.step('Step 7.3: Is Won = Pending', async () => {
        const isWon = await opportunityPage.getIsWonValue();
        expect(isWon.trim()).toBe('Pending');
        console.log('  ✓ Step 7.3: Is Won = Pending');
      });

      await test.step('Step 7.4: Lost Reason = BLANK', async () => {
        const lostReason = await opportunityPage.getLostReasonValueViaTextContent();
        expect(lostReason).toBe('');
        console.log('  ✓ Step 7.4: Lost Reason = BLANK');
      });
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
  });
});
