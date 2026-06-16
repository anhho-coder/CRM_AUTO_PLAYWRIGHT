import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate - cancel the wizard.
 * Test Case ID: CRM-10601_1.1.1.6   (Jira: CRM-10738 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-12
 *
 * Summary: Verify the user can cancel the "Mass Mark as Duplicate" wizard: the popup disappears
 *          without error and nothing is marked lost.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_1\.1\.1\.6:" --project=chromium
 *
 * Source manual TC (Jira CRM-10738)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/1. Mass Mark as duplicate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 10 non_won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate
 *     6. Click Cancel
 *
 *   Expected Result (step 6):
 *     6. Popup disappears without error
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates the 10 non_won Opportunities (the Jira precondition only covers login).
 * - Cancelling leaves all created Opportunities non-won, so teardown can delete them.
 */

const LEAD_COUNT = 10;
const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_1.1.1.6 - Cancel Mass Mark as Duplicate', () => {
  let createdOppUrls: string[] = [];
  let oppNames: string[] = [];

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
    if (!SKIP_CLEANUP_OPPS && oppNames.length) {
      // Bulk-delete in ONE list operation - deleting 10 opps one-by-one overran the per-test timeout.
      const cleanupPage = new OpportunityPage(page);
      await cleanupPage.deleteOpportunitiesByNames(oppNames).catch((e) => {
        console.log(`  ⚠ Bulk cleanup failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-10601_1.1.1.6: Verify the user is able to cancel mass mark lost', async ({ page }, testInfo) => {
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

    // Setup (needed for step 3): create 10 non_won Opportunities (Stage = New)
    await test.step(`Setup: Create ${LEAD_COUNT} non_won Opportunities (Stage = New)`, async () => {
      await opportunityPage.switchToListView();
      const stamp = opportunityPage.generateOpportunityName('TEST CRM-10738 ');
      oppNames = Array.from({ length: LEAD_COUNT }, (_, i) => `${stamp}-${String(i + 1).padStart(2, '0')}`);
      createdOppUrls = await opportunityPage.createSimpleOpportunities(oppNames);
      console.log(`✓ Created ${createdOppUrls.length} Opportunities`);
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

    // Step 3: Select 10 non_won opp
    await test.step(`Step 3: Select ${LEAD_COUNT} non_won opp`, async () => {
      await opportunityPage.selectOpportunityRowsByNames(oppNames);
      console.log(`✓ Selected ${LEAD_COUNT} Opportunity rows`);
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

    // Step 6: Click Cancel -> popup disappears without error
    await test.step('Step 6: Click Cancel', async () => {
      await opportunityPage.cancelMassMarkWizard();
      const stillOpen = await opportunityPage.isMassMarkWizardOpen();
      expect(stillOpen, 'The wizard popup should disappear after Cancel').toBeFalsy();
      const errorText = await opportunityPage.getMassMarkErrorText();
      console.log(`  - Error popup text after Cancel: "${errorText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10738 - After cancelling Mass Mark wizard');
      expect(errorText, 'No error popup should appear after Cancel').toBe('');
      console.log('✅ Wizard cancelled - popup disappeared without error');
    });
  });
});
