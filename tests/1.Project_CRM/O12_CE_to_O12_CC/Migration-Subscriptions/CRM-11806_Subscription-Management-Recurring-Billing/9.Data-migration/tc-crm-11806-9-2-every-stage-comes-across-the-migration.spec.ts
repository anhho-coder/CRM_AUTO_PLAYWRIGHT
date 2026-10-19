import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_9.2 - Every stage comes across the migration, including Closed and Draft
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_9.2
 *  Spec ID:         IS-CRM-FUNC-0166
 *                   Spec text  : all existing subscriptions IN EVERY STAGE are migrated
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US11 (Data continuity)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/9.Data-migration/tc-subscription-9-2-every-stage-comes-across-the-migration.spec.ts
 *  Baseline TC ID  : subscription-9.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : (migration continuity - no SC card)  - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription service https://subscription-crm-mig.nakivo.site (Odoo 19)
 *                    Customer portal https://subscription-crm-mig.nakivo.site/my
 *  Mechanical deviations from the baseline (and ONLY these):
 *    - baseUrl            -> baseUrl_mig
 *    - users.admin_crm    -> users.admin_crm_mig
 *    - LoginPage/HomePage -> LoginPageMig/HomePageMig (the sidebar theme hides the navbar)
 *    - TC id / file name  -> CRM-11806_x.y.z
 *  No expected value, count or string was changed. Where crm-mig behaves differently the
 *  assertion is meant to go RED - that red is the migration finding.
 * --------------------------------------------------------------------------------------------
 *  BLOCKED on crm-mig - B1 cleared 2026-10-08; B2 still open, so this spec stays skipped:
 *   B1. Rights   : CLEARED 2026-10-08. res.groups 115 "Subscriptions / See Subscriptions" and 116
 *                  "Subscriptions / Manage Subscriptions" now both hold uid 9685
 *                  (anh.ho@nakivo.com), and all ten Subscriptions menus render for it
 *                  (1436 root, 1475/1437/1476/1477, 1478/1479/1480/1481/1482).
 *                  Still denied to that account even so: nakivo.subscription.config (992) and
 *                  nakivo.embed.host (991) - assert through the UI or the Odoo 19 service, never
 *                  on the embed plumbing.
 *   B2. Platform : crm-mig carries NO sale.subscription model (ir.model holds only nakivo.subscription.config and nakivo.subscription.client; sale_subscription is state=uninstallable). The subscription itself lives on the Odoo 19 service subscription-crm-mig.nakivo.site and the CRM renders its screens as an EMBED, so the baseline's "Subscriptions > CREATE a subscription" path does not exist here - on crm-mig a subscription is born only by confirming a quotation that carries a Subscriptionable product.
 *                  -> the creation steps need a SubscriptionPageMig that drives the order path
 *                     on the CRM and reads the Odoo 19 service over its own authenticated
 *                     JSON-RPC (the MigPreSalePage pattern). The Subscriptions screens ARE now
 *                     reachable for that exploration since B1 was cleared.
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
 *    npx playwright test --grep "CRM-11806_9\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_9.2';

test.describe(`${TC_ID} - Every stage comes across the migration`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: The per-stage counts and the Closed and Draft records match before and after the migration @mig-ready`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: it compares per-stage counts on the CURRENT`);
    console.log('system against the MIGRATED one, which is not reachable yet.');
  });
});
