import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import { SKU_ENT_MONTHLY, SKU_O365, logVerify } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-1.3 - Two subscription products on one order land on ONE subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-1.3
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
 *    npx playwright test --grep "subscription-1\.3:" --project=chromium
 * ============================================================================================
 */

/**
 * WHY THE PRE-CONDITION CHANGED (2026-10-08)
 *
 * "Sales > Orders > Quotations > CREATE" cannot produce a saved order on pre-production - a
 * server-side guard rejects any quotation not started from an Opportunity (CRM-4383 suite, 3.1).
 * The order is now built the way subscription-1.1 proved works:
 * deal-registration Opportunity -> Deal Element (both lines) -> "New Quotation" -> CONFIRM.
 * VP2 / VP4 / VP5 are unchanged - only the route to a saved order is.
 *
 * NOTE FOR THE MASTER FILE: the pre-condition text of this TC must be re-worded to match.
 */
const TC_ID = 'subscription-1.3';
const SALESPERSON = users.sale_ic_thomas;
/**
 * The bare SKU "CP-NC-PM-ENT" matches BOTH the "min 20Ent" and "min 50Ent" variants and an unpinned
 * .first() picks whichever Odoo lists first, so the full display name is pinned for the line we add.
 */
const PRODUCT_ENT_FULL_NAME = '[CP-NC-PM-ENT] min 20Ent Machines, 1Month Subscription';
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
/** The deal-registration lead's company - End User is required and does not auto-fill. */
const END_USER = 'Company Name Lead 1';

/** Set true only to keep the Opportunity on pre-production for a manual look. */
const SKIP_CLEANUP_OPP = false;

test.describe(`${TC_ID} - Two subscription lines land on one subscription`, () => {

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

  test(`${TC_ID}: Two subscription products on one order produce a single subscription holding both lines`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

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

    await test.step(`Pre-condition 3: Set Pricelist = "${PRICELIST}", Payment terms = "${PAYMENT_TERM}", End User = "${END_USER}"`, async () => {
      await dealElementPage.selectPricelist(PRICELIST);
      await dealElementPage.selectPaymentTerm(PAYMENT_TERM);
      // End User is required and does NOT auto-fill from the Payer - without it SAVE is silently
      // refused and the Deal Element stays on "New" (CRM-4383 gotcha).
      const endUser = await dealElementPage.setEndUser(END_USER);
      console.log(`  - End User      : ${endUser}`);
    });

    await test.step(`Pre-condition 4: Add BOTH subscription lines - "${PRODUCT_ENT_FULL_NAME}" x 50 and ${SKU_O365} x 100`, async () => {
      await dealElementPage.addProductLine(PRODUCT_ENT_FULL_NAME, 50);
      await dealElementPage.addProductLine(SKU_O365, 100);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);

      const hasEnt = await dealElementPage.isProductInOrderLines(SKU_ENT_MONTHLY);
      const hasO365 = await dealElementPage.isProductInOrderLines(SKU_O365);
      expect(hasEnt, `Pre-condition: the ${SKU_ENT_MONTHLY} order line should be present on the saved Deal Element`).toBeTruthy();
      expect(hasO365, `Pre-condition: the ${SKU_O365} order line should be present on the saved Deal Element`).toBeTruthy();
      console.log(`✓ Deal Element saved with ${SKU_ENT_MONTHLY} x 50 and ${SKU_O365} x 100`);
    });

    await test.step('Pre-condition 5: Click "New Quotation" and confirm the record really saved', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      const orderNumber = await quotationPage.getSalesOrderNumber();
      console.log(`  - Quotation number : ${orderNumber}`);
      expect(
        orderNumber,
        'Pre-condition: the quotation must be SAVED - a record still reading "New" was never written to the server',
      ).not.toMatch(/^\s*new\s*$/i);
      console.log('✓ Quotation created and saved');
    });

    await test.step('Step 1-2: Click "CONFIRM" and read the "Subscriptions" smart button', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

      const status = await quotationPage.getQuotationStatus();
      const hasButton = await quotationPage.hasSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);

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
      await quotationPage.clickSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);
      await subscriptionPage.waitForLoaded(CommonUtils.waitTimes.pageLoad);

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
