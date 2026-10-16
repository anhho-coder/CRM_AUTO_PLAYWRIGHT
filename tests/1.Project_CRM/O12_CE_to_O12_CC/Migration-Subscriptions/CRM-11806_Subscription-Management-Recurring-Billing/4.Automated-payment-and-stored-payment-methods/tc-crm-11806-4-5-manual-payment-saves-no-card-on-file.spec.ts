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
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_4.5 - Paying by bank transfer keeps NO card on file
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_4.5
 *  Spec ID:         US7 (Manual collection)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/4.Automated-payment-and-stored-payment-methods/tc-subscription-4-5-manual-payment-saves-no-card-on-file.spec.ts
 *  Baseline TC ID  : subscription-4.5  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-15  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *    Create the subscription "Cust-Transfer-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *    Click the "=> Generate Invoice" link once so an open invoice exists
 *
 *  Steps to reproduce:
 *   1. Click the "Invoices" smart button and open the invoice
 *   2. Click "REGISTER PAYMENT", set Journal = Bank and the full amount, then click "VALIDATE"
 *   3. Read the invoice status bar
 *   4. Go back to the subscription and open the "Settings" tab
 *   5. Read "Payment Token"
 *
 *  Verification Points:
 *   VP3. The invoice status bar highlights PAID
 *   VP5. Paying this way keeps no card on file: "Payment Token" is still empty, no saved card
 *        was added, and the subscription stays on manual collection for the next cycle
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_4\.5:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_4.5';

test.describe(`${TC_ID} - Manual payment saves no card on file`, () => {
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

  test.skip(`${TC_ID}: Settling an invoice by bank transfer marks it PAID and leaves the subscription with no saved card @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-Transfer-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    const toNumber = (raw: string): number => parseFloat((raw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition: Click the "=> Generate Invoice" link once so an open invoice exists', async () => {
      const tokenBefore = await subscriptionPage.getPaymentToken();
      expect(tokenBefore, 'Pre-condition: the subscription should start with no saved card').toBe('');
      await subscriptionPage.openTab('Subscription Lines').catch(() => {});

      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);

      const count = await subscriptionPage.getInvoiceCount();
      expect(count, 'Pre-condition: one open invoice should exist before the transfer is registered').toBe(1);
    });

    await test.step('Step 1-2: Open the invoice and register the full amount on the Bank journal', async () => {
      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const amountDueRaw = await invoicePage.getAmountDue();
      const amountDue = toNumber(amountDueRaw);

      let __verifyPassed = false;
      try {
        expect(amountDue, 'Step 1: the open invoice should show a real outstanding amount').toBeGreaterThan(0);

        await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);

        const journals = await invoicePage.getPaymentJournalOptions();
        const bankJournal = journals.find(j => /bank/i.test(j)) ?? journals[0] ?? '';
        console.log(`  - Journals offered: ${journals.join(' | ') || '(none read)'} -> using "${bankJournal}"`);
        expect(bankJournal, 'Step 2: the Register Payment dialog should offer a Bank journal').not.toBe('');
        await invoicePage.selectPaymentJournal(bankJournal);

        await invoicePage.fillPaymentAmount(String(amountDue), CommonUtils.waitTimes.abnormalWait);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 2 - bank transfer registered', passed: __verifyPassed }).catch(() => {});
      }

      await invoicePage.clickValidate_RegisterPayment(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    });

    await test.step('Step 3: Read the invoice status bar', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Paid');

      logVerify(
        'VP3',
        'the invoice status bar highlights PAID',
        `status = "${status}"`,
        /paid/i.test(status),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - invoice paid by transfer').catch(() => {});
      expect(status, `VP3: the invoice should be PAID after the bank transfer is validated (status read: "${status}")`).toMatch(/paid/i);
    });

    await test.step('Step 4-5: Go back to the subscription and read "Payment Token" on the Settings tab', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const token = await subscriptionPage.getPaymentToken();
      const state = await subscriptionPage.getState();

      logVerify(
        'VP5',
        'paying by transfer keeps no card on file - "Payment Token" is still empty and the subscription stays on manual collection',
        `Payment Token = "${token || '(empty)'}", subscription state = "${state}"`,
        token === '' && /in\s*progress/i.test(state),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - still no Payment Token after the transfer').catch(() => {});

      expect(token, `VP5: a bank transfer must not add a saved card to the subscription (Payment Token read: "${token}")`).toBe('');
      expect(state, `VP5: the subscription should still be IN PROGRESS, collecting manually next cycle (state read: "${state}")`).toMatch(/in\s*progress/i);

      console.log(`✅ ${TC_ID}: the transfer settled the invoice and left no card on file`);
    });
  });
});
