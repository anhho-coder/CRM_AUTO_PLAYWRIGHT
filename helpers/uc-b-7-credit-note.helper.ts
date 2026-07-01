import { Page, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  createValidatedInvoiceForPartialPayment,
  deleteCreatedOpportunityAsAdmin,
  PartialPaymentSetup,
} from '@helpers/uc-b-3-partial-payment.helper';

/**
 * Shared "Pre-condition #2" for the UC-B-7 family (Accountant/Salesperson issues a credit note):
 * build a PAID Invoice#1 end-to-end (the manual TC's Pre-condition #2, steps 1-24).
 *
 *   - Steps 1-19 (as Thomas): create the deal-registration Opportunity and a validated single-product
 *     Invoice#1 (reused from the UC-B-3 helper createValidatedInvoiceForPartialPayment). Capture
 *     Invoice#1, InvoiceTotal#1 and Product#1 (the product code used).
 *   - Steps 20-24 (as Faye): login as Faye (accountant), open Invoice#1, Register Payment for the FULL
 *     amount due (Payment Amount and Actually Received($) = InvoiceTotal#1), Validate -> Invoice#1 = Paid.
 *
 * Emits grouped Pre-condition test.steps (REQUIREMENT #1: setup is grouped). Self-contained with fresh
 * data (REQUIREMENT #2). Returns the captured invoice facts. Leaves the page on the Paid Invoice#1 form
 * (logged in as Faye), ready for the credit-note "Steps to reproduce".
 */

// Re-export so UC-B-7 specs import the teardown from one place.
export { deleteCreatedOpportunityAsAdmin };

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

export interface CreditNoteSetupInput {
  /** Opportunity name (Opp Name #1) - must be unique per run. */
  oppName: string;
  /** Contact name (Internal Note "Name"). */
  contactName: string;
  /** Company email (Internal Note "Email"). */
  companyEmail: string;
  /** The assembled deal-registration Internal Note text. */
  internalNote: string;
}

export interface CreditNoteSetup extends PartialPaymentSetup {
  /** Invoice#1 final state after the full payment (should be "Paid"). */
  paidStatus: string;
}

/**
 * Build a Paid single-product Invoice#1: Thomas validates it, then Faye records a full payment.
 * Emits "Pre-condition #2 - ..." test.steps and returns the invoice facts (incl. the Paid status).
 */
export async function createPaidInvoiceAsThomasAndFaye(
  page: Page,
  input: CreditNoteSetupInput
): Promise<CreditNoteSetup> {
  const loginPage = new LoginPage(page);
  const invoicePage = new InvoicePage(page);

  const result: CreditNoteSetup = {
    oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0, paidStatus: '',
  };

  // ── Steps 1-19 (as Thomas): create the deal-registration Opportunity + validated Invoice#1 ──
  const setup = await createValidatedInvoiceForPartialPayment(page, {
    oppName: input.oppName,
    contactName: input.contactName,
    companyEmail: input.companyEmail,
    internalNote: input.internalNote,
  });
  result.oppUrl = setup.oppUrl;
  result.invoiceUrl = setup.invoiceUrl;
  result.invoiceNumber = setup.invoiceNumber;
  result.invoiceTotal = setup.invoiceTotal;

  const full = setup.invoiceTotal.toFixed(2);

  // ── Steps 20-24 (as Faye): full payment so Invoice#1 becomes Paid ──
  await test.step('Pre-condition #2 - Step 20: Use the account of Faye (accountant) to login successful, then open Invoice#1', async () => {
    await loginPage.logout(baseUrl);
    await page.context().clearCookies();
    await loginPage.navigateTo(baseUrl);
    await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
    await loginPage.dismissLocationPermissionDialog().catch(() => {});
    console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
    await page.goto(setup.invoiceUrl, { waitUntil: 'domcontentloaded' });
    await invoicePage.dismissErrorDialogWithRetry();
    await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    const opened = await invoicePage.getInvoiceNumber();
    expect(opened, 'Faye should open Invoice#1').toBe(setup.invoiceNumber);
  });

  await test.step('Pre-condition #2 - Step 21: Click "Register Payment"', async () => {
    await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
  });

  await test.step(`Pre-condition #2 - Step 22: Set Payment Amount = InvoiceTotal#1 (${full})`, async () => {
    await invoicePage.fillPaymentAmount(full);
  });

  await test.step(`Pre-condition #2 - Step 23: Set Actually Received($) = InvoiceTotal#1 (${full})`, async () => {
    await invoicePage.fillActuallyReceived(full);
  });

  await test.step('Pre-condition #2 - Step 24: Click "Validate" -> the full payment is recorded and Invoice#1 state becomes "Paid"', async () => {
    await invoicePage.clickValidate_RegisterPayment();
    await invoicePage.dismissErrorDialogWithRetry();
    result.paidStatus = await invoicePage.waitForInvoiceStatus('Paid');
    console.log(`  - Invoice#1 status after the full payment: "${result.paidStatus}"`);
    expect(result.paidStatus, 'Invoice#1 should be Paid after the full payment').toMatch(/Paid/i);
  });

  return result;
}
