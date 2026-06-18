import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: "Mass Mark as Duplicate and Deactivate" is NOT visible for a regular sales user in the Opportunities list.
 * Test Case ID: CRM-10601_3.1.1.2   (Jira: CRM-10764 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: A regular sales user (non-director) does NOT see "Mass Mark as Duplicate and Deactivate" in
 *          the Opportunities-list Action dropdown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.1\.1\.2:" --project=chromium
 *
 * Source manual TC (Jira CRM-10764)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.1 Opportunities list
 *
 *   Pre-conditions:
 *     - Login as salesperson. Ex: Thomas Semerich
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 Opp and click Action dropdown
 *
 *   Expected Result (step 3):
 *     3. Does not show "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "regular sales user" (manual example "Thomas Semerich") -> sale_ic_thomas (verified
 *   on pre-prod: his Action menu shows "Mass Mark as Duplicate" but NOT "...and Deactivate").
 * - Read-only visibility check; no action is taken on the selected record.
 */

const ACTOR = users.sale_ic_thomas;
const OPTION = 'Mass Mark as Duplicate and Deactivate';

test.describe('CRM-10601_3.1.1.2 - "Mass Mark as Duplicate and Deactivate" NOT visible for regular sales user in Opportunities list', () => {
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
  });

  test('CRM-10601_3.1.1.2: "Mass Mark as Duplicate and Deactivate" NOT visible for regular sales user in Opportunities list', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    // Pre-condition: Login as salesperson (regular sales user) - Ex: Thomas Semerich -> sale_ic_thomas
    await test.step('Pre-condition: Login as salesperson (regular sales user)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as regular sales user ${ACTOR.displayName}`);
    });

    // Step 1: Open CRM module
    await test.step('Step 1: Open CRM module', async () => {
      await homePage.navigateToCRM();
      console.log('✓ CRM module opened');
    });

    // Step 2: Navigate to Opportunities list
    await test.step('Step 2: Navigate to Opportunities list', async () => {
      await opportunityPage.switchToListView();
      console.log('✓ Opportunities list opened');
    });

    // Step 3: Select 1 Opp and click Action dropdown -> does NOT show the option
    await test.step('Step 3: Select 1 Opp and click Action dropdown', async () => {
      await opportunityPage.selectFirstListRow();
      await opportunityPage.clickListActionMenu();
      const labels = await opportunityPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10764 - Opportunities-list Action menu (regular sales user)');
      expect(labels.length, 'The Action menu should have opened with options').toBeGreaterThan(0);
      expect(labels, `The Action menu should NOT show "${OPTION}" for a regular sales user`).not.toContain(OPTION);
      console.log(`✅ "${OPTION}" is NOT visible for the regular sales user in the Opportunities list`);
    });
  });
});
