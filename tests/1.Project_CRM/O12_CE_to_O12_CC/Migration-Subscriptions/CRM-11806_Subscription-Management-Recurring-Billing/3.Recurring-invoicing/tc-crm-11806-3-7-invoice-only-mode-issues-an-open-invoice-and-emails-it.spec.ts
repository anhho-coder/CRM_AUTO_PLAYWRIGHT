import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_3.7 - "Invoice only" mode issues an OPEN invoice to the customer and collects
 *                     nothing
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_3.7
 *  Spec ID:         IS-CRM-FUNC-0140-01, IS-CRM-FUNC-0165 / SC-09
 *                   Spec text  : invoice-only mode issues and sends the invoice each cycle, attempting no collection
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US6a (Invoice-only collection)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing/tc-subscription-3-7-invoice-only-mode-issues-an-open-invoice-and-emails-it.spec.ts
 *  Baseline TC ID  : subscription-3.7  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-09  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *    npx playwright test --grep "CRM-11806_3\.7:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_3.7';

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

  test.skip(`${TC_ID}: An "Invoice only" template validates and emails the invoice but collects no payment @blocked-devrun @blocked-mail`, async ({ page }, testInfo) => {
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
      let __verifyPassed_VP2 = false;
      try {
        expect(invoiceCount, 'VP2: exactly one invoice should be created for the cycle').toBe(1);
        __verifyPassed_VP2 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 2 - invoice count verified', passed: __verifyPassed_VP2 }).catch(() => {});
      }

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

      let __verifyPassed = false;
      try {
        expect(isOpen, `VP4: an invoice-only run should leave the invoice OPEN (status read: "${status}")`).toBeTruthy();
        expect(numberVisible, 'VP4: a validated invoice should show a real number, not the "Draft Invoice" label').toBeTruthy();
        expect(amountDue, `VP4: Amount Due (${amountDue}) should equal the full total (${total}) - nothing was collected`).toBeCloseTo(total, 1);
        expect(paymentsTabPresent, 'VP4: the Payments tab must be present before its emptiness means anything').toBeTruthy();
        expect(paymentRows, 'VP4: no payment should be listed against the invoice').toBe(0);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - open invoice, nothing collected - verify', passed: __verifyPassed }).catch(() => {});
      }

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

      let __verifyPassed2 = false;
      try {
        expect(chatterPresent, 'VP5: the invoice message history must be present before it can be judged').toBeTruthy();
        expect(emailLogged, `VP5: the "Invoice only" mode should email the invoice to the customer, but no outgoing-mail entry was found in: "${chatterText.slice(0, 400)}"`).toBeTruthy();
        __verifyPassed2 = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 5 - invoice message history - verify', passed: __verifyPassed2 }).catch(() => {});
      }

      console.log(`✅ ${TC_ID}: the invoice was validated, emailed and left fully outstanding`);
    });
  });
});
