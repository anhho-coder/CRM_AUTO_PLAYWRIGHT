import { Page, test, expect } from '@playwright/test';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { users, baseUrl } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * Shared UC-B-4 backbone ("End User pays directly when invoiced direct").
 *
 * Builds a VALIDATED invoice whose Payer = the End User, as Thomas - the common Pre-condition for the
 * whole TC.-B.4.x family. Each TC then exercises a different PAYMENT / ROLE / FIELD scenario on top of
 * this same backbone, so the setup lives here once (REQUIREMENT #1: a contiguous setup block may be a
 * shared helper) and every spec still gets fresh, uniquely-timestamped records (REQUIREMENT #2).
 */

/** Products in Public Pricelist_USD; a single unit (Qty 1) keeps the deal small -> no manager approval. */
export const UC_B4_PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]', '[A2146B]'];

/** Parse a money string ("$ 85.00") to a number (85). */
export const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

export interface EndUserInvoiceOptions {
  /** Test Case ID, e.g. 'TC.-B.4.2' - used for the Opp name + log lines. */
  tcId: string;
  /** Products to add to the Deal Element (each Qty = 1). Default: ONE random product. */
  products?: string[];
  /** Deal Element Payment terms. Default: 'Immediate Payment'. */
  paymentTerm?: string;
}

export interface EndUserInvoiceResult {
  oppUrl: string;        // Opp URL #1 (for teardown)
  leadName: string;      // EndUser#1 contact name (Name from Internal Note #1)
  companyEmail: string;  // End User company email
  invoiceNumber: string; // Invoice#1
  invoiceTotal: string;  // InvoiceTotal#1 (e.g. "$ 85.00")
  invoiceUrl: string;    // back-office URL of Invoice#1 (so the accountant can re-open it)
  products: string[];    // the product code(s) added
  paymentTerm: string;
}

/**
 * Run Pre-condition #1 (deal-registration Internal Note #1) and Pre-condition #2 (steps 1-20: create
 * the Opp as Thomas; build the Deal Element with Payer AND Invoice Address = the End User; add the
 * product(s); New Quotation -> Confirm; Create Invoice -> Validate) and return the captured facts.
 *
 * The Deal Element's Invoice Address (partner_invoice_id) is set to the End User too: an invoice created
 * from the Sales Order is billed to the Invoice Address (not the Payer), so this is what makes the posted
 * invoice's Payer the End User. Steps 1-9 are emitted by createDealRegistrationOpportunityAsThomas;
 * steps 10-20 run here as one grouped Pre-condition step (proven setup, not what these TCs verify).
 */
export async function buildValidatedEndUserInvoiceAsThomas(
  page: Page,
  options: EndUserInvoiceOptions
): Promise<EndUserInvoiceResult> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const quotationPage = new QuotationPage(page);
  const invoicePage = new InvoicePage(page);

  const products =
    options.products && options.products.length
      ? options.products
      : [UC_B4_PRODUCTS[Math.floor(Math.random() * UC_B4_PRODUCTS.length)]];
  const paymentTerm = options.paymentTerm ?? 'Immediate Payment';

  const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
  const oppName = `TEST ${options.tcId} ${compactDateTime}`;

  const result: EndUserInvoiceResult = {
    oppUrl: '', leadName, companyEmail, invoiceNumber: '', invoiceTotal: '', invoiceUrl: '', products, paymentTerm,
  };

  await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
    console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
    console.log(`  - Opportunity name : ${oppName}`);
    console.log(`  - End User (EndUser#1) / Contact name : ${leadName}`);
    console.log(`  - Company email : ${companyEmail}`);
    console.log(`  - Assigned Partner (Reseller) : ${DEAL_REGISTRATION.partnerCompanyName}`);
    console.log(`  - Product(s) : ${products.join(', ')} | Payment terms : ${paymentTerm}`);
  });

  await test.step('Pre-condition #2 - Steps 1-9: Login as Thomas; CRM > view list > CREATE; enter Opp/Contact(=EndUser#1)/Company/Email, Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team + Salesperson cleared); CRM Developer Lead form; Assigned Partner; Internal Note #1; SAVE; refresh until Company + Contact populate', async () => {
    result.oppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Create deal-registration Opportunity',
    });
    const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(leadName);
    console.log(`  - Contact field value: "${contactValue}"`);
    expect(contactFieldFound, 'Step 9: Company + Contact should populate in Opp #1').toBeTruthy();
  });

  await test.step(
    `Pre-condition #2 - Steps 10-20: Deal Element (Payer + Invoice Address = EndUser#1), Pricelist = Public Pricelist_USD, Payment terms = ${paymentTerm}, add product(s) ${products.join(', ')} (Qty 1), New Quotation -> Confirm, Create Invoice (Invoiceable lines) -> Validate; capture Invoice#1 + InvoiceTotal#1 + URL`,
    async () => {
      // Step 10: open a new Deal Element
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      console.log('  ✓ Deal Element form opened');

      // Step 11: Payer auto = Reseller -> change Payer = EndUser#1; also point Invoice Address at EndUser#1
      const payerBefore = await dealElementPage.getPayerValue();
      console.log(`  - Payer auto-populated as: "${payerBefore}" (expected the Reseller)`);
      await dealElementPage.setPayer(leadName);
      const payerAfter = await dealElementPage.getPayerValue();
      expect(payerAfter, 'Payer should be EndUser#1 (the End User contact)').toContain(leadName);
      await dealElementPage.setInvoiceAddressByName(leadName);
      const invAddrAfter = await dealElementPage.getInvoiceAddressValue();
      expect(invAddrAfter, 'Invoice Address should be EndUser#1 (so the invoice bills the End User)').toContain(leadName);
      console.log(`  ✓ Payer = "${payerAfter}" | Invoice Address = "${invAddrAfter}"`);

      // Steps 12-13: Pricelist + Payment terms
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm(paymentTerm);
      console.log(`  ✓ Pricelist = Public Pricelist_USD | Payment terms = ${paymentTerm}`);

      // Step 14: add the product(s), Qty = 1 each
      for (const code of products) {
        await dealElementPage.dismissErrorDialog();
        await dealElementPage.addProductLine(code, 1);
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      // Safeguard: re-confirm Payer + Invoice Address = EndUser#1 before saving (a product/onchange can reset them).
      if (!(await dealElementPage.getPayerValue()).includes(leadName)) await dealElementPage.setPayer(leadName);
      if (!(await dealElementPage.getInvoiceAddressValue()).includes(leadName)) await dealElementPage.setInvoiceAddressByName(leadName);
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log(`  ✓ Added product(s): ${products.join(', ')} (deal saved with Payer + Invoice Address = EndUser#1)`);

      // Step 15: New Quotation -> Confirm (small deal, no approval)
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  ✓ Quotation confirmed to a Sales Order');

      // Steps 16-18: Create Invoice -> Invoiceable lines -> Create and view invoices
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.selectInvoiceableLines();
      await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('  ✓ Invoice created');

      // Step 19: Validate
      const status = await invoicePage.clickValidateAndWaitPosted();
      expect(status, 'Invoice should post (Open/Posted/Paid) after VALIDATE').toMatch(/Open|Posted|Paid/i);

      // Step 20: capture Invoice#1, InvoiceTotal#1, URL
      result.invoiceNumber = await invoicePage.getInvoiceNumber();
      result.invoiceTotal = await invoicePage.getInvoiceTotal();
      result.invoiceUrl = page.url();
      console.log(`  ✓ Invoice#1 = "${result.invoiceNumber}" | InvoiceTotal#1 = "${result.invoiceTotal}"`);
      console.log(`  ✓ Invoice#1 URL = ${result.invoiceUrl}`);
      expect(result.invoiceNumber, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(money(result.invoiceTotal), 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(result.invoiceUrl, 'Invoice#1 URL should be captured').toContain('model=account.invoice');
    }
  );

  return result;
}

/**
 * Steps to reproduce - common entry: log in as Faye (accountant) and open Invoice#1 in the back-office.
 * Returns the invoice number read on screen (asserted == expected by the caller). Use inside a test.step
 * so its label mirrors the manual step text.
 */
export async function loginAsAccountantAndOpenInvoice(
  page: Page,
  invoiceUrl: string
): Promise<string> {
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  await loginPage.logout(baseUrl);
  await page.context().clearCookies();
  await loginPage.navigateTo(baseUrl);
  await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
  await loginPage.dismissLocationPermissionDialog().catch(() => {});
  console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
  await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
  await invoicePage.dismissErrorDialogWithRetry();
  await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
  const opened = await invoicePage.getInvoiceNumber();
  console.log(`  - Opened invoice: "${opened}"`);
  return opened;
}
