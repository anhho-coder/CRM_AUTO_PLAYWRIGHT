import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  dayDiff,
  logVerify,
  monthsFromTodayMMDDYYYY,
  parseMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_3.8 - A three-months-overdue subscription bills ONCE, not once per missed month
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_3.8
 *  Spec ID:         IS-CRM-FUNC-0146
 *                   Spec text  : no cycle shall be missed, duplicated or silently skipped
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US11 (Overdue cycles)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing/tc-subscription-3-8-an-overdue-cycle-bills-once-not-once-per-missed-month.spec.ts
 *  Baseline TC ID  : subscription-3.8  (assertions below are the baseline's, copied verbatim)
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
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Create the subscription "Cust-Overdue-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date = today minus 3 months, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today minus 3 months, save
 *
 *  Steps to reproduce:
 *   1. Confirm "Date of Next Invoice" shows a date three months in the past
 *   2. Click the "=> Generate Invoice" link ONCE
 *   3. Click the "Invoices" smart button and count the invoices
 *   4. Open the invoice and read its total
 *   5. Go back to the subscription and read "Date of Next Invoice"
 *
 *  Verification Points:
 *   VP3. Exactly 1 invoice is raised, count = 1 - the three missed months do not each produce
 *        their own invoice
 *   VP4. The invoice total equals ONE cycle of the Recurring Price, not three
 *   VP5. "Date of Next Invoice" has moved forward by one month from the overdue date
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_3\.8:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_3.8';
const DATE_TOLERANCE_DAYS = 3;

test.describe(`${TC_ID} - An overdue cycle bills once, not once per missed month`, () => {
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.skip(`${TC_ID}: A subscription three months overdue raises exactly one invoice for one cycle @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-Overdue-${CommonUtils.generateUniqueId()}`;
    const threeMonthsAgo = monthsFromTodayMMDDYYYY(-3);
    let recurringPrice = 0;
    let dueBefore = '';
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 10,
      startDate: threeMonthsAgo,
      nextInvoiceDate: threeMonthsAgo,
    });

    await test.step('Step 1: Confirm "Date of Next Invoice" is three months in the past', async () => {
      dueBefore = await subscriptionPage.getDateOfNextInvoice();
      recurringPrice = await subscriptionPage.getRecurringPrice();

      const due = parseMMDDYYYY(dueBefore);
      const daysOverdue = due ? dayDiff(new Date(), due) : 0;

      logVerify(
        'Step 1',
        `"Date of Next Invoice" is about three months in the past (${threeMonthsAgo})`,
        `"Date of Next Invoice" = "${dueBefore}" -> ${daysOverdue} day(s) overdue; Recurring Price = ${recurringPrice}`,
        daysOverdue > 60,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - subscription three months overdue').catch(() => {});

      expect(due, `Step 1: "Date of Next Invoice" should be readable (got "${dueBefore}")`).not.toBeNull();
      expect(daysOverdue, `Step 1: the subscription should be clearly overdue (read "${dueBefore}", ${daysOverdue} days)`).toBeGreaterThan(60);
      expect(recurringPrice, 'Step 1: the subscription should have a real Recurring Price').toBeGreaterThan(0);
    });

    await test.step('Step 2: Click the "=> Generate Invoice" link ONCE', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the single run produced').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-4: Count the invoices and read the invoice total', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP3',
        'exactly 1 invoice is raised - the three missed months do not each produce their own invoice',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 1,
      );
      expect(invoiceCount, 'VP3: one billing run on an overdue subscription should raise exactly ONE invoice').toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      let __verifyPassed = false;
      try {
        const totalRaw = await invoicePage.getInvoiceTotal();
        const total = parseFloat((totalRaw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
        const singleCycle = Math.abs(total - recurringPrice) <= 0.05;

        logVerify(
          'VP4',
          `the invoice total equals ONE cycle of the Recurring Price (${recurringPrice}), not three (${recurringPrice * 3})`,
          `invoice total = "${totalRaw}" -> ${total}`,
          singleCycle,
        );

        expect(total, `VP4: the customer must be billed ONE cycle (${recurringPrice}), not three (${recurringPrice * 3}) - read ${total}`).toBeCloseTo(recurringPrice, 1);

        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - one cycle billed, not three', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('Step 5: Go back to the subscription and read "Date of Next Invoice"', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const dueAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(dueBefore) as Date;
      const expectedNext = new Date(before.getFullYear(), before.getMonth() + 1, before.getDate());
      const after = parseMMDDYYYY(dueAfter);
      const diff = after ? Math.abs(dayDiff(after, expectedNext)) : 999;

      logVerify(
        'VP5',
        `"Date of Next Invoice" moves forward by ONE month from the overdue date "${dueBefore}"`,
        `"Date of Next Invoice" = "${dueAfter}" (${diff} day(s) from the expected one-month step)`,
        diff <= DATE_TOLERANCE_DAYS,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - next date advanced by one month').catch(() => {});

      expect(after, `VP5: "Date of Next Invoice" should be readable (got "${dueAfter}")`).not.toBeNull();
      expect(diff, `VP5: the next date should step forward by one month from "${dueBefore}", not skip the missed cycles (now "${dueAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);

      console.log(`✅ ${TC_ID}: the overdue subscription billed one cycle only and advanced one month`);
    });
  });
});
