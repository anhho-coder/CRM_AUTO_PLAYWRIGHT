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
  private readonly editButtonLoc               = () => this.page.getByRole('button', { name: /^Edit$/i }).first();
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
  private readonly sendButton                  = () => this.page.locator("xpath=(//button/span[contains(text(),'Send')])[4]");
  private readonly createLicenseButton         = () => this.page.getByRole('button', { name: 'CREATE LICENSE' }).or(this.page.getByRole('button', { name: 'Create License' })).first();

  // ─── Dialog / overlay ─────────────────────────────────────────────────────
  private readonly invoiceDialog               = () => this.page.locator('.o_dialog, .modal');
  private readonly loadingOverlay              = () => this.page.locator('.o_loading, .o_blockUI, [class*="o_loading"]');

  // ─── Form inputs ──────────────────────────────────────────────────────────
  private readonly paymentTermsInput           = () => this.page.getByRole('textbox', { name: /Payment Terms/i }).first();
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
  private readonly sourceDocumentLoc           = () => this.page.locator('xpath=//span[@name="origin"]').first();
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
    
    // Wait for Edit button to appear (indicates invoice is fully created)
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
    
    const sendButton = this.sendButton();
    await sendButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    console.log('  - Found "SEND" button');
    
    await sendButton.click();
    console.log('  - Clicked "SEND" button (performance timer started)');
    
    // Wait for send to complete - dialog should close and return to invoice page
    await this.wait(2000);
    
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
