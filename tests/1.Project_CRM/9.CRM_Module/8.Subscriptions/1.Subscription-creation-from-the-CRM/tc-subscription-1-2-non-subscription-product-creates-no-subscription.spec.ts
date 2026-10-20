import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import { logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-1.2 - An order with no subscription product creates no subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-1.2
 *  Spec ID:         US1 (Subscription creation)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 *  Revised:         2026-10-08 - order path + VP3 measurement changed, see the two notes below
 * --------------------------------------------------------------------------------------------
 *  WHY THE PRE-CONDITION CHANGED (2026-10-08)
 *
 *  "Sales > Orders > Quotations > CREATE" cannot produce a saved order on pre-production - a
 *  server-side guard rejects any quotation not started from an Opportunity (CRM-4383 suite, 3.1).
 *  The order is now built the way subscription-1.1 proved works:
 *  deal-registration Opportunity -> Deal Element -> "New Quotation".
 *
 *  WHY VP3 IS NOW A DELTA, NOT AN ABSOLUTE COUNT
 *
 *  On the deal-registration path the order's Payer is the SHARED fixture reseller, not a unique
 *  throwaway customer - so "the Subscriptions list returns 0 rows for this customer" is no longer
 *  measurable: the reseller legitimately owns subscriptions from other runs. VP3 therefore counts
 *  that reseller's subscriptions BEFORE and AFTER the confirmation and asserts the count did not
 *  move. That is strictly stronger than the old absolute 0, not weaker.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (verification points mirror the manual case):
 *
 *  Pre-conditions:
 *    Login to pre-production as a Salesperson (e.g. Thomas Semerich)
 *    Create a deal-registration Opportunity, open its Deal Element and fill:
 *      - Pricelist     = "Public Pricelist_USD"
 *      - Payment terms = "Immediate Payment"
 *      - End User      = "Company Name Lead 1"
 *      - Product       = "[A2149B] ... Prepaid"   (NOT flagged as a subscription product)
 *      - Ordered Qty   = 1
 *    Click "New Quotation"
 *    NOTE: this product is NOT flagged as a subscription product, which is what the case checks
 *
 *  Steps to reproduce:
 *   1. Click "CONFIRM"
 *   2. Look at the smart-button row at the top right of the confirmed order
 *   3. Open Subscriptions > Subscriptions and re-count the Payer's subscriptions
 *
 *  Verification Points:
 *   VP1. The status bar moves to "SALE ORDER" - the order confirms normally
 *   VP2. No "Subscriptions" smart button is shown
 *   VP3. The Payer's subscription count is unchanged by the confirmation - no subscription was
 *        created, because the product, not the order, decides that
 *
 *  Command to run:
 *    npx playwright test --grep "subscription-1\.2:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'subscription-1.2';
const SALESPERSON = users.sale_ic_thomas;
/** A perpetual-support product - deliberately NOT flagged recurring_invoice. */
const SKU_NON_SUBSCRIPTION = 'A2149B';
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
/** The deal-registration lead's company - End User is required and does not auto-fill. */
const END_USER = 'Company Name Lead 1';
/**
 * The Payer the deal-registration path puts on the quotation. VP3 counts THIS partner's
 * subscriptions before and after. The spec asserts the quotation really carries it, so a changed
 * fixture fails loudly instead of silently counting the wrong partner.
 */
const EXPECTED_PAYER = 'TEST-Reseller#1_Automation_Test';

/** Set true only to keep the Opportunity on pre-production for a manual look. */
const SKIP_CLEANUP_OPP = false;

test.describe(`${TC_ID} - An order with no subscription product creates no subscription`, () => {

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

  test(`${TC_ID}: An order that holds only a non-subscription product confirms normally and creates no subscription`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    let subsCountBefore = 0;

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

    await test.step(`Pre-condition 2: Baseline - count "${EXPECTED_PAYER}" subscriptions BEFORE the order exists`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      subsCountBefore = await subscriptionPage.searchInListByField(EXPECTED_PAYER, 'Customer');
      console.log(`  - Baseline subscriptions for "${EXPECTED_PAYER}": ${subsCountBefore}`);
    });

    await test.step('Pre-condition 3: Open the Opportunity and click "Deal Element"', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step(`Pre-condition 4: Set Pricelist = "${PRICELIST}", Payment terms = "${PAYMENT_TERM}", End User = "${END_USER}"`, async () => {
      await dealElementPage.selectPricelist(PRICELIST);
      await dealElementPage.selectPaymentTerm(PAYMENT_TERM);
      // End User is required and does NOT auto-fill from the Payer - without it SAVE is silently
      // refused and the Deal Element stays on "New" (CRM-4383 gotcha).
      const endUser = await dealElementPage.setEndUser(END_USER);
      console.log(`  - End User      : ${endUser}`);
    });

    await test.step(`Pre-condition 5: Add the NON-subscription order line "${SKU_NON_SUBSCRIPTION}" x 1 and save`, async () => {
      await dealElementPage.addProductLine(SKU_NON_SUBSCRIPTION, 1);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);

      const added = await dealElementPage.isProductInOrderLines(SKU_NON_SUBSCRIPTION);
      expect(added, `Pre-condition: the order line for "${SKU_NON_SUBSCRIPTION}" should be present on the saved Deal Element`).toBeTruthy();
      console.log(`✓ Deal Element saved with the non-recurring product ${SKU_NON_SUBSCRIPTION} x 1`);
    });

    await test.step('Pre-condition 6: Click "New Quotation" and confirm the record really saved', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      const payer = await quotationPage.getPayerName();
      const orderNumber = await quotationPage.getSalesOrderNumber();
      console.log(`  - Quotation number : ${orderNumber}`);
      console.log(`  - Payer            : ${payer}`);

      expect(
        orderNumber,
        'Pre-condition: the quotation must be SAVED - a record still reading "New" was never written to the server',
      ).not.toMatch(/^\s*new\s*$/i);
      // VP3 counts EXPECTED_PAYER's subscriptions; if the fixture ever stops producing that Payer the
      // delta would be measured against the wrong partner, so fail here instead of measuring nonsense.
      expect(payer, `Pre-condition: VP3 measures "${EXPECTED_PAYER}" - the quotation Payer must match it`).toContain(EXPECTED_PAYER);
      console.log('✓ Quotation created and saved');
    });

    await test.step('Step 1: Click "CONFIRM"', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

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

    await test.step(`Step 3: Re-count "${EXPECTED_PAYER}" subscriptions in Subscriptions > Subscriptions`, async () => {
      await subscriptionPage.openSubscriptionsList();
      await subscriptionPage.clearSearchFacets();
      const subsCountAfter = await subscriptionPage.searchInListByField(EXPECTED_PAYER, 'Customer');

      logVerify(
        'VP3',
        `confirming the order creates no subscription - the Payer's count stays at the baseline ${subsCountBefore}`,
        `before = ${subsCountBefore}, after = ${subsCountAfter}, delta = ${subsCountAfter - subsCountBefore}`,
        subsCountAfter === subsCountBefore,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription count unchanged').catch(() => {});
      expect(
        subsCountAfter,
        `VP3: no subscription should have been created - the product, not the order, decides that ` +
        `(baseline ${subsCountBefore}, now ${subsCountAfter})`,
      ).toBe(subsCountBefore);

      console.log(`✅ ${TC_ID}: the order confirmed normally and produced no subscription`);
    });
  });
});
