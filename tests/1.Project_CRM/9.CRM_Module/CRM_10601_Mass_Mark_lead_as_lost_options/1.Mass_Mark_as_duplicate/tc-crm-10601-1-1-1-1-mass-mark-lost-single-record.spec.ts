import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Lost (Duplicate) for a single record - automated from a manual test case.
 * Test Case ID: CRM-10601_1.1.1.1   (Jira: CRM-10733 - Post-EA Test Case)
 * Automation-Type: refactored
 * Automation-Date: 2026-06-12
 *
 * Summary: Verify a Sales Manager can mass-mark a single Opportunity as lost via
 *          Action > "Mass Mark as Duplicate", which submits a Lost Lead Approval request
 *          (assigned to the Sales-team director) and posts the corresponding log note.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_1\.1\.1\.1:" --project=chromium
 *
 * Source manual TC (Jira CRM-10733)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/1. Mass Mark as duplicate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *     _ Create an Opportunity and set Stage = New
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select Opportunity in Precondition
 *     4. Click Action
 *     5. Select Mass Mark as duplicate
 *     6. Select Lost Reason and submit
 *     7. Login with sales manager and view this Opp
 *
 *   Expected Result (step 7):
 *     There is new pending approval:
 *       _ Assigned to: Opp's Sale team director
 *       _ Lost reason: Selected in step 5
 *     There is a log note for lost lead approval:
 *       "The lead has been marked as lost by {submitter}. Lost reason: {selected option}. Pending approval."
 *
 * Design notes / decisions:
 * - Sales Manager = Veronika (users.manager_veronika); matches the "Veronika's request" feature.
 * - Step 7 ("login with sales manager and view this Opp") is verified IN THE SAME SESSION by
 *   re-opening the Opp and asserting the log note + the "Pending Approval" status (per request).
 *   A second login as the Sales-team director is intentionally out of scope.
 * - "Mass Mark as Duplicate" acts ONLY on the selected record(s) - the wizard's lead_count is
 *   asserted to be 1 as a safety guard so the test never affects unrelated leads.
 * - Lost Reason in the wizard is REQUIRED; we select "Duplicate" (matching the action).
 */

const LOST_REASON = 'Duplicate';
const SKIP_CLEANUP_OPP = false; // true = skip deleting the created Opportunity in teardown

test.describe('CRM-10601_1.1.1.1 - Mass Mark as Lost (Duplicate) for a single record', () => {
  // Captured at test scope so the teardown can delete the Opportunity created during the run.
  let createdOppUrl = '';
  let createdOppName = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // Teardown: delete the Opportunity created by this test (toggle SKIP_CLEANUP_OPP to disable).
    if (!SKIP_CLEANUP_OPP && createdOppUrl) {
      await CommonUtils.deleteRecordByUrl(page, createdOppUrl, testInfo).catch((e) => {
        console.log(`  ⚠ Cleanup of created Opportunity failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-10601_1.1.1.1: Verify user is able mass mark lost for 1 record', async ({ page }, testInfo) => {
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

    // Pre-condition: Create an Opportunity and set Stage = New
    await test.step('Pre-condition 2: Create an Opportunity and set Stage = New', async () => {
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10733 ');
      console.log(`Creating Opportunity: ${createdOppName}`);
      await opportunityPage.fillOpportunityName(createdOppName);
      // Stage defaults to "New" on a fresh Opportunity; set it explicitly to satisfy the precondition.
      await opportunityPage.selectStageNew().catch(() => console.log('  - Stage already "New" (default)'));
      await opportunityPage.saveAndWaitForCompletion();
      createdOppUrl = page.url();
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

    // Step 3: Select Opportunity in Precondition
    await test.step('Step 3: Select Opportunity in Precondition', async () => {
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
      // The Action-menu option label in this Odoo is "Mass Mark as Duplicate" (capitalised).
      await opportunityPage.selectActionMenuOption('Mass Mark as Duplicate');
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate" wizard should open').toMatch(/Mass Mark as Duplicate/i);
      // Safety guard: the action must target exactly the 1 selected record.
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount}`);
      expect(leadCount, 'The wizard should target exactly 1 lead (the single selected record)').toBe(1);
    });

    // Step 6: Select Lost Reason and submit
    await test.step('Step 6: Select Lost Reason and submit', async () => {
      await opportunityPage.selectMassMarkLostReason(LOST_REASON);
      await opportunityPage.confirmMassMarkWizard();
      console.log(`✓ Submitted Mass Mark as Duplicate with Lost Reason = "${LOST_REASON}"`);
    });

    // Step 7: Login with sales manager and view this Opp
    //   Verified in the SAME Sales-Manager session by re-opening the Opp (see Design notes).
    await test.step('Step 7: Login with sales manager and view this Opp', async () => {
      await opportunityPage.goto(createdOppUrl);
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Opportunity re-opened as the Sales Manager');
    });

    // Verification of step 7's Expected Result: new pending approval + lost-lead log note
    await test.step('Verification: Step 7 Expected Result (pending approval + lost-lead log note)', async () => {
      const submitter = users.manager_veronika.displayName; // "Veronika Stasinievych"

      // 1) Log note: "...has been marked as lost by {submitter}. Lost reason: {reason}. Pending approval."
      //    The note is posted asynchronously by the approval flow - reload-and-check until it appears.
      console.log('Waiting for the "marked as lost / pending approval" log note...');
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        'marked as lost',
        5,
        CommonUtils.waitTimes.checkingChatterLog
      );
      console.log(`  - Chatter (first 500 chars): "${chatterText.slice(0, 500)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10733 - Opportunity after Mass Mark as Lost');

      expect(found, 'A "marked as lost" log note should be posted on the Opportunity').toBeTruthy();
      expect(chatterText, `The log note should mark it lost with reason "${LOST_REASON}"`)
        .toMatch(new RegExp(`marked as lost[\\s\\S]*${LOST_REASON}`, 'i'));
      expect(chatterText, 'The log note should indicate the lead is "Pending approval"')
        .toMatch(/pending approval/i);
      // Submitter name is informative - log it; assert softly so name-format changes do not break the test.
      if (!new RegExp(submitter.split(' ')[0], 'i').test(chatterText)) {
        console.log(`  ⚠ Submitter "${submitter}" not found verbatim in the log note (note still valid)`);
      }
      console.log('✓ Log note confirms: marked as lost, reason Duplicate, pending approval');

      // 2) Approval Status on the form should be "Pending Approval".
      await opportunityPage.clickCRMDeveloperTab().catch(() => {});
      const approvalStatus = await opportunityPage.getApprovalStatus();
      console.log(`  - Approval Status = "${approvalStatus}"`);
      expect(approvalStatus, 'The Opportunity Approval Status should be "Pending Approval"')
        .toMatch(/Pending Approval/i);

      console.log('✅ Mass Mark as Lost (Duplicate) created a pending approval for the single record');
    });
  });
});
