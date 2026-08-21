import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  loginAsCrmAdmin,
  logVerify,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.14 - An upsell adds lines to the SAME subscription, it does not create a
 *                     second one
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.14
 *  Spec ID:         US8 (Upsell)
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
 *    Create the subscription "Cust-Upsell-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today, with one line
 *      "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" x 50
 *    Click "SAVE", click "IN PROGRESS"
 *    Write down the Reference and the "Recurring Price"
 *    NOTE: the "Upsell" button only appears once the subscription is IN PROGRESS
 *
 *  Steps to reproduce:
 *   1. Click the "Upsell" button in the subscription header
 *   2. In the dialog click "Add a line" and fill:
 *      - Product  = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Quantity = 100
 *   3. Click "Create & View Quotation"
 *   4. On the created quotation click "CONFIRM"
 *   5. Go back to the subscription and open the "Subscription Lines" tab
 *   6. Open Subscriptions > Subscriptions, search "Cust-Upsell-<unique>" and count the records
 *
 *  Verification Points:
 *   VP5. The upsell lines land on the same subscription: 2 lines and a higher Recurring Price
 *   VP6. Exactly 1 subscription exists for this customer - the upsell created no second one
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.14:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.14';

test.describe(`${TC_ID} - An upsell adds lines to the same subscription`, () => {
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

  test(`${TC_ID}: Upselling a live subscription adds the new line to it instead of creating a second subscription`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const quotationPage = new QuotationPage(page);

    const customerName = `Cust-Upsell-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    let reference = '';
    let priceBefore = 0;
    let subscriptionUrl = '';

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

    await test.step('Pre-condition: Write down the Reference and the "Recurring Price"', async () => {
      priceBefore = await subscriptionPage.getRecurringPrice();
      subscriptionUrl = page.url();
      console.log(`Pre-condition: Reference = "${reference}", Recurring Price before the upsell = ${priceBefore}`);
      expect(priceBefore, 'Pre-condition: the subscription should have a real Recurring Price before the upsell').toBeGreaterThan(0);
    });

    await test.step(`Step 1-3: Upsell the subscription with ${SKU_O365} x 100 and create the quotation`, async () => {
      await subscriptionPage.upsellWithProduct(SKU_O365, 100);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - upsell quotation created').catch(() => {});
    });

    await test.step('Step 4: On the created quotation click "CONFIRM"', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      console.log(`Step 4: upsell quotation status after CONFIRM = "${status}"`);
      expect(status, `Step 4: the upsell quotation should confirm to a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - upsell order confirmed').catch(() => {});
    });

    await test.step('Step 5: Go back to the subscription and read its lines and Recurring Price', async () => {
      await subscriptionPage.openByUrl(subscriptionUrl);

      const lineCount = await subscriptionPage.getLineCount();
      const products = await subscriptionPage.getAllLineProducts();
      const priceAfter = await subscriptionPage.getRecurringPrice();

      const hasBoth = products.some(p => p.includes(SKU_ENT_MONTHLY)) && products.some(p => p.includes(SKU_O365));

      logVerify(
        'VP5',
        `the upsell lines land on the SAME subscription: 2 lines and a Recurring Price higher than ${priceBefore}`,
        `lines = ${lineCount}, products = [${products.join(' | ')}], Recurring Price = ${priceAfter} (was ${priceBefore})`,
        lineCount === 2 && hasBoth && priceAfter > priceBefore,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - upsell line added to the same subscription').catch(() => {});

      expect(lineCount, 'VP5: the upsold subscription should now hold 2 Subscription Lines').toBe(2);
      expect(hasBoth, `VP5: both the original ${SKU_ENT_MONTHLY} and the upsold ${SKU_O365} should be listed (read: ${products.join(' | ')})`).toBeTruthy();
      expect(priceAfter, `VP5: the Recurring Price should rise above the pre-upsell value ${priceBefore} (read: ${priceAfter})`).toBeGreaterThan(priceBefore);
    });

    await test.step(`Step 6: Search "${customerName}" and count the subscriptions`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP6',
        `exactly 1 subscription exists for "${customerName}" - the upsell did not create a second one`,
        `the list returned ${rows} record(s)`,
        rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - still only one subscription').catch(() => {});
      expect(rows, `VP6: upselling must not create a second subscription for "${customerName}"`).toBe(1);

      console.log(`✅ ${TC_ID}: the upsell extended subscription "${reference}" instead of creating a new one`);
    });
  });
});
