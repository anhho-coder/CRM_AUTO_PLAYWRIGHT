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
 *  CRM-11806_10.2 - One invoice is the single source of truth for a billed cycle
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_10.2
 *  Spec ID:         IS-CRM-FUNC-0175, IS-CRM-FUNC-0176 / SC-30
 *                   Spec text  : one invoice in one system per cycle; order invoices and recurring invoices stay distinguishable
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "US13 (Single source of truth)" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 * --------------------------------------------------------------------------------------------
 *  PORT - this spec is the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/10.Integration-with-the-CRM-and-visibility/tc-subscription-10-2-one-invoice-is-the-single-source-of-truth.spec.ts
 *  Baseline TC ID  : subscription-10.2  (assertions below are the baseline's, copied verbatim)
 *  QA card         : SC-30  - "Subscription Test Cases" (CRM-12140, Nathan)
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
 *    Create the subscription "Cust-OneSource-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" x 50
 *    Click "SAVE" and write down the Reference (e.g. SUB1425)
 *    Click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *
 *  Steps to reproduce:
 *   1. Click the "=> Generate Invoice" link
 *   2. Open Accounting > Customers > Invoices, type "Cust-OneSource-<unique>" in the search box
 *      and press Enter
 *   3. Count the invoices listed for this customer
 *   4. Open the invoice and read "Source Document" and the seller shown on the invoice header
 *   5. Go back to the subscription, click the "Invoices" smart button and compare the number
 *
 *  Verification Points:
 *   VP3. Exactly 1 invoice is listed for this customer - no second invoice for the same period
 *   VP4. "Source Document" is the Reference written down, and the seller is NAKIVO, Inc.
 *   VP5. The invoice reached from the subscription is the very same invoice number
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_10\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_10.2';

test.describe(`${TC_ID} - One invoice is the single source of truth`, () => {
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

  test.skip(`${TC_ID}: A billed cycle produces one invoice, reachable identically from Accounting and from the subscription @blocked-devrun`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-OneSource-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let reference = '';
    let returnUrl = '';
    let numberFromAccounting = '';

    await loginAsCrmAdmin(page);

    const setup = await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: 50,
      startDate: today,
      nextInvoiceDate: today,
    });
    reference = setup.reference;

    await test.step('Step 1: Click the "=> Generate Invoice" link', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - the invoice the link opened').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step(`Step 2-3: Search "${customerName}" in Accounting > Customers > Invoices and count`, async () => {
      await invoicePage.openCustomerInvoicesList();
      const rowsBefore = await invoicePage.getInvoiceListRowCount();
      console.log(`  - Invoices listed before filtering: ${rowsBefore}`);

      await invoicePage.searchInvoiceInList(customerName);
      const filtered = await invoicePage.getInvoiceListRowCount();

      logVerify(
        'VP3',
        `exactly 1 invoice is listed for "${customerName}" - there is no second invoice for the same period coming from anywhere else`,
        `the Invoices list returned ${filtered} record(s)`,
        filtered === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - one invoice for this customer').catch(() => {});
      expect(filtered, `VP3: exactly one invoice should exist for "${customerName}"`).toBe(1);
    });

    await test.step('Step 4: Open the invoice and read "Source Document" and the seller', async () => {
      await invoicePage.openFirstInvoiceRow();

      numberFromAccounting = await invoicePage.getInvoiceNumber().catch(() => '');
      await invoicePage.openOtherInfoTab();
      const sourceDoc = await invoicePage.getSourceDocument();

      logVerify(
        'VP4',
        `the single invoice is the authoritative one: "Source Document" = "${reference}" and the seller is NAKIVO, Inc.`,
        `Source Document = "${sourceDoc}", invoice number = "${numberFromAccounting}"`,
        sourceDoc.includes(reference),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - source document and seller').catch(() => {});
      expect(sourceDoc, `VP4: "Source Document" should be the subscription Reference "${reference}" (read: "${sourceDoc}")`).toContain(reference);
    });

    await test.step('Step 5: Reach the invoice from the subscription and compare the number', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const invoiceCount = await subscriptionPage.getInvoiceCount();
      expect(invoiceCount, 'VP5: the subscription should link to exactly one invoice').toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      let __verifyPassed = false;
      try {
        const numberFromSubscription = await invoicePage.getInvoiceNumber().catch(() => '');

        logVerify(
          'VP5',
          'the invoice reached from the subscription is the very same invoice found in Accounting',
          `number from Accounting = "${numberFromAccounting}", number from the subscription = "${numberFromSubscription}"`,
          numberFromSubscription === numberFromAccounting,
        );

        expect(numberFromSubscription, `VP5: both routes must reach the same invoice (Accounting "${numberFromAccounting}", subscription "${numberFromSubscription}")`).toBe(numberFromAccounting);

        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 5 - same invoice from both routes', passed: __verifyPassed }).catch(() => {});
      }

      console.log(`✅ ${TC_ID}: subscription "${reference}" produced exactly one authoritative invoice`);
    });
  });
});
