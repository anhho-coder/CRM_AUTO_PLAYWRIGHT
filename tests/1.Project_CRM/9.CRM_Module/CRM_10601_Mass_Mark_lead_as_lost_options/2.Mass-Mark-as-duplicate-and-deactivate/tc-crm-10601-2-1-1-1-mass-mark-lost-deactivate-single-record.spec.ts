import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate for a single record - automated from a manual test case.
 * Test Case ID: CRM-10601_2.1.1.1   (Jira: CRM-10750 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify a Sales Manager can mass-mark a single Opportunity lost AND deactivate it via
 *          Action > "Mass Mark as Duplicate and Deactivate". Unlike plain "Mass Mark as Duplicate"
 *          (which raises a pending approval), this action applies the lost + deactivate DIRECTLY:
 *          the record is archived (active=false), marked lost, and there is NO pending approval.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.1:" --project=chromium
 *
 * Source manual TC (Jira CRM-10750)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 non_won opp
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate
 *     6. Select Lost Reason and submit
 *     7. Login with sales manager and view this Opp
 *
 *   Expected Result (step 7) - AS STATED in the manual TC:
 *     There is new pending approval:
 *       _ Assigned to: Opp's Sale team director
 *       _ Lost reason: Selected in step 5
 *     There is a log note for lost lead approval:
 *       "The lead has been marked as lost by {submitter}. Lost reason: {selected option}. Pending approval."
 *
 * IMPORTANT - manual TC vs. actual behavior (verified on pre-prod 2026-06-18):
 * - The Expected Result above was copy-pasted from section 1 ("Mass Mark as Duplicate") and is
 *   INCORRECT for this "and Deactivate" action. The action does NOT create a pending approval.
 * - Per the tester's decision, this spec asserts the ACTUAL behavior:
 *     _ The Opportunity is deactivated/archived: active = false (and hidden from the active list).
 *     _ Approval Status = "None" (no pending approval).
 *     _ Log note: "Marked as Duplicate + Deactivated by {submitter} (bulk action)", "Opportunity lost",
 *       "Active: true -> false", "Lost Reason: {selected option}".
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika); matches the "Veronika's request" feature.
 * - Step 7 ("login with sales manager and view this Opp") is verified IN THE SAME SESSION by
 *   re-opening the Opp (per the section-1 convention). A second login is intentionally out of scope.
 * - "Mass Mark as Duplicate and Deactivate" acts ONLY on the selected record(s) - the wizard's
 *   lead_count is asserted to be 1 as a safety guard so the test never affects unrelated leads.
 */

const LOST_REASON = 'Duplicate';
const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const SKIP_CLEANUP_OPP = false; // true = skip deleting the created Opportunity in teardown

test.describe('CRM-10601_2.1.1.1 - Mass Mark as Duplicate and Deactivate for a single record', () => {
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
        console.log(`  ⚠ Cleanup of created Opportunity failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-10601_2.1.1.1: Verify user is able mass mark lost and deactivate for 1 record', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    // Pre-condition: Login as Sales Manager
    await test.step('Pre-condition 1: Login as Sales Manager', async () => {
      console.log(`Logging in as ${users.manager_veronika.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.manager_veronika.username, users.manager_veronika.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log('✓ Logged in and CRM opened');
    });

    // Setup (needed for step 3): create a non_won Opportunity (Stage = New) to act on
    await test.step('Setup: Create a non_won Opportunity (Stage = New) to act on', async () => {
      await opportunityPage.switchToListView();
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10750 ');
      createdOppUrl = await opportunityPage.createSimpleOpportunityFromList(createdOppName);
      console.log(`✓ Opportunity created (Stage = New) at ${createdOppUrl}`);
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

    // Step 5: Select Mass Mark as duplicate and deactivate
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate and Deactivate" wizard should open').toMatch(/Mass Mark as Duplicate and Deactivate/i);
      // Safety guard: the action must target exactly the 1 selected record.
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount}`);
      expect(leadCount, 'The wizard should target exactly 1 lead (the single selected record)').toBe(1);
    });

    // Step 6: Select Lost Reason and submit
    await test.step('Step 6: Select Lost Reason and submit', async () => {
      await opportunityPage.selectMassMarkLostReason(LOST_REASON);
      await opportunityPage.confirmMassMarkWizard();
      console.log(`✓ Submitted "${ACTION_OPTION}" with Lost Reason = "${LOST_REASON}"`);
    });

    // Step 7: Login with sales manager and view this Opp (same session - see Design notes)
    await test.step('Step 7: Login with sales manager and view this Opp', async () => {
      await opportunityPage.goto(createdOppUrl);
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Opportunity re-opened as the Sales Manager');
    });

    // Verification of step 7's ACTUAL behavior: deactivated + marked lost + no pending approval
    await test.step('Verification: Step 7 - Opportunity is deactivated and marked lost (no pending approval)', async () => {
      // 1) Log note records the bulk "Marked as Duplicate + Deactivated" action + the Lost Reason.
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        'Deactivated',
        5,
        CommonUtils.waitTimes.checkingChatterLog
      );
      console.log(`  - Chatter (first 500 chars): "${chatterText.slice(0, 500)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10750 - Opportunity after Mass Mark as Duplicate and Deactivate');

      expect(found, 'A "Marked as Duplicate + Deactivated" log note should be posted on the Opportunity').toBeTruthy();
      expect(chatterText, 'The log note should record the "Marked as Duplicate + Deactivated ... (bulk action)" event')
        .toMatch(/Marked as .+? \+ Deactivated by .+? \(bulk action\)/i);
      expect(chatterText, 'The log note should record the Opportunity is lost').toMatch(/Opportunity lost/i);
      expect(chatterText.toLowerCase(), `The log note should record Lost Reason "${LOST_REASON}"`)
        .toContain(LOST_REASON.toLowerCase());

      // 2) The Opportunity is deactivated (archived): active = false.
      await opportunityPage.clickCRMDeveloperTab().catch(() => {});
      const active = await opportunityPage.isOpportunityActive();
      console.log(`  - Opportunity active = ${active}`);
      expect(active, 'The Opportunity should be deactivated/archived (active = false) after the action').toBeFalsy();

      // 3) No pending approval: Approval Status should be "None" (this action skips the approval flow).
      const approvalStatus = await opportunityPage.getApprovalStatus();
      console.log(`  - Approval Status = "${approvalStatus}"`);
      expect(approvalStatus, 'There should be NO pending approval (this action applies lost+deactivate directly)')
        .not.toMatch(/Pending Approval/i);
      expect(approvalStatus === '' || /None/i.test(approvalStatus), `Approval Status should be "None" (was "${approvalStatus}")`).toBeTruthy();

      console.log('✅ Single Opportunity was marked lost AND deactivated directly (no pending approval)');
    });
  });
});
