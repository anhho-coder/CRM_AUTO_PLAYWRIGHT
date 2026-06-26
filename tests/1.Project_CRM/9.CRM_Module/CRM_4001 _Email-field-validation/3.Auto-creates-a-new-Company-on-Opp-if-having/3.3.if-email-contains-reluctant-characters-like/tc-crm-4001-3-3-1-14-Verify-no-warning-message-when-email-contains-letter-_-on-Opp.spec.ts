import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-4001 - Email field validation
 * Test Case ID: CRM-4001_3.3.1.14
 * Automation-Type: refactored
 * Automation-Date: 2026-06-26
 *
 * Summary: Verify a valid email whose local part contains "_" does NOT trigger the invalid-email
 *          warning log note when auto-creating a new Company on Opp. "_" is a legal local-part
 *          character (e.g. user+tag@gmail.com), so no warning should be posted to the Log.
 *
 * Command to run:
 * npx playwright test --grep "CRM-4001_3\.3\.1\.14:" --project=chromium
 *
 * Pre-condition:
 * 1.  After login successful, click at "CRM" button
 * 2.  On "CRM" page, click at "view list" button
 * 3.  On "Opp" page, click at "CREATE" button
 * 4.  Enter the following information:
 *     - Opp name textbox = TEST Opp 1 CRM-4001_3.3.1.14
 *     - "Email" textbox  = test_test@CRM-3523-company-jan-08.com
 *       (= Email_Contact#1)
 *     - Created manually checkbox = FALSE (uncheck)
 * 5.  Press "SAVE" button and wait until page load completely
 * 6.  Refresh page (up to 10 times, max 3 minutes) to allow the auto-creation job to run
 *
 * Verification:
 * 6. On the Log area, the invalid-email warning message does NOT appear (the email is valid):
 *    "This lead contains an invalid email address. ... Ensure it has no commas, spaces, etcetera, or multiple emails."
 *
 * Note: Resolved under CRM-10450. The original expectation (the warning log note) was incorrect - the
 *       email validator correctly accepts "_" (and * & ! # $ % ^ _ =), so no warning is posted.
 */

const SKIP_CLEANUP = false; // true = skip deleting the Opp created by this test

test.describe('CRM-4001_3.3.1.14 - Verify a valid email containing "_" posts no warning on Opp (auto)', () => {

  const tcId    = 'CRM-4001_3.3.1.14';
  const oppName = `TEST Opp 1 ${tcId}`;

  // Email with underscore character (Email_Contact#1) - a VALID local-part character
  const email_Contact1 = 'test_test@CRM-3523-company-jan-08.com';

  // Warning message that must NOT appear in the Log area (the email is valid)
  const invalidEmailWarning = 'This lead contains an invalid email address. Please update the email address both in this lead and in the contact! Ensure it has no commas, spaces, etcetera, or multiple emails.';

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

  test('CRM-4001_3.3.1.14: Verify a valid email containing "_" posts no warning on Opp (auto)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Opp name       : ${oppName}`);
    console.log(`  Email_Contact#1: ${email_Contact1}`);
    console.log(`  Warning (must NOT appear): ${invalidEmailWarning}`);

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
    // Pre-condition step 4: Fill fields + uncheck Created manually
    // ==============================================================

    await test.step('Step 4: Fill Opp name, Email, and uncheck Created manually', async () => {
      console.log('Step 4: Filling Opp fields');

      console.log(`  4.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);

      console.log(`  4.2: Email (Email_Contact#1) = "${email_Contact1}"`);
      await opportunityPage.fillEmail(email_Contact1);

      console.log('  4.3: Uncheck "Created manually" checkbox (set to FALSE)');
      await opportunityPage.uncheckCreatedManually();
      console.log('✓ "Created manually" unchecked');

      console.log('✓ All fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Fields filled');
    });

    // ==============================================================
    // Pre-condition step 5: Press SAVE and wait until page loads completely
    // ==============================================================

    await test.step('Step 5: Press "SAVE" button and wait until page load completely', async () => {
      console.log('Step 5: Clicking SAVE button and waiting for page to load completely');
      await opportunityPage.saveAndWaitForCompletion();
      await opportunityPage.waitForRecordSaved().catch(() => {});
      createdUrl = page.url();
      console.log(`✓ SAVE clicked and page loaded completely (${createdUrl})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - After SAVE (Log area)');
    });

    // ==============================================================
    // Step 6: Refresh up to 10 times (max 3 min) to let the auto-creation
    //         job run, then confirm NO invalid-email warning was posted
    // ==============================================================

    let chatterResult: { found: boolean; chatterText: string };

    await test.step('Step 6: Refresh page (up to 10 times, max 3 minutes); confirm no warning is posted', async () => {
      console.log('Step 6: Waiting through the auto-creation window; the invalid-email warning must NOT appear...');
      chatterResult = await opportunityPage.waitForChatterContaining(
        invalidEmailWarning,
        10,                                  // maxAttempts
        0,                                   // 0s interval - reload immediately after each check
        CommonUtils.waitTimes.elementAppear, // 3 min total max
      );
      console.log(`✓ Refresh loop completed. Warning found: ${chatterResult.found} (expected: false)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Log area (no warning)');
    });

    // ==============================================================
    // Verification: Log area does NOT contain the invalid-email warning
    // ==============================================================

    await test.step('Step 6 - Verification: Log area has no invalid-email warning', async () => {
      console.log(`\n=== VERIFICATION ===`);
      console.log('Verifying the Log area does NOT contain the invalid-email warning (email is valid)');
      console.log(`  Warning text: "${invalidEmailWarning}"`);
      console.log(`  Found       : ${chatterResult!.found}`);

      expect(
        chatterResult!.found,
        `No invalid-email warning should be posted for a valid email ("_")`,
      ).toBeFalsy();

      console.log('✓ Verification passed: no invalid-email warning was posted');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - no warning in Log');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-4001_3.3.1.14 verification completed successfully');
      console.log(`   TC ID          : ${tcId}`);
      console.log(`   Opp name       : "${oppName}"`);
      console.log(`   Email_Contact#1: "${email_Contact1}"`);
      console.log(`   Result         : email accepted, no invalid-email warning posted`);
      console.log('==================================================\n');
    });
  });
});
