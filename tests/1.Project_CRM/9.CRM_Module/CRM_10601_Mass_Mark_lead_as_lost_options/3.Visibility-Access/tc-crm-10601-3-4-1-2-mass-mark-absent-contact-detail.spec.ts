import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: the Mass Mark actions do NOT appear in the Contact DETAIL (form) Action dropdown.
 * Test Case ID: CRM-10601_3.4.1.2   (Jira: CRM-10779 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: On a Contact (res.partner) detail/form screen, the Action dropdown shows neither
 *          "Mass Mark as Duplicate" nor "Mass Mark as Duplicate and Deactivate".
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.4\.1\.2:" --project=chromium
 *
 * Source manual TC (Jira CRM-10779)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.4 Contact list
 *
 *   Pre-conditions:
 *     - Login as sales director. Ex: Veronika
 *
 *   Steps:
 *     1. Open Contact module
 *     2. Navigate to Contact list
 *     3. Open a Contact
 *     4. Click Action dropdown
 *
 *   Expected Result (step 4):
 *     4. Does not show "Mass Mark as Duplicate" & "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "sales director" -> users.manager_veronika (Veronika). Read-only visibility check.
 */

const ACTOR = users.manager_veronika;

test.describe('CRM-10601_3.4.1.2 - Mass Mark actions do not appear in the Contact detail screen', () => {
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

  test('CRM-10601_3.4.1.2: "Mass Mark as Duplicate and Deactivate" does not appear in Contact list screen', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);

    // Pre-condition: Login as sales director (Veronika)
    await test.step('Pre-condition: Login as sales director', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(ACTOR.username, ACTOR.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Logged in as sales director ${ACTOR.displayName}`);
    });

    // Step 1: Open Contact module
    await test.step('Step 1: Open Contact module', async () => {
      await homePage.navigateToContacts();
      console.log('✓ Contacts module opened');
    });

    // Step 2: Navigate to Contact list
    await test.step('Step 2: Navigate to Contact list', async () => {
      await contactPage.clickViewListButtonIfVisible(8000).catch(() => {});
      await contactPage.waitForListReady().catch(() => {});
      console.log('✓ Contact list opened');
    });

    // Step 3: Open a Contact
    await test.step('Step 3: Open a Contact', async () => {
      await contactPage.openFirstListRecord();
      console.log('✓ Contact detail screen opened');
    });

    // Step 4: Click Action dropdown -> does NOT show the Mass Mark options
    await test.step('Step 4: Click Action dropdown', async () => {
      await contactPage.clickFormActionMenu();
      const labels = await contactPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10779 - Contact detail Action menu (no Mass Mark options)');
      expect(labels.length, 'The form Action menu should have opened with options').toBeGreaterThan(0);
      expect(labels, 'The Contact detail Action menu should NOT show "Mass Mark as Duplicate"').not.toContain('Mass Mark as Duplicate');
      expect(labels, 'The Contact detail Action menu should NOT show "Mass Mark as Duplicate and Deactivate"').not.toContain('Mass Mark as Duplicate and Deactivate');
      console.log('✅ Neither Mass Mark option appears in the Contact detail Action menu');
    });
  });
});
