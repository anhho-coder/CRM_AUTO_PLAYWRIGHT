import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate - error when a Won lead is selected.
 * Test Case ID: CRM-10601_2.1.1.11   (Jira: CRM-10760 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify the system shows an error popup if the user tries to "Mass Mark as Duplicate and
 *          Deactivate" a Won lead (Won leads cannot be marked as lost).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.11:" --project=chromium
 *
 * Source manual TC (Jira CRM-10760)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *
 *   Expected Result (step 5):
 *     5. Show error popup
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates a Won Opportunity (the Jira precondition only covers login). Selecting
 *   "Mass Mark as Duplicate and Deactivate" on a Won lead surfaces the server warning popup
 *   ("... Won and cannot be marked as lost ...") with no lost-reason wizard.
 */

const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const SKIP_CLEANUP_OPP = false;

test.describe('CRM-10601_2.1.1.11 - Error when mass mark lost and deactivate with a Won lead', () => {
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

  test('CRM-10601_2.1.1.11: Verify system will show error if user mass mark lost and deactivate with a won lead', async ({ page }, testInfo) => {
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

    // Setup (needed for step 3): create a WON Opportunity
    await test.step('Setup: Create a Won Opportunity', async () => {
      await opportunityPage.switchToListView();
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10760 WON ');
      createdOppUrl = await opportunityPage.createWonOpportunityFromList(createdOppName);
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

    // Step 3: Select 1 won opp
    await test.step('Step 3: Select 1 won opp', async () => {
      await opportunityPage.selectOpportunityRowByName(createdOppName);
      console.log('✓ Won Opportunity row selected');
    });

    // Step 4: Click Action
    await test.step('Step 4: Click Action', async () => {
      await opportunityPage.clickListActionMenu();
      console.log('✓ Action menu opened');
    });

    // Step 5: Select Mass Mark as duplicate and deactivate -> error popup
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const errorText = await opportunityPage.getMassMarkErrorText();
      console.log(`  - Error popup text: "${errorText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10760 - Error popup for Won lead');
      expect(errorText, 'An error popup should appear when mass-marking a Won lead').not.toBe('');
      expect(errorText, 'The error should state Won leads cannot be marked as lost')
        .toMatch(/won.*cannot be marked as lost/i);
      await opportunityPage.dismissMassMarkError();
      console.log('✅ System shows the expected error popup for a Won lead');
    });
  });
});
