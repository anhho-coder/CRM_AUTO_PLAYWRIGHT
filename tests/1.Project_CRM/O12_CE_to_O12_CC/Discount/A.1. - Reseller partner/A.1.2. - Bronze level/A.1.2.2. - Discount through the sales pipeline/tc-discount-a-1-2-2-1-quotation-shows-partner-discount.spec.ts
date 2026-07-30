import { test, expect } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.2. - Discount through the sales pipeline
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.2.1
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the partner discount is committed at the QUOTATION stage:
 *    the New Quotation's order line shows a "Partner Discount" of 15% and a "Subtotal After All
 *    Discounts" = Unit Price x 0.85, so the discounted total is what would go to approval/invoice.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.2\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: deal-registration Internal Note #1 (fresh dynamic values).
 *  Steps to reproduce (as Thomas):
 *    1-9. Create the deal-registration Opportunity (Assigned Partner = the Bronze reseller).
 *    10. Click "Deal Element".
 *    11. Set Pricelist = Public Pricelist_USD.
 *    12. Set Payment terms = Immediate Payment.
 *    13. Add a product (Product#1), Qty 1; SAVE.
 *    14. Click "New Quotation" and wait for the quotation form.
 *  Verification Point (Quotation order line):
 *    1. The line "Partner Discount" % = 15 (Bronze).
 *    2. The line "Subtotal After All Discounts" = Unit Price x (1 - 15%).
 *    3. The Quotation Total (net) = the line net subtotal (single line).
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // opp carries a Deal Element + draft Quotation -> retain (consistent w/ family)

test.describe('Discount-A.1.2.2.1 - Bronze partner discount is shown on the Quotation', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const qp = new QuotationPage(page);
      await qp.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.2.2.1: The Quotation order line shows the Bronze 15% Partner Discount', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount - Discount-A.1.2.2.1 - ${compactDateTime}`;

    // Steps 1-9: create the deal-registration Opportunity as Thomas (Assigned Partner = Bronze reseller).
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Steps to reproduce',
    });

    await test.step('Steps to reproduce - Step 10: Refresh until Company + Contact populate, then click "Deal Element"', async () => {
      const { contactFieldFound } = await opportunityPage.waitForContactFieldEquals(leadName);
      expect(contactFieldFound, 'Company + Contact should populate on the Opp').toBeTruthy();
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
    });

    await test.step('Steps to reproduce - Step 11-13: Pricelist = Public Pricelist_USD, Payment Term = Immediate Payment, add a product (Qty 1), SAVE', async () => {
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.dismissErrorDialog();
      await dealElementPage.addProduct('');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    });

    await test.step('Steps to reproduce - Step 14: Click "New Quotation" and wait for the quotation form', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Quotation created');
    });

    await test.step('Verification Point: the Quotation order line shows Partner Discount = 15% and a discounted subtotal', async () => {
      const linePartnerDiscount = await quotationPage.getLinePartnerDiscount(''); // "" -> first order line
      const lineUnitPrice = await quotationPage.getLineUnitPrice('');
      const lineNetSubtotal = await quotationPage.getLineSubtotalAfterAllDiscounts('');
      const quotationTotal = await quotationPage.getQuotationTotal();

      console.log(`  - line Partner Discount % = ${linePartnerDiscount} | Unit Price = ${lineUnitPrice} | line Net Subtotal = ${lineNetSubtotal} | Quotation Total = ${quotationTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Quotation order line discount');

      // 1. Line Partner Discount % = 15 (Bronze)
      expect(linePartnerDiscount, 'The Quotation line Partner Discount % should be 15 (Bronze)').toBeCloseTo(15, 1);
      // 2. Line net subtotal = Unit Price x 0.85 (single unit, Qty 1)
      expect(lineNetSubtotal, 'The line Subtotal After All Discounts should be Unit Price x 0.85').toBeCloseTo(lineUnitPrice * 0.85, 1);
      // 3. Quotation Total (net) = the line net subtotal (single line)
      expect(quotationTotal, 'The Quotation Total should equal the discounted line subtotal').toBeCloseTo(lineNetSubtotal, 1);
      console.log('✅ The Bronze 15% Partner Discount is committed on the Quotation');
    });
  });
});
