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
  /**
   * Deal Element Pricelist to select (default "Public Pricelist_USD"). Pass an alternate-currency
   * pricelist (e.g. "Public Pricelist_EUR") to build a foreign-currency invoice (ExchangeRate-1.1).
   * Matched case-insensitively by DealElementPage.selectPricelist, so omit the trailing "(EUR)".
   */
  pricelist?: string;
  /** Human label for the Pricelist step (default "<pricelist> (USD)"), used only in the step text. */
  pricelistLabel?: string;
}

export interface CreatedInvoice {
  /** Saved Opportunity form URL (Opp URL #1). */
  oppUrl: string;
  /** account.invoice record id parsed from the invoice form URL after CREATE AND VIEW INVOICES. */
  invoiceBackendId: string;
  /** Backend Invoice form URL (captured after CREATE AND VIEW INVOICES). */
  invoiceUrl: string;
  /** Posted Invoice number (Invoice Number #1); "" if left as Draft. */
  invoiceNumber: string;
  /** Backend Invoice status after the action (e.g. "Open" / "Draft"). */
  status: string;
  /** Backend Amount Due (residual) raw text, e.g. "$ 279.65". */
  amountDue: string;
  /** Invoice grand Total (footer amount_total) in the INVOICE currency, e.g. "$ 85.85" / "EUR 85.85". */
  invoiceTotal: string;
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
  const pricelist = input.pricelist ?? 'Public Pricelist_USD';
  const pricelistLabel = input.pricelistLabel ?? `${pricelist} (USD)`;

  // Steps 1-9: create the deal-registration Opportunity (shared with UC-A-2).
  const oppUrl = await createDealRegistrationOpportunityAsThomas(page, input);

  const result: CreatedInvoice = {
    oppUrl,
    invoiceBackendId: '',
    invoiceUrl: '',
    invoiceNumber: '',
    status: '',
    amountDue: '',
    invoiceTotal: '',
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

  await test.step(`${p} - Step 12: Set Pricelist = ${pricelistLabel} and Payment Term = Immediate Payment`, async () => {
    // The Deal Element chatter can raise a "Missing Record" popup on load that intercepts clicks.
    await dealElementPage.dismissErrorDialogWithRetry();
    await dealElementPage.waitForAutoPopulate();
    await dealElementPage.selectPricelist(pricelist);
    // Manual TC reads "Immidiate Payment" (typo); the real option label is "Immediate Payment".
    await dealElementPage.selectPaymentTerm('Immediate Payment');
    console.log(`✓ Pricelist (${pricelist}) + Payment Term set`);
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

  await test.step(`${p} - Step 18: On the "Invoice Order" window, select "Invoiceable lines" then press "CREATE AND VIEW INVOICES" and wait`, async () => {
    // "Invoiceable lines" is the first option (selected by default); set it explicitly to mirror the manual step.
    await invoicePage.selectInvoiceableLines().catch(() => {});
    const ms = await invoicePage.clickCreateAndViewInvoices();
    await invoicePage.dismissErrorDialogWithRetry();
    result.invoiceBackendId = (page.url().match(/[#?&]id=(\d+)/) || [])[1] ?? '';
    result.invoiceUrl = page.url();
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
      try { result.invoiceTotal = await invoicePage.getInvoiceTotal(); } catch { /* best-effort */ }
      try { result.invoiceDate = await invoicePage.getInvoiceDate(); } catch { /* best-effort */ }
      try { result.dueDate = await invoicePage.getDueDate(); } catch { /* best-effort */ }
      // The invoice form is loaded here (getInvoiceNumber succeeded above), so page.url() is the posted
      // account.invoice form URL - authoritative. Overwrite any pre-navigation URL captured at step 18,
      // which can still read the sale.order URL when "Create and view invoices" navigation is in flight
      // (a sale.order URL makes the accountant land on the SO page -> no "Register Payment" button).
      const validatedUrl = page.url();
      if (/model=account\.(invoice|move)/i.test(validatedUrl) || !result.invoiceUrl) {
        result.invoiceUrl = validatedUrl;
      }
      console.log(`  - Invoice Number #1 (posted): "${result.invoiceNumber}" | status "${result.status}" | total "${result.invoiceTotal}" | amountDue "${result.amountDue}" | date "${result.invoiceDate}" | due "${result.dueDate}"`);
      expect(result.invoiceNumber, 'Invoice Number #1 should be assigned after VALIDATE').toBeTruthy();
    });
  } else {
    await test.step(`${p} - Step 19: Leave the Invoice as DRAFT (do NOT press VALIDATE)`, async () => {
      try { result.status = await invoicePage.getInvoiceStatus(); } catch { /* draft */ }
      try { result.invoiceTotal = await invoicePage.getInvoiceTotal(); } catch { /* draft */ }
      if (!result.invoiceUrl) result.invoiceUrl = page.url();
      console.log(`  - Invoice left as Draft (backend id "${result.invoiceBackendId}", status "${result.status}", total "${result.invoiceTotal}")`);
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

/**
 * Register a FULL payment on a validated Invoice as Faye (the accountant), then VALIDATE the payment so
 * the Invoice becomes "Paid". Unlike the Salesperson role, the accountant DOES expose "Register Payment"
 * on the invoice. Emits the manual steps 20-24 under the supplied prefix (default 'Pre-condition #2'):
 *   20 login as Faye + open Invoice#1 | 21 Register Payment | 22 Payment Amount = InvoiceTotal#1 |
 *   23 Actually Received($) = InvoiceTotal#1 | 24 Validate (-> Paid).
 * Leaves the page on the paid Invoice form (logged in as Faye). Returns the full-due Payment Amount used.
 * @param invoiceUrl - the backend Invoice form URL captured after VALIDATE
 * @param stepPrefix - the manual section prefix for the step labels (default 'Pre-condition #2')
 */
export async function registerFullPaymentAsAccountant(
  page: Page,
  invoiceUrl: string,
  stepPrefix: string = 'Pre-condition #2'
): Promise<{ paymentAmount: string }> {
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);
  let paymentAmount = '';

  await test.step(`${stepPrefix} - Step 20: Use the account of Faye (accountant) to login successful, then open Invoice#1`, async () => {
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    const opened = await invoicePage.getInvoiceNumber().catch(() => '');
    console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName}); opened invoice "${opened}"`);
  });

  await test.step(`${stepPrefix} - Step 21: Click "Register Payment"`, async () => {
    // The "Register Payment" header button can render late on a slow Faye invoice load (pre-prod). If it
    // is not yet visible, reload the invoice (Faye stays logged in) and retry, rather than failing the
    // precondition on a one-shot 20s wait.
    let opened = false;
    for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
      try {
        await invoicePage.dismissErrorDialog();
        await invoicePage.clickRegisterPayment();
        opened = true;
      } catch (e) {
        console.log(`  - "Register Payment" not ready yet (attempt ${attempt}/3): ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        if (attempt < 3) {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await invoicePage.dismissErrorDialogWithRetry();
          await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad).catch(() => {});
          await invoicePage.getInvoiceNumber().catch(() => '');
          await page.waitForTimeout(CommonUtils.waitTimes.long);
        }
      }
    }
    expect(opened, 'The "Register Payment" control should become available on Invoice#1 (as Faye)').toBeTruthy();
    console.log('✓ Register Payment dialog opened (as Faye)');
  });

  await test.step(`${stepPrefix} - Step 22: Set "Payment Amount" = InvoiceTotal#1 (the full amount due)`, async () => {
    // The wizard pre-fills Payment Amount with the full balance due (= InvoiceTotal#1). Read it as the
    // authoritative full-due figure, then set it explicitly to mirror the manual step.
    paymentAmount = await invoicePage.getPaymentAmount();
    expect(paymentAmount, 'A Payment Amount (full balance due) should be pre-filled in the Register Payment dialog').toBeTruthy();
    await invoicePage.fillPaymentAmount(paymentAmount);
    console.log(`  - Payment Amount (InvoiceTotal#1) = "${paymentAmount}"`);
  });

  await test.step(`${stepPrefix} - Step 23: Set "Actually Received($)" = InvoiceTotal#1 (the same value entered in Payment Amount)`, async () => {
    await invoicePage.fillActuallyReceived(paymentAmount);
    console.log(`✓ "Actually Received($)" set to "${paymentAmount}"`);
  });

  await test.step(`${stepPrefix} - Step 24: Press "Validate" (the full payment is recorded and Invoice#1 becomes "Paid")`, async () => {
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
    console.log(`  - Backend invoice status after full payment (as Faye): "${status}"`);
    expect(status, 'After registering full payment Invoice#1 should be "Paid"').toMatch(/Paid/i);
  });

  return { paymentAmount };
}
