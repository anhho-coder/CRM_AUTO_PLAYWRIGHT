import { Page, test, expect } from '@playwright/test';
import { OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  createDealRegistrationOpportunityAsThomas,
  deleteCreatedOpportunityAsAdmin,
} from '@helpers/uc-a-2-deal-registration.helper';

/**
 * Shared "Pre-condition #2" for the UC-B-3 family (Reseller pays partially): as Thomas, create the
 * deal-registration Opportunity (steps 1-9, reused from UC-A-2) and then build the single-product
 * invoice chain (steps 10-18): Deal Element (Immediate Payment + one product Qty 1) -> SAVE ->
 * NEW QUOTATION -> CONFIRM (no approval - small deal) -> CREATE INVOICE (Invoiceable lines) ->
 * CREATE AND VIEW INVOICES -> VALIDATE -> capture Invoice#1 + InvoiceTotal#1.
 *
 * This mirrors the proven TC.-B.3.1 setup and emits one test.step per manual step (REQUIREMENT #1),
 * so every UC-B-3 spec stays self-contained with fresh data (REQUIREMENT #2) without duplicating the
 * ~18-step block. Returns the captured invoice facts. Leaves the page on the validated Invoice form
 * (logged in as Thomas).
 */

// Re-export so UC-B-3 specs import the teardown from one place.
export { deleteCreatedOpportunityAsAdmin };

export interface PartialPaymentSetupInput {
  /** Opportunity name (Opp Name #1) - must be unique per run. */
  oppName: string;
  /** Contact name (Internal Note "Name"). */
  contactName: string;
  /** Company email (Internal Note "Email"). */
  companyEmail: string;
  /** The assembled deal-registration Internal Note text. */
  internalNote: string;
  /** Step-label prefix; defaults to "Pre-condition #2". */
  stepPrefix?: string;
}

export interface PartialPaymentSetup {
  /** Saved Opportunity form URL (Opp URL #1) - used by the afterEach teardown. */
  oppUrl: string;
  /** Validated Invoice form URL (Invoice#1) - the page Faye opens to register payments. */
  invoiceUrl: string;
  /** Posted Invoice number (Invoice#1). */
  invoiceNumber: string;
  /** Invoice grand total (InvoiceTotal#1) - NET of the automatic Reseller Partner Discount. */
  invoiceTotal: number;
}

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

/**
 * Build a validated single-product Invoice as Thomas and return its facts.
 * Emits "Pre-condition #2 - Step 1..18" test.steps.
 */
export async function createValidatedInvoiceForPartialPayment(
  page: Page,
  input: PartialPaymentSetupInput
): Promise<PartialPaymentSetup> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const quotationPage = new QuotationPage(page);
  const invoicePage = new InvoicePage(page);
  const p = input.stepPrefix ?? 'Pre-condition #2';

  const result: PartialPaymentSetup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };

  // ── Steps 1-9: create the deal-registration Opportunity as Thomas (shared with UC-A-2) ──
  await test.step(`${p} - Steps 1-9: Login as Thomas; CRM > view list > CREATE; enter Opp/Contact/Company/Email, Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team + Salesperson cleared); CRM Developer Lead form; Assigned Partner; Internal Note #1; SAVE; refresh until Company + Contact populate`, async () => {
    result.oppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName: input.oppName,
      contactName: input.contactName,
      companyEmail: input.companyEmail,
      internalNote: input.internalNote,
      stepPrefix: 'Create deal-registration Opportunity',
    });
    const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(input.contactName);
    console.log(`  - Contact field value: "${contactValue}"`);
    expect(contactFieldFound, 'Step 9: Company + Contact should populate in Opp #1').toBeTruthy();
  });

  await test.step(`${p} - Step 10: Click "Deal Element" button to create a new Deal Element`, async () => {
    await opportunityPage.clickDealElement();
    await dealElementPage.waitForFormOpen();
    await dealElementPage.dismissErrorDialogWithRetry();
    await dealElementPage.waitForAutoPopulate();
    console.log('✓ Deal Element form opened');
  });

  await test.step(`${p} - Step 11: Set Payment terms = Immediate Payment`, async () => {
    await dealElementPage.selectPricelist('Public Pricelist_USD');
    await dealElementPage.selectPaymentTerm('Immediate Payment');
    console.log('✓ Payment terms = Immediate Payment (Pricelist = Public Pricelist_USD)');
  });

  await test.step(`${p} - Step 12: In Order Lines, "Add a product" -> select ONE product (Product#1), Quantity = 1, then SAVE the Deal Element`, async () => {
    await dealElementPage.dismissErrorDialog();
    const added = await dealElementPage.addProduct(''); // first product, Qty 1 -> small deal, no approval
    console.log(added ? '  - Single product selected (Qty 1)' : '  - Could not add a product');
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    console.log('✓ Deal Element saved with one product (Qty 1)');
  });

  await test.step(`${p} - Step 13: Click "New Quotation" -> wait until created -> click "Confirm"`, async () => {
    await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    await quotationPage.dismissErrorDialogWithRetry();
    console.log('✓ Quotation created');
    await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.dismissErrorDialogWithRetry();
    await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log('✓ Quotation confirmed to a Sales Order');
  });

  await test.step(`${p} - Step 14: Wait until the "Create invoice" button appears, then click it`, async () => {
    await invoicePage.dismissErrorDialog();
    await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
    console.log('✓ CREATE INVOICE pressed (Invoice Order popup opened)');
  });

  await test.step(`${p} - Step 15: In the Invoice Order popup, select the first option "Invoiceable lines"`, async () => {
    await invoicePage.selectInvoiceableLines();
  });

  await test.step(`${p} - Step 16: Click "Create and view invoices" button`, async () => {
    const ms = await invoicePage.clickCreateAndViewInvoices();
    await invoicePage.dismissErrorDialogWithRetry();
    console.log(`✓ Invoice created and opened (took ${(ms / 1000).toFixed(1)}s)`);
  });

  await test.step(`${p} - Step 17: Wait until the invoice is created completely; on the invoice screen click "Validate"`, async () => {
    const status = await invoicePage.clickValidateAndWaitPosted();
    console.log(`  - Invoice status after VALIDATE: "${status}"`);
    expect(status, 'The Invoice should be posted (Open/Posted) after VALIDATE').toMatch(/Open|Posted|Paid/i);
    console.log('✓ Invoice validated');
  });

  await test.step(`${p} - Step 18: Note Invoice#1 (number) and InvoiceTotal#1 (total)`, async () => {
    result.invoiceUrl = page.url();
    result.invoiceNumber = await invoicePage.getInvoiceNumber();
    result.invoiceTotal = money(await invoicePage.getInvoiceTotal());
    console.log(`  - Invoice#1 = "${result.invoiceNumber}" | InvoiceTotal#1 = ${result.invoiceTotal} | URL: ${result.invoiceUrl}`);
    expect(result.invoiceNumber, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
    expect(result.invoiceTotal, 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
    expect(result.invoiceUrl, 'Invoice#1 URL should be captured').toContain('model=account.invoice');
  });

  return result;
}
