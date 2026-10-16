import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_5.1 - A declined charge leaves the cycle outstanding and warns the customer
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_5.1
 *  Spec ID:         US10 (Dunning)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/5.Failed-payments/tc-subscription-5-1-a-declined-charge-leaves-the-cycle-outstanding.spec.ts
 *  Baseline TC ID  : subscription-5.1  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-18  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  ⛔ SKIPPED - BLOCKED ON TEST DATA, not on a defect.
 *
 *  The case needs a saved card that the payment provider ALWAYS DECLINES. Such a token cannot be
 *  created from the CRM UI - the card is typed on the provider's own page - so automation has no
 *  way to build the scenario itself.
 *
 *  TO UNBLOCK: ask the CRM admin team for an automation customer carrying an always-declining
 *  test card, put its name in DECLINING_CARD_CUSTOMER below, and change `test.skip(` to `test(`.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Ask the CRM admin team for a saved card that the payment provider always declines (a test
 *      card), and note which customer it belongs to
 *    Create the subscription for that customer / Public Pricelist_USD (USD) /
 *      "Monthly Subscription" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Open the "Settings" tab and set Payment Token = the declining test card
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *
 *  Steps to reproduce:
 *   1. Write down the date shown in "Date of Next Invoice"
 *   2. Click the "=> Generate Invoice" link
 *   3. Click the "Invoices" smart button and read the invoice status bar and "Amount Due"
 *   4. Go back to the subscription and scroll to the message history at the bottom
 *   5. Read "Date of Next Invoice" again
 *
 *  Verification Points:
 *   VP3. The charge did not go through: NOT PAID and Amount Due = the full invoice total
 *   VP4. The message history records a payment reminder sent to the customer
 *   VP5. The cycle stays outstanding: "Date of Next Invoice" unchanged, still IN PROGRESS
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_5\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_5.1';

/** Set this to the automation customer that carries an always-declining test card. */
const DECLINING_CARD_CUSTOMER = '';

test.describe(`${TC_ID} - A declined charge leaves the cycle outstanding`, () => {
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

  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: A declined card leaves the invoice unpaid, the cycle unmoved and a reminder in the message history @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const today = todayMMDDYYYY();
    const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;

    let returnUrl = '';
    let dueBefore = '';

    expect(DECLINING_CARD_CUSTOMER, 'DECLINING_CARD_CUSTOMER must name a customer that carries an always-declining test card').not.toBe('');

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName: DECLINING_CARD_CUSTOMER,
      template: TEMPLATE_MONTHLY_AUTOCHARGE,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Step 1-2: Write down the due date, then click the "=> Generate Invoice" link', async () => {
      dueBefore = await subscriptionPage.getDateOfNextInvoice();
      console.log(`Step 1: "Date of Next Invoice" before the attempt = "${dueBefore}"`);

      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3: Read the invoice status bar and "Amount Due"', async () => {
      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const status = await invoicePage.getInvoiceStatus();
      const total = toNumber(await invoicePage.getInvoiceTotal());
      const amountDue = toNumber(await invoicePage.getAmountDue());

      logVerify(
        'VP3',
        'the charge did not go through: the invoice is NOT PAID and Amount Due equals the full total',
        `status = "${status}", total = ${total}, Amount Due = ${amountDue}`,
        !/paid/i.test(status) && Math.abs(amountDue - total) <= 0.05,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - declined charge, invoice outstanding').catch(() => {});

      expect(status, `VP3: a declined card must leave the invoice unpaid (status read: "${status}")`).not.toMatch(/paid/i);
      expect(amountDue, `VP3: Amount Due (${amountDue}) should equal the full invoice total (${total})`).toBeCloseTo(total, 1);
    });

    await test.step('Step 4-5: Read the subscription message history and its due date', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const chatterPresent = await subscriptionPage.hasChatter();
      const chatterText = await subscriptionPage.getChatterText();
      const REMINDER_MARKERS = /reminder|payment failed|declined|unpaid|overdue/i;
      const reminderLogged = REMINDER_MARKERS.test(chatterText);

      const state = await subscriptionPage.getState();
      const dueAfter = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP4 + VP5',
        `a payment reminder is recorded, the cycle stays outstanding ("${dueBefore}" unchanged) and the subscription is still IN PROGRESS`,
        `chatter present = ${chatterPresent}, reminder marker found = ${reminderLogged}, state = "${state}", "Date of Next Invoice" = "${dueAfter}"`,
        chatterPresent && reminderLogged && dueAfter === dueBefore && /in\s*progress/i.test(state),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - cycle still outstanding').catch(() => {});

      expect(chatterPresent, 'VP4: the subscription message history must be present before it can be judged').toBeTruthy();
      expect(reminderLogged, `VP4: a payment reminder should be recorded in the message history. Found: "${chatterText.slice(0, 400)}"`).toBeTruthy();
      expect(dueAfter, `VP5: a declined charge must not move the cycle on (was "${dueBefore}", now "${dueAfter}")`).toBe(dueBefore);
      expect(state, `VP5: the subscription should still be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);

      console.log(`✅ ${TC_ID}: the declined charge left the cycle outstanding and warned the customer`);
    });
  });
});
