import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate - search the Lost Reason field.
 * Test Case ID: CRM-10601_1.1.1.13   (Jira: CRM-10749 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-12
 *
 * Summary: Verify the user can search the Lost Reason field in the "Mass Mark as Duplicate" wizard
 *          (typing filters the available Lost Reasons).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_1\.1\.1\.13:" --project=chromium
 *
 * Source manual TC (Jira CRM-10749)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/1. Mass Mark as duplicate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 non-won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate
 *     6. Try to search Lost reason
 *
 *   Expected Result (step 6):
 *     6. User is able to search Lost reason
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates the non_won Opportunity. The test does NOT submit; it Cancels the wizard
 *   so the created Opportunity stays non-won (deletable).
 */

const SEARCH_QUERY = 'Dupl'; // expect the matching Lost Reason "Duplicate" to be filtered in
const SKIP_CLEANUP_OPP = false;

test.describe('CRM-10601_1.1.1.13 - Search Lost Reason in Mass Mark as Duplicate', () => {
  let createdOppUrl = '';
  let createdOppName = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (!SKIP_CLEANUP_OPP && createdOppUrl) {
      await CommonUtils.deleteRecordByUrl(page, createdOppUrl, testInfo).catch((e) => {
        console.log(`  ⚠ Cleanup failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-10601_1.1.1.13: Verify user is able to search lost reason when mass mark lost lead', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    // Pre-condition: Login as Sales Manager
    await test.step('Pre-condition 1: Login as Sales Manager', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log('✓ Logged in as Sales Manager and CRM opened');
    });

    // Setup (needed for step 3): create a non_won Opportunity (Stage = New)
    await test.step('Setup: Create a non_won Opportunity (Stage = New) to act on', async () => {
      await opportunityPage.switchToListView();
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10749 ');
      createdOppUrl = await opportunityPage.createSimpleOpportunityFromList(createdOppName);
    });

    // Step 1: Open CRM module
    await test.step('Step 1: Open CRM module', async () => {
      await opportunityPage.clickCRMMenuLink();
      console.log('✓ CRM module opened');
    });

    // Step 2: Navigate to Opportunities list
    await test.step('Step 2: Navigate to Opportunities list', async () => {
      await opportunityPage.switchToListView();
      console.log('✓ Opportunities list opened');
    });

    // Step 3: Select 1 non-won opp
    await test.step('Step 3: Select 1 non-won opp', async () => {
      await opportunityPage.selectOpportunityRowByName(createdOppName);
      console.log('✓ Opportunity row selected');
    });

    // Step 4: Click Action
    await test.step('Step 4: Click Action', async () => {
      await opportunityPage.clickListActionMenu();
      console.log('✓ Action menu opened');
    });

    // Step 5: Select Mass Mark as duplicate
    await test.step('Step 5: Select Mass Mark as duplicate', async () => {
      await opportunityPage.selectActionMenuOption('Mass Mark as Duplicate');
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate" wizard should open').toMatch(/Mass Mark as Duplicate/i);
    });

    // Step 6: Try to search Lost reason -> user is able to search Lost reason
    await test.step('Step 6: Try to search Lost reason', async () => {
      const options = await opportunityPage.searchMassMarkLostReasonOptions(SEARCH_QUERY);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `CRM-10749 - Lost Reason search "${SEARCH_QUERY}"`);
      expect(options.length, `Searching "${SEARCH_QUERY}" should return at least one Lost Reason`).toBeGreaterThan(0);
      expect(
        options.some((o) => o.toLowerCase().includes(SEARCH_QUERY.toLowerCase())),
        `At least one filtered option should contain "${SEARCH_QUERY}" (search filters the list)`
      ).toBeTruthy();
      // Do not submit - cancel so the created Opportunity stays non-won (and deletable).
      await opportunityPage.cancelMassMarkWizard();
      console.log(`✅ Lost Reason field is searchable - "${SEARCH_QUERY}" filtered to: ${JSON.stringify(options.slice(0, 10))}`);
    });
  });
});
