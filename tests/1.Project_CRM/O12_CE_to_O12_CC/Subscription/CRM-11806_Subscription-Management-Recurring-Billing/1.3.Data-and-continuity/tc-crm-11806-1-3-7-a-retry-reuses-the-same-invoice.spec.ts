import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, InvoicePage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_O365,
  TEMPLATE_MONTHLY_AUTOCHARGE,
  createSubscription,
  loginAsCrmAdmin,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.3.7 - Retrying a declined collection reuses the SAME invoice
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3.7
 *  Spec ID:         US10 (Dunning)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  ⛔ SKIPPED - BLOCKED ON TEST DATA, not on a defect.
 *
 *  Needs a saved card that the payment provider ALWAYS DECLINES, which cannot be created from the
 *  CRM UI (the card is typed on the provider's own page).
 *
 *  TO UNBLOCK: put the automation customer carrying the declining test card in
 *  DECLINING_CARD_CUSTOMER below and change `test.skip(` to `test(`.
 *
 *  NOTE - this case guards the SAME defect family as CRM-11806_1.1.2 [CRM-12188], where a second
 *  billing run on a healthy subscription DOES raise a second invoice. If that defect also applies
 *  to the retry path, expect this case to fail on VP3/VP4 and to need a test.fail() marking.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a CRM administrator (e.g. Anh Ho)
 *    Ask the CRM admin team for a saved card that the payment provider always declines
 *    Create the subscription for that customer / Public Pricelist_USD (USD) /
 *      "Monthly Subscription" / Start Date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Open the "Settings" tab and set Payment Token = the declining test card
 *    Click "SAVE", click "IN PROGRESS", set "Date of Next Invoice" = today and save
 *    Click the "=> Generate Invoice" link once so the first attempt has already been declined
 *
 *  Steps to reproduce:
 *   1. Click the "Invoices" smart button, count the invoices and write down each invoice number
 *   2. Go back to the subscription and click the "=> Generate Invoice" link again to re-attempt
 *   3. Click the "Invoices" smart button and count the invoices again
 *   4. Compare the invoice numbers now listed against the ones written down in step 1
 *
 *  Verification Points:
 *   VP1. Exactly 1 invoice exists after the first declined attempt, count = 1
 *   VP3. Still exactly 1 invoice exists after the retry, count = 1
 *   VP4. The same invoice is retried, not a new one - the customer is never billed twice
 *
 *  Command to run (once unblocked):
 *    npx playwright test --grep "CRM-11806_1\.3\.7:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3.7';

/** Set this to the automation customer that carries an always-declining test card. */
const DECLINING_CARD_CUSTOMER = '';

test.describe(`${TC_ID} - A retry reuses the same invoice`, () => {
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

  // Declaration-level skip so the browser fixture never starts - see the BLOCKED note above.
  test.skip(`${TC_ID}: Re-attempting a declined collection retries the same invoice instead of raising a second one`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const invoicePage = new InvoicePage(page);
    const today = todayMMDDYYYY();

    let returnUrl = '';
    let numbersBefore: string[] = [];

    expect(DECLINING_CARD_CUSTOMER, 'DECLINING_CARD_CUSTOMER must name a customer that carries an always-declining test card').not.toBe('');

    await loginAsCrmAdmin(page);

    await createSubscription(page, {
      customerName: DECLINING_CARD_CUSTOMER,
      template: TEMPLATE_MONTHLY_AUTOCHARGE,
      productSku: SKU_O365,
      quantity: 10,
      startDate: today,
      nextInvoiceDate: today,
    });

    await test.step('Pre-condition: Click the "=> Generate Invoice" link once so the first attempt is declined', async () => {
      const billing = await subscriptionPage.clickGenerateInvoice();
      returnUrl = billing.returnUrl;
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);
    });

    await test.step('Step 1: Count the invoices and write down each invoice number', async () => {
      const count = await subscriptionPage.getInvoiceCount();

      await subscriptionPage.openInvoices();
      numbersBefore = await invoicePage.getAllRowInvoiceNumbers();

      logVerify(
        'VP1',
        'exactly 1 invoice exists after the first declined attempt, count = 1',
        `"Invoices" smart button = ${count}, invoice numbers listed = [${numbersBefore.join(' | ')}]`,
        count === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - one invoice after the first decline').catch(() => {});
      expect(count, 'VP1: the first declined attempt should leave exactly one invoice').toBe(1);
    });

    await test.step('Step 2-3: Re-attempt the collection and count the invoices again', async () => {
      await subscriptionPage.openByUrl(returnUrl);
      const billing = await subscriptionPage.clickGenerateInvoice();
      if (billing.dialogText) console.log(`  ! Odoo said: "${billing.dialogText}"`);
      await subscriptionPage.openByUrl(returnUrl);

      const countAfter = await subscriptionPage.getInvoiceCount();

      logVerify(
        'VP3',
        'still exactly 1 invoice exists after the retry, count = 1',
        `"Invoices" smart button after the retry = ${countAfter}`,
        countAfter === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - still one invoice after the retry').catch(() => {});
      expect(countAfter, 'VP3: retrying a declined collection must not raise a second invoice for the same cycle').toBe(1);
    });

    await test.step('Step 4: Compare the invoice numbers against the ones written down', async () => {
      await subscriptionPage.openInvoices();
      const numbersAfter = await invoicePage.getAllRowInvoiceNumbers();

      const identical = numbersAfter.length === numbersBefore.length
        && numbersAfter.every((n, i) => n === numbersBefore[i]);

      logVerify(
        'VP4',
        'the same invoice is retried, not a new one - the customer is never billed twice for one cycle',
        `before = [${numbersBefore.join(' | ')}], after = [${numbersAfter.join(' | ')}]`,
        identical,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - same invoice number after the retry').catch(() => {});
      expect(numbersAfter, `VP4: the retry should reuse the same invoice (before: ${numbersBefore.join(' | ')}, after: ${numbersAfter.join(' | ')})`).toEqual(numbersBefore);

      console.log(`✅ ${TC_ID}: the retry reused the same invoice`);
    });
  });
});
