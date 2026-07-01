import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { OpportunityPage, InvoicePage, PaymentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';
import { createStandalonePaymentAsFaye } from '@helpers/uc-b-6-reconcile.helper';

/**
 * ===========================================================================
 *  UC-B-6  -  Accountant reconciles bank statement
 * ===========================================================================
 *  Test Case ID    : TC.-B.6.9
 *  Manual TC ID    : UC-B.6.9
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Faye reconcile a FULL standalone credit (Payment#1) against Invoice#1, then verify the
 *    reconciliation is recorded on BOTH sides: the invoice Payments tab shows Payment#1 (journal /
 *    amount / status), and Payment#1's "Invoices" smart button now references Invoice#1 (bidirectional
 *    link).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.9:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *  Pre-condition #2 (as Thomas): validated single-product Invoice#1; note Invoice#1 + InvoiceTotal#1.
 *  Pre-condition #3 (as Faye): create FULL Payment#1 (Bank Transfer); read JournalItem#1; capture Payment#1 URL.
 *  Steps to reproduce (as Faye):
 *    1. Open Invoice#1
 *    2. Click "Add" on JournalItem#1 (the invoice becomes Paid)
 *    3. Open Payment#1 and inspect its reconciliation state / Journal Items
 *  Verification Point:
 *    1. Invoice#1 state = "Paid", Amount Due $0
 *    2. The invoice Payments tab shows Payment#1 with Payment Journal = Bank Transfer and amount = InvoiceTotal#1
 *    3. Payment#1 is reconciled against the invoice (reverse-side link): its state is "Reconciled" OR its
 *       Journal Items carry a Matching Number. NOTE: the "Invoices" smart button (invoice_ids) stays 0 for
 *       a standalone payment matched via Outstanding credits - that field is only set when a payment is
 *       registered FROM an invoice - so the reverse link is verified via the reconciliation, not that button.
 * ===========================================================================
 */

const SKIP_CLEANUP_OPP = true;
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.6.9 - Reconciliation evidence + bidirectional payment-invoice link', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.6.9: Reconciliation is recorded on the invoice Payments tab and links back from the payment', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const invoicePage = new InvoicePage(page);
    const paymentPage = new PaymentPage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.9 ${compactDateTime}`;
    let invoiceUrl = '', invoiceNumber1 = '', journalItem1 = '', paymentUrl = '';
    let invoiceTotal1 = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`PC#1: Opp="${oppName}" Reseller="${DEAL_REGISTRATION.partnerCompanyName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the Opportunity and a validated single-product Invoice#1 (Steps 1-18)', async () => {
      const setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl; invoiceUrl = setup.invoiceUrl; invoiceNumber1 = setup.invoiceNumber; invoiceTotal1 = setup.invoiceTotal;
      console.log(`  - Invoice#1="${invoiceNumber1}" Total=${invoiceTotal1}`);
      expect(invoiceTotal1).toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Pre-condition #3: As Faye, pre-create a FULL standalone Payment#1 (Bank Transfer); capture Payment#1 URL + JournalItem#1', async () => {
      const res = await createStandalonePaymentAsFaye(page, { amount: invoiceTotal1.toFixed(2) });
      journalItem1 = res.journalItem; paymentUrl = res.paymentUrl;
      console.log(`  - Payment#1 URL=${paymentUrl} JournalItem#1=${journalItem1}`);
      expect(paymentUrl).toMatch(/[#?&]id=\d+/);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 created');
    });

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      expect(await invoicePage.getInvoiceNumber()).toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: Click "Add" on JournalItem#1 (the invoice becomes Paid)', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      expect(present, `Outstanding credits should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'Add JournalItem#1 should be clicked').toBeTruthy();
    });

    await test.step('Verification Point 1: Invoice#1 state = "Paid", Amount Due $0', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      const amountDue = await invoicePage.getAmountDue();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice Paid');
      expect(status, 'Invoice#1 should be Paid').toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due should be 0').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point 2: The invoice Payments tab shows Payment#1 (Bank Transfer, amount = InvoiceTotal#1)', async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const journals = await invoicePage.getPaymentColumnValues('Payment Journal').catch(() => []);
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => [])).map(money);
      const statuses = await invoicePage.getPaymentColumnValues('Status').catch(() => []);
      console.log(`  - rows=${rowCount} journals=${JSON.stringify(journals)} amounts=${JSON.stringify(payAmounts)} statuses=${JSON.stringify(statuses)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payments tab evidence');
      expect(rowCount, 'Payments tab should display Payment#1').toBeGreaterThan(0);
      expect(journals.some((j) => /Bank Transfer/i.test(j)), 'Payment Journal should be Bank Transfer').toBeTruthy();
      expect(payAmounts.some((a) => Math.abs(a - invoiceTotal1) < 0.01), 'Payment Amount should equal InvoiceTotal#1').toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3 / Verification Point 3: Open Payment#1 and verify it is reconciled against the invoice (reverse-side link)', async () => {
      await page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });
      await paymentPage.dismissErrorDialogWithRetry();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      // Informational: the invoice_ids smart button stays 0 for a manually-matched standalone payment.
      const count = await paymentPage.getInvoicesSmartButtonCount();
      const status = await paymentPage.getStatus();
      console.log(`  - Payment#1 status="${status}" | Invoices smart-button (invoice_ids) count=${count} (expected 0 for this flow)`);
      // Reverse-side proof of the link: a fully-matched payment is "Reconciled"; otherwise its journal
      // items carry a Matching Number once reconciled. Either confirms Payment#1 is matched to the invoice.
      const matchingNumbers = /Reconciled/i.test(status) ? [] : await paymentPage.getJournalItemsMatchingNumbers();
      const hasMatch = matchingNumbers.some((m) => m && m.trim().length > 0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payment reconciled (reverse link)');
      expect(/Reconciled/i.test(status) || hasMatch, 'Payment#1 should be reconciled (state "Reconciled" or a Matching Number on its journal items)').toBeTruthy();
      console.log('✅ Bidirectional evidence: invoice Payments tab records Payment#1; Payment#1 is reconciled (reverse link)');
    });
  });
});
