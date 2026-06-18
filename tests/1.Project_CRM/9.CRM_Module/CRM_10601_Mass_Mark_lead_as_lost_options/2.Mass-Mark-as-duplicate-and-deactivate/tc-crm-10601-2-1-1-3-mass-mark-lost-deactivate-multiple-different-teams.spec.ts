import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Mass Mark as Duplicate and Deactivate for multiple records with different teams.
 * Test Case ID: CRM-10601_2.1.1.3   (Jira: CRM-10752 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: Verify a Sales Manager can mass-mark MULTIPLE Opportunities on DIFFERENT Sales teams lost
 *          AND deactivate them via Action > "Mass Mark as Duplicate and Deactivate"; each is archived
 *          (active=false), marked lost, with NO pending approval.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_2\.1\.1\.3:" --project=chromium
 *
 * Source manual TC (Jira CRM-10752)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/2. Mass Mark as duplicate and deactivate
 *
 *   Preconditions:
 *     _ Login as Sales Manager
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 3 non_won opps that have different Sales team
 *     4. Click Action
 *     5. Select Mass Mark as duplicate and deactivate   (Jira source reads "ass Mark" - obvious typo, normalized)
 *     6. Select Lost Reason and submit
 *     7. Login with sales manager and review all the Opp
 *
 *   Expected Result (step 7) - AS STATED in the manual TC:
 *     There is new pending approval (Assigned to Opp's Sale team director; Lost reason selected in step 5)
 *     + a "marked as lost ... Pending approval." log note.
 *
 * IMPORTANT - manual TC vs. actual behavior (verified on pre-prod 2026-06-18):
 * - The "pending approval" Expected Result was copy-pasted from section 1 and is INCORRECT here. Per the
 *   tester's decision, this spec asserts the ACTUAL behavior: each Opp is deactivated (active=false),
 *   marked lost, Approval Status = "None", with the "Marked as Duplicate + Deactivated ... (bulk action)"
 *   / "Opportunity lost" / "Lost Reason: {reason}" log note.
 *
 * Design notes:
 * - Sales Manager = Veronika (users.manager_veronika); she stays Salesperson so the opps remain in her
 *   pipeline, while each opp is set to a different Sales Team (CMR / BDEU / EAM).
 * - A "Setup" step creates the 3 non_won Opportunities (the Jira precondition only covers login).
 */

const LOST_REASON = 'Duplicate';
const ACTION_OPTION = 'Mass Mark as Duplicate and Deactivate';
const TEAMS = ['CMR', 'BDEU', 'EAM'];
const SKIP_CLEANUP_OPPS = false;

test.describe('CRM-10601_2.1.1.3 - Mass Mark as Duplicate and Deactivate for multiple records with different teams', () => {
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
    if (!SKIP_CLEANUP_OPPS) {
      for (const url of createdOppUrls) {
        await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch((e) => {
          console.log(`  ⚠ Cleanup failed for ${url} (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    }
  });

  test('CRM-10601_2.1.1.3: Verify user is able mass mark lost and deactivate for multiple records with different teams', async ({ page }, testInfo) => {
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

    // Setup (needed for step 3): create 3 non_won Opportunities on DIFFERENT Sales teams
    await test.step('Setup: Create 3 non_won Opportunities with different Sales teams (Stage = New)', async () => {
      await opportunityPage.switchToListView();
      const stamp = opportunityPage.generateOpportunityName('TEST CRM-10752 ');
      oppNames = TEAMS.map((_, i) => `${stamp}-${String(i + 1).padStart(2, '0')}`);
      const items = TEAMS.map((team, i) => ({ name: oppNames[i], team }));
      createdOppUrls = await opportunityPage.createSimpleOpportunitiesWithTeams(items);
      console.log(`✓ Created ${createdOppUrls.length} Opportunities on teams ${JSON.stringify(TEAMS)}`);
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

    // Step 3: Select 3 non_won opps that have different Sales team
    await test.step('Step 3: Select 3 non_won opps that have different Sales team', async () => {
      await opportunityPage.selectOpportunityRowsByNames(oppNames);
      console.log('✓ Selected 3 Opportunity rows (different teams)');
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
      expect(leadCount, 'The wizard should target exactly 3 leads').toBe(3);
    });

    // Step 6: Select Lost Reason and submit
    await test.step('Step 6: Select Lost Reason and submit', async () => {
      await opportunityPage.selectMassMarkLostReason(LOST_REASON);
      await opportunityPage.confirmMassMarkWizard();
      console.log(`✓ Submitted with Lost Reason = "${LOST_REASON}"`);
    });

    // Step 7: Login with sales manager and review all the Opp (same session) + verify each
    await test.step('Step 7: Login with sales manager and review all the Opp', async () => {
      for (let i = 0; i < createdOppUrls.length; i++) {
        const url = createdOppUrls[i];
        console.log(`  Reviewing Opportunity ${i + 1}/${createdOppUrls.length} (team ${TEAMS[i]}): ${url}`);
        await opportunityPage.goto(url);
        await opportunityPage.waitForPageReady(CommonUtils.waitTimes.pageLoad);

        const { found, chatterText } = await opportunityPage.waitForChatterContaining(
          'Deactivated',
          5,
          CommonUtils.waitTimes.checkingChatterLog
        );
        expect(found, `Opp ${i + 1} (team ${TEAMS[i]}) should have a "Marked as Duplicate + Deactivated" log note`).toBeTruthy();
        expect(chatterText, `Opp ${i + 1} log note should record the bulk deactivate event`)
          .toMatch(/Marked as .+? \+ Deactivated by .+? \(bulk action\)/i);
        expect(chatterText, `Opp ${i + 1} log note should record "Opportunity lost"`).toMatch(/Opportunity lost/i);
        expect(chatterText.toLowerCase(), `Opp ${i + 1} log note should record Lost Reason "${LOST_REASON}"`)
          .toContain(LOST_REASON.toLowerCase());

        await opportunityPage.clickCRMDeveloperTab().catch(() => {});
        const active = await opportunityPage.isOpportunityActive();
        console.log(`    - Opp ${i + 1} active = ${active}`);
        expect(active, `Opp ${i + 1} should be deactivated/archived (active = false)`).toBeFalsy();
        const approvalStatus = await opportunityPage.getApprovalStatus();
        console.log(`    - Opp ${i + 1} Approval Status = "${approvalStatus}"`);
        expect(approvalStatus, `Opp ${i + 1} should have NO pending approval`).not.toMatch(/Pending Approval/i);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10752 - Last Opp after Mass Mark as Duplicate and Deactivate (different teams)');
      console.log('✅ All 3 Opportunities (different teams) were marked lost AND deactivated directly');
    });
  });
});
