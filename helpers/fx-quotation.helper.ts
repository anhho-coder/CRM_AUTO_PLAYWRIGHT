import { Page } from '@playwright/test';
import { baseUrl } from '@config/users.config';
import { CurrencyPage, CurrencyRateRow, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_PARTNERS,
  DiscountRun,
  newDiscountRun,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  idFromUrl,
  money,
} from '@helpers/discount-baseline.helper';

/**
 * Shared setup + reads for the pre-production BASELINE suite Exchange-rate_1.3.x ("1.3 US3 - Everything that uses the
 * conversion keeps working"): which edits of a draft EUR quotation make Odoo recompute "Total in Company Currency"
 * (sale.order.amount_total_company_signed, stored, module nakivo_sale) and at which rate.
 *
 * Origin: CRM-11857_3.3 (CRM-13394). On 2026-10-26 the same red was measured on crm-mig AND pre-production: a save that
 * changes only the Order Date leaves the figure at the creation-day rate, while a save that changes a line recomputes
 * it at the Order Date's rate (EXPLORE-20261026_2). Tester 2026-10-26: accept "an Order Date change does not change
 * Total in Company Currency" for now, and explore what does. The crm-mig ports (CRM-11857_3.3.x) use
 * helpers/fx-quotation-mig.helper.ts; both share the record set of helpers/discount-baseline.helper.ts and its
 * deny-list teardown.
 *
 * What a draft quotation lets the CRM administrator edit (EXPLORE-20261026_3 pre-prod / _4 crm-mig, 2026-10-26):
 * header Reseller, Distributor, Promotion, Pricelist, Payment Terms, Expiration, Order Date ("Other Information");
 * line Quantity, Unit Price, Special Discount(%); add / delete a line; header buttons CONFIRM and Duplicate.
 * Not editable: order Partner Discount(%), line Description (no such column), line Start/End Date (hidden for [A2144B]).
 */

/** The page objects a case drives - the base classes on pre-production, the Mig subclasses on crm-mig. */
export interface FxPages {
  quotation: (page: Page) => QuotationPage;
  dealElement: (page: Page) => DealElementPage;
}
export const PREPROD_PAGES: FxPages = {
  quotation: (page) => new QuotationPage(page),
  dealElement: (page) => new DealElementPage(page),
};

/** Data every 1.3.x / 3.3.x case uses - identical on pre-production and crm-mig. */
export const FX_QUOTE = {
  currency: 'EUR',
  gbp: 'GBP',
  pricelistEur: DISCOUNT_BASELINE.pricelistEur,
  pricelistGbp: DISCOUNT_BASELINE.pricelistGbp,
  paymentTerm: DISCOUNT_BASELINE.paymentTerm,
  /** the Payment Terms the payment-term case switches to */
  otherPaymentTerm: '15 Days',
  /** the quotation's product line - a listed product, so Deal registration qualifies it (289.00 EUR, 2026-10-26) */
  product: DISCOUNT_BASELINE.listedProduct,
  /** the second product line of the add-a-line / remove-a-line cases (19.00 EUR, 2026-10-26) */
  secondProduct: DISCOUNT_BASELINE.noProgramProduct,
  /** the Order Date every "anchored" case moves the quotation to: its EUR row differs from today's */
  anchorDate: '2026-08-03',
  /** a far-future Order Date with no EUR rate row (Exchange-rate_1.3.15 adds one, then removes it) */
  futureDate: '2031-03-17',
  dealRegistration: DISCOUNT_BASELINE.dealRegistration,
  /** the reward line's product on an order carrying Deal registration */
  rewardProduct: DISCOUNT_BASELINE.dealRegistrationProduct,
  bronzeReseller: DISCOUNT_PARTNERS.bronze,
} as const;

/** A run whose records carry the FX marker (company FX-Cust-<ts>, opportunity FX-Opp-<ts>, own e-mail domain). */
export function newFxRun(): DiscountRun {
  const run = newDiscountRun();
  return {
    ...run,
    company: `FX-Cust-${run.ts}`,
    email: `fx.cust.${run.ts}@d${run.ts}.fxautotest.com`,
    opp: `FX-Opp-${run.ts}`,
  };
}

/** 2 decimals, the way Odoo rounds a EUR / USD monetary field. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** ISO date -> the MM/DD/YYYY the forms and the Rates list render. */
export const toFormDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};

/** Today as an ISO date, in UTC - the day Odoo stamps on a new quotation's Order Date (stored in UTC). */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** A date `days` from today, as the forms render it (MM/DD/YYYY, local calendar). Computed at run time. */
export const formDateInDays = (days: number): string => {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

/** The labels of the rates (among `rates`) that turn `total` into exactly `totalCc` when divided and rounded to 2 decimals. */
export function ratesMatching(total: number, totalCc: number, rates: Record<string, number>): string {
  const hits = Object.entries(rates)
    .filter(([, r]) => r > 0 && round2(total / r) === round2(totalCc))
    .map(([label]) => label);
  return hits.length ? hits.join(', ') : `none of ${Object.keys(rates).join(' / ')}`;
}

/** What a quotation shows: Total (number + the text with its currency symbol), Total in Company Currency, Order Date. */
export interface QuoteAmounts {
  total: number;
  totalText: string;
  totalCc: number;
  orderDate: string;
}

/** Reads the amounts of a quotation by id - readQuotationAmounts (pre-production) or readQuotationAmountsMig (crm-mig). */
export type AmountsReader = (page: Page, quotationId: number) => Promise<QuoteAmounts>;

/**
 * Invoicing > Configuration > Accounting > Currencies > <currency> > Rates: the row that applies to each ISO date (the
 * newest row dated on or before it). Throws when a date has no applicable row.
 */
export async function readRatesWith(currencyPage: CurrencyPage, currency: string, isoDates: string[]): Promise<Record<string, CurrencyRateRow>> {
  await currencyPage.openRatesForCurrency(currency, CommonUtils.waitTimes.pageLoad);
  const out: Record<string, CurrencyRateRow> = {};
  for (const d of isoDates) {
    const row = await currencyPage.getRateApplicableToDate(d);
    if (!row) throw new Error(`No ${currency} rate row applies to ${d}`);
    out[d] = row;
    console.log(`  - ${currency} rate applicable to ${d.padEnd(10)} = ${row.rate}   (row dated ${row.date})`);
  }
  return out;
}

/** Pre-production: readRatesWith on the CurrencyPage. */
export async function readRates(page: Page, currency: string, isoDates: string[]): Promise<Record<string, CurrencyRateRow>> {
  return readRatesWith(new CurrencyPage(page), currency, isoDates);
}

/**
 * Currencies > <currency> > Rates > CREATE: one row dated `iso` with `rate`, then count the rows of that date.
 * @returns the number of rows dated `iso` after the save (1 = added)
 */
export async function addRateRowWith(currencyPage: CurrencyPage, currency: string, iso: string, rate: string): Promise<number> {
  await currencyPage.openRatesForCurrency(currency, CommonUtils.waitTimes.pageLoad);
  await currencyPage.createRateRow(toFormDate(iso), rate);
  await currencyPage.openRatesForCurrency(currency, CommonUtils.waitTimes.pageLoad);
  const n = await currencyPage.countRateRowsForDate(iso);
  console.log(`  - ${currency} rows dated ${iso} after CREATE = ${n}`);
  return n;
}

/**
 * Currencies > <currency> > Rates: delete the row dated `iso` (Action > Delete), then count the rows of that date.
 * Used ONLY for the row a run added itself (a far-future date no other row carries). Never throws - it runs in teardown.
 * @returns the number of rows dated `iso` left (0 = clean, -1 = could not be read)
 */
export async function removeRateRowWith(currencyPage: CurrencyPage, currency: string, iso: string): Promise<number> {
  try {
    await currencyPage.openRatesForCurrency(currency, CommonUtils.waitTimes.pageLoad);
    if ((await currencyPage.countRateRowsForDate(iso)) > 0) await currencyPage.deleteRateRowForDate(toFormDate(iso));
    await currencyPage.openRatesForCurrency(currency, CommonUtils.waitTimes.pageLoad);
    const left = await currencyPage.countRateRowsForDate(iso);
    console.log(`  - ${currency} rows dated ${iso} remaining = ${left}`);
    return left;
  } catch (e) {
    console.log(`  ⚠ ${currency} row ${iso} could not be removed/counted: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return -1;
  }
}

/** Pre-production wrappers of addRateRowWith / removeRateRowWith. */
export const addRateRow = (page: Page, currency: string, iso: string, rate: string): Promise<number> => addRateRowWith(new CurrencyPage(page), currency, iso, rate);
export const removeRateRow = (page: Page, currency: string, iso: string): Promise<number> => removeRateRowWith(new CurrencyPage(page), currency, iso);

/** The Deal Element order the quotation is raised from: its lines, and the promotion / reseller picked on it. */
export interface FxOrder {
  lines?: Array<{ sku: string; qty: number }>;
  promotion?: string;
  reseller?: string;
}

/** Log the Deal Element data one field per line, add the lines, pick the promotion / reseller (Deal Element in edit mode). */
export async function fillDealElement(dealElementPage: DealElementPage, order: FxOrder): Promise<void> {
  const lines = order.lines ?? [{ sku: FX_QUOTE.product, qty: 1 }];
  console.log('  Deal Element:');
  lines.forEach((l, i) => console.log(`    - Line ${i + 1}      = ${l.sku}, Quantity = ${l.qty}`));
  console.log(`    - Promotion   = ${order.promotion ?? '(none)'}`);
  console.log(`    - Reseller    = ${order.reseller ?? '(none)'}`);
  for (const l of lines) await dealElementPage.addOrderLineStrict(l.sku, l.qty);
  if (order.reseller) await dealElementPage.setReseller(order.reseller);
  if (order.promotion) {
    const set = await dealElementPage.setPromotion(order.promotion);
    if (!set) throw new Error(`Promotion "${order.promotion}" could not be set on the Deal Element`);
  }
}

/**
 * On the saved opportunity: DEAL ELEMENT, fill it with the order, SAVE. Setup, not what the cases verify - so ONE
 * logged retry when the save is refused with the CRM-4383 guard "Please create quotation by clicking the "New
 * Quotation" button from an Opportunity !!!": on 2026-10-26 (Exchange-rate_1.3.1) a Deal Element opened right after
 * the opportunity page had been refreshed to wait for its Company link was refused that way, while the same flow
 * passed in the other 14 runs. The retry discards that form, re-opens the opportunity by URL and starts over.
 */
export async function buildDealElement(page: Page, run: DiscountRun, order: FxOrder, pages: FxPages): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await openDealElementFromOpportunity(page);
      await fillDealElement(pages.dealElement(page), order);
      await saveDealElement(page, run);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 2 || !/Please create quotation/i.test(msg) || !run.urlOpp) throw e;
      console.log('  ⚠ Deal Element save refused with "Please create quotation by clicking the New Quotation button from an Opportunity" - discarding it, re-opening the opportunity, one retry');
      await pages.dealElement(page).discardFormIfInEditMode().catch(() => {});
      await page.goto(run.urlOpp, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
      await pages.quotation(page).waitForEditButton(CommonUtils.waitTimes.pageLoad).catch(() => {});
    }
  }
}

/**
 * Pre-conditions 2-5 on pre-production: Contacts > Create an end-customer company on Public Pricelist_EUR, CRM > Pipeline
 * > Create its opportunity, DEAL ELEMENT with the order's lines, SAVE, NEW QUOTATION on the Deal Element. Every id goes
 * into `run` for the deny-list teardown.
 * @returns the quotation's sale.order id (the browser is left on the quotation form, read mode)
 */
export async function createEurQuotation(page: Page, run: DiscountRun, salesperson: { displayName: string }, order: FxOrder = {}): Promise<number> {
  await createEndCustomerCompany(page, run, salesperson, FX_QUOTE.pricelistEur);
  await createOpportunityForCompany(page, run, salesperson);
  await buildDealElement(page, run, order, PREPROD_PAGES);
  const quotationPage = new QuotationPage(page);
  await quotationPage.clickNewQuotation();
  await quotationPage.waitForEditButton();
  const id = idFromUrl(page.url());
  if (!id) throw new Error(`NEW QUOTATION: no record id in ${page.url()}`);
  run.saleOrderIds.push(id);
  console.log(`  ✓ Quotation created, id = ${id}`);
  return id;
}

/**
 * Pre-production: re-open the quotation with debug mode ON and read Total, Total in Company Currency (developer-only
 * field, groups base.group_no_one - TC.Performance.5.4.10) and Order Date. Leaves the form open in read mode.
 */
export async function readQuotationAmounts(page: Page, quotationId: number): Promise<QuoteAmounts> {
  const quotationPage = new QuotationPage(page);
  await quotationPage.openRecordFormByIdInDebugMode(baseUrl, 'sale.order', quotationId);
  return readOpenQuotation(quotationPage, quotationId, await quotationPage.getFieldNumber('amount_total_company_signed'));
}

/** Total + Order Date of the quotation open in read mode, with the company total read elsewhere. */
export async function readOpenQuotation(quotationPage: QuotationPage, quotationId: number, totalCc: number): Promise<QuoteAmounts> {
  const totalText = await quotationPage.getFieldDisplayValue('amount_total');
  const total = money(totalText);
  const orderDate = await quotationPage.getOrderDateDisplayed();
  console.log(`  - Quotation ${quotationId}:`);
  console.log(`      Total                     = ${totalText}`);
  console.log(`      Total in Company Currency = ${totalCc}`);
  console.log(`      Order Date                = ${orderDate}`);
  return { total, totalText, totalCc, orderDate };
}

/** The order lines of the quotation open on screen, as header -> cell text. */
export async function readOrderLines(page: Page, pages: FxPages = PREPROD_PAGES): Promise<Array<Record<string, string>>> {
  const rows = await pages.quotation(page).getAllOrderLineRows();
  rows.forEach((r, i) => console.log(`  - line ${i + 1}: ${(r['Product'] ?? '').slice(0, 9)} | Qty ${r['Ordered Qty'] ?? ''} | Unit Price ${r['Unit Price'] ?? ''} | Subtotal ${r['Subtotal'] ?? ''}`));
  return rows;
}

/** The Subtotal of the line whose product starts with `sku` (NaN when there is no such line). */
export const lineSubtotal = (rows: Array<Record<string, string>>, sku: string): number => {
  const row = rows.find((r) => (r['Product'] ?? '').startsWith(sku));
  return row ? money(row['Subtotal'] ?? '') : NaN;
};

/**
 * The quotation form is open in read mode: click Edit, run `edit`, click Save and wait until the form is back in read
 * mode (the Edit button returns only once the save went through). Throws when the form stays in edit mode.
 */
export async function editQuotationAndSave(
  page: Page,
  what: string,
  edit: (quotationPage: QuotationPage, dealElementPage: DealElementPage) => Promise<void>,
  pages: FxPages = PREPROD_PAGES
): Promise<void> {
  const quotationPage = pages.quotation(page);
  await quotationPage.clickEdit();
  await edit(quotationPage, pages.dealElement(page));
  await quotationPage.clickSaveButton();
  // a quotation is a sale.order like a Deal Element: a save that adds a reward line ran past 30 s on pre-production
  // (Exchange-rate_1.3.9, 2026-10-26: "Loading (1)" still on screen) - so the Deal Element's save budget, still bounded
  const saved = await quotationPage.waitForEditButton(CommonUtils.waitTimes.savingDealElement).then(() => true).catch(() => false);
  if (!saved) throw new Error(`The quotation did not return to read mode after saving: ${what}`);
  console.log(`  ✓ Saved: ${what}`);
}

/** The quotation form is open in read mode: Edit, set the Quantity of the product's line, Save. */
export async function setLineQuantityAndSave(page: Page, sku: string, qty: number, pages: FxPages = PREPROD_PAGES): Promise<void> {
  await editQuotationAndSave(page, `Quantity of ${sku} = ${qty}`, async (q) => {
    const ok = await q.setOrderLineQuantity(sku, qty);
    if (!ok) throw new Error(`The Quantity of ${sku} could not be set to ${qty}`);
  }, pages);
}

/** The quotation form is open in read mode: Edit, set Order Date (MM/DD/YYYY 10:00:00 of the ISO date), Save. */
export async function setOrderDateAndSave(page: Page, isoDate: string, pages: FxPages = PREPROD_PAGES): Promise<void> {
  const typed = `${toFormDate(isoDate)} 10:00:00`;
  await editQuotationAndSave(page, `Order Date = ${typed}`, async (q) => {
    const ok = await q.setOrderDate(typed);
    if (!ok) throw new Error(`Order Date could not be set to ${typed}`);
  }, pages);
}
