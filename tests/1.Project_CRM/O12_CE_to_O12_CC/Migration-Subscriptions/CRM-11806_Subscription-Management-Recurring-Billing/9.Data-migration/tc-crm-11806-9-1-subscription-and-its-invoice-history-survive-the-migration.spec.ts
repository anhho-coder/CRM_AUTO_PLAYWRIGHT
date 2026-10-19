import { test } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-11806_9.1 - A subscription and its invoice history survive the migration unchanged
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_9.1
 *  Spec ID:         IS-CRM-FUNC-0166
 *                   Spec text  : all existing subscriptions, with their full invoice, payment and status history, are migrated preserving identifiers and linkage
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
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/9.Data-migration/tc-subscription-9-1-subscription-and-its-invoice-history-survive-the-migration.spec.ts
 *  Baseline TC ID  : subscription-9.1  (assertions below are the baseline's, copied verbatim)
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
 *    npx playwright test --grep "CRM-11806_9\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_9.1';

test.describe(`${TC_ID} - A subscription and its invoice history survive the migration`, () => {
  // Declaration-level skip so the browser fixture never starts - see the [Manual] note above.
  test.skip(`${TC_ID}: Every field and every invoice of a migrated subscription matches the pre-migration values @mig-ready`, async ({ page }) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(CommonUtils.waitTimes.short);

    console.log(`${TC_ID} is [Manual - post-cut-over]: it compares the CURRENT system against the`);
    console.log('MIGRATED one. The migrated system is not reachable yet, so the comparison cannot run.');
  });
});
