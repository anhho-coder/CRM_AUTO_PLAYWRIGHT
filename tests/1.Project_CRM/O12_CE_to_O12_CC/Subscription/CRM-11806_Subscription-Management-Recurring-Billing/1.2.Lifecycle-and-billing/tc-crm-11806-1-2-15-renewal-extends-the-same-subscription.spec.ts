import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  createSubscription,
  dayDiff,
  loginAsCrmAdmin,
  logVerify,
  monthsFromTodayMMDDYYYY,
  parseMMDDYYYY,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.2.15 - A renewal extends the SAME subscription, it does not create a second one
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2.15
 *  Spec ID:         US8 (Renewal)
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
 *    Create the subscription "Cust-Renew-<unique>" / Public Pricelist_USD (USD) /
 *      "Monthly Sub/Invoice only" / Start Date today / End Date = today plus 1 month /
 *      To Renew ticked, with one line
 *      "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" x 50
 *    Click "SAVE", click "IN PROGRESS"
 *    Write down the Reference and the End Date
 *    NOTE: "Create A Renewal Quotation" is hidden unless the subscription has an End Date or
 *          "To Renew" is ticked
 *
 *  Steps to reproduce:
 *   1. Click "Create A Renewal Quotation" in the subscription header
 *   2. On the created quotation read the Customer and the "Order Lines" tab
 *   3. Click "CONFIRM"
 *   4. Go back to the subscription and read its End Date and status bar
 *   5. Open Subscriptions > Subscriptions, search "Cust-Renew-<unique>" and count the records
 *
 *  Verification Points:
 *   VP2. The renewal quotation carries the same Customer and the same product line
 *   VP4. The original subscription is extended and still live: IN PROGRESS and a later End Date
 *   VP5. Exactly 1 subscription exists - the renewal created no second one
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2\.15:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2.15';

test.describe(`${TC_ID} - A renewal extends the same subscription`, () => {
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

  test(`${TC_ID}: Confirming a renewal quotation extends the original subscription instead of creating a second one`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const quotationPage = new QuotationPage(page);

    const customerName = `Cust-Renew-${CommonUtils.generateUniqueId()}`;
    const today = todayMMDDYYYY();
    const endDate = monthsFromTodayMMDDYYYY(1);
    let reference = '';
    let endDateBefore = '';
    let subscriptionUrl = '';

    await loginAsCrmAdmin(page);

    const setup = await createSubscription(page, {
      customerName,
      template: TEMPLATE_MONTHLY_INVOICE_ONLY,
      productSku: SKU_ENT_MONTHLY,
      quantity: 50,
      startDate: today,
    });
    reference = setup.reference;

    await test.step(`Pre-condition: Set End Date = ${endDate} and tick "To Renew", then move to IN PROGRESS`, async () => {
      await subscriptionPage.clickEdit();
      await subscriptionPage.setDateField('date', endDate);
      await subscriptionPage.setCheckbox('to_renew', true);
      await subscriptionPage.save();
      await subscriptionPage.waitForLoaded();

      await subscriptionPage.setStage('In Progress');
      await subscriptionPage.waitForLoaded();

      endDateBefore = await subscriptionPage.getEndDate();
      subscriptionUrl = page.url();
      console.log(`Pre-condition: Reference = "${reference}", End Date before the renewal = "${endDateBefore}"`);
      expect(endDateBefore, 'Pre-condition: the subscription should carry an End Date so the renewal button is offered').not.toBe('');
    });

    await test.step('Step 1: Click "Create A Renewal Quotation"', async () => {
      const visible = await subscriptionPage.isHeaderButtonVisible('Create A Renewal Quotation');
      console.log(`  - "Create A Renewal Quotation" visible: ${visible}`);
      expect(visible, 'Step 1: with an End Date set and "To Renew" ticked, the renewal button should be offered').toBeTruthy();

      await subscriptionPage.clickHeaderButton('Create A Renewal Quotation');
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - renewal quotation created').catch(() => {});
    });

    await test.step('Step 2: Read the Customer and the "Order Lines" tab on the renewal quotation', async () => {
      const payer = await quotationPage.getPayerName();
      const unitPrice = await quotationPage.getLineUnitPrice(SKU_ENT_MONTHLY);

      logVerify(
        'VP2',
        `the renewal quotation carries the same Customer ("${customerName}") and the same product line (${SKU_ENT_MONTHLY})`,
        `quotation customer = "${payer}", ${SKU_ENT_MONTHLY} unit price on the quotation = ${unitPrice}`,
        payer.includes(customerName) && unitPrice > 0,
      );

      expect(payer, `VP2: the renewal quotation should be for "${customerName}" (read: "${payer}")`).toContain(customerName);
      expect(unitPrice, `VP2: the renewal quotation should carry the ${SKU_ENT_MONTHLY} line from the subscription`).toBeGreaterThan(0);
    });

    await test.step('Step 3: Click "CONFIRM" on the renewal quotation', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      console.log(`Step 3: renewal quotation status after CONFIRM = "${status}"`);
      expect(status, `Step 3: the renewal quotation should confirm to a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - renewal order confirmed').catch(() => {});
    });

    await test.step('Step 4: Go back to the subscription and read its End Date and status bar', async () => {
      await subscriptionPage.openByUrl(subscriptionUrl);

      const state = await subscriptionPage.getState();
      const endDateAfter = await subscriptionPage.getEndDate();

      const before = parseMMDDYYYY(endDateBefore);
      const after = parseMMDDYYYY(endDateAfter);
      const extended = !!(before && after && dayDiff(after, before) > 0);

      logVerify(
        'VP4',
        `the original subscription is extended and still live: IN PROGRESS and an End Date later than "${endDateBefore}"`,
        `state = "${state}", End Date = "${endDateAfter}" (was "${endDateBefore}")`,
        /in\s*progress/i.test(state) && extended,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - subscription extended').catch(() => {});

      expect(state, `VP4: the renewed subscription should still be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(after, `VP4: the End Date should still be readable after the renewal (read: "${endDateAfter}")`).not.toBeNull();
      expect(extended, `VP4: the End Date should move later than "${endDateBefore}", but it reads "${endDateAfter}"`).toBeTruthy();
    });

    await test.step(`Step 5: Search "${customerName}" and count the subscriptions`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInList(customerName);

      logVerify(
        'VP5',
        `exactly 1 subscription exists for "${customerName}" - the renewal did not create a second one`,
        `the list returned ${rows} record(s)`,
        rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - still only one subscription').catch(() => {});
      expect(rows, `VP5: renewing must not create a second subscription for "${customerName}"`).toBe(1);

      console.log(`✅ ${TC_ID}: the renewal extended subscription "${reference}" instead of creating a new one`);
    });
  });
});
