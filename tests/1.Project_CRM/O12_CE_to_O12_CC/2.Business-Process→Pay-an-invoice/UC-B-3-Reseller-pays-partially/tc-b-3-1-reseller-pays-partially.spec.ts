import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-3  -  Reseller pays partially
 * ===========================================================================
 *  Test Case ID    : TC.-B.3.1
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    As Thomas, create a deal-registration Opportunity, build a single-product Deal Element, confirm
 *    the Quotation and post a validated Invoice (capturing Invoice#1 + InvoiceTotal#1); then as Faye
 *    (accountant) register the total in 3 installments ("Keep open" for the first two, final pays it
 *    off) and verify the invoice ends Paid - Amount Due $0, Actually Received = InvoiceTotal#1, and the
 *    Payments tab holds exactly 3 payment records of Installment#1/#2/#3.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.3\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values
 *    (test-data/CRM-deal_registration/deal-registration.note.ts -> generateDealRegistrationNote()).
 *
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *     1-9. Login as Thomas; CRM > view list > CREATE; enter Opp name / Contact / Company / Email,
 *          Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team +
 *          Salesperson cleared); CRM Developer Lead form = NAKIVO deal registration*; Assigned Partner
 *          = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; refresh until Company + Contact populate.
 *    10. Click "Deal Element" button to create a new Deal Element
 *    11. Set Payment terms = Immediate Payment
 *    12. In Order Lines, "Add a product" -> select ONE product (Product#1), Quantity = 1 (small deal, NO approval); SAVE
 *    13. Click "New Quotation" -> wait until created -> click "Confirm"
 *    14. Wait until "Create invoice" button appears, then click it
 *    15. In Invoice Order popup, select the first option "Invoiceable lines"
 *    16. Click "Create and view invoices" button
 *    17. Wait until the invoice is created completely; on the invoice screen click "Validate"
 *    18. Note Invoice#1 (number) and InvoiceTotal#1 (total)
 *    19. Split InvoiceTotal#1 into 3 installments (3rd = exact remainder so it closes the invoice):
 *          Installment#1 = round(InvoiceTotal#1 / 3, 2)
 *          Installment#2 = round(InvoiceTotal#1 / 3, 2)
 *          Installment#3 = InvoiceTotal#1 - Installment#1 - Installment#2
 *        (#1 + #2 + #3 == InvoiceTotal#1 exactly; #1/#2 are partial -> Keep open; #3 pays off the balance.)
 *
 *  Steps to reproduce  (as Faye - accountant):
 *     1. Use the account of Faye (accountant) to login successful, then open Invoice#1 URL
 *     2. On Invoice#1, click "Register Payment"
 *     3. In the popup, set Payment Amount = Installment#1
 *     4. Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Keep open"
 *     5. Set Actually Received($) = Installment#1
 *     6. Click "Validate"
 *     7. On Invoice#1, click "Register Payment"
 *     8. Set Payment Amount = Installment#2
 *     9. Click outside the field -> "Payment Difference" appears -> select "Keep open"
 *    10. Set Actually Received($) = Installment#2
 *    11. Click "Validate" -> payment #2 is recorded
 *    12. On Invoice#1, click "Register Payment"
 *    13. Set Payment Amount = Installment#3
 *    14. Set Actually Received($) = Installment#3
 *    15. Click "Validate" -> payment is complete
 *
 *  Verification Point:
 *     - Invoice#1 state = "Paid"
 *     - Amount Due = $0
 *     - Actually Received = InvoiceTotal#1
 *     - In the "Payments" tab there are exactly 3 payment records, with amounts =
 *       Installment#1, Installment#2, Installment#3 respectively
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - This test creates a financial chain (Opportunity -> Deal Element -> Quotation -> Sales Order ->
 *    VALIDATED -> PAID Invoice). A posted/paid Invoice cannot be cleanly deleted, so per the O12
 *    convention cleanup is SKIPPED by default (the records are retained).
 *  - Faye (accountant) DOES expose "Register Payment" on an invoice (unlike the Salesperson role).
 *  - "Keep open" is the default Payment-Difference handling; steps 4/9 click it explicitly to mirror the
 *    manual step and guarantee a partial (not write-off) payment. The final installment equals the
 *    remaining balance, so no Payment Difference appears for payment #3.
 *  - "Actually Received($)" does NOT auto-fill from Payment Amount (it stays 0 unless typed), so steps
 *    5/10/14 set it = Installment#N per payment; their sum is what the Verification asserts = InvoiceTotal#1.
 *  - InvoiceTotal#1 is the invoice grand total (NET of the automatic Reseller Partner Discount). The
 *    installments are derived from that actual total, so the split is self-consistent.
 */

const SKIP_CLEANUP_OPP = true; // posted/paid Invoice cannot be cleanly deleted -> retain (O12 convention; see TC.-B.1.1 / TC.-A.8.1)

// Parse a money string ("$ 279.65", "279.65") -> number.
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const round2 = (n: number): number => Math.round(n * 100) / 100;

test.describe('TC.-B.3.1 - Reseller pays partially', () => {
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

  test('TC.-B.3.1: Verify Reseller pays partially', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // long financial chain + 3 sequential payments
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

    // ── Pre-condition #1: build the deal-registration Internal Note with fresh dynamic values ──
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.3.1 ${compactDateTime}`;

    // Captured facts used by the Faye verification.
    let invoiceUrl = '';     // Invoice#1 backend form URL
    let invoiceNumber1 = ''; // Invoice#1
    let invoiceTotal1 = 0;   // InvoiceTotal#1 (NET grand total)
    let installment1 = 0;
    let installment2 = 0;
    let installment3 = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name: ${oppName}`);
      console.log(`  - Contact name: ${leadName} | Company email: ${companyEmail}`);
      console.log(`  - Assigned Partner: ${DEAL_REGISTRATION.partnerCompanyName}`);
    });

    // ── Pre-condition #2 - Steps 1-9: create the deal-registration Opportunity as Thomas ──
    await test.step('Pre-condition #2 - Steps 1-9: Login as Thomas; CRM > view list > CREATE; enter Opp/Contact/Company/Email, Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team + Salesperson cleared); CRM Developer Lead form; Assigned Partner; Internal Note #1; SAVE; refresh until Company + Contact populate', async () => {
      createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
        oppName,
        contactName: leadName,
        companyEmail,
        internalNote,
        stepPrefix: 'Create deal-registration Opportunity',
      });
      // Step 9: refresh until the Company + Contact fields populate (async Contact creation).
      const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(leadName);
      console.log(`  - Contact field value: "${contactValue}"`);
      expect(contactFieldFound, 'Step 9: Company + Contact should populate in Opp #1').toBeTruthy();
    });

    await test.step('Pre-condition #2 - Step 10: Click "Deal Element" button to create a new Deal Element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Pre-condition #2 - Step 11: Set Payment terms = Immediate Payment', async () => {
      // The Deal Element auto-populates Pricelist = Public Pricelist_USD; ensure it (prices depend on it).
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Payment terms = Immediate Payment (Pricelist = Public Pricelist_USD)');
    });

    await test.step('Pre-condition #2 - Step 12: In Order Lines, "Add a product" -> select ONE product (Product#1), Quantity = 1, then SAVE the Deal Element', async () => {
      await dealElementPage.dismissErrorDialog();
      // Empty product name -> open the "Add a product" dropdown and select the first option (a single
      // product at Qty 1 -> small deal, under the approval threshold so the Quotation needs no approval).
      const added = await dealElementPage.addProduct('');
      console.log(added ? '  - Single product selected (Qty 1)' : '  - Could not add a product');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('✓ Deal Element saved with one product (Qty 1)');
    });

    await test.step('Pre-condition #2 - Step 13: Click "New Quotation" -> wait until created -> click "Confirm"', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log('✓ Quotation created');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Quotation confirmed to a Sales Order');
    });

    await test.step('Pre-condition #2 - Step 14: Wait until the "Create invoice" button appears, then click it', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ CREATE INVOICE pressed (Invoice Order popup opened)');
    });

    await test.step('Pre-condition #2 - Step 15: In the Invoice Order popup, select the first option "Invoiceable lines"', async () => {
      await invoicePage.selectInvoiceableLines();
    });

    await test.step('Pre-condition #2 - Step 16: Click "Create and view invoices" button', async () => {
      const ms = await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(ms / 1000).toFixed(1)}s)`);
    });

    await test.step('Pre-condition #2 - Step 17: Wait until the invoice is created completely; on the invoice screen click "Validate"', async () => {
      const status = await invoicePage.clickValidateAndWaitPosted();
      console.log(`  - Invoice status after VALIDATE: "${status}"`);
      expect(status, 'The Invoice should be posted (Open/Posted) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      console.log('✓ Invoice validated');
    });

    await test.step('Pre-condition #2 - Step 18: Note Invoice#1 (number) and InvoiceTotal#1 (total)', async () => {
      invoiceUrl = page.url();
      invoiceNumber1 = await invoicePage.getInvoiceNumber();
      invoiceTotal1 = money(await invoicePage.getInvoiceTotal());
      console.log(`  - Invoice#1 = "${invoiceNumber1}" | InvoiceTotal#1 = ${invoiceTotal1} | URL: ${invoiceUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.1 - Validated Invoice (Invoice#1)');
      expect(invoiceNumber1, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(invoiceTotal1, 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(invoiceUrl, 'Invoice#1 URL should be captured').toContain('model=account.invoice');
    });

    await test.step('Pre-condition #2 - Step 19: Split InvoiceTotal#1 into 3 installments (3rd = exact remainder)', async () => {
      installment1 = round2(invoiceTotal1 / 3);
      installment2 = round2(invoiceTotal1 / 3);
      installment3 = round2(invoiceTotal1 - installment1 - installment2);
      const sum = round2(installment1 + installment2 + installment3);
      console.log(`  - Installment#1 = ${installment1} | Installment#2 = ${installment2} | Installment#3 = ${installment3} | sum = ${sum}`);
      expect(sum, 'Installment#1 + #2 + #3 must equal InvoiceTotal#1 exactly').toBeCloseTo(invoiceTotal1, 2);
      expect(installment1, 'Installment#1 should be a positive partial amount').toBeGreaterThan(0);
      expect(installment1, 'Installment#1 should be less than the full total (partial)').toBeLessThan(invoiceTotal1);
    });

    // ─── Steps to reproduce (as Faye - register 3 installments) ──────────────────

    await test.step('Steps to reproduce - Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 URL', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName}) and opened Invoice#1`);
    });

    await test.step('Steps to reproduce - Step 2: On Invoice#1, click "Register Payment"', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickRegisterPayment();
      console.log('✓ Register Payment dialog opened (payment #1)');
    });

    await test.step('Steps to reproduce - Step 3: In the popup, set Payment Amount = Installment#1', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled balance: "${prefilled}"`);
      await invoicePage.fillPaymentAmount(installment1.toFixed(2));
      console.log(`✓ Payment Amount set to Installment#1 = ${installment1.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 4: Click outside the Payment Amount field -> a "Payment Difference" field appears -> select "Keep open"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diffVisible, 'A "Payment Difference" field should appear for a partial payment').toBeTruthy();
      const kept = await invoicePage.selectPaymentDifferenceKeepOpen();
      expect(kept, '"Keep open" should be selected').toBeTruthy();
      console.log('✓ Payment Difference = "Keep open"');
    });

    await test.step('Steps to reproduce - Step 5: Set Actually Received($) = Installment#1', async () => {
      await invoicePage.fillActuallyReceived(installment1.toFixed(2));
      console.log(`✓ Actually Received($) set to Installment#1 = ${installment1.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 6: Click "Validate"', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ Payment #1 validated (invoice stays open for the remaining balance)');
    });

    await test.step('Steps to reproduce - Step 7: On Invoice#1, click "Register Payment"', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      await invoicePage.clickRegisterPayment();
      console.log('✓ Register Payment dialog opened (payment #2)');
    });

    await test.step('Steps to reproduce - Step 8: Set Payment Amount = Installment#2', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled remaining balance: "${prefilled}"`);
      await invoicePage.fillPaymentAmount(installment2.toFixed(2));
      console.log(`✓ Payment Amount set to Installment#2 = ${installment2.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 9: Click outside the field -> "Payment Difference" appears -> select "Keep open"', async () => {
      const diffVisible = await invoicePage.blurPaymentAmountAndAwaitDifference();
      expect(diffVisible, 'A "Payment Difference" field should appear for the second partial payment').toBeTruthy();
      const kept = await invoicePage.selectPaymentDifferenceKeepOpen();
      expect(kept, '"Keep open" should be selected').toBeTruthy();
      console.log('✓ Payment Difference = "Keep open"');
    });

    await test.step('Steps to reproduce - Step 10: Set Actually Received($) = Installment#2', async () => {
      await invoicePage.fillActuallyReceived(installment2.toFixed(2));
      console.log(`✓ Actually Received($) set to Installment#2 = ${installment2.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 11: Click "Validate" -> payment #2 is recorded', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ Payment #2 validated');
    });

    await test.step('Steps to reproduce - Step 12: On Invoice#1, click "Register Payment"', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.getInvoiceNumber().catch(() => '');
      await invoicePage.clickRegisterPayment();
      console.log('✓ Register Payment dialog opened (payment #3 - final)');
    });

    await test.step('Steps to reproduce - Step 13: Set Payment Amount = Installment#3', async () => {
      const prefilled = await invoicePage.getPaymentAmount().catch(() => '');
      console.log(`  - Pre-filled remaining balance: "${prefilled}"`);
      await invoicePage.fillPaymentAmount(installment3.toFixed(2));
      // Installment#3 equals the remaining balance, so no Payment Difference appears; setting Actually
      // Received next (step 14) blurs the Payment Amount field and fires its onchange.
      console.log(`✓ Payment Amount set to Installment#3 = ${installment3.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 14: Set Actually Received($) = Installment#3', async () => {
      await invoicePage.fillActuallyReceived(installment3.toFixed(2));
      console.log(`✓ Actually Received($) set to Installment#3 = ${installment3.toFixed(2)}`);
    });

    await test.step('Steps to reproduce - Step 15: Click "Validate" -> payment is complete', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ Final payment validated');
    });

    // ─── Verification Point ──────────────────────────────────────────────────────

    await test.step('Verification Point: Invoice#1 state = "Paid", Amount Due = $0, Actually Received = InvoiceTotal#1, and the Payments tab holds exactly 3 records of Installment#1/#2/#3', async () => {
      // Reload-poll until the invoice posts to "Paid" after the final payment.
      let status = '';
      let amountDue = '';
      for (let attempt = 1; attempt <= 6; attempt++) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await invoicePage.dismissErrorDialog();
        await invoicePage.getInvoiceNumber().catch(() => '');
        status = await invoicePage.getInvoiceStatus().catch(() => '');
        amountDue = await invoicePage.getAmountDue().catch(() => '');
        console.log(`  - Status poll ${attempt}/6: status="${status}" amountDue="${amountDue}"`);
        if (/Paid/i.test(status)) break;
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }

      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount')).map(money);
      const actuallyReceived = (await invoicePage.getPaymentColumnValues('Actually Received')).map(money);
      const actuallyReceivedTotal = round2(actuallyReceived.reduce((s, v) => s + v, 0));

      console.log(`  - Final status="${status}" amountDue="${amountDue}"`);
      console.log(`  - Payment rows=${rowCount} | Payment Amounts=${JSON.stringify(payAmounts)}`);
      console.log(`  - Actually Received column=${JSON.stringify(actuallyReceived)} | total=${actuallyReceivedTotal} | InvoiceTotal#1=${invoiceTotal1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.3.1 - Paid Invoice + Payments tab (3 records)');

      // 1) Invoice state = Paid
      expect(status, 'Invoice#1 state should be "Paid"').toMatch(/Paid/i);
      // 2) Amount Due = $0
      expect(money(amountDue), 'Amount Due should be $0').toBeCloseTo(0, 2);
      // 3) exactly 3 payment records
      expect(rowCount, 'The Payments tab should hold exactly 3 payment records').toBe(3);
      expect(payAmounts.length, 'There should be 3 Payment Amount values').toBe(3);
      // 4) the 3 payment amounts = Installment#1/#2/#3 (compare as a sorted multiset)
      const expectedSorted = [installment1, installment2, installment3].sort((a, b) => a - b);
      const actualSorted = [...payAmounts].sort((a, b) => a - b);
      for (let i = 0; i < 3; i++) {
        expect(actualSorted[i], `Payment #${i + 1} amount should match an installment`).toBeCloseTo(expectedSorted[i], 2);
      }
      // 5) Actually Received (sum across the 3 payments) = InvoiceTotal#1
      expect(actuallyReceivedTotal, 'Actually Received total should equal InvoiceTotal#1').toBeCloseTo(invoiceTotal1, 2);

      console.log('✅ Reseller partial-payment flow verified: invoice Paid, Amount Due $0, 3 installments recorded, Actually Received = InvoiceTotal#1');
    });
  });
});
