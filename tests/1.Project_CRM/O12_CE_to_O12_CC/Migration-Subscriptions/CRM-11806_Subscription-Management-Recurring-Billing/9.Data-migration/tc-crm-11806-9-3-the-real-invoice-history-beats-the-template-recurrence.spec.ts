import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_9.3 - The migrated cycle follows the REAL invoice history, not the template
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_9.3
 *  Spec ID:         US11 (Data continuity)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/9.Data-migration/tc-subscription-9-3-the-real-invoice-history-beats-the-template-recurrence.spec.ts
 *  Baseline TC ID  : subscription-9.3  (assertions below are the baseline's, copied verbatim)
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
 *  The case compares the CURRENT system against the MIGRATED one, and the migrated system does
 *  not exist yet.
 *
 *  WHY THIS CASE MATTERS: it pins down a real inconsistency already visible in production - some
 *  subscriptions carry the "Yearly Subscription" template while their invoice history shows
 *  invoices about ONE MONTH apart (e.g. SUB769). The requirement is that the migration rebuilds
 *  the cycle length from the invoice dates rather than copying the template setting, so those
 *  customers are not silently switched from monthly to yearly billing.
 *
 *  WHAT COULD BE AUTOMATED LATER: steps 1-2 are pure arithmetic on the invoice dates and could run
 *  on ONE system today, flagging every subscription whose real invoice spacing contradicts its
 *  template. That is a useful data-quality sweep in its own right, but it is not this test case -
 *  raise it separately if the team wants it.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CURRENT system as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and find one subscription whose Subscription Template is
 *      "Yearly Subscription" but whose invoice history shows invoices about one month apart
 *      (e.g. SUB769)
 *    Write down from its form:
 *      - Reference
 *      - Subscription Template
 *      - The Recurrence shown on that template
 *        (Subscriptions > Configuration > Subscription Templates)
 *    Click the "Invoices" smart button and write down the dates of the last 6 invoices
 *
 *  Steps to reproduce:
 *   1. Look at the 6 invoice dates written down and work out the gap between each one and the next
 *   2. Compare that real gap against the Recurrence written down from the template
 *   3. Log in to the MIGRATED system and open the same subscription by its Reference
 *   4. Read its "Date of Next Invoice" and compare it against the date of the last invoice
 *
 *  Verification Points:
 *   VP1. The 6 invoices are spaced about one month apart
 *   VP2. The real gap contradicts the template - the template says one year while the customer
 *        was actually billed monthly
 *   VP4. The migrated subscription follows the real history, not the template:
 *        - "Date of Next Invoice" is one month after the last invoice, not one year after it
 *        - the cycle length was rebuilt from the invoice dates rather than copied from the
 *          template setting
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_9\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_9.3';

test.describe(`${TC_ID} - The real invoice history beats the template recurrence`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: A migrated subscription rebuilds its cycle from the real invoice dates rather than from its template @mig-ready`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: step 3 opens the MIGRATED system, which is not`);
    console.log('reachable yet. Steps 1-2 (invoice spacing vs template) could run on one system today');
    console.log('as a separate data-quality sweep, but that is not this test case.');
  });
});
