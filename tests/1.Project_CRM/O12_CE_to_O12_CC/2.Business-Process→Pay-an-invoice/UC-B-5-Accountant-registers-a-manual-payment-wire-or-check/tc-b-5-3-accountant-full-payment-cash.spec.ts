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
 *  Test Case ID    : TC.-B.5.3
 *  Manual TC ID    : UC-B.5.3   (folder UC-B-5-Accountant-registers-a-manual-payment-wire-or-check)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas build a validated single-product Invoice (no Payer change); then as Faye (accountant)
 *    register ONE full manual payment through the "Cash" Payment Journal (Payment Amount and Actually
 *    Received($) = InvoiceTotal#1, no Payment Difference), and verify the invoice ends Paid with Amount
 *    Due $0 and a single Payments-tab record whose Payment Journal = Cash and Actually Received($) =
 *    InvoiceTotal#1.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.5\.3:" --project=chromium
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
 *     1-19. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *               - Opp name                 = ...
 *               - Contact                  = ...
 *               - Company                  = ...
 *               - Email                    = ...
 *               - Country                  = United States
 *               - State                    = Maryland
 *               - IP                       = ...
 *               - Create manually checkbox = FALSE
 *               - Sales Team               = cleared
 *               - Salesperson              = cleared
 *           CRM Developer Lead form = NAKIVO deal registration*; Assigned
 *           Partner = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; refresh until Company +
 *           Contact populate; create the Deal Element:
 *               - Pricelist      = Public Pricelist_USD
 *               - Payment terms  = Immediate Payment
 *               - Product / Qty  = one product Qty 1
 *           New Quotation; Confirm; Create invoice (Invoiceable lines) >
 *           Create and view invoices; Validate; note Invoice#1 (number) + InvoiceTotal#1 (total).
 *
 *  Steps to reproduce  (as Faye - accountant account):
 *     1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *     2. Click "Register Payment"
 *     3. In the popup, set Payment Journal = Cash
 *     4. Set Payment Amount = InvoiceTotal#1 (the full amount due)
 *     5. Set Actually Received($) = InvoiceTotal#1 (the same value entered in Payment Amount)
 *     6. (No "Payment Difference" appears, because the full amount is paid in one go)
 *     7. Click "Validate" -> the full payment is recorded
 *
 *  Verification Point:
 *     1. Amount Due = $0 (Total due = 0)
 *     2. Invoice#1 state = "Paid"
 *     3. In the "Payments" tab, the payment record has Payment Journal = Cash
 *     4. In the "Payments" tab, the payment record shows Actually Received($) = InvoiceTotal#1
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - Financial chain; validated/paid Invoice cannot be cleanly deleted -> cleanup SKIPPED (O12 convention).
 *  - Pre-condition #2 is pure setup (NOT what this TC verifies) so it runs as ONE grouped block via the
 *    shared helper createValidatedInvoiceForPartialPayment(...) and does NOT change the Payer.
 *  - "Cash" is one of the manual Payment Journals (see [[register-payment-journal-options]]); the journal
 *    is asserted applied, with getPaymentJournalOptions() logged for diagnosis.
 */

const SKIP_CLEANUP_OPP = true;
const JOURNAL = 'Cash';

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.5.3 - Accountant registers a manual payment (Cash)', () => {
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

  test('TC.-B.5.3: Accountant registers a manual cash payment for the full invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.5.3 ${compactDateTime}`;
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0 };

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - Contact name : ${leadName} | Company email : ${companyEmail}`);
      console.log(`  - Assigned Partner (Reseller) : ${DEAL_REGISTRATION.partnerCompanyName}`);
      console.log(`  - Payment Journal (for the manual payment) : ${JOURNAL}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    await test.step('Pre-condition #2: As Thomas, create the deal-registration Opportunity and build a validated single-product Invoice (steps 1-19)', async () => {
      setup = await createValidatedInvoiceForPartialPayment(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
      console.log(`  - Invoice#1 = "${setup.invoiceNumber}" | InvoiceTotal#1 = ${setup.invoiceTotal} | URL: ${setup.invoiceUrl}`);
      expect(setup.invoiceNumber, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(setup.invoiceTotal, 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
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
      console.log(`  - Opened invoice: "${opened}" (Invoice#1 = "${setup.invoiceNumber}")`);
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
      console.log(`  - Payment Journal set to "${JOURNAL}": ${journalSet}`);
      expect(journalSet, `Step 3: Payment Journal should be selectable as "${JOURNAL}" (offered: ${JSON.stringify(options)})`).toBeTruthy();
    });

    let paymentAmount1 = '';
    await test.step('Step 4: Set Payment Amount = InvoiceTotal#1 (the full amount due)', async () => {
      const defaultAmount = await invoicePage.getPaymentAmount();
      console.log(`  - Default Payment Amount (full due): "${defaultAmount}" | InvoiceTotal#1: ${setup.invoiceTotal}`);
      paymentAmount1 = setup.invoiceTotal.toFixed(2);
      await invoicePage.fillPaymentAmount(paymentAmount1);
      console.log(`✓ Payment Amount set to the full amount due: ${paymentAmount1}`);
    });

    await test.step('Step 5: Set Actually Received($) = InvoiceTotal#1 (the same value entered in Payment Amount)', async () => {
      await invoicePage.fillActuallyReceived(paymentAmount1);
      console.log(`✓ Actually Received($) set to: ${paymentAmount1}`);
    });

    await test.step('Step 6: (No "Payment Difference" appears, because the full amount is paid in one go)', async () => {
      const diffVisible = await invoicePage.isPaymentDifferenceVisible();
      console.log(`  - Payment Difference field visible: ${diffVisible} (expected false for a full payment)`);
      expect(diffVisible, 'Step 6: No "Payment Difference" should appear when the full amount is paid in one go').toBeFalsy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-B.5.3 - Register Payment (${JOURNAL}, full amount, no Payment Difference)`);
    });

    await test.step('Step 7: Click "Validate" -> the full payment is recorded', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after recording the payment: "${status}"`);
      console.log('✓ Full cash payment recorded');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - full cash payment recorded');
    });

    let finalStatus = '', amountDue = '';
    await test.step('Verification Point 1: Amount Due = $0 (Total due = 0)', async () => {
      for (let attempt = 1; attempt <= 6; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        finalStatus = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Poll ${attempt}/6: status="${finalStatus}" amountDue="${amountDue}"`);
        if (/Paid/i.test(finalStatus)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }
      console.log(`  - Amount Due: "${amountDue}"`);
      expect(money(amountDue), 'Amount Due should be 0 after the full payment').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point 2: Invoice#1 state = "Paid"', async () => {
      console.log(`  - Invoice state: "${finalStatus}"`);
      expect(finalStatus, 'Invoice#1 state should be "Paid"').toMatch(/Paid/i);
    });

    await test.step(`Verification Point 3: In the "Payments" tab, the payment record has Payment Journal = ${JOURNAL}`, async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const journals = await invoicePage.getPaymentColumnValues('Payment Journal');
      console.log(`  - Payment rows: ${rowCount} | journals: ${JSON.stringify(journals)}`);
      expect(rowCount, 'There should be exactly 1 payment record (one full payment)').toBe(1);
      expect(journals.length, 'The payment record should expose a Payment Journal').toBeGreaterThan(0);
      journals.forEach((j, idx) => expect(j, `Payment #${idx + 1} Payment Journal should be "${JOURNAL}"`).toContain(JOURNAL));
    });

    await test.step('Verification Point 4: In the "Payments" tab, the payment record shows Actually Received($) = InvoiceTotal#1', async () => {
      let receivedValues = await invoicePage.getPaymentColumnValues('Actually Received');
      if (receivedValues.length === 0) {
        const single = await invoicePage.getActuallyReceivedFromPaymentsTab().catch(() => '');
        if (single) receivedValues = [single];
      }
      const received = receivedValues.map(money);
      console.log(`  - Actually Received($) on the Payments tab: ${JSON.stringify(receivedValues)} | InvoiceTotal#1 = ${setup.invoiceTotal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `TC.-B.5.3 - Invoice Paid (${JOURNAL}, Actually Received = ${setup.invoiceTotal})`);
      expect(received.length, 'The payment record should expose an Actually Received($) value').toBeGreaterThan(0);
      received.forEach((r, idx) =>
        expect(r, `Payment #${idx + 1} Actually Received($) should equal InvoiceTotal#1`).toBeCloseTo(setup.invoiceTotal, 2)
      );
      console.log(`✅ Manual cash payment recorded: Amount Due = $0, state = Paid, Payment Journal = ${JOURNAL}, Actually Received = ${setup.invoiceTotal}`);
    });
  });
});
