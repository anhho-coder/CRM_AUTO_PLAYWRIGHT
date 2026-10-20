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
 *  CRM-11806_4.2 - An auto-charge subscription with no saved card raises the invoice but
 *                    collects nothing
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_4.2
 *  Spec ID:         IS-CRM-FUNC-0149 / SC-14
 *                   Spec text  : an invoice is Paid only once the provider confirmed
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US6 (Automatic collection)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/4.Automated-payment-and-stored-payment-methods/tc-subscription-4-2-no-saved-card-leaves-the-invoice-uncollected.spec.ts
 *  Baseline TC ID  : subscription-4.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-14  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *      - Customer              = "Cust-NoCard-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Monthly Subscription"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 10
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *    NOTE: this customer is brand new so it has no saved card - that is what the case checks
 *
 *  Steps to reproduce:
 *   1. Open the "Settings" tab and confirm "Payment Token" is empty
 *   2. Go back to the first tab and click the "=> Generate Invoice" link
 *   3. Click the "Invoices" smart button and open the invoice
 *   4. Read the invoice status bar and "Amount Due"
 *
 *  Verification Points:
 *   VP1. "Payment Token" is empty - there is no card to charge
 *   VP4. The invoice is raised but not collected: the status bar does NOT highlight PAID,
 *        Amount Due equals the full invoice total, and no payment is listed against it
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_4\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_4.2';

test.describe(`${TC_ID} - No saved card leaves the invoice uncollected`, () => {
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

  test.skip(`${TC_ID}: An auto-charge subscription with no saved card raises the invoice but collects nothing @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-NoCard-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_AUTOCHARGE,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Step 1: Open the "Settings" tab and confirm "Payment Token" is empty', async () => {
      const token = await subscriptionPage.getPaymentToken();

      logVerify(
        'VP1',
        'the brand-new customer has no saved card - "Payment Token" is empty',
        `Payment Token = "${token || '(empty)'}"`,
        token === '',
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - no Payment Token on the subscription').catch(() => {});
      expect(token, 'VP1: a brand-new customer must have no saved card, so "Payment Token" should be empty').toBe('');
    });

    await test.step('Step 2: Go back to the first tab and click the "=> Generate Invoice" link', async () => {
      await subscriptionPage.openTab('Subscription Lines').catch(() => {});
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the link opened').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-4: Open the invoice and check it was raised but not collected', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const status = await invoicePage.getInvoiceStatus();
      const totalRaw = await invoicePage.getInvoiceTotal();
      const amountDueRaw = await invoicePage.getAmountDue();

      const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      const total = toNumber(totalRaw);
      const amountDue = toNumber(amountDueRaw);

      // Prove the Payments tab was really read before treating "0 rows" as "no payment".
      const paymentsTabPresent = await invoicePage.hasPaymentsTab();
      await invoicePage.clickPaymentsTab();
      const paymentRows = await invoicePage.getPaymentRowCount();

      const notPaid = !/paid/i.test(status);
      const fullyOutstanding = Math.abs(amountDue - total) <= 0.05;

      logVerify(
        'VP4',
        'the invoice is raised but not collected: not PAID, Amount Due equals the full total, and no payment is listed',
        `invoices = ${invoiceCount}, status = "${status}", total = "${totalRaw}" -> ${total}, Amount Due = "${amountDueRaw}" -> ${amountDue}, Payments tab present = ${paymentsTabPresent}, payment rows = ${paymentRows}`,
        invoiceCount === 1 && notPaid && fullyOutstanding && paymentsTabPresent && paymentRows === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - invoice raised, nothing collected').catch(() => {});

      expect(invoiceCount, 'VP4: exactly one invoice should have been raised for the cycle').toBe(1);
      expect(notPaid, `VP4: with no card on file the invoice must NOT be PAID (status read: "${status}")`).toBeTruthy();
      expect(amountDue, `VP4: Amount Due (${amountDue}) should equal the full invoice total (${total}) - nothing was collected`).toBeCloseTo(total, 1);
      expect(paymentsTabPresent, 'VP4: the Payments tab must be present before its emptiness means anything - a missing tab means the check did not really run').toBeTruthy();
      expect(paymentRows, 'VP4: no payment should be listed against the invoice').toBe(0);

      console.log(`✅ ${TC_ID}: the invoice was raised and left fully outstanding, as expected with no saved card`);
    });
  });
});
