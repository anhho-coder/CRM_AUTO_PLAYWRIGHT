import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';

/**
 * ===========================================================================
 *  UC-B-3  -  Reseller pays partially
 * ===========================================================================
 *  Test Case ID    : TC.-B.3.9
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-26
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye pay it in 2 installments but set
 *    "Actually Received($)" LOWER than the Payment Amount on each (a bank-fee scenario). Verify the
 *    invoice is Paid (Payment Amounts cover the balance) yet the Payments-tab "Actually Received" column
 *    reflects the entered values, distinct from (less than) the Payment Amounts.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.9:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values (generateDealRegistrationNote()).
 *
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *    1-18. Login as Thomas; create the deal-registration Opportunity; Deal Element (Immediate Payment +
 *          one product Qty 1); New Quotation; Confirm; Create invoice (Invoiceable lines) > Create and
 *          view invoices; Validate; note Invoice#1 + InvoiceTotal#1.
 *    19. Installment#1 = round(InvoiceTotal#1 / 2, 2); Installment#2 = remainder. BankFee = $1.00;
 *        ActuallyReceived#n = Installment#n - BankFee (less than the Payment Amount).
 *
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *    2. Register a partial payment: Payment Amount = Installment#1 ("Keep open"), Actually Received = Installment#1 - BankFee, then Validate
 *    3. Register a payment: Payment Amount = Installment#2 (remaining balance), Actually Received = Installment#2 - BankFee, then Validate
 *
 *  Verification Point:
 *    - Invoice#1 state = "Paid" and Amount Due = $0 (Payment Amounts cover the full balance)
 *    - In the "Payments" tab: Payment Amount column = Installment#1/#2; Actually Received column =
 *      Installment#1 - BankFee / Installment#2 - BankFee (each less than its Payment Amount)
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted/paid invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - "Actually Received($)" is an independent (post bank-fee) field; this TC proves it is captured
 *    separately from the Payment Amount, while the invoice still reconciles to Paid on the Payment Amount.
 */

const SKIP_CLEANUP_OPP = true;
const BANK_FEE = 1.00;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.9 - Reseller pays partially (Actually Received differs from Payment Amount)', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.3.9: Verify Actually Received is captured independently of Payment Amount', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.9 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let i1 = 0, i2 = 0, ar1 = 0, ar2 = 0;

    // Pay one installment with a SEPARATE Actually Received value.
    const payInstallment = async (amount: number, actuallyReceived: number, keepOpen: boolean): Promise<void> => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      await invoicePage.clickRegisterPayment();
      await invoicePage.fillPaymentAmount(amount.toFixed(2));
      if (keepOpen) {
        const diff = await invoicePage.blurPaymentAmountAndAwaitDifference();
        expect(diff, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
        await invoicePage.selectPaymentDifferenceKeepOpen();
      }
      await invoicePage.fillActuallyReceived(actuallyReceived.toFixed(2));
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
    };

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}")`);
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-18)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
    });

    await test.step('Pre-condition #2 - Step 19: Installment#1/#2 split + ActuallyReceived#n = Installment#n - BankFee ($1.00)', async () => {
      i1 = round2(setup.invoiceTotal / 2);
      i2 = round2(setup.invoiceTotal - i1);
      ar1 = round2(i1 - BANK_FEE);
      ar2 = round2(i2 - BANK_FEE);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | i1 = ${i1} (AR ${ar1}) | i2 = ${i2} (AR ${ar2})`);
      expect(round2(i1 + i2)).toBeCloseTo(setup.invoiceTotal, 2);
      expect(ar1, 'ActuallyReceived#1 should be less than Installment#1').toBeLessThan(i1);
      expect(ar1).toBeGreaterThan(0);
    });

    await test.step('Steps to reproduce - Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 URL', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await page.goto(setup.invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      console.log(`✓ Logged in as Faye and opened Invoice#1 (${setup.invoiceNumber})`);
    });

    await test.step('Steps to reproduce - Step 2: Register a partial payment: Payment Amount = Installment#1 ("Keep open"), Actually Received = Installment#1 - BankFee, then Validate', async () => {
      await payInstallment(i1, ar1, true);
      console.log(`✓ Installment#1 = ${i1.toFixed(2)} paid (Keep open), Actually Received = ${ar1.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 3: Register a payment: Payment Amount = Installment#2 (remaining balance), Actually Received = Installment#2 - BankFee, then Validate', async () => {
      await payInstallment(i2, ar2, false);
      console.log(`✓ Installment#2 = ${i2.toFixed(2)} paid (closes invoice), Actually Received = ${ar2.toFixed(2)}`);
    });

    await test.step('Verification Point: Invoice Paid + Amount Due $0; Payment Amount column = Installment#1/#2; Actually Received column = Installment#n - BankFee (each less than its Payment Amount)', async () => {
      let status = '', amountDue = '';
      for (let attempt = 1; attempt <= 6; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        status = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Poll ${attempt}/6: status="${status}" amountDue="${amountDue}"`);
        if (/Paid/i.test(status)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }

      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      const actuallyReceived = (await invoicePage.getPaymentColumnValues('Actually Received')).map(money);
      console.log(`  - status="${status}" amountDue="${amountDue}" | rows=${rowCount} | payAmounts=${JSON.stringify(payAmounts)} | actuallyReceived=${JSON.stringify(actuallyReceived)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.9 - Paid Invoice; Actually Received differs from Payment Amount');

      expect(status, 'Invoice#1 should be "Paid" (Payment Amounts cover the balance)').toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due should be $0').toBeCloseTo(0, 2);
      expect(rowCount, 'There should be exactly 2 payment records').toBe(2);

      const payAmtSorted = [...payAmounts].sort((a, b) => a - b);
      const expectedPaySorted = [i1, i2].sort((a, b) => a - b);
      for (let i = 0; i < 2; i++) {
        expect(payAmtSorted[i], `Payment Amount #${i + 1} should match an installment`).toBeCloseTo(expectedPaySorted[i], 2);
      }
      const arSorted = [...actuallyReceived].sort((a, b) => a - b);
      const expectedArSorted = [ar1, ar2].sort((a, b) => a - b);
      for (let i = 0; i < 2; i++) {
        expect(arSorted[i], `Actually Received #${i + 1} should match Installment - BankFee`).toBeCloseTo(expectedArSorted[i], 2);
      }
      // Each Actually Received is strictly less than the matching Payment Amount (the bank fee).
      expect(round2(actuallyReceived.reduce((s, v) => s + v, 0)), 'Sum of Actually Received should be less than InvoiceTotal#1 by 2x BankFee')
        .toBeCloseTo(round2(setup.invoiceTotal - 2 * BANK_FEE), 2);
      console.log('✅ Actually Received captured independently (post bank-fee) while the invoice reconciled to Paid');
    });
  });
});
