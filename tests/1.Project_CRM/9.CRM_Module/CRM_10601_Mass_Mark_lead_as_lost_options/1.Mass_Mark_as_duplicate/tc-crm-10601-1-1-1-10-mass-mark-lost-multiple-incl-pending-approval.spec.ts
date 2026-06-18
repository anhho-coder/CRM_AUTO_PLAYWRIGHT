import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Lost (Duplicate) for multiple records including a record with a pending lost approval.
 * Test Case ID: CRM-10601_1.1.1.10   (Jira: CRM-10742 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-12
 *
 * Summary: Verify mass-marking lost works when the selection mixes a fresh non-won Opportunity with
 *          one that already has a pending lost approval; the lost-lead approval / log note are present.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_1\.1\.1\.10:" --project=chromium
 *
 * Source manual TC (Jira CRM-10742)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/1. Mass Mark as duplicate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 non_won opp + 1 opp has pending lost approval
 *     4. Click Action
 *     5. Select Mass Mark as duplicate
 *     6. Submit with default Lost reason
 *     7. Login with sales manager and review all Opp
 *
 *   Expected Result (step 7):
 *     There is new pending approval:
 *       _ Assigned to: Opp's Sale team director
 *       _ Lost reason: Duplicate
 *     There is a log note for lost lead approval:
 *       "The lead has been marked as lost by {submitter}. Lost reason: Duplicate. Pending approval."
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - Setup creates TWO Opportunities: "pending" (marked lost via the full flow -> pending approval) and
 *   "fresh" (left non-won). The Jira precondition only covers login; the records are implied by step 3.
 * - After submit, both Opportunities should remain in a "Pending Approval" state with a lost-lead note.
 */

const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_1.1.1.10 - Mass Mark as Lost for multiple records incl. one pending lost approval', () => {
  let createdOppUrls: string[] = [];
  let stamp = '';
  let pendingOppUrl = '';
  let pendingOppName = '';
  let freshOppUrl = '';
  let freshOppName = '';

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

  test('CRM-10601_1.1.1.10: Verify user is able mass mark lost for multiple records including record with pending lost approval', async ({ page }, testInfo) => {
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

    // Setup A (needed for step 3): create an Opportunity and mark it lost -> it gets a PENDING lost approval
    await test.step('Setup: Create an Opportunity already in "pending lost approval" state', async () => {
      await opportunityPage.switchToListView();
      stamp = opportunityPage.generateOpportunityName('TEST CRM-10742 '); // shared stamp for both opps
      pendingOppName = `${stamp}-PENDING`;
      pendingOppUrl = await opportunityPage.createSimpleOpportunityFromList(pendingOppName);
      createdOppUrls.push(pendingOppUrl);
      // Mark it lost via the full flow -> pending approval
      await opportunityPage.clickCRMMenuLink();
      await opportunityPage.switchToListView();
      await opportunityPage.selectOpportunityRowByName(pendingOppName);
      await opportunityPage.clickListActionMenu();
      await opportunityPage.selectActionMenuOption('Mass Mark as Duplicate');
      await opportunityPage.waitForMassMarkWizard();
      await opportunityPage.confirmMassMarkWizard(); // submit with default Lost reason (Duplicate)
      console.log(`✓ Created + marked-lost (pending approval) Opportunity: ${pendingOppName}`);
    });

    // Setup B (needed for step 3): create a fresh non_won Opportunity
    await test.step('Setup: Create a fresh non_won Opportunity', async () => {
      await opportunityPage.clickCRMMenuLink();
      await opportunityPage.switchToListView();
      freshOppName = `${stamp}-FRESH`;
      freshOppUrl = await opportunityPage.createSimpleOpportunityFromList(freshOppName);
      createdOppUrls.push(freshOppUrl);
      console.log(`✓ Created fresh non_won Opportunity: ${freshOppName}`);
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

    // Step 3: Select 1 non_won opp + 1 opp has pending lost approval
    await test.step('Step 3: Select 1 non_won opp + 1 opp has pending lost approval', async () => {
      // The pending-lost opp is active=true but hidden by the "My Pipeline" favorite (it filters out
      // zero-probability / lost-reason opps). Remove that favorite and search by the shared name stamp
      // (real keystrokes) so BOTH the fresh and the pending-lost opp are listed and selectable.
      await opportunityPage.removeMyPipelineFilter().catch(() => {});
      await opportunityPage.searchByName(stamp);
      await opportunityPage.selectOpportunityRowsByNames([freshOppName, pendingOppName]);
      console.log('✓ Selected the fresh + the pending-approval Opportunity');
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
      console.log(`  - Wizard lead_count = ${leadCount} (mix of fresh + already-pending)`);
    });

    // Step 6: Submit with default Lost reason
    await test.step('Step 6: Submit with default Lost reason', async () => {
      await opportunityPage.confirmMassMarkWizard();
      console.log('✓ Submitted with the default Lost reason (Duplicate)');
    });

    // Step 7: Login with sales manager and review all Opp (same session) + verify each
    await test.step('Step 7: Login with sales manager and review all Opp', async () => {
      const review = async (label: string, url: string) => {
        console.log(`  Reviewing ${label} Opportunity: ${url}`);
        await opportunityPage.goto(url);
        await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
        const { found, chatterText } = await opportunityPage.waitForChatterContaining(
          'marked as lost',
          5,
          CommonUtils.waitTimes.checkingChatterLog
        );
        expect(found, `${label} Opp should have a "marked as lost" log note`).toBeTruthy();
        expect(chatterText.toLowerCase(), `${label} Opp log note should record Lost reason "Duplicate"`)
          .toContain('duplicate');
        expect(chatterText, `${label} Opp log note should say "Pending approval"`).toMatch(/pending approval/i);
        await opportunityPage.clickCRMDeveloperTab().catch(() => {});
        const approvalStatus = await opportunityPage.getApprovalStatus();
        console.log(`    - ${label} Approval Status = "${approvalStatus}"`);
        expect(approvalStatus, `${label} Opp Approval Status should be "Pending Approval"`).toMatch(/Pending Approval/i);
      };
      await review('fresh', freshOppUrl);
      await review('pending', pendingOppUrl);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10742 - Opp after Mass Mark as Lost (incl pending approval)');
      console.log('✅ Both Opportunities (fresh + already-pending) have a pending lost approval');
    });
  });
});
