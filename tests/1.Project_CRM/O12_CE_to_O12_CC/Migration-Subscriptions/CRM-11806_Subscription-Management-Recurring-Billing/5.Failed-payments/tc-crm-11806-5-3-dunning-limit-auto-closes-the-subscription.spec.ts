import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_5.3 - Passing the "Automatic closing limit" auto-closes the subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.3
 *  Spec ID:         US10 (Dunning) / US9 (Termination)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/5.Failed-payments/tc-subscription-5-3-dunning-limit-auto-closes-the-subscription.spec.ts
 *  Baseline TC ID  : subscription-5.3  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-20  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - BLOCKED on TWO things, neither of them a defect:
 *
 *   1. TEST DATA - it needs a saved card that the payment provider ALWAYS DECLINES. Such a token
 *      cannot be created from the CRM UI; the card is typed on the provider's own page.
 *   2. SCOPE - the case drives Settings > Technical > Automation > Scheduled Actions and clicks
 *      "RUN MANUALLY" on "Sale Subscription: generate recurring invoices and payments". Firing a
 *      shared cron by hand affects EVERY subscription on the CRM (crm-mig.nakivo.site), not just the fixture,
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
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
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
 *    npx playwright test --grep "CRM-11806_5\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.3';

test.describe(`${TC_ID} - Dunning limit auto-closes the subscription`, () => {
  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: A subscription whose unpaid invoice passes the "Automatic closing limit" is closed automatically @blocked-devrun`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is blocked - see the header: it needs an always-declining test card AND`);
    console.log('permission to fire the shared "Sale Subscription: generate recurring invoices and');
    console.log('payments" cron by hand, which would affect every subscription on the CRM (crm-mig.nakivo.site).');
  });
});
