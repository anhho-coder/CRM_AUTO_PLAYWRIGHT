import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_1.3.8 - Passing the "Automatic closing limit" auto-closes the subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3.8
 *  Spec ID:         US10 (Dunning) / US9 (Termination)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - BLOCKED on TWO things, neither of them a defect:
 *
 *   1. TEST DATA - it needs a saved card that the payment provider ALWAYS DECLINES. Such a token
 *      cannot be created from the CRM UI; the card is typed on the provider's own page.
 *   2. SCOPE - the case drives Settings > Technical > Automation > Scheduled Actions and clicks
 *      "RUN MANUALLY" on "Sale Subscription: generate recurring invoices and payments". Firing a
 *      shared cron by hand affects EVERY subscription on pre-production, not just the fixture,
 *      so it must not run unattended inside a regression suite.
 *
 *  TO UNBLOCK: provision the declining-card customer, decide with the CRM admin team whether the
 *  shared cron may be fired from automation (or expose a scoped equivalent), add a page object for
 *  the Scheduled Actions screen, then write the body and change `test.skip(` to `test(`.
 *
 *  Until then this stays a MANUAL case - the run procedure below is the manual script.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Configuration > Subscription Templates, open "Quarterly Subscription"
 *      and confirm "Automatic closing limit" = 15
 *    Ask the CRM admin team for a saved card that the payment provider always declines, and note
 *      which customer it belongs to
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = that customer
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Quarterly Subscription"
 *      - Start Date            = today minus 40 days
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-PM-PRO] min 50Pro Machines, 1Month Subscription"
 *      - Quantity = 50
 *    Open the "Settings" tab and set Payment Token = the declining test card
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today minus 40 days, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Click the "=> Generate Invoice" link so an unpaid invoice exists that is older than 15 days
 *   2. Open Settings > Technical > Automation > Scheduled Actions
 *   3. Remove the default filter so archived actions are listed too, then open
 *      "Sale Subscription: generate recurring invoices and payments"
 *   4. Click "RUN MANUALLY"
 *   5. Re-open the subscription and read its status bar and "Close Reason"
 *   6. Scroll to the message history at the bottom of the subscription
 *
 *  Verification Points:
 *   VP5. The subscription is terminated on its own: status bar CLOSED and a "Close Reason" filled
 *   VP6. The message history records a termination notice sent to the customer
 *        - the unpaid invoice is still there and still open, it is not deleted
 *        - no further invoice is raised after the closure
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_1\.3\.8:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3.8';

test.describe(`${TC_ID} - Dunning limit auto-closes the subscription`, () => {
  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: A subscription whose unpaid invoice passes the "Automatic closing limit" is closed automatically`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is blocked - see the header: it needs an always-declining test card AND`);
    console.log('permission to fire the shared "Sale Subscription: generate recurring invoices and');
    console.log('payments" cron by hand, which would affect every subscription on pre-production.');
  });
});
