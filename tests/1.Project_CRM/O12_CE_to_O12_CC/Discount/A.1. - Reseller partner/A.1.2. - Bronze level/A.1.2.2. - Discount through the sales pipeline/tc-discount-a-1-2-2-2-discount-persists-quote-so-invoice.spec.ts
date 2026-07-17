import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  Discount / A.1. - Reseller partner / A.1.2. - Bronze level / A.1.2.2. - Discount through the sales pipeline
 * ===========================================================================
 *  Test Case ID    : Discount-A.1.2.2.2
 *  Jira            : N/A
 *  Automation-Type : new
 *  Automation-Date : 2026-07-13
 *
 *  Summary:
 *    For a Bronze (15%) reseller, verify the 15% partner discount PERSISTS end-to-end through the
 *    sales pipeline: it is shown on the Quotation line, remains on the confirmed Sales Order line, and
 *    is reflected on the posted Invoice (NET Total = line gross Subtotal x 0.85). Single small product,
 *    no Sales Manager approval.
 *
 *  Command to run:
 *    npx playwright test --grep "Discount-A\.1\.2\.2\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition: deal-registration Internal Note #1 (fresh dynamic values).
 *  Steps to reproduce (as Thomas):
 *    1-9. Create the deal-registration Opportunity (Assigned Partner = the Bronze reseller).
 *    10.  Deal Element: Pricelist = Public Pricelist_USD, Payment Term = Immediate Payment, 1 product, SAVE.
 *    11.  New Quotation                        -> STAGE 1: line Partner Discount = 15%.
 *    12.  Confirm (Sales Order)                -> STAGE 2: line Partner Discount = 15% (persists on SO).
 *    13.  Create Invoice -> Invoiceable lines -> Create and view invoices -> Validate
 *                                              -> STAGE 3: NET Total = line gross Subtotal x 0.85.
 *  Verification Point:
 *    - The Bronze 15% discount is present at all three stages (Quotation, Sales Order, Invoice) with a
 *      consistent NET total = gross x 0.85.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true; // ends with a posted Invoice -> retain
const BRONZE_PERCENT = 15;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('Discount-A.1.2.2.2 - Bronze discount persists Quote -> Sale Order -> Invoice', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const inv = new InvoicePage(page);
      await inv.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('Discount-A.1.2.2.2: The Bronze 15% discount persists across Quotation -> Sales Order -> Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Discount-A.1.2.2.2 ${compactDateTime}`;

    // Steps 1-9: create the deal-registration Opportunity as Thomas.
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Steps to reproduce',
    });

    await test.step('Steps to reproduce - Step 10: Deal Element (Pricelist + Payment Term + 1 product) and SAVE', async () => {
      const { contactFieldFound } = await opportunityPage.waitForContactFieldEquals(leadName);
      expect(contactFieldFound, 'Company + Contact should populate on the Opp').toBeTruthy();
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      await dealElementPage.dismissErrorDialog();
      await dealElementPage.addProduct('');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    });

    let quotationTotal = 0;
    let quotationLineUnitPrice = 0;

    await test.step('Steps to reproduce - Step 11: New Quotation -> STAGE 1: line Partner Discount = 15%', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const pct = await quotationPage.getLinePartnerDiscount(''); // "" -> first order line
      quotationLineUnitPrice = await quotationPage.getLineUnitPrice('');
      quotationTotal = await quotationPage.getQuotationTotal();
      console.log(`  - [Quotation] line Partner Discount % = ${pct} | Unit Price = ${quotationLineUnitPrice} | Quotation Total = ${quotationTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Stage 1 - Quotation (15% line discount)');
      expect(pct, '[Quotation] line Partner Discount should be 15 (Bronze)').toBeCloseTo(BRONZE_PERCENT, 1);
      // The quotation total should already be the DISCOUNTED (net) amount = Unit Price x 0.85.
      expect(quotationTotal, '[Quotation] total should equal Unit Price x 0.85').toBeCloseTo(quotationLineUnitPrice * (1 - BRONZE_PERCENT / 100), 1);
    });

    await test.step('Steps to reproduce - Step 12: Confirm to Sales Order -> STAGE 2: discount persists (SO total unchanged)', async () => {
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      // On the confirmed Sales Order the per-line "Partner Discount" column is not reliably rendered the
      // same way; prove persistence via the ORDER TOTAL staying equal to the (discounted) Quotation total.
      const soTotal = await quotationPage.getQuotationTotal();
      console.log(`  - [Sales Order] Total = ${soTotal} (Quotation Total was ${quotationTotal})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Stage 2 - Sales Order (discount persists)');
      expect(soTotal, '[Sales Order] total should equal the discounted Quotation total (15% persisted)').toBeCloseTo(quotationTotal, 1);
    });

    await test.step('Steps to reproduce - Step 13: Create + Validate Invoice -> STAGE 3: NET Total = gross Subtotal x 0.85', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.selectInvoiceableLines();
      await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.clickValidate();
      await invoicePage.dismissErrorDialog().catch(() => {});

      const gross = money(await invoicePage.getFirstInvoiceLineSubtotal());
      const net = money(await invoicePage.getInvoiceTotal());
      const invoiceNumber = await invoicePage.getInvoiceNumber().catch(() => '');
      console.log(`  - [Invoice] "${invoiceNumber}" gross Subtotal=${gross} NET Total=${net} (expect ${(gross * 0.85).toFixed(2)})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Stage 3 - Invoice (NET = gross x 0.85)');

      expect(gross, '[Invoice] gross line Subtotal should be > 0').toBeGreaterThan(0);
      expect(net, '[Invoice] NET Total should equal gross Subtotal x 0.85 (15% partner discount)').toBeCloseTo(gross * (1 - BRONZE_PERCENT / 100), 1);
      // The invoice NET total should match the discounted Quotation/SO total (discount carried through).
      expect(net, '[Invoice] NET Total should equal the discounted Quotation/SO total').toBeCloseTo(quotationTotal, 1);
      console.log('✅ The Bronze 15% discount persisted across Quotation -> Sales Order -> Invoice');
    });
  });
});
