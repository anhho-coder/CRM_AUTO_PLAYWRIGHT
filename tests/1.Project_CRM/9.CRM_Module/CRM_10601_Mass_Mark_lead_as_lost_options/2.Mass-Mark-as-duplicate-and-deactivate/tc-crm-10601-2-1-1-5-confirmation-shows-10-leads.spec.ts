import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate - confirmation message shows 10 leads when selecting 10 leads.
 * Test Case ID: CRM-10601_2.1.1.5   (Jira: CRM-10754 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify the "Mass Mark as Duplicate and Deactivate" confirmation popup reports 10 leads when
 *          10 non-won Opportunities are selected.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.5:" --project=chromium
 *
 * Source manual TC (Jira CRM-10754)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 10 non_won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *     6. Observe popup
 *
 *   Expected Result (step 6):
 *     6. Confirmation message shows 10 leads
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates the 10 non_won Opportunities (the Jira precondition only covers login).
 * - The test does NOT submit (the TC stops at observing the popup); it Cancels the wizard so the
 *   created Opportunities stay non-won and active. Bulk teardown deletes them by name in one operation.
 */

const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const LEAD_COUNT = 10;
const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_2.1.1.5 - Confirmation message shows 10 leads when selecting 10 leads', () => {
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

  test('CRM-10601_2.1.1.5: Verify confirmation message shows 10 leads when selecting 10 leads', async ({ page }, testInfo) => {
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
      const stamp = opportunityPage.generateOpportunityName('TEST CRM-10754 ');
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

    // Step 5: Select Mass Mark as duplicate and deactivate
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate and Deactivate" wizard should open').toMatch(/Mass Mark as Duplicate and Deactivate/i);
    });

    // Step 6: Observe popup -> confirmation message shows 10 leads
    await test.step('Step 6: Observe popup', async () => {
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `CRM-10754 - Mass Mark and Deactivate popup shows ${leadCount} leads`);
      expect(leadCount, `The confirmation message should show ${LEAD_COUNT} leads`).toBe(LEAD_COUNT);
      // Do not submit - cancel so the created Opportunities stay non-won (and deletable).
      await opportunityPage.cancelMassMarkWizard();
      console.log(`✅ Confirmation message correctly shows ${LEAD_COUNT} leads`);
    });
  });
});
