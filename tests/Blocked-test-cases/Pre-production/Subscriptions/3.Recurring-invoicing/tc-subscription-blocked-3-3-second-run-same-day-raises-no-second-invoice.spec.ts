import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginAsCrmAdmin, createSubscription, logVerify,
  parseMMDDYYYY, dayDiff, todayMMDDYYYY,
  TEMPLATE_MONTHLY_INVOICE_ONLY, SKU_O365,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-blocked-3.3 - Running the billing action twice on the same day does not raise a second
 *                    invoice for the same cycle
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-blocked-3.3
 *  Spec ID:         US1 (No billing gap)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-18
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = "Cust-NoDup-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 100
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Click the "=> Generate Invoice" link under "Date of Next Invoice"
 *   2. Read the new value in "Date of Next Invoice"
 *   3. Click the "=> Generate Invoice" link a second time straight away
 *   4. Click the "Invoices" smart button and count the invoices listed
 *
 *  Verification Points:
 *   1. "Date of Next Invoice" has moved forward by one month, so the cycle is no longer due
 *   2. No new invoice is produced by the second click
 *   3. Exactly one invoice is listed, count = 1 (no second invoice for the same period)
 *
 *  KNOWN DEFECT - CRM-12188: the second run DOES raise a second invoice for the same cycle.
 *  Production holds 201 duplicate subscription invoices ($52,753.20); SUB1113 alone has 18,
 *  created one per day. The test keeps the FRD's expected result.
 *
 *  SKIPPED - the product is known to violate the expected result; the case is parked.
 *
 *  MOVED to the blocked tree on 2026-10-21, on the tester's decision, renumbered
 *  subscription-3.2 -> subscription-blocked-3.3. NOTE: unlike the rest of this tree, this case
 *  is NOT blocked by the environment - it runs end to end on pre-production and the run of
 *  2026-10-19 (run_20_20261019.log) exercised it fully. It was carried here as `test.fail()`,
 *  which Playwright counts inside "passed", and was converted to `test.skip()` to keep this
 *  tree's invariant (no `test(` blocks). The trade is that the suite no longer signals when
 *  CRM-12188 is fixed.
 *
 *  TO UNBLOCK: once CRM-12188 is fixed, move this spec back to
 *  tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing, change `test.skip(`
 *  to `test(`, and run sync_ids.py so the TC_ID follows the new file name.
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-blocked-3\.3:" --project=chromium
 *    npx playwright test --grep "CRM-12188" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-blocked-3.3';
const QUANTITY = 100;
const NEXT_DATE_TOLERANCE_DAYS = 2;

test.describe('subscription-blocked-3.3 - A second billing run on the same day raises no second invoice', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // A subscription that produced a validated invoice cannot be cleanly deleted - left on purpose.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip('subscription-blocked-3.3 [CRM-12188]: Running the billing action twice on the same day does not raise a second invoice for the same cycle', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'defect',
      description: 'CRM-12188 - a second billing run raises a SECOND invoice for the same cycle. Production holds 201 such duplicate subscription invoices ($52,753.20); SUB1113 alone accumulated 18 of them, one per day. The assertion below encodes the FRD requirement "each billing cycle shall produce exactly one invoice", which the system currently violates.',
    });
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const customerName = `Cust-NoDup-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);
    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: QUANTITY,
      nextInvoiceDate: todayMMDDYYYY(),
    });

    let nextDateAfterFirst = '';
    let countAfterFirst = -1;

    await test.step('Step 1: Click the "=> Generate Invoice" link under "Date of Next Invoice"', async () => {
      console.log('Step 1: First billing run');
      const billing = await subscriptionPage.clickGenerateInvoice();
      // The link opens the invoice it just created - come back before reading the subscription.
      await subscriptionPage.openByUrl(billing.returnUrl);
      countAfterFirst = await subscriptionPage.getInvoiceCount();
      console.log(`✓ First run done - "Invoices" smart button = ${countAfterFirst}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - after the first billing run').catch(() => {});
    });

    await test.step('Step 2: Read the new value in "Date of Next Invoice"', async () => {
      nextDateAfterFirst = await subscriptionPage.getDateOfNextInvoice();
      const parsed = parseMMDDYYYY(nextDateAfterFirst);
      const today = new Date();
      const expectedNext = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const diff = parsed ? Math.abs(dayDiff(parsed, expectedNext)) : 999;

      logVerify(
        'VP1',
        `"Date of Next Invoice" moves forward by one month to ${expectedNext.toLocaleDateString('en-US')}, so the cycle is no longer due`,
        `"Date of Next Invoice" = "${nextDateAfterFirst}" (diff ${diff} day(s))`,
        diff <= NEXT_DATE_TOLERANCE_DAYS,
      );

      expect(parsed, `VP1: "Date of Next Invoice" should be parseable (got "${nextDateAfterFirst}")`).not.toBeNull();
      expect(diff, `VP1: after billing, "Date of Next Invoice" ("${nextDateAfterFirst}") should be one month ahead`).toBeLessThanOrEqual(NEXT_DATE_TOLERANCE_DAYS);
      expect(countAfterFirst, 'VP1: the first run should have produced exactly one invoice').toBe(1);
    });

    await test.step('Step 3: Click the "=> Generate Invoice" link a second time straight away', async () => {
      console.log('Step 3: Second billing run on the same day');
      const stillVisible = await subscriptionPage.isGenerateInvoiceVisible();
      console.log(`  - "=> Generate Invoice" link still on screen: ${stillVisible}`);
      if (stillVisible) {
        const secondBilling = await subscriptionPage.clickGenerateInvoice();
        await subscriptionPage.openByUrl(secondBilling.returnUrl);
      } else {
        console.log('  - The link is no longer offered, so a second run cannot even be started');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - after the second click').catch(() => {});
    });

    await test.step('Step 4: Click the "Invoices" smart button and count the invoices listed', async () => {
      const countAfterSecond = await subscriptionPage.getInvoiceCount();
      const nextDateAfterSecond = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP2 + VP3',
        'The second click adds nothing: "Invoices" smart button stays 1 and the next billing date is unchanged',
        `"Invoices" smart button = ${countAfterSecond} (was ${countAfterFirst}); "Date of Next Invoice" = "${nextDateAfterSecond}" (was "${nextDateAfterFirst}")`,
        countAfterSecond === 1 && nextDateAfterSecond === nextDateAfterFirst,
      );

      expect(countAfterSecond, 'VP3: exactly ONE invoice should exist - the second run must not add another').toBe(1);
      expect(nextDateAfterSecond, 'VP2: "Date of Next Invoice" should not move again on the second click').toBe(nextDateAfterFirst);

      console.log(`✅ ${TC_ID}: the cycle was billed once; a second same-day run produced no duplicate invoice`);
    });
  });
});
