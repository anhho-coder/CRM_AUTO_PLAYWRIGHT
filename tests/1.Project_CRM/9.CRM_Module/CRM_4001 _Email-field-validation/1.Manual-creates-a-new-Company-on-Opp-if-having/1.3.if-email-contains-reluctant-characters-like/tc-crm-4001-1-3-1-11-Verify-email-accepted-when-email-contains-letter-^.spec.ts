import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-4001 - Email field validation
 * Test Case ID: CRM-4001_1.3.1.11
 * Automation-Type: refactored
 * Automation-Date: 2026-06-26
 *
 * Summary: Verify a valid email whose local part contains "^" is ACCEPTED (no error) when manually
 *          creating a new Company on Opp. "^" is a legal local-part character (e.g. user+tag@gmail.com),
 *          so the Opp must save with no "email is invalid" error.
 *
 * Command to run:
 * npx playwright test --grep "CRM-4001_1\.3\.1\.11:" --project=chromium
 *
 * Pre-condition:
 * 1.  After login successful, click at "CRM" button
 * 2.  On "CRM" page, click at "view list" button
 * 3.  On "Opp" page, click at "CREATE" button
 * 4.  Enter the following information:
 *     - Opp name textbox = TEST Opp 1 CRM-4001_1.3.1.11
 *     - "Email" textbox  = test^test@CRM-3523-company-jan-08.com
 *       (= Email_Contact#1)
 * 5.  Press "SAVE" button
 *
 * Verification:
 * 5. The Opp is saved successfully (record id in URL) and NO "Odoo Server Error" /
 *    "The email is invalid!" dialog appears - "^" is a valid email character.
 *
 * Note: Resolved under CRM-10450. The original expectation (an error dialog) was incorrect - the
 *       email validator correctly accepts "^" (and * & ! # $ % ^ _ =). Verified live 2026-06-26.
 */

const SKIP_CLEANUP = false; // true = skip deleting the Opp created by this test

test.describe('CRM-4001_1.3.1.11 - Verify a valid email containing "^" is accepted on Opp', () => {

  const tcId    = 'CRM-4001_1.3.1.11';
  const oppName = `TEST Opp 1 ${tcId}`;

  // Email with caret character (Email_Contact#1) - a VALID local-part character
  const email_Contact1 = 'test^test@CRM-3523-company-jan-08.com';

  // Message that must NOT appear (the email is valid)
  const invalidEmailError = 'The email is invalid!';

  let createdUrl = '';

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ Page stabilized');
    }
    // Tear down: delete the Opp this test created (valid email -> the record was saved).
    if (!SKIP_CLEANUP && createdUrl) {
      await CommonUtils.deleteRecordByUrl(page, createdUrl, testInfo).catch((e) => {
        console.log(`  ⚠ Cleanup failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  });

  test('CRM-4001_1.3.1.11: Verify a valid email containing "^" is accepted on Opp', async ({ page }, testInfo) => {
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
      console.log('✓ Login successful');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM module');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - CRM page');
    });

    // ==============================================================
    // Pre-condition step 2: Switch to list view
    // ==============================================================

    await test.step('Step 2: Click "view list" button', async () => {
      console.log('Step 2: Switching to list view');
      await opportunityPage.switchToListView();
      console.log('✓ List view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Opp list view');
    });

    // ==============================================================
    // Pre-condition step 3: Click CREATE
    // ==============================================================

    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
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

      console.log('✓ Fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Fields filled');
    });

    // ==============================================================
    // Pre-condition step 5: Press SAVE
    // ==============================================================

    await test.step('Step 5: Press SAVE button', async () => {
      console.log('Step 5: Clicking SAVE button');
      await opportunityPage.clickSave();
      console.log('✓ SAVE clicked - expecting the Opp to be accepted/saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - After SAVE');
    });

    // ==============================================================
    // Verification: NO error dialog, and the Opp is saved (valid email)
    // ==============================================================

    await test.step('Step 5 - Verification: Opp saved with no "email is invalid" error', async () => {
      console.log(`\n=== VERIFICATION ===`);
      console.log(`Verifying NO "${invalidEmailError}" dialog appears and the Opp is saved`);

      const errorShown = await opportunityPage.isServerErrorDialogVisible(CommonUtils.waitTimes.long);
      expect(errorShown, `No "${invalidEmailError}" error should appear for a valid email ("^")`).toBeFalsy();

      await opportunityPage.waitForRecordSaved();
      createdUrl = page.url();
      expect(createdUrl, 'The Opp should be saved (URL gains a record id)').toMatch(/[?#&]id=\d+/);
      console.log(`✓ Verification passed: Opp saved at ${createdUrl} with no invalid-email error`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Opp saved');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-4001_1.3.1.11 verification completed successfully');
      console.log(`   TC ID          : ${tcId}`);
      console.log(`   Opp name       : "${oppName}"`);
      console.log(`   Email_Contact#1: "${email_Contact1}"`);
      console.log(`   Result         : email accepted (no "${invalidEmailError}" error), Opp saved`);
      console.log('==================================================\n');
    });
  });
});
