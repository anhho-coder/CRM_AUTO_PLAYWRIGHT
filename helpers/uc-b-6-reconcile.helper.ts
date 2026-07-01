import { Page, test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { LoginPage, PaymentPage } from '@pages';
import { DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Shared "Pre-condition #3" for the UC-B-6 family (Accountant reconciles bank statement): as Faye
 * (accountant), pre-create a standalone Customer Payment (Receive Money / Customer / partner / amount
 * / journal / Actually Received), Save + Confirm it (Payment#N), then drill into its Journal Items and
 * read the Journal Entry (JournalItem#N) - the name shown in the invoice's Outstanding-credits section.
 *
 * Mirrors the proven TC.-B.6.1 setup and emits one test.step per manual step (REQUIREMENT #1), so every
 * UC-B-6 spec stays self-contained with fresh data (REQUIREMENT #2) without duplicating the block.
 * Returns { paymentUrl, journalItem }. Leaves the page on the Journal Item record (logged in as Faye).
 *
 * The Pre-condition #2 chain (Thomas -> validated Invoice#1) is reused from the UC-B-3 helper
 * (createValidatedInvoiceForPartialPayment) and from the UC-B-1 helper (multi-product).
 */
export interface StandalonePaymentInput {
  /** Payment amount AND Actually Received($), as a fixed-2 string (e.g. "85.85"). */
  amount: string;
  /** Customer partner; defaults to the Reseller (DEAL_REGISTRATION.partnerCompanyName). */
  partner?: string;
  /** Payment Journal label; defaults to "Bank Transfer". */
  journal?: string;
  /** When true (default) logout the current user and login as Faye first. Pass false to reuse Faye's session. */
  loginFirst?: boolean;
  /** When true (default) drill into Journal Items and read the Journal Entry (JournalItem#N). */
  readJournalEntry?: boolean;
  /** Step-label prefix; defaults to "Pre-condition #3". */
  stepPrefix?: string;
  /** Payment-number label used in step text (e.g. "Payment#1"); defaults to "Payment#1". */
  paymentLabel?: string;
}

export interface StandalonePaymentResult {
  /** Saved payment form URL (carries id=NNN). */
  paymentUrl: string;
  /** The payment's Journal Entry / move name (e.g. "BNK1/2026/0715"); '' when readJournalEntry=false. */
  journalItem: string;
}

/**
 * Login as Faye (accountant) and create + confirm a standalone Customer Payment, returning its facts.
 * Emits "Pre-condition #3 - Step 1..10" test.steps (Step 1 login is skipped when loginFirst=false).
 */
export async function createStandalonePaymentAsFaye(
  page: Page,
  input: StandalonePaymentInput
): Promise<StandalonePaymentResult> {
  const loginPage = new LoginPage(page);
  const paymentPage = new PaymentPage(page);
  const partner = input.partner ?? DEAL_REGISTRATION.partnerCompanyName;
  const journal = input.journal ?? 'Bank Transfer';
  const p = input.stepPrefix ?? 'Pre-condition #3';
  const label = input.paymentLabel ?? 'Payment#1';
  const result: StandalonePaymentResult = { paymentUrl: '', journalItem: '' };

  if (input.loginFirst !== false) {
    await test.step(`${p} - Step 1: Use the account of Faye (accountant) to login successful`, async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
    });
  }

  await test.step(`${p} - Step 2: Open the Invoicing module`, async () => {
    await paymentPage.openInvoicingModule();
  });

  await test.step(`${p} - Step 3: Navigate to Customers > Payments`, async () => {
    await paymentPage.openCustomerPaymentsList();
  });

  await test.step(`${p} - Step 4: Click "Create" to create a new payment`, async () => {
    await paymentPage.clickCreate();
  });

  await test.step(`${p} - Step 5: Input Invoice=blank, Payment type=Receive Money, Partner type=Customer, Partner=${partner}, Payment amount=${input.amount}, Payment Journal=${journal}, Actually Received($)=${input.amount}`, async () => {
    await paymentPage.clearInvoiceField();
    await paymentPage.selectPaymentType('Receive Money');
    await paymentPage.selectPartnerType('Customer');
    await paymentPage.setPartner(partner);
    await paymentPage.setAmount(input.amount);
    const j = await paymentPage.selectPaymentJournal(journal);
    await paymentPage.setActuallyReceived(input.amount);
    const partnerVal = await paymentPage.getPartnerValue();
    console.log(`  - Payment set: partner="${partnerVal}", amount=${input.amount}, journal="${j}"`);
    expect(partnerVal, `Payment Partner should be "${partner}"`).toContain(partner.split('#')[0]);
  });

  await test.step(`${p} - Step 6: Click "Save"`, async () => {
    result.paymentUrl = await paymentPage.save();
    expect(result.paymentUrl, `${label} should be saved (URL should carry a record id)`).toMatch(/[#?&]id=\d+/);
  });

  await test.step(`${p} - Step 7: Click "Confirm" -> the payment is created and saved as ${label}`, async () => {
    const status = await paymentPage.confirm();
    console.log(`  - ${label} status after Confirm: "${status}"`);
    expect(status, `${label} should be Posted after Confirm`).toMatch(/Posted|Reconciled/i);
  });

  if (input.readJournalEntry !== false) {
    await test.step(`${p} - Step 8: Find the journal entry name: click into "Journal Items" in the created payment`, async () => {
      await paymentPage.clickJournalItems();
    });

    await test.step(`${p} - Step 9: Click into a Journal Item record`, async () => {
      await paymentPage.openFirstJournalItem();
    });

    await test.step(`${p} - Step 10: Read the Journal Entry value and save it as JournalItem (for ${label})`, async () => {
      result.journalItem = await paymentPage.getJournalEntryName();
      console.log(`  - JournalItem for ${label} (Journal Entry) = "${result.journalItem}"`);
      expect(result.journalItem, 'JournalItem (Journal Entry name) should be captured').toBeTruthy();
      expect(result.journalItem, 'JournalItem should look like a journal entry name (e.g. BNK1/2026/0715)').toMatch(/\/\d{4}\//);
    });
  }

  return result;
}
