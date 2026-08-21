import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_1.3.2 - Every stage comes across the migration, including Closed and Draft
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3.2
 *  Spec ID:         US11 (Data continuity)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - [Manual - post-cut-over]. Blocked by scope, not by a defect.
 *
 *  A BEFORE/AFTER comparison across TWO systems: per-stage counts are written down from the
 *  CURRENT system and compared against the MIGRATED one. The migrated system does not exist yet,
 *  and the check is a one-shot cut-over verification rather than a regression test.
 *
 *  WHAT COULD BE AUTOMATED LATER: the "Group By > Stage" counts are readable from the list view,
 *  so a spec could snapshot them into JSON on system A and diff them on system B - given a second
 *  baseUrl and a run window spanning the cut-over.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CURRENT system as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and remove the default filters so all records are listed
 *    Click "Group By" > "Stage" and write down the count shown next to each stage:
 *      - Draft count
 *      - In Progress count
 *      - To Upsell count
 *      - Closed count
 *      - Total count shown at the bottom of the list
 *    Open one Closed subscription and write down its Reference and Close Reason
 *    Open one Draft subscription and write down its Reference
 *
 *  Steps to reproduce:
 *   1. Log in to the MIGRATED system as a CRM administrator
 *   2. Open Subscriptions > Subscriptions, remove the default filters and click
 *      "Group By" > "Stage"
 *   3. Compare the count of each stage against the numbers written down
 *   4. Search the Closed subscription by its Reference and open it
 *   5. Search the Draft subscription by its Reference and open it
 *
 *  Verification Points:
 *   VP3. Every stage count matches the number written down, including the total
 *   VP4. The Closed record came across intact: it exists, its status bar highlights CLOSED and
 *        its "Close Reason" matches the one written down
 *   VP5. The Draft record exists with its status bar on DRAFT
 *        - no stage was dropped from the migration
 *        - Closed and Draft records are not silently left behind
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_1\.3\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3.2';

test.describe(`${TC_ID} - Every stage comes across the migration`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: The per-stage counts and the Closed and Draft records match before and after the migration`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: it compares per-stage counts on the CURRENT`);
    console.log('system against the MIGRATED one, which is not reachable yet.');
  });
});
