import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { SKU_ENT_MONTHLY, SKU_O365, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.3 - Two subscription products on one order land on ONE subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.3
 *  Spec ID:         US1 (Subscription creation)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to pre-production as a Salesperson (e.g. Thomas Semerich)
 *    Open Sales > Orders > Quotations and click "CREATE"
 *    Fill the quotation form with:
 *      - Customer  = "Cust-TwoLines-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill the first line:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Ordered Qty = 50
 *    Click "Add a line" again and fill the second line:
 *      - Product     = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Ordered Qty = 100
 *    Click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Click "CONFIRM"
 *   2. Read the number on the "Subscriptions" smart button
 *   3. Click the "Subscriptions" smart button
 *   4. Open the "Subscription Lines" tab and count the lines
 *   5. Read the "Recurring Price" shown at the bottom right of that tab
 *
 *  Verification Points:
 *   VP2. The "Subscriptions" smart button reads 1 - one subscription for the whole order,
 *        not one per product
 *   VP4. The subscription holds exactly 2 lines, with the ordered products and quantities
 *   VP5. The Recurring Price equals the sum of the two lines' Sub Total values
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.3:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.3';
const SALESPERSON = users.sale_ic_thomas;

test.describe(`${TC_ID} - Two subscription lines land on one subscription`, () => {
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

  test(`${TC_ID}: Two subscription products on one order produce a single subscription holding both lines`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-TwoLines-${CommonUtils.generateUniqueId()}`;

    await test.step(`Pre-condition: Login to pre-production as a Salesperson (${SALESPERSON.username})`, async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALESPERSON.username, SALESPERSON.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(`Pre-condition: Create the quotation for "${customerName}" with TWO subscription lines`, async () => {
      await quotationPage.openNewQuotationForm();
      await quotationPage.selectCustomerOnNewQuotation(customerName);
      await quotationPage.addOrderLineBySku(SKU_ENT_MONTHLY, 50);
      await quotationPage.addOrderLineBySku(SKU_O365, 100);
      await quotationPage.clickSaveButton();
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log(`✓ Quotation saved with ${SKU_ENT_MONTHLY} x 50 and ${SKU_O365} x 100`);
    });

    await test.step('Step 1-2: Click "CONFIRM" and read the "Subscriptions" smart button', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      const hasButton = await quotationPage.hasSubscriptionsSmartButton();

      logVerify(
        'VP2',
        'the order confirms and offers ONE "Subscriptions" smart button - one subscription for the whole order, not one per product',
        `status bar = "${status}", "Subscriptions" smart button present = ${hasButton}`,
        /sale\s*order/i.test(status) && hasButton,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - confirmed order with the Subscriptions smart button').catch(() => {});
      expect(status, `VP2: the order should confirm to a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);
      expect(hasButton, 'VP2: the confirmed order should offer a "Subscriptions" smart button').toBeTruthy();
    });

    await test.step('Step 3-5: Open the subscription, count its lines and check the Recurring Price', async () => {
      await quotationPage.clickSubscriptionsSmartButton();
      await subscriptionPage.waitForLoaded();

      const lineCount = await subscriptionPage.getLineCount();
      const products = await subscriptionPage.getAllLineProducts();
      const quantities = await subscriptionPage.getAllLineNumbersByHeader('Quantity');
      const subTotals = await subscriptionPage.getAllLineNumbersByHeader('Sub Total');
      const recurringPrice = await subscriptionPage.getRecurringPrice();

      const sumOfLines = subTotals.reduce((a, b) => a + b, 0);
      const hasEnt = products.some(p => p.includes(SKU_ENT_MONTHLY));
      const hasO365 = products.some(p => p.includes(SKU_O365));
      const sumMatches = Math.abs(sumOfLines - recurringPrice) <= 0.05;

      logVerify(
        'VP4 + VP5',
        `the subscription holds exactly 2 lines (${SKU_ENT_MONTHLY} x 50 and ${SKU_O365} x 100) and its Recurring Price equals the sum of their Sub Totals`,
        `lines = ${lineCount}, products = [${products.join(' | ')}], quantities = [${quantities.join(' | ')}], sub totals = [${subTotals.join(' | ')}] (sum ${sumOfLines}), Recurring Price = ${recurringPrice}`,
        lineCount === 2 && hasEnt && hasO365 && quantities.includes(50) && quantities.includes(100) && sumMatches,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - one subscription holding both lines').catch(() => {});

      expect(lineCount, 'VP4: the single subscription should hold exactly 2 Subscription Lines').toBe(2);
      expect(hasEnt, `VP4: one line should be ${SKU_ENT_MONTHLY} (products read: ${products.join(' | ')})`).toBeTruthy();
      expect(hasO365, `VP4: the other line should be ${SKU_O365} (products read: ${products.join(' | ')})`).toBeTruthy();
      expect(quantities, `VP4: the ordered quantities 50 and 100 should be carried over (read: ${quantities.join(' | ')})`).toEqual(expect.arrayContaining([50, 100]));
      expect(sumOfLines, `VP5: the Recurring Price (${recurringPrice}) should equal the sum of the line Sub Totals (${sumOfLines})`).toBeCloseTo(recurringPrice, 1);

      console.log(`✅ ${TC_ID}: both ordered subscription products landed on a single subscription`);
    });
  });
});
