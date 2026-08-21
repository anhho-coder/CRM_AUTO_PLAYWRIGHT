import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.2 - An order with no subscription product creates no subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.2
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
 *      - Customer  = "Cust-NoSub-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill:
 *      - Product     = "[A2149B] NAKIVO Backup & Replication Enterprise Essentials ... Prepaid"
 *      - Ordered Qty = 1
 *    Click "SAVE"
 *    NOTE: this product is NOT flagged as a subscription product, which is what the case checks
 *
 *  Steps to reproduce:
 *   1. Click "CONFIRM"
 *   2. Look at the smart-button row at the top right of the confirmed order
 *   3. Open Subscriptions > Subscriptions, type "Cust-NoSub-<unique>" in the search box and
 *      press Enter
 *
 *  Verification Points:
 *   VP1. The status bar moves to "SALE ORDER" - the order confirms normally
 *   VP2. No "Subscriptions" smart button is shown
 *   VP3. The list returns 0 records - no subscription was created for this customer
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.2';
const SALESPERSON = users.sale_ic_thomas;
/** A perpetual-support product - deliberately NOT flagged recurring_invoice. */
const SKU_NON_SUBSCRIPTION = 'A2149B';

test.describe(`${TC_ID} - An order with no subscription product creates no subscription`, () => {
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

  test(`${TC_ID}: An order that holds only a non-subscription product confirms normally and creates no subscription`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-NoSub-${CommonUtils.generateUniqueId()}`;

    await test.step(`Pre-condition: Login to pre-production as a Salesperson (${SALESPERSON.username})`, async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALESPERSON.username, SALESPERSON.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(`Pre-condition: Create the quotation for "${customerName}" with the NON-subscription product ${SKU_NON_SUBSCRIPTION} x 1`, async () => {
      await quotationPage.openNewQuotationForm();
      await quotationPage.selectCustomerOnNewQuotation(customerName);
      await quotationPage.addOrderLineBySku(SKU_NON_SUBSCRIPTION, 1);
      await quotationPage.clickSaveButton();
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log(`✓ Quotation saved with the non-recurring product ${SKU_NON_SUBSCRIPTION}`);
    });

    await test.step('Step 1: Click "CONFIRM"', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();

      logVerify(
        'VP1',
        'the order confirms normally - the status bar moves to "SALE ORDER"',
        `status bar = "${status}"`,
        /sale\s*order/i.test(status),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - order confirmed').catch(() => {});
      expect(status, `VP1: the order should confirm without error and become a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);
    });

    await test.step('Step 2: Look at the smart-button row on the confirmed order', async () => {
      const hasButton = await quotationPage.hasSubscriptionsSmartButton();

      logVerify(
        'VP2',
        'no "Subscriptions" smart button is shown - only the product decides this',
        `"Subscriptions" smart button present = ${hasButton}`,
        hasButton === false,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - no Subscriptions smart button').catch(() => {});
      expect(hasButton, 'VP2: a confirmed order holding no subscription product must not offer a "Subscriptions" smart button').toBeFalsy();
    });

    await test.step(`Step 3: Search "${customerName}" in Subscriptions > Subscriptions`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP3',
        `the Subscriptions list returns 0 records for "${customerName}"`,
        `the list returned ${rows} record(s)`,
        rows === 0,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - no subscription for this customer').catch(() => {});
      expect(rows, `VP3: no subscription should exist for "${customerName}" - the product, not the order, decides whether one is created`).toBe(0);

      console.log(`✅ ${TC_ID}: the order confirmed normally and produced no subscription`);
    });
  });
});
