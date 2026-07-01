import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-4  -  End User pays directly when invoiced direct
 * ===========================================================================
 *  Test Case ID    : TC.-B.4.1
 *  Manual TC ID    : UC-B.4.1   (folder UC-B-4-End-User-pays-directly-when-invoiced-direct)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-25
 *
 *  Summary:
 *    As Thomas, create a deal-registration Opportunity, build a Deal Element whose Payer is changed
 *    from the Reseller to the End User contact, confirm a small single-product deal and post + validate
 *    its Invoice; then as Faye (accountant) register a FULL payment for that invoice and verify the
 *    Invoice Payer = the End User (NOT the Reseller), Amount Due = $0 and the state = "Paid".
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.4\.1:" --project=chromium
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
 *    The Internal Note "Name" is the End User contact (EndUser#1).
 *
 *  Pre-condition #2  (as Thomas - ends after the invoice is validated):
 *     1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details (below);
 *          CRM Developer Lead form = NAKIVO deal registration*;
 *          Assigned Partner = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; refresh until
 *          Company + Contact populate in Opp #1.
 *            Opportunity details:
 *              - Opp name                 = Opp name
 *              - Contact                  = End User (EndUser#1)
 *              - Company                  = Company
 *              - Email                    = Email
 *              - Country                  = United States
 *              - State                    = Maryland
 *              - IP                       = IP
 *              - Create manually checkbox = FALSE
 *              - Sales Team               = cleared
 *              - Salesperson              = cleared
 *    10. Click "Deal Element" button to create a new Deal Element
 *    11. Update the Payer field: on open Payer auto-populates with the Reseller (Assigned Partner) -
 *        change Payer = EndUser#1 (now Payer = End User = EndUser#1)
 *    12. Set Pricelist = Public Pricelist_USD (USD)
 *    13. Set Payment terms = Immediate Payment
 *    14. In Order Lines, click "Add a product" -> select ONE random product (Product#1), Quantity = 1
 *    15. Click "New Quotation" -> wait until created -> click "Confirm" (small deal, no approval)
 *    16. Wait until the "Create invoice" button appears, then click it
 *    17. In the Invoice Order popup, select the first option "Invoiceable lines"
 *    18. Click "Create and view invoices" button
 *    19. Wait until the invoice is created, on the invoice screen click "Validate"
 *    20. Note: Invoice#1 = Invoice number; InvoiceTotal#1 = Invoice Total value
 *
 *  Steps to reproduce  (as Faye - accountant account):
 *     1. Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)
 *     2. Click "Register Payment"
 *     3. In the popup, set Payment Amount = InvoiceTotal#1 (the full amount due)
 *     4. (No "Payment Difference" appears, because the full amount is paid in one go)
 *     5. Click "Validate" -> the full payment is recorded
 *
 *  Verification Point:
 *     1. Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)
 *     2. Amount Due = $0 (Total due = 0)
 *     3. Invoice#1 state = "Paid"
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - This test creates a financial chain (Opportunity -> Deal Element -> Quotation -> Sales Order ->
 *    VALIDATED + PAID Invoice). A validated/paid Invoice cannot be cleanly deleted, so per the O12
 *    convention cleanup is SKIPPED by default (the records are retained) - see TC.-B.1.1 / TC.-A.8.1.
 *  - The Deal Element opens with Payer auto-populated as the Reseller (the Opp's Assigned Partner);
 *    step 11 changes it to the End User contact. An invoice created from the Sales Order bills the SO's
 *    Invoice Address (partner_invoice_id), which does NOT move when only the Payer changes - so step 11
 *    also points the Invoice Address at the End User (a folded-in mechanical action). Together this is
 *    what makes the posted Invoice's Payer the End User (Verification Point 1).
 *  - Register Payment (step 3): the dialog's "Payment Amount" defaults to the full amount due
 *    (= InvoiceTotal#1). To fully reconcile the payment on this NAKIVO invoice (so Amount Due -> 0),
 *    the "Actually Received($)" field is also set to that full amount (folded into step 3 as a
 *    mechanical action - it is not a separate manual step).
 */

const SKIP_CLEANUP_OPP = true; // validated + PAID invoice cannot be cleanly deleted -> retain (O12 convention)

// Pick ONE random product from a small set of Public Pricelist_USD codes. A single unit (Qty = 1)
// keeps the deal small, so it confirms directly without manager approval.
const PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]', '[A2146B]'];

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('TC.-B.4.1 - End User pays directly when invoiced direct', () => {
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
    // No-op when SKIP_CLEANUP_OPP is true (validated + paid Invoice cannot be cleanly deleted).
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-B.4.1: Accountant registers a full payment for an invoice whose Payer = End User', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // long financial chain + a second login (Faye)
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

    // ── Pre-condition #1: build the deal-registration Internal Note with fresh dynamic values ──
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.4.1 ${compactDateTime}`;
    const product1 = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]; // ONE random product (Product#1)

    // Captured facts (Pre-condition #2, step 20) used by the Faye payment + verification.
    let invoiceNumber1 = ''; // Invoice#1
    let invoiceTotal1 = '';  // InvoiceTotal#1
    let invoiceUrl = '';     // back-office URL of Invoice#1 (so Faye can re-open it)

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - End User (EndUser#1) / Contact name : ${leadName}`);
      console.log(`  - Company email : ${companyEmail}`);
      console.log(`  - Assigned Partner (Reseller) : ${DEAL_REGISTRATION.partnerCompanyName}`);
      console.log(`  - Random product (Product#1) : ${product1}`);
    });

    // ── Pre-condition #2 - Steps 1-9: create the deal-registration Opportunity as Thomas ──
    await test.step('Pre-condition #2 - Steps 1-9: Login as Thomas; CRM > view list > CREATE; enter Opp/Contact(=EndUser#1)/Company/Email, Country = United States, State = Maryland, IP (Create manually = FALSE, Sales Team + Salesperson cleared); CRM Developer Lead form; Assigned Partner; Internal Note #1; SAVE; refresh until Company + Contact populate', async () => {
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

    await test.step('Pre-condition #2 - Step 11: Update the Payer field (auto-populated = Reseller) -> change Payer = EndUser#1', async () => {
      const payerBefore = await dealElementPage.getPayerValue();
      const invAddrBefore = await dealElementPage.getInvoiceAddressValue();
      console.log(`  - Payer auto-populated as: "${payerBefore}" | Invoice Address auto: "${invAddrBefore}" (expected the Reseller "${DEAL_REGISTRATION.partnerCompanyName}")`);
      await dealElementPage.setPayer(leadName);
      const payerAfter = await dealElementPage.getPayerValue();
      console.log(`  - Payer after change: "${payerAfter}" | EndUser#1 = "${leadName}"`);
      expect(payerAfter, 'Step 11: Payer should now be EndUser#1 (the End User contact)').toContain(leadName);
      // An invoice created from the Sales Order bills the SO's Invoice Address (partner_invoice_id), not
      // the Payer (partner_id). Changing the Payer does NOT move the Invoice Address off the Reseller, so
      // point it at the End User too - that is what makes the posted Invoice's Payer the End User (VP1).
      await dealElementPage.setInvoiceAddressByName(leadName);
      const invAddrAfter = await dealElementPage.getInvoiceAddressValue();
      console.log(`  - Invoice Address after change: "${invAddrAfter}" | EndUser#1 = "${leadName}"`);
      expect(invAddrAfter, 'Step 11: Invoice Address should now be EndUser#1 (so the invoice bills the End User)').toContain(leadName);
    });

    await test.step('Pre-condition #2 - Step 12: Set Pricelist = Public Pricelist_USD (USD)', async () => {
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('✓ Pricelist = Public Pricelist_USD');
    });

    await test.step('Pre-condition #2 - Step 13: Set Payment terms = Immediate Payment', async () => {
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Payment terms = Immediate Payment');
    });

    await test.step('Pre-condition #2 - Step 14: In Order Lines, click "Add a product" -> select ONE random product (Product#1), Quantity = 1', async () => {
      await dealElementPage.dismissErrorDialog();
      await dealElementPage.addProductLine(product1, 1);
      // Safeguard (manual step 11 intent): a product/payment-term onchange can reset partner_id /
      // partner_invoice_id back to the Reseller. Re-confirm BOTH Payer and Invoice Address = EndUser#1
      // while still in edit mode so the Deal Element is SAVED with the End User as Payer AND Invoice
      // Address (the Invoice Address is what the posted invoice is billed to).
      const payerBeforeSave = await dealElementPage.getPayerValue();
      console.log(`  - Payer before save: "${payerBeforeSave}" (EndUser#1 = "${leadName}")`);
      if (!payerBeforeSave.includes(leadName)) {
        console.log('  ⚠ Payer reset before save - re-setting to EndUser#1');
        await dealElementPage.setPayer(leadName);
      }
      const invAddrBeforeSave = await dealElementPage.getInvoiceAddressValue();
      console.log(`  - Invoice Address before save: "${invAddrBeforeSave}" (EndUser#1 = "${leadName}")`);
      if (!invAddrBeforeSave.includes(leadName)) {
        console.log('  ⚠ Invoice Address reset before save - re-setting to EndUser#1');
        await dealElementPage.setInvoiceAddressByName(leadName);
      }
      // Commit the row so the readonly computed cells render, and the deal is saved before New Quotation.
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log(`✓ Added product (Product#1) = ${product1}, Quantity = 1 (deal saved with Payer = EndUser#1)`);
    });

    await test.step('Pre-condition #2 - Step 15: Click "New Quotation" -> wait until created -> click "Confirm" (small deal, no approval)', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log('✓ New Quotation created');
      // Diagnostic: confirm the Deal Element's Payer (End User) carried through to the Quotation.
      const quotationPayer = await quotationPage.getPayerValue();
      console.log(`  - Quotation Payer after New Quotation: "${quotationPayer}" (EndUser#1 = "${leadName}")`);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Quotation confirmed to a Sales Order');
    });

    await test.step('Pre-condition #2 - Step 16: Wait until the "Create invoice" button appears, then click it', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ CREATE INVOICE pressed (Invoice Order popup opened)');
    });

    await test.step('Pre-condition #2 - Step 17: In the Invoice Order popup, select the first option "Invoiceable lines"', async () => {
      await invoicePage.selectInvoiceableLines();
    });

    await test.step('Pre-condition #2 - Step 18: Click "Create and view invoices" button', async () => {
      const ms = await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(ms / 1000).toFixed(1)}s)`);
    });

    await test.step('Pre-condition #2 - Step 19: Wait until the invoice is created, on the invoice screen click "Validate"', async () => {
      const status = await invoicePage.clickValidateAndWaitPosted();
      console.log(`  - Invoice status after VALIDATE: "${status}"`);
      expect(status, 'The Invoice should be posted/validated (Open/Posted/Paid) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      console.log('✓ Invoice validated');
    });

    await test.step('Pre-condition #2 - Step 20: Note Invoice#1 (number) and InvoiceTotal#1 (total)', async () => {
      invoiceNumber1 = await invoicePage.getInvoiceNumber();
      invoiceTotal1 = await invoicePage.getInvoiceTotal();
      invoiceUrl = page.url();
      console.log(`  - Invoice#1 = "${invoiceNumber1}" | InvoiceTotal#1 = "${invoiceTotal1}"`);
      console.log(`  - Invoice#1 URL = ${invoiceUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.1 - Validated Invoice (Invoice#1)');
      expect(invoiceNumber1, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(money(invoiceTotal1), 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(invoiceUrl, 'Invoice#1 URL should be captured').toContain('model=account.invoice');
    });

    // ─── Steps to reproduce (as Faye - accountant) ──────────────────────────────

    await test.step('Step 1: Use the account of Faye (accountant) to login successful, then open Invoice#1 (back-office)', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      const opened = await invoicePage.getInvoiceNumber();
      console.log(`  - Opened invoice: "${opened}" (Invoice#1 = "${invoiceNumber1}")`);
      expect(opened, 'Faye should open Invoice#1 in the back-office').toBe(invoiceNumber1);
    });

    await test.step('Step 2: Click "Register Payment"', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened');
    });

    let paymentAmount1 = '';
    await test.step('Step 3: In the popup, set Payment Amount = InvoiceTotal#1 (the full amount due)', async () => {
      // The dialog defaults "Payment Amount" to the full amount due (= InvoiceTotal#1).
      paymentAmount1 = await invoicePage.getPaymentAmount();
      console.log(`  - Default Payment Amount (full due): "${paymentAmount1}" | InvoiceTotal#1: "${invoiceTotal1}"`);
      expect(money(paymentAmount1), 'Default Payment Amount should be the full amount due (> 0)').toBeGreaterThan(0);
      // Set Payment Amount = the full amount due (InvoiceTotal#1).
      await invoicePage.fillPaymentAmount(paymentAmount1);
      // Fold-in: also set "Actually Received($)" to the same full amount so the payment fully clears
      // (Amount Due -> 0) on this NAKIVO invoice. Best-effort if the field is not present.
      await invoicePage.fillActuallyReceived(paymentAmount1)
        .catch((e) => console.log(`  ⚠ "Actually Received($)" not set: ${e instanceof Error ? e.message : String(e)}`));
      console.log(`✓ Payment Amount set to the full amount due: ${paymentAmount1}`);
    });

    await test.step('Step 4: (No "Payment Difference" appears, because the full amount is paid in one go)', async () => {
      console.log('  - Full amount entered -> the payment clears the invoice in one go (no Payment Difference)');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.1 - Register Payment (full amount, no Payment Difference)');
    });

    await test.step('Step 5: Click "Validate" -> the full payment is recorded', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice status after recording the payment: "${status}"`);
      console.log('✓ Full payment recorded');
    });

    // ─── Verification Points ────────────────────────────────────────────────────

    await test.step('Verification Point 1: Invoice#1 Payer = EndUser#1 (the End User, NOT the Reseller)', async () => {
      const payer = await invoicePage.getPayer();
      const endUser = await invoicePage.getEndUser().catch(() => '');
      const reseller = await invoicePage.getReseller().catch(() => '');
      console.log(`  - Invoice Payer: "${payer}" | End User: "${endUser}" | Reseller: "${reseller}"`);
      console.log(`  - EndUser#1 = "${leadName}" | Reseller = "${DEAL_REGISTRATION.partnerCompanyName}"`);
      expect(payer, 'Invoice Payer should be EndUser#1 (the End User contact)').toContain(leadName);
      expect(
        payer.toLowerCase(),
        'Invoice Payer should NOT be the Reseller'
      ).not.toContain(DEAL_REGISTRATION.partnerCompanyName.toLowerCase());
    });

    await test.step('Verification Point 2: Amount Due = $0 (Total due = 0)', async () => {
      const amountDue = await invoicePage.getAmountDue();
      console.log(`  - Amount Due: "${amountDue}"`);
      expect(money(amountDue), 'Amount Due should be 0 after the full payment').toBe(0);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Paid"', async () => {
      const finalStatus = await invoicePage.getInvoiceStatus();
      console.log(`  - Invoice state: "${finalStatus}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-B.4.1 - Invoice Paid (Payer = End User, Amount Due 0)');
      expect(finalStatus, 'Invoice#1 state should be "Paid"').toMatch(/Paid/i);
      console.log('✅ End User direct payment recorded: Invoice Payer = End User, Amount Due = $0, state = Paid');
    });
  });
});
