import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-4001 - Email field validation
 * Test Case ID: CRM-4001_3.1.1.2
 *
 * Summary: Verify a Log note shows warning message appears when auto creating a new Company on Opp
 *          if having phone number instead of email
 *
 * Command to run:
 * npx playwright test --grep "CRM-4001_3\.1\.1\.2:" --project=chromium
 * npx playwright test --grep "CRM-10617" --project=chromium
 *
 * Pre-condition:
 * 1.  After login successful, click at "CRM" button
 * 2.  On "CRM" page, click at "view list" button
 * 3.  On "Opp" page, click at "CREATE" button
 * 4.  Enter the following information:
 *     - Opp name textbox = TEST Opp 1 CRM-4001_3.1.1.2
 *     - "Email" textbox  = 0123456789
 *       (= Email_Contact#1)
 *     - Created manually checkbox = FALSE (uncheck)
 * 5.  Press "SAVE" button and wait until page load completely
 * 6.  Refresh page to verify Contact field (up to 10 times, max 3 minutes)
 *
 * Verification:
 * 6. On the Log area, verify the following message appears:
 *    "This lead contains an invalid email address. Please update the email address both in this
 *     lead and in the contact! Ensure it has no commas, spaces, etcetera, or multiple emails."
 */

test.describe.skip('CRM-4001_3.1.1.2 [CRM-10617] - Verify Log note shows warning message when having phone number instead of email on Opp', () => {

  const tcId    = 'CRM-4001_3.1.1.2';
  const oppName = `TEST Opp 1 ${tcId}`;

  // Phone number entered into the Email field (Email_Contact#1)
  const email_Contact1 = '0123456789';

  // Expected warning message text in the Log area
  const expectedLogText = 'This lead contains an invalid email address. Please update the email address both in this lead and in the contact! Ensure it has no commas, spaces, etcetera, or multiple emails.';

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

  test('CRM-4001_3.1.1.2: Verify Log note shows warning message when having phone number instead of email on Opp', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Opp name       : ${oppName}`);
    console.log(`  Email_Contact#1: ${email_Contact1}`);
    console.log(`  Expected log   : ${expectedLogText}`);

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

    await test.step('Step 4: Fill Opp name, Email, and uncheck Created manually', async () => {
      console.log('Step 4: Filling Opp fields');

      console.log(`  4.1: Opp name = "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);

      console.log(`  4.2: Email (Email_Contact#1) = "${email_Contact1}"`);
      await opportunityPage.fillEmail(email_Contact1);

      console.log('  4.3: Uncheck "Created manually" checkbox (set to FALSE)');
      await opportunityPage.uncheckCreatedManually();
      console.log('\u2713 "Created manually" unchecked');

      console.log('\u2713 All fields filled');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Fields filled');
    });

    // ==============================================================
    // Pre-condition step 5: Press SAVE and wait until page loads completely
    // ==============================================================

    await test.step('Step 5: Press "SAVE" button and wait until page load completely', async () => {
      console.log('Step 5: Clicking SAVE button and waiting for page to load completely');
      await opportunityPage.saveAndWaitForCompletion();
      console.log('\u2713 SAVE clicked and page loaded completely');

      // Scroll to the log/chatter area to make it visible in screenshot
      const chatterArea = page.locator('.o_ChatterTopbar, .o_Chatter, [class*="chatter"]').first();
      await chatterArea.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.short);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - After SAVE (Log area)');
    });

    // ==============================================================
    // Step 6: Refresh page up to 10 times (max 3 min) to wait for
    //         the auto-creation background job and the log warning
    // ==============================================================

    let chatterResult: { found: boolean; chatterText: string };

    await test.step('Step 6: Refresh page to verify Log note appears (up to 10 times, max 3 minutes)', async () => {
      console.log('Step 6: Waiting for auto-creation job to post warning to Log area...');
      chatterResult = await opportunityPage.waitForChatterContaining(
        expectedLogText,
        10,     // maxAttempts
        0,      // 0 s interval - reload immediately after each check
        180000  // 3 min total max
      );
      console.log(`\u2713 Refresh loop completed. Warning found: ${chatterResult.found}`);

      // Scroll to the log/chatter area to make it visible in screenshot
      const chatterArea = page.locator('.o_ChatterTopbar, .o_Chatter, [class*="chatter"]').first();
      await chatterArea.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.short);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Log warning visible');
    });

    // ==============================================================
    // Verification: Log area contains the expected warning message
    // ==============================================================

    await test.step('Step 6 - Verification: Log area contains the warning message', async () => {
      console.log(`\n=== VERIFICATION ===`);
      console.log('Verifying Log area contains the expected warning message');
      console.log(`  Expected: "${expectedLogText}"`);
      console.log(`  Found   : ${chatterResult!.found}`);

      expect(
        chatterResult!.chatterText,
        `Log area should contain: "${expectedLogText}"`
      ).toContain(expectedLogText);

      console.log('\u2713 Verification passed: Log warning message matches expected text');

      // Scroll to the log/chatter area to make warning visible in screenshot
      const chatterArea = page.locator('.o_ChatterTopbar, .o_Chatter, [class*="chatter"]').first();
      await chatterArea.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.short);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Log warning message');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CRM-4001_3.1.1.2 verification completed successfully');
      console.log(`   TC ID          : ${tcId}`);
      console.log(`   Opp name       : "${oppName}"`);
      console.log(`   Email_Contact#1: "${email_Contact1}"`);
      console.log(`   Log warning    : "${expectedLogText}"`);
      console.log('==================================================\n');
    });
  });
});
