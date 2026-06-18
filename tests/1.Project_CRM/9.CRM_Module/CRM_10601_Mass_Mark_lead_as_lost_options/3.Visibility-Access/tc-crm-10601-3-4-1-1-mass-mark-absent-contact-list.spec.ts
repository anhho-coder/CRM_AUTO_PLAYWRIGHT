import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Visibility: the Mass Mark actions do NOT appear in the Contact LIST Action dropdown.
 * Test Case ID: CRM-10601_3.4.1.1   (Jira: CRM-10778 - Post-EA Test Case)
 * Automation-Type: new
 * Automation-Date: 2026-06-18
 *
 * Summary: In the Contacts (res.partner) list, the Action dropdown shows neither "Mass Mark as
 *          Duplicate" nor "Mass Mark as Duplicate and Deactivate" (those are crm.lead-only actions).
 *
 * Command to run:
 *   npx playwright test --grep "CRM-10601_3\.4\.1\.1:" --project=chromium
 *
 * Source manual TC (Jira CRM-10778)
 *   Test Repository Path: /CRM test/CRM module/CRM-10601 Veronikas request - Mass Mark lead as lost options/3. Visibility & Access/3.4 Contact list
 *
 *   Pre-conditions:
 *     - Login as sales director. Ex: Veronika
 *
 *   Steps:
 *     1. Open Contact module
 *     2. Navigate to Contact list
 *     3. Select a contact and click Action dropdown
 *
 *   Expected Result (step 3):
 *     3. Does not show "Mass Mark as Duplicate" & "Mass Mark as Duplicate and Deactivate"
 *
 * Design notes:
 * - "sales director" -> users.manager_veronika (Veronika). Read-only visibility check.
 */

const ACTOR = users.manager_veronika;

test.describe('CRM-10601_3.4.1.1 - Mass Mark actions do not appear in the Contact list screen', () => {
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

  test('CRM-10601_3.4.1.1: "Mass Mark as Duplicate" does not appear in Contact list screen', async ({ page }, testInfo) => {
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

    // Step 3: Select a contact and click Action dropdown -> does NOT show the Mass Mark options
    await test.step('Step 3: Select a contact and click Action dropdown', async () => {
      await contactPage.selectFirstListRow();
      await contactPage.clickListActionMenu();
      const labels = await contactPage.getOpenActionMenuOptionLabels();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM-10778 - Contact list Action menu (no Mass Mark options)');
      expect(labels.length, 'The Action menu should have opened with options').toBeGreaterThan(0);
      expect(labels, 'The Contact list Action menu should NOT show "Mass Mark as Duplicate"').not.toContain('Mass Mark as Duplicate');
      expect(labels, 'The Contact list Action menu should NOT show "Mass Mark as Duplicate and Deactivate"').not.toContain('Mass Mark as Duplicate and Deactivate');
      console.log('✅ Neither Mass Mark option appears in the Contact list Action menu');
    });
  });
});
