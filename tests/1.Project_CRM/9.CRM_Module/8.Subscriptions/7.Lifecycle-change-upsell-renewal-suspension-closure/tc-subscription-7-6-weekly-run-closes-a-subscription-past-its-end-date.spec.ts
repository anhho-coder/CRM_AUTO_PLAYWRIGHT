import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  loginAsCrmAdmin,
  logVerify,
  toMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-7.6 - Weekly run closes a subscription past its end date
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-7.6
 *  Spec ID:         SC-26 / FUNC-0190
 *  Spec:            [FRD] Subscription Management (End date and notifications)
 *  Jira:            CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  BLOCKED - Weekly end-date run is a scheduled job the development team triggers for a named date.
 *
 *  The test spec is complete and ready to run once the development team runs the weekly end-date
 *  close for today (or a date matching the subscription end dates created in the test). To unblock:
 *  1. Run the test to the end of step 2 (manual inspection of both subscriptions created)
 *  2. Contact the development team to run the weekly end-date close for today (or the end date set)
 *  3. Change test.skip( to test( below to resume the test
 *  4. Re-run to verify step 3 is completed and proceed with steps 4-5
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login as Subscription staff with the "Manage Subscriptions" right (e.g. Anh Ho) on pre-production (pre-production.nakivo.site)
 *    Create two new subscriptions in Subscriptions > Subscriptions for customer "Cust-EndDate-<unique>", both with:
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - one Subscription Line, Product = "[CP-NC-O365] Office 365 for CSP - No Commitment", Quantity = 1
 *    On subscription A set an End Date in the past (or ask the development team for one); on subscription B leave the End Date empty
 *    Click "SAVE" and move both to "In Progress"
 *
 *  Executed Steps (VERBATIM - one test.step each, same order, same wording):
 *   1. Open subscription A and note its End Date and stage
 *   2. Open subscription B and confirm it has no End Date
 *   3. Ask the development team to run the weekly end-date close for today, once
 *   4. Reopen subscription A and read the stage bar and the chatter
 *   5. Reopen subscription B and read the stage bar
 *
 *  Expected Results (VERBATIM - keyed to step numbers):
 *   4. The stage bar of subscription A reads "Closed" and the chatter records the close
 *   5. Subscription B is untouched - the stage bar still reads "In Progress"
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-7\.6:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-7.6';
const TEMPLATE = 'Monthly Sub/Invoice only';
const PRICELIST = 'Public Pricelist_USD (USD)';
const PRODUCT_SKU = 'CP-NC-O365';
const QUANTITY = 1;

const STEP = {
  s1: 'Open subscription A and note its End Date and stage',
  s2: 'Open subscription B and confirm it has no End Date',
  s3: 'Ask the development team to run the weekly end-date close for today, once',
  s4: 'Reopen subscription A and read the stage bar and the chatter',
  s5: 'Reopen subscription B and read the stage bar',
};

test.describe('subscription-7.6 - Weekly run closes a subscription past its end date', () => {

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

  test.skip(`${TC_ID}: The weekly end-date run closes a subscription whose end date has passed and leaves a subscription without an end date untouched`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const unique = CommonUtils.generateUniqueId();
    const customerName = `Cust-EndDate-${unique}`;
    let subscriptionACode = '';
    let subscriptionBCode = '';
    let subscriptionAUrl = '';
    let subscriptionBUrl = '';
    let subscriptionAEndDate = '';
    let subscriptionAStageBeforeRun = '';
    let subscriptionBEndDate = '';
    let subscriptionBStageBeforeRun = '';

    // Calculate an end date in the past (3 days ago)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);
    const pastDateMMDDYYYY = toMMDDYYYY(pastDate);

    // ===================== Pre-conditions =====================
    await test.step('Pre-condition 1: Login as Subscription staff with "Manage Subscriptions" right', async () => {
      console.log('Pre-condition 1: Logging in as subscription staff (Anh Ho)');
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step('Pre-condition 2: Open Subscriptions > Subscriptions', async () => {
      console.log('Pre-condition 2: Opening the Subscriptions list');
      await subscriptionPage.openSubscriptionsList();
      console.log('✓ Subscriptions list opened');
    });

    await test.step('Pre-condition 3: Create subscription A with End Date in the past', async () => {
      console.log(`Pre-condition 3: Creating subscription A for customer "${customerName}"`);
      await subscriptionPage.clickCreate();

      console.log(`  - Filling header: Customer="${customerName}", Pricelist="${PRICELIST}", Template="${TEMPLATE}"`);
      await subscriptionPage.fillMany2One('partner_id', customerName, true);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());

      console.log(`  - Adding subscription line: Product="${PRODUCT_SKU}", Quantity=${QUANTITY}`);
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);

      console.log(`  - Setting End Date to past date: ${pastDateMMDDYYYY}`);
      await subscriptionPage.setDateField('date_end', pastDateMMDDYYYY);

      console.log('  - Saving subscription A');
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();

      subscriptionACode = await subscriptionPage.getCode();
      subscriptionAUrl = page.url();
      console.log(`✓ Subscription A saved - Reference = "${subscriptionACode}", URL = ${subscriptionAUrl}`);

      console.log('  - Setting stage to In Progress');
      await subscriptionPage.setStage('In Progress');
      console.log('✓ Subscription A is now In Progress');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - subscription A created with past end date').catch(() => {});
    });

    await test.step('Pre-condition 4: Create subscription B with no End Date', async () => {
      console.log('Pre-condition 4: Creating subscription B (same customer, no end date)');
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clickCreate();

      console.log(`  - Filling header: Customer="${customerName}", Pricelist="${PRICELIST}", Template="${TEMPLATE}"`);
      await subscriptionPage.fillMany2One('partner_id', customerName);
      await subscriptionPage.setPricelist(PRICELIST);
      await subscriptionPage.fillMany2One('template_id', TEMPLATE);
      await subscriptionPage.setDateField('date_start', todayMMDDYYYY());

      console.log(`  - Adding subscription line: Product="${PRODUCT_SKU}", Quantity=${QUANTITY}`);
      await subscriptionPage.addSubscriptionLine(PRODUCT_SKU, QUANTITY);

      console.log('  - Leaving End Date empty');
      console.log('  - Saving subscription B');
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();

      subscriptionBCode = await subscriptionPage.getCode();
      subscriptionBUrl = page.url();
      console.log(`✓ Subscription B saved - Reference = "${subscriptionBCode}", URL = ${subscriptionBUrl}`);

      console.log('  - Setting stage to In Progress');
      await subscriptionPage.setStage('In Progress');
      console.log('✓ Subscription B is now In Progress');

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - subscription B created without end date').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step('Step 1: Open subscription A and note its End Date and stage', async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`Step 1: Opening subscription A (${subscriptionACode})`);
      await subscriptionPage.openByUrl(subscriptionAUrl);

      subscriptionAEndDate = await subscriptionPage.getEndDate();
      subscriptionAStageBeforeRun = await subscriptionPage.getState();

      console.log(`  - Subscription A End Date: "${subscriptionAEndDate}"`);
      console.log(`  - Subscription A Stage: "${subscriptionAStageBeforeRun}"`);

      let __verifyPassed = false;
      try {
        expect(subscriptionAEndDate, 'Step 1: subscription A should have an End Date in the past').toBeTruthy();
        expect(subscriptionAStageBeforeRun, 'Step 1: subscription A should be in In Progress stage before the run').toBe('In Progress');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 1 - subscription A opened, end date and stage noted', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('Step 2: Open subscription B and confirm it has no End Date', async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`Step 2: Opening subscription B (${subscriptionBCode})`);
      await subscriptionPage.openByUrl(subscriptionBUrl);

      subscriptionBEndDate = await subscriptionPage.getEndDate();
      subscriptionBStageBeforeRun = await subscriptionPage.getState();

      console.log(`  - Subscription B End Date: "${subscriptionBEndDate || '(empty)'}" (should be empty)`);
      console.log(`  - Subscription B Stage: "${subscriptionBStageBeforeRun}"`);

      let __verifyPassed = false;
      try {
        expect(subscriptionBEndDate, 'Step 2: subscription B should NOT have an End Date').toBeFalsy();
        expect(subscriptionBStageBeforeRun, 'Step 2: subscription B should be in In Progress stage').toBe('In Progress');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 2 - subscription B opened, confirmed no end date', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('[MANUAL ONLY - the weekly end-date close is a scheduled job the development team triggers for a named date] Step 3: Ask the development team to run the weekly end-date close for today, once', async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('Step 3: MANUAL - waiting for development team to run the weekly end-date close');
      console.log(`  - For subscriptions A and B created for customer "${customerName}"`);
      console.log(`  - Subscription A has End Date: ${subscriptionAEndDate}`);
      console.log(`  - Subscription B has End Date: ${subscriptionBEndDate || '(empty)'}`);
      console.log('  - Development team: please run the weekly_subscription_end_date_close cron for today');
    });

    let stageAAfterRun = '';
    let chatterAText = '';
    let stageBAfterRun = '';

    await test.step('Step 4: Reopen subscription A and read the stage bar and the chatter', async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`Step 4: Reopening subscription A (${subscriptionACode}) after the weekly run`);
      await subscriptionPage.openByUrl(subscriptionAUrl);

      stageAAfterRun = await subscriptionPage.getState();
      chatterAText = await subscriptionPage.getChatterText();

      console.log(`  - Subscription A Stage after run: "${stageAAfterRun}" (expected: "Closed")`);
      console.log(`  - Chatter text:\n${chatterAText}`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - subscription A reopened, stage and chatter verified', passed: true }).catch(() => {});
    });

    await test.step('Step 5: Reopen subscription B and read the stage bar', async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`Step 5: Reopening subscription B (${subscriptionBCode}) to verify it is untouched`);
      await subscriptionPage.openByUrl(subscriptionBUrl);

      stageBAfterRun = await subscriptionPage.getState();

      console.log(`  - Subscription B Stage after run: "${stageBAfterRun}" (expected: "In Progress")`);

      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 5 - subscription B reopened, stage verified as untouched', passed: true }).catch(() => {});
    });

    await test.step('Verification: verify all expected results', async () => {
      console.log('\n==== VERIFY ====');
      console.log(`Expected: VP4 - subscription A stage bar should read "Closed" and chatter records the close`);
      console.log(`Actual: VP4 - stage bar = "${stageAAfterRun}", chatter contains closure = ${chatterAText.toLowerCase().includes('closed') || chatterAText.toLowerCase().includes('end date')}`);
      console.log(`Result: ${stageAAfterRun === 'Closed' && (chatterAText.toLowerCase().includes('closed') || chatterAText.toLowerCase().includes('end date')) ? '✓ PASS' : '✗ FAIL'}`);
      console.log();
      console.log(`Expected: VP5 - subscription B is untouched, stage bar still reads "In Progress"`);
      console.log(`Actual: VP5 - stage bar = "${stageBAfterRun}"`);
      console.log(`Result: ${stageBAfterRun === 'In Progress' ? '✓ PASS' : '✗ FAIL'}`);
      console.log();
      console.log(`OVERALL: ${stageAAfterRun === 'Closed' && (chatterAText.toLowerCase().includes('closed') || chatterAText.toLowerCase().includes('end date')) && stageBAfterRun === 'In Progress' ? '✓ ALL CHECKS PASS' : '✗ SOME CHECKS FAIL'}`);
      console.log('==== END VERIFY ====\n');

      let __verifyPassed = false;
      try {
        expect(stageAAfterRun, 'VP4: subscription A stage bar should read "Closed" after the weekly run').toBe('Closed');
        expect(chatterAText, 'VP4: the chatter should record the close action').toMatch(/closed|end date/i);
        expect(stageBAfterRun, 'VP5: subscription B stage bar should still read "In Progress" and be untouched').toBe('In Progress');
        __verifyPassed = true;
        console.log(`✅ ${TC_ID}: the weekly end-date close correctly closed the past-end-date subscription and left the no-end-date subscription untouched`);
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Final Verification - all checks complete', passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
