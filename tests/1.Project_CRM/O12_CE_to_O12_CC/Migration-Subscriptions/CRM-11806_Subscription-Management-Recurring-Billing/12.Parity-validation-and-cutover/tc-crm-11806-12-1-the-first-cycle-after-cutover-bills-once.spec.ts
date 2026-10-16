import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_12.1 - The first cycle after the cut-over bills once and only once
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_12.1
 *  Spec ID:         US11 (Data continuity)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/12.Parity-validation-and-cutover/tc-subscription-12-1-the-first-cycle-after-cutover-bills-once.spec.ts
 *  Baseline TC ID  : subscription-12.1  (assertions below are the baseline's, copied verbatim)
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
 *  Two blockers, either of which is enough:
 *   1. It compares the CURRENT system against the MIGRATED one, and the migrated system does not
 *      exist yet.
 *   2. Step 3 is "wait until the subscription reaches that Date of Next Invoice" - a wait of days
 *      after the cut-over. No test run can hold that open; it needs the deferred-verify shape
 *      (round 1 records the subscription, a later round re-opens it) used by the Lead-Assignment
 *      and Lead-Merging jobs.
 *
 *  WHAT COULD BE AUTOMATED LATER: a round-1 spec that snapshots the four values plus the invoice
 *  count into JSONL, and a round-2 job that re-opens each recorded Reference after the due date
 *  and asserts exactly one new invoice carrying that date.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CURRENT system as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and pick one live subscription whose "Date of Next
 *      Invoice" falls a few days AFTER the planned cut-over date
 *    Write down from its form:
 *      - Reference
 *      - Date of Next Invoice
 *      - Recurring Price
 *      - Currency shown on the Recurring Price
 *      - Subscription Template
 *      - The number on the "Invoices" smart button
 *
 *  Steps to reproduce:
 *   1. Log in to the MIGRATED system after the cut-over and open the same subscription by its
 *      Reference
 *   2. Compare Date of Next Invoice, Recurring Price, Currency and Subscription Template against
 *      the values written down
 *   3. Wait until the subscription reaches that Date of Next Invoice
 *   4. Click the "Invoices" smart button and count how many invoices carry that date
 *   5. Open the new invoice and read its total and currency
 *
 *  Verification Points:
 *   VP2. All four values match exactly - the cycle position survived the cut-over
 *   VP4. The first cycle after cut-over bills once and only once: exactly 1 new invoice carries
 *        that date, and the "Invoices" smart button now reads the number written down plus 1
 *   VP5. The new invoice is correct: its total equals the Recurring Price written down and its
 *        currency equals the currency written down
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_12\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_12.1';

test.describe(`${TC_ID} - The first cycle after cut-over bills once`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: A migrated subscription keeps its cycle position and bills exactly once on the first due date after cut-over @mig-ready`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: it needs the MIGRATED system, and step 3 waits`);
    console.log('days for the next due date - a deferred-verify job, not a single test run.');
  });
});
