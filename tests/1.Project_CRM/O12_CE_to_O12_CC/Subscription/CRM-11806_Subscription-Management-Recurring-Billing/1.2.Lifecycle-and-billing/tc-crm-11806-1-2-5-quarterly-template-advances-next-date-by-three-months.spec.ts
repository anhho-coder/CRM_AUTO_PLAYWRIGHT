import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage, SubscriptionTemplatePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginAsCrmAdmin, createSubscription, logVerify,
  parseMMDDYYYY, dayDiff, todayMMDDYYYY,
  TEMPLATE_QUARTERLY, SKU_PRO_MONTHLY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.5 - A quarterly subscription moves its next invoice date forward by three
 *                    months
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.5
 *  Spec ID:         US4 (Recurring invoicing)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Why this case matters: the "Quarterly Subscription" template is NOT stored as a quarterly
 *  unit - it is Month(s) with Repeat Every = 3. Any parity mapping that reads the recurrence
 *  unit alone would file it as a monthly subscription, so the case asserts both the stored
 *  configuration and the resulting three-month jump.
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = "Cust-Quarterly-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Quarterly Subscription"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-PM-PRO] min 50Pro Machines, 1Month Subscription"
 *      - Quantity = 50
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Open Subscriptions > Configuration > Subscription Templates, open "Quarterly Subscription"
 *      and read "Recurrence" and "Repeat Every"
 *   2. Go back to the subscription and write down the date shown in "Date of Next Invoice"
 *   3. Click the "=> Generate Invoice" link
 *   4. Read the new value in "Date of Next Invoice"
 *   5. Click the "Invoices" smart button and count the invoices
 *
 *  Verification Points:
 *   1. Recurrence = Month(s) and Repeat Every = 3 - the quarterly cycle is stored as three
 *      months, there is no separate "quarterly" unit
 *   2. "Date of Next Invoice" equals the date written down in step 2 plus exactly three months
 *   3. Exactly one invoice was created for the quarter, count = 1
 *
 *  KNOWN DEFECT - "=> Generate Invoice" is a SILENT NO-OP for the "Quarterly Subscription"
 *  template (Payment Mode "Invoice & try to charge", no payment token on the subscription):
 *  no invoice is created, "Date of Next Invoice" does not move, the page does not navigate,
 *  and Odoo shows no dialog and logs no message. The test keeps the FRD's expected result and
 *  is marked test.fail().
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.5" --project=chromium
 *    npx playwright test --grep "CRM-12188" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.5';
const QUANTITY = 50;
const DATE_TOLERANCE_DAYS = 3;

/** Parse a displayed amount such as "$ 244.38" / "244.38" into a number. */
function parseAmount(raw: string): number {
  return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
}

test.describe('CRM-11806_1.2.5 - A quarterly subscription advances its next invoice date by three months', () => {

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
    // A subscription that produced a validated invoice cannot be cleanly deleted - left on purpose.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11806_1.2.5 [CRM-12188]: A quarterly subscription moves its next invoice date forward by three months', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'defect',
      description:
        'Silent no-op on "=> Generate Invoice" for the "Quarterly Subscription" template. That template runs Payment Mode ' +
        '"Invoice & try to charge" (validate_send_payment) and the subscription carries no payment token, so the billing run ' +
        'produces NOTHING: no invoice ("Invoices" smart button stays 0), no change to "Date of Next Invoice", the page does not ' +
        'navigate - and Odoo raises NO dialog and writes NO message. Verified on pre-production: the click was made, the dialog ' +
        'text captured by clickGenerateInvoice() was empty, and the next date stayed on the pre-billing value. Whether or not a ' +
        'payment token is legitimately required, giving the user no feedback at all is the defect. The assertions below keep the ' +
        'FRD requirement "a due cycle produces exactly one invoice and advances the next date by the recurrence".',
    });
    test.fail(); // Expected to fail until the silent no-op is resolved
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const templatePage = new SubscriptionTemplatePage(page);
    const customerName = `Cust-Quarterly-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);
    await createSubscription(page, {
      customerName,
      template: TEMPLATE_QUARTERLY,
      productSku: SKU_PRO_MONTHLY,
      quantity: QUANTITY,
      nextInvoiceDate: todayMMDDYYYY(),
    });
    const subscriptionUrl = page.url();

    await test.step('Step 1: Read "Recurrence" and "Repeat Every" on the "Quarterly Subscription" template', async () => {
      await templatePage.openList();
      await templatePage.openByName(TEMPLATE_QUARTERLY);
      const settings = await templatePage.getSettings();

      logVerify(
        'VP1',
        'Recurrence = "Month(s)" and Repeat Every = 3 (a quarter is stored as three months, not as a separate unit)',
        `Recurrence = "${settings.recurrence}", Repeat Every = ${settings.repeatEvery}`,
        settings.recurrence === 'Month(s)' && settings.repeatEvery === 3,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Quarterly template configuration').catch(() => {});
      expect(settings.recurrence, 'VP1: the Quarterly template stores its recurrence unit as Month(s)').toBe('Month(s)');
      expect(settings.repeatEvery, 'VP1: the Quarterly template repeats every 3 months').toBe(3);
    });

    let dueDateBefore = '';
    let recurringPrice = 0;

    await test.step('Step 2: Go back to the subscription and write down "Date of Next Invoice"', async () => {
      await subscriptionPage.openByUrl(subscriptionUrl);
      dueDateBefore = await subscriptionPage.getDateOfNextInvoice();
      recurringPrice = await subscriptionPage.getRecurringPrice();
      console.log(`Step 2: due date before billing = "${dueDateBefore}", Recurring Price = ${recurringPrice}`);
      expect(parseMMDDYYYY(dueDateBefore), `Step 2: "Date of Next Invoice" should be readable (got "${dueDateBefore}")`).not.toBeNull();
    });

    await test.step('Step 3: Click the "=> Generate Invoice" link', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - the invoice the link opened').catch(() => {});
      // The link opens the invoice it just created - come back before reading the subscription.
      await subscriptionPage.openByUrl(billing.returnUrl);
    });

    await test.step('Step 4-5: Check the new next date, invoice count, and invoice total', async () => {
      const dueDateAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(dueDateBefore) as Date;
      const expectedNext = new Date(before.getFullYear(), before.getMonth() + 3, before.getDate());
      const after = parseMMDDYYYY(dueDateAfter);
      const diff = after ? Math.abs(dayDiff(after, expectedNext)) : 999;
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP2 + VP3',
        `"Date of Next Invoice" = ${expectedNext.toLocaleDateString('en-US')} (previous due date "${dueDateBefore}" plus exactly three months); exactly one invoice for the quarter`,
        `"Date of Next Invoice" = "${dueDateAfter}" (diff ${diff} day(s)); "Invoices" smart button = ${invoiceCount}`,
        diff <= DATE_TOLERANCE_DAYS && invoiceCount === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - next date advanced by a quarter').catch(() => {});

      expect(after, `VP2: "Date of Next Invoice" should be parseable (got "${dueDateAfter}")`).not.toBeNull();
      expect(diff, `VP2: the quarterly template should advance the next date by three months (was "${dueDateBefore}", now "${dueDateAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);
      expect(invoiceCount, 'VP3: exactly ONE invoice should be created for the quarter').toBe(1);

      // The smart button lands on the invoices LIST; the total is read from the invoice FORM.
      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the invoice raised for the quarter').catch(() => {});

      const totalRaw = await invoicePage.getInvoiceTotal();
      const total = parseAmount(totalRaw);
      const amountOk = Math.abs(total - recurringPrice) <= 0.05;

      logVerify(
        'VP4',
        `the invoice total equals the subscription Recurring Price (${recurringPrice})`,
        `invoice total read = "${totalRaw}" -> ${total}`,
        amountOk,
      );

      expect(total, `VP4: the invoice total (${total}) should equal the Recurring Price (${recurringPrice})`).toBeCloseTo(recurringPrice, 1);

      console.log(`✅ ${TC_ID}: the quarterly cycle billed once and the next date advanced by three months`);
    });
  });
});
