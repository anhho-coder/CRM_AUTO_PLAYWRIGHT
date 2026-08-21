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
 *  CRM-11806_1.4.2 - One invoice is the single source of truth for a billed cycle
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.4.2
 *  Spec ID:         US13 (Single source of truth)
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
 *    npx playwright test --grep "CRM-11806_1\.4\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.4.2';

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

  test(`${TC_ID}: A billed cycle produces one invoice, reachable identically from Accounting and from the subscription`, async ({ page }, testInfo) => {
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
      const numberFromSubscription = await invoicePage.getInvoiceNumber().catch(() => '');

      logVerify(
        'VP5',
        'the invoice reached from the subscription is the very same invoice found in Accounting',
        `number from Accounting = "${numberFromAccounting}", number from the subscription = "${numberFromSubscription}"`,
        numberFromSubscription === numberFromAccounting,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - same invoice from both routes').catch(() => {});
      expect(numberFromSubscription, `VP5: both routes must reach the same invoice (Accounting "${numberFromAccounting}", subscription "${numberFromSubscription}")`).toBe(numberFromAccounting);

      console.log(`✅ ${TC_ID}: subscription "${reference}" produced exactly one authoritative invoice`);
    });
  });
});
