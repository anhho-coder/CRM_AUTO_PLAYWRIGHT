import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  loginAsCrmAdmin,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.11 - Registering a payment settles the invoice and leaves the subscription
 *                     cycle untouched
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.11
 *  Spec ID:         US7 (Manual collection)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Create the subscription "Cust-ManPay-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 100
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *    Click the "=> Generate Invoice" link once so an open invoice exists
 *
 *  Steps to reproduce:
 *   1. Click the "Invoices" smart button and open the invoice
 *   2. Write down the invoice total shown as "Amount Due"
 *   3. Click "REGISTER PAYMENT" in the invoice header
 *   4. In the dialog fill:
 *      - Journal        = Bank
 *      - Payment Amount = the amount written down in step 2
 *   5. Click "VALIDATE"
 *   6. Read the invoice status bar and "Amount Due"
 *   7. Go back to the subscription and read "Date of Next Invoice"
 *
 *  Verification Points:
 *   VP6. The invoice is settled: status bar PAID, Amount Due = 0.00, the payment is listed
 *   VP7. The subscription is unaffected: still IN PROGRESS and "Date of Next Invoice" unchanged
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.11:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.11';

test.describe(`${TC_ID} - Registering a payment settles the invoice only`, () => {
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

  test(`${TC_ID}: Registering a payment marks the invoice PAID without moving the subscription's billing cycle`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-ManPay-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;

    let returnUrl = '';
    let dueBefore = '';
    let amountDueBefore = 0;

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 100,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition: Click the "=> Generate Invoice" link once so an open invoice exists', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);
      dueBefore = await subscriptionPage.getDateOfNextInvoice();
      const count = await subscriptionPage.getInvoiceCount();
      expect(count, 'Pre-condition: one invoice should exist before the payment is registered').toBe(1);
      console.log(`✓ Invoice raised; "Date of Next Invoice" before the payment = "${dueBefore}"`);
    });

    await test.step('Step 1-2: Open the invoice and write down its "Amount Due"', async () => {
      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const amountDueRaw = await invoicePage.getAmountDue();
      amountDueBefore = toNumber(amountDueRaw);
      console.log(`Step 2: Amount Due before the payment = "${amountDueRaw}" -> ${amountDueBefore}`);
      expect(amountDueBefore, 'Step 2: the open invoice should show a real outstanding amount').toBeGreaterThan(0);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - open invoice with an amount due').catch(() => {});
    });

    await test.step('Step 3-5: Register the payment on the Bank journal for the full amount and validate', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);

      // The journal labels differ per environment, so read what this instance really offers and
      // pick the Bank one rather than hard-coding a name that may not exist here.
      const journals = await invoicePage.getPaymentJournalOptions();
      const bankJournal = journals.find(j => /bank/i.test(j)) ?? journals[0] ?? '';
      console.log(`  - Journals offered: ${journals.join(' | ') || '(none read)'} -> using "${bankJournal}"`);
      expect(bankJournal, 'Step 4: the Register Payment dialog should offer a Bank journal').not.toBe('');
      await invoicePage.selectPaymentJournal(bankJournal);

      await invoicePage.fillPaymentAmount(String(amountDueBefore), CommonUtils.waitTimes.abnormalWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Register Payment dialog filled').catch(() => {});

      await invoicePage.clickValidate_RegisterPayment(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    });

    await test.step('Step 6: Read the invoice status bar and "Amount Due"', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      const amountDueRaw = await invoicePage.getAmountDue();
      const amountDue = toNumber(amountDueRaw);

      const paymentsTabPresent = await invoicePage.hasPaymentsTab();
      await invoicePage.clickPaymentsTab();
      const paymentRows = await invoicePage.getPaymentRowCount();

      logVerify(
        'VP6',
        'the invoice is settled: the status bar highlights PAID, Amount Due = 0.00 and the payment is listed',
        `status = "${status}", Amount Due = "${amountDueRaw}" -> ${amountDue}, Payments tab present = ${paymentsTabPresent}, payment rows = ${paymentRows}`,
        /paid/i.test(status) && Math.abs(amountDue) <= 0.005 && paymentsTabPresent && paymentRows >= 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - invoice paid').catch(() => {});

      expect(status, `VP6: the invoice should be PAID after the payment is validated (status read: "${status}")`).toMatch(/paid/i);
      expect(amountDue, `VP6: Amount Due should be 0.00 once the invoice is settled (read: "${amountDueRaw}")`).toBeCloseTo(0, 2);
      expect(paymentsTabPresent, 'VP6: the Payments tab must be present before its contents mean anything').toBeTruthy();
      expect(paymentRows, 'VP6: the registered payment should be listed against the invoice').toBeGreaterThanOrEqual(1);
    });

    await test.step('Step 7: Go back to the subscription and check its cycle is untouched', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const state = await subscriptionPage.getState();
      const dueAfter = await subscriptionPage.getDateOfNextInvoice();

      logVerify(
        'VP7',
        `the subscription is unaffected by the payment: still IN PROGRESS and "Date of Next Invoice" still "${dueBefore}"`,
        `state = "${state}", "Date of Next Invoice" = "${dueAfter}"`,
        /in\s*progress/i.test(state) && dueAfter === dueBefore,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - subscription unchanged by the payment').catch(() => {});

      expect(state, `VP7: the subscription should still be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(dueAfter, `VP7: registering a payment must not move "Date of Next Invoice" (was "${dueBefore}", now "${dueAfter}")`).toBe(dueBefore);

      console.log(`✅ ${TC_ID}: the payment settled the invoice and left the subscription cycle where it was`);
    });
  });
});
