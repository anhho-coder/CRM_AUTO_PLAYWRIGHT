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
  dayDiff,
  logVerify,
  parseMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_4.1 - A saved card is charged automatically and the invoice comes out PAID
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_4.1
 *  Spec ID:         US6 (Automatic collection)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/4.Automated-payment-and-stored-payment-methods/tc-subscription-4-1-saved-card-is-charged-automatically.spec.ts
 *  Baseline TC ID  : subscription-4.1  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-13  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *  The case needs a customer that ALREADY has a working saved card ("Payment Token") that the
 *  payment provider will accept. Pre-production has no such fixture that automation may rely on:
 *  a token cannot be created from the CRM UI (the card is typed on the provider's own page), and
 *  borrowing a live customer's token would charge a real record.
 *
 *  TO UNBLOCK: ask the CRM admin team to provision a dedicated automation customer with an
 *  always-approving test card on file, put its name in AUTOMATION_CARD_CUSTOMER below, and change
 *  `test.skip(` to `test(` - the body is complete and needs no other edit.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    First find a customer that already has a saved card: open Subscriptions > Subscriptions,
 *      open any live subscription of template "Monthly Subscription", go to its "Settings" tab
 *      and note a Customer whose "Payment Token" is filled
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = that customer with a saved card
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Subscription"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 10
 *    Open the "Settings" tab and set:
 *      - Payment Token = the customer's saved card
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Open the "Settings" tab and confirm "Payment Token" shows a masked card number
 *   2. Go back to the first tab and click the "=> Generate Invoice" link
 *   3. Click the "Invoices" smart button and open the invoice
 *   4. Read the invoice status bar, the invoice number and "Amount Due"
 *   5. Go back to the subscription and read "Date of Next Invoice"
 *
 *  Verification Points:
 *   VP2. One invoice is created and validated - a real number, not "Draft Invoice"
 *   VP4. The invoice is collected automatically: PAID, Amount Due = 0.00, a payment is listed
 *   VP5. "Date of Next Invoice" has moved forward by one month
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_4\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_4.1';
const DATE_TOLERANCE_DAYS = 3;

/** Set this to the automation customer that carries an always-approving saved card. */
const AUTOMATION_CARD_CUSTOMER = '';

test.describe(`${TC_ID} - A saved card is charged automatically`, () => {
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
  test.skip(`${TC_ID}: An auto-charge subscription with a saved card collects the cycle and marks the invoice PAID @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const today = todayMMDDYYYY();
    const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;

    let returnUrl = '';
    let dueBefore = '';

    expect(AUTOMATION_CARD_CUSTOMER, 'AUTOMATION_CARD_CUSTOMER must name a customer that carries an always-approving saved card').not.toBe('');

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName: AUTOMATION_CARD_CUSTOMER,
      template: TEMPLATE_MONTHLY_AUTOCHARGE,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Step 1: Confirm "Payment Token" shows a masked card number', async () => {
      const token = await subscriptionPage.getPaymentToken();

      logVerify(
        'VP1',
        'the subscription carries a saved card - "Payment Token" shows a masked card number',
        `Payment Token = "${token || '(empty)'}"`,
        token !== '',
      );

      expect(token, 'VP1: the auto-charge subscription should carry a saved card to charge').not.toBe('');
    });

    await test.step('Step 2: Click the "=> Generate Invoice" link', async () => {
      await subscriptionPage.openTab('Subscription Lines').catch(() => {});
      dueBefore = await subscriptionPage.getDateOfNextInvoice();
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-4: Open the invoice and check it was validated and collected', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();
      expect(invoiceCount, 'VP2: exactly one invoice should be created for the cycle').toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      let __verifyPassed = false;
      try {
        const status = await invoicePage.getInvoiceStatus();
        const numberVisible = await invoicePage.isInvoiceNumberVisible();
        const amountDue = toNumber(await invoicePage.getAmountDue());

        const paymentsTabPresent = await invoicePage.hasPaymentsTab();
        await invoicePage.clickPaymentsTab();
        const paymentRows = await invoicePage.getPaymentRowCount();

        logVerify(
          'VP2 + VP4',
          'the invoice is validated and collected automatically: a real number, PAID, Amount Due = 0.00 and a payment listed',
          `status = "${status}", number field visible = ${numberVisible}, Amount Due = ${amountDue}, Payments tab present = ${paymentsTabPresent}, payment rows = ${paymentRows}`,
          numberVisible && /paid/i.test(status) && Math.abs(amountDue) <= 0.005 && paymentsTabPresent && paymentRows >= 1,
        );

        expect(numberVisible, 'VP2: the invoice should be validated and carry a real number, not "Draft Invoice"').toBeTruthy();
        expect(status, `VP4: the invoice should be PAID after the card is charged (status read: "${status}")`).toMatch(/paid/i);
        expect(amountDue, 'VP4: Amount Due should be 0.00 once the card has been charged').toBeCloseTo(0, 2);
        expect(paymentsTabPresent, 'VP4: the Payments tab must be present before its contents mean anything').toBeTruthy();
        expect(paymentRows, 'VP4: the automatic payment should be listed against the invoice').toBeGreaterThanOrEqual(1);

        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - invoice collected from the saved card', passed: __verifyPassed }).catch(() => {});
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
        `"Date of Next Invoice" moves forward by one month from "${dueBefore}"`,
        `"Date of Next Invoice" = "${dueAfter}" (${diff} day(s) from the expected one-month step)`,
        diff <= DATE_TOLERANCE_DAYS,
      );

      expect(diff, `VP5: the next billing date should advance by one month (was "${dueBefore}", now "${dueAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);

      console.log(`✅ ${TC_ID}: the saved card was charged and the cycle advanced`);
    });
  });
});
