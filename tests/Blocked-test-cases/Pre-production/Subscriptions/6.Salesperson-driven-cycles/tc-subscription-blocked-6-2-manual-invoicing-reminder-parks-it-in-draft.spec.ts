import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  parseMMDDYYYY,
  dayDiff,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-blocked-6.2 - On a manually invoiced subscription the reminder day moves it to Draft,
 *                       and the billing day then issues nothing
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-blocked-6.2
 *  Spec ID:         SC-23 / FUNC-0158, FUNC-0187
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - BLOCKED ON SCHEDULED JOBS AND DEVELOPER-MODE ACCESS
 *
 *  This test case requires:
 *  1. The development team to trigger the reminder day run (scheduled job) on a specific date
 *  2. The development team to trigger the billing day run (scheduled job) on a specific date
 *  3. Access to Settings > Technical > Email (requires developer mode) to verify email queues
 *
 *  QA cannot schedule or trigger background jobs or access developer-mode pages. These are
 *  server-side environment capabilities that development owns.
 *
 *  TO UNBLOCK: The spec is complete. When the env gains QA-accessible scheduled-job endpoints,
 *  change `test.skip(` to `test(` and remove this BLOCKED note. Alternatively, the test can run
 *  manually in its current form: set up the subscription in Draft with reminder enabled, ask dev
 *  to run the reminder and billing jobs at the stated times, then re-run steps 2 and 4 with this
 *  spec's verification logic to confirm the expectations.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on
 *      pre-production (pre-production.nakivo.site)
 *    Create a new subscription in Subscriptions > Subscriptions with:
 *      - Customer = "Cust-Manual-<unique>"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start date = today
 *      - one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment",
 *        Quantity = 1
 *    Click "SAVE", move it to "In Progress", tick "Subscription Reminder" and set
 *      "Remind Before Days" = 10
 *    Ask the development team to flag this subscription for manual invoicing if the flag is not
 *      editable on the form
 *    Note "Date of Next Invoice" and the "Invoices" count
 *
 *  Steps to reproduce:
 *   1. [MANUAL ONLY - the reminder run is a scheduled job the development team triggers for
 *        a named date] Ask the development team to run the reminder day of
 *        "Date of Next Invoice" minus 10 days, once
 *   2. Reopen the subscription and read the stage bar and the chatter
 *   3. [MANUAL ONLY - the billing run is a scheduled job the development team triggers for
 *        a named date] Ask the development team to run the billing day of "Date of Next Invoice",
 *        once
 *   4. Reopen the subscription and read the "Invoices" smart button and "Date of Next Invoice"
 *   5. [MANUAL ONLY - no page-object method: Settings > Technical > Email (developer mode on)
 *        requires developer-mode access that QA does not hold] Open Settings > Technical > Email >
 *        Emails on pre-production (developer mode on) and search the subscription Reference
 *
 *  Verification Points:
 *   2. The stage bar reads "Draft" and the chatter records the move
 *   4. The "Invoices" count is unchanged - nothing was issued on the billing day
 *      "Date of Next Invoice" has not moved
 *   5. No invoice mail for this subscription was queued for the billing day
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-blocked-6\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-blocked-6.2';
const ADMIN = users.admin_crm;
const TEMPLATE = TEMPLATE_MONTHLY_INVOICE_ONLY;
const PRICELIST = 'Public Pricelist_USD (USD)';
const PRODUCT_SKU = SKU_O365;
const QUANTITY = 1;
const REMIND_BEFORE_DAYS = 10;

const STEP = {
  s1: 'Step 1: Ask the development team to run the reminder day of "Date of Next Invoice" minus 10 days, once',
  s2: 'Step 2: Reopen the subscription and read the stage bar and the chatter',
  s3: 'Step 3: Ask the development team to run the billing day of "Date of Next Invoice", once',
  s4: 'Step 4: Reopen the subscription and read the "Invoices" smart button and "Date of Next Invoice"',
  s5: 'Step 5: Open Settings > Technical > Email > Emails on pre-production (developer mode on) and search the subscription Reference',
} as const;

test.describe(`${TC_ID} - Manual invoicing reminder parks it in Draft`, () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: Manual invoicing reminder parks the subscription in Draft and blocks the billing day`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = (await import('@pages')).LoginPage;
    const subscriptionPage = new SubscriptionPage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-Manual-${unique}`;
    let reference = '';
    let nextInvoiceDateBeforeReminder = '';
    let invoiceCountBefore = -1;

    // ===================== Pre-conditions (no separate test.step per Rule 1) =====================
    // Pre-condition 1: Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on pre-production (pre-production.nakivo.site)
    console.log(`\n--- Pre-condition 1: Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on pre-production (pre-production.nakivo.site) ---`);
    const { LoginPage } = await import('@pages');
    const loginPageInstance = new LoginPage(page);
    await loginPageInstance.navigateTo(baseUrl);
    await loginPageInstance.login(ADMIN.username, ADMIN.password, CommonUtils.waitTimes.login);
    console.log('✓ Logged in as Subscription staff');

    // Pre-condition 2: Create a new subscription in Subscriptions > Subscriptions with:
    console.log(`\n--- Pre-condition 2: Create a new subscription in Subscriptions > Subscriptions with: ---`);
    await subscriptionPage.openSubscriptionsList();
    await subscriptionPage.clickCreate();
    console.log('✓ New subscription form opened');

    // Pre-condition 3: Fill the subscription form (Customer / Template / Start Date / Product Line)
    console.log(`\n--- Pre-condition 3: Fill the subscription form ---`);
    console.log(`  - Customer              : ${customerName}`);
    console.log(`  - Subscription Template : ${TEMPLATE}`);
    console.log(`  - Start Date            : ${todayMMDDYYYY()}`);
    console.log(`  - Product               : ${PRODUCT_SKU}, Quantity = ${QUANTITY}`);
    await subscriptionPage.fillMany2One('partner_id', customerName, true);
    await subscriptionPage.setPricelist(PRICELIST);
    await subscriptionPage.fillMany2One('template_id', TEMPLATE);
    await subscriptionPage.setDateField('date_start', todayMMDDYYYY());
    await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);
    console.log('✓ Subscription form filled');

    // Pre-condition 4: Click "SAVE", move it to "In Progress", tick "Subscription Reminder" and set "Remind Before Days" = 10
    console.log(`\n--- Pre-condition 4: Click "SAVE", move it to "In Progress", tick "Subscription Reminder" and set "Remind Before Days" = 10 ---`);
    await subscriptionPage.save();
    await subscriptionPage.waitForLoaded();
    reference = await subscriptionPage.getCode();
    console.log(`✓ Subscription saved - Reference = "${reference}"`);

    await subscriptionPage.setStage('In Progress');
    console.log('✓ Stage set to "In Progress"');

    await subscriptionPage.clickEdit();
    await subscriptionPage.setCheckbox('subscription_reminder', true);
    await subscriptionPage.fillMany2One('remind_before_days', String(REMIND_BEFORE_DAYS));
    await subscriptionPage.save();
    await subscriptionPage.waitForLoaded();
    console.log(`✓ "Subscription Reminder" ticked, "Remind Before Days" = ${REMIND_BEFORE_DAYS}`);

    // Pre-condition 5: Ask the development team to flag this subscription for manual invoicing if the flag is not editable on the form; Note "Date of Next Invoice" and the "Invoices" count
    console.log(`\n--- Pre-condition 5: Ask the development team to flag this subscription for manual invoicing if the flag is not editable on the form; Note "Date of Next Invoice" and the "Invoices" count ---`);
    nextInvoiceDateBeforeReminder = await subscriptionPage.getDateOfNextInvoice();
    invoiceCountBefore = await subscriptionPage.getInvoiceCount();
    console.log(`  - Noted "Date of Next Invoice" : ${nextInvoiceDateBeforeReminder}`);
    console.log(`  - Noted "Invoices" count       : ${invoiceCountBefore}`);
    console.log('✓ (Dev should flag for manual invoicing if not auto-editable on the form)');

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const reminderDate = parseMMDDYYYY(nextInvoiceDateBeforeReminder);
      if (reminderDate) {
        const reminder = new Date(reminderDate.getFullYear(), reminderDate.getMonth(), reminderDate.getDate() - REMIND_BEFORE_DAYS);
        console.log(`  - Target date: "Date of Next Invoice" (${nextInvoiceDateBeforeReminder}) minus ${REMIND_BEFORE_DAYS} days = ${reminder.toLocaleDateString('en-US')}`);
      }
      console.log('  (Awaiting dev to run the reminder job for the calculated date)');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await subscriptionPage.openByUrl('');
      await subscriptionPage.waitForLoaded();

      const state = await subscriptionPage.getState();
      const chatter = await subscriptionPage.getChatterText();

      // Print VERIFY block BEFORE expects
      console.log(`\n=== VERIFY (Step 2) ===`);
      console.log(`Expected: State = "Draft"; chatter records the move to Draft`);
      console.log(`Actual  : State = "${state}"; chatter text length = ${(chatter || '').length} chars`);
      console.log(`Result  : ${state === 'Draft' && (chatter || '').toLowerCase().includes('draft') ? 'PASS' : 'FAIL'}`);
      console.log(`OVERALL : ${state === 'Draft' && (chatter || '').toLowerCase().includes('draft') ? 'PASS' : 'FAIL'}\n`);

      let __verifyPassed = false;
      try {
        expect(state, 'VP2: the reminder should move the subscription to Draft').toBe('Draft');
        expect(chatter, 'VP2: the chatter should record the stage change to Draft').toMatch(/draft/i);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 2 - subscription moved to Draft by reminder', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Target date: "Date of Next Invoice" (${nextInvoiceDateBeforeReminder})`);
      console.log('  (Awaiting dev to run the billing job for the calculated date)');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await subscriptionPage.openByUrl('');
      await subscriptionPage.waitForLoaded();

      const invoiceCountAfter = await subscriptionPage.getInvoiceCount();
      const nextInvoiceDateAfter = await subscriptionPage.getDateOfNextInvoice();

      // Print VERIFY block BEFORE expects
      const verifyPassed = invoiceCountAfter === invoiceCountBefore && nextInvoiceDateAfter === nextInvoiceDateBeforeReminder;
      console.log(`\n=== VERIFY (Step 4) ===`);
      console.log(`Expected: "Invoices" count unchanged (${invoiceCountBefore}); "Date of Next Invoice" unchanged (${nextInvoiceDateBeforeReminder})`);
      console.log(`Actual  : "Invoices" count = ${invoiceCountAfter}; "Date of Next Invoice" = "${nextInvoiceDateAfter}"`);
      console.log(`Result  : ${verifyPassed ? 'PASS' : 'FAIL'}`);
      console.log(`OVERALL : ${verifyPassed ? 'PASS' : 'FAIL'}\n`);

      let __verifyPassed = false;
      try {
        expect(invoiceCountAfter, 'VP4: the billing day should issue no invoice when the subscription is in Draft').toBe(invoiceCountBefore);
        expect(nextInvoiceDateAfter, 'VP4: "Date of Next Invoice" should not advance when no billing occurred').toBe(nextInvoiceDateBeforeReminder);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - billing day issued nothing; subscription still in Draft', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - Subscription Reference to search: "${reference}"`);
      console.log('  (Manual verification: navigate to Settings > Technical > Email (developer mode on) and search email queue for this reference)');
      console.log('  (Expected: no invoice email queued for the billing day because the subscription is in Draft)');
    });
  });
});
