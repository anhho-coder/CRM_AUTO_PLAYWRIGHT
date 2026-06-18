import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: "Mass Mark as Duplicate and Deactivate" IS visible for the Sales Director in the Opportunities list.
 * Test Case ID: CRM-10601_3.1.1.4   (Jira: CRM-10767 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: The Sales Director sees "Mass Mark as Duplicate and Deactivate" in the Opportunities-list Action dropdown.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.1\.1\.4:" --project=chromium
 *
 * Source manual TC (Jira CRM-10767)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.1 Opportunities list
 *
 *   Pre-conditions:
 *     - Login as sales director. Ex: Veronika
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Opportunities list
 *     3. Select 1 Opp and click Action dropdown
 *
 *   Expected Result (step 3):
 *     3. Show "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "sales director" -> users.manager_veronika (Veronika), as named in the manual precondition.
 * - Read-only visibility check; no action is taken on the selected record.
 */

const ACTOR = users.manager_veronika;
const OPTION = 'Mass Mark as Duplicate and Deactivate';

test.describe('CRM-10601_3.1.1.4 - "Mass Mark as Duplicate and Deactivate" visible for Sales Director in Opportunities list', () => {
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

  test('CRM-10601_3.1.1.4: "Mass Mark as Duplicate and Deactivate" visible for Sales Director in Opportunities list', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    // Pre-condition: Login as sales director (Veronika)
    await test.step('Pre-condition: Login as sales director', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as sales director ${ACTOR.displayName}`);
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

    // Step 3: Select 1 Opp and click Action dropdown -> Show "Mass Mark as Duplicate and Deactivate"
    await test.step('Step 3: Select 1 Opp and click Action dropdown', async () => {
      await opportunityPage.selectFirstListRow();
      await opportunityPage.clickListActionMenu();
      const labels = await opportunityPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10767 - Opportunities-list Action menu (sales director)');
      expect(labels, `The Action menu should show "${OPTION}"`).toContain(OPTION);
      console.log(`✅ "${OPTION}" is visible for the Sales Director in the Opportunities list`);
    });
  });
});
