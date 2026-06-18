import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate - error when a Won lead + a non-won lead are selected together.
 * Test Case ID: CRM-10601_2.1.1.12   (Jira: CRM-10761 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify the system shows an error popup if the selection for "Mass Mark as Duplicate and
 *          Deactivate" contains a Won lead alongside a non-won lead (Won leads cannot be marked as lost).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.12:" --project=chromium
 *
 * Source manual TC (Jira CRM-10761)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 won opp + 1 non-won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *
 *   Expected Result (step 5):
 *     5. Show error popup
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates a Won Opportunity + a non-won Opportunity. Selecting "Mass Mark as Duplicate
 *   and Deactivate" with the Won lead in the selection surfaces the server warning popup naming the Won
 *   lead ("... Won and cannot be marked as lost ...").
 */

const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_2.1.1.12 - Error when mass mark lost and deactivate with a Won lead + a non-won lead', () => {
  let createdOppUrls: string[] = [];
  let wonOppName = '';
  let nonWonOppName = '';

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
    if (!SKIP_CLEANUP_OPPS) {
      for (const url of createdOppUrls) {
        await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch((e) => {
          console.log(`  ⚠ Cleanup failed for ${url} (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    }
  });

  test('CRM-10601_2.1.1.12: Verify system will show error if user mass mark lost and deactivate with won lead + non-won lead', async ({ page }, testInfo) => {
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

    // Setup (needed for step 3): create a Won Opportunity + a non-won Opportunity
    await test.step('Setup: Create a Won Opportunity and a non-won Opportunity', async () => {
      await opportunityPage.switchToListView();
      const stamp = opportunityPage.generateOpportunityName('TEST CRM-10761 ');
      wonOppName = `${stamp}-WON`;
      nonWonOppName = `${stamp}-NONWON`;
      const wonUrl = await opportunityPage.createWonOpportunityFromList(wonOppName);
      createdOppUrls.push(wonUrl);
      await opportunityPage.clickCRMMenuLink();
      await opportunityPage.switchToListView();
      const nonWonUrl = await opportunityPage.createSimpleOpportunityFromList(nonWonOppName);
      createdOppUrls.push(nonWonUrl);
      console.log(`✓ Created Won "${wonOppName}" and non-won "${nonWonOppName}"`);
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

    // Step 3: Select 1 won opp + 1 non-won opp
    await test.step('Step 3: Select 1 won opp + 1 non-won opp', async () => {
      await opportunityPage.selectOpportunityRowsByNames([wonOppName, nonWonOppName]);
      console.log('✓ Selected the Won + the non-won Opportunity');
    });

    // Step 4: Click Action
    await test.step('Step 4: Click Action', async () => {
      await opportunityPage.clickListActionMenu();
      console.log('✓ Action menu opened');
    });

    // Step 5: Select Mass Mark as duplicate and deactivate -> error popup (names the Won lead)
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const errorText = await opportunityPage.getMassMarkErrorText();
      console.log(`  - Error popup text: "${errorText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10761 - Error popup for Won + non-won selection');
      expect(errorText, 'An error popup should appear when the selection includes a Won lead').not.toBe('');
      expect(errorText, 'The error should state Won leads cannot be marked as lost')
        .toMatch(/won.*cannot be marked as lost/i);
      expect(errorText, 'The error should name the Won lead').toContain(wonOppName);
      await opportunityPage.dismissMassMarkError();
      console.log('✅ System shows the expected error popup for the Won + non-won selection');
    });
  });
});
