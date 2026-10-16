import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_4.4 - Paying by card in the portal saves the card for the next cycles
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_4.4
 *  Spec ID:         US7 (Collection) / US12 (Portal experience)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/4.Automated-payment-and-stored-payment-methods/tc-subscription-4-4-portal-card-payment-saves-the-card-for-next-cycles.spec.ts
 *  Baseline TC ID  : subscription-4.4  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-12  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - [Manual]. Blocked by scope, not by a defect.
 *
 *  Step 4 types a test card on the PAYMENT PROVIDER'S OWN PAGE, outside the CRM. That page is a
 *  third-party product with its own anti-automation handling, it is not part of the system under
 *  test, and driving it would make the case depend on a vendor UI nobody here controls. The
 *  manual TC itself already tags that step [Manual].
 *
 *  WHAT COULD BE AUTOMATED LATER: everything either side of the provider page - the admin-side
 *  setup (create the subscription, issue the invoice) and the final verification (the portal shows
 *  the invoice paid; "Payment Token" on the subscription now shows a masked card). That split only
 *  becomes worthwhile once a provider sandbox with a scriptable card form is available.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = a portal customer whose login you have, named "Cust-Card-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 10
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *    Click the "=> Generate Invoice" link once so an open invoice is issued and emailed
 *
 *  Steps to reproduce:
 *   1. Open a private browser window and log in to the customer portal as "Cust-Card-<unique>"
 *   2. Open "My Account" > "Invoices" and open the outstanding invoice
 *   3. Click "Pay Now"
 *   4. Choose the credit-card option, enter the provider's test card and tick the option that
 *      saves the card
 *   5. Complete the payment and read the invoice status shown in the portal
 *   6. Back in the admin window, re-open the subscription and read "Payment Token" on the
 *      "Settings" tab
 *
 *  Verification Points:
 *   VP5. The portal shows the invoice as paid
 *        - [Manual] the card details themselves are typed on the payment provider's own page
 *   VP6. The card is kept for the next cycles: "Payment Token" now shows a masked card number,
 *        and the same saved card is listed against the customer record
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_4\.4:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_4.4';

test.describe(`${TC_ID} - Portal card payment saves the card for next cycles`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: Paying an invoice by card in the portal marks it paid and stores the card on the subscription @blocked-devrun @blocked-mail`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual]: step 4 types a test card on the payment provider's own page,`);
    console.log('which sits outside the system under test and is not scriptable from here.');
  });
});
