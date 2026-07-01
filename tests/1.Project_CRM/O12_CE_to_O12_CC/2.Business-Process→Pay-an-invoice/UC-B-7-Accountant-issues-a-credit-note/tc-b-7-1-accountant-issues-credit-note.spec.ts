import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, OpportunityPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createPaidInvoiceAsThomasAndFaye, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-b-7-credit-note.helper';

/**
 * ===========================================================================
 *  UC-B-7  -  Accountant/Salesperson issues a credit note
 * ===========================================================================
 *  Test Case ID    : TC.-B.7.1
 *  Manual TC ID    : UC-B.7.1   (folder UC-B-7-Accountant-issues-a-credit-note)
 *  Jira            : (manual TC - Business Process > Pay an invoice)
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    Build a Paid Invoice#1 (Thomas validates a single-product invoice; Faye registers the full payment).
 *    Then, as Yulia Malihonova (accountant who can see the "Add Credit Note" button), issue a draft credit
 *    note against Invoice#1 (Reason = Refund, Accounting Date = today), validate it, and register the full
 *    refund (Payment Method Type = Manual); verify CreditNote#1 ends with Amount Due = $0 and state = "Paid".
 *
 *  Command to run:
 *    npx playwright test --grep "TC\.-B\.7\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 with fresh dynamic values
 *    (test-data/CRM-deal_registration/deal-registration.note.ts -> generateDealRegistrationNote()).
 *
 *  Pre-condition #2  (create the invoice, then register a full payment so the invoice is Paid):
 *     1-19. As Thomas: login; CRM > view list > CREATE; enter the Opportunity details:
 *             - Opp name                  = TEST + Test Case ID + current date time
 *             - Contact name              = Name from Internal Note#1
 *             - CompanyName               = Company Name Lead 1 (from Internal Note#1)
 *             - Email                     = Email from Internal Note#1
 *             - Country                   = United States
 *             - State                     = Maryland
 *             - IP                        = IP from Internal Note#1
 *             - Create manually checkbox  = FALSE
 *             - Sales Team                = cleared
 *             - Salesperson               = cleared
 *             - CRM Developer Lead form   = NAKIVO deal registration*
 *             - Assigned Partner          = TEST-Reseller#Automation-Jun10
 *             - Internal Note             = Internal Note #1
 *           SAVE; refresh until Company + Contact populate; set the Deal Element:
 *             - Pricelist                 = Public Pricelist_USD (USD)
 *             - Payment terms             = Immediate Payment
 *             - Product                   = ONE random product (Product#1), Qty 1
 *           New Quotation; Confirm; Create invoice (Invoiceable lines) > Create and view invoices;
 *           Validate; note Invoice#1 (number) + InvoiceTotal#1 (total).
 *     20-24. As Faye (accountant): login; open Invoice#1; Register Payment; Payment Amount = InvoiceTotal#1;
 *           Actually Received($) = InvoiceTotal#1; Validate -> the full payment is recorded and Invoice#1
 *           state becomes "Paid".
 *
 *  Steps to reproduce  (as Yulia Malihonova - accountant account, who can see "Add Credit Note" in Invoice screen):
 *     1. On the Invoice#1 screen (now Paid), click the "Add Credit Note" button
 *     2. In the Credit Note popup, input:
 *          - Credit Method     = select "Create a draft credit note"
 *          - Reason            = Refund
 *          - Accounting Date   = today
 *     3. Click "Add Credit Note" -> the list of credit notes opens
 *     4. Open the credit note just created (sort by "Created on", latest record) -> CreditNote#1
 *     5. On the CreditNote#1 detail screen, click the "Validate" button
 *     6. Click the "Register Payment" button
 *     7. In the Register Payment popup, input:
 *          - Payment Amount        = InvoiceTotal#1
 *          - Actually Received($)   = InvoiceTotal#1
 *          - Payment Method Type   = select Manual
 *     8. Click the "Validate" button
 *
 *  Verification Point (on the CreditNote#1 screen):
 *     1. CreditNote#1 Amount Due = $0 (Total due = 0)
 *     2. CreditNote#1 state = "Paid"
 * ===========================================================================
 *
 *  IMPLEMENTATION NOTES
 *  - The "Add Credit Note" header button is PERMISSION-GATED: it is rendered-but-hidden
 *    (o_invisible_modifier) for some accountants (e.g. Faye) and VISIBLE for others (e.g. Yulia). The
 *    "Steps to reproduce" therefore run as Yulia Malihonova (users.accountance_ic_yulia), who can click it.
 *  - The refund wizard's settable required date is "Credit Note Date" (date_invoice); the wizard's
 *    "Accounting Date" (date) field is hidden, so "Accounting Date = today" is applied to the visible date.
 *  - Submitting the wizard ("Add Credit Note" = invoice_refund) opens a LIST of the invoice's credit
 *    note(s); the just-created one (the only row) is opened as CreditNote#1.
 *  - Financial chain; a posted invoice + posted/paid credit note cannot be cleanly deleted -> Opp cleanup
 *    SKIPPED (O12 convention). The created Opportunity + CreditNote#1 URLs are captured for traceability.
 *  - A credit note is an account.invoice (type out_refund); its detail screen IS an invoice form, so the
 *    InvoicePage readers/actions (status, Amount Due, Validate, Register Payment) are reused on it.
 */

const SKIP_CLEANUP_OPP = true; // posted invoice + paid credit note cannot be cleanly deleted (O12 convention)

const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
const todayMMDDYYYY = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

test.describe('TC.-B.7.1 - Accountant issues a credit note', () => {
  let createdOppUrl: string | null = null;
  let creditNoteUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // No screenshot here: beforeEach only clears cookies (page is still about:blank - nothing on the UI to monitor).
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const op = new OpportunityPage(page);
      await op.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    console.log(`afterEach: CreditNote#1 URL (left in place): ${creditNoteUrl ?? 'n/a'}`);
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('TC.-B.7.1: Accountant issues a credit note and registers the full refund (Credit Note Paid)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-B.7.1 ${compactDateTime}`;
    const accountingDate = todayMMDDYYYY();
    let setup = { oppUrl: '', invoiceUrl: '', invoiceNumber: '', invoiceTotal: 0, paidStatus: '' };
    let creditNoteTotal = 0;

    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with dynamic values');
      console.log(`  - Opportunity name : ${oppName}`);
      console.log(`  - Contact name : ${leadName} | Company email : ${companyEmail}`);
      console.log(`  - Assigned Partner (Reseller) : ${DEAL_REGISTRATION.partnerCompanyName}`);
    });

    await test.step('Pre-condition #2: Create the invoice (Thomas) then register a full payment (Faye) so Invoice#1 is Paid (steps 1-24)', async () => {
      setup = await createPaidInvoiceAsThomasAndFaye(page, { oppName, contactName: leadName, companyEmail, internalNote });
      createdOppUrl = setup.oppUrl;
      console.log(`  - Invoice#1 = "${setup.invoiceNumber}" | InvoiceTotal#1 = ${setup.invoiceTotal} | state = "${setup.paidStatus}"`);
      expect(setup.invoiceNumber, 'Invoice#1 should be assigned').toBeTruthy();
      expect(setup.invoiceTotal, 'InvoiceTotal#1 should be a positive number').toBeGreaterThan(0);
      expect(setup.paidStatus, 'Invoice#1 should be Paid before issuing the credit note').toMatch(/Paid/i);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Invoice#1 Paid');
    });

    await test.step('Step 1: On the Invoice#1 screen (now Paid), click the "Add Credit Note" button (as Yulia Malihonova, who can see it)', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_yulia.username, users.accountance_ic_yulia.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Yulia (${users.accountance_ic_yulia.displayName})`);
      await page.goto(setup.invoiceUrl, { waitUntil: 'domcontentloaded' });
      await invoicePage.dismissErrorDialogWithRetry();
      await invoicePage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      const opened = await invoicePage.getInvoiceNumber();
      expect(opened, 'Yulia should open the Paid Invoice#1').toBe(setup.invoiceNumber);
      await invoicePage.clickAddCreditNote(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Add Credit Note refund wizard opened');
    });

    await test.step('Step 2: In the Credit Note popup, set Credit Method = "Create a draft credit note", Reason = Refund, Accounting Date = today', async () => {
      const methodSet = await invoicePage.selectCreditMethod('Create a draft credit note');
      expect(methodSet, 'Credit Method should be "Create a draft credit note"').toBeTruthy();
      await invoicePage.fillCreditNoteReason('Refund');
      await invoicePage.setCreditNoteAccountingDate(accountingDate);
      console.log(`✓ Credit note wizard filled (Reason = Refund, Accounting Date = ${accountingDate})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Credit Note wizard filled');
    });

    await test.step('Step 3: Click "Add Credit Note" -> the list of credit notes opens', async () => {
      await invoicePage.submitAddCreditNote(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Credit note created (list of credit notes opened)');
    });

    await test.step('Step 4: Open the credit note just created (sort by "Created on", latest record) -> CreditNote#1', async () => {
      creditNoteUrl = await invoicePage.openLatestCreditNote(CommonUtils.waitTimes.abnormalWait);
      const cnStatus = await invoicePage.getInvoiceStatus().catch(() => '');
      creditNoteTotal = money(await invoicePage.getInvoiceTotal().catch(() => '0'));
      console.log(`  - CreditNote#1 | state = "${cnStatus}" | total = ${creditNoteTotal} (InvoiceTotal#1 = ${setup.invoiceTotal}) | URL: ${creditNoteUrl}`);
      expect(creditNoteUrl, 'CreditNote#1 URL should be captured').toContain('model=account.invoice');
      expect(creditNoteTotal, 'CreditNote#1 total should mirror InvoiceTotal#1').toBeCloseTo(setup.invoiceTotal, 2);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CreditNote#1 opened (draft)');
    });

    await test.step('Step 5: On the CreditNote#1 detail screen, click the "Validate" button', async () => {
      await invoicePage.clickValidate(CommonUtils.waitTimes.abnormalWait);
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Open');
      console.log(`  - CreditNote#1 status after VALIDATE: "${status}"`);
      expect(status, 'CreditNote#1 should be posted (Open) after VALIDATE').toMatch(/Open|Posted|Paid/i);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CreditNote#1 validated (Open)');
    });

    await test.step('Step 6: Click the "Register Payment" button', async () => {
      await invoicePage.clickRegisterPayment(CommonUtils.waitTimes.abnormalWait);
      console.log('✓ Register Payment dialog opened on CreditNote#1');
    });

    await test.step('Step 7: In the Register Payment popup, set Payment Amount = InvoiceTotal#1, Actually Received($) = InvoiceTotal#1, Payment Method Type = Manual', async () => {
      const full = creditNoteTotal.toFixed(2); // CreditNote#1 total mirrors InvoiceTotal#1
      await invoicePage.fillPaymentAmount(full);
      await invoicePage.fillActuallyReceived(full);
      const methodTypeSet = await invoicePage.selectPaymentMethodType('Manual');
      console.log(`  - Payment Amount/Actually Received = ${full} | Payment Method Type "Manual": ${methodTypeSet}`);
      expect(methodTypeSet, 'Payment Method Type should be "Manual"').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Register Payment (Manual, full refund)');
    });

    await test.step('Step 8: Click the "Validate" button', async () => {
      await invoicePage.clickValidate_RegisterPayment();
      await invoicePage.dismissErrorDialogWithRetry();
      const status = await invoicePage.waitForInvoiceStatus('Paid');
      console.log(`  - CreditNote#1 status after recording the refund: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - refund recorded on CreditNote#1');
    });

    let finalStatus = '', amountDue = '';
    await test.step('Verification Point 1: CreditNote#1 Amount Due = $0 (Total due = 0)', async () => {
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
      console.log(`  - CreditNote#1 Amount Due: "${amountDue}"`);
      expect(money(amountDue), 'CreditNote#1 Amount Due should be 0 after the full refund').toBeCloseTo(0, 2);
    });

    await test.step('Verification Point 2: CreditNote#1 state = "Paid"', async () => {
      console.log(`  - CreditNote#1 state: "${finalStatus}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - CreditNote#1 Paid (Amount Due $0)');
      expect(finalStatus, 'CreditNote#1 state should be "Paid"').toMatch(/Paid/i);
      console.log('✅ Credit note issued and fully refunded: CreditNote#1 Amount Due = $0, state = Paid');
    });
  });
});
