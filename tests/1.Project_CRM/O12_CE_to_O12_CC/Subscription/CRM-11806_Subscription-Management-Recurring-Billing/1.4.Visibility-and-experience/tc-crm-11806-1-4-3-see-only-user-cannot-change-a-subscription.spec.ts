import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_1.4.3 - A "See Subscriptions" user can read but not change a subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.4.3
 *  Spec ID:         US14 (Access rights)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - BLOCKED on test data, not on a defect.
 *
 *  The manual pre-condition asks the tester to open Settings > Users & Companies > Users and
 *  DOWNGRADE a second internal user to "See Subscriptions" (without "Manage Subscriptions").
 *  Automation must not do that: pre-production users are shared, and silently changing another
 *  person's access rights mid-suite would break whatever else they are being used for - and would
 *  leave them downgraded if the run died before restoring them.
 *
 *  TO UNBLOCK: ask the CRM admin team for a DEDICATED automation user permanently set to
 *  Subscriptions = "See Subscriptions", add it to config/users.config.ts (e.g.
 *  `subscriptions_see_only`), point SEE_ONLY_USER_KEY at it and change `test.skip(` to `test(`.
 *  The steps themselves are ordinary UI checks and need no other special handling.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Create the subscription "Cust-Rights-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", then click "IN PROGRESS" on the status bar
 *    Open Settings > Users & Companies > Users and pick a second internal user, then set on their
 *      form:
 *      - Subscriptions = "See Subscriptions"
 *      - (make sure "Manage Subscriptions" is NOT selected)
 *    Click "SAVE" and note that user's login
 *
 *  Steps to reproduce:
 *   1. Log out and log back in as the see-only user
 *   2. Open Subscriptions > Subscriptions and open "Cust-Rights-<unique>"
 *   3. Look at the top left of the subscription list for the "CREATE" button
 *   4. On the open subscription look for the "Close" and "Upsell" buttons
 *   5. Click "IN PROGRESS" then "CLOSED" on the status bar and try to save
 *
 *  Verification Points:
 *   VP2. The subscription opens and all its details can be read
 *   VP3. The "CREATE" button is not offered to this user
 *   VP4. Neither the "Close" nor the "Upsell" button is offered
 *   VP5. The subscription cannot be changed: the Stage does not become CLOSED and an
 *        access-rights error message is shown when the change is attempted
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_1\.4\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.4.3';

/** Key in config/users.config.ts of a user permanently set to Subscriptions = "See Subscriptions". */
const SEE_ONLY_USER_KEY = '';

test.describe(`${TC_ID} - A see-only user cannot change a subscription`, () => {
  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: A user with only "See Subscriptions" can read a subscription but cannot create, close, upsell or re-stage it`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is blocked - SEE_ONLY_USER_KEY ("${SEE_ONLY_USER_KEY}") is not set.`);
    console.log('Automation must not downgrade a shared pre-production user to "See Subscriptions";');
    console.log('a dedicated see-only automation account is needed first.');
  });
});
