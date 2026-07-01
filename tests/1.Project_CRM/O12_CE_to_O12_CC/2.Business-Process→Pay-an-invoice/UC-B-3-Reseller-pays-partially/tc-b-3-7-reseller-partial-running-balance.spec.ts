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
 *  Test Case ID    : TC.-B.3.7
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-26
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye pay it in 3 installments and
 *    verify the RUNNING BALANCE - after each partial payment the Amount Due drops by exactly that
 *    installment (Open after #1/#2), and after the final installment the invoice is Paid (Amount Due $0).
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.7:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
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
 *
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *    1-18. Login as Thomas; create the deal-registration Opportunity; Deal Element (Immediate Payment +
 *          one product Qty 1); New Quotation; Confirm; Create invoice (Invoiceable lines) > Create and
 *          view invoices; Validate; note Invoice#1 + InvoiceTotal#1.
 *    19. Split into 3 installments: #1 = #2 = round(InvoiceTotal#1 / 3, 2); #3 = exact remainder.
 *
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *    2. Register a partial payment in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#1
 *          - Payment Difference   = Keep open
 *          - Actually Received($) = Installment#1
 *       verify Amount Due = InvoiceTotal#1 - Installment#1 and state Open
 *    3. Register a partial payment in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#2
 *          - Payment Difference   = Keep open
 *          - Actually Received($) = Installment#2
 *       verify Amount Due = InvoiceTotal#1 - Installment#1 - Installment#2 and state Open
 *    4. Register a payment of the remaining balance in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#3
 *          - Actually Received($) = Installment#3
 *       verify Amount Due = $0 and state Paid
 *
 *  Verification Point:
 *    - After each partial payment the Amount Due decreases by exactly that installment (running balance).
 *    - Invoice is "Open" after #1 and #2, and "Paid" after #3 (Amount Due $0).
 *    - The "Payments" tab holds exactly 3 payment records = Installment#1/#2/#3.
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted/paid invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - The running-balance assertions happen inside each payment step (after a reload-poll); the final
 *    Verification Point re-confirms Paid + the 3 records. "Actually Received($)" is set per payment.
 */

const SKIP_CLEANUP_OPP = true;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.7 - Reseller pays partially (running balance)', () => {
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

  test('TC.-B.3.7: Verify the Amount Due running balance across partial payments', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.7 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let i1 = 0, i2 = 0, i3 = 0;

    // Pay one installment and return the post-payment {status, amountDue} (after a reload-poll).
    const payInstallmentAndRead = async (amount: number, keepOpen: boolean): Promise<{ status: string; amountDue: string }> => {
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
      await invoicePage.fillActuallyReceived(amount.toFixed(2));
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      let status = '', amountDue = '';
      for (let attempt = 1; attempt <= 5; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        status = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        if (status) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      return { status, amountDue };
    };

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}")`);
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-18)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
    });

    await test.step('Pre-condition #2 - Step 19: Split InvoiceTotal#1 into 3 installments (3rd = exact remainder)', async () => {
      i1 = round2(setup.invoiceTotal / 3);
      i2 = round2(setup.invoiceTotal / 3);
      i3 = round2(setup.invoiceTotal - i1 - i2);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | i1 = ${i1} | i2 = ${i2} | i3 = ${i3}`);
      expect(round2(i1 + i2 + i3)).toBeCloseTo(setup.invoiceTotal, 2);
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

    await test.step('Steps to reproduce - Step 2: Register Installment#1 ("Keep open"), Validate; verify Amount Due = InvoiceTotal#1 - Installment#1 and state Open', async () => {
      const { status, amountDue } = await payInstallmentAndRead(i1, true);
      const expectedDue = round2(setup.invoiceTotal - i1);
      console.log(`  - After #1: status="${status}" amountDue="${amountDue}" | expectedDue=${expectedDue}`);
      expect(status, 'Invoice should be Open after the 1st partial payment').toMatch(/Open/i);
      expect(money(amountDue), 'Amount Due after #1 should be InvoiceTotal#1 - Installment#1').toBeCloseTo(expectedDue, 2);
    });

    await test.step('Steps to reproduce - Step 3: Register Installment#2 ("Keep open"), Validate; verify Amount Due = InvoiceTotal#1 - Installment#1 - Installment#2 and state Open', async () => {
      const { status, amountDue } = await payInstallmentAndRead(i2, true);
      const expectedDue = round2(setup.invoiceTotal - i1 - i2);
      console.log(`  - After #2: status="${status}" amountDue="${amountDue}" | expectedDue=${expectedDue}`);
      expect(status, 'Invoice should still be Open after the 2nd partial payment').toMatch(/Open/i);
      expect(money(amountDue), 'Amount Due after #2 should be InvoiceTotal#1 - Installment#1 - Installment#2').toBeCloseTo(expectedDue, 2);
    });

    await test.step('Steps to reproduce - Step 4: Register Installment#3 (remaining balance), Validate; verify Amount Due = $0 and state Paid', async () => {
      const { status, amountDue } = await payInstallmentAndRead(i3, false);
      console.log(`  - After #3: status="${status}" amountDue="${amountDue}"`);
      expect(status, 'Invoice should be Paid after the final installment').toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due after the final installment should be $0').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point: Invoice Paid, Amount Due $0, and the Payments tab holds exactly 3 records = Installment#1/#2/#3', async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      console.log(`  - rows=${rowCount} | amounts=${JSON.stringify(payAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.7 - Paid Invoice + running-balance payments');

      expect(rowCount, 'The Payments tab should hold exactly 3 payment records').toBe(3);
      const expectedSorted = [i1, i2, i3].sort((a, b) => a - b);
      const actualSorted = [...payAmounts].sort((a, b) => a - b);
      for (let i = 0; i < 3; i++) {
        expect(actualSorted[i], `Payment #${i + 1} amount should match an installment`).toBeCloseTo(expectedSorted[i], 2);
      }
      console.log('✅ Running-balance verified: Amount Due decreased by each installment; invoice Paid after the final payment');
    });
  });
});
