import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  dayDiff,
  loginAsCrmAdmin,
  logVerify,
  monthsFromTodayMMDDYYYY,
  parseMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.3.5 - A three-months-overdue subscription bills ONCE, not once per missed month
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3.5
 *  Spec ID:         US11 (Overdue cycles)
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
 *    Create the subscription "Cust-Overdue-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date = today minus 3 months, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today minus 3 months, save
 *
 *  Steps to reproduce:
 *   1. Confirm "Date of Next Invoice" shows a date three months in the past
 *   2. Click the "=> Generate Invoice" link ONCE
 *   3. Click the "Invoices" smart button and count the invoices
 *   4. Open the invoice and read its total
 *   5. Go back to the subscription and read "Date of Next Invoice"
 *
 *  Verification Points:
 *   VP3. Exactly 1 invoice is raised, count = 1 - the three missed months do not each produce
 *        their own invoice
 *   VP4. The invoice total equals ONE cycle of the Recurring Price, not three
 *   VP5. "Date of Next Invoice" has moved forward by one month from the overdue date
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.3\.5:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3.5';
const DATE_TOLERANCE_DAYS = 3;

test.describe(`${TC_ID} - An overdue cycle bills once, not once per missed month`, () => {
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

  test(`${TC_ID}: A subscription three months overdue raises exactly one invoice for one cycle`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);

    const customerName = `Cust-Overdue-${CommonUtils.generateUniqueId()}`;
    const threeMonthsAgo = monthsFromTodayMMDDYYYY(-3);
    let recurringPrice = 0;
    let dueBefore = '';
    let returnUrl = '';

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_O365,
      quantity: 10,
      startDate: threeMonthsAgo,
      nextInvoiceDate: threeMonthsAgo,
    });

    await test.step('Step 1: Confirm "Date of Next Invoice" is three months in the past', async () => {
      dueBefore = await subscriptionPage.getDateOfNextInvoice();
      recurringPrice = await subscriptionPage.getRecurringPrice();

      const due = parseMMDDYYYY(dueBefore);
      const daysOverdue = due ? dayDiff(new Date(), due) : 0;

      logVerify(
        'Step 1',
        `"Date of Next Invoice" is about three months in the past (${threeMonthsAgo})`,
        `"Date of Next Invoice" = "${dueBefore}" -> ${daysOverdue} day(s) overdue; Recurring Price = ${recurringPrice}`,
        daysOverdue > 60,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - subscription three months overdue').catch(() => {});

      expect(due, `Step 1: "Date of Next Invoice" should be readable (got "${dueBefore}")`).not.toBeNull();
      expect(daysOverdue, `Step 1: the subscription should be clearly overdue (read "${dueBefore}", ${daysOverdue} days)`).toBeGreaterThan(60);
      expect(recurringPrice, 'Step 1: the subscription should have a real Recurring Price').toBeGreaterThan(0);
    });

    await test.step('Step 2: Click the "=> Generate Invoice" link ONCE', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the invoice the single run produced').catch(() => {});
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 3-4: Count the invoices and read the invoice total', async () => {
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP3',
        'exactly 1 invoice is raised - the three missed months do not each produce their own invoice',
        `"Invoices" smart button = ${invoiceCount}`,
        invoiceCount === 1,
      );
      expect(invoiceCount, 'VP3: one billing run on an overdue subscription should raise exactly ONE invoice').toBe(1);

      await subscriptionPage.openInvoices();
      await invoicePage.openFirstInvoiceRow();

      const totalRaw = await invoicePage.getInvoiceTotal();
      const total = parseFloat((totalRaw || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
      const singleCycle = Math.abs(total - recurringPrice) <= 0.05;

      logVerify(
        'VP4',
        `the invoice total equals ONE cycle of the Recurring Price (${recurringPrice}), not three (${recurringPrice * 3})`,
        `invoice total = "${totalRaw}" -> ${total}`,
        singleCycle,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - one cycle billed, not three').catch(() => {});
      expect(total, `VP4: the customer must be billed ONE cycle (${recurringPrice}), not three (${recurringPrice * 3}) - read ${total}`).toBeCloseTo(recurringPrice, 1);
    });

    await test.step('Step 5: Go back to the subscription and read "Date of Next Invoice"', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const dueAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(dueBefore) as Date;
      const expectedNext = new Date(before.getFullYear(), before.getMonth() + 1, before.getDate());
      const after = parseMMDDYYYY(dueAfter);
      const diff = after ? Math.abs(dayDiff(after, expectedNext)) : 999;

      logVerify(
        'VP5',
        `"Date of Next Invoice" moves forward by ONE month from the overdue date "${dueBefore}"`,
        `"Date of Next Invoice" = "${dueAfter}" (${diff} day(s) from the expected one-month step)`,
        diff <= DATE_TOLERANCE_DAYS,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - next date advanced by one month').catch(() => {});

      expect(after, `VP5: "Date of Next Invoice" should be readable (got "${dueAfter}")`).not.toBeNull();
      expect(diff, `VP5: the next date should step forward by one month from "${dueBefore}", not skip the missed cycles (now "${dueAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);

      console.log(`✅ ${TC_ID}: the overdue subscription billed one cycle only and advanced one month`);
    });
  });
});
