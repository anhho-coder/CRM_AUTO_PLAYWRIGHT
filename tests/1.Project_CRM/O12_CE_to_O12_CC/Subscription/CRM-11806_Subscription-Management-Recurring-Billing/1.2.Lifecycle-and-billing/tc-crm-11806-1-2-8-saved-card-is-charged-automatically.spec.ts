import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  createSubscription,
  dayDiff,
  loginAsCrmAdmin,
  logVerify,
  parseMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.8 - A saved card is charged automatically and the invoice comes out PAID
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.8
 *  Spec ID:         US6 (Automatic collection)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
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
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
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
 *    npx playwright test --grep "CRM-11806_1\.2\.8:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.8';
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
  test.skip(`${TC_ID}: An auto-charge subscription with a saved card collects the cycle and marks the invoice PAID`, async ({ page }, testInfo) => {
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

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - invoice collected from the saved card').catch(() => {});

      expect(numberVisible, 'VP2: the invoice should be validated and carry a real number, not "Draft Invoice"').toBeTruthy();
      expect(status, `VP4: the invoice should be PAID after the card is charged (status read: "${status}")`).toMatch(/paid/i);
      expect(amountDue, 'VP4: Amount Due should be 0.00 once the card has been charged').toBeCloseTo(0, 2);
      expect(paymentsTabPresent, 'VP4: the Payments tab must be present before its contents mean anything').toBeTruthy();
      expect(paymentRows, 'VP4: the automatic payment should be listed against the invoice').toBeGreaterThanOrEqual(1);
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
