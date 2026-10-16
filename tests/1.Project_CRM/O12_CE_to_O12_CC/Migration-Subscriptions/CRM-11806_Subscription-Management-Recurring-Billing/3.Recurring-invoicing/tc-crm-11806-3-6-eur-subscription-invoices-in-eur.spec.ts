import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { InvoicePage } from '@pages';
// Blocker #1 fix: the native sale.subscription screens do not exist on crm-mig - drive the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  SUBSCRIPTION_PRICELIST_EUR,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import { createSubscriptionMig as createSubscription, loginAsCrmAdminMig as loginAsCrmAdmin } from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_3.6 - A EUR subscription invoices in EUR, not the company default USD
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_3.6
 *  Spec ID:         US5 (Currency)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/3.Recurring-invoicing/tc-subscription-3-6-eur-subscription-invoices-in-eur.spec.ts
 *  Baseline TC ID  : subscription-3.6  (assertions below are the baseline's, copied verbatim)
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
 *      - Customer              = "Cust-EUR-<unique>"
 *      - Pricelist             = "Public Pricelist_EUR (EUR)"
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
 *   1. Read the "Recurring Price" at the bottom right of the "Subscription Lines" tab and note
 *      the currency symbol
 *   2. Click the "=> Generate Invoice" link
 *   3. Click the "Invoices" smart button and open the invoice
 *   4. Read the invoice total and its currency
 *
 *  Verification Points:
 *   VP1. The Recurring Price is shown in EUR
 *   VP4. The invoice currency is EUR (not the company default USD), its total equals the
 *        Recurring Price read in step 1, and the amount is not converted
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_3\.6:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_3.6';

test.describe(`${TC_ID} - A EUR subscription invoices in EUR`, () => {
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

  test.skip(`${TC_ID}: A subscription priced in EUR raises its invoice in EUR and does not convert the amount @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-EUR-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let recurringPrice = 0;
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      pricelist: SUBSCRIPTION_PRICELIST_EUR,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 100,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Step 1: Read the "Recurring Price" and its currency', async () => {
      recurringPrice = await subscriptionPage.getRecurringPrice();
      const pricelist = await subscriptionPage.getPricelist();

      logVerify(
        'VP1',
        'the Recurring Price is shown in EUR (the subscription is on the EUR pricelist)',
        `Pricelist = "${pricelist}", Recurring Price = ${recurringPrice}`,
        /EUR/i.test(pricelist) && recurringPrice > 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR subscription and its Recurring Price').catch(() => {});
      expect(pricelist, `VP1: the subscription should be on the EUR pricelist (read: "${pricelist}")`).toMatch(/EUR/i);
      expect(recurringPrice, 'VP1: the Recurring Price should be a real amount').toBeGreaterThan(0);
    });

    await test.step('Step 2: Click the "=> Generate Invoice" link', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the link opened').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-4: Open the invoice and read its total and currency', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      // Read everything on the "Invoice Lines" tab BEFORE any tab switch - Odoo keeps inactive
      // notebook pages in the DOM but hidden, so a later read of amount_total would time out.
      const totalRaw = await invoicePage.getInvoiceTotal();
      const total = parseFloat((totalRaw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      const currency = await invoicePage.getInvoiceCurrency();

      const currencyIsEur = /EUR|€/i.test(currency);
      const totalMatches = Math.abs(total - recurringPrice) <= 0.05;

      logVerify(
        'VP4',
        `the invoice is raised in EUR with a total equal to the Recurring Price (${recurringPrice}) and no conversion`,
        `invoices = ${invoiceCount}, invoice currency = "${currency}", invoice total = "${totalRaw}" -> ${total}`,
        invoiceCount === 1 && currencyIsEur && totalMatches,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - the EUR invoice').catch(() => {});

      expect(invoiceCount, 'VP4: exactly one invoice should have been raised for the cycle').toBe(1);
      expect(currencyIsEur, `VP4: the invoice currency should be EUR, not the company default USD (read: "${currency}")`).toBeTruthy();
      expect(total, `VP4: the invoice total (${total}) should equal the Recurring Price (${recurringPrice}) with no conversion`).toBeCloseTo(recurringPrice, 1);

      console.log(`✅ ${TC_ID}: the EUR subscription billed in EUR without converting the amount`);
    });
  });
});
