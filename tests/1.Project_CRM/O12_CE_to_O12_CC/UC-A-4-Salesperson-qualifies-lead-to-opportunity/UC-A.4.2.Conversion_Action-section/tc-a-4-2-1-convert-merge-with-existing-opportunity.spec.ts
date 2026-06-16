import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead-to-Opportunity Conversion Test - Merge with an existing opportunity
 * Test Case ID: TC.-A.4.2.1
 *
 * Summary: Verify the converting process of a qualified lead to Opportunity by selecting
 *          "Merge with existing opportunities" is successful.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.4\.2\.1:" --project=chromium
 *
 * Steps (numbering matches the test.step blocks in the code):
 * 1. Login and click "CRM"
 * 2. Create Lead#1 (name "TEST Lead 1 <TC ID>", Company Name Lead 1, Company email X) and convert it to
 *    Opportunity#1 (Conversion Action = Convert to opportunity; assign Sales Team = CMR, Salesperson =
 *    Sergey Karachin; Customers = Link to an existing customer). This establishes the duplicate Opportunity.
 * 3. Create Lead#2 (name "TEST Lead 2 <TC ID>", Company Name Lead 2) using the SAME Company email X.
 * 4. On Lead#2, press "CONVERT TO OPPORTUNITY".
 * 5. Conversion Action = "Merge with existing opportunities" (only shown because a duplicate exists).
 * 6-8. In the "Opportunities" section: click "Add a line", enter Lead#1's email in the "Search" textbox,
 *      and select the opportunity whose Salesperson = Sergey Karachin and Sales Team = CMR (Lead#1 match).
 * 9. On "Assign this opportunity to" section, set Sales Team = CMR and Salesperson = Sergey Karachin.
 * 10. Press "CREATE OPPORTUNITY" to perform the merge.
 *
 * Verification (Step 11):
 * - The "Merge with existing opportunities" option was available (the duplicate was detected, Step 5), AND
 * - Stage "New" appears on the resulting (merged) Opportunity, signalling success.
 */

const SKIP_CLEANUP_OPP = true; // Toggle to true to skip deleting the created Opportunities

test.describe('TC.-A.4.2.1 - Convert qualified Lead to Opportunity by merging with an existing opportunity', () => {

  const createdOppUrls: string[] = [];

  test.beforeEach(async ({ context, page }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, let Odoo loading spinners settle before Playwright's auto-screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
    // Cleanup: delete every Opportunity created by this test (deduped)
    if (!SKIP_CLEANUP_OPP) {
      for (const url of [...new Set(createdOppUrls)]) {
        console.log(`Cleanup: deleting Opportunity ${url}`);
        await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch(() => {});
      }
    }
  });

  test('TC.-A.4.2.1: Verify the converting process of a qualified lead to Opportunity by selecting "Merge with existing opportunities" is successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    // Test case ID used in the Lead names (format: "TEST Lead <N> <TC ID>", matching CRM-1992)
    const tcId = 'TC.-A.4.2.1';
    // Shared company email so the two leads are detected as duplicates by Odoo
    const sharedEmail = leadPage.generateEmail();

    // Local helper: fill a new Lead form (test-flow code that only calls Page Object methods)
    const fillLeadForm = async (leadName: string, companyName: string, email: string) => {
      await leadPage.fillLeadOpportunity(leadName);
      await leadPage.fillCompanyName(companyName);
      await leadPage.fillEmail(email);
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Connecticut');
      await leadPage.clearSalesTeam();
      await leadPage.clearSalesperson();
      await leadPage.uncheckCreatedManually();
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('License');
    };

    // Step 1: Login and navigate to CRM
    await test.step('Step 1: Login and click CRM', async () => {
      console.log('Step 1: Logging in and navigating to CRM');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log(`✓ Logged in and CRM opened (shared email: ${sharedEmail})`);
    });

    // Precondition A: Create Lead#1 and convert it to Opportunity#1
    await test.step('Step 2: Create Lead#1 and convert it to Opportunity#1 (establish the duplicate)', async () => {
      console.log('Step 2: Creating Lead#1');
      await homePage.navigateToLeads();
      await leadPage.clickCreate();
      await fillLeadForm(`TEST Lead 1 ${tcId}`, 'Company Name Lead 1', sharedEmail);
      await leadPage.uncheckCreatedManually();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  - Waiting 1 minute for the Contact to be created in the background...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);

      console.log('  - Converting Lead#1 to Opportunity#1');
      await leadPage.clickConvertToOpportunity();
      await leadPage.selectConversionActionConvert();
      await leadPage.selectConvertSalesTeam('CMR');
      await leadPage.selectConvertSalesperson('Sergey Karachin');
      await leadPage.selectLinkToExistingCustomer();
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());

      const opp1StageNew = await opportunityPage.isStageNewVisible();
      expect(opp1StageNew, 'Opportunity#1 should be created with Stage New (precondition)').toBeTruthy();
      console.log('✓ Opportunity#1 created with Stage New');
    });

    // Precondition B: Create Lead#2 with the SAME email
    await test.step('Step 3: Create Lead#2 with the same Company email', async () => {
      console.log('Step 3: Creating Lead#2 with the same email');
      await homePage.navigateToLeads();
      await leadPage.clickCreate();
      await fillLeadForm(`TEST Lead 2 ${tcId}`, 'Company Name Lead 2', sharedEmail);
      await leadPage.uncheckCreatedManually();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  - Waiting 1 minute for the Contact to be created in the background...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      console.log('✓ Lead#2 created and saved');
    });

    // Step 4: Open the conversion wizard on Lead#2
    await test.step('Step 4: Click CONVERT TO OPPORTUNITY on Lead#2', async () => {
      console.log('Step 4: Clicking CONVERT TO OPPORTUNITY');
      await leadPage.clickConvertToOpportunity();
      console.log('✓ Conversion wizard opened');
    });

    // Step 5: Select "Merge with existing opportunities"
    await test.step('Step 5: Select Conversion Action - Merge with existing opportunities', async () => {
      console.log('Step 5: Verifying the merge option is available, then selecting it');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Conversion wizard (merge option)');
      expect(mergeAvailable, '"Merge with existing opportunities" should be available because a duplicate Opportunity exists').toBeTruthy();

      await leadPage.selectConversionActionMerge();
      console.log('✓ Conversion Action set to "Merge with existing opportunities"');
    });

    // Steps 6-8: In the Opportunities section, Add a line -> search by email -> select the opportunity matching Lead#1
    await test.step('Step 6-8: Add the existing Opportunity to merge (Add a line, search by email, select Lead#1 match)', async () => {
      console.log('Step 6: Clicking "Add a line" in the Opportunities section');
      console.log(`Step 7: Searching the picker "Search" box by Lead#1 email: ${sharedEmail}`);
      console.log('Step 8: Selecting the opportunity whose Salesperson=Sergey Karachin and Sales Team=CMR (Lead#1 match)');
      await leadPage.addOpportunityToMergeByEmail(sharedEmail, 'Sergey Karachin', 'CMR');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Opportunity added to merge list');
      console.log('✓ Existing Opportunity added to the merge list');
    });

    // Step 9: Assign the merged opportunity (same fields/flow as TC.-A.4.1 Step 8)
    await test.step('Step 9: Assign Sales Team and Salesperson for the merge', async () => {
      console.log('Step 9: Assigning the merge - Sales Team: CMR, Salesperson: Sergey Karachin');
      await leadPage.selectConvertSalesTeam('CMR');
      await leadPage.selectConvertSalesperson('Sergey Karachin');
      console.log('✓ Sales Team and Salesperson assigned for the merge');
    });

    // Step 10: Perform the merge
    await test.step('Step 10: Click CREATE OPPORTUNITY to perform the merge', async () => {
      console.log('Step 10: Clicking CREATE OPPORTUNITY (merge)');
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());
      console.log(`✓ Merge submitted (resulting Opp URL: ${page.url()})`);
    });

    // Step 11: Verify the merged Opportunity shows Stage "New"
    await test.step('Step 11: Verify Stage "New" appears on the merged Opportunity', async () => {
      console.log('Step 11: Verifying Stage "New" on the merged Opportunity');
      const stageNewVisible = await opportunityPage.isStageNewVisible();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Merged Opportunity (Stage New)');

      expect(stageNewVisible, 'Stage "New" should appear on the merged Opportunity').toBeTruthy();
      console.log('✅ Lead merged into the existing Opportunity successfully - Stage "New" is visible');
    });
  });
});
