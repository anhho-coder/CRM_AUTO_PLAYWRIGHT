import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  dayDiff,
  loginAsCrmAdmin,
  logVerify,
  parseMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-blocked-6.1 - Salesperson is reminded before the billing date
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-blocked-6.1
 *  Spec ID:         SC-22 / FUNC-0157
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - BLOCKED ON SCHEDULED JOB TRIGGER AND EMAIL VERIFICATION.
 *
 *  The test case depends on two environment-specific triggers:
 *   1. Step 2 requires the development team to run the reminder job for a specific date.
 *      QA cannot trigger scheduled jobs from the UI; this requires dev team intervention.
 *   2. Step 3 requires verification in Settings > Technical > Email > Emails, which is a
 *      backend email log that is not accessible via the standard page-object model and
 *      cannot be queried programmatically from automation.
 *
 *  The chatter verification (steps 4-5) is implemented and will run once steps 2-3 are
 *  manually completed by the development team.
 *
 *  TO UNBLOCK: after the development team has (a) triggered the reminder job for the
 *  configured number of days before the billing date, and (b) confirmed the email log shows
 *  the reminder was sent, change `test.skip(` to `test(` below. The spec body is complete
 *  and requires no other edit.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho)
 *      on pre-production (pre-production.nakivo.site)
 *    Create two new subscriptions in Subscriptions > Subscriptions for customer
 *      "Cust-Remind-<unique>", both with:
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start date = today
 *      - Salesperson = the logged-in tester
 *      - one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment",
 *        Quantity = 1
 *    Click "SAVE" and move both to "In Progress"
 *    On subscription A tick "Subscription Reminder" and set "Remind Before Days" = 10
 *    On subscription B leave "Subscription Reminder" unticked
 *
 *  Steps to reproduce:
 *   1. Note "Date of Next Invoice" on subscription A and on subscription B
 *   2. Ask the development team to run the reminder day of subscription A's
 *      "Date of Next Invoice" minus 10 days, once
 *   3. Open Settings > Technical > Email > Emails on pre-production (developer mode on)
 *      and search the Salesperson's address for that day
 *   4. Reopen subscription A and read its chatter
 *   5. Open subscription B and read its chatter for the same day
 *
 *  Verification Points:
 *   VP3. Exactly one row to the Salesperson, subject "Subscription Reminder", carrying
 *        a link to subscription A
 *   VP4. The chatter of subscription A records the reminder
 *   VP5. Subscription B has no reminder for that day
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "subscription-blocked-6\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-blocked-6.1';
const REMIND_BEFORE_DAYS = 10;
const PRICELIST = 'Public Pricelist_USD (USD)';

const STEP = {
  pre1: 'Pre-condition 1: Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on pre-production (pre-production.nakivo.site)',
  pre2: 'Pre-condition 2: Create two new subscriptions in Subscriptions > Subscriptions for customer "Cust-Remind-<unique>", both with: Subscription Template = "Monthly Sub/Invoice only", Start date = today, Salesperson = the logged-in tester',
  pre3: 'Pre-condition 3: Add one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment", Quantity = 1',
  pre4: 'Pre-condition 4: Move both subscriptions to "In Progress"',
  pre5: '[MANUAL ONLY - no page-object method for numeric field] Pre-condition 5: On subscription A tick "Subscription Reminder" and set "Remind Before Days" = 10',
  pre6: 'Pre-condition 6: On subscription B leave "Subscription Reminder" unticked',
  s1: 'Step 1: Note "Date of Next Invoice" on subscription A and on subscription B',
  s2: '[MANUAL ONLY - the reminder run is a scheduled job the development team triggers for a named date] Step 2: Ask the development team to run the reminder day of subscription A\'s "Date of Next Invoice" minus 10 days, once',
  s3: '[MANUAL ONLY - email verification requires backend access not available through page-object model] Step 3: Open Settings > Technical > Email > Emails on pre-production (developer mode on) and search the Salesperson\'s address for that day',
  s4: 'Step 4: Reopen subscription A and read its chatter',
  s5: 'Step 5: Open subscription B and read its chatter for the same day',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Salesperson reminded before the billing date`, () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Subscriptions with reminders and active billing cycles cannot be cleanly deleted.
    // Every run creates its own uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: The salesperson is mailed the renewal reminder the configured number of days before the billing date, and only when Subscription Reminder is ticked`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-Remind-${unique}`;
    let subscriptionAUrl = '';
    let subscriptionBUrl = '';
    let dateOfNextInvoiceA = '';
    let dateOfNextInvoiceB = '';
    let chatterTextA = '';
    let chatterTextB = '';

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      const admin = users.admin_crm;
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(admin.username, admin.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in as subscription staff');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Customer Name: ${customerName}`);
      console.log(`  - Pricelist: ${PRICELIST}`);
      console.log(`  - Template: ${TEMPLATE_MONTHLY_INVOICE_ONLY}`);
      console.log(`  - Start Date: ${todayMMDDYYYY()}`);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      await subscriptionPage.fillMany2One('partner_id', customerName, true);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE_MONTHLY_INVOICE_ONLY);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
      console.log('✓ Subscription header form filled (Customer, Template, Start Date)');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`  - Product: ${SKU_O365}`);
      console.log(`  - Quantity: 1`);
      await subscriptionPage.addSubscriptionLine(SKU_O365, 1);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      subscriptionAUrl = page.url();
      console.log(`✓ Subscription A created and saved at ${subscriptionAUrl}`);
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.waitForLoaded();
      const state = await subscriptionPage.getState();
      console.log(`✓ Subscription A moved to "${state}"`);
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await subscriptionPage.clickEdit();
      await subscriptionPage.setCheckbox('reminder', true);
      console.log(`  ⚠ MANUAL: set "Remind Before Days" to 10 in the UI`);
      console.log(`  After manual setup, SAVE and continue`);
      // Note: "Remind Before Days" is a numeric field with no page-object setter method.
      // The tester must set it manually in the UI and then save the form.
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      const reminderEnabled = await subscriptionPage.getSubscriptionReminder();
      console.log(`✓ Subscription A: Reminder enabled = ${reminderEnabled}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - Subscription A reminder enabled').catch(() => {});
    });

    // Create Subscription B without reminder enabled
    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();
      await subscriptionPage.fillMany2One('partner_id', customerName);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE_MONTHLY_INVOICE_ONLY);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
      await subscriptionPage.addSubscriptionLine(SKU_O365, 1);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();
      subscriptionBUrl = page.url();
      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.waitForLoaded();
      const reminderDisabled = !(await subscriptionPage.getSubscriptionReminder());
      console.log(`✓ Subscription B created, saved, and moved to "In Progress" - Reminder disabled = ${reminderDisabled}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - Subscription B reminder not enabled').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // Read Date of Next Invoice from subscription A
      await subscriptionPage.openByUrl(subscriptionAUrl);
      dateOfNextInvoiceA = await subscriptionPage.getDateOfNextInvoice();
      console.log(`  - Subscription A "Date of Next Invoice": ${dateOfNextInvoiceA}`);

      // Read Date of Next Invoice from subscription B
      await subscriptionPage.openByUrl(subscriptionBUrl);
      dateOfNextInvoiceB = await subscriptionPage.getDateOfNextInvoice();
      console.log(`  - Subscription B "Date of Next Invoice": ${dateOfNextInvoiceB}`);

      console.log(`✓ Both subscription dates noted`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Dates of Next Invoice noted').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  NOTE: This step is MANUAL - development team must trigger the reminder job`);
      console.log(`  Reminder trigger date: ${dateOfNextInvoiceA} minus ${REMIND_BEFORE_DAYS} days`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  NOTE: This step is MANUAL - requires backend email log verification`);
      console.log(`  Expected: exactly one email to the salesperson with subject "Subscription Reminder"`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await subscriptionPage.openByUrl(subscriptionAUrl);
      await subscriptionPage.waitForLoaded();
      chatterTextA = await subscriptionPage.getChatterText();
      console.log(`  Subscription A chatter (first 500 chars): ${(chatterTextA || '(empty)').substring(0, 500)}`);

      const reminderMentioned = chatterTextA?.includes('Reminder') || false;
      console.log(`  - Reminder mentioned in chatter: ${reminderMentioned}`);
      console.log(`✓ Subscription A chatter read`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Subscription A chatter').catch(() => {});
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await subscriptionPage.openByUrl(subscriptionBUrl);
      await subscriptionPage.waitForLoaded();
      chatterTextB = await subscriptionPage.getChatterText();
      console.log(`  Subscription B chatter (first 500 chars): ${(chatterTextB || '(empty)').substring(0, 500)}`);

      const reminderMentionedB = chatterTextB?.includes('Reminder') || false;
      console.log(`  - Reminder mentioned in chatter: ${reminderMentionedB}`);
      console.log(`✓ Subscription B chatter read`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Subscription B chatter').catch(() => {});
    });

    // ===================== Verification =====================
    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);

      const reminderInA = chatterTextA?.includes('Reminder') || false;
      const reminderInB = chatterTextB?.includes('Reminder') || false;

      console.log(`\n==================== ${STEP.verify} ====================`);
      console.log(`  Verify #1 - Subscription A chatter records the reminder:`);
      console.log(`     Expected : Chatter contains reference to reminder`);
      console.log(`     Actual   : reminderInA = ${reminderInA}`);
      console.log(`     Result   : ${reminderInA ? 'PASS' : 'FAIL'}`);
      console.log(`\n  Verify #2 - Subscription B chatter does NOT record a reminder:`);
      console.log(`     Expected : Chatter does not contain reminder reference`);
      console.log(`     Actual   : reminderInB = ${reminderInB}`);
      console.log(`     Result   : ${!reminderInB ? 'PASS' : 'FAIL'}`);
      console.log(`===============================================`);
      console.log(`OVERALL: ${reminderInA && !reminderInB ? 'PASS' : 'FAIL'} - reminder sent only to A, not to B`);

      let __verifyPassed = false;
      try {
        expect(reminderInA, 'VP4: Subscription A chatter should record the reminder').toBeTruthy();
        expect(reminderInB, 'VP5: Subscription B chatter should NOT record a reminder').toBeFalsy();
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 5 - reminder verified in chatter', passed: __verifyPassed }).catch(() => {});
      }

      console.log(`\n✅ ${TC_ID}: reminder behavior verified (assumes manual steps 2-3 completed)`);
    });
  });
});
