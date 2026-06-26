import { Page, Browser, TestInfo, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  createDealRegistrationOpportunityAsThomas,
  deleteCreatedOpportunityAsAdmin,
  DealRegCreateInput,
} from '@helpers/uc-a-2-deal-registration.helper';

/**
 * Shared "Pre-condition" for the UC-B-1 family (Reseller views invoices with multiple products):
 * as Thomas, create the deal-registration Opportunity (steps 1-9, reused from UC-A-2), build a
 * Deal Element with 4 DIFFERENT products sized into the approval band ($15k-$20k), get the
 * Quotation approved by Sales Manager Max (second browser context), Confirm it, then Create +
 * (optionally) Validate a multi-product Invoice. Returns the captured invoice facts.
 *
 * Mirrors the proven TC.-B.1.1 sequence so every UC-B-1 spec stays self-contained with fresh data
 * (REQUIREMENT #2) without duplicating the whole chain.
 *
 * NOTE on the automatic 15% Reseller Partner Discount: per-line invoice subtotals are GROSS
 * (Qty x Unit Price) while the invoice Total is NET (= gross x 0.85). Qty#1 is computed from each
 * line's EFFECTIVE (post-discount) per-unit value so the NET deal total lands at the mid-band target.
 */

export { deleteCreatedOpportunityAsAdmin };

// 4 DIFFERENT products in Public Pricelist_USD. Product#1 (qty-variable) is the priciest so Qty#1
// stays a sensible integer; #2/#3/#4 keep Quantity = 1.
export const UC_B1_PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]', '[A2146B]'];
export const UC_B1_BAND_MIN = 15000;
export const UC_B1_BAND_MAX = 20000;
export const UC_B1_BAND_TARGET = 17500;

export const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
export const qtyNum = (s: string | undefined | null): number => {
  const m = (s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
};

export interface MultiProductInvoiceInput extends DealRegCreateInput {
  /** Browser fixture (needed to open the Sales Manager's second context for the approval). */
  browser: Browser;
  /** TestInfo for evidence screenshots. */
  testInfo: TestInfo;
  /** When false, leave the Invoice as DRAFT (do NOT press VALIDATE). Default true. */
  validate?: boolean;
  /** Product codes to add (defaults to UC_B1_PRODUCTS). products[0] is the qty-variable line. */
  products?: string[];
  /** Mid-band target for the NET deal total (defaults to UC_B1_BAND_TARGET). */
  bandTarget?: number;
}

export interface MultiProductInvoiceResult {
  oppUrl: string;
  invoiceBackendId: string;
  invoiceUrl: string;
  invoiceNumber: string;
  /** Net invoice Total (amount_total) raw text, e.g. "$ 17,409.70". */
  invoiceTotal: string;
  qty1: number;
  /** Per-product captured facts: GROSS line total + quantity + list unit price. */
  products: { code: string; quantity: number; total: number; unitPrice: number }[];
  validated: boolean;
}

/**
 * Create the multi-product deal-registration Invoice as Thomas (approved by Max). Leaves the page on
 * the (validated or draft) Invoice form, logged in as Thomas. Manages and closes the Sales Manager
 * browser context internally.
 */
export async function createMultiProductInvoiceAsThomas(
  page: Page,
  input: MultiProductInvoiceInput
): Promise<MultiProductInvoiceResult> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const quotationPage = new QuotationPage(page);
  const invoicePage = new InvoicePage(page);

  const products = input.products ?? UC_B1_PRODUCTS;
  const p1 = products[0];
  const bandTarget = input.bandTarget ?? UC_B1_BAND_TARGET;
  const validate = input.validate !== false;
  const prefix = input.stepPrefix ?? 'Pre-condition';

  const result: MultiProductInvoiceResult = {
    oppUrl: '', invoiceBackendId: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: '',
    qty1: 1, products: [], validated: false,
  };

  // Steps 1-9: create the deal-registration Opportunity (shared with UC-A-2).
  result.oppUrl = await createDealRegistrationOpportunityAsThomas(page, { ...input, stepPrefix: `${prefix} - create Opp` });

  await test.step(`${prefix}: Refresh until the Company + Contact fields populate in Opp #1`, async () => {
    const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(input.contactName);
    console.log(`  - Contact field value: "${contactValue}"`);
    expect(contactFieldFound, 'Company + Contact should populate in Opp #1').toBeTruthy();
  });

  const unitPrice: Record<string, number> = {};
  const effUnit: Record<string, number> = {};
  let qty1 = 1;

  await test.step(`${prefix}: Build the Deal Element with 4 DIFFERENT products and size Product#1 to the approval band`, async () => {
    await opportunityPage.clickDealElement();
    await dealElementPage.waitForFormOpen();
    await dealElementPage.dismissErrorDialogWithRetry();
    await dealElementPage.waitForAutoPopulate();
    await dealElementPage.selectPricelist('Public Pricelist_USD');
    await dealElementPage.selectPaymentTerm('Immediate Payment');

    for (const code of products) {
      await dealElementPage.dismissErrorDialog();
      await dealElementPage.addProductLine(code, 1); // Quantity defaults to 1 on every line
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    // Commit all rows so the readonly cells render for reading.
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);

    for (const code of products) {
      unitPrice[code] = await dealElementPage.getUnitPriceForProduct(code);
      effUnit[code] = await dealElementPage.getSubtotalAfterAllDiscountsForProduct(code); // net value at Qty 1
      console.log(`  - ${code}: UnitPrice (list) = ${unitPrice[code]} | effective per-unit (net) = ${effUnit[code]}`);
      expect(unitPrice[code], `Unit price for ${code} should be > 0`).toBeGreaterThan(0);
      expect(effUnit[code], `Effective per-unit for ${code} should be > 0`).toBeGreaterThan(0);
    }

    // Qty#1 = round((target - (eff #2..#4)) / eff#1) -> targets the NET deal total at mid-band.
    const othersEff = products.slice(1).reduce((sum, c) => sum + effUnit[c], 0);
    qty1 = Math.max(1, Math.round((bandTarget - othersEff) / effUnit[p1]));
    console.log(`  - Product#1 = ${p1} | sum(eff #2..#4) = ${othersEff.toFixed(2)} | initial Qty#1 = ${qty1}`);

    // Set Product#1 qty from a readonly state, then SAVE so computed totals render reliably.
    const setProduct1Qty = async (q: number): Promise<void> => {
      await dealElementPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await dealElementPage.changeQtyInRow(p1, q);
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    };
    const readNetTotal = async (): Promise<number> => {
      let total = 0;
      for (const code of products) total += await dealElementPage.getSubtotalAfterAllDiscountsForProduct(code);
      return total;
    };

    await setProduct1Qty(qty1);
    let netTotal = await readNetTotal();
    console.log(`  - Deal Element net total: ${netTotal.toFixed(2)} (Qty#1 = ${qty1})`);
    // GUARD: adjust Qty#1 by +/-1 until the (net) deal total is inside the band (rare).
    for (let i = 0; i < 12 && (netTotal < UC_B1_BAND_MIN || netTotal > UC_B1_BAND_MAX); i++) {
      if (netTotal < UC_B1_BAND_MIN) qty1 += 1;
      else if (qty1 > 1) qty1 -= 1;
      else break;
      await setProduct1Qty(qty1);
      netTotal = await readNetTotal();
      console.log(`  - Guard adjust #${i + 1}: Qty#1 = ${qty1} -> net total ${netTotal.toFixed(2)}`);
    }
    const grossTotal = products.reduce((sum, c) => sum + unitPrice[c] * (c === p1 ? qty1 : 1), 0);
    console.log(`  - Final Deal Element total: net ${netTotal.toFixed(2)} | gross ${grossTotal.toFixed(2)} | Qty#1 = ${qty1}`);
    expect(netTotal, 'Deal Element total should be > 15,000 USD').toBeGreaterThan(UC_B1_BAND_MIN);
    expect(netTotal, 'Deal Element total should be < 20,000 USD').toBeLessThan(UC_B1_BAND_MAX);
    result.qty1 = qty1;
  });

  let quotationUrl = '';
  await test.step(`${prefix}: New Quotation > To Approve (request Sales Manager approval)`, async () => {
    await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    await quotationPage.dismissErrorDialogWithRetry();
    await quotationPage.clickToApprove(CommonUtils.waitTimes.savingDealElement);
    quotationUrl = page.url();
    expect(quotationUrl, 'A Quotation URL should be captured after TO APPROVE').toContain('model=sale.order');
    console.log(`  - Quotation URL: ${quotationUrl}`);
  });

  await test.step(`${prefix}: Sales Manager Max approves the Quotation (second browser)`, async () => {
    const managerContext = await input.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ...(process.env.CI ? {} : { recordVideo: { dir: 'test-results', size: { width: 1920, height: 1080 } } }),
    });
    try {
      const managerPage = await managerContext.newPage();
      const managerLogin = new LoginPage(managerPage);
      const managerQuotation = new QuotationPage(managerPage);
      await managerLogin.navigateTo(baseUrl);
      await managerLogin.login(users.manager_max.username, users.manager_max.password);
      await managerPage.goto(quotationUrl);
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerQuotation.waitForFormView(CommonUtils.waitTimes.pageLoad);
      const approveMs = await managerQuotation.clickApprove();
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerPage.reload({ waitUntil: 'domcontentloaded' });
      await managerQuotation.dismissErrorDialogWithRetry();
      await managerQuotation.waitForFormView(CommonUtils.waitTimes.pageLoad);
      const approval = await managerQuotation.verifyApprovalSuccess();
      await CommonUtils.captureAndAttachScreenshot(managerPage, input.testInfo, `${prefix} - Quotation approved by Max`);
      expect(approval.approved, 'Max should approve the Quotation (post-approval action available)').toBeTruthy();
      console.log(`  - APPROVE pressed by Max (took ${(approveMs / 1000).toFixed(1)}s)`);
    } finally {
      await managerContext.close().catch(() => {});
    }
  });

  await test.step(`${prefix}: Back as Thomas, Confirm the Quotation, then Create Invoice (Invoiceable lines)`, async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await quotationPage.dismissErrorDialogWithRetry();
    await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);
    await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.dismissErrorDialogWithRetry();
    await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);

    await invoicePage.dismissErrorDialog();
    await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
    await invoicePage.selectInvoiceableLines();
    const ms = await invoicePage.clickCreateAndViewInvoices();
    await invoicePage.dismissErrorDialogWithRetry();
    result.invoiceBackendId = (page.url().match(/[#?&]id=(\d+)/) || [])[1] ?? '';
    result.invoiceUrl = page.url();
    console.log(`  - Invoice created (backend id "${result.invoiceBackendId}", took ${(ms / 1000).toFixed(1)}s)`);
  });

  if (validate) {
    await test.step(`${prefix}: Validate the Invoice and capture Invoice#1 / InvoiceTotal#1 / per-product facts`, async () => {
      const status = await invoicePage.clickValidateAndWaitPosted();
      expect(status, 'The Invoice should be posted (Open/Posted/Paid) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      result.validated = true;
      result.invoiceNumber = await invoicePage.getInvoiceNumber();
      result.invoiceTotal = await invoicePage.getInvoiceTotal();
      result.invoiceUrl = page.url();
      result.invoiceBackendId = (page.url().match(/[#?&]id=(\d+)/) || [])[1] ?? result.invoiceBackendId;
      for (const code of products) {
        const line = await invoicePage.getInvoiceLineData(code);
        result.products.push({ code, quantity: qtyNum(line.quantity), total: money(line.subtotal), unitPrice: unitPrice[code] });
      }
      console.log(`  - Invoice#1 = "${result.invoiceNumber}" | InvoiceTotal#1 (net) = "${result.invoiceTotal}"`);
      for (const pr of result.products) console.log(`  - ${pr.code}: qty=${pr.quantity} total(gross)=${pr.total}`);
      expect(result.invoiceNumber, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
    });
  } else {
    await test.step(`${prefix}: Leave the Invoice as DRAFT (do NOT press VALIDATE)`, async () => {
      let status = '';
      try { status = await invoicePage.getInvoiceStatus(); } catch { status = ''; }
      console.log(`  - Invoice left as Draft (backend id "${result.invoiceBackendId}", status "${status}")`);
    });
  }

  return result;
}
