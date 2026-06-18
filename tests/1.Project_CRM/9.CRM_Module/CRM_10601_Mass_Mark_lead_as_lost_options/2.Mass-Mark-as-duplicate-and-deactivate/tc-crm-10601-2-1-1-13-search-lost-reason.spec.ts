import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate - "search the Lost Reason" test case.
 * Test Case ID: CRM-10601_2.1.1.13   (Jira: CRM-10762 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Per the manual TC, the user selects "1 won opp + 1 non-won opp" and then tries to search the
 *          Lost Reason. Because the selection includes a Won lead, the action raises an error popup
 *          ("... Won and cannot be marked as lost ...") BEFORE the wizard (and its searchable Lost Reason
 *          field) is reachable - so the Lost-reason search cannot be performed.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.13:" --project=chromium
 *
 * Source manual TC (Jira CRM-10762)
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
 *     6. Try to search Lost reason
 *
 *   Expected Result (step 6) - AS STATED in the manual TC:
 *     6. User is able to search Lost reason
 *
 * IMPORTANT - decision on a self-contradicting manual TC (confirmed with the tester):
 * - The manual step 3 ("Select 1 won opp + 1 non-won opp") appears copy-pasted from the 2.1.1.12 error
 *   TC and contradicts step 6's intent: a Won lead in the selection triggers the error popup, so the
 *   wizard with the searchable Lost Reason never opens. Per the tester's decision, step 3 is mirrored
 *   VERBATIM and this spec instead asserts that the error popup appears (the Lost-reason search is not
 *   reachable with a Won lead selected).
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates a Won Opportunity + a non-won Opportunity.
 */

const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_2.1.1.13 - Search Lost Reason in Mass Mark as Duplicate and Deactivate (won + non-won selection)', () => {
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

  test('CRM-10601_2.1.1.13: Verify user is able to search lost reason when mass mark lost and deactivate', async ({ page }, testInfo) => {
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
      const stamp = opportunityPage.generateOpportunityName('TEST CRM-10762 ');
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

    // Step 3: Select 1 won opp + 1 non-won opp (mirrored verbatim from the manual TC)
    await test.step('Step 3: Select 1 won opp + 1 non-won opp', async () => {
      await opportunityPage.selectOpportunityRowsByNames([wonOppName, nonWonOppName]);
      console.log('✓ Selected the Won + the non-won Opportunity');
    });

    // Step 4: Click Action
    await test.step('Step 4: Click Action', async () => {
      await opportunityPage.clickListActionMenu();
      console.log('✓ Action menu opened');
    });

    // Step 5: Select Mass Mark as duplicate and deactivate (Won lead in selection -> error popup)
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      console.log('✓ Action option selected (a Won lead is in the selection)');
    });

    // Step 6: Try to search Lost reason -> not reachable; the error popup appears instead (see decision note)
    await test.step('Step 6: Try to search Lost reason', async () => {
      // A Won lead is in the selection, so the action raises an error popup instead of opening the
      // Lost-reason wizard - the Lost-reason search is therefore not reachable. (Note: the error popup is
      // itself a modal with a title, so isMassMarkWizardOpen() cannot distinguish it from the wizard;
      // we assert on the error-popup text instead - same approach as TCs 2.1.1.11 / 2.1.1.12.)
      const errorText = await opportunityPage.getMassMarkErrorText();
      console.log(`  - Error popup text: "${errorText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10762 - Won lead blocks the Lost Reason search (error popup)');
      expect(errorText, 'An error popup should appear (Won lead blocks the Lost-reason search)').not.toBe('');
      expect(errorText, 'The error should state Won leads cannot be marked as lost')
        .toMatch(/won.*cannot be marked as lost/i);
      await opportunityPage.dismissMassMarkError();
      console.log('✅ With a Won lead selected, the Lost-reason search is not reachable - the error popup is shown');
    });
  });
});
