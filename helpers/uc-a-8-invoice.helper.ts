import { Page, test, expect } from '@playwright/test';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { users, baseUrl } from '@config/users.config';
import { CommonUtils } from '@helpers/common.utils';
import {
  createDealRegistrationOpportunityAsThomas,
  deleteCreatedOpportunityAsAdmin,
  DealRegCreateInput,
} from '@helpers/uc-a-2-deal-registration.helper';

/**
 * Shared "Steps to reproduce #1" for the UC-A-8 family (Reseller views invoice on portal): as Thomas,
 * create the deal-registration Opportunity (steps 1-9, reused from UC-A-2) and then build the invoice
 * chain (steps 10-19): refresh/verify Contact -> DEAL ELEMENT (Pricelist + Payment Term + first product)
 * -> SAVE -> NEW QUOTATION -> CONFIRM (Sales Order) -> CREATE INVOICE -> CREATE AND VIEW INVOICES ->
 * remember Invoice Number #1 -> VALIDATE.
 *
 * Mirrors the proven TC.-A.8.1 sequence and emits one test.step per manual step for traceability
 * (REQUIREMENT #1), so every UC-A-8 spec stays self-contained with fresh data (REQUIREMENT #2) without
 * duplicating the 19-step block. Returns the captured invoice facts.
 */

// Re-export so UC-A-8 specs can import the teardown from one place.
export { deleteCreatedOpportunityAsAdmin };

export interface CreateInvoiceInput extends DealRegCreateInput {
  /** When false, leave the Invoice as DRAFT (do NOT press VALIDATE). Default true. */
  validate?: boolean;
}

export interface CreatedInvoice {
  /** Saved Opportunity form URL (Opp URL #1). */
  oppUrl: string;
  /** account.invoice record id parsed from the invoice form URL after CREATE AND VIEW INVOICES. */
  invoiceBackendId: string;
  /** Posted Invoice number (Invoice Number #1); "" if left as Draft. */
  invoiceNumber: string;
  /** Backend Invoice status after the action (e.g. "Open" / "Draft"). */
  status: string;
  /** Backend Amount Due (residual) raw text, e.g. "$ 279.65". */
  amountDue: string;
  /** Backend Invoice Date (MM/DD/YYYY). */
  invoiceDate: string;
  /** Backend Due Date (MM/DD/YYYY). */
  dueDate: string;
  /** True when the Invoice was validated/posted. */
  validated: boolean;
}

/**
 * Create the deal-registration Invoice as Thomas. Returns the captured invoice facts.
 * Leaves the page on the (validated or draft) Invoice form, logged in as Thomas.
 */
export async function createValidatedInvoiceAsThomas(
  page: Page,
  input: CreateInvoiceInput
): Promise<CreatedInvoice> {
  const opportunityPage = new OpportunityPage(page);
  const dealElementPage = new DealElementPage(page);
  const quotationPage = new QuotationPage(page);
  const invoicePage = new InvoicePage(page);
  const p = input.stepPrefix ?? 'Steps to reproduce #1';
  const validate = input.validate !== false;

  // Steps 1-9: create the deal-registration Opportunity (shared with UC-A-2).
  const oppUrl = await createDealRegistrationOpportunityAsThomas(page, input);

  const result: CreatedInvoice = {
    oppUrl,
    invoiceBackendId: '',
    invoiceNumber: '',
    status: '',
    amountDue: '',
    invoiceDate: '',
    dueDate: '',
    validated: false,
  };

  await test.step(`${p} - Step 10: Refresh page to see the "Contact" field equals Contact_name #1`, async () => {
    console.log(`${p} - Step 10: Verifying the Contact field equals Contact_name #1 ("${input.contactName}")`);
    const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(input.contactName);
    console.log(`  - Contact field value: "${contactValue}"`);
    expect(contactFieldFound, `The "Contact" field should equal Contact_name #1 ("${input.contactName}")`).toBeTruthy();
  });

  await test.step(`${p} - Step 11: Create "DEAL ELEMENT" - press "DEAL ELEMENT" button`, async () => {
    await opportunityPage.clickDealElement();
    await dealElementPage.waitForFormOpen();
    console.log('✓ Deal Element form opened');
  });

  await test.step(`${p} - Step 12: Set Pricelist = Public Pricelist_USD (USD) and Payment Term = Immediate Payment`, async () => {
    // The Deal Element chatter can raise a "Missing Record" popup on load that intercepts clicks.
    await dealElementPage.dismissErrorDialogWithRetry();
    await dealElementPage.waitForAutoPopulate();
    await dealElementPage.selectPricelist('Public Pricelist_USD');
    // Manual TC reads "Immidiate Payment" (typo); the real option label is "Immediate Payment".
    await dealElementPage.selectPaymentTerm('Immediate Payment');
    console.log('✓ Pricelist + Payment Term set');
  });

  await test.step(`${p} - Step 13: At "Order Lines", press "Add a product" and select the first product`, async () => {
    await dealElementPage.dismissErrorDialog();
    // Empty product name -> open the "Add a product" dropdown and select the first option (Qty 1,
    // under the $4k threshold so the Quotation needs no Sales Manager approval).
    const added = await dealElementPage.addProduct('');
    console.log(added ? '  - First product selected' : '  - Could not add a product');
  });

  await test.step(`${p} - Step 14: Press "SAVE" on the Deal Element and wait`, async () => {
    await dealElementPage.save(CommonUtils.waitTimes.savingPage);
    console.log('✓ Deal Element saved');
  });

  await test.step(`${p} - Step 15: Press "NEW QUOTATION" and wait`, async () => {
    await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    console.log('✓ Quotation created');
  });

  await test.step(`${p} - Step 16: Press "CONFIRM" and wait to create a Sales Order`, async () => {
    await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
    await quotationPage.dismissErrorDialogWithRetry();
    await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    await page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log('✓ Sales Order created');
  });

  await test.step(`${p} - Step 17: On the Sales Order, press "CREATE INVOICE" and wait`, async () => {
    await invoicePage.dismissErrorDialog();
    await invoicePage.clickCreateInvoice();
    console.log('✓ CREATE INVOICE pressed (Invoice Order window opened)');
  });

  await test.step(`${p} - Step 18: On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" and wait`, async () => {
    const ms = await invoicePage.clickCreateAndViewInvoices();
    await invoicePage.dismissErrorDialogWithRetry();
    result.invoiceBackendId = (page.url().match(/[#?&]id=(\d+)/) || [])[1] ?? '';
    console.log(`✓ Invoice created (backend id "${result.invoiceBackendId}", took ${(ms / 1000).toFixed(1)}s)`);
  });

  await test.step(`${p} - Step 19: Remember the Invoice number called Invoice Number #1`, async () => {
    // Before VALIDATE an O12 invoice may still show a draft placeholder; capture and log it. The
    // authoritative number (posted) is finalised right after VALIDATE.
    try {
      result.invoiceNumber = await invoicePage.getInvoiceNumber();
    } catch {
      console.log('  ⚠ Could not read the Invoice number yet (draft placeholder before VALIDATE)');
    }
    console.log(`  - Invoice Number #1 (pre-VALIDATE read): "${result.invoiceNumber}"`);
  });

  if (validate) {
    await test.step(`${p} - Step 19: Press "VALIDATE" and wait`, async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickValidate();
      result.validated = true;
      try { result.invoiceNumber = (await invoicePage.getInvoiceNumber()) || result.invoiceNumber; } catch { /* keep */ }
      try { result.status = await invoicePage.getInvoiceStatus(); } catch { /* best-effort */ }
      try { result.amountDue = await invoicePage.getAmountDue(); } catch { /* best-effort */ }
      try { result.invoiceDate = await invoicePage.getInvoiceDate(); } catch { /* best-effort */ }
      try { result.dueDate = await invoicePage.getDueDate(); } catch { /* best-effort */ }
      console.log(`  - Invoice Number #1 (posted): "${result.invoiceNumber}" | status "${result.status}" | amountDue "${result.amountDue}" | date "${result.invoiceDate}" | due "${result.dueDate}"`);
      expect(result.invoiceNumber, 'Invoice Number #1 should be assigned after VALIDATE').toBeTruthy();
    });
  } else {
    await test.step(`${p} - Step 19: Leave the Invoice as DRAFT (do NOT press VALIDATE)`, async () => {
      try { result.status = await invoicePage.getInvoiceStatus(); } catch { /* draft */ }
      console.log(`  - Invoice left as Draft (backend id "${result.invoiceBackendId}", status "${result.status}")`);
    });
  }

  return result;
}

/**
 * Register full payment on a validated Invoice as an admin with Accounting rights, then VALIDATE the
 * payment so the Invoice becomes "Paid". NOTE: the Salesperson (Thomas) role does NOT expose "Register
 * Payment" on the invoice (header has only Send & Print / Preview / Cancel), so payment is performed by
 * users.admin_crm (the proven paid-invoice flow). Emits manual steps 20-23 under "Steps to reproduce #1".
 * Leaves the page on the paid Invoice form (logged in as admin).
 * @param invoiceUrl - the backend Invoice form URL captured after VALIDATE
 */
export async function registerFullPaymentAsAdmin(page: Page, invoiceUrl: string): Promise<void> {
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  let paymentAmount = '';

  await test.step('Steps to reproduce #1 - Step 20: Login as admin (Accounting rights), open the Invoice and press "REGISTER PAYMENT"', async () => {
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.admin_crm.username, users.admin_crm.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    // Readiness gate: wait for the invoice form (number span) to render before acting.
    await invoicePage.getInvoiceNumber().catch(() => '');
    await invoicePage.dismissErrorDialog();
    await invoicePage.clickRegisterPayment();
    console.log('✓ Register Payment dialog opened (as admin)');
  });

  await test.step('Steps to reproduce #1 - Step 21: Read the "Payment Amount" field', async () => {
    paymentAmount = await invoicePage.getPaymentAmount();
    console.log(`  - Payment Amount: "${paymentAmount}"`);
    expect(paymentAmount, 'A Payment Amount should be pre-filled in the Register Payment dialog').toBeTruthy();
  });

  await test.step('Steps to reproduce #1 - Step 22: Set "Actually Received($)" = the Payment Amount', async () => {
    await invoicePage.fillActuallyReceived(paymentAmount);
    console.log(`✓ "Actually Received($)" set to "${paymentAmount}"`);
  });

  await test.step('Steps to reproduce #1 - Step 23: Press "VALIDATE" (the invoice becomes Paid)', async () => {
    await invoicePage.clickValidate_RegisterPayment();
    // The statusbar can lag after the payment posts; reload-and-retry until the invoice reads "Paid".
    let status = '';
    for (let attempt = 1; attempt <= 5; attempt++) {
      try { status = await invoicePage.getInvoiceStatus(); } catch { status = ''; }
      console.log(`  - Backend invoice status poll ${attempt}/5: "${status}"`);
      if (/Paid/i.test(status)) break;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialog();
      await invoicePage.getInvoiceNumber().catch(() => '');
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    }
    console.log(`  - Backend invoice status after payment: "${status}"`);
    expect(status, 'After registering full payment the invoice should be "Paid"').toMatch(/Paid/i);
  });
}
