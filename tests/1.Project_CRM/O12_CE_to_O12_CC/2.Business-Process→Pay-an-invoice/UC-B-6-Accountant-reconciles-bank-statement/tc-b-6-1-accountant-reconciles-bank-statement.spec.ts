import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, PaymentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * ===========================================================================
 *  UC-B-6  -  Accountant reconciles bank statement
 * ===========================================================================
 *  Test Case ID    : TC.-B.6.1
 *  Manual TC ID    : UC-B.6.1   (folder UC-B-6-Accountant-reconciles-bank-statement)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-29
 *
 *  Summary:
 *    As Thomas, create a deal-registration Opportunity, build a single-product Deal Element, confirm
 *    the Quotation and post a validated Invoice (capturing Invoice#1 + InvoiceTotal#1). As Faye
 *    (accountant), pre-create a standalone Customer Payment (Payment#1) for the Reseller = InvoiceTotal#1
 *    and read its Journal Entry (JournalItem#1). Then open Invoice#1, click "Add" on JournalItem#1 in the
 *    Outstanding-credits section, and verify the reconciliation row ("Paid on <today>" + InvoiceTotal#1),
 *    Amount Due = $0, state = Paid, and Payment#1 listed in the Payments tab.
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.6\.1:" --project=chromium
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
 *     1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *              - Opp name                 = ...
 *              - Contact                  = Name from Note #1
 *              - Company                  = Company Name Lead 1
 *              - Email                    = ...
 *              - Country                  = United States
 *              - State                    = Maryland
 *              - IP                       = ...
 *              - Create manually checkbox = FALSE
 *              - Sales Team               = cleared
 *              - Salesperson              = cleared
 *          CRM Developer Lead form =
 *          NAKIVO deal registration*; Assigned Partner = TEST-Reseller#Automation-Jun10; Internal
 *          Note #1; SAVE; refresh until Company + Contact populate in Opp #1.
 *    10. Click "Deal Element" button to create new deal element
 *    11. Set Pricelist = Public Pricelist_USD (USD)
 *    12. Set Payment terms = Immediate Payment
 *    13. In Order Lines tab, "Add a product" -> select ONE random product (Product#1), Quantity = 1
 *    14. Click "New Quotation" -> wait until created -> click "Confirm" (small deal, no approval)
 *    15. Wait until "Create invoice" button appears, then click it
 *    16. In Invoice Order popup, select the first option "Invoiceable lines"
 *    17. Click "Create and view invoices" button
 *    18. Wait until the invoice is created completely, on the invoice screen click "Validate"
 *    19. Note Invoice#1 (Invoice number) and InvoiceTotal#1 (Invoice Total value)
 *
 *  Pre-condition #3  (as Faye - accountant - pre-create the standalone payment Payment#1):
 *     1. Use the account of Faye (accountant) to login successful
 *     2. Open the Invoicing module
 *     3. Navigate to Customers > Payments
 *     4. Click "Create" to create a new payment
 *     5. Input the payment details:
 *          - Invoice              = blank
 *          - Payment type         = Receive Money
 *          - Partner type         = Customer
 *          - Partner              = TEST-Reseller#Automation-Jun10
 *          - Payment amount       = InvoiceTotal#1
 *          - Payment Journal      = Bank transfer
 *          - Actually Received($) = InvoiceTotal#1
 *     6. Click "Save"
 *     7. Click "Confirm" -> the payment is created and saved as Payment#1
 *     8. Find the journal entry name: click into "Journal Items" in the created payment
 *     9. Click into a Journal Item record
 *    10. Read the Journal Entry value and save it as JournalItem#1
 *
 *  Steps to reproduce  (as Faye - accountant account):
 *     1. Still in Faye's session, open Invoice#1
 *     2. On the Invoice#1 screen, an "Outstanding credits" section appears below the invoice total,
 *        showing JournalItem#1 with an "Add" button next to it
 *     3. Click the "Add" button of JournalItem#1
 *
 *  Verification Point:
 *     1. A reconciliation row appears with TWO separate columns/cells (assert each cell independently,
 *        NOT as one combined string):
 *          - Column 1 (label)  = "Paid on <today>"   (example: "Paid on 06/25/2026")
 *          - Column 2 (amount) = <InvoiceTotal#1>     (example: "$ 500.00")
 *     2. Amount Due = $0 (Total due = 0)
 *     3. Invoice#1 state = "Paid"
 *     4. In the "Payments" tab, the Payment#1 record is displayed
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - This test creates a financial chain (Opportunity -> Deal Element -> Quotation -> Sales Order ->
 *    VALIDATED Invoice) PLUS a posted, reconciled standalone Customer Payment. A posted/reconciled
 *    invoice + payment cannot be cleanly deleted, so per the O12 convention cleanup is SKIPPED by
 *    default (the records are retained) - see TC.-B.3.1 / TC.-B.4.1.
 *  - Payment#1 partner = the Reseller (TEST-Reseller#Automation-Jun10), which is the invoice's Payer in
 *    the standard deal-registration flow; this makes Payment#1 an Outstanding credit on Invoice#1.
 *  - JournalItem#1 = the payment's Journal Entry (move) name, e.g. "BNK1/2026/0715". It is unique per
 *    run, so the Outstanding-credits "Add" is matched to THIS payment's row (the Reseller may carry
 *    other outstanding credits from earlier runs).
 *  - Pre-condition #3 reaches the Invoicing module + Customer Payments list via their menu actions
 *    (deep-links menu_id=148/action=305 and menu_id=164/action=224 - the same targets the Invoicing >
 *    Customers > Payments menu items open).
 */

const SKIP_CLEANUP_OPP = true; // posted/reconciled Invoice + Payment cannot be cleanly deleted -> retain (O12 convention)

// Pick ONE random product (Product#1). A single unit (Qty = 1) keeps the deal small -> confirms with no approval.
const PRODUCTS = ['[A2151B]', '[A2149B]', '[A2150B]', '[A2146B]'];

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

// today's date in Odoo's MM/DD/YYYY display format (for the "Paid on <today>" reconciliation label).
const todayMMDDYYYY = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.6.1 - Accountant reconciles bank statement', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // Boundary screenshot (REQUIREMENT #3): end of beforeEach (guarded - page may be blank/closing).
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // No-op when SKIP_CLEANUP_OPP is true (posted/reconciled Invoice + Payment cannot be cleanly deleted).
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    // Boundary screenshot (REQUIREMENT #3): end of afterEach (guarded).
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.6.1: Accountant reconciles a bank statement payment against an invoice via Outstanding credits', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // long financial chain + a second login (Faye) + payment + reconcile
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const paymentPage = new PaymentPage(page);

    const reseller = DEAL_REGISTRATION.partnerCompanyName; // TEST-Reseller#Automation-Jun10

    // ── Pre-condition #1: build the deal-registration Internal Note with fresh dynamic values ──
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.6.1 ${compactDateTime}`;
    const product1 = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]; // ONE random product (Product#1)

    // Captured facts used by the Faye payment + verification.
    let invoiceUrl = '';        // Invoice#1 backend form URL
    let invoiceNumber1 = '';    // Invoice#1
    let invoiceTotal1Str = '';  // InvoiceTotal#1 (raw text, e.g. "$ 85.85")
    let invoiceTotal1Num = 0;   // InvoiceTotal#1 (number)
    let paymentUrl = '';        // Payment#1 backend form URL
    let journalItem1 = '';      // JournalItem#1 (the payment's Journal Entry / move name)

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 (fill every <...> placeholder with fresh dynamic values)', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - Contact name (Name from Note #1) : ${leadName}`);
      console.log(`  - Company email : ${companyEmail}`);
      console.log(`  - Assigned Partner (Reseller) : ${reseller}`);
      console.log(`  - Random product (Product#1) : ${product1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
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

    await test.step('Pre-condition #2 - Step 10: Click "Deal Element" button to create new deal element', async () => {
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      console.log('✓ Deal Element form opened');
    });

    await test.step('Pre-condition #2 - Step 11: Set Pricelist = Public Pricelist_USD (USD)', async () => {
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('✓ Pricelist = Public Pricelist_USD');
    });

    await test.step('Pre-condition #2 - Step 12: Set Payment terms = Immediate Payment', async () => {
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('✓ Payment terms = Immediate Payment');
    });

    await test.step('Pre-condition #2 - Step 13: In Order Lines tab, click "Add a product" -> select ONE random product (Product#1), Quantity = 1', async () => {
      await dealElementPage.dismissErrorDialog();
      await dealElementPage.addProductLine(product1, 1);
      // Commit the row so the readonly computed cells render and the deal is saved before New Quotation.
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log(`✓ Added product (Product#1) = ${product1}, Quantity = 1 (deal saved)`);
    });

    await test.step('Pre-condition #2 - Step 14: Click "New Quotation" button -> wait until created -> click "Confirm" (small deal, no approval)', async () => {
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log('✓ New Quotation created');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Quotation confirmed to a Sales Order');
    });

    await test.step('Pre-condition #2 - Step 15: Wait until "Create invoice" button appears, then click it', async () => {
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ CREATE INVOICE pressed (Invoice Order popup opened)');
    });

    await test.step('Pre-condition #2 - Step 16: In Invoice Order popup, select the first option "Invoiceable lines"', async () => {
      await invoicePage.selectInvoiceableLines();
    });

    await test.step('Pre-condition #2 - Step 17: Click "Create and view invoices" button', async () => {
      const ms = await invoicePage.clickCreateAndViewInvoices();
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(ms / 1000).toFixed(1)}s)`);
    });

    await test.step('Pre-condition #2 - Step 18: Wait until the invoice is created completely, on the invoice screen click "Validate"', async () => {
      const status = await invoicePage.clickValidateAndWaitPosted();
      console.log(`  - Invoice status after VALIDATE: "${status}"`);
      expect(status, 'The Invoice should be posted/validated (Open/Posted/Paid) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      console.log('✓ Invoice validated');
    });

    await test.step('Pre-condition #2 - Step 19: Note Invoice#1 (number) and InvoiceTotal#1 (total)', async () => {
      invoiceUrl = page.url();
      invoiceNumber1 = await invoicePage.getInvoiceNumber();
      invoiceTotal1Str = await invoicePage.getInvoiceTotal();
      invoiceTotal1Num = money(invoiceTotal1Str);
      console.log(`  - Invoice#1 = "${invoiceNumber1}" | InvoiceTotal#1 = "${invoiceTotal1Str}" (${invoiceTotal1Num}) | URL: ${invoiceUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Validated Invoice (Invoice#1)');
      expect(invoiceNumber1, 'Invoice#1 should be assigned after VALIDATE').toBeTruthy();
      expect(invoiceTotal1Num, 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(invoiceUrl, 'Invoice#1 URL should be captured').toContain('model=account.invoice');
    });

    // ─── Pre-condition #3 (as Faye - pre-create the standalone payment Payment#1) ─────────────

    await test.step('Pre-condition #3 - Step 1: Use the account of Faye (accountant) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
    });

    await test.step('Pre-condition #3 - Step 2: Open the Invoicing module', async () => {
      await paymentPage.openInvoicingModule();
    });

    await test.step('Pre-condition #3 - Step 3: Navigate to Customers > Payments', async () => {
      await paymentPage.openCustomerPaymentsList();
    });

    await test.step('Pre-condition #3 - Step 4: Click "Create" to create a new payment', async () => {
      await paymentPage.clickCreate();
    });

    await test.step('Pre-condition #3 - Step 5: Input Invoice=blank, Payment type=Receive Money, Partner type=Customer, Partner=TEST-Reseller#Automation-Jun10, Payment amount=InvoiceTotal#1, Payment Journal=Bank transfer, Actually Received($)=InvoiceTotal#1', async () => {
      const amountStr = invoiceTotal1Num.toFixed(2);
      await paymentPage.clearInvoiceField();
      await paymentPage.selectPaymentType('Receive Money');
      await paymentPage.selectPartnerType('Customer');
      await paymentPage.setPartner(reseller);
      await paymentPage.setAmount(amountStr);
      const journal = await paymentPage.selectPaymentJournal('Bank Transfer');
      await paymentPage.setActuallyReceived(amountStr);
      console.log(`  - Payment inputs set: partner="${reseller}", amount=${amountStr}, journal="${journal}", actually received=${amountStr}`);
      const partnerVal = await paymentPage.getPartnerValue();
      expect(partnerVal, 'Payment Partner should be the Reseller').toContain('TEST-Reseller');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment form filled').catch(() => {});
    });

    await test.step('Pre-condition #3 - Step 6: Click "Save"', async () => {
      paymentUrl = await paymentPage.save();
      expect(paymentUrl, 'Payment#1 should be saved (URL should carry a record id)').toMatch(/[#?&]id=\d+/);
    });

    await test.step('Pre-condition #3 - Step 7: Click "Confirm" -> the payment is created and saved as Payment#1', async () => {
      const status = await paymentPage.confirm();
      console.log(`  - Payment#1 status after Confirm: "${status}"`);
      expect(status, 'Payment#1 should be Posted after Confirm').toMatch(/Posted|Reconciled/i);
    });

    await test.step('Pre-condition #3 - Step 8: Find the journal entry name: click into "Journal Items" in the created payment', async () => {
      await paymentPage.clickJournalItems();
    });

    await test.step('Pre-condition #3 - Step 9: Click into a Journal Item record', async () => {
      await paymentPage.openFirstJournalItem();
    });

    await test.step('Pre-condition #3 - Step 10: Read the Journal Entry value and save it as JournalItem#1', async () => {
      journalItem1 = await paymentPage.getJournalEntryName();
      console.log(`  - JournalItem#1 (Journal Entry) = "${journalItem1}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - Payment#1 Journal Entry (JournalItem#1)');
      expect(journalItem1, 'JournalItem#1 (Journal Entry name) should be captured').toBeTruthy();
      expect(journalItem1, 'JournalItem#1 should look like a journal entry name (e.g. BNK1/2026/0715)').toMatch(/\/\d{4}\//);
    });

    // ─── Steps to reproduce (as Faye - accountant) ───────────────────────────────────────────

    await test.step("Steps to reproduce - Step 1: Still in Faye's session, open Invoice#1", async () => {
      await page.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      const opened = await invoicePage.getInvoiceNumber();
      console.log(`  - Opened invoice: "${opened}" (Invoice#1 = "${invoiceNumber1}")`);
      expect(opened, 'Faye should open Invoice#1').toBe(invoiceNumber1);
    });

    await test.step('Steps to reproduce - Step 2: On the Invoice#1 screen, an "Outstanding credits" section appears below the invoice total, showing JournalItem#1 with an "Add" button next to it', async () => {
      const present = await invoicePage.isOutstandingCreditPresent(journalItem1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Outstanding credits (JournalItem#1)');
      expect(present, `The Outstanding-credits section should list JournalItem#1 ("${journalItem1}")`).toBeTruthy();
    });

    await test.step('Steps to reproduce - Step 3: Click the "Add" button of JournalItem#1', async () => {
      const added = await invoicePage.addOutstandingCredit(journalItem1);
      expect(added, 'The "Add" control for JournalItem#1 should be found and clicked').toBeTruthy();
      console.log('✓ Outstanding credit JournalItem#1 added (reconciled against Invoice#1)');
    });

    // ─── Verification Points ──────────────────────────────────────────────────────────────────

    await test.step('Verification Point 1: A reconciliation row appears with TWO separate cells - Column 1 = "Paid on <today>", Column 2 = InvoiceTotal#1 (each cell asserted independently)', async () => {
      const row = await invoicePage.getReconciliationRow();
      const today = todayMMDDYYYY();
      console.log(`  - Reconciliation row: label="${row.label}" | amount="${row.amount}" | today=${today} | InvoiceTotal#1=${invoiceTotal1Str}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Reconciliation row (Paid on <today> + amount)');
      // Column 1 (label) - asserted on its own cell.
      expect(row.label, 'Column 1 should read "Paid on ..."').toMatch(/Paid on/i);
      expect(row.label, `Column 1 should carry today's date (${today})`).toContain(today);
      // Column 2 (amount) - asserted on its own cell.
      expect(money(row.amount), 'Column 2 (amount) should equal InvoiceTotal#1').toBeCloseTo(invoiceTotal1Num, 2);
    });

    await test.step('Verification Point 2: Amount Due = $0 (Total due = 0)', async () => {
      const amountDue = await invoicePage.getAmountDue();
      console.log(`  - Amount Due: "${amountDue}"`);
      expect(money(amountDue), 'Amount Due should be 0 after reconciliation').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point 3: Invoice#1 state = "Paid"', async () => {
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - Invoice#1 state: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Invoice Paid');
      expect(status, 'Invoice#1 state should be "Paid"').toMatch(/Paid/i);
    });

    await test.step('Verification Point 4: In the "Payments" tab, the Payment#1 record is displayed', async () => {
      await invoicePage.clickPaymentsTab();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const rowCount = await invoicePage.getPaymentRowCount();
      const paymentsText = await invoicePage.getPaymentsTabText();
      const payAmounts = (await invoicePage.getPaymentColumnValues('Payment Amount').catch(() => [])).map(money);
      console.log(`  - Payments tab rows=${rowCount} | amounts=${JSON.stringify(payAmounts)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Payments tab (Payment#1 displayed)');
      expect(rowCount, 'The Payments tab should display at least one payment record (Payment#1)').toBeGreaterThan(0);
      // Payment#1 is identified by its full amount = InvoiceTotal#1 (or the journal entry text on the tab).
      const amountMatches = payAmounts.some((a) => Math.abs(a - invoiceTotal1Num) < 0.01);
      const textMatches = paymentsText.includes(journalItem1);
      expect(amountMatches || textMatches, 'Payment#1 (amount = InvoiceTotal#1) should appear in the Payments tab').toBeTruthy();
      console.log('✅ Bank-statement reconciliation verified: reconciliation row (Paid on <today> + InvoiceTotal#1), Amount Due $0, state Paid, Payment#1 in Payments tab');
    });
  });
});
