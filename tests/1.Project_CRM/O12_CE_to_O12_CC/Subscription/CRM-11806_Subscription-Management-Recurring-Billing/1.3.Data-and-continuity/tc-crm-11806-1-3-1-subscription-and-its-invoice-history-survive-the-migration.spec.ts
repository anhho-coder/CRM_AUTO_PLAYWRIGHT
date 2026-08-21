import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_1.3.1 - A subscription and its invoice history survive the migration unchanged
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3.1
 *  Spec ID:         US11 (Data continuity)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - [Manual - post-cut-over]. Blocked by scope, not by a defect.
 *
 *  This is a BEFORE/AFTER comparison across TWO different systems: values are written down from
 *  the CURRENT system and then compared against the MIGRATED one. The migrated system does not
 *  exist yet, and when it does the case is a one-shot cut-over verification rather than a
 *  regression test - so it stays manual.
 *
 *  WHAT COULD BE AUTOMATED LATER: once both systems are reachable at once, a spec could snapshot
 *  the named fields and the invoice list from system A into a JSON file, then re-open the same
 *  Reference on system B and diff the two - the same before/after shape already used by the
 *  Lead-Assignment deferred-verify jobs. That needs a second baseUrl and a run window that spans
 *  the cut-over, neither of which exists today.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CURRENT system as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions, remove the default filters and pick one subscription
 *      whose "Invoices" smart button shows 3 or more
 *    On a piece of paper or a spreadsheet, write down from its form:
 *      - Reference (e.g. SUB1425)
 *      - Customer
 *      - Subscription Template
 *      - Recurring Price
 *      - Date of Next Invoice
 *      - The number on the "Invoices" smart button
 *      - The number on the "Sales" smart button
 *    Click the "Invoices" smart button and write down every invoice number and its date
 *
 *  Steps to reproduce:
 *   1. Log in to the MIGRATED system as a CRM administrator
 *   2. Open Subscriptions > Subscriptions, type the Reference in the search box and press Enter,
 *      then open the record
 *   3. Compare each field written down against what the migrated form shows
 *   4. Click the "Invoices" smart button and compare the list against the numbers and dates
 *      written down
 *   5. Click the "Sales" smart button and read the order number
 *
 *  Verification Points:
 *   VP3. Every field matches the value written down, one by one: Reference, Customer,
 *        Subscription Template, Recurring Price, Date of Next Invoice
 *   VP4. The invoice history came across complete: the count matches, and every invoice number
 *        and date written down is present - none missing and none added
 *   VP5. The linked sales order is the same order as before the migration
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_1\.3\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3.1';

test.describe(`${TC_ID} - A subscription and its invoice history survive the migration`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: Every field and every invoice of a migrated subscription matches the pre-migration values`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: it compares the CURRENT system against the`);
    console.log('MIGRATED one. The migrated system is not reachable yet, so the comparison cannot run.');
  });
});
