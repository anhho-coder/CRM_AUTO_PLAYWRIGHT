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
  private readonly registerPaymentButton       = () => this.page.locator("xpath=//button/span[contains(text(),'Register Payment')]");
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
  /** Input field in the Register Payment dialog */
  private readonly actuallyReceivedInput       = () => this.page.locator('xpath=((//td//label[contains(text(),"Actually Received")])[3]/following::td/input)[1]');

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
  private readonly sourceDocumentLoc           = () => this.page.locator('xpath=//span[@name="origin"]').first();
  //Quoc Anh: Invoice date located in the center of page. 
  private readonly invoiceDateLoc              = () => this.page.locator('xpath=//span[@name="date_invoice"]').first();
  private readonly dueDateLoc                  = () => this.page.locator('xpath=//span[@name="date_due"]').first();
  private readonly distributorLoc              = () => this.page.locator('xpath=//a[@name="distributor_id"]').first();
  private readonly resellerLoc                 = () => this.page.locator('xpath=//a[@name="reseller_id"]').first();
  private readonly salesTeamLoc                = () => this.page.locator('xpath=//a[@name="team_id"]').first();
  private readonly salespersonLoc              = () => this.page.locator('xpath=//a[@name="user_id"]').first();
  private readonly amountDueLoc                = () => this.page.locator('xpath=//span[@name="residual"] | //span[@name="amount_residual"]').first();

  constructor(page: Page) {
    super(page);
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
    console.log('  - Looking for VALIDATE button');
    
    const validateButton = this.validateButton_RegisterPayment();
    await validateButton.waitFor({ state: 'visible', timeout });
    console.log('  - Found VALIDATE button');
    
    await validateButton.click();
    console.log('  - Clicked "VALIDATE" button on Register Payment dialog');
    
    // Wait for validation to complete
    await this.wait(5000);
  }
  /**
   * Click REGISTER PAYMENT button on the validated invoice
   * @param timeout - Maximum time to wait (default: 20000ms)
   */
  async clickRegisterPayment(timeout: number = 20000): Promise<void> {
    const registerPaymentButton = this.registerPaymentButton();
    await registerPaymentButton.waitFor({ state: 'visible', timeout });
    console.log('  - Found REGISTER PAYMENT button');
    await registerPaymentButton.click();
    console.log('  - Clicked "REGISTER PAYMENT" button');
    await this.wait(1000);
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
