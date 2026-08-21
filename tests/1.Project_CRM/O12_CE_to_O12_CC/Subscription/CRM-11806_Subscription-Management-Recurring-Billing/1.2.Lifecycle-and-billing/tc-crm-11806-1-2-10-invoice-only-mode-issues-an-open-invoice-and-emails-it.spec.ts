import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  loginAsCrmAdmin,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.10 - "Invoice only" mode issues an OPEN invoice to the customer and collects
 *                     nothing
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.10
 *  Spec ID:         US6a (Invoice-only collection)
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
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = "Cust-InvOnly-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Sub/Invoice only"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Quantity = 50
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Open the "Settings" tab and confirm "Payment Token" is empty
 *   2. Go back to the first tab and click the "=> Generate Invoice" link
 *   3. Click the "Invoices" smart button and open the invoice
 *   4. Read the invoice status bar, the invoice number and "Amount Due"
 *   5. Scroll to the message history at the bottom of the invoice
 *
 *  Verification Points:
 *   VP2. Exactly one invoice is created and validated, count = 1
 *   VP4. The invoice is issued but not collected: status bar OPEN, a real invoice number,
 *        Amount Due = the full total, no payment listed
 *   VP5. The message history shows the invoice was sent to the customer by email
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.10:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.10';

test.describe(`${TC_ID} - Invoice-only mode issues an open invoice and emails it`, () => {
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

  test(`${TC_ID}: An "Invoice only" template validates and emails the invoice but collects no payment`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-InvOnly-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: 50,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Step 1: Open the "Settings" tab and confirm "Payment Token" is empty', async () => {
      const token = await subscriptionPage.getPaymentToken();

      logVerify(
        'VP1',
        'the "Invoice only" template never charges a card, so "Payment Token" is empty',
        `Payment Token = "${token || '(empty)'}"`,
        token === '',
      );

      expect(token, 'VP1: an invoice-only subscription should carry no saved card').toBe('');
    });

    await test.step('Step 2: Go back to the first tab and click the "=> Generate Invoice" link', async () => {
      await subscriptionPage.openTab('Subscription Lines').catch(() => {});
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the link opened').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-5: Open the invoice and check it is OPEN, numbered, outstanding and emailed', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP2',
        'exactly one invoice is created for the cycle, count = 1',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 1,
      );
      expect(invoiceCount, 'VP2: exactly one invoice should be created for the cycle').toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const status = await invoicePage.getInvoiceStatus();
      const numberVisible = await invoicePage.isInvoiceNumberVisible();
      const totalRaw = await invoicePage.getInvoiceTotal();
      const amountDueRaw = await invoicePage.getAmountDue();

      const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      const total = toNumber(totalRaw);
      const amountDue = toNumber(amountDueRaw);

      const paymentsTabPresent = await invoicePage.hasPaymentsTab();
      await invoicePage.clickPaymentsTab();
      const paymentRows = await invoicePage.getPaymentRowCount();

      const isOpen = /open/i.test(status);

      logVerify(
        'VP4',
        'the invoice is issued to the customer but not collected: OPEN, carrying a real number, Amount Due = the full total, no payment listed',
        `status = "${status}", invoice-number field visible = ${numberVisible}, total = "${totalRaw}" -> ${total}, Amount Due = "${amountDueRaw}" -> ${amountDue}, Payments tab present = ${paymentsTabPresent}, payment rows = ${paymentRows}`,
        isOpen && numberVisible && Math.abs(amountDue - total) <= 0.05 && paymentsTabPresent && paymentRows === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - open invoice, nothing collected').catch(() => {});

      expect(isOpen, `VP4: an invoice-only run should leave the invoice OPEN (status read: "${status}")`).toBeTruthy();
      expect(numberVisible, 'VP4: a validated invoice should show a real number, not the "Draft Invoice" label').toBeTruthy();
      expect(amountDue, `VP4: Amount Due (${amountDue}) should equal the full total (${total}) - nothing was collected`).toBeCloseTo(total, 1);
      expect(paymentsTabPresent, 'VP4: the Payments tab must be present before its emptiness means anything').toBeTruthy();
      expect(paymentRows, 'VP4: no payment should be listed against the invoice').toBe(0);

      // VP5 - the email is only observable through the message history, so prove the region was
      // really read before judging what it does or does not contain.
      const chatterPresent = await invoicePage.hasChatter();
      const chatterText = await invoicePage.getChatterText();
      const SENT_MAIL_MARKERS = /sent by e-?mail|invoice sent|your invoice|to:\s*\S+@|<\S+@\S+>/i;
      const emailLogged = SENT_MAIL_MARKERS.test(chatterText);

      logVerify(
        'VP5',
        'the message history shows the invoice was sent to the customer by email',
        `chatter present = ${chatterPresent}, outgoing-mail marker found = ${emailLogged}, history = "${chatterText.slice(0, 400)}"`,
        chatterPresent && emailLogged,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - invoice message history').catch(() => {});

      expect(chatterPresent, 'VP5: the invoice message history must be present before it can be judged').toBeTruthy();
      expect(emailLogged, `VP5: the "Invoice only" mode should email the invoice to the customer, but no outgoing-mail entry was found in: "${chatterText.slice(0, 400)}"`).toBeTruthy();

      console.log(`✅ ${TC_ID}: the invoice was validated, emailed and left fully outstanding`);
    });
  });
});
