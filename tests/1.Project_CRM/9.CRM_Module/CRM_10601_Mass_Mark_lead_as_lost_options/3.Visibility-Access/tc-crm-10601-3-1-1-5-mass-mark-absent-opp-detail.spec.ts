import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: the Mass Mark actions do NOT appear in the Opportunity DETAIL (form) Action dropdown.
 * Test Case ID: CRM-10601_3.1.1.5   (Jira: CRM-10768 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: On an Opportunity detail (form) screen, the Action dropdown shows neither "Mass Mark as
 *          Duplicate" nor "Mass Mark as Duplicate and Deactivate" (those are list-only mass actions).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.1\.1\.5:" --project=chromium
 *
 * Source manual TC (Jira CRM-10768)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.1 Opportunities list
 *
 *   Pre-conditions:
 *     - Login as sales director. Ex: Veronika
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Open any Opportunity
 *     3. Click Action dropdown
 *
 *   Expected Result (step 3):
 *     3. Does not show "Mass Mark as Duplicate" & "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "sales director" -> users.manager_veronika (Veronika). Even the director (who sees both options in
 *   the list) does not see them on the detail/form screen - confirmed on pre-prod (the form Action menu
 *   has no mass-mark options). Read-only check; no action is taken.
 */

const ACTOR = users.manager_veronika;

test.describe('CRM-10601_3.1.1.5 - Mass Mark actions do not appear in the Opportunity detail screen', () => {
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

  test('CRM-10601_3.1.1.5: Mass Mark as Duplicate action does not appear in Opp detail screen', async ({ page }, testInfo) => {
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

    // Step 2: Open any Opportunity (open the first one from the list)
    await test.step('Step 2: Open any Opportunity', async () => {
      await opportunityPage.switchToListView();
      await opportunityPage.openFirstListRecord();
      console.log('✓ Opportunity detail screen opened');
    });

    // Step 3: Click Action dropdown -> does NOT show the Mass Mark options
    await test.step('Step 3: Click Action dropdown', async () => {
      await opportunityPage.clickFormActionMenu();
      const labels = await opportunityPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10768 - Opportunity detail Action menu (no Mass Mark options)');
      expect(labels.length, 'The form Action menu should have opened with options').toBeGreaterThan(0);
      expect(labels, 'The detail Action menu should NOT show "Mass Mark as Duplicate"').not.toContain('Mass Mark as Duplicate');
      expect(labels, 'The detail Action menu should NOT show "Mass Mark as Duplicate and Deactivate"').not.toContain('Mass Mark as Duplicate and Deactivate');
      console.log('✅ Neither Mass Mark option appears in the Opportunity detail Action menu');
    });
  });
});
