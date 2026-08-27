import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Quotation Page Object (Sale Order in Quotation state)
 * Handles interactions with Quotation forms after NEW QUOTATION is created
 */
export class QuotationPage extends BasePage {
  // Locators
  // XPath primary, role fallback - the Mig backend theme does not expose the toolbar Edit button
  // through getByRole (see BasePage.editButton).
  private readonly editButtonLoc = () => this.page.locator("xpath=//button[contains(@class,'o_form_button_edit') or normalize-space(.)='Edit' or normalize-space(.)='EDIT']")
    .or(this.page.getByRole('button', { name: /^\s*Edit\s*$/i }))
    .first();
  private readonly actionButton = () => this.page.getByRole('button', { name: /^\s*Action\s*$/i });
  // Class-first (like editButtonLoc): on the Migration server the theme renders the control-panel
  // save button as <i class="fa fa-check"/> + <span>Save</span>, so its accessible name is " Save"
  // (leading space). Playwright normalizes whitespace for STRING name matching but NOT for regex,
  // so an anchored /^Save$/i can never match it - hence the o_form_button_save class comes first
  // and the regex fallback tolerates surrounding whitespace.
  private readonly saveButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_save')]")
      .or(this.page.getByRole('button', { name: /^\s*SAVE\s*$/i }))
      .first();
  private readonly sendByEmailButton = () => this.page.getByRole('button', { name: /SEND BY EMAIL/i }).or(this.page.getByRole('button', { name: /Send by Email/i })).first();
  // Odoo's rich-text editor (summernote) keeps three hidden .modal dialogs permanently in the DOM
  // (note-image-dialog / note-link-dialog / note-help-dialog), and a stacked o_technical_modal can
  // still be present, so a bare '.o_dialog, .modal' hit strict mode with 5 matches once the mail
  // composer opened. Scope to the VISIBLE dialog and take the topmost (last opened) one. When no
  // dialog is open this resolves to 0 elements, which is what waitFor({state:'hidden'}) wants.
  private readonly emailDialog = () => this.page.locator('.o_dialog, .modal').filter({ visible: true }).last();
  private readonly sendButtonInDialog = () => this.emailDialog().getByRole('button', { name: /^\s*SEND\s*$/i }).or(this.emailDialog().getByRole('button', { name: /^\s*Send\s*$/i })).first();
  private readonly successNotification = () => this.page.locator('.o_notification_manager, .o_notification, .o_toast').filter({ hasText: /sent|success/i }).first();
  // --- CRM-12415 regression guard (used by CRM-12325_2.5.6): the "Recipients" row of the
  // Send-by-Email composer. On crm-mig the mail.compose.message form renders it as
  //   <label for="partner_ids" string="Recipients"/>
  //   <span name="document_followers_text">Followers of the document and</span>
  //   <field name="partner_ids" widget="many2many_tags_email" placeholder="Add contacts to notify..."/>
  // so every PROPOSED recipient is one .o_badge_text tag inside div[name="partner_ids"]. All four
  // locators are scoped to the composer dialog - a tag rendered on the Quotation form behind it must
  // never be read by mistake.
  private readonly emailRecipientsCell = () =>
    this.emailDialog().locator("xpath=.//div[@name='partner_ids']").first();
  private readonly emailRecipientTags = () =>
    this.emailDialog().locator("xpath=.//div[@name='partner_ids']//span[contains(@class,'o_badge_text')]");
  private readonly emailSubjectInput = () =>
    this.emailDialog().locator("xpath=.//input[@name='subject'] | .//div[@name='subject']//input").first();
  private readonly cancelButtonInDialog = () =>
    this.emailDialog().getByRole('button', { name: /^\s*Cancel\s*$/i }).first();
  private readonly newQuotationButton = () => this.page.locator("//button[contains(@name,'action_create_quote_from_de')]");
  private readonly confirmButton = () => this.page.locator('xpath=(//button[@name="action_confirm"])[2]');
  private readonly lockButton = () => this.page.locator('xpath=//button/span[contains(text(),"Lock")]');
  private readonly toApproveButton = () => this.page.locator("//button[contains(@name,'button_to_approve')]");
  // Pin the approval buttons by their Odoo action name and keep only the VISIBLE match. Odoo renders
  // these buttons for everyone and hides them with `o_invisible_modifier` when the current user is
  // not an eligible approver, so a plain `.first()` resolves to a hidden node and the wait times out
  // against a button that is genuinely on screen for the approver.
  // `not(@disabled)` matters as much as the visibility filter: Odoo keeps a DISABLED copy of these
  // buttons in the DOM while an RPC is in flight, and clicking a disabled element never becomes
  // actionable - Playwright then waits for it forever (a click with no explicit timeout ate the
  // whole 15-min test budget of CRM-12325_2.5.5).
  private readonly approveButton = () => this.page.locator("xpath=//button[@name='action_approve' and not(@disabled)]")
    .or(this.page.locator('button').filter({ hasText: /^APPROVE$/i }))
    .filter({ visible: true })
    .first();
  private readonly rejectButton = () => this.page.locator("xpath=//button[@name='action_wizard_reject' and not(@disabled)]")
    .or(this.page.locator('button').filter({ hasText: /^REJECT$/i }))
    .filter({ visible: true })
    .first();
  // Header "Cancel" (`action_cancel`). The Mig sale.order form shows it with
  // states="approved,pending_approval" (view 1365) ON TOP of the base states="draft,sent,sale"
  // (view 787), so a Quotation waiting for approval carries a live Cancel for its OWNER - that is
  // what CRM-12325_2.5.9 exercises. Same visible+not(@disabled) discipline as APPROVE/REJECT.
  private readonly cancelButton = () => this.page.locator("xpath=//button[@name='action_cancel' and not(@disabled)]")
    .or(this.page.locator('button').filter({ hasText: /^\s*Cancel\s*$/i }))
    .filter({ visible: true })
    .first();
  // Header "Duplicate" (`action_duplicate`) - added by view 1398 with NO attrs, i.e. always shown.
  // The same view sets create="false" on the form, so Duplicate is the sanctioned way to copy a
  // Quotation on O12 CE. Exercised by CRM-12325_2.5.10.
  private readonly duplicateButton = () => this.page.locator("xpath=//button[@name='action_duplicate' and not(@disabled)]")
    .or(this.page.locator('button').filter({ hasText: /^\s*Duplicate\s*$/i }))
    .filter({ visible: true })
    .first();
  // "Set to Quotation" (`action_draft`, states="cancel") - the post-Cancel signal. The statusbar
  // cannot be used for it: base view 787 declares statusbar_visible="draft,sent,sale", so the
  // `cancel` state highlights NO statusbar button and getQuotationStatus() has nothing to read.
  private readonly setToQuotationButton = () => this.page.locator("xpath=//button[@name='action_draft' and not(@disabled)]")
    .or(this.page.locator('button').filter({ hasText: /^\s*Set to Quotation\s*$/i }))
    .filter({ visible: true })
    .first();
  private readonly salesOrderNumberField = () => this.page.locator('xpath=(//span[@name="name"] | //div[@name="name"]//span | //h1[@name="name"])[1]').first();
  private readonly quotationStatusField = () => this.page.locator('xpath=//div[contains(@class,"o_statusbar_status")]//button[@aria-checked="true" or @aria-selected="true" or contains(@class,"btn-primary")]').first();
  private readonly totalInCompanyCurrencyField = () => this.page.locator('xpath=//div[@name="currency_amount_total"]//span | //span[@name="currency_amount_total"] | //div[@name="amount_total"]//span[@class="o_stat_value"] | //td[@name="currency_amount_total"] | //span[@name="amount_total"]').first();
  // "Payer" (partner_id) on the Quotation/Sales Order: readonly link primary, edit-mode input fallback.
  private readonly payerInput = () => this.page.locator('xpath=//div[@name="partner_id"]//input').first();
  private readonly payerReadonly = () => this.page.locator('xpath=//a[@name="partner_id"]').or(this.page.locator('xpath=//div[@name="partner_id"]//a')).first();
  // Pricelist (pricelist_id) and Salesperson (user_id) - readonly anchor primary, edit-mode input fallback.
  private readonly pricelistReadonly = () => this.page.locator('xpath=//a[@name="pricelist_id"]').or(this.page.locator('xpath=//div[@name="pricelist_id"]//input')).first();
  private readonly salespersonReadonly = () => this.page.locator('xpath=//a[@name="user_id"]').or(this.page.locator('xpath=//div[@name="user_id"]//input')).first();
  // Grand total (amount_total) in the order totals footer.
  private readonly amountTotalField = () => this.page.locator('xpath=//span[@name="amount_total"]').or(this.page.locator('span[name="amount_total"]')).first();
  // "Subscriptions" smart button on a confirmed Sales Order (opens the linked subscription).
  private readonly subscriptionsSmartButton = () =>
    this.page.locator('xpath=//button[@name="action_open_subscriptions"]')
      .or(this.page.locator('button[name="action_open_subscriptions"]')).first();

  // --- CRM-12060: Customer (partner_id) many2one on a NEW Quotation + autocomplete options ---
  private readonly customerInput = () =>
    this.page.locator("xpath=//div[@name='partner_id']//input").or(this.page.locator("div[name='partner_id'] input")).first();
  private readonly m2oAutocompleteOptions = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  // End User (partner_end_user_id) many2one on a NEW Quotation form (CRM-4383 guard test).
  private readonly endUserInput = () =>
    this.page.locator("xpath=//div[@name='partner_end_user_id']//input").first();

  // --- CRM-4383: Quotations LIST view toolbar - CREATE / IMPORT buttons ---
  // Scoped to the list control panel and excluding any modal (mirrors the LeadPage pattern), so the
  // check is not fooled by a "Create" button that lives inside a dialog elsewhere on the page.
  private readonly listCreateButton = () =>
    this.page.locator(
      'xpath=//div[contains(@class,"o_control_panel")]//button[contains(@class,"o_list_button_add")] | //div[contains(@class,"o_control_panel")]//button[(normalize-space()="CREATE" or normalize-space()="Create") and not(ancestor::div[contains(@class,"modal")])]'
    ).first();
  private readonly listImportButton = () =>
    this.page.locator('xpath=//div[contains(@class,"o_control_panel")]//button[normalize-space()="IMPORT" or normalize-space()="Import"]').first();
  // A rendered Quotations list screen shows either the list table (with/without rows) or Odoo's
  // "no content" helper (an Opportunity with zero quotations) - both count as "the list opened".
  private readonly listViewRoot = () => this.page.locator('.o_list_view, .o_list_table, .o_view_nocontent').first();
  private readonly listDataRows = () => this.page.locator('.o_list_view tbody tr.o_data_row, .o_list_table tbody tr.o_data_row');

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for navigation to quotation page after clicking NEW QUOTATION button
   * @param timeout - Maximum time to wait (default: 30000ms)
   */
  async waitForQuotationNavigation(timeout: number = 30000): Promise<void> {
    await this.waitForURL('**/web?*model=sale.order*', timeout);
  }

  /**
   * Wait for form view to be visible
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async waitForFormView(timeout: number = 10000): Promise<void> {
    await this.page.locator('.o_form_view').waitFor({ state: 'visible', timeout }).catch(() => {});
  }

  /**
   * Wait for Edit button to appear (indicates quotation is fully created and saved)
   * @param timeout - Maximum time to wait (default: 90000ms)
   */
  async waitForEditButton(timeout: number = 90000): Promise<void> {
    await this.editButtonLoc().waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for Quotation page to fully load
   * Verifies the page is in readonly mode with Edit button visible
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async waitForPageLoad(timeout: number = 10000): Promise<void> {
    // Wait for page to stabilize
    //await this.wait(CommonUtils.waitTimes.pageLoad);
    //console.log('  - Initial wait completed');
    
    // Verify page is in readonly mode (not edit mode)
    const editButtonVisible = await this.editButtonLoc().isVisible({ timeout: 10000 }).catch(() => false);
    if (editButtonVisible) {
      console.log('  - Page is in readonly mode (Edit button visible)');
    } else {
      console.log('  ⚠ Edit button not visible, waiting longer...');
      await this.wait(2000);
    }
    
    // Wait for Action button to be available
    await this.actionButton().waitFor({ state: 'visible', timeout }).catch(() => {
      console.log('  ⚠ Action button not immediately visible');
    });
    
    // Additional wait for any background processing
    await this.wait(2000);
    console.log('  - Quotation page fully loaded');
  }

  /**
   * Click Edit button to enter edit mode
   * @param timeout - Maximum time to wait for button (default: 10000ms)
   */
  async clickEdit(timeout: number = 10000): Promise<void> {
    await this.editButtonLoc().waitFor({ state: 'visible', timeout });
    await this.editButtonLoc().click();
    console.log('  - Clicked EDIT button');
    
    // Wait for form to be in edit mode - Save button should appear
    await this.saveButton().waitFor({ state: 'visible', timeout });
    console.log('  - Quotation is now in edit mode');
  }

  /**
   * Change Payment Term field to specified value
   * @param paymentTerm - Payment term value to select (e.g., "15 Days")
   * @param timeout - Maximum time to wait for field (default: 10000ms)
   */
  async changePaymentTerm(paymentTerm: string, timeout: number = 10000): Promise<void> {
    try {
      // Locate Payment Terms field
      const paymentTermsInput = this.page.getByRole('textbox', { name: /Payment Term/i }).first();
      await paymentTermsInput.waitFor({ state: 'visible', timeout });
      
      // Get current value
      const currentPaymentTerm = await paymentTermsInput.inputValue().catch(() => '');
      console.log(`  - Current Payment Terms: "${currentPaymentTerm}"`);
      
      // Clear and fill new value
      await paymentTermsInput.click();
      await paymentTermsInput.fill('');
      await paymentTermsInput.fill(paymentTerm);
      await this.wait(1000);
      
      // Wait for and click the dropdown option
      const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]').filter({ hasText: new RegExp(paymentTerm, 'i') }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (optionVisible) {
        await option.click();
        console.log(`  - Payment Terms: Changed to "${paymentTerm}"`);
        // Wait for onchange events to complete
        await this.wait(1000);
      } else {
        console.log(`  ⚠ Payment Terms: Typed but dropdown not found, pressing Enter`);
        await this.page.keyboard.press('Enter');
        await this.wait(1000);
      }
      
      // Verify the value was set correctly
      const updatedValue = await paymentTermsInput.inputValue().catch(() => '');
      console.log(`  - Payment Terms field value after change: "${updatedValue}"`);
    } catch (error) {
      console.log(`  ⚠ Payment Terms error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Save the quotation and wait for save completion
   * Returns the time taken for the save operation
   * @param timeout - Maximum time to wait for save completion (default: 90000ms)
   * @returns Time taken in milliseconds
   */
  async saveQuotation(timeout: number = 90000): Promise<number> {
    const startSaveTime = Date.now();
    
    // Click Save button
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    console.log('  - Clicked SAVE button (performance timer started)');
    
    // Wait for save to complete - Edit button appears when save is complete
    await this.editButtonLoc().waitFor({ state: 'visible', timeout });
    
    const saveTime = Date.now() - startSaveTime;
    console.log('✓ Quotation saved successfully');
    
    return saveTime;
  }

  /**
   * Verify Payment Term value
   * @param expectedValue - Expected payment term value (e.g., "15 Days")
   * @param waitTime - Wait time before verification (default: 2000ms)
   * @returns Object with success status and actual value
   */
  async verifyPaymentTerm(expectedValue: string, waitTime: number = 2000): Promise<{ success: boolean; actualValue: string }> {
    await this.wait(waitTime);
    
    try {
      const paymentTermRow = this.page.locator('tr').filter({ hasText: /Payment Term/i });
      const paymentTermCell = paymentTermRow.locator('td').last();
      const paymentTermExists = await paymentTermCell.count() > 0;
      
      if (paymentTermExists) {
        const paymentTermValue = await paymentTermCell.textContent() || '';
        const success = paymentTermValue.includes(expectedValue);
        
        if (success) {
          console.log(`  ✓ Payment Terms verified: "${paymentTermValue}"`);
        } else {
          console.log(`  ⚠ Payment Terms value: "${paymentTermValue}" (expected "${expectedValue}")`);
        }
        
        return { success, actualValue: paymentTermValue };
      } else {
        console.log('  ⚠ Payment Terms field not found for verification');
        return { success: false, actualValue: '' };
      }
    } catch (error) {
      console.log(`  ⚠ Payment Terms verification error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, actualValue: '' };
    }
  }

  /**
   * Confirm the quotation by clicking Edit and Save
   * This enables additional actions like "SEND BY EMAIL"
   * @param saveTimeout - Maximum time to wait for save completion (default: 10000ms)
   */
  async confirmQuotation(saveTimeout: number = 10000): Promise<void> {
    // Click Edit button to enter edit mode
    await this.editButtonLoc().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.editButtonLoc().click();
    console.log('  - Clicked Edit button');
    await this.wait(CommonUtils.waitTimes.standard);
    
    // Click Save button to confirm the quotation
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    console.log('  - Clicked SAVE button to confirm quotation');
    
    // Wait for Save button to disappear or become disabled
    await this.saveButton().waitFor({ state: 'hidden', timeout: saveTimeout }).catch(async () => {
      await this.page.waitForSelector('button.o_form_button_save:disabled', { timeout: saveTimeout }).catch(() => {
        console.log('  ⚠ Save button did not disappear or become disabled - continuing');
      });
    });
    
    // Wait for save to complete
    await this.wait(2000);
    console.log('  ✓ Quotation confirmed');
  }

  /**
   * Click "SEND BY EMAIL" button to open email dialog.
   * Uses JS evaluation as primary approach to handle various Odoo rendering states,
   * with a Playwright locator fallback.
   * @param timeout - Maximum time to wait for button (default: 15000ms)
   */
  async clickSendByEmail(timeout: number = 15000): Promise<void> {
    // Wait for page to fully load
    await this.wait(1000);

    // Diagnostic: log all visible buttons to help understand page state
    const allButtons = await this.page.evaluate((): string[] => {
      return Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'))
        .map(el => `[${el.tagName}] text="${(el.textContent || '').trim()}" class="${el.className}"`)
        .filter(s => s.length < 200);
    });
    console.log('  [DEBUG] Buttons on page:');
    allButtons.slice(0, 20).forEach(b => console.log('   ', b));

    // Primary approach: find and click via JS evaluation (handles CSS-transformed text)
    const clicked = await this.page.evaluate((): boolean => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        'button, a[role="button"]'
      ));
      const target = candidates.find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text.includes('send') && text.includes('email');
      });
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      console.log('  - Found and clicked "SEND BY EMAIL" button via JS');
    } else {
      console.log('  ⚠ JS click failed, trying Playwright locator...');
      await this.sendByEmailButton().waitFor({ state: 'visible', timeout });
      console.log('  - Found "SEND BY EMAIL" button');
      await this.sendByEmailButton().click();
      console.log('  - Clicked "SEND BY EMAIL" button');
    }

    // Wait for email dialog/modal to appear
    await this.wait(2000);
    // Wait for the email form to be fully loaded
    await this.emailDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {
      console.log('  ⚠ Email dialog did not appear with expected selectors');
    });
    console.log('  - Email form window appeared');
  }

  /**
   * Click "SEND" button in the email dialog
   * Returns the time taken for the send operation
   * @returns Time taken in milliseconds
   */
  async sendEmail(): Promise<number> {
    const startSendTime = Date.now();
    
    // Find and click the SEND button in the dialog
    await this.sendButtonInDialog().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.sendButtonInDialog().click();
    console.log('  - Clicked SEND button (performance timer started)');
    
    // Wait for send to complete - dialog should close or show success indicator
    const dialogClosed = await this.emailDialog().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    
    if (dialogClosed) {
      console.log('  - Email dialog closed successfully');
    } else {
      console.log('  ⚠ Dialog still visible, checking for success indicators');
      // Check if email was sent successfully even if dialog is still visible
      await this.wait(2000);
    }
    
    const sendTime = Date.now() - startSendTime;
    console.log('✓ Email sent successfully');
    
    return sendTime;
  }

  /**
   * Verify email was sent by checking for success notification
   * @returns Object with verification result and message
   */
  async verifyEmailSent(): Promise<{ success: boolean; message: string }> {
    await this.wait(2000);
    
    try {
      const messageVisible = await this.successNotification().isVisible({ timeout: 3000 }).catch(() => false);
      
      if (messageVisible) {
        const messageText = await this.successNotification().textContent().catch(() => '');
        console.log(`  ✓ Success notification: "${messageText}"`);
        return { success: true, message: messageText || '' };
      } else {
        console.log('  ℹ No explicit success message found (email may still have been sent)');
        return { success: false, message: 'No explicit success message found' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠ Verification check error: ${errorMsg}`);
      return { success: false, message: errorMsg };
    }
  }

  /**
   * Get Edit button visibility status
   * @returns true if Edit button is visible, false otherwise
   */
  async isEditButtonVisible(): Promise<boolean> {
    return await this.editButtonLoc().isVisible({ timeout: 5000 }).catch(() => false);
  }

  /**
   * Wait for email dialog to be visible
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async waitForEmailDialog(timeout: number = 10000): Promise<void> {
    await this.emailDialog().waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for email dialog to be hidden (closed)
   * @param timeout - Maximum time to wait (default: 30000ms)
   */
  async waitForEmailDialogClose(timeout: number = 30000): Promise<boolean> {
    return await this.emailDialog().waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
  }

  /**
   * Read the recipient tags proposed in the "Recipients" row of the OPEN Send-by-Email composer.
   * Regression guard for CRM-12415 ("Quotation Payer is not auto-filled into Recipients"): an EMPTY
   * result IS the failure signature, so this returns [] and logs the raw cell text (the
   * "Add contacts to notify..." placeholder) rather than throwing - the spec asserts on it.
   * @param timeout - Maximum time to wait for the Recipients row to render (default: 30000ms)
   * @returns one string per recipient tag, e.g. ["company20260824101612.com <Test@company...com>"]
   */
  async getEmailRecipients(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<string[]> {
    await this.emailRecipientsCell().waitFor({ state: 'visible', timeout }).catch(() => {
      console.log('  ⚠ The composer "Recipients" row did not render within the wait budget');
    });
    const tags = this.emailRecipientTags();
    const tagCount = await tags.count().catch(() => 0);
    const recipients: string[] = [];
    for (let i = 0; i < tagCount; i++) {
      const raw = ((await tags.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (raw) recipients.push(raw);
    }
    if (!recipients.length) {
      const cellText = ((await this.emailRecipientsCell().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const placeholder = ((await this.emailRecipientsCell().locator('input').first().getAttribute('placeholder').catch(() => '')) || '').trim();
      console.log(`  ⚠ Recipients row carries NO recipient tag (cell text: "${cellText}", input placeholder: "${placeholder}")`);
      return [];
    }
    console.log(`  - Recipients (${recipients.length}): ${recipients.map(r => `"${r}"`).join(', ')}`);
    return recipients;
  }

  /**
   * Read the Subject pre-filled in the open email composer (diagnostic - Odoo fills it from the mail
   * template, so it stays filled even when the recipient list does not, see CRM-12415).
   */
  async getEmailSubject(): Promise<string> {
    const value = ((await this.emailSubjectInput().inputValue().catch(() => '')) || '').trim();
    console.log(`  - Composer Subject: "${value}"`);
    return value;
  }

  /**
   * Close the email composer WITHOUT sending it, via the footer "Cancel" button (special="cancel" in
   * the mail.compose.message form). Used by the TCs that only INSPECT the composer, so the run never
   * emails the test customer. Falls back to Escape when the button is not rendered.
   * @param timeout - Maximum time to wait for the composer to disappear (default: 30000ms)
   * @returns true when the composer closed
   */
  async cancelEmailDialog(timeout: number = CommonUtils.waitTimes.savingPage): Promise<boolean> {
    const cancelVisible = await this.cancelButtonInDialog().isVisible({ timeout: CommonUtils.waitTimes.searchOppWait }).catch(() => false);
    if (cancelVisible) {
      await this.cancelButtonInDialog().click();
      console.log('  - Clicked "Cancel" in the email composer (nothing is sent)');
    } else {
      await this.page.keyboard.press('Escape');
      console.log('  ⚠ "Cancel" button not found - pressed Escape to close the email composer');
    }
    const closed = await this.emailDialog().waitFor({ state: 'hidden', timeout }).then(() => true).catch(() => false);
    console.log(`  - Email composer closed: ${closed}`);
    return closed;
  }

  /**
   * Click NEW QUOTATION button to create a new quotation
   * @param saveTimeout - Maximum time to wait for quotation creation (default: 90000ms)
   */
  async clickNewQuotation(saveTimeout: number = 90000): Promise<void> {
    console.log('  - Looking for NEW QUOTATION button');
    
    try {
      // Get button locator and wait for it to be visible within timeout
      const button = this.newQuotationButton();
      await button.waitFor({ state: 'visible', timeout: saveTimeout }).catch(() => {});
      
      // Check if button is now visible after waiting
      const buttonVisible = await button.isVisible().catch(() => false);
      
      if (buttonVisible) {
        console.log('  ✓ NEW QUOTATION button found');
        await button.scrollIntoViewIfNeeded();
        await button.click({});
        console.log('  ✓ Clicked NEW QUOTATION button successfully');
        
        // NEW QUOTATION creates and saves the quotation automatically
        // Wait for navigation to the new quotation page
        const confirmButton = this.confirmButton();
      await button.waitFor({ state: 'visible', timeout: saveTimeout }).catch(() => {});
        console.log('  - Navigated to new Quotation page');
        
        
        //await button.waitFor({ state: 'hidden', timeout: saveTimeout }).catch(async () => {
          
      } else {
        console.log('  ✗ NEW QUOTATION button not found or not visible');
        throw new Error('NEW QUOTATION button not found or not visible on the page');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error clicking NEW QUOTATION button: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Click TO APPROVE button to request approval
   * @param timeout - Maximum time to wait for button (default: 10000ms)
   */
  async clickToApprove(timeout: number = 50000): Promise<void> {
    //Feb 02, 26: Cannot see the button
    const button = this.toApproveButton();

    // "TO APPROVE" is invisible until the approval rules have materialised:
    //   attrs="{'invisible':['|',('need_approve','=',False),('state','!=','draft')]}"
    // On crm-mig those approval rows appear on a DELAYED write, not with the Quotation - measured
    // 17s after creation for SO177982, and still absent 30s later for SO177983. `need_approve` is a
    // server-side value the open form never re-reads, so waiting on the button alone can never
    // succeed: the form must be RELOADED for the freshly created approvals to un-hide it.
    let visible = await button.isVisible().catch(() => false);
    if (!visible) {
      const deadline = Date.now() + CommonUtils.waitTimes.elementAppear;
      let attempt = 0;
      while (!visible && Date.now() < deadline) {
        attempt++;
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageLoad(CommonUtils.waitTimes.savingPage).catch(() => {});
        visible = await button.isVisible().catch(() => false);
        console.log(`  - "TO APPROVE" poll ${attempt}: visible=${visible} (approvals are created on a delayed write)`);
        if (!visible) await this.wait(CommonUtils.waitTimes.long);
      }
    }

    // Final gate - fails with Playwright's own diagnostics when the button never appears.
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found "TO APPROVE" button');

    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "TO APPROVE" button - approval request sent');
    
    // Wait for the approval request to be processed
    await this.wait(3000);
  }

  /**
   * Click APPROVE button as manager
   * Returns the time taken for the approve operation
   * @returns Time taken in milliseconds
   */
  async clickApprove(): Promise<number> {
    const startApproveTime = Date.now();
    
    const button = this.approveButton();
    
    // Wait for "APPROVE" button to be visible
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found "APPROVE" button');
    
    // Wait a moment for any background modals/dialogs to close
    await this.wait(2000);
    
    // Use force: true to bypass any potential overlay issues
    await button.click({ force: true, timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "APPROVE" button (performance timer started)');
    
    // Wait for approval to complete - button should disappear or page should update
    await this.wait(2000);
    
    // Wait for the approval process to complete
    const approvalComplete = await button.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    
    if (approvalComplete) {
      console.log('  - "APPROVE" button no longer visible - approval completed');
    } else {
      console.log('  ⚠ "APPROVE" button still visible, checking for other success indicators');
      await this.wait(2000);
    }
    
    // Verify approval was successful by checking for "SEND BY EMAIL" or other indicators
    const sendEmailButton = await this.sendByEmailButton().isVisible({ timeout: 5000 }).catch(() => false);
    if (sendEmailButton) {
      console.log('  ✓ "SEND BY EMAIL" button now visible - approval successful');
    }
    
    const approveTime = Date.now() - startApproveTime;
    console.log('✓ Quotation approved successfully');
    
    return approveTime;
  }

  /**
   * Click REJECT button as manager
   * Returns the time taken for the reject operation
   * @returns Time taken in milliseconds
   */
  async clickReject(): Promise<number> {
    const startRejectTime = Date.now();
    
    const button = this.rejectButton();
    
    // Wait for "REJECT" button to be visible
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found "REJECT" button');
    
    // Click the REJECT button
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "REJECT" button - waiting for dialog');
    
    // Wait for "Reject Reason" dialog to appear. The Mig backend theme re-labels the wizard, so fall
    // back to any visible modal when the "Reject Reason" title does not match.
    await this.wait(1000);
    let rejectDialog = this.page.locator('.o_dialog, .modal').filter({ hasText: /Reject Reason/i }).first();
    let dialogVisible = await rejectDialog.isVisible({ timeout: 5000 }).catch(() => false);
    if (!dialogVisible) {
      rejectDialog = this.page.locator('.o_dialog, .modal').filter({ visible: true }).first();
      dialogVisible = await rejectDialog.isVisible({ timeout: 5000 }).catch(() => false);
      if (dialogVisible) console.log('  - Reject wizard found by visible-modal fallback');
    }
    
    if (dialogVisible) {
      console.log('  - "Reject Reason" dialog appeared');
      
      // Fill in the reason field (optional - can be left empty)
      const reasonField = rejectDialog.locator('textarea, input[name="reason"]').first();
      const reasonFieldVisible = await reasonField.isVisible({ timeout: 3000 }).catch(() => false);
      if (reasonFieldVisible) {
        await reasonField.fill('Performance test rejection', { timeout: CommonUtils.waitTimes.abnormalWait });
        console.log('  - Entered rejection reason');
      }
      
      // Click REJECT button in the dialog. Anchor on the text, not on the accessible name: the Mig
      // backend theme prefixes toolbar/dialog buttons with a FontAwesome glyph (U+F0xx), so an
      // anchored getByRole name regex matches zero elements there.
      const dialogRejectButton = rejectDialog.locator('button')
        .filter({ hasText: /^\s*REJECT\s*$/i })
        .filter({ visible: true })
        .first();
      await dialogRejectButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await dialogRejectButton.click({ timeout: CommonUtils.waitTimes.abnormalWait });
      console.log('  - Clicked REJECT button in dialog (performance timer running)');
      
      // Wait for dialog to close
      await rejectDialog.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {
        console.log('  ⚠ Dialog did not disappear within timeout');
      });
    } else {
      console.log('  ⚠ "Reject Reason" dialog did not appear');
    }
    
    // Wait for rejection to complete
    await this.wait(2000);
    
    // Verify rejection was successful by checking page state
    const editButtonVisible = await this.editButtonLoc().isVisible({ timeout: 5000 }).catch(() => false);
    if (editButtonVisible) {
      console.log('  ✓ Quotation rejected successfully - page returned to readonly state');
    }
    
    const rejectTime = Date.now() - startRejectTime;
    console.log('✓ Quotation rejected successfully');
    
    return rejectTime;
  }

  /**
   * Get the Sales Order / Quotation number displayed in the form header.
   * In Odoo, after CONFIRM the title changes to e.g. "S00042".
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   * @returns The order number string, e.g. "S00042"
   */
  async getSalesOrderNumber(timeout: number = 15000): Promise<string> {
    // Odoo renders the SO/Quotation number as the breadcrumb item or the h1/span with name="name"
    const nameField = this.salesOrderNumberField();
    await nameField.waitFor({ state: 'visible', timeout });
    const value = (await nameField.innerText()).trim();
    console.log(`  ✓ Sales Order number: ${value}`);
    return value;
  }

  /**
   * Get the "Total in Company Currency" value displayed on the Quotation/Sales Order form.
   * @param timeout - Maximum time to wait for the element (default: 15000ms)
   * @returns The total value string, e.g. "329.00"
   */
  async getTotalInCompanyCurrency(timeout: number = 15000): Promise<string> {
    const field = this.totalInCompanyCurrencyField();
    await field.waitFor({ state: 'visible', timeout });
    const raw = (await field.innerText()).trim();
    // Strip currency symbol and non-breaking spaces (e.g. "$ 329.00" → "329.00")
    const value = raw.replace(/^[^0-9]+/, '').trim();
    console.log(`  ✓ Total in Company Currency: ${value} (raw: "${raw}")`);
    return value;
  }

  /**
   * Get the current Quotation / Sales Order status from the statusbar.
   * Uses JS evaluation to find the active statusbar state, normalised to title case.
   * @param timeout - Maximum time to wait for the form + statusbar (default: CommonUtils.waitTimes.pageLoad)
   * @returns The status string in title case, e.g. "Quotation", "Sales Order"
   */
  async getQuotationStatus(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<string> {
    // Gate on the quotation form being loaded first - the SO number / name field is a reliable
    // "form ready" signal. On a freshly-opened DRAFT quote the form (and its statusbar) can render
    // late, so waiting for the form before the statusbar avoids a premature timeout. (The old 15s
    // literal timed out on the draft "Quotation" state under load; sent/confirmed quotes passed.)
    await this.salesOrderNumberField().waitFor({ state: 'visible', timeout }).catch(() => {});

    // Wait for the statusbar container to be present
    const statusBarContainer = this.page.locator('.o_statusbar_status').first();
    await statusBarContainer.waitFor({ state: 'visible', timeout });

    // Use JS to read the active/highlighted status button text
    const raw = await this.page.evaluate(() => {
      const container = document.querySelector('.o_statusbar_status');
      if (!container) return '';
      // Odoo 16/17: active state is aria-checked="true"
      let btn = container.querySelector<HTMLElement>('button[aria-checked="true"]');
      if (!btn) {
        // Fallback: btn-primary class marks the selected state
        btn = container.querySelector<HTMLElement>('button.btn-primary');
      }
      if (!btn) {
        // Fallback: aria-selected="true"
        btn = container.querySelector<HTMLElement>('button[aria-selected="true"]');
      }
      return btn ? (btn.innerText || btn.textContent || '').trim() : '';
    });

    if (!raw) {
      throw new Error('Could not determine Quotation status — no active statusbar button found');
    }

    // Normalise to title case (e.g. "QUOTATION" → "Quotation", "SALES ORDER" → "Sales Order")
    const value = raw.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    console.log(`  ✓ Quotation status: "${value}" (raw: "${raw}")`);
    return value;
  }

  /**
   * Verify a manager approval was successful (call after clickApprove()).
   *
   * After a successful APPROVE the pending-approval buttons ("TO APPROVE" / "APPROVE")
   * disappear and a post-approval action becomes available (CONFIRM and/or SEND BY EMAIL).
   * Waits for the post-approval action to appear, then checks the pending-approval buttons
   * are gone. Returns the individual signals plus an overall `approved` verdict and logs them.
   *
   * @param timeout - how long to wait for the post-approval action to appear (default: abnormalWait)
   */
  async verifyApprovalSuccess(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    approved: boolean;
    approveButtonGone: boolean;
    toApproveButtonGone: boolean;
    confirmVisible: boolean;
    sendByEmailVisible: boolean;
  }> {
    // Positive signal: a post-approval action (CONFIRM or SEND BY EMAIL) becomes available.
    const postApproval = this.confirmButton().or(this.sendByEmailButton()).first();
    const postApprovalVisible = await postApproval
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);

    const confirmVisible = await this.confirmButton().isVisible().catch(() => false);
    const sendByEmailVisible = await this.sendByEmailButton().isVisible().catch(() => false);
    const approveStillVisible = await this.approveButton().isVisible().catch(() => false);
    const toApproveStillVisible = await this.toApproveButton().isVisible().catch(() => false);

    const approveButtonGone = !approveStillVisible;
    const toApproveButtonGone = !toApproveStillVisible;
    // Approval is successful when the APPROVE button is consumed AND a forward action is available.
    const approved = approveButtonGone && postApprovalVisible;

    console.log(`  - APPROVE button gone: ${approveButtonGone}`);
    console.log(`  - TO APPROVE button gone: ${toApproveButtonGone}`);
    console.log(`  - CONFIRM button visible: ${confirmVisible}`);
    console.log(`  - SEND BY EMAIL button visible: ${sendByEmailVisible}`);
    console.log(`  ${approved ? '✓' : '⚠'} Approval ${approved ? 'successful' : 'NOT confirmed'}`);

    return { approved, approveButtonGone, toApproveButtonGone, confirmVisible, sendByEmailVisible };
  }

  /**
   * Verify a manager rejection was successful (call after clickReject()).
   *
   * After a successful REJECT the pending-approval buttons ("APPROVE" / "REJECT") disappear and
   * the Quotation returns to an editable/readonly state (the Edit button is visible) so the
   * Salesperson can revise/resubmit. Returns the individual signals plus an overall `rejected`
   * verdict and logs them.
   *
   * @param timeout - how long to wait for the Edit button to reappear (default: abnormalWait)
   */
  async verifyRejectionSuccess(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    rejected: boolean;
    approveButtonGone: boolean;
    rejectButtonGone: boolean;
    editButtonVisible: boolean;
  }> {
    const editButtonVisible = await this.editButtonLoc()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);

    const approveStillVisible = await this.approveButton().isVisible().catch(() => false);
    const rejectStillVisible = await this.rejectButton().isVisible().catch(() => false);

    const approveButtonGone = !approveStillVisible;
    const rejectButtonGone = !rejectStillVisible;
    // Rejection is successful when the pending-approval buttons are consumed (order no longer pending).
    const rejected = approveButtonGone && rejectButtonGone;

    console.log(`  - APPROVE button gone: ${approveButtonGone}`);
    console.log(`  - REJECT button gone: ${rejectButtonGone}`);
    console.log(`  - Edit button visible (back to editable Quotation): ${editButtonVisible}`);
    console.log(`  ${rejected ? '✓' : '⚠'} Rejection ${rejected ? 'successful' : 'NOT confirmed'}`);

    return { rejected, approveButtonGone, rejectButtonGone, editButtonVisible };
  }

  /**
   * Is the header "APPROVE" (`action_approve`) button OFFERED to the CURRENT user right now?
   *
   * The button is not a static part of the form: view 1365 hides it with
   * `attrs="{'invisible':['|','|',('button_approve','=',False),('need_approve','=',False),('state','!=','pending_approval')]}"`,
   * so `button_approve` is evaluated PER USER. A non-approver sees the node in the DOM carrying
   * `o_invisible_modifier`, which is why approveButton() filters on `visible`.
   *
   * @param timeout - how long to wait for the button to appear (default: abnormalWait)
   */
  async isApproveButtonVisible(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const visible = await this.approveButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - "APPROVE" button offered to the current user: ${visible}`);
    return visible;
  }

  /** Is the header "REJECT" (`action_wizard_reject`) button offered to the CURRENT user right now? */
  async isRejectButtonVisible(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const visible = await this.rejectButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - "REJECT" button offered to the current user: ${visible}`);
    return visible;
  }

  /** Is the header "Cancel" (`action_cancel`) button offered to the CURRENT user right now? */
  async isCancelButtonVisible(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const visible = await this.cancelButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - "Cancel" button offered to the current user: ${visible}`);
    return visible;
  }

  /** Is the header "Duplicate" (`action_duplicate`) button offered to the CURRENT user right now? */
  async isDuplicateButtonVisible(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    const visible = await this.duplicateButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - "Duplicate" button offered to the current user: ${visible}`);
    return visible;
  }

  /**
   * RELOAD the form, then read the statusbar - i.e. read the status the SERVER holds, not the one
   * the open form happens to be rendering.
   *
   * Needed after any header action that writes `state` (`action_approve`, `action_wizard_reject`,
   * `action_cancel`): an Odoo 12 form does not re-read server-side values on its own, so a status
   * taken from the open DOM can report the value the record had BEFORE the action. Reloading makes
   * the reading authoritative in both directions - it cannot report a stale success or a stale
   * failure.
   *
   * @param timeout - how long to wait for the reloaded form (default: savingPage)
   */
  async getQuotationStatusFromServer(timeout: number = CommonUtils.waitTimes.savingPage): Promise<string> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForPageLoad(timeout).catch(() => {});
    return this.getQuotationStatus().catch(() => '');
  }

  /**
   * Press the header "Cancel" (`action_cancel`) button on the Quotation.
   *
   * @param timeout - how long to wait for the Cancel button
   * @returns the elapsed time in ms, plus any popup text the click produced
   */
  async clickCancelQuotation(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    elapsedMs: number;
    popupText: string;
  }> {
    const start = Date.now();
    const button = this.cancelButton();
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found the header "Cancel" button');
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "Cancel"');
    await this.wait(CommonUtils.waitTimes.long);

    // The view declares no `confirm=` on action_cancel, so no dialog is EXPECTED - but a modal that
    // does appear must be resolved with its affirmative button, otherwise the cancel silently never
    // happens and the verification below fails with a misleading "still pending" reading.
    const dialog = this.page.locator('.o_dialog, .modal').filter({ visible: true }).first();
    let popupText = '';
    if (await dialog.isVisible({ timeout: CommonUtils.waitTimes.searchOppWait }).catch(() => false)) {
      popupText = ((await dialog.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`  - A dialog appeared after "Cancel": "${popupText.substring(0, 300)}"`);
      const confirmButton = dialog.locator('button')
        .filter({ hasText: /^\s*(Ok|OK|Yes|Confirm|Cancel Order|Validate|Apply)\s*$/i })
        .filter({ visible: true })
        .first();
      if (await confirmButton.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false)) {
        await confirmButton.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await dialog.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      }
      await this.wait(CommonUtils.waitTimes.long);
    }

    return { elapsedMs: Date.now() - start, popupText };
  }

  /**
   * Verify the Quotation was cancelled (call after clickCancelQuotation()).
   *
   * The statusbar is deliberately NOT the signal: base view 787 declares
   * `statusbar_visible="draft,sent,sale"`, so the `cancel` state highlights no statusbar button at
   * all. The reliable marker is `action_draft` "Set to Quotation" (states="cancel"), which only ever
   * renders on a cancelled order - together with the pending-approval buttons being consumed.
   *
   * @param timeout - how long to wait for "Set to Quotation" to appear (default: abnormalWait)
   */
  async verifyQuotationCancelled(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    cancelled: boolean;
    setToQuotationVisible: boolean;
    approveButtonGone: boolean;
    rejectButtonGone: boolean;
    cancelButtonGone: boolean;
  }> {
    const setToQuotationVisible = await this.setToQuotationButton()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);

    const approveButtonGone = !(await this.approveButton().isVisible().catch(() => false));
    const rejectButtonGone = !(await this.rejectButton().isVisible().catch(() => false));
    const cancelButtonGone = !(await this.cancelButton().isVisible().catch(() => false));

    // "Set to Quotation" is the state=cancel marker; the button sweep guards against reading a form
    // that simply has not refreshed yet.
    const cancelled = setToQuotationVisible && approveButtonGone && rejectButtonGone;

    console.log(`  - "Set to Quotation" visible (state = cancel): ${setToQuotationVisible}`);
    console.log(`  - APPROVE button gone: ${approveButtonGone}`);
    console.log(`  - REJECT button gone: ${rejectButtonGone}`);
    console.log(`  - Cancel button gone: ${cancelButtonGone}`);
    console.log(`  ${cancelled ? '✓' : '⚠'} Quotation cancelled: ${cancelled}`);

    return { cancelled, setToQuotationVisible, approveButtonGone, rejectButtonGone, cancelButtonGone };
  }

  /**
   * Press the header "Duplicate" (`action_duplicate`) button and land on the COPY.
   *
   * The copy is detected by the form's RECORD ID changing, not by the URL model - a Quotation, its
   * Deal Element and its copy are all `sale.order`, so a model-only wait would match instantly and
   * report a duplication that never happened (same trap as pressNewQuotationOnO12CE).
   *
   * @param timeout - how long to wait for the Duplicate button
   */
  async clickDuplicateQuotation(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    sourceRecordId: string;
    newRecordId: string;
    navigated: boolean;
    elapsedMs: number;
    popupText: string;
  }> {
    const sourceRecordId = this.getRecordIdFromUrl();
    const button = this.duplicateButton();
    await button.waitFor({ state: 'visible', timeout });
    console.log(`  - Found the header "Duplicate" button (source record id: ${sourceRecordId || '(none)'})`);

    const start = Date.now();
    await button.click({ timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Clicked "Duplicate"');

    const newRecordId = await this.waitForRecordIdChange(sourceRecordId, CommonUtils.waitTimes.savingPage);
    const navigated = newRecordId !== '' && newRecordId !== sourceRecordId;
    if (navigated) {
      await this.waitForFormView(CommonUtils.waitTimes.savingPage).catch(() => {});
      await this.waitForEditButton(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    const elapsedMs = Date.now() - start;

    const popupText = await this.getBlockingPopupText(CommonUtils.waitTimes.extraLong);
    if (popupText) {
      console.log(`  - Backend answered with a popup: "${popupText.substring(0, 300)}"`);
      await this.dismissBlockingPopup();
    }

    console.log(`  - Record id after "Duplicate": ${newRecordId || '(unchanged)'}`);
    console.log(`  - Landed on the copy: ${navigated} (${(elapsedMs / 1000).toFixed(2)}s)`);
    return { sourceRecordId, newRecordId, navigated, elapsedMs, popupText };
  }

  /**
   * Verify the Quotation was confirmed into a Sales Order (call after clickConfirm()).
   *
   * After a successful CONFIRM the status becomes "Sales Order", the CONFIRM button disappears
   * and the LOCK button appears. Reads the statusbar (falling back to the CONFIRM-gone + LOCK-visible
   * signals if the statusbar cannot be read). Returns the signals + an overall `confirmed` verdict.
   *
   * @param timeout - how long to wait for the LOCK button to appear (default: abnormalWait)
   */
  async verifyConfirmedToSalesOrder(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<{
    confirmed: boolean;
    status: string;
    confirmButtonGone: boolean;
    lockVisible: boolean;
  }> {
    const lockVisible = await this.lockButton()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);

    const confirmStillVisible = await this.confirmButton().isVisible().catch(() => false);
    const confirmButtonGone = !confirmStillVisible;

    let status = '';
    try {
      status = await this.getQuotationStatus(CommonUtils.waitTimes.elementVisibility);
    } catch {
      status = '';
    }

    // Confirmed when the statusbar reads "Sales Order", or (fallback) CONFIRM is gone and LOCK is visible.
    const confirmed = /sales order/i.test(status) || (confirmButtonGone && lockVisible);

    console.log(`  - Status: "${status}"`);
    console.log(`  - CONFIRM button gone: ${confirmButtonGone}`);
    console.log(`  - LOCK button visible: ${lockVisible}`);
    console.log(`  ${confirmed ? '✓' : '⚠'} Confirmed to Sales Order: ${confirmed}`);

    return { confirmed, status, confirmButtonGone, lockVisible };
  }

  /**
   * Wait until the "SEND BY EMAIL" button disappears from the page.
   * Useful for confirming the email was sent and the quotation state has changed.
   * @param timeout - Maximum time to wait for the button to disappear (default: 30000ms)
   */
  async waitForSendByEmailButtonToDisappear(timeout: number = 30000): Promise<void> {
    await this.sendByEmailButton().waitFor({ state: 'hidden', timeout });
    console.log('  ✓ "SEND BY EMAIL" button has disappeared');
  }

  /**
   * Wait until the CONFIRM button disappears from the page.
   * Useful for confirming the quotation has been confirmed and the page has transitioned.
   * @param timeout - Maximum time to wait for the button to disappear (default: 30000ms)
   */
  async waitForConfirmButtonToDisappear(timeout: number = 30000): Promise<void> {
    await this.confirmButton().waitFor({ state: 'hidden', timeout });
    console.log('  ✓ CONFIRM button has disappeared');
  }

  /**
   * Wait until the LOCK button appears on the page.
   * In Odoo, the Lock button becomes visible after a Sales Order is confirmed.
   * @param timeout - Maximum time to wait for the button to appear (default: 30000ms)
   */
  async waitForLockButtonToAppear(timeout: number = 30000): Promise<void> {
    await this.lockButton().waitFor({ state: 'visible', timeout });
    console.log('  ✓ LOCK button has appeared');
  }

  /**
   * Read the "Payer" (partner_id) value on the Quotation / Sales Order. Works in readonly (link text)
   * and edit (input value) modes. Returns '' if not found. Diagnostic helper for the Payer propagation.
   */
  async getPayerValue(): Promise<string> {
    const ro = this.payerReadonly();
    if (await ro.count().catch(() => 0)) {
      const t = (await ro.first().innerText().catch(() => '') || '').replace(/\s+/g, ' ').trim();
      if (t) { console.log(`  - Quotation Payer (readonly): "${t}"`); return t; }
    }
    const input = this.payerInput();
    if (await input.count().catch(() => 0)) {
      const v = (await input.first().inputValue().catch(() => '') || '').trim();
      console.log(`  - Quotation Payer (input): "${v}"`);
      return v;
    }
    console.log('  ⚠ Quotation Payer field not found');
    return '';
  }

  /**
   * Click CONFIRM button to convert quotation to Sales Order
   * @returns Promise<void>
   */
  async clickConfirm(timeout: number = 25000): Promise<void> {
    console.log('  - Looking for CONFIRM button');
    
    try {
      
       // Get button locator and wait for it to be visible within timeout
      const button = this.confirmButton();
      await button.waitFor({ state: 'visible', timeout}).catch(() => {});
      
      // Check if button is now visible after waiting
      const buttonVisible = await button.isVisible().catch(() => false);
      
      if (buttonVisible) {
        console.log('  ✓ CONFIRM button found');
        await button.scrollIntoViewIfNeeded();
        await button.click();
        console.log('  ✓ Clicked CONFIRM button successfully');
      } else {
        console.log('  ✗ CONFIRM button not found or not visible');
        throw new Error('CONFIRM button not found or not visible on the page');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ Error clicking CONFIRM button: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Read the quotation "Payer" (partner_id) NAME only. Odoo renders the partner Many2one as
   * "Name<br>City<br>Country", so innerText carries the address lines; this keeps only the FIRST
   * line (the partner name) so it matches the clean payer name shown on the subscription
   * (Customer / breadcrumb). Edit-mode input value is used as a fallback.
   */
  async getPayerName(): Promise<string> {
    const ro = this.payerReadonly();
    if (await ro.count().catch(() => 0)) {
      const raw = ((await ro.first().innerText().catch(() => '')) || '');
      const firstLine = raw.split('\n')[0].replace(/\s+/g, ' ').trim();
      if (firstLine) { console.log(`  - Quotation Payer (name): "${firstLine}"`); return firstLine; }
    }
    const input = this.payerInput();
    if (await input.count().catch(() => 0)) {
      const v = ((await input.first().inputValue().catch(() => '')) || '').trim();
      console.log(`  - Quotation Payer (input): "${v}"`);
      return v;
    }
    console.log('  ⚠ Quotation Payer field not found');
    return '';
  }

  /** Parse a displayed amount like "$ 244.37" / "244.37" / "$&nbsp;244.37" into a number. */
  private parseAmount(raw: string): number {
    return parseFloat((raw || '').replace(/ /g, ' ').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0;
  }

  /**
   * Read the quotation grand Total (amount_total) shown in the order totals footer.
   * @returns the numeric Total, e.g. 244.37
   */
  async getQuotationTotal(): Promise<number> {
    const field = this.amountTotalField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const raw = (await field.innerText().catch(() => '')) || '';
    const value = this.parseAmount(raw);
    console.log(`  - Quotation Total (amount_total): ${value} (raw: "${raw.replace(/ /g, ' ').trim()}")`);
    return value;
  }

  /** Read the quotation Pricelist (pricelist_id) display text. */
  async getPricelistName(): Promise<string> {
    const loc = this.pricelistReadonly();
    if (await loc.count().catch(() => 0)) {
      const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      const value = tag === 'input'
        ? ((await loc.inputValue().catch(() => '')) || '').trim()
        : ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`  - Quotation Pricelist: "${value}"`);
      return value;
    }
    console.log('  ⚠ Quotation Pricelist field not found');
    return '';
  }

  /** Read the quotation Salesperson (user_id) display text. */
  async getSalespersonName(): Promise<string> {
    const loc = this.salespersonReadonly();
    if (await loc.count().catch(() => 0)) {
      const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      const value = tag === 'input'
        ? ((await loc.inputValue().catch(() => '')) || '').trim()
        : ((await loc.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`  - Quotation Salesperson: "${value}"`);
      return value;
    }
    console.log('  ⚠ Quotation Salesperson field not found');
    return '';
  }

  /**
   * Read a numeric cell on the Order Lines row that matches productCode, located by its column
   * header text (exact match). The Order Lines columns include "Unit Price", "Discount (%)",
   * "Partner Discount", "Partner Discount Amount", "Subtotal After All Discounts", "Subtotal".
   * Header-indexed (scoped to the field name="order_line" table) so it is resilient to column shifts.
   * @param productCode - text identifying the order line (e.g. "CP-NC-PM-ENP")
   * @param headerExact - the exact column header text (e.g. "Partner Discount")
   * @returns the trimmed raw cell text, or '' if not found
   */
  async getOrderLineCellByHeader(productCode: string, headerExact: string): Promise<string> {
    return await this.page.evaluate(
      ({ productCode, header }) => {
        const container = document.querySelector('[name="order_line"]');
        if (!container) return '';
        const table = container.querySelector('table');
        if (!table) return '';
        const ths = Array.from(table.querySelectorAll('thead th'));
        const idx = ths.findIndex((th) => (th.textContent || '').replace(/\s+/g, ' ').trim() === header);
        if (idx < 0) return '';
        const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
        const row = rows.find((r) => (r.textContent || '').includes(productCode));
        if (!row) return '';
        const cells = Array.from(row.querySelectorAll('td'));
        return cells[idx] ? (cells[idx].textContent || '').replace(/\s+/g, ' ').trim() : '';
      },
      { productCode, header: headerExact }
    );
  }

  /** Read the order line "Unit Price" for the given product code as a number. */
  async getLineUnitPrice(productCode: string): Promise<number> {
    const raw = await this.getOrderLineCellByHeader(productCode, 'Unit Price');
    const value = this.parseAmount(raw);
    console.log(`  - Quotation line Unit Price (${productCode}): ${value} (raw: "${raw}")`);
    return value;
  }

  /** Read the order line "Partner Discount" % for the given product code as a number (LineDiscount#1). */
  async getLinePartnerDiscount(productCode: string): Promise<number> {
    const raw = await this.getOrderLineCellByHeader(productCode, 'Partner Discount');
    const value = this.parseAmount(raw);
    console.log(`  - Quotation line Partner Discount % (${productCode}): ${value} (raw: "${raw}")`);
    return value;
  }

  /** Read the order line "Subtotal After All Discounts" for the given product code as a number (line Sub Total). */
  async getLineSubtotalAfterAllDiscounts(productCode: string): Promise<number> {
    const raw = await this.getOrderLineCellByHeader(productCode, 'Subtotal After All Discounts');
    const value = this.parseAmount(raw);
    console.log(`  - Quotation line Subtotal After All Discounts (${productCode}): ${value} (raw: "${raw}")`);
    return value;
  }

  /**
   * Click the "Subscriptions" smart button on a confirmed Sales Order to open the linked
   * subscription detail. Dismisses any "Odoo Client Error" popup first.
   */
  async clickSubscriptionsSmartButton(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    await this.dismissErrorDialogWithRetry().catch(() => {});
    const button = this.subscriptionsSmartButton();
    await button.waitFor({ state: 'visible', timeout });
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await button.click();
    console.log('  ✓ Clicked the "Subscriptions" smart button');
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** Whether the "Subscriptions" smart button is present (confirmed SO with a linked subscription). */
  async hasSubscriptionsSmartButton(timeout: number = CommonUtils.waitTimes.abnormalWait): Promise<boolean> {
    return this.subscriptionsSmartButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM-12060: Customer (partner_id) selector on a NEW Quotation - regression check
  // that partner names OUTSIDE the merge wizard are shown WITHOUT the "(#ID)" suffix.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Deep-link to a NEW Quotation (sale.order) form and wait for the Customer field.
   * Hash-route + reload pattern (this Odoo web client is hash-routed); the Customer input's
   * visibility is the "form ready" signal. Action/menu ids are the pre-prod Quotation action.
   */
  async openNewQuotationForm(): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=344&model=sale.order&view_type=form&menu_id=202`, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    await this.customerInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ New Quotation form opened (Customer field ready)');
  }

  /**
   * Type into the Customer (partner_id) field and return the autocomplete option texts.
   * Does NOT save the quotation.
   * @param searchText - text to type into the Customer field
   */
  async getCustomerDropdownOptions(searchText: string): Promise<string[]> {
    const input = this.customerInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);
    const opts = (await this.m2oAutocompleteOptions().allTextContents())
      .map((o) => o.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    console.log(`  - Customer options for "${searchText}" (${opts.length}): ${JSON.stringify(opts)}`);
    return opts;
  }

  // ─── CRM-4383: Quotations LIST view (Create-button visibility) ───────────────────────────────
  /**
   * Deep-link to a Quotations (sale.order) LIST view and wait until the list screen is ready.
   * Hash-route + reload pattern (this Odoo web client is hash-routed). Defaults to
   * Sales ▸ Orders ▸ Quotations (action 344 / menu 202). Pass another action to reach a different
   * Quotations screen - 345 = CRM ▸ Sales ▸ My Quotations, 364 = an Opportunity's Quotations
   * (that action's domain is scoped by active_id, so pass the Opportunity id as activeId).
   * @returns whether the list view rendered (control panel + list table visible).
   */
  async openQuotationsList(opts: { action?: number; menuId?: number; activeId?: number | string } = {}): Promise<boolean> {
    const action = opts.action ?? 344;
    const menuId = opts.menuId ?? 202;
    const origin = new URL(this.page.url()).origin;
    const activePart = opts.activeId !== undefined ? `&active_id=${opts.activeId}` : '';
    const url = `${origin}/web#action=${action}&model=sale.order&view_type=list&menu_id=${menuId}${activePart}`;
    console.log(`  - Opening Quotations list: ${url}`);
    await this.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    return this.waitForQuotationsListReady();
  }

  /** Wait for the Quotations list screen (control panel + list table) to settle; returns list visibility. */
  async waitForQuotationsListReady(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<boolean> {
    await this.page.locator('.o_control_panel').first().waitFor({ state: 'visible', timeout }).catch(() => {});
    await CommonUtils.waitForSpinnersToHide(this.page).catch(() => {});
    await this.wait(CommonUtils.waitTimes.medium);
    const ready = await this.listViewRoot().isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false);
    console.log(`  - Quotations list ready = ${ready}`);
    return ready;
  }

  /**
   * Is the list-view CREATE button visible? (the CRM-4383 assertion target). Call AFTER
   * waitForQuotationsListReady() so the control panel/toolbar is fully rendered; this then waits only
   * a short `timeout` for the button, so a `false` (the fix in effect) is returned promptly rather
   * than blocking for minutes, while a genuinely-present button still appears within the window.
   */
  async isListCreateButtonVisible(timeout: number = CommonUtils.waitTimes.extraLong): Promise<boolean> {
    const visible = await this.listCreateButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - list CREATE button visible = ${visible}`);
    return visible;
  }

  /** Is the list-view IMPORT button visible? (Import is hidden together with Create by the same fix.) */
  async isListImportButtonVisible(timeout: number = CommonUtils.waitTimes.extraLong): Promise<boolean> {
    const visible = await this.listImportButton().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    console.log(`  - list IMPORT button visible = ${visible}`);
    return visible;
  }

  /** Number of data rows in the Quotations list (0 when empty / "no content" helper). */
  async getQuotationsListRowCount(): Promise<number> {
    const n = await this.listDataRows().count().catch(() => 0);
    console.log(`  - Quotations list row count = ${n}`);
    return n;
  }

  /**
   * On a NEW Quotation form, set the Customer (partner_id) to the first REAL autocomplete match for
   * `searchText` (skipping the "Create ..."/"Create and Edit" entries). Setting a Customer satisfies
   * the client-side required-field check so a subsequent SAVE actually reaches the server-side guard
   * that blocks quotations not started from an Opportunity (CRM-4383). Returns the chosen name.
   */
  async selectCustomerOnNewQuotation(searchText: string): Promise<string> {
    const input = this.customerInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);
    const options = this.m2oAutocompleteOptions();
    await options.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const count = await options.count();
    const entries: Array<{ i: number; txt: string }> = [];
    for (let i = 0; i < count; i++) {
      const txt = ((await options.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!txt || /^create\b/i.test(txt)) continue; // skip "Create ..." / "Create and Edit"
      entries.push({ i, txt });
    }
    // Prefer a COMPANY (an option with no email in its label): selecting a company auto-fills the
    // End User / Invoice / Delivery addresses on this form, so only Payment Terms is left to set before
    // the SAVE can reach the server-side Opportunity guard. Fall back to the first real option.
    const pick = entries.find((e) => !/@/.test(e.txt)) ?? entries[0];
    let chosen = '';
    if (pick) {
      chosen = pick.txt;
      await options.nth(pick.i).click();
    }
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  - Selected Customer "${chosen}" for the new (non-Opp) quotation`);
    return chosen;
  }

  /**
   * Set the End User (partner_end_user_id) on a NEW Quotation form to the first REAL match for
   * `searchText`. Some customers do not auto-fill the End User, which stays required - setting it
   * explicitly lets the SAVE pass client validation and reach the server-side Opportunity guard.
   * Returns the chosen name, or '' if the field is not present.
   */
  async setEndUserOnNewQuotation(searchText: string): Promise<string> {
    const input = this.endUserInput();
    const present = await input.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!present) {
      console.log('  - End User field not present on this form');
      return '';
    }
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);
    const options = this.m2oAutocompleteOptions();
    await options.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const count = await options.count();
    let chosen = '';
    for (let i = 0; i < count; i++) {
      const txt = ((await options.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!txt || /^create\b/i.test(txt)) continue;
      chosen = txt;
      await options.nth(i).click();
      break;
    }
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  - Selected End User "${chosen}"`);
    return chosen;
  }

  /** Click SAVE on the current Quotation form. Does NOT assert success - used to trigger the guard. */
  async clickSaveButton(): Promise<void> {
    await this.saveButton().click();
  }

  // ==========================================================================================
  //  Added for the CRM-11806 Subscription Management (Recurring Billing) suite.
  //  The suite creates quotations straight from Sales > Orders > Quotations > CREATE, so it
  //  needs an order-line writer and a numeric read of the "Subscriptions" smart button.
  //  (openQuotationsList / openNewQuotationForm / selectCustomerOnNewQuotation already exist.)
  // ==========================================================================================

  private readonly qOrderLinesContainer = () =>
    this.page.locator('div[name="order_line"]').first();
  private readonly qOrderLinesAddRow = () =>
    this.qOrderLinesContainer().locator('.o_field_x2many_list_row_add a').first();
  private readonly qSubscriptionsSmartButton = () =>
    this.page.locator('button[name="action_open_subscriptions"]').first();

  /** Add one Order Line: pick the product by SKU / search term and set the Ordered Qty. */
  async addOrderLineBySku(productTerm: string, quantity: number): Promise<void> {
    await this.page.locator('a.nav-link').filter({ hasText: 'Order Lines' }).first().click().catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    await this.qOrderLinesAddRow().click();
    await this.wait(CommonUtils.waitTimes.long);
    const productInput = this.qOrderLinesContainer().locator('div[name="product_id"] input').first();
    await productInput.click();
    await productInput.pressSequentially(productTerm, { delay: 40 });
    await this.wait(CommonUtils.waitTimes.extraLong);
    await this.page.locator('.ui-autocomplete li.ui-menu-item a').first().click();
    await this.wait(CommonUtils.waitTimes.long);
    const qtyInput = this.qOrderLinesContainer().locator('input[name="product_uom_qty"]').first();
    await qtyInput.click();
    await qtyInput.fill(String(quantity));
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  - Order Line added: "' + productTerm + '" x ' + quantity);
  }

  /** Number shown on the "Subscriptions" smart button (0 when the button is absent). */
  async getSubscriptionsSmartButtonCount(): Promise<number> {
    if (!(await this.qSubscriptionsSmartButton().count().catch(() => 0))) {
      console.log('  - "Subscriptions" smart button: absent (0)');
      return 0;
    }
    const raw = await this.qSubscriptionsSmartButton().innerText().catch(() => '');
    const m = (raw || '').match(/\d+/);
    const value = m ? parseInt(m[0], 10) : 0;
    console.log('  - "Subscriptions" smart button: ' + value);
    return value;
  }
}
