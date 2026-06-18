import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Lost (Duplicate) with Lost reason = "No reply / never responded to calls or emails".
 * Test Case ID: CRM-10601_1.1.1.9   (Jira: CRM-10741 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-12
 *
 * Summary: Verify a Sales Manager can mass-mark a single Opportunity as lost via
 *          Action > "Mass Mark as Duplicate" choosing Lost reason
 *          "No reply / never responded to calls or emails", which submits a Lost Lead Approval
 *          request and posts the corresponding log note.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_1\.1\.1\.9:" --project=chromium
 *
 * Source manual TC (Jira CRM-10741)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/1. Mass Mark as duplicate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 non_won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate
 *     6 Submit with "No reply / never responded to calls or emails" Lost reason
 *     7. Login with sales manager and view this Opp
 *
 *   Expected Result (step 7):
 *     There is new pending approval:
 *       _ Assigned to: Opp's Sale team director
 *       _ Lost reason: No reply / never responded to calls or emails
 *     There is a log note for lost lead approval:
 *       "The lead has been marked as lost by {submitter}. Lost reason: No reply / never responded to calls or emails. Pending approval."
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - A "Setup" step creates the non_won Opportunity that step 3 selects. Step 7 is verified in the same session.
 */

const LOST_REASON = 'No reply / never responded to calls or emails';
const SKIP_CLEANUP_OPP = false;

test.describe('CRM-10601_1.1.1.9 - Mass Mark as Lost with Lost reason "No reply / never responded to calls or emails"', () => {
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

  test('CRM-10601_1.1.1.9: Verify user is able to mass mark lost with Lost reason = "No reply / never responded to calls or emails"', async ({ page }, testInfo) => {
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

    // Setup (needed for step 3): create a non_won Opportunity (Stage = New) to act on
    await test.step('Setup: Create a non_won Opportunity (Stage = New) to act on', async () => {
      await opportunityPage.switchToListView();
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10741 ');
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

    // Step 3: Select 1 non_won opp
    await test.step('Step 3: Select 1 non_won opp', async () => {
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
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount}`);
      expect(leadCount, 'The wizard should target exactly 1 lead').toBe(1);
    });

    // Step 6: Submit with "No reply / never responded to calls or emails" Lost reason
    await test.step('Step 6: Submit with "No reply / never responded to calls or emails" Lost reason', async () => {
      await opportunityPage.selectMassMarkLostReason(LOST_REASON);
      await opportunityPage.confirmMassMarkWizard();
      console.log(`✓ Submitted with Lost Reason = "${LOST_REASON}"`);
    });

    // Step 7: Login with sales manager and view this Opp (same session - see Design notes)
    await test.step('Step 7: Login with sales manager and view this Opp', async () => {
      await opportunityPage.goto(createdOppUrl);
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Opportunity re-opened as the Sales Manager');
    });

    // Verification of step 7's Expected Result: pending approval + lost-lead log note
    await test.step('Verification: Step 7 Expected Result (pending approval + lost-lead log note)', async () => {
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        'marked as lost',
        5,
        CommonUtils.waitTimes.checkingChatterLog
      );
      console.log(`  - Chatter (first 400 chars): "${chatterText.slice(0, 400)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10741 - Opportunity after Mass Mark as Lost (No reply)');

      expect(found, 'A "marked as lost" log note should be posted on the Opportunity').toBeTruthy();
      expect(chatterText.toLowerCase(), `The log note should record Lost reason "${LOST_REASON}"`)
        .toContain(LOST_REASON.toLowerCase());
      expect(chatterText, 'The log note should indicate the lead is "Pending approval"').toMatch(/pending approval/i);

      await opportunityPage.clickCRMDeveloperTab().catch(() => {});
      const approvalStatus = await opportunityPage.getApprovalStatus();
      console.log(`  - Approval Status = "${approvalStatus}"`);
      expect(approvalStatus, 'Approval Status should be "Pending Approval"').toMatch(/Pending Approval/i);

      console.log('✅ Mass Mark as Lost with reason "No reply / never responded to calls or emails" created a pending approval');
    });
  });
});
