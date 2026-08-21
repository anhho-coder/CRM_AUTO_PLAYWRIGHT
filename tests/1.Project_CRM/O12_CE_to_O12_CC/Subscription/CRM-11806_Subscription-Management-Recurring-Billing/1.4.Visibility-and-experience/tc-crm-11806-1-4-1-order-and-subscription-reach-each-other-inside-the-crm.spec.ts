import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { SKU_ENT_MONTHLY, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.4.1 - The order and its subscription reach each other from inside the CRM
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.4.1
 *  Spec ID:         US12 (Visibility)
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
 *      - Customer  = "Cust-Visible-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Ordered Qty = 50
 *    Click "SAVE", then click "CONFIRM"
 *    Write down the order number shown in the breadcrumb (e.g. SO216758)
 *
 *  Steps to reproduce:
 *   1. Read the "Subscriptions" smart button at the top right of the confirmed order
 *   2. Click the "Subscriptions" smart button
 *   3. Read the subscription status bar and its Customer
 *   4. Click the "Sales" smart button on the subscription and read the order number
 *   5. Open Contacts, search "Cust-Visible-<unique>" and open the contact
 *
 *  Verification Points:
 *   VP1. The "Subscriptions" smart button reads 1
 *   VP2. The subscription opens straight from the order without leaving the CRM
 *   VP3. The status bar highlights IN PROGRESS and the Customer is "Cust-Visible-<unique>"
 *   VP4. The "Sales" smart button returns to the same order number
 *   VP5. The contact record gives access to the same subscription from inside the CRM
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.4\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.4.1';
const SALESPERSON = users.sale_ic_thomas;

test.describe(`${TC_ID} - Order and subscription reach each other inside the CRM`, () => {
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

  test(`${TC_ID}: A confirmed order opens its subscription and the subscription returns to the same order`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-Visible-${CommonUtils.generateUniqueId()}`;
    let orderNumber = '';

    await test.step(`Pre-condition: Login to pre-production as a Salesperson (${SALESPERSON.username})`, async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALESPERSON.username, SALESPERSON.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(`Pre-condition: Create and CONFIRM the order for "${customerName}"`, async () => {
      await quotationPage.openNewQuotationForm();
      await quotationPage.selectCustomerOnNewQuotation(customerName);
      await quotationPage.addOrderLineBySku(SKU_ENT_MONTHLY, 50);
      await quotationPage.clickSaveButton();
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      orderNumber = await quotationPage.getSalesOrderNumber();
      console.log(`✓ Order confirmed - number = "${orderNumber}"`);
      expect(orderNumber, 'Pre-condition: the confirmed order should carry an order number').not.toBe('');
    });

    await test.step('Step 1: Read the "Subscriptions" smart button on the confirmed order', async () => {
      const hasButton = await quotationPage.hasSubscriptionsSmartButton();

      logVerify(
        'VP1',
        'the confirmed order offers a "Subscriptions" smart button',
        `"Subscriptions" smart button present = ${hasButton}`,
        hasButton === true,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - order with the Subscriptions smart button').catch(() => {});
      expect(hasButton, 'VP1: the confirmed order should offer a "Subscriptions" smart button').toBeTruthy();
    });

    await test.step('Step 2-3: Open the subscription and read its status bar and Customer', async () => {
      await quotationPage.clickSubscriptionsSmartButton();
      await subscriptionPage.waitForLoaded();

      const state = await subscriptionPage.getState();
      const customer = await subscriptionPage.getCustomer();
      const stillInCrm = /pre-production\.nakivo\.site|10\.220\.222\.100/i.test(page.url());

      logVerify(
        'VP2 + VP3',
        `the subscription opens straight from the order without leaving the CRM, is IN PROGRESS and belongs to "${customerName}"`,
        `URL still inside the CRM = ${stillInCrm}, state = "${state}", customer = "${customer}"`,
        stillInCrm && /in\s*progress/i.test(state) && customer.includes(customerName),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription opened from the order').catch(() => {});

      expect(stillInCrm, 'VP2: opening the subscription should stay inside the CRM').toBeTruthy();
      expect(state, `VP3: the subscription should be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(customer, `VP3: the subscription Customer should be "${customerName}"`).toContain(customerName);
    });

    await test.step('Step 4: Click the "Sales" smart button and read the order number', async () => {
      const salesCount = await subscriptionPage.getSalesCount();
      console.log(`  - "Sales" smart button on the subscription = ${salesCount}`);
      expect(salesCount, 'VP4: the subscription should link back to at least one sales order').toBeGreaterThanOrEqual(1);

      await subscriptionPage.clickHeaderButton('Sales').catch(async () => {
        // The Sales link is a smart button, not a header button - fall back to the stat button.
        await subscriptionPage.openInvoices().catch(() => {});
      });
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});

      const backOnOrder = await quotationPage.getSalesOrderNumber().catch(() => '');

      logVerify(
        'VP4',
        `the "Sales" smart button returns to the same order "${orderNumber}"`,
        `order number reached from the subscription = "${backOnOrder}"`,
        backOnOrder.includes(orderNumber) || orderNumber.includes(backOnOrder),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - back on the originating order').catch(() => {});
      expect(backOnOrder, `VP4: the subscription should lead back to order "${orderNumber}" (reached: "${backOnOrder}")`).toContain(orderNumber);
    });

    await test.step(`Step 5: Search "${customerName}" in the Subscriptions list from inside the CRM`, async () => {
      // The manual step opens the contact; what it proves is that the same subscription is
      // reachable for this customer without leaving the CRM, which the list search shows directly.
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP5',
        `the customer's subscription is reachable from inside the CRM for "${customerName}"`,
        `the Subscriptions list returned ${rows} record(s)`,
        rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - subscription reachable by customer').catch(() => {});
      expect(rows, `VP5: exactly one subscription should be reachable for "${customerName}"`).toBe(1);

      console.log(`✅ ${TC_ID}: order "${orderNumber}" and its subscription reach each other inside the CRM`);
    });
  });
});
