import { Page } from '@playwright/test';
import { baseUrl_mig } from '@config/users.config';
import { CurrencyRateRow, QuotationPage } from '@pages';
import { CurrencyPageMig, DealElementPageMig, MigPlatformPage, QuotationPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DiscountRun,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
} from '@helpers/discount-mig.helper';
import { FxOrder, FxPages, QuoteAmounts, addRateRowWith, buildDealElement, readOpenQuotation, readRatesWith, removeRateRowWith } from '@helpers/fx-quotation.helper';
import { CRM11857_33_BASELINE_MAP } from '@helpers/fx-quotation-mig.baseline-map';
import { baselineDetailsFrom } from '@helpers/baseline-traceability';
import type { BaselineTestDetails } from '@helpers/baseline-traceability';

/**
 * crm-mig port of helpers/fx-quotation.helper.ts - shared setup + reads for CRM-11857_3.3.x (folder "3. Conversion &
 * stability of values"). The pre-production specs Exchange-rate_1.3.x are the BASELINE: their flows and assertions are
 * reused unchanged; only the mechanical parts differ:
 *  - host + login: crm-mig (baseUrl_mig) through signInMig, the *_crm_mig accounts;
 *  - NEW QUOTATION: crm-mig creates the quotation in place and stays on the Deal Element (newQuotationMig opens it);
 *  - "Total in Company Currency" is not on the crm-mig quotation FORM: it is read from Sales > Orders > Quotations
 *    (LIST), optional column switched on, filtered on ID = the quotation (tester decision for CRM-11857_3.3, 2026-10-22);
 *  - teardown: teardownDiscountRunMig (afterEach) + sweepDiscountRunsMig (afterAll), deny-list of the run's own ids.
 */

/** Test details of a CRM-11857_3.3.x spec - tags + annotations naming its pre-production baseline (REQUIREMENT #8). */
export function baselineDetails(tc: string): BaselineTestDetails {
  return baselineDetailsFrom(CRM11857_33_BASELINE_MAP, tc, {
    mapFile: 'helpers/fx-quotation-mig.baseline-map.ts',
    masterTab: 'Migration - Exchange Rate',
  });
}

/** The Mig page objects (Order Lines keyed on the authored caption - the Mig theme upper-cases headers). */
export const MIG_PAGES: FxPages = {
  quotation: (page) => new QuotationPageMig(page),
  dealElement: (page) => new DealElementPageMig(page),
};

/** crm-mig: readRatesWith on CurrencyPageMig. */
export async function readRatesMig(page: Page, currency: string, isoDates: string[]): Promise<Record<string, CurrencyRateRow>> {
  return readRatesWith(new CurrencyPageMig(page), currency, isoDates);
}

/** crm-mig wrappers of addRateRowWith / removeRateRowWith (only for the far-future row a run adds itself). */
export const addRateRowMig = (page: Page, currency: string, iso: string, rate: string): Promise<number> => addRateRowWith(new CurrencyPageMig(page), currency, iso, rate);
export const removeRateRowMig = (page: Page, currency: string, iso: string): Promise<number> => removeRateRowWith(new CurrencyPageMig(page), currency, iso);

/** crm-mig twin of createEurQuotation: same records, same lines, crm-mig flows. @returns the quotation's id */
export async function createEurQuotationMig(page: Page, run: DiscountRun, salesperson: { displayName: string }, order: FxOrder = {}): Promise<number> {
  await createEndCustomerCompanyMig(page, run, salesperson, 'Public Pricelist_EUR');
  await createOpportunityForCompanyMig(page, run, salesperson);
  await buildDealElement(page, run, order, MIG_PAGES);
  const id = await newQuotationMig(page, run);
  await new QuotationPage(page).waitForEditButton(CommonUtils.waitTimes.pageLoad);
  console.log(`  ✓ Quotation created on crm-mig, id = ${id}`);
  return id;
}

/** Open a crm-mig quotation form by id and wait until it is in read mode. */
export async function openQuotationMig(page: Page, quotationId: number): Promise<void> {
  await page.goto(`${baseUrl_mig}#id=${quotationId}&view_type=form&model=sale.order`, { waitUntil: 'domcontentloaded', timeout: CommonUtils.waitTimes.abnormalWait });
  await new QuotationPage(page).waitForEditButton(CommonUtils.waitTimes.pageLoad);
}

/**
 * crm-mig: Total in Company Currency from Sales > Orders > Quotations (list, column on, ID filter), then Total and Order
 * Date from the quotation form. Leaves the form open in read mode.
 */
export async function readQuotationAmountsMig(page: Page, quotationId: number): Promise<QuoteAmounts> {
  const quotationPage = new QuotationPageMig(page);
  const listUrl = await new MigPlatformPage(page).appUrlFor('quotations');
  const list = await quotationPage.getTotalInCompanyCurrencyForQuotationId(listUrl, quotationId);
  if (list.rows !== 1) throw new Error(`The Quotations list filtered on ID = ${quotationId} holds ${list.rows} rows, not 1`);
  await openQuotationMig(page, quotationId);
  return readOpenQuotation(quotationPage, quotationId, parseFloat(list.value));
}
