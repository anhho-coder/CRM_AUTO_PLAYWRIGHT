import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead-to-Opportunity Conversion Test - Merge with an existing opportunity
 * Test Case ID: TC.-A.4.2.1
 * Automation-Type: refactored
 * Automation-Date: 2026-07-06
 *
 * Summary: Verify the converting process of a qualified lead to Opportunity by selecting
 *          "Merge with existing opportunities" is successful.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.4\.2\.1:" --project=chromium
 *
 * Pre-condition:
 * A. Create Lead#1 (Company email X) and convert it to Opportunity#1 (Convert + Link to existing).
 *    - Email            = Company email (template Lead1@company + current date + current time .com)
 *    This establishes an existing Opportunity that Odoo will later detect as a duplicate.
 * B. Create Lead#2 using the SAME Company DOMAIN as X - different local part (so the convert wizard
 *    detects the duplicate by shared domain, NOT by an identical email).
 *    - Email            = Company email (template Lead2@company + current date + current time .com)
 *      NOTE: Lead#2 shares only the DOMAIN of Lead#1 (Lead2@... vs Lead1@..., same company<...>.com).
 *
 * Steps to reproduce (numbering matches the test.step blocks in the code):
 * 1. Press "CONVERT TO OPPORTUNITY" on Lead#2
 * 2. Conversion Action = "Merge with existing opportunities" (only shown because a duplicate exists)
 * 3. On "Opportunities" section, click "Add a line"
 * 4. On "Add: Opportunities" window, enter the email of Lead#1
 * 5. Select Lead#1 by its Opportunity name or email
 * 6. Press "CREATE OPPORTUNITY" to perform the merge
 *
 * Verification:
 * - The "Merge with existing opportunities" option is available (the duplicate was detected), AND
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
    // Two emails that share the SAME DOMAIN but have different local parts (Lead1@... / Lead2@...),
    // so Odoo detects the duplicate by shared DOMAIN - not by an identical email.
    const { lead1Email, lead2Email, domain } = leadPage.generateSameDomainEmails();

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

    // Login and navigate to CRM
    await test.step('Login and click CRM', async () => {
      console.log('Logging in and navigating to CRM');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log(`✓ Logged in and CRM opened (shared domain: ${domain} | Lead#1: ${lead1Email} | Lead#2: ${lead2Email})`);
    });

    // Precondition A: Create Lead#1 and convert it to Opportunity#1
    await test.step('Pre-condition A: Create Lead#1 and convert it to Opportunity#1 (Convert + Link to existing)', async () => {
      console.log('Pre-condition A: Creating Lead#1');
      await homePage.navigateToLeads();
      await leadPage.clickCreate();
      await fillLeadForm(`TEST Lead 1 ${tcId}`, 'Company Name Lead 1', lead1Email);
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

    // Precondition B: Create Lead#2 with the SAME DOMAIN (different local part)
    await test.step('Pre-condition B: Create Lead#2 with the same Company DOMAIN (different email)', async () => {
      console.log(`Pre-condition B: Creating Lead#2 with the same domain only (${lead2Email})`);
      await homePage.navigateToLeads();
      await leadPage.clickCreate();
      await fillLeadForm(`TEST Lead 2 ${tcId}`, 'Company Name Lead 2', lead2Email);
      await leadPage.uncheckCreatedManually();
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      console.log('  - Waiting 1 minute for the Contact to be created in the background...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      console.log('✓ Lead#2 created and saved');
    });

    // Step 1: Open the conversion wizard on Lead#2
    await test.step('Step 1: Press CONVERT TO OPPORTUNITY on Lead#2', async () => {
      console.log('Step 1: Clicking CONVERT TO OPPORTUNITY');
      await leadPage.clickConvertToOpportunity();
      console.log('✓ Conversion wizard opened');
    });

    // Step 2: Select "Merge with existing opportunities"
    await test.step('Step 2: Conversion Action - Merge with existing opportunities', async () => {
      console.log('Step 2: Verifying the merge option is available, then selecting it');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Conversion wizard (merge option)');
      expect(mergeAvailable, '"Merge with existing opportunities" should be available because a duplicate Opportunity exists').toBeTruthy();

      await leadPage.selectConversionActionMerge();
      console.log('✓ Conversion Action set to "Merge with existing opportunities"');
    });

    // Steps 3-5: In the Opportunities section, Add a line -> enter Lead#1's email -> select Lead#1 by name/email
    const lead1OppName = `TEST Lead 1 ${tcId}`;
    await test.step('Step 3-5: Add a line, enter Lead#1 email, select Lead#1 by its Opportunity name or email', async () => {
      console.log('Step 3: Clicking "Add a line" in the Opportunities section');
      console.log(`Step 4: Entering Lead#1 email in the "Add: Opportunities" window: ${lead1Email}`);
      console.log(`Step 5: Selecting Lead#1 by its Opportunity name ("${lead1OppName}") or email (${lead1Email})`);
      // The picker searches the Opportunity NAME field, so target Lead#1 by its name (retry/fallback by email).
      const { rowCount } = await leadPage.addOpportunityToMergeByNameOrEmail(lead1OppName, lead1Email);
      expect(rowCount, 'The "Add: Opportunities" picker should list Lead#1 when searched by its Opportunity name/email').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Opportunity added to merge list');
      console.log(`✓ Lead#1 added to the merge list (${rowCount} row(s) matched)`);
    });

    // Step 6: Perform the merge
    await test.step('Step 6: Press CREATE OPPORTUNITY to perform the merge', async () => {
      console.log('Step 6: Clicking CREATE OPPORTUNITY (merge)');
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());
      console.log(`✓ Merge submitted (resulting Opp URL: ${page.url()})`);
    });

    // Verification: the merged Opportunity shows Stage "New"
    await test.step('Verification: Stage "New" appears on the merged Opportunity', async () => {
      console.log('Verification: Verifying Stage "New" on the merged Opportunity');
      const stageNewVisible = await opportunityPage.isStageNewVisible();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.4.2.1 - Merged Opportunity (Stage New)');

      expect(stageNewVisible, 'Stage "New" should appear on the merged Opportunity').toBeTruthy();
      console.log('✅ Lead merged into the existing Opportunity successfully - Stage "New" is visible');
    });
  });
});
