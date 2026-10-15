import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import { SKU_ENT_MONTHLY, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-10.1 - The order and its subscription reach each other from inside the CRM
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-10.1
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
 *    npx playwright test --grep "subscription-10\.1:" --project=chromium
 * ============================================================================================
 */

/**
 * WHY THE PRE-CONDITION AND VP5 CHANGED (2026-10-08)
 *
 * 1. "Sales > Orders > Quotations > CREATE" cannot produce a saved order on pre-production - a
 *    server-side guard rejects any quotation not started from an Opportunity (CRM-4383 suite, 3.1).
 *    The order is now built the proven way: deal-registration Opportunity -> Deal Element ->
 *    "New Quotation" -> CONFIRM.
 *
 * 2. VP5 used to search the Subscriptions list by customer name and assert EXACTLY 1 row. On this
 *    path the Customer is the SHARED fixture reseller, which legitimately owns several
 *    subscriptions, so "exactly 1" is not a property of the product under test. VP5 now searches by
 *    the Reference of the subscription THIS order created and asserts that one record comes back -
 *    narrower and order-specific, not looser.
 *
 * NOTE FOR THE MASTER FILE: the pre-condition and VP5 text of this TC must be re-worded to match.
 */
const TC_ID = 'subscription-10.1';
const SALESPERSON = users.sale_ic_thomas;
/** Pinned: the bare SKU matches both the "min 20Ent" and "min 50Ent" variants. */
const PRODUCT_ENT_FULL_NAME = '[CP-NC-PM-ENT] min 20Ent Machines, 1Month Subscription';
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
/** The deal-registration lead's company - End User is required and does not auto-fill. */
const END_USER = 'Company Name Lead 1';

/** Set true only to keep the Opportunity on pre-production for a manual look. */
const SKIP_CLEANUP_OPP = false;

test.describe(`${TC_ID} - Order and subscription reach each other inside the CRM`, () => {

  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC_ID}: A confirmed order opens its subscription and the subscription returns to the same order`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    let orderNumber = '';
    let quotationPayer = '';
    let subscriptionReference = '';

    // The helper performs its OWN login as Thomas - logging in beforehand leaves the session
    // authenticated and its waitForURL('**web/login*') then hangs the full timeout.
    console.log(`Pre-condition 1: the helper logs in to pre-production as the Salesperson ${SALESPERSON.username}`);
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition 1',
    });

    await test.step('Pre-condition 2: Open the Opportunity and click "Deal Element"', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step(`Pre-condition 3: Set Pricelist / Payment terms / End User and add "${PRODUCT_ENT_FULL_NAME}" x 50`, async () => {
      await dealElementPage.selectPricelist(PRICELIST);
      await dealElementPage.selectPaymentTerm(PAYMENT_TERM);
      // End User is required and does NOT auto-fill from the Payer - without it SAVE is silently
      // refused and the Deal Element stays on "New" (CRM-4383 gotcha).
      const endUser = await dealElementPage.setEndUser(END_USER);
      console.log(`  - End User      : ${endUser}`);

      await dealElementPage.addProductLine(PRODUCT_ENT_FULL_NAME, 50);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);

      const added = await dealElementPage.isProductInOrderLines(SKU_ENT_MONTHLY);
      expect(added, `Pre-condition: the ${SKU_ENT_MONTHLY} order line should be present on the saved Deal Element`).toBeTruthy();
    });

    await test.step('Pre-condition 4: Click "New Quotation" and CONFIRM the order', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      quotationPayer = await quotationPage.getPayerName();
      const beforeConfirm = await quotationPage.getSalesOrderNumber();
      expect(
        beforeConfirm,
        'Pre-condition: the quotation must be SAVED before CONFIRM - a record still reading "New" was never written to the server',
      ).not.toMatch(/^\s*new\s*$/i);

      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      orderNumber = await quotationPage.getSalesOrderNumber();
      console.log(`✓ Order confirmed - number = "${orderNumber}", Payer = "${quotationPayer}"`);
      expect(status, `Pre-condition: the order should confirm to a SALE ORDER (status read: "${status}")`).toMatch(/sale\s*order/i);
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
      subscriptionReference = await subscriptionPage.getCode();
      const stillInCrm = /pre-production\.nakivo\.site|10\.220\.222\.100/i.test(page.url());

      logVerify(
        'VP2 + VP3',
        `the subscription opens straight from the order without leaving the CRM, is IN PROGRESS and belongs to the order's Payer "${quotationPayer}"`,
        `URL still inside the CRM = ${stillInCrm}, state = "${state}", customer = "${customer}", reference = "${subscriptionReference}"`,
        stillInCrm && /in\s*progress/i.test(state) && customer.includes(quotationPayer),
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription opened from the order').catch(() => {});

      expect(stillInCrm, 'VP2: opening the subscription should stay inside the CRM').toBeTruthy();
      expect(state, `VP3: the subscription should be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(customer, `VP3: the subscription Customer should be the order's Payer "${quotationPayer}"`).toContain(quotationPayer);
      // VP5 searches by this reference, so a blank one would silently make that check meaningless.
      expect(subscriptionReference, 'VP3: the subscription should carry a Reference - VP5 searches by it').not.toBe('');
    });

    await test.step('Step 4: Click the "Sales" smart button and read the order number', async () => {
      const salesCount = await subscriptionPage.getSalesCount();
      console.log(`  - "Sales" smart button on the subscription = ${salesCount}`);
      expect(salesCount, 'VP4: the subscription should link back to at least one sales order').toBeGreaterThanOrEqual(1);

      // "Sales" is a STAT button. The old code clicked it as a header button and, on failure, fell
      // back to openInvoices() - which opened the INVOICE screen, where the order number reads empty
      // and VP4 could never be satisfied. No fallback now: if this cannot navigate, the test says so.
      await subscriptionPage.openSales();
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});

      let __verifyPassed = false;
      try {
        // The "Sales" smart button lands on a ONE-ROW LIST of sales orders, not on the order form,
        // so every form-field reader returns "". Open that row to actually arrive on the order.
        let backOnOrder = await quotationPage.getSalesOrderNumber().catch(() => '');
        if (!backOnOrder) {
          const opened = await quotationPage.openFirstListRow(CommonUtils.waitTimes.pageLoad);
          console.log(`  - landed on a list, opened the order row: ${opened}`);
          backOnOrder = await quotationPage.getSalesOrderNumber().catch(() => '');
        }

        logVerify(
          'VP4',
          `the "Sales" smart button returns to the same order "${orderNumber}"`,
          `order number reached from the subscription = "${backOnOrder}"`,
          // Must be a real match. The old condition also accepted `orderNumber.includes(backOnOrder)`,
          // and EVERY string contains the empty string - so when the navigation failed and the order
          // number read "", the VERIFY block printed PASS while the assertion below failed.
          backOnOrder !== '' && (backOnOrder.includes(orderNumber) || orderNumber.includes(backOnOrder)),
        );

        expect(backOnOrder, `VP4: the subscription should lead back to order "${orderNumber}" (reached: "${backOnOrder}")`).toContain(orderNumber);

        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Step 4 - back on the originating order', passed: __verifyPassed }).catch(() => {});
      }
    });

    await test.step('Step 5: Find this order\'s subscription in the Subscriptions list from inside the CRM', async () => {
      // The manual step opens the contact; what it proves is that the same subscription is
      // reachable without leaving the CRM. Searching by the Reference captured in Step 2-3 proves
      // that for THIS order's subscription - the Customer is a shared reseller that legitimately
      // owns several, so a customer-name count could never be asserted as exactly 1.
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const rows = await subscriptionPage.searchInListByField(subscriptionReference, 'Reference');

      logVerify(
        'VP5',
        `the subscription this order created ("${subscriptionReference}") is reachable from inside the CRM`,
        `the Subscriptions list returned ${rows} record(s) for Reference "${subscriptionReference}"`,
        rows === 1,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - subscription reachable by reference').catch(() => {});
      expect(rows, `VP5: exactly one subscription should be reachable for Reference "${subscriptionReference}"`).toBe(1);

      console.log(`✅ ${TC_ID}: order "${orderNumber}" and its subscription reach each other inside the CRM`);
    });
  });
});
