import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginAsCrmAdmin, createSubscription, logVerify,
  parseMMDDYYYY, dayDiff, todayMMDDYYYY,
  TEMPLATE_YEARLY, SKU_ENT_MONTHLY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.6 - A yearly subscription produces a draft invoice only and moves its next
 *                    date forward by one year
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.6
 *  Spec ID:         US4 (Recurring invoicing)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Why this case matters: the "Yearly Subscription" template runs in Draft-invoice mode AND has
 *  no Invoice Email Template configured, so a due cycle produces a draft and stops - nothing is
 *  validated, nothing is sent, nothing is charged. A human has to post the draft by hand.
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Open Subscriptions > Subscriptions and click "CREATE"
 *    Fill the form with:
 *      - Customer              = "Cust-Yearly-<unique>"
 *      - Pricelist             = "Public Pricelist_USD (USD)"
 *      - Subscription Template = "Yearly Subscription"
 *      - Start Date            = today
 *    On the "Subscription Lines" tab click "Add a line" and fill:
 *      - Product  = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Quantity = 50
 *    Click "SAVE"
 *    Click "IN PROGRESS" on the status bar so that "Date of Next Invoice" becomes visible
 *    Click "EDIT", set "Date of Next Invoice" = today, then click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Write down the date shown in "Date of Next Invoice"
 *   2. Click the "=> Generate Invoice" link
 *   3. On the invoice the link opens, read its status and its number
 *   4. Go back to the subscription and read the new "Date of Next Invoice"
 *   5. Read the "Invoices" smart button
 *
 *  Verification Points:
 *   1. The invoice stays unfinished: its status is Draft and it carries no validated number
 *   2. "Date of Next Invoice" equals the date written down in step 1 plus exactly one year
 *   3. Exactly one invoice exists, count = 1
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.6:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.6';
const QUANTITY = 50;
const DATE_TOLERANCE_DAYS = 2;

test.describe('CRM-11806_1.2.6 - A yearly subscription produces a draft invoice only', () => {

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
    // The draft invoice and its subscription are left behind on purpose - each run creates its
    // own uniquely-named Customer, so re-runs never collide.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11806_1.2.6: A yearly subscription produces a draft invoice only and moves its next date forward by one year', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const customerName = `Cust-Yearly-${CommonUtils.generateUniqueId()}`;

    await loginAsCrmAdmin(page);
    await createSubscription(page, {
      customerName,
      template: TEMPLATE_YEARLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: QUANTITY,
      nextInvoiceDate: todayMMDDYYYY(),
    });

    let dueDateBefore = '';
    let returnUrl = '';

    await test.step('Step 1: Write down the date shown in "Date of Next Invoice"', async () => {
      dueDateBefore = await subscriptionPage.getDateOfNextInvoice();
      console.log(`Step 1: due date before billing = "${dueDateBefore}"`);
      expect(parseMMDDYYYY(dueDateBefore), `Step 1: "Date of Next Invoice" should be readable (got "${dueDateBefore}")`).not.toBeNull();
    });

    await test.step('Step 2-3: Click "=> Generate Invoice" and read the invoice it opens', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - the invoice the link opened').catch(() => {});

      const status = await invoicePage.getInvoiceStatus();
      const isDraft = /draft/i.test(status);

      // The Master expects "The invoice has no number yet (it shows 'Draft Invoice')". On
      // account.invoice the number field carries attrs invisible state in ('draft'), so it is
      // hidden BY DESIGN here - calling getInvoiceNumber() would wait for a span that can never
      // become visible and fail with a timeout instead of a verdict. Probe its visibility instead.
      const numberVisible = await invoicePage.isInvoiceNumberVisible();

      logVerify(
        'VP1',
        'the invoice produced by a Draft-invoice template stays in Draft and shows no number yet',
        `status = "${status}", invoice-number field visible = ${numberVisible}`,
        isDraft && !numberVisible,
      );

      expect(isDraft, `VP1: the Yearly template runs in Draft-invoice mode, so the invoice should stay Draft (status read: "${status}")`).toBeTruthy();
      expect(numberVisible, 'VP1: a draft invoice should show the label "Draft Invoice" and no number - a visible number field would mean it was validated').toBeFalsy();
    });

    await test.step('Step 4-5: Go back to the subscription and check the next date and invoice count', async () => {
      await subscriptionPage.openByUrl(returnUrl);

      const dueDateAfter = await subscriptionPage.getDateOfNextInvoice();
      const before = parseMMDDYYYY(dueDateBefore) as Date;
      const expectedNext = new Date(before.getFullYear() + 1, before.getMonth(), before.getDate());
      const after = parseMMDDYYYY(dueDateAfter);
      const diff = after ? Math.abs(dayDiff(after, expectedNext)) : 999;
      const invoiceCount = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP2 + VP3',
        `"Date of Next Invoice" = ${expectedNext.toLocaleDateString('en-US')} (previous due date "${dueDateBefore}" plus exactly one year); exactly one invoice, count = 1`,
        `"Date of Next Invoice" = "${dueDateAfter}" (diff ${diff} day(s)); "Invoices" smart button = ${invoiceCount}`,
        diff <= DATE_TOLERANCE_DAYS && invoiceCount === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - next date advanced by a year').catch(() => {});

      expect(after, `VP2: "Date of Next Invoice" should be parseable (got "${dueDateAfter}")`).not.toBeNull();
      expect(diff, `VP2: the yearly template should advance the next date by one year (was "${dueDateBefore}", now "${dueDateAfter}")`).toBeLessThanOrEqual(DATE_TOLERANCE_DAYS);
      expect(invoiceCount, 'VP3: exactly ONE invoice should exist for the cycle').toBe(1);

      console.log(`✅ ${TC_ID}: the yearly cycle produced a draft only and the next date advanced by one year`);
    });

    await test.step('Step 6: Click the Invoices smart button and open the invoice to verify the message history', async () => {
      // Navigate back to the subscription to access the Invoices smart button
      // (we're still on the subscription from step 4-5)
      await subscriptionPage.openInvoices();

      // ---------------------------------------------------------------------------------
      // VP6a - "The message history contains no invoice email to the customer".
      //
      // The chatter is NEVER empty on a fresh invoice (Odoo logs the record creation), so
      // asserting chatterText === '' would be wrong. Worse, getChatterText() returns '' both when
      // the history is empty AND when it could not be read, so that assertion would pass for the
      // wrong reason. Prove the region was really read first, then assert the ABSENCE of an
      // outgoing-mail message.
      //
      // Why this is the right negative: the "Yearly Subscription" template is payment_mode =
      // draft_invoice with NO Invoice Email Template, so nothing can be sent. If someone later
      // attaches a mail template to it, a sent-mail message appears in this chatter and this
      // assertion fails - which is exactly the regression the case exists to catch.
      // ---------------------------------------------------------------------------------
      const chatterPresent = await invoicePage.hasChatter();
      const chatterText = await invoicePage.getChatterText();
      const SENT_MAIL_MARKERS = /sent by e-?mail|invoice sent|your invoice|to:\s*\S+@|<\S+@\S+>/i;
      const sentMailFound = SENT_MAIL_MARKERS.test(chatterText);

      logVerify(
        'VP6a',
        'the message history is readable AND contains no invoice email to the customer',
        `chatter present = ${chatterPresent}, outgoing-mail marker found = ${sentMailFound}, history = "${chatterText || '(empty)'}"`,
        chatterPresent && !sentMailFound,
      );

      expect(chatterPresent, 'VP6a: the invoice message history must be present before it can be judged - a missing region means the check did not really run').toBeTruthy();
      expect(sentMailFound, `VP6a: the draft invoice should have no outgoing invoice email in the message history, but a marker was found in: "${chatterText}"`).toBeFalsy();

      // ---------------------------------------------------------------------------------
      // VP6b - "No payment is recorded against the invoice".
      //
      // getPaymentRowCount() returns 0 both when there are no rows AND when the tab could not be
      // found, so the count alone proves nothing. The "Payments" page is declared unconditionally
      // on account.invoice (no attrs), so it is present even on a draft invoice - assert that
      // first, then assert the count.
      // ---------------------------------------------------------------------------------
      const paymentsTabPresent = await invoicePage.hasPaymentsTab();
      await invoicePage.clickPaymentsTab();
      const paymentRowCount = await invoicePage.getPaymentRowCount();

      logVerify(
        'VP6b',
        'the Payments tab is readable AND records no payment against the invoice',
        `Payments tab present = ${paymentsTabPresent}, payment row count = ${paymentRowCount}`,
        paymentsTabPresent && paymentRowCount === 0,
      );

      expect(paymentsTabPresent, 'VP6b: the Payments tab must be present before its emptiness means anything - a missing tab means the check did not really run').toBeTruthy();
      expect(paymentRowCount, 'VP6b: a draft invoice should have no payments recorded').toBe(0);
    });
  });
});
