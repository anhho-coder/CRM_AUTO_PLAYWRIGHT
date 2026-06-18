import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate for multiple records including a record with a pending lost approval.
 * Test Case ID: CRM-10601_2.1.1.10   (Jira: CRM-10759 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify "Mass Mark as Duplicate and Deactivate" works when the selection mixes a fresh non-won
 *          Opportunity with one that already has a pending lost approval; each is archived (active=false)
 *          and marked lost.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.10:" --project=chromium
 *
 * Source manual TC (Jira CRM-10759)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 non_won opp + 1 opp has pending lost approval
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *     6. Submit with default Lost reason
 *     7. Login with sales manager and review all Opp
 *
 *   Expected Result (step 7) - AS STATED in the manual TC:
 *     There is new pending approval (Lost reason: Duplicate) + a "marked as lost ... Pending approval." log note.
 *
 * IMPORTANT - manual TC vs. actual behavior (verified on pre-prod 2026-06-18):
 * - The "pending approval" Expected Result was copy-pasted from section 1 and is INCORRECT here. Per the
 *   tester's decision, this spec asserts the ACTUAL behavior: each Opp is deactivated (active=false),
 *   marked lost, with the "Marked as Duplicate + Deactivated ... (bulk action)" / "Opportunity lost" /
 *   "Lost Reason: Duplicate" log note. The FRESH opp also has Approval Status = "None"; the
 *   already-pending opp's prior approval status is logged (it may differ - not asserted).
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika).
 * - Setup creates TWO Opportunities: "pending" (marked lost via the plain "Mass Mark as Duplicate" flow
 *   -> pending approval) and "fresh" (left non-won). The Jira precondition only covers login; the records
 *   are implied by step 3.
 */

const SKIP_CLEANUP_OPPS = false;
const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';

test.describe('CRM-10601_2.1.1.10 - Mass Mark as Duplicate and Deactivate for multiple records incl. one pending lost approval', () => {
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

  test('CRM-10601_2.1.1.10: Verify user is able mass mark lost and deactivate for multiple records including record with pending lost approval', async ({ page }, testInfo) => {
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

    // Setup A (needed for step 3): create an Opportunity and mark it lost via the plain "Mass Mark as
    // Duplicate" flow -> it gets a PENDING lost approval.
    await test.step('Setup: Create an Opportunity already in "pending lost approval" state', async () => {
      await opportunityPage.switchToListView();
      stamp = opportunityPage.generateOpportunityName('TEST CRM-10759 '); // shared stamp for both opps
      pendingOppName = `${stamp}-PENDING`;
      pendingOppUrl = await opportunityPage.createSimpleOpportunityFromList(pendingOppName);
      createdOppUrls.push(pendingOppUrl);
      await opportunityPage.clickCRMMenuLink();
      await opportunityPage.switchToListView();
      await opportunityPage.selectOpportunityRowByName(pendingOppName);
      await opportunityPage.clickListActionMenu();
      await opportunityPage.selectActionMenuOption('Mass Mark as Duplicate'); // plain action -> pending approval
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
      // so BOTH the fresh and the pending-lost opp are listed and selectable.
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

    // Step 5: Select Mass Mark as duplicate and deactivate
    await test.step('Step 5: Select Mass Mark as duplicate and deactivate', async () => {
      await opportunityPage.selectActionMenuOption(ACTION_OPTION);
      const title = await opportunityPage.waitForMassMarkWizard();
      expect(title, 'The "Mass Mark as Duplicate and Deactivate" wizard should open').toMatch(/Mass Mark as Duplicate and Deactivate/i);
      const leadCount = await opportunityPage.getMassMarkLeadCount();
      console.log(`  - Wizard lead_count = ${leadCount} (mix of fresh + already-pending)`);
    });

    // Step 6: Submit with default Lost reason
    await test.step('Step 6: Submit with default Lost reason', async () => {
      await opportunityPage.confirmMassMarkWizard();
      console.log('✓ Submitted with the default Lost reason (Duplicate)');
    });

    // Step 7: Login with sales manager and review all Opp (same session) + verify each is deactivated + lost
    await test.step('Step 7: Login with sales manager and review all Opp', async () => {
      const review = async (label: string, url: string, assertNoPending: boolean) => {
        console.log(`  Reviewing ${label} Opportunity: ${url}`);
        await opportunityPage.goto(url);
        await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);
        const { found, chatterText } = await opportunityPage.waitForChatterContaining(
          'Deactivated',
          5,
          CommonUtils.waitTimes.checkingChatterLog
        );
        expect(found, `${label} Opp should have a "Marked as Duplicate + Deactivated" log note`).toBeTruthy();
        expect(chatterText, `${label} Opp log note should record the bulk deactivate event`)
          .toMatch(/Marked as .+? \+ Deactivated by .+? \(bulk action\)/i);
        expect(chatterText, `${label} Opp log note should record "Opportunity lost"`).toMatch(/Opportunity lost/i);
        expect(chatterText.toLowerCase(), `${label} Opp log note should record Lost Reason "Duplicate"`)
          .toContain('duplicate');

        await opportunityPage.clickCRMDeveloperTab().catch(() => {});
        const active = await opportunityPage.isOpportunityActive();
        console.log(`    - ${label} active = ${active}`);
        expect(active, `${label} Opp should be deactivated/archived (active = false)`).toBeFalsy();
        const approvalStatus = await opportunityPage.getApprovalStatus();
        console.log(`    - ${label} Approval Status = "${approvalStatus}"`);
        // Only the FRESH opp is asserted to have no pending approval; the already-pending opp's prior
        // approval state is informative (logged) and intentionally not asserted.
        if (assertNoPending) {
          expect(approvalStatus, `${label} Opp should have NO pending approval`).not.toMatch(/Pending Approval/i);
        }
      };
      await review('fresh', freshOppUrl, true);
      await review('pending', pendingOppUrl, false);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10759 - Opp after Mass Mark and Deactivate (incl pending approval)');
      console.log('✅ Both Opportunities (fresh + already-pending) were marked lost AND deactivated');
    });
  });
});
