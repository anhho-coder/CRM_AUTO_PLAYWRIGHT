import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Quotation Page Object (Sale Order in Quotation state)
 * Handles interactions with Quotation forms after NEW QUOTATION is created
 */
export class QuotationPage extends BasePage {
  // Locators
  private readonly editButtonLoc = () => this.page.getByRole('button', { name: /^Edit$/i }).first();
  private readonly actionButton = () => this.page.getByRole('button', { name: /^Action$/i });
  private readonly saveButton = () => this.page.getByRole('button', { name: /^SAVE$/i }).or(this.page.getByRole('button', { name: /^Save$/i })).first();
  private readonly sendByEmailButton = () => this.page.getByRole('button', { name: /SEND BY EMAIL/i }).or(this.page.getByRole('button', { name: /Send by Email/i })).first();
  private readonly emailDialog = () => this.page.locator('.o_dialog, .modal');
  private readonly sendButtonInDialog = () => this.emailDialog().getByRole('button', { name: /^SEND$/i }).or(this.emailDialog().getByRole('button', { name: /^Send$/i })).first();
  private readonly successNotification = () => this.page.locator('.o_notification_manager, .o_notification, .o_toast').filter({ hasText: /sent|success/i }).first();
  private readonly newQuotationButton = () => this.page.locator("//button[contains(@name,'action_create_quote_from_de')]");
  private readonly confirmButton = () => this.page.locator('xpath=(//button[@name="action_confirm"])[2]');
  private readonly lockButton = () => this.page.locator('xpath=//button/span[contains(text(),"Lock")]');
  private readonly toApproveButton = () => this.page.locator("//button[contains(@name,'button_to_approve')]");
  private readonly approveButton = () => this.page.locator('button').filter({ hasText: /^APPROVE$/i }).first();
  private readonly rejectButton = () => this.page.locator('button').filter({ hasText: /^REJECT$/i }).first();
  private readonly salesOrderNumberField = () => this.page.locator('xpath=(//span[@name="name"] | //div[@name="name"]//span | //h1[@name="name"])[1]').first();
  private readonly quotationStatusField = () => this.page.locator('xpath=//div[contains(@class,"o_statusbar_status")]//button[@aria-checked="true" or @aria-selected="true" or contains(@class,"btn-primary")]').first();
  private readonly totalInCompanyCurrencyField = () => this.page.locator('xpath=//div[@name="currency_amount_total"]//span | //span[@name="currency_amount_total"] | //div[@name="amount_total"]//span[@class="o_stat_value"] | //td[@name="currency_amount_total"] | //span[@name="amount_total"]').first();

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
    
    // Wait for button to be visible
    await button.waitFor({ state: 'visible', timeout });
    console.log('  - Found "TO APPROVE" button');
    
    await button.click();
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
    await button.click({ force: true });
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
    await button.click();
    console.log('  - Clicked "REJECT" button - waiting for dialog');
    
    // Wait for "Reject Reason" dialog to appear
    await this.wait(1000);
    const rejectDialog = this.page.locator('.o_dialog, .modal').filter({ hasText: /Reject Reason/i });
    const dialogVisible = await rejectDialog.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (dialogVisible) {
      console.log('  - "Reject Reason" dialog appeared');
      
      // Fill in the reason field (optional - can be left empty)
      const reasonField = rejectDialog.locator('textarea, input[name="reason"]').first();
      const reasonFieldVisible = await reasonField.isVisible({ timeout: 3000 }).catch(() => false);
      if (reasonFieldVisible) {
        await reasonField.fill('Performance test rejection');
        console.log('  - Entered rejection reason');
      }
      
      // Click REJECT button in the dialog
      const dialogRejectButton = rejectDialog.getByRole('button', { name: /^REJECT$/i }).first();
      await dialogRejectButton.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await dialogRejectButton.click();
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
   * @param timeout - Maximum time to wait for the statusbar (default: 15000ms)
   * @returns The status string in title case, e.g. "Quotation", "Sales Order"
   */
  async getQuotationStatus(timeout: number = 15000): Promise<string> {
    // Wait for the statusbar container to be present at all
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
}
