import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Invoice Page Object
 * Handles all interactions with the Invoice form:
 *   - Invoice creation workflow (from Sales Order)
 *   - Payment registration
 *   - Field reading / verification
 *   - License creation
 */
export class InvoicePage extends BasePage {

  // ─── Action buttons ───────────────────────────────────────────────────────
  // XPath primary, role fallback - the Mig backend theme does not expose the toolbar Edit button
  // through getByRole (see BasePage.editButton): it renders as <i class="fa fa-pencil"/> + <span>Edit</span>,
  // so the accessible name carries a leading space and an anchored regex can never match it.
  private readonly editButtonLoc               = () => this.page.locator("xpath=//button[contains(@class,'o_form_button_edit') or normalize-space(.)='Edit' or normalize-space(.)='EDIT']")
    .or(this.page.getByRole('button', { name: /^\s*Edit\s*$/i }))
    .first();
  private readonly editButtonXPath             = () => this.page.locator("xpath=//button[contains(@class,'button_edit')]");
  private readonly saveButton                  = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  private readonly createInvoiceButton         = () => this.page.locator("//button[@class='btn btn-primary']//span[contains(text(),'Create Invoice')]");
  private readonly createAndViewInvoicesButton = () => this.page.locator("//button[@context=\"{'open_invoices': True}\"]").first();
  private readonly validateButton              = () => this.page.locator("xpath=//button/span[contains(text(),'Validate')]");
  private readonly validateButton_RegisterPayment = () => this.page.locator("xpath=(//button/span[contains(text(),'Validate')])[2]");
  // Robust Register-Payment wizard "Validate" button (anchored on the action name; survives layout/index shifts).
  private readonly registerPaymentValidateByName = () => this.page.locator('xpath=//button[@name="action_validate_invoice_payment"]').first();
  private readonly registerPaymentButton       = () => this.page.locator("xpath=//button/span[contains(text(),'Register Payment')]").filter({ visible: true }).first();
  // "Register Payment" rendered as any visible control (header button OR an item inside the "Action" cog menu)
  private readonly registerPaymentAnyVisible   = () => this.page.locator("xpath=//a[contains(normalize-space(),'Register Payment')] | //button[contains(normalize-space(),'Register Payment')] | //span[contains(normalize-space(),'Register Payment')]").filter({ visible: true }).first();
  private readonly actionMenuButton            = () => this.page.getByRole('button', { name: /^Action$/i }).first();
  // Invoice CANCEL header button (XPath by action name, with role-name fallbacks)
  private readonly cancelInvoiceButton         = () => this.page.locator("xpath=//button[@name='action_invoice_cancel']").or(this.page.getByRole('button', { name: /^CANCEL$/i })).or(this.page.getByRole('button', { name: /^Cancel$/i })).first();
  // "Set to Draft" / "Reset to Draft" button (appears after an invoice is cancelled)
  private readonly setToDraftButton            = () => this.page.locator("xpath=//button[@name='action_invoice_draft' or @name='button_draft']").or(this.page.getByRole('button', { name: /Set to Draft/i })).or(this.page.getByRole('button', { name: /Reset to Draft/i })).first();
  // "OK" button on the "Are you sure you want to cancel this invoice?" confirmation dialog
  private readonly cancelConfirmOkButton       = () => this.page.locator('.modal, .o_dialog').filter({ hasText: /cancel this invoice|are you sure/i }).getByRole('button', { name: /^OK$/i }).first();
  private readonly sendAndPrintButton          = () => this.page.getByRole('button', { name: /SEND & PRINT/i }).or(this.page.getByRole('button', { name: /Send & Print/i })).first();
  // ─── "Send Invoice" wizard (account.invoice.send) ─────────────────────────
  // The wizard footer carries THREE buttons that all POST the same action and differ only by class:
  //   <button name="send_and_print_action" class="send_and_print"> "Send & Print"  (is_print AND is_email)
  //   <button name="send_and_print_action" class="send">           "Send"          (is_email, NOT is_print)
  //   <button name="send_and_print_action" class="print">          "Print"         (is_print, NOT is_email)
  // Only one is ever visible. The old locator - (//button/span[contains(text(),'Send')])[4] - was a
  // positional guess that matched nothing on crm-mig, where the wizard opens with BOTH "Print" and
  // "Email" ticked, so the footer reads "Send & Print" and the plain "Send" button stays hidden.
  private readonly sendWizardDialog            = () => this.page.locator('.o_dialog, .modal').filter({ visible: true }).last();
  private readonly sendWizardPrintCheckbox     = () => this.sendWizardDialog().locator("xpath=.//div[@name='option_print']//input[@type='checkbox']").first();
  private readonly sendWizardFooterButton      = () => this.sendWizardDialog()
    .locator("xpath=.//button[@name='send_and_print_action']")
    .filter({ visible: true })
    .first();
  private readonly sendButton                  = () => this.sendWizardDialog()
    .locator("xpath=.//button[@name='send_and_print_action' and contains(@class,'send') and not(contains(@class,'send_and_print'))]")
    .filter({ visible: true })
    .first();
  private readonly createLicenseButton         = () => this.page.getByRole('button', { name: 'CREATE LICENSE' }).or(this.page.getByRole('button', { name: 'Create License' })).first();

  // ─── Dialog / overlay ─────────────────────────────────────────────────────
  private readonly invoiceDialog               = () => this.page.locator('.o_dialog, .modal');
  private readonly loadingOverlay              = () => this.page.locator('.o_loading, .o_blockUI, [class*="o_loading"]');

  // ─── Form inputs ──────────────────────────────────────────────────────────
  private readonly paymentTermsInput           = () => this.page.getByRole('textbox', { name: /Payment Terms/i }).first();
  /** "Payment Terms" form row - used to read the SAVED (readonly) value. XPath primary, CSS fallback. */
  private readonly paymentTermsRowXPath        = () => this.page.locator('xpath=//tr[td[contains(normalize-space(.),"Payment Terms")] or td/label[contains(normalize-space(.),"Payment Terms")]]').first();
  private readonly paymentTermsRowCss          = () => this.page.locator('tr').filter({ hasText: /Payment Terms/i }).first();
  /** Input field in the Register Payment dialog */
  private readonly paymentAmountInput          = () => this.page.locator('xpath=(//div[@name="amount"]//input)[1]');
  /** "Actually Received($)" input in the Register Payment dialog (robust: anchored on the field name,
   *  with the legacy label-index XPath as a fallback). */
  private readonly actuallyReceivedInput       = () => this.page.locator('xpath=//input[@name="actually_received"]').or(this.page.locator('xpath=((//td//label[contains(text(),"Actually Received")])[3]/following::td/input)[1]')).first();
  // ── Register Payment wizard: "Payment Difference" handling (surfaces when Payment Amount < balance) ──
  // The radiogroup div is always present; it is only meaningful when a difference exists. "Keep open"
  // = data-value="open" (checked by default), "Mark invoice as fully paid" = data-value="reconcile".
  private readonly paymentDifferenceGroup      = () => this.page.locator('xpath=//div[@name="payment_difference_handling"]').first();
  private readonly keepOpenRadioInput          = () => this.page.locator('xpath=//div[@name="payment_difference_handling"]//input[@data-value="open"]').first();
  // The radio input is a visually-hidden Bootstrap custom-control, so the clickable target is its label.
  private readonly keepOpenLabel               = () => this.page.locator('xpath=//div[@name="payment_difference_handling"]//input[@data-value="open"]/following-sibling::label').or(this.page.locator('xpath=//div[@name="payment_difference_handling"]//label[normalize-space()="Keep open"]')).first();
  // "Mark invoice as fully paid" = the reconcile option (write off the difference).
  private readonly markFullyPaidRadioInput     = () => this.page.locator('xpath=//div[@name="payment_difference_handling"]//input[@data-value="reconcile"]').first();
  private readonly markFullyPaidLabel          = () => this.page.locator('xpath=//div[@name="payment_difference_handling"]//input[@data-value="reconcile"]/following-sibling::label').or(this.page.locator('xpath=//div[@name="payment_difference_handling"]//label[normalize-space()="Mark invoice as fully paid"]')).first();
  // "Post Difference In" write-off account (writeoff_account_id) - shown only when "Mark fully paid" is chosen.
  private readonly writeoffAccountInput        = () => this.page.locator('xpath=//div[@name="writeoff_account_id"]//input').first();
  // Register Payment "Payment Journal" (journal_id) - rendered as a native <select> in this wizard.
  private readonly paymentJournalSelect        = () => this.page.locator('xpath=//select[@name="journal_id"]').first();
  private readonly paymentJournalM2OInput      = () => this.page.locator('xpath=//div[@name="journal_id"]//input').first();
  // Register Payment "Payment Method Type" (payment_method_id) - a vertical RADIO group on the
  // credit-note refund payment wizard. Options e.g. "Manual" (default) / "Checks". The radio input is
  // a visually-hidden Bootstrap custom-control, so the clickable target is its sibling <label>.
  private readonly paymentMethodTypeGroup      = () => this.page.locator('xpath=//div[@name="payment_method_id"]').first();
  private readonly paymentMethodTypeLabel      = (label: string) => this.page.locator(`xpath=//div[@name="payment_method_id"]//label[normalize-space()="${label}"]`).first();
  private readonly paymentMethodTypeRadio      = (label: string) => this.page.locator(`xpath=//div[@name="payment_method_id"]//input[@type="radio"][following-sibling::label[normalize-space()="${label}"]]`).first();

  // ── "Add Credit Note" button + refund wizard (account.invoice.refund) ──
  // The header "Add Credit Note" button is permission-gated: it is rendered-but-hidden
  // (o_invisible_modifier) for some accountants (e.g. Faye) and VISIBLE for others (e.g. Yulia).
  // Target the VISIBLE instance (the hidden one carries o_invisible_modifier).
  private readonly addCreditNoteButton         = () => this.page.locator('xpath=//button[normalize-space(.)="Add Credit Note" and not(contains(@class,"o_invisible_modifier"))]').or(this.page.locator('xpath=//button[@name="281"]')).filter({ visible: true }).first();
  // Refund wizard "Credit Method" (filter_refund) - vertical radio; option "Create a draft credit note"
  // = data-value "refund". The radio input is a hidden custom-control, so click its sibling <label>.
  private readonly creditMethodLabel           = (label: string) => this.page.locator(`xpath=//div[@name="filter_refund"]//label[normalize-space()="${label}"]`).first();
  private readonly creditMethodRadio           = (dataValue: string) => this.page.locator(`xpath=//div[@name="filter_refund"]//input[@data-value="${dataValue}"]`).first();
  private readonly creditNoteReasonInput       = () => this.page.locator('xpath=//input[@name="description"]').or(this.page.locator('xpath=//div[@name="description"]//input')).first();
  // The VISIBLE required date in the wizard is "Credit Note Date" (date_invoice); "Accounting Date"
  // (date) is hidden by default. Set date_invoice.
  private readonly creditNoteDateInput         = () => this.page.locator('xpath=//input[@name="date_invoice"]').or(this.page.locator('xpath=//div[@name="date_invoice"]//input')).first();
  private readonly submitRefundButton          = () => this.page.locator('xpath=//button[@name="invoice_refund"]').or(this.page.locator('xpath=//div[contains(@class,"modal")]//button[normalize-space()="Add Credit Note"]')).first();
  private readonly firstDataRow                = () => this.page.locator('tr.o_data_row').first();

  // ─── Notebook tabs ────────────────────────────────────────────────────────
  private readonly paymentsTabLoc              = () => this.page.locator('xpath=//a[contains(normalize-space(),"Payments")]').first();
  private readonly otherInforTabLoc            = () => this.page.locator('xpath=//a[contains(normalize-space(),"Other Info")]').first();
  private readonly invoiceLinesTabLoc          = () => this.page.locator('xpath=//a[contains(normalize-space(),"Invoice Lines")]').first();

  // ─── Read-only field locators ─────────────────────────────────────────────
  private readonly invoiceNumberField          = () => this.page.locator('xpath=(//span[@name="number"])[1]').first();
  private readonly invoiceStatusBar            = () => this.page.locator('.o_statusbar_status').first();
  private readonly totalInCompanyCurrencyLoc   = () => this.page.locator('xpath=//td[contains(@class,"amount_total_company_signed")]').first();
  private readonly paymentAmountOnTabLoc       = () => this.page.locator('xpath=(//td[contains(@title,"Amount")])[1]').first();
  private readonly actuallyReceivedOnTabLoc    = () => this.page.locator('xpath=(//td[contains(@title,"Amount")])[3]').first();
  private readonly endUserLoc                  = () => this.page.locator('xpath=//a[@name="partner_end_user_id"]').first();
  // "Payer" on the NAKIVO invoice = the Customer/billing partner (partner_id). Rendered readonly as a
  // link (like End User / Reseller). XPath primary (anchor), with a field-container fallback.
  private readonly payerLoc                    = () => this.page.locator('xpath=//a[@name="partner_id"]').or(this.page.locator('xpath=//div[@name="partner_id"]//a')).or(this.page.locator('xpath=//div[@name="partner_id"]')).first();
  // The invoice-LINE tree also carries a field named "origin", declared invisible="1" and rendered
  // BEFORE the "Other Info" tab in the DOM - so a bare //span[@name="origin"] resolves to a span
  // that can never become visible. Exclude anything inside the invoice-lines container.
  // NO CSS fallback here on purpose. The invoice-LINE tree also carries a field named "origin",
  // declared invisible="1" and rendered BEFORE the "Other Info" tab in the DOM. A bare
  // span[name="origin"] therefore resolves to a span that can never become visible - and because
  // Playwright's .or() is a UNION, adding it as a fallback puts that same span back in the running
  // and .first() picks it by document order. Keep the scoped XPath alone.
  private readonly sourceDocumentLoc           = () => this.page.locator('xpath=//span[@name="origin"][not(ancestor::div[@name="invoice_line_ids"])]').first();
  //Quoc Anh: Invoice date located in the center of page. 
  private readonly invoiceDateLoc              = () => this.page.locator('xpath=//span[@name="date_invoice"]').first();
  private readonly dueDateLoc                  = () => this.page.locator('xpath=//span[@name="date_due"]').first();
  private readonly distributorLoc              = () => this.page.locator('xpath=//a[@name="distributor_id"]').first();
  private readonly resellerLoc                 = () => this.page.locator('xpath=//a[@name="reseller_id"]').first();
  private readonly salesTeamLoc                = () => this.page.locator('xpath=//a[@name="team_id"]').first();
  private readonly salespersonLoc              = () => this.page.locator('xpath=//a[@name="user_id"]').first();
  private readonly amountDueLoc                = () => this.page.locator('xpath=//span[@name="residual"] | //span[@name="amount_residual"]').first();
  // Invoice grand total (footer "Total" = amount_total). For a Reseller this is the net after the
  // automatic Partner Discount (e.g. line gross $101.00 -> net total $85.85).
  private readonly invoiceTotalLoc            = () => this.page.locator('xpath=//span[@name="amount_total"]').first();
  // ── Invoices LIST view (Customers > Invoices): search box + list table ──
  // The list <table> itself carries class `o_list_view` in this Odoo 12 build (captured live).
  private readonly searchViewInput            = () => this.page.locator('xpath=//input[contains(@class,"o_searchview_input")]').or(this.page.locator('input.o_searchview_input')).first();
  private readonly invoiceListTable           = () => this.page.locator('xpath=//table[contains(@class,"o_list_view")]').or(this.page.locator('table.o_list_view')).first();
  private readonly anyInvoiceListRow          = () => this.page.locator('xpath=//tr[contains(@class,"o_data_row")]').or(this.page.locator('tr.o_data_row')).first();
  // ── Invoice Order wizard (sale.advance.payment.inv): "What do you want to invoice?" radio ──
  // "Invoiceable lines" = the first option (data-value="delivered"), checked by default. The radio
  // input is visually hidden (Bootstrap custom-control), so click its <label>; the input id has a
  // per-render number, so anchor on data-value.
  private readonly invoiceableLinesRadio      = () => this.page.locator('xpath=//div[@name="advance_payment_method"]//input[@data-value="delivered"]').first();
  private readonly invoiceableLinesLabel      = () => this.page.locator('xpath=//div[@name="advance_payment_method"]//input[@data-value="delivered"]/following-sibling::label').or(this.page.locator('xpath=//div[@name="advance_payment_method"]//label[normalize-space()="Invoiceable lines"]')).first();

  constructor(page: Page) {
    super(page);
  }

  /** Escape XPath-significant characters in a product code so brackets match literally. */
  private escapeForXPathContains(text: string): string {
    return text.replace(/["]/g, '');
  }

  /**
   * Click CREATE INVOICE button from Sales Order screen
   * @param timeout - Maximum time to wait for button (default: 10000ms)
   */
  async clickCreateInvoice(timeout: number = 10000): Promise<void> {
    console.log('  - Looking for CREATE INVOICE button');
    
    const button = this.createInvoiceButton();
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found CREATE INVOICE button');
    
    await button.click();
    console.log('  - Clicked CREATE INVOICE button');
    
    // Wait for Invoice Order dialog to appear
    await this.wait(2000);
    
    const dialogVisible = await this.invoiceDialog().isVisible({ timeout: 5000 }).catch(() => false);
    if (dialogVisible) {
      console.log('  - Invoice Order dialog appeared');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoice creation workflow
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click CREATE AND VIEW INVOICES button and wait for invoice creation
   * @returns Promise<number> - Time taken to create invoice in milliseconds
   */
  async clickCreateAndViewInvoices(): Promise<number> {
    const startTime = Date.now();
    
    console.log('  - Looking for CREATE AND VIEW INVOICES button');
    
    const button = this.createAndViewInvoicesButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found CREATE AND VIEW INVOICES button');
    
    await button.click();
    console.log('  - Clicked CREATE AND VIEW INVOICES button (performance timer started)');
    
    // Gate on the INVOICE record actually being opened before looking at the form. The Edit button
    // alone is not a signal here: the Sales Order form underneath carries its own Edit button, so
    // waiting on it resolves instantly and the TC then reads the Sale Order's statusbar as if it
    // were the invoice's (elapsed 0.15s, invoice number empty, URL still model=sale.order).
    await this.page.waitForURL(/model=account\.invoice/, { timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Invoice record opened (URL carries model=account.invoice)');

    // Then wait for the invoice form to finish rendering (Edit button back = readonly mode)
    await this.editButtonLoc().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Edit button visible - invoice fully created');
    
    const invoiceTime = Date.now() - startTime;
    console.log('✓ Invoice created successfully');
    
    return invoiceTime;
  }

  /**
   * Wait for Invoice page to fully load
   * Verifies the page is in readonly mode with Edit button visible
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async waitForPageLoad(timeout: number = 10000): Promise<void> {
    // Wait for page to stabilize
    await this.wait(2000);
    
    // Verify page is in readonly mode (Edit button visible)
    const editButtonVisible = await this.editButtonLoc().isVisible({ timeout }).catch(() => false);
    if (editButtonVisible) {
      console.log('  - Invoice page loaded (Edit button visible)');
    } else {
      console.log('  ⚠ Edit button not visible on invoice page');
    }
  }

  /**
   * Click EDIT button to enter edit mode
   * @param timeout - Maximum time to wait for button (default: 10000ms)
   */
  async clickEdit(timeout: number = 10000): Promise<void> {
    console.log('  - Looking for EDIT button');
    
    const editButton = this.editButtonXPath();
    await editButton.waitFor({ state: 'visible', timeout });
    console.log('  - Found EDIT button');
    
    await editButton.click();
    console.log('  - Clicked "EDIT" button');
    
    // Wait for form to become editable
    await this.wait(2000);
  }

  /**
   * Change Payment Terms field value
   * @param value - Payment terms value (e.g., "15 Days")
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async changePaymentTerms(value: string, timeout: number = 10000): Promise<void> {
    try {
      const paymentTermsInput = this.paymentTermsInput();
      await paymentTermsInput.waitFor({ state: 'visible', timeout });
      await paymentTermsInput.click();
      await paymentTermsInput.fill(value);
      await this.wait(1000);
      
      // Wait for and click the dropdown option
      const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]').filter({ hasText: value }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (optionVisible) {
        await option.click();
        console.log(`  - Payment Terms: Changed to ${value}`);
      } else {
        console.log(`  - Payment Terms: Typed but dropdown not found`);
      }
    } catch (error) {
      console.log(`  - Payment Terms error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read the "Payment Terms" value currently shown on the invoice form.
   * Works in readonly mode (the row renders the value as text) and falls back to the edit-mode input.
   * XPath primary, CSS fallback.
   * @returns the Payment Terms text, or '' when the field cannot be read
   */
  async getPaymentTermsValue(): Promise<string> {
    // Readonly form: the value is the last cell of the "Payment Terms" row.
    for (const row of [this.paymentTermsRowXPath(), this.paymentTermsRowCss()]) {
      const exists = await row.count() > 0;
      if (!exists) continue;
      const valueCell = row.locator('td').last();
      const text = ((await valueCell.textContent().catch(() => '')) || '').trim();
      if (text.replace(/^payment\s*terms?/i, '').trim()) return text;
    }
    // Edit mode: read the many2one input value.
    const input = this.paymentTermsInput();
    const inputExists = await input.count() > 0;
    if (inputExists) {
      const value = ((await input.inputValue().catch(() => '')) || '').trim();
      if (value) return value;
    }
    // Last resort: the rendered field span (theme-independent).
    return await this.readFieldTextByName('payment_term_id');
  }

  /**
   * Click SAVE button and wait for save completion (used for performance measurement)
   * Waits for Edit button to reappear after save completes
   * @param timeout - Maximum time to wait for save to complete (default: 60000ms)
   * @returns Promise<number> - Time taken to save in milliseconds
   */
  async clickSaveAndWaitForCompletion(timeout: number = 60000): Promise<number> {
    const startTime = Date.now();
    
    const saveButton = this.saveButton();
    await saveButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found "SAVE" button');
    
    await saveButton.click();
    console.log('  - Clicked "SAVE" button (performance timer started)');
    
    // Wait for save to complete - Edit button should appear again
    const editButton = this.editButtonXPath();
    await editButton.waitFor({ state: 'visible', timeout });
    
    const saveTime = Date.now() - startTime;
    console.log('✓ Invoice saved successfully');
    
    return saveTime;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoice actions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click VALIDATE button and wait for validation to complete
   * @param timeout - Maximum time to wait (default: 20000ms)
   */
  async clickValidate(timeout: number = 20000): Promise<void> {
    console.log('  - Looking for VALIDATE button');
    
    const validateButton = this.validateButton();
    await validateButton.waitFor({ state: 'visible', timeout });
    console.log('  - Found VALIDATE button');
    
    await validateButton.click();
    console.log('  - Clicked "VALIDATE" button');

    // Wait for validation to complete
    await this.wait(5000);
  }

  /**
   * Click VALIDATE and wait until the invoice is actually POSTED (Open/Posted/Paid). Robust against:
   *  - a delayed "Odoo Client Error" / "Missing Record" (mail.followers) popup that can intercept the
   *    VALIDATE click on a freshly-opened invoice, leaving it Draft, and
   *  - a slow async post.
   * Dismisses popups, polls the statusbar, and re-clicks VALIDATE if the invoice is still Draft.
   * @param maxAttempts - number of poll/re-attempt cycles (default 6)
   * @returns the final invoice status text (e.g. "Open")
   */
  async clickValidateAndWaitPosted(maxAttempts: number = 6): Promise<string> {
    await this.dismissErrorDialogWithRetry();
    await this.clickValidate();
    let status = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.dismissErrorDialog();
      try { status = await this.getInvoiceStatus(); } catch { status = ''; }
      console.log(`  - Invoice status poll ${attempt}/${maxAttempts}: "${status}"`);
      if (/Open|Posted|Paid/i.test(status)) return status;
      // Still Draft -> clear any intercepting popup and re-attempt VALIDATE if the button is present.
      await this.dismissErrorDialogWithRetry();
      const validateVisible = await this.validateButton()
        .isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
      if (validateVisible) {
        await this.validateButton().click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(CommonUtils.waitTimes.long);
      } else {
        // No Validate button and not posted yet -> give the async post a moment, then reload.
        await this.wait(CommonUtils.waitTimes.long);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.dismissErrorDialog();
      }
    }
    return status;
  }

  /**
   * Poll the invoice statusbar until it reaches the expected status (e.g. "Paid"), reloading the
   * form between attempts (the status can update asynchronously after a payment is validated).
   * Dismisses any intercepting Odoo error popup on each pass. Returns the last status read.
   * @param expected - status to wait for, matched case-insensitively as a substring (e.g. "Paid")
   * @param maxAttempts - number of poll/reload cycles (default 8)
   */
  async waitForInvoiceStatus(expected: string, maxAttempts: number = 8): Promise<string> {
    const re = new RegExp(expected, 'i');
    let status = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.dismissErrorDialog();
      try { status = await this.getInvoiceStatus(); } catch { status = ''; }
      console.log(`  - Invoice status poll ${attempt}/${maxAttempts}: "${status}" (waiting for "${expected}")`);
      if (re.test(status)) return status;
      await this.wait(CommonUtils.waitTimes.long);
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.dismissErrorDialog();
    }
    return status;
  }

  /**
   * Click the invoice CANCEL button (cancels the posted invoice).
   * @param timeout - max time to wait for the button (default: abnormalWait)
   */
  async clickCancelInvoice(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    console.log('  - Looking for the CANCEL button');
    const button = this.cancelInvoiceButton();
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found CANCEL button');
    await button.click();
    console.log('  - Clicked "CANCEL" button');
    // A "Confirmation" dialog appears ("Are you sure you want to cancel this invoice?") - press OK to confirm.
    const ok = this.cancelConfirmOkButton();
    const okVisible = await ok.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (okVisible) {
      await ok.click();
      console.log('  - Confirmed cancellation (clicked OK on the confirmation dialog)');
    } else {
      console.log('  ⚠ Cancel confirmation dialog not found (no OK to press)');
    }
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Click "Set to Draft" / "Reset to Draft" (recovers a cancelled invoice back to Draft).
   * @param timeout - max time to wait for the button (default: abnormalWait)
   */
  async clickSetToDraft(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    console.log('  - Looking for the "Set to Draft" button');
    const button = this.setToDraftButton();
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found "Set to Draft" button');
    await button.click();
    console.log('  - Clicked "Set to Draft" button');
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Click SEND & PRINT button to open Send Invoice dialog
   * @param timeout - Maximum time to wait (default: 20000ms)
   */
  async clickSendAndPrint(timeout: number = 20000): Promise<void> {
    console.log('  - Looking for SEND & PRINT button');
    
    const sendPrintButton = this.sendAndPrintButton();
    await sendPrintButton.waitFor({ state: 'visible', timeout });
    console.log('  - Found SEND & PRINT button');
    
    await sendPrintButton.click();
    console.log('  - Clicked "SEND & PRINT" button');
    
    // Wait for "Send Invoice" dialog to appear
    await this.wait(3000);
  }

  /**
   * Click SEND button and wait for send completion (used for performance measurement)
   * Waits for dialog to close and Edit button to reappear
   * @param timeout - Maximum time to wait for send to complete (default: 80000ms)
   * @returns Promise<number> - Time taken to send in milliseconds
   */
  async clickSendAndWaitForCompletion(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<number> {
    const startTime = Date.now();
    
    // The manual TC presses "SEND". The wizard only offers that button when the "Print" option is
    // OFF; with Print ticked the same footer slot renders "Send & Print", which additionally renders
    // the PDF - and crm-mig has no wkhtmltopdf, so that path 500s instead of sending. Untick Print
    // first so the wizard exposes the "SEND" button the manual step asks for.
    await this.sendWizardDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    let sendVisible = await this.sendButton().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!sendVisible) {
      const printChecked = await this.sendWizardPrintCheckbox().isChecked().catch(() => false);
      if (printChecked) {
        // Odoo's boolean widget lays a styled label over the real <input>, so a plain uncheck()
        // never becomes actionable and hangs until the test budget runs out. Force the click (the
        // repo-wide pattern for Odoo checkboxes), then fall back to a dispatched click if the model
        // did not pick the change up.
        await this.sendWizardPrintCheckbox()
          .uncheck({ force: true, timeout: CommonUtils.waitTimes.abnormalWait })
          .catch(() => {});
        await this.wait(CommonUtils.waitTimes.standard);
        if (await this.sendWizardPrintCheckbox().isChecked().catch(() => false)) {
          await this.sendWizardPrintCheckbox().dispatchEvent('click').catch(() => {});
          await this.wait(CommonUtils.waitTimes.standard);
        }
        const stillChecked = await this.sendWizardPrintCheckbox().isChecked().catch(() => false);
        console.log(`  - Unticked the "Print" option so the wizard offers "SEND" (Print checked now: ${stillChecked})`);
      }
      sendVisible = await this.sendButton().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    }

    const sendButton = sendVisible ? this.sendButton() : this.sendWizardFooterButton();
    if (!sendVisible) {
      const label = (await sendButton.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim();
      console.log(`  - "SEND" not available; falling back to the visible wizard action "${label}"`);
    }
    await sendButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    console.log('  - Found "SEND" button');

    await sendButton.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "SEND" button (performance timer started)');

    // The send completed only when the composer actually closed - a wizard that stays open means the
    // action raised (the old code slept 2s and then read the Edit button of the form BEHIND the
    // still-open modal, which is why a failed send could still look like a pass).
    await this.sendWizardDialog().waitFor({ state: 'hidden', timeout });
    console.log('  - "Send Invoice" composer closed');

    // Wait for Edit button to appear (indicates invoice is fully sent)
    await this.editButtonLoc().waitFor({ state: 'visible', timeout });
    
    const sendTime = Date.now() - startTime;
    console.log('✓ Invoice sent successfully');
    
    return sendTime;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Register Payment dialog
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click VALIDATE button on the Register Payment dialog and wait for validation to complete
   * @param timeout - Maximum time to wait (default: 20000ms)
   */
  async clickValidate_RegisterPayment(timeout: number = 20000): Promise<void> {
    console.log('  - Looking for the Register Payment "Validate" button');

    // Prefer the action-name-anchored button (robust); fall back to the legacy indexed span locator.
    let validateButton = this.registerPaymentValidateByName();
    const byNameVisible = await validateButton.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!byNameVisible) {
      console.log('  - action_validate_invoice_payment not visible; falling back to the indexed Validate locator');
      validateButton = this.validateButton_RegisterPayment();
      await validateButton.waitFor({ state: 'visible', timeout });
    }
    console.log('  - Found VALIDATE button');

    await validateButton.click();
    console.log('  - Clicked "VALIDATE" button on Register Payment dialog');

    // Wait for validation to complete
    await this.wait(5000);
  }

  /**
   * "Click outside" the Payment Amount field so the wizard's onchange recomputes and (when the amount
   * is less than the open balance) surfaces the "Payment Difference" handling field. Blurs via Tab and
   * waits for the payment_difference_handling group to be present.
   * @returns true if the Payment Difference field is visible afterwards
   */
  async blurPaymentAmountAndAwaitDifference(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.long);
    const visible = await this.paymentDifferenceGroup()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    console.log(`  - Payment Difference field visible after blur: ${visible}`);
    return visible;
  }

  /**
   * Whether the "Payment Difference" handling field is currently shown in the Register Payment wizard.
   */
  async isPaymentDifferenceVisible(): Promise<boolean> {
    return await this.paymentDifferenceGroup().isVisible().catch(() => false);
  }

  /**
   * Select "Keep open" in the Register Payment wizard's Payment Difference handling (records a PARTIAL
   * payment and leaves the invoice open for the remaining balance). "Keep open" is the default, so this
   * is idempotent; it mirrors the manual step and guarantees the state. Clicks the label (the radio
   * input is a visually-hidden Bootstrap custom-control), then verifies the open radio is checked.
   * @returns true once "Keep open" is selected/checked
   */
  async selectPaymentDifferenceKeepOpen(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log('  - Selecting Payment Difference = "Keep open"');
    await this.keepOpenLabel().waitFor({ state: 'visible', timeout }).catch(() => {});
    try {
      await this.keepOpenLabel().click();
    } catch {
      await this.keepOpenRadioInput().check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.short);
    const checked = await this.keepOpenRadioInput().isChecked().catch(() => false);
    console.log(`  ${checked ? '✓' : '⚠'} "Keep open" selected (checked=${checked})`);
    return checked;
  }

  /**
   * Select "Mark invoice as fully paid" in the Payment Difference handling (writes off the remaining
   * difference so the invoice posts as Paid from a single partial payment). Clicks the label, then
   * verifies the reconcile radio is checked.
   * @returns true once "Mark invoice as fully paid" is selected/checked
   */
  async selectPaymentDifferenceMarkFullyPaid(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log('  - Selecting Payment Difference = "Mark invoice as fully paid"');
    await this.markFullyPaidLabel().waitFor({ state: 'visible', timeout }).catch(() => {});
    try {
      await this.markFullyPaidLabel().click();
    } catch {
      await this.markFullyPaidRadioInput().check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.short);
    const checked = await this.markFullyPaidRadioInput().isChecked().catch(() => false);
    console.log(`  ${checked ? '✓' : '⚠'} "Mark invoice as fully paid" selected (checked=${checked})`);
    return checked;
  }

  /**
   * Set the "Post Difference In" write-off account (writeoff_account_id), required by Odoo when
   * "Mark invoice as fully paid" is chosen and the field is empty. No-op if the field is not present
   * (some configs auto-fill it). Many2one: fill + pick the matching dropdown option.
   * @param accountName - account to select (e.g. "Bank fees" / a write-off account name)
   * @returns true if the field was found and set
   */
  async setPostDifferenceAccount(accountName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const input = this.writeoffAccountInput();
    if ((await input.count().catch(() => 0)) === 0) {
      console.log('  - "Post Difference In" field not present (skipping)');
      return false;
    }
    await input.click();
    await input.fill('');
    await input.fill(accountName);
    await this.wait(CommonUtils.waitTimes.standard);
    const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]').filter({ hasText: accountName }).first();
    const visible = await option.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (visible) {
      await option.click();
      console.log(`  ✓ "Post Difference In" set to "${accountName}"`);
    } else {
      await this.page.keyboard.press('Enter');
      console.log(`  ✓ "Post Difference In" set to "${accountName}" (keyboard)`);
    }
    await this.wait(CommonUtils.waitTimes.short);
    return true;
  }

  /**
   * Whether the "Post Difference In" write-off account field is currently shown (and empty).
   */
  async isWriteoffAccountVisible(): Promise<boolean> {
    return await this.writeoffAccountInput().isVisible().catch(() => false);
  }

  /**
   * Select the FIRST available "Post Difference In" write-off account from its dropdown (name-independent).
   * "Mark invoice as fully paid" requires this account to be filled, else Validate is silently rejected.
   * Opens the Many2one, skips the "Create..."/"Search More..." entries, clicks the first real account,
   * and returns its name.
   * @returns the chosen account name (or '' if none found)
   */
  async selectFirstWriteoffAccount(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const input = this.writeoffAccountInput();
    await input.waitFor({ state: 'visible', timeout });
    await input.click();
    await this.wait(CommonUtils.waitTimes.long);
    const options = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
    await options.first().waitFor({ state: 'visible', timeout }).catch(() => {});
    const texts = (await options.allTextContents()).map((t) => t.trim());
    let idx = texts.findIndex((t) => t && !/^(Create|Search More|Start typing)/i.test(t));
    if (idx < 0) idx = 0;
    const chosen = texts[idx] || '';
    await options.nth(idx).click().catch(async () => { await this.page.keyboard.press('Enter'); });
    await this.wait(CommonUtils.waitTimes.short);
    console.log(`  ✓ "Post Difference In" write-off account set to "${chosen}"`);
    return chosen;
  }

  /**
   * Select the "Payment Journal" (journal_id) in the Register Payment wizard. This wizard renders
   * journal_id as a native <select>; falls back to a Many2one input if not.
   * @param journalName - the journal label, e.g. "Bank Transfer", "Cash"
   * @returns true once the journal is set
   */
  async selectPaymentJournal(journalName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log(`  - Selecting Payment Journal = "${journalName}"`);
    const sel = this.paymentJournalSelect();
    const m2o = this.paymentJournalM2OInput();

    // The journal widget renders a beat AFTER the dialog opens; poll for whichever form (native
    // <select> or Many2one input) appears, up to `timeout`, instead of checking count() once.
    const deadline = timeout;
    const step = CommonUtils.waitTimes.standard;
    let kind: 'select' | 'm2o' | '' = '';
    for (let waited = 0; waited <= deadline; waited += step) {
      if ((await sel.count().catch(() => 0)) > 0) { kind = 'select'; break; }
      if ((await m2o.count().catch(() => 0)) > 0) { kind = 'm2o'; break; }
      await this.wait(step);
    }

    if (kind === 'select') {
      await sel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await sel.selectOption({ label: journalName }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard); // let the onchange (payment method, etc.) run
      const current = await sel.evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex]?.text || '').catch(() => '');
      console.log(`  ✓ Payment Journal (select) = "${current}"`);
      return current.includes(journalName);
    }
    if (kind === 'm2o') {
      await m2o.click();
      await m2o.fill('');
      await m2o.fill(journalName);
      await this.wait(CommonUtils.waitTimes.standard);
      const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]').filter({ hasText: journalName }).first();
      const visible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (visible) await option.click();
      else await this.page.keyboard.press('Enter');
      await this.wait(CommonUtils.waitTimes.standard);
      console.log(`  ✓ Payment Journal (Many2one) set to "${journalName}"`);
      return true;
    }
    console.log('  ⚠ Payment Journal widget not found (neither <select> nor Many2one)');
    return false;
  }

  /**
   * Read the available "Payment Journal" option labels in the Register Payment wizard (when the
   * journal is rendered as a native <select>). Read-only diagnostic so a spec can log/verify the
   * exact journal labels offered (e.g. "Bank Check" vs "Bank Transfer") instead of failing blind.
   * Returns [] when the journal is not a native <select> (Many2one) or no options are present.
   * @param timeout - max time to wait for the <select> (default: abnormalWait)
   */
  async getPaymentJournalOptions(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    const sel = this.paymentJournalSelect();
    const present = await sel.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!present) {
      console.log('  - Payment Journal options: not a native <select> (Many2one or absent)');
      return [];
    }
    const options = await sel.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => (o.text || '').trim()).filter(Boolean)
    ).catch(() => [] as string[]);
    console.log(`  ✓ Payment Journal options: ${JSON.stringify(options)}`);
    return options;
  }

  /**
   * Click REGISTER PAYMENT button on the validated invoice
   * @param timeout - Maximum time to wait (default: 20000ms)
   */
  async clickRegisterPayment(timeout: number = 20000): Promise<void> {
    // Try the visible "Register Payment" control (header button) first.
    let target = this.registerPaymentAnyVisible();
    const directVisible = await target.isVisible().catch(() => false);
    if (!directVisible) {
      // In some invoice layouts (e.g. the O12_CE License-invoice flow) Register Payment is not a
      // header button - it lives under the "Action" cog menu. Open it, then click the item.
      console.log('  - REGISTER PAYMENT not visible in header; opening the "Action" menu');
      await this.actionMenuButton().waitFor({ state: 'visible', timeout });
      await this.actionMenuButton().click();
      await this.wait(CommonUtils.waitTimes.short);
      target = this.registerPaymentAnyVisible();
      await target.waitFor({ state: 'visible', timeout });
    }
    console.log('  - Found "Register Payment" control');
    await target.click();
    console.log('  - Clicked "Register Payment"');
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Whether a "Register Payment" control is available to the current user on this invoice (header
   * button OR an item under the "Action" cog menu). Used by the negative role check (e.g. a
   * Salesperson has no Register Payment, only an Accountant does). Closes the Action menu if it
   * opened it. Does NOT click Register Payment.
   * @returns true if Register Payment is reachable, false otherwise
   */
  async hasRegisterPaymentButton(timeout: number = CommonUtils.waitTimes.long): Promise<boolean> {
    // Header control first.
    if (await this.registerPaymentAnyVisible().isVisible({ timeout }).catch(() => false)) {
      console.log('  - Register Payment: visible in the header');
      return true;
    }
    // Then the "Action" cog menu (some layouts nest it there).
    const actionBtn = this.actionMenuButton();
    if (await actionBtn.isVisible({ timeout }).catch(() => false)) {
      await actionBtn.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
      const inMenu = await this.registerPaymentAnyVisible().isVisible({ timeout }).catch(() => false);
      await this.page.keyboard.press('Escape').catch(() => {}); // close the menu without selecting
      await this.wait(CommonUtils.waitTimes.short);
      console.log(`  - Register Payment: ${inMenu ? 'found under the Action menu' : 'NOT found (header or Action menu)'}`);
      return inMenu;
    }
    console.log('  - Register Payment: NOT available (no header control, no Action menu)');
    return false;
  }

  /**
   * Get the Payment Amount value from the Register Payment dialog
   */
  async getPaymentAmount(timeout: number = 10000): Promise<string> {
    const amountInput = this.paymentAmountInput();
    await amountInput.waitFor({ state: 'visible', timeout });
    return await amountInput.inputValue();
  }

  /**
   * Set the "Amount" field in the Register Payment dialog (e.g. to register a partial payment).
   * @param amount - the payment amount to set (string)
   */
  async fillPaymentAmount(amount: string, timeout: number = 10000): Promise<void> {
    const amountInput = this.paymentAmountInput();
    await amountInput.waitFor({ state: 'visible', timeout });
    await amountInput.click();
    await amountInput.fill('');
    await amountInput.fill(amount);
    console.log(`  - Payment "Amount" set to: ${amount}`);
  }

  /**
   * Fill the "Actually Received($)" field in the Register Payment dialog
   */
  async fillActuallyReceived(amount: string, timeout: number = 10000): Promise<void> {
    const receivedField = this.actuallyReceivedInput();
    await receivedField.waitFor({ state: 'visible', timeout });
    await receivedField.clear();
    await receivedField.fill(amount);
    console.log(`  - "Actually Received($)" filled with: ${amount}`);
  }

  /**
   * Select the "Payment Method Type" (payment_method_id) in the Register Payment dialog - a vertical
   * radio group present when paying a credit note (refund). Options e.g. "Manual" (the default) /
   * "Checks". Clicks the visible label (the radio input is a hidden custom-control), then verifies the
   * matching radio is checked. Idempotent for the default "Manual".
   * @param methodLabel the method to select, e.g. "Manual"
   * @returns true once the matching radio is checked (or the group is absent - logged)
   */
  async selectPaymentMethodType(methodLabel: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log(`  - Selecting Payment Method Type = "${methodLabel}"`);
    const present = await this.paymentMethodTypeGroup().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!present) {
      console.log('  ⚠ "Payment Method Type" group not present in this Register Payment dialog');
      return false;
    }
    const label = this.paymentMethodTypeLabel(methodLabel);
    const radio = this.paymentMethodTypeRadio(methodLabel);
    try {
      await label.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await label.click();
    } catch {
      await radio.check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.short);
    const checked = await radio.isChecked().catch(() => false);
    console.log(`  ${checked ? '✓' : '⚠'} Payment Method Type "${methodLabel}" selected (checked=${checked})`);
    return checked;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Field getters — Invoice form
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the Invoice Number displayed in the form header (e.g. "INV/2024/00001").
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getInvoiceNumber(timeout: number = 15000): Promise<string> {
    const field = this.invoiceNumberField();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ Invoice number: ${value}`);
    return value;
  }

  /**
   * Get the Invoice status from the status bar (e.g. "Draft", "Posted", "Paid", "Cancelled").
   * Uses JS evaluation on .o_statusbar_status to read the active/highlighted button text.
   * @param timeout - Maximum time to wait for the statusbar (default: 15000ms)
   * @returns The status string in title case, e.g. "Paid", "Posted"
   */
  async getInvoiceStatus(timeout: number = 15000): Promise<string> {
    const statusBarContainer = this.invoiceStatusBar();
    await statusBarContainer.waitFor({ state: 'visible', timeout });

    const raw = await this.page.evaluate(() => {
      const container = document.querySelector('.o_statusbar_status');
      if (!container) return '';
      let btn = container.querySelector<HTMLElement>('button[aria-checked="true"]');
      if (!btn) {
        btn = container.querySelector<HTMLElement>('button.btn-primary');
      }
      if (!btn) {
        btn = container.querySelector<HTMLElement>('button[aria-selected="true"]');
      }
      return btn ? (btn.innerText || btn.textContent || '').trim() : '';
    });

    if (!raw) {
      throw new Error('Could not determine Invoice status — no active statusbar button found');
    }

    const value = raw.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    console.log(`  ✓ Invoice status: "${value}" (raw: "${raw}")`);
    return value;
  }

  /**
   * Click the Payments tab on the Invoice form notebook.
   * @param timeout - Maximum time to wait for the tab (default: 30000ms)
   */
  async clickPaymentsTab(timeout: number = 30000): Promise<void> {
    console.log('  - Looking for Payments tab');
    const tab = this.paymentsTabLoc();
    await tab.waitFor({ state: 'visible', timeout });
    console.log('  - Found Payments tab');
    await tab.click();
    console.log('  - Clicked Payments tab');
    await this.wait(2000);
  }

  /**
   * Click the Other Infor / Other Info tab on the Invoice form notebook.
   * @param timeout - Maximum time to wait for the tab (default: 30000ms)
   */
  async clickOtherInforTab(timeout: number = 30000): Promise<void> {
    console.log('  - Looking for Other Infor tab');
    const tab = this.otherInforTabLoc();
    await tab.waitFor({ state: 'visible', timeout });
    console.log('  - Found Other Infor tab');
    await tab.click();
    console.log('  - Clicked Other Infor tab');
    await this.wait(2000);
  }

  /**
   * Click the Invoice Lines tab on the Invoice form notebook.
   * @param timeout - Maximum time to wait for the tab (default: 30000ms)
   */
  async clickInvoiceLinesTab(timeout: number = 30000): Promise<void> {
    console.log('  - Looking for Invoice Lines tab');
    const tab = this.invoiceLinesTabLoc();
    await tab.waitFor({ state: 'visible', timeout });
    console.log('  - Found Invoice Lines tab');
    await tab.click();
    console.log('  - Clicked Invoice Lines tab');
    await this.wait(2000);
  }

  /**
   * Get the "Total in Company Currency" value displayed on the Invoice form Payments tab.
   * Finds the column by header text to be resilient to CSS class changes.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getTotalInCompanyCurrencyOnInvoice(timeout: number = 15000): Promise<string> {
    // Wait for the Payments table header to confirm the tab is loaded
    const headerLoc = this.page.locator(`xpath=//th[starts-with(normalize-space(),"Total in Company Currency")]`).first();
    await headerLoc.waitFor({ state: 'visible', timeout });

    // Find column by header text and return the first data row's value at that index
    const value = await this.page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('th'));
        const colIdx = headers.findIndex(h => (h.textContent || '').trim().startsWith('Total in Company Currency'));
        if (colIdx === -1) continue;
        const dataRows = table.querySelectorAll('tr.o_data_row');
        if (dataRows.length === 0) continue;
        const cells = dataRows[0].querySelectorAll('td');
        if (cells[colIdx]) return (cells[colIdx].textContent || '').trim();
      }
      return '';
    });

    console.log(`  ✓ Total in Company Currency: ${value}`);
    return value;
  }

  /**
   * Get the "Payment Amount" value from the Payments tab table.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getPaymentAmountFromPaymentsTab(timeout: number = 15000): Promise<string> {
    const field = this.paymentAmountOnTabLoc();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ Payment Amount (Payments tab): ${value}`);
    return value;
  }

  /**
   * Get the "Actually Received" value from the Payments tab table.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getActuallyReceivedFromPaymentsTab(timeout: number = 15000): Promise<string> {
    const field = this.actuallyReceivedOnTabLoc();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ Actually Received (Payments tab): ${value}`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Payments tab - MULTI-row readers (UC-B-3: a partially-paid invoice has N payment rows)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Count the payment rows in the Payments tab's one2many list (payment_ids).
   * @param timeout - max time to wait for the Payments list to render (default: abnormalWait)
   */
  async getPaymentRowCount(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<number> {
    const list = this.page.locator('xpath=//div[@name="payment_ids"]').first();
    await list.waitFor({ state: 'visible', timeout }).catch(() => {});
    const count = await this.page.locator('xpath=//div[@name="payment_ids"]//tr[contains(@class,"o_data_row")]').count().catch(() => 0);
    console.log(`  ✓ Payment rows on the Payments tab: ${count}`);
    return count;
  }

  /**
   * Count the rows in the "Transactions Payment" tab's one2many list (transaction_ids) - the
   * `payment.transaction` records (online acquirer / partner-portal payments) attached to this
   * invoice. The tab is added by the Odoo Studio customisation of account.invoice.form.
   *
   * A back-office REGISTER PAYMENT creates an `account.payment` and NO `payment.transaction`, so this
   * count stays 0 on that path while getPaymentRowCount() goes up. CRM-12373 uses the contrast to
   * show which payments can reach the payment-confirmation-email hook and which cannot.
   *
   * Call openNotebookTab('Transactions Payment') first - Odoo keeps inactive notebook pages hidden.
   * @param timeout - max time to wait for the list to render (default: abnormalWait)
   */
  async getTransactionRowCount(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<number> {
    const list = this.page.locator('xpath=//div[@name="transaction_ids"]').first();
    await list.waitFor({ state: 'visible', timeout }).catch(() => {});
    const count = await this.page
      .locator('xpath=//div[@name="transaction_ids"]//tr[contains(@class,"o_data_row")]')
      .count()
      .catch(() => 0);
    console.log(`  ✓ Payment-transaction rows on the "Transactions Payment" tab: ${count}`);
    return count;
  }

  /**
   * Read every payment row's value for a given column (matched by its header text) from the Payments
   * tab one2many list (payment_ids). Resolves the column by header index so it is resilient to CSS
   * changes and to a leading handle/selector column.
   * @param headerText - the column header (prefix match), e.g. "Payment Amount", "Actually Received", "Status"
   * @param timeout - max time to wait for the list (default: abnormalWait)
   * @returns the trimmed cell text for each data row, in row order
   */
  async getPaymentColumnValues(
    headerText: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<string[]> {
    const list = this.page.locator('xpath=//div[@name="payment_ids"]').first();
    await list.waitFor({ state: 'visible', timeout }).catch(() => {});

    const values = await this.page.evaluate((header: string) => {
      const container = document.querySelector('div[name="payment_ids"]');
      if (!container) return [] as string[];
      const table = container.querySelector('table');
      if (!table) return [] as string[];
      const headers = Array.from(table.querySelectorAll('thead th'));
      const colIdx = headers.findIndex(h => (h.textContent || '').trim().startsWith(header));
      if (colIdx === -1) return [] as string[];
      const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
      return rows.map(r => {
        const cells = r.querySelectorAll('td');
        return cells[colIdx] ? (cells[colIdx].textContent || '').trim() : '';
      });
    }, headerText);

    console.log(`  ✓ Payments tab column "${headerText}" values: ${JSON.stringify(values)}`);
    return values;
  }

  /**
   * Read the whole Payments tab (payment_ids) table as plain text, for robust "contains" assertions
   * and evidence (UC-B-6: verify the reconciled standalone Payment#1 is listed).
   * @param timeout - max time to wait for the list (default: abnormalWait)
   */
  async getPaymentsTabText(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const list = this.page.locator('xpath=//div[@name="payment_ids"]').first();
    await list.waitFor({ state: 'visible', timeout }).catch(() => {});
    const text = await this.page.evaluate(() => {
      const c = document.querySelector('div[name="payment_ids"]');
      return c ? (c as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
    });
    console.log(`  ✓ Payments tab text: "${text.slice(0, 200)}"`);
    return text;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Outstanding credits / bank-statement reconciliation (UC-B-6)
  //   On a posted, open invoice an "Outstanding credits" section lists unreconciled customer
  //   payment entries (by their Journal Entry name) each with an "Add" control; clicking it
  //   reconciles that credit against the invoice. After reconciliation a "payments_widget" row
  //   ("Paid on <date>" + amount) appears and the invoice can post to Paid.
  // ═══════════════════════════════════════════════════════════════════════════

  // The outstanding-credits / payments widgets (Odoo 12 'payment' widget) - anchored on field name.
  private readonly outstandingWidgetLoc = () =>
    this.page.locator('xpath=//*[@name="outstanding_credits_debits_widget"]')
      .or(this.page.locator('xpath=//*[contains(@class,"oe_payment") and contains(.,"Outstanding")]')).first();
  private readonly paymentsWidgetLoc = () =>
    this.page.locator('xpath=//*[@name="payments_widget"]')
      .or(this.page.locator('xpath=//table[contains(@class,"o_invoice_payments")]')).first();

  /**
   * Read the Outstanding-credits section text (the Journal Entry names + amounts shown), for the
   * "JournalItem#1 appears with an Add button" check and diagnostics. Returns '' if absent.
   * @param timeout - max time to wait for the widget (default: abnormalWait)
   */
  async getOutstandingCreditsText(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const w = this.outstandingWidgetLoc();
    const visible = await w.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ⚠ Outstanding-credits section not visible');
      return '';
    }
    const text = (await w.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    console.log(`  ✓ Outstanding-credits section: "${text.slice(0, 300)}"`);
    return text;
  }

  /**
   * Whether the Outstanding-credits section currently lists the given Journal Entry (JournalItem#1).
   */
  async isOutstandingCreditPresent(journalItemName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const text = await this.getOutstandingCreditsText(timeout);
    const present = text.includes(journalItemName);
    console.log(`  - Outstanding credit "${journalItemName}" present: ${present}`);
    return present;
  }

  /**
   * Click the "Add" control of the Outstanding-credit row matching JournalItem#1, reconciling that
   * credit against the invoice. Robust to layout: matches the row containing the Journal Entry name,
   * then clicks an "Add" button/link in that row (falling back to the standard Odoo assign anchor
   * `.js_assign_outstanding_line` / the journal-name link itself). Waits until reconciliation reflects
   * (a "payments_widget" row appears).
   * @param journalItemName - the Journal Entry name (e.g. "BNK1/2026/0715")
   * @returns true once an Add/assign control was clicked
   */
  async addOutstandingCredit(journalItemName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    await this.outstandingWidgetLoc().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.outstandingWidgetLoc().scrollIntoViewIfNeeded().catch(() => {});

    // IMPORTANT: each outstanding credit renders as "Add | journal name | amount", but the whole widget
    // sits inside the invoice TOTALS <tr>. A naive `//tr[contains(.,NAME)]` also matches that OUTER
    // totals row, whose first "Add" is the topmost (wrong) credit - which mis-reconciled the wrong one.
    // Two robust strategies, name-targeted, never "just the first Add":
    //   (1) the "Add" control immediately PRECEDING the element whose text == the journal name
    //       (document-order proximity - works whether credits are separate <tr>s or one row), then
    //   (2) fallback: the "Add" whose INNERMOST ancestor <tr> carries the journal name.
    const lit = this.xpathLiteral(journalItemName);
    const ADD = '(self::a or self::button) and (normalize-space()="Add" or contains(@class,"js_assign_outstanding_line") or contains(@class,"outstanding"))';
    let clicked = false;

    const addBeforeName = this.page.locator(
      `xpath=(//*[@name="outstanding_credits_debits_widget"]//*[normalize-space(.)=${lit}]/preceding::*[${ADD}])[last()]`
    ).first();
    if (await addBeforeName.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false)) {
      await addBeforeName.scrollIntoViewIfNeeded().catch(() => {});
      await addBeforeName.click();
      clicked = true;
      console.log(`  ✓ Clicked the "Add" immediately preceding outstanding credit "${journalItemName}"`);
    } else {
      const addControls = this.page.locator(
        'xpath=//*[@name="outstanding_credits_debits_widget"]//a[normalize-space()="Add"]'
        + ' | //*[@name="outstanding_credits_debits_widget"]//button[normalize-space()="Add"]'
        + ' | //*[@name="outstanding_credits_debits_widget"]//a[contains(@class,"js_assign_outstanding_line")]'
        + ' | //*[@name="outstanding_credits_debits_widget"]//a[contains(@class,"outstanding")]'
      );
      const count = await addControls.count().catch(() => 0);
      console.log(`  - Fallback: scanning ${count} "Add" controls for the row carrying "${journalItemName}"`);
      for (let i = 0; i < count; i++) {
        const ctl = addControls.nth(i);
        const rowText = ((await ctl.locator('xpath=ancestor::tr[1]').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
        if (rowText.includes(journalItemName)) {
          await ctl.scrollIntoViewIfNeeded().catch(() => {});
          await ctl.click();
          clicked = true;
          console.log(`  ✓ Clicked "Add" for outstanding credit "${journalItemName}" (control #${i})`);
          break;
        }
      }
    }

    if (!clicked) {
      // Do NOT click a non-matching Add (that would reconcile the wrong credit). Fail loudly instead.
      console.log(`  ⚠ No name-matched "Add" control for outstanding credit "${journalItemName}" - not clicking`);
      return false;
    }

    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    const reconciled = await this.paymentsWidgetLoc().isVisible({ timeout }).catch(() => false);
    console.log(`  - Reconciliation reflected (payments row visible): ${reconciled}`);
    return true;
  }

  /**
   * Read the reconciliation row from the invoice "payments_widget" as TWO separate cells:
   *   - label  (column 1) e.g. "Paid on 06/29/2026"
   *   - amount (column 2) e.g. "$ 500.00"
   * Returns the FIRST payment row. Each cell is read independently so callers can assert the label and
   * the amount separately (not as one combined string).
   * @param timeout - max time to wait for the payments widget (default: abnormalWait)
   */
  async getReconciliationRow(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{ label: string; amount: string }> {
    await this.paymentsWidgetLoc().waitFor({ state: 'visible', timeout }).catch(() => {});
    const cells = await this.page.evaluate(() => {
      const root =
        document.querySelector('[name="payments_widget"]') ||
        document.querySelector('table.o_invoice_payments');
      if (!root) return { label: '', amount: '' };
      const row = root.querySelector('table tr') || root.querySelector('tr');
      if (!row) return { label: '', amount: '' };
      const tds = Array.from(row.querySelectorAll('td')) as HTMLElement[];
      const texts = tds.map((td) => (td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim());
      // Column 1 (label): the "Paid on <date>" cell (or the first non-empty cell as a fallback).
      const label = texts.find((t) => /paid on/i.test(t)) || texts.find((t) => t.length > 0) || '';
      // Column 2 (amount): the first cell that carries a currency symbol or a NN.NN figure and is NOT the label.
      const amount = texts.find((t) => !/paid on/i.test(t) && (/[$€£]/.test(t) || /\d+[.,]\d{2}/.test(t))) || '';
      return { label, amount };
    });
    console.log(`  ✓ Reconciliation row: label="${cells.label}" | amount="${cells.amount}"`);
    return cells;
  }

  /**
   * Read ALL reconciliation rows from the invoice "payments_widget" as { label, amount } pairs
   * (UC-B-6.3: an invoice settled by two outstanding credits shows two "Paid on ..." rows).
   * @param timeout - max time to wait for the payments widget (default: abnormalWait)
   */
  async getReconciliationRows(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{ label: string; amount: string }[]> {
    await this.paymentsWidgetLoc().waitFor({ state: 'visible', timeout }).catch(() => {});
    const rows = await this.page.evaluate(() => {
      const root = document.querySelector('[name="payments_widget"]') || document.querySelector('table.o_invoice_payments');
      if (!root) return [] as { label: string; amount: string }[];
      const trs = Array.from(root.querySelectorAll('tr'));
      return trs.map((tr) => {
        const texts = Array.from(tr.querySelectorAll('td')).map((td) => ((td as HTMLElement).innerText || td.textContent || '').replace(/\s+/g, ' ').trim());
        const label = texts.find((t) => /paid on/i.test(t)) || '';
        const amount = texts.find((t) => !/paid on/i.test(t) && (/[$€£]/.test(t) || /\d+[.,]\d{2}/.test(t))) || '';
        return { label, amount };
      }).filter((r) => r.label || r.amount);
    });
    console.log(`  ✓ Reconciliation rows: ${JSON.stringify(rows)}`);
    return rows;
  }

  /**
   * Read the amount shown next to a given Outstanding-credit (matched by its Journal Entry name) in
   * the Outstanding-credits section. Returns '' when the credit is not listed (UC-B-6.8 leftover).
   * @param journalItemName - the Journal Entry name (e.g. "BNK1/2026/0715")
   */
  async getOutstandingCreditAmount(journalItemName: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    await this.outstandingWidgetLoc().waitFor({ state: 'visible', timeout }).catch(() => {});
    const amount = await this.page.evaluate((name: string) => {
      const w = document.querySelector('[name="outstanding_credits_debits_widget"]');
      if (!w) return '';
      const rows = Array.from(w.querySelectorAll('tr'));
      for (const r of rows) {
        const text = ((r as HTMLElement).innerText || r.textContent || '');
        if (text.includes(name)) {
          const m = text.replace(/\s+/g, ' ').match(/([$€£]\s?[\d.,]+|\d+[.,]\d{2})/);
          return m ? m[1].trim() : '';
        }
      }
      return '';
    }, journalItemName);
    console.log(`  ✓ Outstanding credit "${journalItemName}" amount: "${amount}"`);
    return amount;
  }

  // ── Unreconcile (UC-B-6.5): the info icon opens a popover with an "Unreconcile" button ──
  private readonly paymentInfoIcon = () => this.page.locator('xpath=//*[@name="payments_widget"]//a[contains(@class,"js_payment_info")]');
  private readonly unreconcileButton = () => this.page.locator('xpath=//button[contains(@class,"js_unreconcile_payment")]').or(this.page.locator('.popover button', { hasText: /^Unreconcile$/i })).first();
  private readonly popoverMemoCell = () => this.page.locator('xpath=//div[contains(@class,"popover")]//td[normalize-space()="Memo:"]/following-sibling::td').first();

  /**
   * Count the reconciliation rows currently shown in the payments_widget.
   */
  async getPaymentsWidgetRowCount(timeout: number = CommonUtils.waitTimes.long): Promise<number> {
    const visible = await this.paymentsWidgetLoc().isVisible({ timeout }).catch(() => false);
    if (!visible) return 0;
    return await this.page.evaluate(() => {
      const root = document.querySelector('[name="payments_widget"]');
      if (!root) return 0;
      return Array.from(root.querySelectorAll('tr')).filter((tr) => /paid on/i.test(((tr as HTMLElement).innerText || ''))).length;
    });
  }

  /**
   * Unreconcile a reconciled payment from the invoice: open the payment-row info popover (optionally
   * the one whose Memo = journalItemName), then click "Unreconcile". Defaults to the FIRST row when no
   * name is given (single-payment invoices). Waits for the reconciliation to be removed.
   * @param journalItemName - optional Journal Entry name to target a specific row
   * @returns true once Unreconcile was clicked
   */
  async unreconcilePayment(journalItemName?: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    await this.paymentsWidgetLoc().waitFor({ state: 'visible', timeout }).catch(() => {});
    const icons = this.paymentInfoIcon();
    const count = await icons.count().catch(() => 0);
    if (count === 0) {
      console.log('  ⚠ No payment info icon found in payments_widget');
      return false;
    }
    // Pick the matching row's info icon (by popover Memo) or default to the first.
    let chosen = 0;
    if (journalItemName && count > 1) {
      for (let i = 0; i < count; i++) {
        await icons.nth(i).click();
        await this.wait(CommonUtils.waitTimes.standard);
        const memo = (await this.popoverMemoCell().innerText().catch(() => '')).trim();
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.wait(CommonUtils.waitTimes.short);
        if (memo.includes(journalItemName)) { chosen = i; break; }
      }
    }
    await icons.nth(chosen).click();
    await this.wait(CommonUtils.waitTimes.standard);
    await this.unreconcileButton().waitFor({ state: 'visible', timeout });
    await this.unreconcileButton().click();
    console.log(`  ✓ Clicked "Unreconcile"${journalItemName ? ` for ${journalItemName}` : ''}`);
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    return true;
  }

  /** Build a safe XPath string literal (handles embedded quotes via concat()). */
  private xpathLiteral(s: string): string {
    if (!s.includes('"')) return `"${s}"`;
    if (!s.includes("'")) return `'${s}'`;
    return 'concat("' + s.replace(/"/g, '", \'"\', "') + '")';
  }

  /**
   * Get the "Payer" field value from the Invoice form (the Customer / billing partner, partner_id).
   * On the NAKIVO invoice the Payer is what the Deal Element's Payer propagates to. Returns the
   * trimmed link/field text, or '' when the field is blank/not visible.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getPayer(timeout: number = 15000): Promise<string> {
    const field = this.payerLoc();
    const visible = await field.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ⚠ Payer field not visible');
      return '';
    }
    const value = (await field.innerText().catch(() => '')).trim();
    console.log(`  ✓ Payer (partner_id): "${value}"`);
    return value;
  }

  /**
   * Get the "End User" field value from the Invoice form.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getEndUser(timeout: number = 15000): Promise<string> {
    const field = this.endUserLoc();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ End User: ${value}`);
    return value;
  }

  /**
   * Get the "Source Document" value from Invoice > Other Infor tab.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getSourceDocument(timeout: number = 15000): Promise<string> {
    const field = this.sourceDocumentLoc();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ Source Document: ${value}`);
    return value;
  }

  /**
   * Get the "Invoice Date" value from the Invoice form.
   * Supports both readonly (span) and editable (input) render modes.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getInvoiceDate(timeout: number = 15000): Promise<string> {
    const field = this.invoiceDateLoc();
    await field.waitFor({ state: 'visible', timeout });

    const value = await field.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return (el.value || '').trim();
      }
      return (el.textContent || '').trim();
    });

    console.log(`  ✓ Invoice Date: ${value}`);
    return value;
  }

  /**
   * Get the "Due Date" value from the Invoice form.
   * Supports both readonly (span) and editable (input) render modes.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getDueDate(timeout: number = 15000): Promise<string> {
    const field = this.dueDateLoc();
    await field.waitFor({ state: 'visible', timeout });

    const value = await field.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return (el.value || '').trim();
      }
      return (el.textContent || '').trim();
    });

    console.log(`  ✓ Due Date: ${value}`);
    return value;
  }

  /**
   * Get the "Amount Due" value from the Invoice form.
   * Supports both readonly (span) and editable (input) render modes.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getAmountDue(timeout: number = 15000): Promise<string> {
    const field = this.amountDueLoc();
    await field.waitFor({ state: 'visible', timeout });

    const value = await field.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return (el.value || '').trim();
      }
      return (el.textContent || '').trim();
    });

    console.log(`  ✓ Amount Due: ${value}`);
    return value;
  }

  /**
   * Get the "Distributor" value from the Invoice form.
   * Returns empty string when the field is blank.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getDistributor(timeout: number = 15000): Promise<string> {
    const field = this.distributorLoc();
    const visible = await field.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      console.log('  ✓ Distributor: "" (blank / not visible)');
      return '';
    }

    const value = (await field.innerText()).trim();
    console.log(`  ✓ Distributor: ${value}`);
    return value;
  }

  /**
   * Get the "Reseller" value from the Invoice form.
   * Returns empty string when the field is blank.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getReseller(timeout: number = 15000): Promise<string> {
    const field = this.resellerLoc();
    const visible = await field.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      console.log('  ✓ Reseller: "" (blank / not visible)');
      return '';
    }

    const value = (await field.innerText()).trim();
    console.log(`  ✓ Reseller: ${value}`);
    return value;
  }

  /**
   * Get the "Sales Team" value from the Invoice form.
   * Returns empty string when the field is blank.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   */
  async getSalesTeam(timeout: number = 15000): Promise<string> {
    const field = this.salesTeamLoc();
    const visible = await field.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      console.log('  ✓ Sales Team: "" (blank / not visible)');
      return '';
    }

    const value = (await field.innerText()).trim();
    console.log(`  ✓ Sales Team: ${value}`);
    return value;
  }

  /**
   * Get the "Salesperson" field value from the Invoice form.
   */
  async getSalesperson(timeout: number = 15000): Promise<string> {
    const field = this.salespersonLoc();
    const visible = await field.isVisible({ timeout }).catch(() => false);
    if (!visible) {
      console.log('  ✓ Salesperson: "" (blank / not visible)');
      return '';
    }

    const value = (await field.innerText()).trim();
    console.log(`  ✓ Salesperson: ${value}`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoice Order wizard + invoice line / total readers (UC-B-1: multi-product invoice)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * On the "Invoice Order" wizard, select the "Invoiceable lines" option (the first option,
   * advance_payment_method = "delivered"). It is selected by default, so this is idempotent - it
   * mirrors the manual step and guards against a non-default pre-selection. Tolerant: logs and
   * continues if the radio is not present.
   * @param timeout - max time to wait for the radio (default: abnormalWait)
   */
  async selectInvoiceableLines(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log('  - Selecting "Invoiceable lines" in the Invoice Order wizard');
    const label = this.invoiceableLinesLabel();
    const visible = await label.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ⚠ "Invoiceable lines" option not found (wizard may differ) - continuing with default');
      return false;
    }
    try {
      // Click the label (the input is visually hidden). Force-check the input as a fallback.
      await label.click();
    } catch {
      await this.invoiceableLinesRadio().check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.short);
    const checked = await this.invoiceableLinesRadio().isChecked().catch(() => false);
    console.log(`  ✓ "Invoiceable lines" selected (checked=${checked})`);
    return true;
  }

  /**
   * Read the invoice grand Total (footer amount_total). For a Reseller this is the NET total after
   * the automatic Partner Discount (it can be less than the sum of the per-line gross subtotals).
   * @returns the trimmed total text, e.g. "$ 85.85"
   * @param timeout - max time to wait for the element (default: 15000ms)
   */
  async getInvoiceTotal(timeout: number = 15000): Promise<string> {
    const field = this.invoiceTotalLoc();
    await field.waitFor({ state: 'visible', timeout });
    const value = (await field.innerText()).trim();
    console.log(`  ✓ Invoice Total (amount_total): ${value}`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Add Credit Note -> refund wizard (account.invoice.refund) - UC-B-7
  //   The "Add Credit Note" header button (permission-gated; visible for e.g. Yulia) opens a wizard:
  //   Credit Method (filter_refund radio) / Reason (description) / Credit Note Date (date_invoice).
  //   Submitting ("Add Credit Note" = invoice_refund) creates the credit note and opens a LIST of the
  //   invoice's credit notes; open the latest one. The credit note IS an account.invoice (out_refund),
  //   so its detail screen reuses the InvoicePage readers/actions.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click the invoice "Add Credit Note" header button (must be visible for the current user) to open
   * the refund wizard. Throws if the button is not visible (e.g. the user lacks the permission).
   * @param timeout - max time to wait for the button (default: abnormalWait)
   */
  async clickAddCreditNote(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    console.log('  - Looking for the visible "Add Credit Note" button');
    const btn = this.addCreditNoteButton();
    await btn.waitFor({ state: 'visible', timeout });
    await btn.click({ timeout });
    console.log('  - Clicked "Add Credit Note" (refund wizard opening)');
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog();
  }

  /**
   * Select the "Credit Method" (filter_refund) in the refund wizard. Maps the visible label to its
   * data-value ("Create a draft credit note" -> "refund"). Clicks the label (the radio input is a
   * hidden custom-control), then verifies the radio is checked.
   * @param methodLabel e.g. "Create a draft credit note"
   * @returns true once the matching radio is checked
   */
  async selectCreditMethod(methodLabel: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    console.log(`  - Selecting Credit Method = "${methodLabel}"`);
    const dataValue = /draft/i.test(methodLabel) ? 'refund' : /cancel/i.test(methodLabel) ? 'cancel' : /modify/i.test(methodLabel) ? 'modify' : 'refund';
    const label = this.creditMethodLabel(methodLabel);
    const radio = this.creditMethodRadio(dataValue);
    try {
      await label.waitFor({ state: 'visible', timeout });
      await label.click();
    } catch {
      await radio.check({ force: true }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.short);
    const checked = await radio.isChecked().catch(() => false);
    console.log(`  ${checked ? '✓' : '⚠'} Credit Method "${methodLabel}" selected (checked=${checked})`);
    return checked;
  }

  /**
   * Fill the refund wizard "Reason" (description) field.
   */
  async fillCreditNoteReason(reason: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const input = this.creditNoteReasonInput();
    await input.waitFor({ state: 'visible', timeout });
    await input.click();
    await input.fill('');
    await input.fill(reason);
    console.log(`  ✓ Credit note Reason = "${reason}"`);
  }

  /**
   * Set the refund wizard date (the VISIBLE required "Credit Note Date" = date_invoice; the wizard's
   * "Accounting Date" field is hidden). Format MM/DD/YYYY. Closes the datepicker overlay afterwards.
   */
  async setCreditNoteAccountingDate(dateMMDDYYYY: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const input = this.creditNoteDateInput();
    const visible = await input.isVisible({ timeout }).catch(() => false);
    if (!visible) { console.log('  ⚠ Credit Note Date field not visible - skipping (defaults to today)'); return; }
    await input.click();
    await input.fill('');
    await input.fill(dateMMDDYYYY);
    // Close the datepicker with Tab (NOT Escape - inside a modal, Escape closes the whole refund wizard).
    await this.page.keyboard.press('Tab');
    await this.page.locator('.bootstrap-datetimepicker-widget').first().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    console.log(`  ✓ Credit Note Date = ${dateMMDDYYYY}`);
  }

  /**
   * Click the wizard's "Add Credit Note" submit button (invoice_refund). With Credit Method = "Create a
   * draft credit note" this creates the credit note and opens a LIST of the invoice's credit note(s).
   * Waits until that list (or the credit-note form) renders.
   * @param timeout - max time to wait (default: abnormalWait)
   */
  async submitAddCreditNote(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    console.log('  - Submitting the refund wizard ("Add Credit Note")');
    const btn = this.submitRefundButton();
    await btn.waitFor({ state: 'visible', timeout });
    await btn.click({ timeout });
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.dismissErrorDialogWithRetry();
    // The result is a list of the invoice's credit notes (or, in some configs, the credit-note form).
    await this.page.locator('tr.o_data_row, .o_form_view').first()
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    console.log('  ✓ Credit note created (list/form opened)');
  }

  /**
   * From the credit-notes list that the refund wizard opened, open the just-created credit note. The
   * list shows the invoice's credit note(s); the wizard creates exactly one per submit, so the first
   * (latest) data row is CreditNote#1. If a credit-note form is already open (no list), this is a no-op.
   * Returns the opened credit-note form URL.
   * @param timeout - max time to wait (default: abnormalWait)
   */
  async openLatestCreditNote(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const rowCount = await this.page.locator('tr.o_data_row').count().catch(() => 0);
    if (rowCount > 0) {
      console.log(`  - Credit-notes list has ${rowCount} row(s); opening the latest (CreditNote#1)`);
      await this.firstDataRow().waitFor({ state: 'visible', timeout });
      await this.firstDataRow().click();
      await this.wait(CommonUtils.waitTimes.long);
      await this.dismissErrorDialogWithRetry();
      await this.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    } else {
      console.log('  - No list rows; assuming the credit-note form is already open');
    }
    const url = this.page.url();
    console.log(`  ✓ CreditNote#1 opened (URL: ${url})`);
    return url;
  }

  /**
   * Read an invoice line's Quantity and Subtotal (the GROSS line amount before the order-level
   * Partner Discount) by product code. Columns on the posted account.invoice line list:
   * 1 handle | 2 Product | 3 Start | 4 End | 5 Description | 6 Quantity | 7 UoM | 8 Price |
   * 9 Special Discount(%) | 10 Subtotal. Quantity (td[6]) and Subtotal (td[10]) are bare <td> text.
   * @param productCode - product code to identify the line, e.g. "[A2149B]"
   * @param timeout - max time to wait for the line (default: abnormalWait)
   * @returns { quantity, subtotal } trimmed strings; empty when the line/cell is not found
   */
  async getInvoiceLineData(
    productCode: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<{ quantity: string; subtotal: string }> {
    const code = this.escapeForXPathContains(productCode);
    const rowXp = `//div[@name="invoice_line_ids"]//tr[contains(@class,"o_data_row")][.//span[@name="product_id"][contains(.,"${code}")]]`;
    const row = this.page.locator(`xpath=${rowXp}`).first();
    await row.waitFor({ state: 'visible', timeout }).catch(() => {});
    const quantity = ((await this.page.locator(`xpath=${rowXp}/td[6]`).first().innerText().catch(() => '')) || '').trim();
    const subtotal = ((await this.page.locator(`xpath=${rowXp}/td[10]`).first().innerText().catch(() => '')) || '').trim();
    console.log(`  ✓ Invoice line "${productCode}": qty="${quantity}" subtotal="${subtotal}"`);
    return { quantity, subtotal };
  }

  /**
   * Read the GROSS Subtotal of the FIRST (or only) invoice line, without needing the product code.
   * For a single-product invoice this gross line amount equals the invoice "Subtotal" (the sum of the
   * product line Amounts before the order-level Partner Discount). Column 10 = Subtotal (see
   * getInvoiceLineData for the column map).
   * @returns the trimmed Subtotal text (e.g. "$ 687.00"), or "" if no line is found
   */
  async getFirstInvoiceLineSubtotal(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const rowXp = '//div[@name="invoice_line_ids"]//tr[contains(@class,"o_data_row")]';
    const row = this.page.locator(`xpath=${rowXp}`).first();
    await row.waitFor({ state: 'visible', timeout }).catch(() => {});
    const subtotal = ((await this.page.locator(`xpath=(${rowXp})[1]/td[10]`).first().innerText().catch(() => '')) || '').trim();
    console.log(`  ✓ First invoice line Subtotal (gross): "${subtotal}"`);
    return subtotal;
  }

  /**
   * Read the billing PERIOD of the first invoice line (the "Start" and "End" columns that
   * sale_subscription puts on a subscription invoice line). Column map is documented on
   * getInvoiceLineData: 3 = Start, 4 = End.
   *
   * Needed by the recurrence cases (CRM-11806_1.2.x), which must prove the generated line
   * really covers one month / one quarter / one year and not some other span.
   *
   * @returns { start, end } trimmed date strings; empty strings when the line/columns are absent
   */
  async getFirstInvoiceLinePeriod(
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<{ start: string; end: string }> {
    const rowXp = '//div[@name="invoice_line_ids"]//tr[contains(@class,"o_data_row")]';
    const row = this.page.locator(`xpath=${rowXp}`)
      .or(this.page.locator('div[name="invoice_line_ids"] tr.o_data_row')).first();
    await row.waitFor({ state: 'visible', timeout }).catch(() => {});
    const start = ((await this.page.locator(`xpath=(${rowXp})[1]/td[3]`).first()
      .innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    const end = ((await this.page.locator(`xpath=(${rowXp})[1]/td[4]`).first()
      .innerText({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    console.log(`  ✓ First invoice line period: Start="${start}" End="${end}"`);
    return { start, end };
  }

  /**
   * Read the invoice CURRENCY. On the Odoo 12 customer-invoice form `currency_id` lives on the
   * "Other Info" tab, so open that tab first. Falls back to the currency symbol carried by the
   * "Total" monetary span when the field itself is not rendered for this user.
   *
   * @returns the currency as shown, e.g. "USD" (or the symbol, e.g. "$", via the fallback)
   */
  async getInvoiceCurrency(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    // `currency_id` sits in the TOP group of the invoice form (not on the "Other Info" tab), inside
    // a group="base.group_multi_currency" block - so it is simply absent for users without that
    // group. The Total-symbol fallback below covers that case.
    const field = this.page.locator('xpath=//span[@name="currency_id"] | //a[@name="currency_id"] | //div[@name="currency_id"]//span')
      .or(this.page.locator('span[name="currency_id"], a[name="currency_id"]')).first();

    if (await field.count().catch(() => 0)) {
      const value = ((await field.innerText({ timeout }).catch(() => '')) || '').trim();
      if (value) {
        console.log(`  ✓ Invoice currency: "${value}"`);
        return value;
      }
    }

    // Fallback - derive it from the symbol Odoo renders in front of the Total amount.
    const total = ((await this.invoiceTotalLoc().innerText({ timeout }).catch(() => '')) || '').trim();
    const symbol = (total.match(/^[^\d\s.,-]+/) || [''])[0].trim();
    console.log(`  ✓ Invoice currency read from the Total symbol: "${symbol}" (Total "${total}")`);
    return symbol;
  }

  /**
   * Read the full chatter / message-history text of the open invoice.
   *
   * The "invoice only, nothing sent" cases (e.g. CRM-11806_1.2.6) assert on the ABSENCE of an
   * outgoing invoice email, and the message history is the only end-user-visible signal for that.
   * Mirrors DealElementPage.getChatterText.
   *
   * @returns the concatenated chatter text, or "" when no chatter is rendered
   */
  /**
   * Is the chatter region rendered at all?
   *
   * PRESENCE PROBE - pair this with getChatterText() before asserting that the history contains no
   * outgoing email. getChatterText() returns "" both when the history is empty AND when the region
   * could not be read, so an assertion on its content alone would pass for the wrong reason. The
   * invoice form always carries `<div class="oe_chatter">`, so a false here is a real failure.
   */
  async hasChatter(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const chatter = this.page
      .locator("xpath=//*[contains(@class,'o_mail_thread') or contains(@class,'o-mail-Thread')]")
      .or(this.page.locator('.o_mail_thread, .o-mail-Thread'));
    await chatter.first().waitFor({ state: 'attached', timeout }).catch(() => {});
    const present = (await chatter.count().catch(() => 0)) > 0;
    console.log(`  ✓ Chatter region present: ${present}`);
    return present;
  }

  /**
   * Is the "Payments" notebook tab rendered?
   *
   * PRESENCE PROBE - pair this with getPaymentRowCount() before asserting "no payment recorded".
   * getPaymentRowCount() returns 0 both when there are no payment rows AND when the tab could not
   * be found, so the count alone cannot tell the two apart. On account.invoice the tab is declared
   * unconditionally (`<page string="Payments"><field name="payment_ids"/></page>` - no attrs), so
   * it is present even on a draft invoice and a false here means the read genuinely failed.
   */
  /**
   * Open the "Other Info" notebook tab.
   *
   * Odoo renders every notebook page into the DOM but keeps the inactive ones HIDDEN, so a reader
   * for a field that lives on this tab (Source Document / `origin`, Journal, Reference, ...) will
   * resolve its span and then time out waiting for it to become visible. Call this first.
   */
  async openOtherInfoTab(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    await this.openNotebookTab('Other Info', timeout);
  }


  /**
   * Activate a notebook tab by its visible label and PROVE it became the active page.
   *
   * Two traps this closes:
   *   - a bare //a[contains(.,"<label>")] can match a tab belonging to a form still parked in the
   *     breadcrumb stack, so filter to the VISIBLE one;
   *   - clicking and logging success without checking leaves every later reader waiting on a span
   *     that is in the DOM but hidden, which surfaces as an unexplained 15s timeout somewhere else
   *     entirely. Verify the `active` class and throw here instead.
   */
  async openNotebookTab(label: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const tab = this.page
      .locator('xpath=//div[contains(@class,"o_notebook")]//a[contains(@class,"nav-link")]')
      .or(this.page.locator('.o_notebook .nav-link'))
      .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') })
      .filter({ visible: true })
      .first();

    const isActive = async (): Promise<boolean> => {
      const cls = ((await tab.getAttribute('class').catch(() => '')) || '');
      const sel = ((await tab.getAttribute('aria-selected').catch(() => '')) || '');
      return /\bactive\b/.test(cls) || sel === 'true';
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      await tab.waitFor({ state: 'visible', timeout }).catch(() => {});

      // Escalate: a normal click, then a forced one (an overlay from the view we drilled in from
      // can still be swallowing pointer events), then a direct DOM click that bypasses hit-testing
      // entirely and lets Bootstrap's tab handler run.
      await tab.click({ timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      if (await isActive()) { console.log(`  - "${label}" tab is now the active page (attempt ${attempt}, plain click)`); return; }

      await tab.click({ force: true, timeout }).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      if (await isActive()) { console.log(`  - "${label}" tab is now the active page (attempt ${attempt}, forced click)`); return; }

      await tab.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
      if (await isActive()) { console.log(`  - "${label}" tab is now the active page (attempt ${attempt}, DOM click)`); return; }
    }

    // Diagnose rather than just fail - report every tab anchor on the page with its state, so the
    // next run says WHY instead of leaving another round of guessing.
    const all = this.page.locator('.o_notebook .nav-link, a[data-toggle="tab"]');
    const total = await all.count().catch(() => 0);
    const seen: string[] = [];
    for (let i = 0; i < total; i++) {
      const text = ((await all.nth(i).innerText({ timeout: CommonUtils.waitTimes.medium }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const cls = ((await all.nth(i).getAttribute('class').catch(() => '')) || '');
      const vis = await all.nth(i).isVisible().catch(() => false);
      seen.push(`"${text}" [class="${cls}", visible=${vis}]`);
    }
    throw new Error(
      `openNotebookTab: could not activate the "${label}" tab after 3 attempts (plain / forced / DOM click). ` +
      'Every field on that page stays in the DOM but hidden, so any reader called next would time out ' +
      `instead of reporting a value. Tab anchors found on the page (${total}): ${seen.join(' | ') || '(none)'}`,
    );
  }

  /**
   * Is the invoice NUMBER rendered?
   *
   * On account.invoice the number carries `attrs="{'invisible': [('state','in',('draft',))]}"`, so
   * a draft invoice shows the literal label "Draft Invoice" and NO number. Use this instead of
   * getInvoiceNumber() when the expected result is that no number exists yet - getInvoiceNumber()
   * waits for a span that is hidden by design and would fail with a timeout rather than a verdict.
   */
  async isInvoiceNumberVisible(timeout: number = CommonUtils.waitTimes.long): Promise<boolean> {
    const visible = await this.invoiceNumberField().isVisible({ timeout }).catch(() => false);
    console.log(`  ✓ Invoice number field visible: ${visible}`);
    return visible;
  }

  async hasPaymentsTab(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    await this.paymentsTabLoc().waitFor({ state: 'attached', timeout }).catch(() => {});
    const present = (await this.paymentsTabLoc().count().catch(() => 0)) > 0;
    console.log(`  ✓ Payments tab present: ${present}`);
    return present;
  }

  async getChatterText(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string> {
    const chatter = this.page
      .locator("xpath=//*[contains(@class,'o_mail_thread') or contains(@class,'o-mail-Thread') or contains(@class,'o_thread_message_content')]")
      .or(this.page.locator('.o_mail_thread, .o-mail-Thread, .o_thread_message_content'));
    await chatter.first().waitFor({ state: 'attached', timeout }).catch(() => {});
    const texts = await chatter.allTextContents().catch(() => [] as string[]);
    const joined = texts.join('\n').replace(/\s+\n/g, '\n').trim();
    console.log(`  ✓ Chatter text read (${joined.length} chars)`);
    return joined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoices LIST view (Invoicing > Customers > Invoices)
  //   "Total in Company Currency" is a default column here (it is NOT shown on the invoice form),
  //   so the exchange-rate check (ExchangeRate-1.1) reads it from the list, not the form.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open Invoicing > Customers > Invoices (list view) via the menu action hash, dismiss any Odoo
   * error popup, and wait for the list rows to render.
   * @param timeout - max time to wait for the list (default: pageLoad)
   */
  async openCustomerInvoicesList(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    console.log('  - Opening Invoicing > Customers > Invoices');
    // Null onbeforeunload first (we may be leaving a form) to avoid a blocking "unsaved changes" prompt.
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    // Explicitly request the LIST view (view_type=list). Without it, navigating from a FORM of the
    // same action can keep the form view mounted.
    await this.page.goto(`${origin}/web?#action=289&model=account.invoice&view_type=list&menu_id=148`, { waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialogWithRetry().catch(() => {});
    await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
    // Land on the LIST. A hash-only nav from a FORM may not re-render the action, so reload ONLY when
    // the list table did not appear (an UNCONDITIONAL reload was found to leave the list-view re-render
    // fragile for a later custom-filter apply). Detect with a bounded wait, not the full page-load timeout.
    let onList = await this.invoiceListTable().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility }).then(() => true).catch(() => false);
    if (!onList) {
      console.log('  ⚠ Invoices list not rendered by hash nav - forcing a reload');
      await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await this.dismissErrorDialogWithRetry().catch(() => {});
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      onList = await this.invoiceListTable().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    }
    await this.anyInvoiceListRow().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Customer Invoices list opened (list table visible: ${onList})`);
  }

  /**
   * Search the Invoices list via the control-panel search box (Search... -> Enter), so the given
   * invoice shows up in the list. Waits for the list to re-render after filtering.
   * @param text - the search text (e.g. the Invoice Number)
   * @param timeout - max time to wait for the search box / list (default: abnormalWait)
   */
  async searchInvoiceInList(text: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    console.log(`  - Searching the Invoices list for "${text}"`);
    const input = this.searchViewInput();
    await input.waitFor({ state: 'visible', timeout });
    // Odoo's searchview ignores fill() - fill() sets the value but fires no key events, so Odoo never
    // builds the "Search Invoice for: <text>" autocomplete option and Enter then applies NO facet
    // (the list stays unfiltered at ~129k rows). Type via real key events so the facet is created,
    // exactly like ContactPage.searchAndOpenContact.
    await input.click();
    await input.press('Control+a').catch(() => {});
    await input.press('Backspace').catch(() => {});
    await this.page.keyboard.type(text, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long); // let the search autocomplete dropdown render
    await this.page.keyboard.press('Enter'); // apply "Search Invoice for: <text>"
    // Let the backend filter and the list re-render.
    await this.wait(CommonUtils.waitTimes.long);
    await this.invoiceListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    console.log(`  ✓ Search submitted for "${text}" (facet applied)`);
  }

  /**
   * Read the "Total in Company Currency" value for a given Invoice Number from the Invoices LIST view.
   * Resolves the "Total in Company Currency" column by header text (resilient to column re-order) and
   * the row by its Number cell. Returns '' when the invoice row is not found.
   * @param invoiceNumber - the Invoice Number (e.g. "INV/2026/1711")
   * @param timeout - max time to wait for the list (default: abnormalWait)
   * @returns the cell text, e.g. "$ 114.01"
   */
  async getTotalInCompanyCurrencyFromList(
    invoiceNumber: string,
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<string> {
    await this.invoiceListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.anyInvoiceListRow().waitFor({ state: 'visible', timeout }).catch(() => {});

    const value = await this.page.evaluate((num: string) => {
      const table = document.querySelector('table.o_list_view') || document.querySelector('.o_list_view table');
      if (!table) return '';
      const headers = Array.from(table.querySelectorAll('thead th'));
      const colIdx = headers.findIndex((h) => (h.textContent || '').trim().startsWith('Total in Company Currency'));
      if (colIdx === -1) return '';
      const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
      for (const r of rows) {
        const cells = Array.from(r.querySelectorAll('td'));
        // The Number is the first non-selector data cell; match the row that contains the number text.
        if (cells.some((td) => (td.textContent || '').replace(/\s+/g, ' ').trim() === num)) {
          return cells[colIdx] ? (cells[colIdx].textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '';
        }
      }
      return '';
    }, invoiceNumber).catch(() => '');

    console.log(`  ✓ Total in Company Currency for "${invoiceNumber}" (list): "${value}"`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Invoices LIST view - "Add Custom Filter" facets + row actions (data-cleanup utilities)
  //   Odoo 12 "Filters > Add Custom Filter" builds the exact facets seen in the UI:
  //     Reseller -> operator "is equal to" (default), value = a Many2one autocomplete <input>
  //     Status   -> operator "is" (default),          value = a native <select>
  //                 (<span class="o_searchview_extended_prop_value"><select> Draft/Open/
  //                  In Payment/Paid/Cancelled </select></span>)
  //   TWO SEPARATE custom filters (two facets) are AND-ed; conditions WITHIN one custom filter
  //   are OR-ed - so Reseller + Status=Paid must be two separate Apply operations.
  // ═══════════════════════════════════════════════════════════════════════════

  private readonly filtersMenuButton   = () => this.page.locator("xpath=//div[contains(@class,'o_search_options')]//button[normalize-space()='Filters']").first();
  private readonly addCustomFilterBtn  = () => this.page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter')] | //a[contains(normalize-space(),'Add Custom Filter')]").first();
  private readonly cfFieldSelect       = () => this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_field')]").first();
  private readonly cfOperatorSelect    = () => this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_op')]").first();
  private readonly cfValueSelect       = () => this.page.locator("xpath=//span[contains(@class,'o_searchview_extended_prop_value')]//select | //select[contains(@class,'o_searchview_extended_prop_value')]").first();
  private readonly cfValueInput        = () => this.page.locator("xpath=//input[contains(@class,'o_searchview_extended_prop_value')] | //span[contains(@class,'o_searchview_extended_prop_value')]//input").first();
  private readonly cfApplyButton       = () => this.page.locator("xpath=//div[contains(@class,'o_filters_menu')]//button[normalize-space()='Apply'] | //button[normalize-space()='Apply']").first();
  private readonly cfDropdownOption    = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly listDataRow         = () => this.page.locator('tr.o_data_row');
  private readonly firstRowNumberCell  = () => this.page.locator("xpath=(//tr[contains(@class,'o_data_row')])[1]/td[contains(@class,'o_data_cell')][1]").first();
  private readonly breadcrumbInvoicesLink = () => this.page.locator("xpath=//li[contains(@class,'breadcrumb-item')]//a[normalize-space()='Invoices']").first();
  private readonly listPager           = () => this.page.locator('.o_pager_counter, .o_pager').first();
  private readonly listNoContent       = () => this.page.locator('.o_view_nocontent, .oe_view_nocontent, .o_nocontent_help').first();

  /**
   * Open the control-panel "Filters" dropdown on the Invoices list and ensure it is actually OPEN
   * (the "Add Custom Filter" entry visible). The button is a toggle and the control panel re-renders
   * after a filter is applied, so a single click can miss / close it - retry until the entry shows.
   */
  async openFiltersMenu(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    // Ensure we are on the LIST (the Filters button only exists on the list control panel, not on a
    // form) and that no loading mask is covering it, before trying to toggle it.
    await this.waitForLoadingOverlayHidden(timeout).catch(() => {});
    await this.invoiceListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    const btn = this.filtersMenuButton();
    const add = this.addCustomFilterBtn();
    // Tolerant: poll for the "Add Custom Filter" entry, clicking the Filters toggle whenever it is
    // visible. Does NOT hard-fail if the toggle is briefly absent (control panel re-render / slow list).
    for (let attempt = 1; attempt <= 8; attempt++) {
      if (await add.isVisible().catch(() => false)) return;
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    // Last chance: surface a clear error if it truly never opened.
    await add.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
  }

  /**
   * Close the "Filters" dropdown if it is open, so the next "Add Custom Filter" starts from a clean
   * single-condition editor (a lingering-open editor would make the next condition OR-ed).
   */
  async closeFiltersMenu(): Promise<void> {
    const add = this.addCustomFilterBtn();
    if (await add.isVisible().catch(() => false)) {
      await this.filtersMenuButton().click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.short);
    }
  }

  /**
   * Apply ONE "Add Custom Filter" facet on the Invoices list (Filters > Add Custom Filter >
   * pick field > [pick operator] > set value > Apply). The value widget is detected adaptively:
   *   - a native <select>  (selection field like "Status")  -> selectOption by label
   *   - an <input>         (m2o / char field)               -> type the value; for an EQUALITY
   *       operator on a Many2one an autocomplete dropdown appears and its option is picked; for a
   *       text operator ("contains") the typed text is left as-is (no record pick).
   * @param fieldLabel exact field label (e.g. "Reseller", "Status")
   * @param value      the value to match (e.g. the reseller name, "Paid")
   * @param opts.operator optional operator label to select (e.g. "contains"); default keeps the UI
   *                      default ("is equal to" for m2o, "is" for selection)
   */
  async addInvoiceListCustomFilter(
    fieldLabel: string,
    value: string,
    opts: { operator?: string } = {},
    timeout: number = CommonUtils.waitTimes.abnormalWait
  ): Promise<void> {
    console.log(`  - Add Custom Filter: "${fieldLabel}" ${opts.operator ? `[${opts.operator}] ` : ''}= "${value}"`);
    await this.openFiltersMenu(timeout);
    const add = this.addCustomFilterBtn();
    await add.waitFor({ state: 'visible', timeout });
    await add.click();
    await this.wait(CommonUtils.waitTimes.standard);

    const field = this.cfFieldSelect();
    await field.waitFor({ state: 'visible', timeout });
    await field.selectOption({ label: fieldLabel });
    await this.wait(CommonUtils.waitTimes.standard); // the value widget re-renders after the field changes

    // Operator (must be set BEFORE reading the value widget - it can change the widget kind for m2o).
    if (opts.operator) {
      const op = this.cfOperatorSelect();
      await op.waitFor({ state: 'visible', timeout });
      await op.selectOption({ label: opts.operator });
      await this.wait(CommonUtils.waitTimes.standard);
    }
    const wantRecordPick = !opts.operator || /equal to/i.test(opts.operator); // only pick a m2o record for equality

    // Value: prefer the native <select> (selection field); else type into the <input>.
    const select = this.cfValueSelect();
    const isSelect = await select.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (isSelect) {
      await select.selectOption({ label: value });
      console.log(`    - Selected "${value}" from the <select>`);
    } else {
      const input = this.cfValueInput();
      await input.waitFor({ state: 'visible', timeout });
      await input.click();
      await input.fill('');
      await input.fill(value);
      await this.wait(CommonUtils.waitTimes.long);
      if (wantRecordPick) {
        const option = this.cfDropdownOption().filter({ hasText: value }).first();
        const visible = await option.isVisible({ timeout }).catch(() => false);
        if (visible) {
          await option.click();
          console.log(`    - Picked "${value}" from the autocomplete`);
        } else {
          await this.page.keyboard.press('Enter');
          console.log(`    - No autocomplete option; committed "${value}" with Enter`);
        }
      } else {
        // Text operator (e.g. "contains"): leave the typed text; blur so it is captured on Apply.
        await this.page.keyboard.press('Tab');
        console.log(`    - Typed "${value}" as a text search (operator "${opts.operator}")`);
      }
    }

    await this.wait(CommonUtils.waitTimes.standard);
    const apply = this.cfApplyButton();
    await apply.waitFor({ state: 'visible', timeout });
    await apply.click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialog().catch(() => {});
    await this.closeFiltersMenu(); // guarantee a clean menu state for the next custom filter
    await this.invoiceListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Custom Filter applied: "${fieldLabel}" = "${value}"`);
  }

  /**
   * Apply the two facets: Reseller matches <name> AND Status = <status>.
   * IMPORTANT: the Reseller filter uses operator "contains" (name ilike), NOT "is equal to". There
   * can be MULTIPLE partner records sharing the display name "TEST-Reseller#Automation-Jun10" (test
   * setup duplicates); "is equal to" pins ONE partner_id and misses records whose reseller_id is a
   * different same-named partner (observed: Paid Credit Notes were skipped). "contains" matches ALL
   * same-named reseller partners. The per-record guard still re-checks the reseller on the form.
   * @param resellerName the reseller partner name (e.g. "TEST-Reseller#Automation-Jun10")
   * @param status the invoice status label (default "Paid")
   */
  async filterInvoicesByResellerAndStatus(resellerName: string, status: string = 'Paid'): Promise<void> {
    await this.addInvoiceListCustomFilter('Reseller', resellerName, { operator: 'contains' });
    await this.addInvoiceListCustomFilter('Status', status);
  }

  /**
   * Read the pager total (the "Z" in "1-80 / Z"), i.e. the number of records matching the current
   * filter. Returns -1 when the pager text can't be parsed (unknown). Used to distinguish a
   * genuinely-empty filtered list from a list that simply hasn't finished re-rendering.
   */
  async getListPagerTotal(): Promise<number> {
    const txt = ((await this.listPager().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    // Formats: "1-80 / 103", "1-2 / 2", or a bare "2".
    const m = txt.match(/\/\s*([\d,]+)/) || txt.match(/^([\d,]+)$/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : -1;
  }

  /**
   * Count the data rows currently shown in the Invoices list, ROBUST to the slow Odoo re-render after
   * a filter/navigation. Polls until the list SETTLES:
   *   - returns the row count as soon as any row is rendered, OR
   *   - returns 0 only once the pager total confirms an empty result (0 / no pager).
   * This prevents a FALSE 0 read during the re-render window (observed: pager shows "1-80 / 103"
   * while the rows have not yet painted), which would otherwise end the cancel loop prematurely.
   * Note: the row count is capped by the page size (80) - fine for a cancel-until-empty loop.
   * @param timeout - max time to wait for the list to settle (default: pageLoad)
   */
  async getInvoiceListRowCount(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<number> {
    const step = CommonUtils.waitTimes.long;
    let rows = 0;
    for (let waited = 0; waited <= timeout; waited += step) {
      await this.waitForLoadingOverlayHidden(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      rows = await this.listDataRow().count().catch(() => 0);
      if (rows > 0) return rows;
      const total = await this.getListPagerTotal();
      const noContent = await this.listNoContent().isVisible().catch(() => false);
      // Genuinely empty when the "no content" placeholder is shown (reliable, even if the pager is
      // stale at a pre-filter count), OR the pager confirms 0 records / there is no pager.
      if (rows === 0 && (noContent || total === 0)) return 0;
      console.log(`  - list not settled yet (rows=${rows}, pager total=${total}, noContent=${noContent}); waiting...`);
      await this.wait(step);
    }
    rows = await this.listDataRow().count().catch(() => 0);
    console.log(`  ⚠ list did not settle within ${timeout}ms; returning row count=${rows}`);
    return rows;
  }

  /**
   * Read the "Number" cell (first data column) of the first row in the Invoices list, e.g.
   * "INV/2026/1723". Returns '' when the list is empty. Used to detect a stale (not-refreshed)
   * list and to skip an already-processed row in the cancel loop.
   */
  async getFirstRowInvoiceNumber(): Promise<string> {
    const cell = this.firstRowNumberCell();
    const visible = await cell.isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!visible) return '';
    return ((await cell.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the "Number" cell (first data column) of EVERY row in the Invoices list, in row order.
   * Used by the cancel loop to pick the first not-yet-processed invoice (so an un-cancellable one is
   * skipped instead of retried forever). Empty strings are draft rows with no number yet.
   */
  async getAllRowInvoiceNumbers(): Promise<string[]> {
    const anyRow = await this.listDataRow().first().isVisible({ timeout: CommonUtils.waitTimes.long }).catch(() => false);
    if (!anyRow) return [];
    return await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr.o_data_row'));
      return rows.map((r) => {
        const cells = r.querySelectorAll('td.o_data_cell');
        return cells[0] ? (cells[0].textContent || '').replace(/\s+/g, ' ').trim() : '';
      });
    }).catch(() => [] as string[]);
  }

  /**
   * Open an invoice/credit-note form directly by its database id (account.invoice). Used to reach
   * records that a name-based reseller filter cannot surface - e.g. a reseller_bronze Credit Note whose
   * reseller_id is a duplicate-named partner not returned by name search.
   */
  async openInvoiceById(id: number | string, timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.page.evaluate(() => { (window as unknown as { onbeforeunload: unknown }).onbeforeunload = null; }).catch(() => {});
    await this.page.goto(`${origin}/web?#id=${id}&action=289&model=account.invoice&view_type=form`, { waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialogWithRetry();
    await this.waitForPageLoad(timeout);
  }

  /**
   * Open the Invoices-list row whose Number equals `number` (into its form). Returns false if no such
   * row is visible. Invoice numbers are unique, so a text match on the row is safe.
   */
  async openInvoiceRowByNumber(number: string, timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const row = this.listDataRow().filter({ hasText: number }).first();
    const visible = await row.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log(`  ⚠ Invoices-list row for "${number}" not found`);
      return false;
    }
    await row.click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialogWithRetry();
    await this.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
    return true;
  }

  /**
   * Open the first row of the Invoices list (into its form view) and wait for the form to render.
   */
  async openFirstInvoiceRow(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const row = this.listDataRow().first();
    await row.waitFor({ state: 'visible', timeout });
    await row.click();
    await this.wait(CommonUtils.waitTimes.long);
    await this.dismissErrorDialogWithRetry();
    await this.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
  }

  /**
   * Click the "Invoices" breadcrumb link to return from an invoice form back to the (still-filtered)
   * list. Breadcrumb navigation preserves the search facets (a hard reload would drop them).
   * Non-throwing: logs a warning if the link is not present.
   */
  async clickInvoicesBreadcrumb(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<void> {
    const link = this.breadcrumbInvoicesLink();
    const visible = await link.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (!visible) {
      console.log('  ⚠ "Invoices" breadcrumb link not found');
      return;
    }
    await link.click();
    await this.dismissDiscardChangesDialog().catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    await this.invoiceListTable().waitFor({ state: 'visible', timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // License creation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Click CREATE LICENSE button and wait for the License form to load.
   * @param timeout - Maximum time to wait for loading to complete (default: 30000ms)
   */
  async clickCreateLicense(timeout: number = 30000): Promise<void> {
    console.log('  - Looking for CREATE LICENSE button');
    const createLicenseButton = this.createLicenseButton();
    await createLicenseButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found CREATE LICENSE button');
    
    await createLicenseButton.click();
    console.log('  - Clicked "CREATE LICENSE" button');
    
    // Wait for loading to start - Odoo shows loading overlay
    await this.wait(500);
    
    // Wait for Odoo's loading overlay to disappear (indicates page finished loading)
    const loadingOverlay = this.loadingOverlay();
    const hasLoadingOverlay = await loadingOverlay.count() > 0;
    if (hasLoadingOverlay) {
      console.log('  - Waiting for loading overlay to disappear...');
      await loadingOverlay.waitFor({ state: 'hidden', timeout }).catch(() => {
        console.log('  - Loading overlay timeout, continuing...');
      });
    }
    
    // Wait for License screen to appear - URL should change to license model
    await this.page.waitForURL('**/web?*model=license_management.license*', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    }).catch(() => {
      console.log('  - URL did not change to license model, checking for form...');
    });
  }
}
