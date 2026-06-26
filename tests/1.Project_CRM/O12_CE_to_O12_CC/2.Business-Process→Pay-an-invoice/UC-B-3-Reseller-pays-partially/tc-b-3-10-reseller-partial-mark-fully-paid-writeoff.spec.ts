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
 *  Test Case ID    : TC.-B.3.10
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-26
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye register ONE partial payment
 *    (half the total) but choose "Mark invoice as fully paid" so the remaining difference is written
 *    off - and verify the invoice ends Paid - Amount Due $0 - with a single payment record of the
 *    partial amount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.10:" --project=chromium
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
 *    19. PartialAmount = round(InvoiceTotal#1 / 2, 2); the remaining InvoiceTotal#1 - PartialAmount is written off.
 *
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *    2. On Invoice#1, click "Register Payment"
 *    3. In the popup, set Payment Amount = PartialAmount
 *    4. Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Mark invoice as fully paid"
 *    5. Set Actually Received($) = PartialAmount
 *    6. Click "Validate"
 *
 *  Verification Point:
 *    - Invoice#1 state = "Paid"
 *    - Amount Due = $0 (the difference was written off)
 *    - In the "Payments" tab there is exactly 1 payment record, with amount = PartialAmount
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted/paid invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - "Mark invoice as fully paid" writes off the remaining balance so a single partial payment closes
 *    the invoice. If Odoo requires a "Post Difference In" write-off account and it is empty, it is set
 *    to WRITEOFF_ACCOUNT (confirmed via live exploration). "Actually Received($)" is set per payment.
 */

const SKIP_CLEANUP_OPP = true;
// "Post Difference In" write-off account. "Mark invoice as fully paid" requires it (Validate is
// silently rejected if empty). Leave '' to pick the FIRST available account from the dropdown
// (name-independent, confirmed working in exploration), or set a specific account name here.
const WRITEOFF_ACCOUNT = '';

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.10 - Reseller pays partially then Mark invoice as fully paid (write-off)', () => {
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

  test('TC.-B.3.10: Verify a partial payment with "Mark invoice as fully paid" writes off the balance', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.10 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let partialAmount = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}")`);
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-18)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
    });

    await test.step('Pre-condition #2 - Step 19: PartialAmount = round(InvoiceTotal#1 / 2, 2) (the rest is written off)', async () => {
      partialAmount = round2(setup.invoiceTotal / 2);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | PartialAmount = ${partialAmount} | write-off = ${round2(setup.invoiceTotal - partialAmount)}`);
      expect(partialAmount).toBeGreaterThan(0);
      expect(partialAmount).toBeLessThan(setup.invoiceTotal);
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

    await test.step('Steps to reproduce - Step 2: On Invoice#1, click "Register Payment"', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickRegisterPayment();
      console.log('✓ Register Payment dialog opened');
    });

    await test.step('Steps to reproduce - Step 3: In the popup, set Payment Amount = PartialAmount', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled balance: "${prefilled}"`);
      await invoicePage.fillPaymentAmount(partialAmount.toFixed(2));
      console.log(`✓ Payment Amount set to PartialAmount = ${partialAmount.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 4: Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Mark invoice as fully paid"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diffVisible, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
      const marked = await invoicePage.selectPaymentDifferenceMarkFullyPaid();
      expect(marked, '"Mark invoice as fully paid" should be selected').toBeTruthy();
      // "Mark invoice as fully paid" requires a "Post Difference In" write-off account (empty by default;
      // Validate is silently rejected without it). Set it to a named account if configured, else pick the
      // first available account from the dropdown (name-independent).
      expect(await invoicePage.isWriteoffAccountVisible(), 'A "Post Difference In" write-off account field should appear').toBeTruthy();
      if (WRITEOFF_ACCOUNT) {
        await invoicePage.setPostDifferenceAccount(WRITEOFF_ACCOUNT);
      } else {
        const acct = await invoicePage.selectFirstWriteoffAccount();
        expect(acct, 'A write-off account should be selected').toBeTruthy();
      }
      console.log('✓ Payment Difference = "Mark invoice as fully paid" (write-off account set)');
    });

    await test.step('Steps to reproduce - Step 5: Set Actually Received($) = PartialAmount', async () => {
      await invoicePage.fillActuallyReceived(partialAmount.toFixed(2));
      console.log(`✓ Actually Received($) set to ${partialAmount.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 6: Click "Validate"', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ Payment validated (remaining balance written off)');
    });

    await test.step('Verification Point: Invoice Paid, Amount Due $0 (difference written off), and the Payments tab holds exactly 1 record = PartialAmount', async () => {
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
      console.log(`  - status="${status}" amountDue="${amountDue}" | rows=${rowCount} | amounts=${JSON.stringify(payAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.10 - Paid Invoice via write-off (1 partial payment)');

      expect(status, 'Invoice#1 should be "Paid" after "Mark invoice as fully paid"').toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due should be $0 (difference written off)').toBeCloseTo(0, 2);
      expect(rowCount, 'There should be exactly 1 payment record').toBe(1);
      expect(payAmounts[0], 'The single payment amount should equal PartialAmount').toBeCloseTo(partialAmount, 2);
      console.log('✅ "Mark invoice as fully paid" wrote off the balance: invoice Paid from a single partial payment');
    });
  });
});
