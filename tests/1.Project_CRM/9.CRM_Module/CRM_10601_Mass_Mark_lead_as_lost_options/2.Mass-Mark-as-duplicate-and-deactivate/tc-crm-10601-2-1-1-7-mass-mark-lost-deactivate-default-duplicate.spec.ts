import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate submitting with the DEFAULT Lost reason ("Duplicate").
 * Test Case ID: CRM-10601_2.1.1.7   (Jira: CRM-10756 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify a Sales Manager can mass-mark a single Opportunity lost AND deactivate it via
 *          Action > "Mass Mark as Duplicate and Deactivate" submitting with the DEFAULT Lost reason
 *          ("Duplicate"); the record is archived (active=false), marked lost, with NO pending approval.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.7:" --project=chromium
 *
 * Source manual TC (Jira CRM-10756)
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
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *     6. Submit with default Lost reason
 *     7. Login with sales manager and view this Opp
 *
 *   Expected Result (step 7) - AS STATED in the manual TC:
 *     There is new pending approval (Lost reason: Duplicate) + a "marked as lost ... Pending approval." log note.
 *
 * IMPORTANT - manual TC vs. actual behavior (verified on pre-prod 2026-06-18):
 * - The "pending approval" Expected Result was copy-pasted from section 1 and is INCORRECT here. Per the
 *   tester's decision, this spec asserts the ACTUAL behavior: the Opp is deactivated (active=false),
 *   marked lost, Approval Status = "None", with the "Marked as Duplicate + Deactivated ... (bulk action)"
 *   / "Opportunity lost" / "Lost Reason: Duplicate" log note.
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - Step 6 reads the wizard's DEFAULT Lost reason and asserts it is "Duplicate", then submits WITHOUT
 *   changing it (testing the default). A "Setup" step creates the non_won Opportunity.
 */

const EXPECTED_DEFAULT_REASON = 'Duplicate';
const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const SKIP_CLEANUP_OPP = false;

test.describe('CRM-10601_2.1.1.7 - Mass Mark as Duplicate and Deactivate with default Lost reason "Duplicate"', () => {
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

  test('CRM-10601_2.1.1.7: Verify user is able to mass mark lost and deactivate with default Lost reason = "Duplicate"', async ({ page }, testInfo) => {
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
      createdOppName = opportunityPage.generateOpportunityName('TEST CRM-10756 ');
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

    // Step 5: Select Mass Mark as duplicate and deactivate
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate and Deactivate" wizard should open').toMatch(/Mass Mark as Duplicate and Deactivate/i);
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount}`);
      expect(leadCount, 'The wizard should target exactly 1 lead').toBe(1);
    });

    // Step 6: Submit with default Lost reason (assert the default is "Duplicate", then submit unchanged)
    await test.step('Step 6: Submit with default Lost reason', async () => {
      const defaultReason = await opportunityPage.getMassMarkLostReasonValue();
      console.log(`  - Default Lost reason in wizard = "${defaultReason}"`);
      expect(defaultReason, 'The wizard default Lost reason should be "Duplicate"').toMatch(/Duplicate/i);
      await opportunityPage.confirmMassMarkWizard();
      console.log('✓ Submitted with the default Lost reason');
    });

    // Step 7: Login with sales manager and view this Opp (same session - see Design notes)
    await test.step('Step 7: Login with sales manager and view this Opp', async () => {
      await opportunityPage.goto(createdOppUrl);
      await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Opportunity re-opened as the Sales Manager');
    });

    // Verification of step 7's ACTUAL behavior: deactivated + marked lost (default reason) + no pending approval
    await test.step('Verification: Step 7 - Opportunity is deactivated and marked lost (default reason, no pending approval)', async () => {
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        'Deactivated',
        5,
        CommonUtils.waitTimes.checkingChatterLog
      );
      console.log(`  - Chatter (first 400 chars): "${chatterText.slice(0, 400)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10756 - Opportunity after Mass Mark and Deactivate (default Duplicate)');

      expect(found, 'A "Marked as Duplicate + Deactivated" log note should be posted on the Opportunity').toBeTruthy();
      expect(chatterText, 'The log note should record the bulk deactivate event').toMatch(/Marked as .+? \+ Deactivated by .+? \(bulk action\)/i);
      expect(chatterText, 'The log note should record "Opportunity lost"').toMatch(/Opportunity lost/i);
      expect(chatterText.toLowerCase(), `The log note should record Lost Reason "${EXPECTED_DEFAULT_REASON}"`)
        .toContain(EXPECTED_DEFAULT_REASON.toLowerCase());

      await opportunityPage.clickCRMDeveloperTab().catch(() => {});
      const active = await opportunityPage.isOpportunityActive();
      console.log(`  - Opportunity active = ${active}`);
      expect(active, 'The Opportunity should be deactivated/archived (active = false)').toBeFalsy();
      const approvalStatus = await opportunityPage.getApprovalStatus();
      console.log(`  - Approval Status = "${approvalStatus}"`);
      expect(approvalStatus, 'There should be NO pending approval').not.toMatch(/Pending Approval/i);

      console.log('✅ Opportunity marked lost AND deactivated directly with default reason "Duplicate" (no pending approval)');
    });
  });
});
