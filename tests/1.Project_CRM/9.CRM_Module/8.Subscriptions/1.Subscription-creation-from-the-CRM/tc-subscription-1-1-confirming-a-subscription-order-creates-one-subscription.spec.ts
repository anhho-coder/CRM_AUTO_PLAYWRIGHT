import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, SubscriptionPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';
import {
  SKU_ENT_MONTHLY,
  SUBSCRIPTION_PRICELIST_USD,
  logVerify,
} from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  subscription-1.1 - Confirming an order that holds a subscription product creates exactly one
 *                    subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    subscription-1.1
 *  Spec ID:         US1 (Subscription creation)
 *  Spec:            [FRD] Subscription Management (Recurring Billing)
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222528736
 *  Jira:            CRM-12188 (FRD review) / CRM-11806 (feature)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-19
 *  Revised:         2026-10-08 - order-creation path changed, see "WHY THE PRE-CONDITION CHANGED"
 * --------------------------------------------------------------------------------------------
 *  WHY THE PRE-CONDITION CHANGED (2026-10-08)
 *
 *  The manual TC's pre-condition reads "Open Sales > Orders > Quotations and click CREATE".
 *  That path CANNOT produce a saved order on pre-production: a server-side guard rejects any
 *  quotation not started from an Opportunity (verified by the CRM-4383 suite, spec 3.1).
 *
 *  Before this revision the spec typed a brand-new unique Customer name into the many2one; the
 *  page object skips the "Create ..." autocomplete entries, so for a name that does not exist yet
 *  NOTHING was ever selected. SAVE was then refused on 6 invalid required fields and the record
 *  stayed "New" - yet the spec logged "Quotation saved" and failed later at CONFIRM, which made
 *  the failure look like a CONFIRM defect. It was not.
 *
 *  This spec now builds the order the way the product actually allows, mirroring the proven path
 *  in subscription-1.4: Opportunity (deal registration) -> Deal Element -> New Quotation.
 *  The verification points VP1/VP2/VP3/VP5 are unchanged - only the route to a saved order is.
 *
 *  NOTE FOR THE MASTER FILE: the pre-condition text of this TC must be re-worded to match.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (verification points mirror the manual case):
 *
 *  Pre-conditions:
 *    Login to pre-production as a Salesperson (e.g. Thomas Semerich)
 *    Create a deal-registration Opportunity, open its Deal Element and fill:
 *      - Pricelist     = "Public Pricelist_USD"
 *      - Payment terms = "Immediate Payment"
 *      - Product       = "[CP-NC-PM-ENT] min 20Ent Machines, 1Month Subscription"
 *      - Ordered Qty   = 50
 *    Click "New Quotation" and note the quotation number
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
 *   VP3. A "Subscriptions" smart button appears on the confirmed order
 *   VP5. One subscription exists with Customer / IN PROGRESS / Pricelist / Salesperson /
 *        Start Date = confirmation date / exactly 1 line of the ordered product x 50
 *
 *  Command to run:
 *    npx playwright test --project=CRM_Module tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/1.Subscription-creation-from-the-CRM/tc-subscription-1-1-confirming-a-subscription-order-creates-one-subscription.spec.ts
 * ============================================================================================
 */

const TC_ID = 'subscription-1.1';
const SALESPERSON = users.sale_ic_thomas;

/**
 * The exact subscription product this TC orders. The bare SKU "CP-NC-PM-ENT" matches BOTH the
 * "min 20Ent" and the "min 50Ent" variants, and an unpinned .first() silently picked whichever
 * Odoo listed first - so the full display name is pinned here.
 */
const PRODUCT_FULL_NAME = '[CP-NC-PM-ENT] min 20Ent Machines, 1Month Subscription';
const PRICELIST = 'Public Pricelist_USD';
const PAYMENT_TERM = 'Immediate Payment';
/** The deal-registration lead's company - the end customer behind the reseller's registration. */
const END_USER = 'Company Name Lead 1';
const EXPECTED_QTY = 50;

/**
 * Set true only to keep the Opportunity on pre-production for a manual look.
 *
 * TEMPORARILY true (2026-10-08): the tester is collecting evidence from the created records to file
 * a bug. SET IT BACK TO false once that evidence is captured - a spec that leaves its Opportunity
 * behind on every run is a leftover generator.
 */
const SKIP_CLEANUP_OPP = true;

test.describe(`${TC_ID} - Confirming a subscription order creates exactly one subscription`, () => {

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

  test(`${TC_ID}: Confirming an order that holds a subscription product creates exactly one subscription`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const subscriptionPage = new SubscriptionPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ${TC_ID} ${compactDateTime}`;

    let orderNumber = '';
    let confirmedOn = '';
    let quotationPayer = '';

    // The contiguous Opportunity-create block is setup, not what this TC verifies. The helper does
    // its OWN login as Thomas - logging in here first would leave the session authenticated, Odoo
    // would redirect away from /web/login, and the helper's waitForURL('**web/login*') would hang
    // the full 240 s.
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
      // End User is required and does NOT auto-fill from the Payer - without it SAVE is refused and
      // the Deal Element silently stays on "New" (CRM-4383 gotcha).
      const endUser = await dealElementPage.setEndUser(END_USER);
      console.log(`  - Pricelist     : ${PRICELIST}`);
      console.log(`  - Payment terms : ${PAYMENT_TERM}`);
      console.log(`  - End User      : ${endUser}`);
    });

    await test.step(`Pre-condition 4: Add the order line "${PRODUCT_FULL_NAME}" x ${EXPECTED_QTY} and save`, async () => {
      await dealElementPage.addProductLine(PRODUCT_FULL_NAME, EXPECTED_QTY);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);

      const added = await dealElementPage.isProductInOrderLines(SKU_ENT_MONTHLY);
      expect(added, `Pre-condition: the order line for "${PRODUCT_FULL_NAME}" should be present on the saved Deal Element`).toBeTruthy();
      console.log(`✓ Deal Element saved with "${PRODUCT_FULL_NAME}" x ${EXPECTED_QTY}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - Deal Element saved with the subscription product').catch(() => {});
    });

    await test.step('Pre-condition 5: Click "New Quotation" and note the quotation', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});

      quotationPayer = await quotationPage.getPayerName();
      const statusBeforeConfirm = await quotationPage.getQuotationStatus();
      orderNumber = await quotationPage.getSalesOrderNumber();

      console.log(`  - Quotation number : ${orderNumber}`);
      console.log(`  - Payer            : ${quotationPayer}`);
      console.log(`  - Status           : ${statusBeforeConfirm}`);

      // The point of the revision: prove the record really is saved before CONFIRM is pressed.
      expect(quotationPayer, 'Pre-condition: the quotation should carry a Payer').not.toBe('');
      expect(
        orderNumber,
        'Pre-condition: the quotation must be SAVED before CONFIRM - a record still reading "New" was never written to the server',
      ).not.toMatch(/^\s*new\s*$/i);
      console.log('✓ Quotation created and saved');
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
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry().catch(() => {});
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

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
      const hasButton = await quotationPage.hasSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);

      logVerify(
        'VP3',
        'a "Subscriptions" smart button appears on the confirmed order',
        `"Subscriptions" smart button present = ${hasButton}`,
        hasButton === true,
      );

      expect(hasButton, 'VP3: the confirmed order should offer a "Subscriptions" smart button').toBeTruthy();
    });

    await test.step('Step 4-5: Open the subscription and read its fields and lines', async () => {
      await quotationPage.clickSubscriptionsSmartButton(CommonUtils.waitTimes.pageLoad);
      await subscriptionPage.waitForLoaded(CommonUtils.waitTimes.pageLoad);

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
        `one subscription for "${quotationPayer}", IN PROGRESS, Pricelist "${SUBSCRIPTION_PRICELIST_USD}", a Salesperson, Start Date ${confirmedOn}, exactly 1 line of "${PRODUCT_FULL_NAME}" x ${EXPECTED_QTY}`,
        `state = "${state}", customer = "${customer}", pricelist = "${pricelist}", salesperson = "${salesperson}", start date = "${startDate}", lines = ${lineCount}, line product = "${lineProduct}", line qty = ${lineQuantity}`,
        /in\s*progress/i.test(state) && customer.includes(quotationPayer) && lineCount === 1 && lineProduct.includes(SKU_ENT_MONTHLY) && lineQuantity === EXPECTED_QTY,
      );

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the subscription created by the order').catch(() => {});

      expect(state, `VP5: the new subscription should be IN PROGRESS (state read: "${state}")`).toMatch(/in\s*progress/i);
      expect(customer, `VP5: the subscription Customer should be the order's Payer "${quotationPayer}"`).toContain(quotationPayer);
      expect(pricelist, `VP5: the subscription Pricelist should be "${PRICELIST}"`).toContain(PRICELIST);
      expect(salesperson, 'VP5: the subscription should carry a Salesperson').not.toBe('');
      expect(startDate, `VP5: the Start Date should be the confirmation date ${confirmedOn}`).toContain(confirmedOn);
      expect(lineCount, 'VP5: the subscription should hold exactly 1 Subscription Line').toBe(1);
      expect(lineProduct, `VP5: the line product should be "${PRODUCT_FULL_NAME}"`).toContain(SKU_ENT_MONTHLY);
      expect(lineQuantity, `VP5: the line Quantity should be ${EXPECTED_QTY}`).toBe(EXPECTED_QTY);

      console.log(`✅ ${TC_ID}: order "${orderNumber}" created exactly one subscription with the ordered line`);
    });
  });
});
