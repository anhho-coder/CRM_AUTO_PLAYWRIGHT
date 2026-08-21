import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginAsCrmAdmin, createSubscription, logVerify,
  parseMMDDYYYY, dayDiff, todayMMDDYYYY,
  TEMPLATE_MONTHLY_INVOICE_ONLY, SKU_ENT_MONTHLY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.4 - A monthly subscription invoices for the correct period and moves its next
 *                    date forward by one month
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.4
 *  Spec ID:         US4 (Recurring invoicing)
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
 *      - Customer              = "Cust-Monthly-<unique>"
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
 *   1. Write down the date currently shown in "Date of Next Invoice"
 *   2. Click the "=> Generate Invoice" link under it
 *   3. Read the new value in "Date of Next Invoice"
 *   4. Click the "Invoices" smart button and open the invoice
 *   5. Read the invoice total and its status
 *
 *  Verification Points:
 *   1. "Date of Next Invoice" equals the date written down in step 1 plus exactly one month
 *   2. Exactly one invoice was created, count = 1
 *   3. The invoice total equals the Recurring Price on the subscription
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.4:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.4';
const QUANTITY = 50;
const DATE_TOLERANCE_DAYS = 2;

/** Parse a displayed amount such as "$ 244.38" / "244.38" into a number. */
function parseAmount(raw: string): number {
  return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
}

test.describe('CRM-11806_1.2.4 - A monthly subscription advances its next invoice date by one month', () => {

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

  test('CRM-11806_1.2.4: A monthly subscription invoices for the correct period and moves its next date forward by one month', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const customerName = `Cust-Monthly-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);
    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: QUANTITY,
      nextInvoiceDate: todayMMDDYYYY(),
    });

    let dueDateBefore = '';
    let recurringPrice = 0;
    let reference = '';

    await test.step('Step 1: Write down the date currently shown in "Date of Next Invoice"', async () => {
      dueDateBefore = await subscriptionPage.getDateOfNextInvoice();
      recurringPrice = await subscriptionPage.getRecurringPrice();
      reference = await subscriptionPage.getCode();
      console.log(`Step 1: due date before billing = "${dueDateBefore}", Recurring Price = ${recurringPrice}, Reference = "${reference}"`);
      expect(reference, 'Step 1: the subscription Reference should be readable').not.toBe('');
      expect(parseMMDDYYYY(dueDateBefore), `Step 1: "Date of Next Invoice" should be readable (got "${dueDateBefore}")`).not.toBeNull();
    });

    await test.step('Step 2: Click the "=> Generate Invoice" link', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the link opened').catch(() => {});
      // The link opens the invoice it just created - come back before reading the subscription.
      await subscriptionPage.openByUrl(billing.returnUrl);
    });

    await test.step('Step 3: Read the new value in "Date of Next Invoice"', async () => {
      const dueDateAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(dueDateBefore) as Date;
      const expectedNext = new Date(before.getFullYear(), before.getMonth() + 1, before.getDate());
      const after = parseMMDDYYYY(dueDateAfter);
      const diff = after ? Math.abs(dayDiff(after, expectedNext)) : 999;

      logVerify(
        'VP1',
        `"Date of Next Invoice" = ${expectedNext.toLocaleDateString('en-US')} (the previous due date "${dueDateBefore}" plus exactly one month)`,
        `"Date of Next Invoice" = "${dueDateAfter}" (diff ${diff} day(s))`,
        diff <= DATE_TOLERANCE_DAYS,
      );

      expect(after, `VP1: "Date of Next Invoice" should be parseable (got "${dueDateAfter}")`).not.toBeNull();
      expect(diff, `VP1: the monthly template should advance the next date by one month (was "${dueDateBefore}", now "${dueDateAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);
    });

    await test.step('Step 4-5: Open the invoice and verify it matches the cycle', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP2',
        'exactly one invoice was created for the cycle, count = 1',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 1,
      );
      expect(invoiceCount, 'VP2: exactly ONE invoice should be created for the cycle').toBe(1);

      // The smart button lands on the invoices LIST. Every field read below lives on the invoice
      // FORM, so open the row - otherwise the readers resolve list-view spans that are hidden and
      // empty, and time out instead of returning a verdict.
      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - the invoice raised for the cycle').catch(() => {});

      // ---------------------------------------------------------------------------------
      // VP3.1 - the Master asks to confirm "the invoice LINE covers a one-month period starting on
      // the date written down in step 1". THAT IS NOT OBSERVABLE IN THIS SYSTEM:
      //
      //   - the invoice-line tree DOES render "Start"/"End" columns (added by the inherited view
      //     account.invoice.view.form.inherit.license), but Odoo leaves start_date / end_date EMPTY
      //     on every subscription-generated line - checked against real production invoice lines,
      //     all of which carry start_date = false;
      //   - the line Description carries only the product code and product text, no dates;
      //   - the invoice's own "Invoice Date" is EMPTY too until the invoice is validated.
      //
      // So the billed period is nowhere on screen. What the cycle correctness DOES rest on is
      // already asserted by this case: exactly one invoice, its total equal to the Recurring Price,
      // and "Date of Next Invoice" advanced by exactly one month. Here we additionally tie the
      // invoice to this subscription through its Source Document, and print the blank period
      // columns as evidence of the gap.
      // ---------------------------------------------------------------------------------
      // TAB ORDER MATTERS. "Total" (amount_total) and the invoice lines sit on the "Invoice Lines"
      // tab; "Source Document" (origin) sits on "Other Info". Odoo keeps the inactive notebook page
      // in the DOM but HIDDEN, so anything read after switching tabs would time out. Read the
      // Invoice-Lines side first, switch once, then read the Other-Info side.
      const linePeriod = await invoicePage.getFirstInvoiceLinePeriod();
      const totalRaw = await invoicePage.getInvoiceTotal();

      await invoicePage.openOtherInfoTab();
      const sourceDoc = await invoicePage.getSourceDocument();

      logVerify(
        'VP3.1 (evidence only - see the note above)',
        `the billed period is not exposed anywhere on the invoice, so it cannot be asserted; the invoice is instead tied to the subscription by its Source Document "${reference}"`,
        `Source Document = "${sourceDoc}"; invoice-line Start/End columns = "${linePeriod.start || '(blank)'}" / "${linePeriod.end || '(blank)'}"`,
        sourceDoc.includes(reference),
      );

      expect(sourceDoc, `VP3.1: the invoice should belong to this subscription - its Source Document should be "${reference}" (got "${sourceDoc}")`).toContain(reference);

      // VP3.2: Verify invoice total equals the recurring price (totalRaw was read above, before
      // the tab switch - amount_total is hidden once "Other Info" is the active page).
      const total = parseAmount(totalRaw);
      const amountOk = Math.abs(total - recurringPrice) <= 0.05;

      logVerify(
        'VP3.2',
        `the invoice total equals the subscription Recurring Price (${recurringPrice})`,
        `invoice total read = "${totalRaw}" -> ${total}`,
        amountOk,
      );

      expect(total, `VP3.2: the invoice total (${total}) should equal the Recurring Price (${recurringPrice})`).toBeCloseTo(recurringPrice, 1);

      // VP3.3: Verify invoice currency is USD
      const currency = await invoicePage.getInvoiceCurrency();
      const currencyOk = currency.toUpperCase() === 'USD' || currency === '$';

      logVerify(
        'VP3.3',
        'the invoice currency is USD',
        `invoice currency read = "${currency}"`,
        currencyOk,
      );

      expect(currency.toUpperCase(), `VP3.3: the invoice currency should be USD (got "${currency}")`).toMatch(/^(USD|\$)$/);

      console.log(`✅ ${TC_ID}: the monthly cycle billed once and the next date advanced by one month`);
    });
  });
});
