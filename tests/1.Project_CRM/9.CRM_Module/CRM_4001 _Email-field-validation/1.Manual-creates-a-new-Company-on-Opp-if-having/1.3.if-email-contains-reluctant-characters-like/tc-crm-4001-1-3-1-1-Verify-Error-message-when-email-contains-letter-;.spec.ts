import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-4001 - Email field validation
 * Test Case ID: CRM-4001_1.3.1.1
 *
 * Summary: Verify an Error message appears when manual creating a new Company on Opp
 *          if email contains reluctant characters like ";" letter
 *
 * Command to run:
 * npx playwright test --grep "CRM-4001_1\.3\.1\.1:" --project=chromium
 *
 * Pre-condition:
 * 1.  After login successful, click at "CRM" button
 * 2.  On "CRM" page, click at "view list" button
 * 3.  On "Opp" page, click at "CREATE" button
 * 4.  Enter the following information:
 *     - Opp name textbox = TEST Opp 1 CRM-4001_1.3.1.1
 *     - "Email" textbox  = test;test@CRM-3523-company-jan-08.com
 *       (= Email_Contact#1)
 * 5.  Press "SAVE" button
 *
 * Verification:
 * 5. The "Odoo Server Error" box appears with the text:
 *    The email is invalid! Please ensure it has no commas, spaces, etcetera, or multiple emails.
 */

test.describe('CRM-4001_1.3.1.1 - Verify Error message appears when email contains ";" letter on Opp', () => {

  const tcId    = 'CRM-4001_1.3.1.1';
  const oppName = `TEST Opp 1 ${tcId}`;

  // Email with semicolon character (Email_Contact#1)
  const email_Contact1 = 'test;test@CRM-3523-company-jan-08.com';

  // Expected error message text
  const expectedErrorText = 'The email is invalid! Please ensure it has no commas, spaces, etcetera, or multiple emails.';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('\u26a0\ufe0f Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('\u2713 Page stabilized');
    }
  });

  test('CRM-4001_1.3.1.1: Verify Error message appears when email contains ";" letter on Opp', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Opp name       : ${oppName}`);
    console.log(`  Email_Contact#1: ${email_Contact1}`);

    // ==============================================================
    // Pre-condition step 1: Login and navigate to CRM
    // ==============================================================

    await test.step('Step 1: Login and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\u2713 Login successful');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('\u2713 Navigated to CRM module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - CRM page');
    });

    // ==============================================================
    // Pre-condition step 2: Switch to list view
    // ==============================================================

    await test.step('Step 2: Click "view list" button', async () => {
      console.log('Step 2: Switching to list view');
      await opportunityPage.switchToListView();
      console.log('\u2713 List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Opp list view');
    });

    // ==============================================================
    // Pre-condition step 3: Click CREATE
    // ==============================================================

    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('\u2713 Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Opp creation form');
    });

    // ==============================================================
    // Pre-condition step 4: Fill fields
    // ==============================================================

    await test.step('Step 4: Fill Opp name and Email', async () => {
      console.log('Step 4: Filling Opp fields');

      console.log(`  4.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);

      console.log(`  4.2: Email (Email_Contact#1) = "${email_Contact1}"`);
      await opportunityPage.fillEmail(email_Contact1);

      console.log('\u2713 Fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Fields filled');
    });

    // ==============================================================
    // Pre-condition step 5: Press SAVE
    // ==============================================================

    await test.step('Step 5: Press SAVE button', async () => {
      console.log('Step 5: Clicking SAVE button');
      await opportunityPage.clickSave();
      console.log('\u2713 SAVE clicked - waiting for error dialog');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - After SAVE');
    });

    // ==============================================================
    // Verification: Odoo Server Error dialog appears with correct text
    // ==============================================================

    await test.step('Step 5 - Verification: Odoo Server Error dialog appears', async () => {
      console.log(`\n=== VERIFICATION ===`);
      console.log('Verifying "Odoo Server Error" dialog appears with expected text');

      const dialogText = await opportunityPage.waitForServerErrorDialog();
      console.log('\u2713 "Odoo Server Error" dialog is visible');
      console.log(`  Dialog text: "${dialogText}"`);
      console.log(`  Expected   : "${expectedErrorText}"`);

      expect(dialogText, `Dialog should contain: "${expectedErrorText}"`).toContain(expectedErrorText);
      console.log(`\u2713 Verification passed: Error message matches expected text`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Odoo Server Error dialog');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-4001_1.3.1.1 verification completed successfully');
      console.log(`   TC ID          : ${tcId}`);
      console.log(`   Opp name       : "${oppName}"`);
      console.log(`   Email_Contact#1: "${email_Contact1}"`);
      console.log(`   Error message  : "${expectedErrorText}"`);
      console.log('==================================================\n');
    });
  });
});