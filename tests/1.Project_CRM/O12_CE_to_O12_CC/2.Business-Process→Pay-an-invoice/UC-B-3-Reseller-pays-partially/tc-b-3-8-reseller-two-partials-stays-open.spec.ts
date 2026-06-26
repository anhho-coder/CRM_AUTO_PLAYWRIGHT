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
 *  Test Case ID    : TC.-B.3.8
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-26
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye register TWO partial payments
 *    (both "Keep open", each a third of the total) WITHOUT closing the invoice, and verify it remains
 *    "Open" with Amount Due = the still-outstanding balance and exactly 2 payment records.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.8:" --project=chromium
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
 *    19. Installment#1 = Installment#2 = round(InvoiceTotal#1 / 3, 2) (two partials; a balance remains).
 *
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *    2. Register a partial payment of Installment#1 with "Keep open" (Actually Received = Installment#1), then Validate
 *    3. Register a partial payment of Installment#2 with "Keep open" (Actually Received = Installment#2), then Validate
 *
 *  Verification Point:
 *    - Invoice#1 state = "Open" (NOT "Paid")
 *    - Amount Due = InvoiceTotal#1 - Installment#1 - Installment#2 (a remaining balance > 0)
 *    - In the "Payments" tab there are exactly 2 payment records, with amounts = Installment#1, Installment#2
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - Both payments use "Keep open" and the invoice is intentionally left Open (a balance remains).
 *    "Actually Received($)" is set per payment (it does not auto-fill).
 */

const SKIP_CLEANUP_OPP = true;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.8 - Reseller pays partially (two partials, stays Open)', () => {
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

  test('TC.-B.3.8: Verify two partial payments leave the invoice Open', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.8 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let i1 = 0, i2 = 0;

    const payPartialKeepOpen = async (amount: number): Promise<void> => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      await invoicePage.clickRegisterPayment();
      await invoicePage.fillPaymentAmount(amount.toFixed(2));
      const diff = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diff, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
      await invoicePage.selectPaymentDifferenceKeepOpen();
      await invoicePage.fillActuallyReceived(amount.toFixed(2));
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

    await test.step('Pre-condition #2 - Step 19: Installment#1 = Installment#2 = round(InvoiceTotal#1 / 3, 2) (a balance remains)', async () => {
      i1 = round2(setup.invoiceTotal / 3);
      i2 = round2(setup.invoiceTotal / 3);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | Installment#1 = ${i1} | Installment#2 = ${i2} | remaining = ${round2(setup.invoiceTotal - i1 - i2)}`);
      expect(round2(setup.invoiceTotal - i1 - i2), 'A balance should remain after two thirds').toBeGreaterThan(0);
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

    await test.step('Steps to reproduce - Step 2: Register a partial payment of Installment#1 with "Keep open" (Actually Received = Installment#1), then Validate', async () => {
      await payPartialKeepOpen(i1);
      console.log(`✓ Installment#1 = ${i1.toFixed(2)} paid (Keep open)`);
    });

    await test.step('Steps to reproduce - Step 3: Register a partial payment of Installment#2 with "Keep open" (Actually Received = Installment#2), then Validate', async () => {
      await payPartialKeepOpen(i2);
      console.log(`✓ Installment#2 = ${i2.toFixed(2)} paid (Keep open)`);
    });

    await test.step('Verification Point: Invoice stays "Open", Amount Due = InvoiceTotal#1 - Installment#1 - Installment#2, and the Payments tab holds exactly 2 records', async () => {
      let status = '', amountDue = '';
      for (let attempt = 1; attempt <= 5; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        status = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Poll ${attempt}/5: status="${status}" amountDue="${amountDue}"`);
        if (status) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }

      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      const expectedDue = round2(setup.invoiceTotal - i1 - i2);
      console.log(`  - status="${status}" amountDue="${amountDue}" | rows=${rowCount} | amounts=${JSON.stringify(payAmounts)} | expectedDue=${expectedDue}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.8 - Invoice still Open after two partial payments');

      expect(status, 'Invoice should remain "Open" (not Paid) after two partial payments').toMatch(/Open/i);
      expect(status, 'Invoice should NOT be Paid while a balance remains').not.toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due should equal the remaining balance').toBeCloseTo(expectedDue, 2);
      expect(rowCount, 'There should be exactly 2 payment records').toBe(2);
      const expectedSorted = [i1, i2].sort((a, b) => a - b);
      const actualSorted = [...payAmounts].sort((a, b) => a - b);
      for (let i = 0; i < 2; i++) {
        expect(actualSorted[i], `Payment #${i + 1} amount should match an installment`).toBeCloseTo(expectedSorted[i], 2);
      }
      console.log('✅ Two partial payments keep the invoice Open with the correct remaining balance');
    });
  });
});
