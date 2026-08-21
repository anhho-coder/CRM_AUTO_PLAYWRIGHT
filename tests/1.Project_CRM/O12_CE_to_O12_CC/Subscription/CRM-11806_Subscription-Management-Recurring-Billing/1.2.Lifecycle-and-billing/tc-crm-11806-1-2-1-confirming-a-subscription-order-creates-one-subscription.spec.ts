import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  SUBSCRIPTION_PRICELIST_USD,
  logVerify,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.1 - Confirming an order that holds a subscription product creates exactly one
 *                    subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.1
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
 *      - Customer  = "Cust-Create-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Ordered Qty = 50
 *    Click "SAVE" and note the quotation number (e.g. SO216758)
 *
 *  Steps to reproduce:
 *   1. Look at the smart-button row at the top right of the saved quotation
 *   2. Click "CONFIRM"
 *   3. Look at the smart-button row again
 *   4. Click the "Subscriptions" smart button to open the subscription
 *   5. Read the fields on the subscription form and the "Subscription Lines" tab
 *
 *  Verification Points:
 *   VP1. No "Subscriptions" smart button while the record is still a quotation
 *   VP2. The status bar moves to "SALE ORDER"
 *   VP3. A "Subscriptions" smart button appears and reads 1
 *   VP5. One subscription exists with Customer / IN PROGRESS / Pricelist / Salesperson /
 *        Company / Start Date = confirmation date / exactly 1 line of the ordered product x 50
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.1:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.1';
const SALESPERSON = users.sale_ic_thomas;

test.describe(`${TC_ID} - Confirming a subscription order creates exactly one subscription`, () => {
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

  test(`${TC_ID}: Confirming an order that holds a subscription product creates exactly one subscription`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const customerName = `Cust-Create-${CommonUtils.generateUniqueId()}`;
    let orderNumber = '';
    let confirmedOn = '';

    await test.step(`Pre-condition: Login to pre-production as a Salesperson (${SALESPERSON.username})`, async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALESPERSON.username, SALESPERSON.password, CommonUtils.waitTimes.login);
      console.log('✓ Logged in');
    });

    await test.step(`Pre-condition: Create the quotation for "${customerName}" with ${SKU_ENT_MONTHLY} x 50`, async () => {
      await quotationPage.openNewQuotationForm();
      await quotationPage.selectCustomerOnNewQuotation(customerName);
      console.log(`  - Customer  : ${customerName}`);
      console.log(`  - Pricelist : ${SUBSCRIPTION_PRICELIST_USD} (quotation default)`);
      await quotationPage.addOrderLineBySku(SKU_ENT_MONTHLY, 50);
      await quotationPage.clickSaveButton();
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation saved');
    });

    await test.step('Step 1: Look at the smart-button row while the record is still a quotation', async () => {
      const hasButton = await quotationPage.hasSubscriptionsSmartButton();

      logVerify(
        'VP1',
        'no "Subscriptions" smart button is shown while the record is still a quotation',
        `"Subscriptions" smart button present = ${hasButton}`,
        hasButton === false,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - quotation before confirm').catch(() => {});
      expect(hasButton, 'VP1: a quotation must not offer a "Subscriptions" smart button - the subscription only exists once the order is confirmed').toBeFalsy();
    });

    await test.step('Step 2: Click "CONFIRM"', async () => {
      confirmedOn = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}/${new Date().getFullYear()}`;
      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      orderNumber = await quotationPage.getSalesOrderNumber();

      logVerify(
        'VP2',
        'the status bar moves to "SALE ORDER"',
        `status bar = "${status}", order number = "${orderNumber}"`,
        /sale\s*order/i.test(status),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - order confirmed').catch(() => {});
      expect(status, `VP2: the confirmed record should be a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);
    });

    await test.step('Step 3: Look at the smart-button row again', async () => {
      const hasButton = await quotationPage.hasSubscriptionsSmartButton();

      logVerify(
        'VP3',
        'a "Subscriptions" smart button appears on the confirmed order',
        `"Subscriptions" smart button present = ${hasButton}`,
        hasButton === true,
      );

      expect(hasButton, 'VP3: the confirmed order should offer a "Subscriptions" smart button').toBeTruthy();
    });

    await test.step('Step 4-5: Open the subscription and read its fields and lines', async () => {
      await quotationPage.clickSubscriptionsSmartButton();
      await subscriptionPage.waitForLoaded();

      const state = await subscriptionPage.getState();
      const customer = await subscriptionPage.getCustomer();
      const pricelist = await subscriptionPage.getPricelist();
      const salesperson = await subscriptionPage.getSalesperson();
      const startDate = await subscriptionPage.getStartDate();
      const lineCount = await subscriptionPage.getLineCount();
      const lineProduct = await subscriptionPage.getLineProduct();
      const lineQuantity = await subscriptionPage.getLineQuantity();

      logVerify(
        'VP5',
        `one subscription for "${customerName}", IN PROGRESS, Pricelist "${SUBSCRIPTION_PRICELIST_USD}", Salesperson ${SALESPERSON.username}, Start Date ${confirmedOn}, exactly 1 line of ${SKU_ENT_MONTHLY} x 50`,
        `state = "${state}", customer = "${customer}", pricelist = "${pricelist}", salesperson = "${salesperson}", start date = "${startDate}", lines = ${lineCount}, line product = "${lineProduct}", line qty = ${lineQuantity}`,
        /in\s*progress/i.test(state) && customer.includes(customerName) && lineCount === 1 && lineProduct.includes(SKU_ENT_MONTHLY) && lineQuantity === 50,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the subscription created by the order').catch(() => {});

      expect(state, `VP5: the new subscription should be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(customer, `VP5: the subscription Customer should be "${customerName}"`).toContain(customerName);
      expect(pricelist, `VP5: the subscription Pricelist should be "${SUBSCRIPTION_PRICELIST_USD}"`).toContain('Public Pricelist_USD');
      expect(salesperson, 'VP5: the subscription should carry a Salesperson').not.toBe('');
      expect(startDate, `VP5: the Start Date should be the confirmation date ${confirmedOn}`).toContain(confirmedOn);
      expect(lineCount, 'VP5: the subscription should hold exactly 1 Subscription Line').toBe(1);
      expect(lineProduct, `VP5: the line product should be ${SKU_ENT_MONTHLY}`).toContain(SKU_ENT_MONTHLY);
      expect(lineQuantity, 'VP5: the line Quantity should be 50').toBe(50);

      console.log(`✅ ${TC_ID}: order "${orderNumber}" created exactly one subscription with the ordered line`);
    });
  });
});
