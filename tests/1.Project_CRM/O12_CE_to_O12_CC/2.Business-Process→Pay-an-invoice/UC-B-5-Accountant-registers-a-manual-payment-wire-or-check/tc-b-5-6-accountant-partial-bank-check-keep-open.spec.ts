import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceForPartialPayment, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-3-partial-payment.helper';

/**
 * ===========================================================================
 *  UC-B-5  -  Accountant registers a manual payment (wire or check)
 * ===========================================================================
 *  Test Case ID    : TC.-B.5.6
 *  Manual TC ID    : UC-B.5.6   (folder UC-B-5-Accountant-registers-a-manual-payment-wire-or-check)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice; then as Faye (accountant) register ONE PARTIAL
 *    manual check payment (half the total) through the "Bank Check" Payment Journal and choose
 *    "Keep open" - and verify the invoice stays "Open" with Amount Due = the remaining balance and a
 *    single Payments-tab record (Bank Check) for the partial amount.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.5\.6:" --project=chromium
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
 *    1-19. Login as Thomas; create the deal-registration Opportunity; create the Deal Element:
 *              - Pricelist      = Public Pricelist_USD
 *              - Payment terms  = Immediate Payment
 *              - Product / Qty  = one product Qty 1
 *          New Quotation; Confirm; Create invoice (Invoiceable
 *          lines) > Create and view invoices; Validate; note Invoice#1 + InvoiceTotal#1.
 *          PartialAmount = round(InvoiceTotal#1 / 2, 2) (remaining = InvoiceTotal#1 - PartialAmount).
 *
 *  Steps to reproduce  (as Faye - accountant account):
 *    1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *    2. Click "Register Payment"
 *    3. In the popup, set Payment Journal = Bank Check
 *    4. Set Payment Amount = PartialAmount (less than the full amount due)
 *    5. Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Keep open"
 *    6. Set Actually Received($) = PartialAmount
 *    7. Click "Validate" -> the partial payment is recorded (invoice stays open)
 *
 *  Verification Point:
 *    1. Invoice#1 state = "Open" (NOT Paid - a partial payment leaves it open)
 *    2. Amount Due = InvoiceTotal#1 - PartialAmount (the remaining balance, > 0)
 *    3. In the "Payments" tab, the payment record has Payment Journal = Bank Check
 *    4. In the "Payments" tab, the payment record amount = PartialAmount
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; posted invoice retained (cleanup SKIPPED, O12 convention) - a partial-paid invoice
 *    is still posted and cannot be cleanly deleted.
 *  - "Keep open" (payment_difference_handling = open) records the partial and leaves the balance due.
 *    "Actually Received($)" is set per payment; the invoice residual is computed on the Payment Amount.
 */

const SKIP_CLEANUP_OPP = true;
const JOURNAL = 'Bank Check';

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.5.6 - Accountant registers a partial manual payment (Bank Check, Keep open)', () => {
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
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.5.6: Accountant registers a partial Bank Check payment (Keep open) - invoice stays Open', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.5.6 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };
    let partialAmount = 0;
    let remaining = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log(`Pre-condition #1: Internal Note #1 prepared (Opp "${oppName}", Contact "${leadName}", Partner "${DEAL_REGISTRATION.partnerCompanyName}", Journal "${JOURNAL}")`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-19)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
      partialAmount = round2(setup.invoiceTotal / 2);
      remaining = round2(setup.invoiceTotal - partialAmount);
      console.log(`  - InvoiceTotal#1 = ${setup.invoiceTotal} | PartialAmount = ${partialAmount} | remaining = ${remaining}`);
      expect(partialAmount, 'PartialAmount should be a positive partial (< total)').toBeGreaterThan(0);
      expect(partialAmount, 'PartialAmount should be less than the full total').toBeLessThan(setup.invoiceTotal);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 validated');
    });

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
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
      expect(opened, 'Faye should open Invoice#1 in the back-office').toBe(setup.invoiceNumber);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    await test.step(`Step 3: In the popup, set Payment Journal = ${JOURNAL}`, async () => {
      const options = await invoicePage.getPaymentJournalOptions().catch(() => [] as string[]);
      console.log(`  - Available Payment Journal options: ${JSON.stringify(options)}`);
      const journalSet = await invoicePage.selectPaymentJournal(JOURNAL);
      expect(journalSet, `Step 3: Payment Journal should be selectable as "${JOURNAL}" (offered: ${JSON.stringify(options)})`).toBeTruthy();
    });

    await test.step('Step 4: Set Payment Amount = PartialAmount (less than the full amount due)', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled balance: "${prefilled}" | PartialAmount = ${partialAmount.toFixed(2)}`);
      await invoicePage.fillPaymentAmount(partialAmount.toFixed(2));
      console.log(`✓ Payment Amount set to PartialAmount = ${partialAmount.toFixed(2)}`);
    });

    await test.step('Step 5: Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Keep open"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diffVisible, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
      const kept = await invoicePage.selectPaymentDifferenceKeepOpen();
      expect(kept, '"Keep open" should be selected').toBeTruthy();
      console.log('✓ Payment Difference = "Keep open"');
    });

    await test.step('Step 6: Set Actually Received($) = PartialAmount', async () => {
      await invoicePage.fillActuallyReceived(partialAmount.toFixed(2));
      console.log(`✓ Actually Received($) set to PartialAmount = ${partialAmount.toFixed(2)}`);
    });

    await test.step('Step 7: Click "Validate" -> the partial payment is recorded (invoice stays open)', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Partial payment validated (invoice stays open for the remaining balance)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - partial Bank Check payment recorded');
    });

    let finalStatus = '', amountDue = '';
    await test.step('Verification Point 1: Invoice#1 state = "Open" (NOT Paid - a partial payment leaves it open)', async () => {
      // Reload once and read; the partial payment should NOT close the invoice (stays Open).
      for (let attempt = 1; attempt <= 4; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        finalStatus = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Poll ${attempt}/4: status="${finalStatus}" amountDue="${amountDue}"`);
        if (/Open/i.test(finalStatus)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      expect(finalStatus, 'Invoice#1 state should be "Open" after a partial "Keep open" payment').toMatch(/Open/i);
      expect(finalStatus, 'Invoice#1 should NOT be "Paid" after a partial payment').not.toMatch(/Paid/i);
    });

    await test.step('Verification Point 2: Amount Due = InvoiceTotal#1 - PartialAmount (the remaining balance, > 0)', async () => {
      console.log(`  - Amount Due: "${amountDue}" | expected remaining = ${remaining}`);
      expect(money(amountDue), 'Amount Due should be > 0 (invoice not fully paid)').toBeGreaterThan(0);
      expect(money(amountDue), 'Amount Due should equal InvoiceTotal#1 - PartialAmount').toBeCloseTo(remaining, 2);
    });

    await test.step(`Verification Point 3: In the "Payments" tab, the payment record has Payment Journal = ${JOURNAL}`, async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const journals = await invoicePage.getPaymentColumnValues('Payment Journal');
      console.log(`  - Payment rows: ${rowCount} | journals: ${JSON.stringify(journals)}`);
      expect(rowCount, 'There should be exactly 1 payment record (the partial payment)').toBe(1);
      expect(journals.length, 'The payment record should expose a Payment Journal').toBeGreaterThan(0);
      journals.forEach((j, idx) => expect(j, `Payment #${idx + 1} Payment Journal should be "${JOURNAL}"`).toContain(JOURNAL));
    });

    await test.step('Verification Point 4: In the "Payments" tab, the payment record amount = PartialAmount', async () => {
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      console.log(`  - Payment Amount column: ${JSON.stringify(payAmounts)} | PartialAmount = ${partialAmount}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-B.5.6 - Open Invoice (partial ${JOURNAL} = ${partialAmount}, remaining ${remaining})`);
      expect(payAmounts.length, 'There should be 1 Payment Amount value').toBe(1);
      expect(payAmounts[0], 'The single payment amount should equal PartialAmount').toBeCloseTo(partialAmount, 2);
      console.log(`✅ Partial manual ${JOURNAL} payment recorded: invoice Open, Amount Due = ${remaining}, 1 record = ${partialAmount}`);
    });
  });
});
