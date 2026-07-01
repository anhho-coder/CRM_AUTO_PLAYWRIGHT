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
 *  Test Case ID    : TC.-B.3.4
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-26
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice (Invoice#1 + InvoiceTotal#1); then as Faye
 *    pay it in 4 installments (first 3 partial with "Keep open", 4th pays off the remaining balance)
 *    and verify the invoice ends Paid - Amount Due $0 - with exactly 4 payment records.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.4:" --project=chromium
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
 *    19. Split into 4 installments: #1..#3 = round(InvoiceTotal#1 / 4, 2);
 *        #4 = InvoiceTotal#1 - #1 - #2 - #3 (exact remainder, closes the invoice).
 *
 *  Steps to reproduce  (as Faye - accountant):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *    2. Register a partial payment in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#1
 *          - Payment Difference   = Keep open
 *          - Actually Received($) = Installment#1
 *    3. Register a partial payment in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#2
 *          - Payment Difference   = Keep open
 *          - Actually Received($) = Installment#2
 *    4. Register a partial payment in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#3
 *          - Payment Difference   = Keep open
 *          - Actually Received($) = Installment#3
 *    5. Register a payment of the remaining balance in the Register Payment popup, then Validate:
 *          - Payment Amount       = Installment#4
 *          - Actually Received($) = Installment#4
 *
 *  Verification Point:
 *    - Invoice#1 state = "Paid"
 *    - Amount Due = $0
 *    - Actually Received = InvoiceTotal#1
 *    - In the "Payments" tab there are exactly 4 payment records, with amounts = Installment#1..#4
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted/paid invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - "Keep open" for installments #1..#3; #4 = remaining balance closes the invoice (no Payment
 *    Difference). "Actually Received($)" is set per payment (it does not auto-fill).
 */

const SKIP_CLEANUP_OPP = true;
const INSTALLMENT_COUNT = 4;

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.4 - Reseller pays partially (4 installments)', () => {
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

  test('TC.-B.3.4: Verify Reseller pays partially in 4 installments', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.4 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let installments: number[] = [];

    const payInstallment = async (amount: number, keepOpen: boolean): Promise<void> => {
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
    };

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}")`);
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-18)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
    });

    await test.step(`Pre-condition #2 - Step 19: Split InvoiceTotal#1 into ${INSTALLMENT_COUNT} installments (last = exact remainder)`, async () => {
      const base = round2(setup.invoiceTotal / INSTALLMENT_COUNT);
      installments = Array.from({ length: INSTALLMENT_COUNT - 1 }, () => base);
      installments.push(round2(setup.invoiceTotal - base * (INSTALLMENT_COUNT - 1)));
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | installments = ${JSON.stringify(installments)} | sum = ${round2(installments.reduce((s, v) => s + v, 0))}`);
      expect(round2(installments.reduce((s, v) => s + v, 0))).toBeCloseTo(setup.invoiceTotal, 2);
      installments.forEach((v) => expect(v).toBeGreaterThan(0));
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

    for (let n = 0; n < INSTALLMENT_COUNT; n++) {
      const isLast = n === INSTALLMENT_COUNT - 1;
      const label = isLast
        ? `Steps to reproduce - Step ${n + 2}: Register a payment of Installment#${n + 1} (the remaining balance, Actually Received = Installment#${n + 1}), then Validate`
        : `Steps to reproduce - Step ${n + 2}: Register a partial payment of Installment#${n + 1} with "Keep open" (Actually Received = Installment#${n + 1}), then Validate`;
      await test.step(label, async () => {
        await payInstallment(installments[n], !isLast);
        console.log(`✓ Installment#${n + 1} = ${installments[n].toFixed(2)} paid${isLast ? ' (closes the invoice)' : ' (Keep open)'}`);
      });
    }

    await test.step(`Verification Point: Invoice Paid, Amount Due $0, Actually Received = InvoiceTotal#1, and exactly ${INSTALLMENT_COUNT} payment records = Installment#1..#${INSTALLMENT_COUNT}`, async () => {
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
      const arTotal = round2(actuallyReceived.reduce((s, v) => s + v, 0));
      console.log(`  - status="${status}" amountDue="${amountDue}" | rows=${rowCount} | amounts=${JSON.stringify(payAmounts)} | ARtotal=${arTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-B.3.4 - Paid Invoice + ${INSTALLMENT_COUNT} payment records`);

      expect(status, 'Invoice#1 should be "Paid"').toMatch(/Paid/i);
      expect(money(amountDue), 'Amount Due should be $0').toBeCloseTo(0, 2);
      expect(rowCount, `The Payments tab should hold exactly ${INSTALLMENT_COUNT} payment records`).toBe(INSTALLMENT_COUNT);
      const expectedSorted = [...installments].sort((a, b) => a - b);
      const actualSorted = [...payAmounts].sort((a, b) => a - b);
      for (let i = 0; i < INSTALLMENT_COUNT; i++) {
        expect(actualSorted[i], `Payment #${i + 1} amount should match an installment`).toBeCloseTo(expectedSorted[i], 2);
      }
      expect(arTotal, 'Actually Received total should equal InvoiceTotal#1').toBeCloseTo(setup.invoiceTotal, 2);
      console.log(`✅ ${INSTALLMENT_COUNT}-installment partial payment verified: invoice Paid, Amount Due $0, ${INSTALLMENT_COUNT} records, Actually Received = InvoiceTotal#1`);
    });
  });
});
