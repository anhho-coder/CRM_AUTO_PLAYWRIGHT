import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: the Mass Mark actions do NOT appear in the lead DETAIL (form) Action dropdown.
 * Test Case ID: CRM-10601_3.3.1.5   (Jira: CRM-10777 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: On a lead detail (form) screen, the Action dropdown shows neither "Mass Mark as Duplicate"
 *          nor "Mass Mark as Duplicate and Deactivate".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.3\.1\.5:" --project=chromium
 *
 * Source manual TC (Jira CRM-10777)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.3 leads list
 *
 *   Pre-conditions:
 *     - Login as sales director. Ex: Veronika
 *
 *   Steps:
 *     1. Open CRM module
 *     2. Navigate to Leads list
 *     3. Open a lead
 *     4. Click Action dropdown
 *
 *   Expected Result (step 4):
 *     4. Does not show "Mass Mark as Duplicate" & "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "sales director" -> users.manager_veronika (Veronika). Even the director does not see the mass-mark
 *   options on a record's detail/form screen (they are list-only mass actions). Read-only check.
 */

const ACTOR = users.manager_veronika;

test.describe('CRM-10601_3.3.1.5 - Mass Mark actions do not appear in the lead detail screen', () => {
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

  test('CRM-10601_3.3.1.5: Mass Mark as Duplicate action does not appear in lead detail screen', async ({ page }, testInfo) => {
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

    // Step 2: Navigate to Leads list
    await test.step('Step 2: Navigate to Leads list', async () => {
      await homePage.navigateToLeads();
      console.log('✓ Leads list opened');
    });

    // Step 3: Open a lead
    await test.step('Step 3: Open a lead', async () => {
      await opportunityPage.openFirstListRecord();
      console.log('✓ Lead detail screen opened');
    });

    // Step 4: Click Action dropdown -> does NOT show the Mass Mark options
    await test.step('Step 4: Click Action dropdown', async () => {
      await opportunityPage.clickFormActionMenu();
      const labels = await opportunityPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10777 - Lead detail Action menu (no Mass Mark options)');
      expect(labels.length, 'The form Action menu should have opened with options').toBeGreaterThan(0);
      expect(labels, 'The detail Action menu should NOT show "Mass Mark as Duplicate"').not.toContain('Mass Mark as Duplicate');
      expect(labels, 'The detail Action menu should NOT show "Mass Mark as Duplicate and Deactivate"').not.toContain('Mass Mark as Duplicate and Deactivate');
      console.log('✅ Neither Mass Mark option appears in the lead detail Action menu');
    });
  });
});
