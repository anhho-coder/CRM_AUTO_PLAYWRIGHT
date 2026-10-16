import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  logVerify,
  parseMMDDYYYY,
  dayDiff,
  todayMMDDYYYY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  SKU_O365,
} from '@helpers/crm-11806-subscription.helper';
import { loginAsCrmAdminMig as loginAsCrmAdmin, createSubscriptionMig as createSubscription } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_3.2 - Running the billing action twice on the same day does not raise a second
 *                    invoice for the same cycle
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_3.2
 *  Spec ID:         US1 (No billing gap)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing/tc-subscription-3-2-second-run-same-day-raises-no-second-invoice.spec.ts
 *  Baseline TC ID  : subscription-3.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-11  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = "Cust-NoDup-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 100
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Click the "=> Generate Invoice" link under "Date of Next Invoice"
 *   2. Read the new value in "Date of Next Invoice"
 *   3. Click the "=> Generate Invoice" link a second time straight away
 *   4. Click the "Invoices" smart button and count the invoices listed
 *
 *  Verification Points:
 *   1. "Date of Next Invoice" has moved forward by one month, so the cycle is no longer due
 *   2. No new invoice is produced by the second click
 *   3. Exactly one invoice is listed, count = 1 (no second invoice for the same period)
 *
 *  KNOWN DEFECT - CRM-12188: the second run DOES raise a second invoice for the same cycle.
 *  Production holds 201 duplicate subscription invoices ($52,753.20); SUB1113 alone has 18,
 *  created one per day. The test keeps the FRD's expected result and is marked test.fail().
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_3\.2:" --project=chromium
 *    npx playwright test --grep "CRM-12188" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_3.2';
const QUANTITY = 100;
const NEXT_DATE_TOLERANCE_DAYS = 2;

test.describe('CRM-11806_3.2 - A second billing run on the same day raises no second invoice', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // A subscription that produced a validated invoice cannot be cleanly deleted - left on purpose.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip('CRM-11806_3.2 [CRM-12188]: Running the billing action twice on the same day does not raise a second invoice for the same cycle @blocked-devrun', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'defect',
      description: 'CRM-12188 - a second billing run raises a SECOND invoice for the same cycle. Production holds 201 such duplicate subscription invoices ($52,753.20); SUB1113 alone accumulated 18 of them, one per day. The assertion below encodes the FRD requirement "each billing cycle shall produce exactly one invoice", which the system currently violates.',
    });
    test.fail(); // Expected to fail until the duplicate-invoice defect is fixed
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const customerName = `Cust-NoDup-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);
    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: QUANTITY,
      nextInvoiceDate: todayMMDDYYYY(),
    });

    let nextDateAfterFirst = '';
    let countAfterFirst = -1;

    await test.step('Step 1: Click the "=> Generate Invoice" link under "Date of Next Invoice"', async () => {
      console.log('Step 1: First billing run');
      const billing = await subscriptionPage.clickGenerateInvoice();
      // The link opens the invoice it just created - come back before reading the subscription.
      await subscriptionPage.openByUrl(billing.returnUrl);
      countAfterFirst = await subscriptionPage.getInvoiceCount();
      console.log(`✓ First run done - "Invoices" smart button = ${countAfterFirst}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - after the first billing run').catch(() => {});
    });

    await test.step('Step 2: Read the new value in "Date of Next Invoice"', async () => {
      nextDateAfterFirst = await subscriptionPage.getDateOfNextInvoice();
      const parsed = parseMMDDYYYY(nextDateAfterFirst);
      const today = new Date();
      const expectedNext = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const diff = parsed ? Math.abs(dayDiff(parsed, expectedNext)) : 999;

      logVerify(
        'VP1',
        `"Date of Next Invoice" moves forward by one month to ${expectedNext.toLocaleDateString('en-US')}, so the cycle is no longer due`,
        `"Date of Next Invoice" = "${nextDateAfterFirst}" (diff ${diff} day(s))`,
        diff <= NEXT_DATE_TOLERANCE_DAYS,
      );

      expect(parsed, `VP1: "Date of Next Invoice" should be parseable (got "${nextDateAfterFirst}")`).not.toBeNull();
      expect(diff, `VP1: after billing, "Date of Next Invoice" ("${nextDateAfterFirst}") should be one month ahead`).toBeLessThanOrEqual(NEXT_DATE_TOLERANCE_DAYS);
      expect(countAfterFirst, 'VP1: the first run should have produced exactly one invoice').toBe(1);
    });

    await test.step('Step 3: Click the "=> Generate Invoice" link a second time straight away', async () => {
      console.log('Step 3: Second billing run on the same day');
      const stillVisible = await subscriptionPage.isGenerateInvoiceVisible();
      console.log(`  - "=> Generate Invoice" link still on screen: ${stillVisible}`);
      if (stillVisible) {
        const secondBilling = await subscriptionPage.clickGenerateInvoice();
        await subscriptionPage.openByUrl(secondBilling.returnUrl);
      } else {
        console.log('  - The link is no longer offered, so a second run cannot even be started');
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - after the second click').catch(() => {});
    });

    await test.step('Step 4: Click the "Invoices" smart button and count the invoices listed', async () => {
      const countAfterSecond = await subscriptionPage.getInvoiceCount();
      const nextDateAfterSecond = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP2 + VP3',
        'The second click adds nothing: "Invoices" smart button stays 1 and the next billing date is unchanged',
        `"Invoices" smart button = ${countAfterSecond} (was ${countAfterFirst}); "Date of Next Invoice" = "${nextDateAfterSecond}" (was "${nextDateAfterFirst}")`,
        countAfterSecond === 1 && nextDateAfterSecond === nextDateAfterFirst,
      );

      expect(countAfterSecond, 'VP3: exactly ONE invoice should exist - the second run must not add another').toBe(1);
      expect(nextDateAfterSecond, 'VP2: "Date of Next Invoice" should not move again on the second click').toBe(nextDateAfterFirst);

      console.log(`✅ ${TC_ID}: the cycle was billed once; a second same-day run produced no duplicate invoice`);
    });
  });
});
