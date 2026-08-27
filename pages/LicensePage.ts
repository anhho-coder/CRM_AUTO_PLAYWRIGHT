import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * License Page Object
 * Handles interactions with License Management forms
 */
export class LicensePage extends BasePage {
  // Locators - declared in one place
  private readonly formViewLocator = () => this.page.locator('.o_form_view');
  private readonly saveButton = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  // Class-first (see QuotationPage.saveButton): the Migration theme renders the control-panel
  // save/edit buttons as <i class="fa fa-check"/> + <span>Save</span>, so the accessible name is
  // " Save" (leading space). Playwright normalizes whitespace for STRING name matching but NOT
  // for regex, so an anchored /^(Save|Edit)$/i never matches on crm-mig - hence the
  // o_form_button_save / o_form_button_edit classes come first and the regex fallback tolerates
  // surrounding whitespace.
  // filter({visible:true}) is REQUIRED: Odoo keeps BOTH control-panel buttons in the DOM and only
  // shows the one matching the current mode. On a freshly created License the form opens in EDIT
  // mode, so o_form_button_edit is present but HIDDEN and a bare .first() (DOM order) locks onto it
  // and waits forever, even though the visible "Save" button is right there.
  private readonly saveOrEditButton = () =>
    this.page.locator("xpath=//button[contains(@class,'o_form_button_save') or contains(@class,'o_form_button_edit')]")
      .or(this.page.getByRole('button', { name: /^\s*(Save|SAVE|Edit|EDIT)\s*$/i }))
      .filter({ visible: true })
      .first();
  private readonly forMonitoringDropdown = () => this.page.locator('select[name="it_monitoring_mode_select"]').or(
    this.page.locator('xpath=//select[@name="it_monitoring_mode_select"]')
  ).first();
  private readonly forMonitoringInput = () => this.page.locator('input').filter({ hasText: /for/ }).first();
  private readonly forMonitoringField = () => this.page.locator('select[name="it_monitoring_mode_select"]');
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly limitsHeader = () => this.page.locator('text=Limits').first();
  private readonly monitoringRow = () => this.page.locator('tr').filter({ hasText: /for monitoring/i }).first();
  private readonly roleOption = () => this.page.locator('[role="option"]');
  private readonly supportTypeField = () => this.page.locator('select[name="support_type"]').first();
  /** Selected option of a selection field in EDIT mode (label text, not the stored value). */
  private readonly selectedOption = (fieldName: string) =>
    this.page.locator(`xpath=//select[@name="${fieldName}"]/option[@selected]`)
      .or(this.page.locator(`select[name="${fieldName}"] option:checked`))
      .first();
  /** Selection-field value rendered as TEXT after save (readonly form). XPath primary, CSS fallback. */
  private readonly readonlyFieldValue = (fieldName: string) =>
    this.page.locator(`xpath=//span[@name="${fieldName}"] | //div[@name="${fieldName}"]`)
      .or(this.page.locator(`span[name="${fieldName}"], div[name="${fieldName}"]`))
      .first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for License page to fully load
   * @param timeout - Maximum time to wait (default: 15000ms)
   */
  async waitForPageLoad(timeout: number = 20000): Promise<void> {
    // Wait for form view to be visible
    await this.formViewLocator().waitFor({ state: 'visible', timeout });
    console.log('  - License form visible');
    
    // Wait for Save button OR Edit button to be ready (either means form is loaded)
    await this.saveOrEditButton().waitFor({ state: 'visible', timeout });
    console.log('  - Form is ready (Save or Edit button visible)');
    
    // Additional wait for any auto-population
    await this.wait(2000);
  }

  /**
   * Select value in "for monitoring" dropdown
   * @param value - Value to select (e.g., "sockets")
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async selectForMonitoring(value: string, timeout: number = 20000): Promise<void> {
    try {
      console.log(`  - Looking for "for monitoring" field`);
      
      // First, wait for the Limits section header to be visible
      await this.limitsHeader().waitFor({ state: 'visible', timeout });
      console.log('  - Limits section found');
      
      // Scroll to make sure the Limits section is in view
      await this.limitsHeader().scrollIntoViewIfNeeded();
      await this.wait(1000);
      
      // The "for monitoring" dropdown is the last select/combobox in the row that contains "for monitoring" text
      // Find the row containing "for monitoring" text, then get all comboboxes in that row, and select the last one
      await this.monitoringRow().waitFor({ state: 'visible', timeout});
      
      console.log('  - Found "for monitoring" row');
      
      // Get all comboboxes/selects in this row
      const comboboxes = this.monitoringRow().locator('select, [role="combobox"]');
      const count = await comboboxes.count();
      console.log(`  - Found ${count} dropdowns in the row`);
      
      // The "for monitoring" dropdown is the last one in the row (3rd combobox - for units like "sockets" or "workloads")
      const monitoringDropdown = comboboxes.nth(count - 1);
      
      await monitoringDropdown.waitFor({ state: 'visible', timeout });
      console.log('  - Found the "for monitoring" dropdown (last in row)');
      
      // Check if it's a select element or combobox
      const tagName = await monitoringDropdown.evaluate(el => el.tagName.toLowerCase());
      
      if (tagName === 'select') {
        await monitoringDropdown.selectOption({ label: value });
        console.log(`  - for monitoring: ${value} (selected from dropdown)`);
      } else {
        // It's a combobox, click and select from options
        await monitoringDropdown.click();
        await this.wait(500);
        
        // Wait for dropdown options to appear and select the one with the matching text
        const option = this.roleOption().filter({ hasText: new RegExp(`^${value}$`, 'i') }).first();
        await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
        await option.click();
        console.log(`  - for monitoring: ${value} (selected from combobox)`);
      }
      
    } catch (error) {
      console.log(`  - for monitoring field error: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  - Skipping "for monitoring" field - continuing test`);
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
    
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log('  - Found "SAVE" button');
    
    await this.saveButton().click();
    console.log('  - Clicked "SAVE" button (performance timer started)');
    
    // Wait for save to complete - Edit button should appear
    await this.editButton().waitFor({ state: 'visible', timeout });
    
    const saveTime = Date.now() - startTime;
    console.log('✓ License saved successfully');
    
    return saveTime;
  }

  /**
   * Click EDIT button to enter edit mode
   * @param timeout - Maximum time to wait (default: 10000ms)
   */
  async clickEdit(timeout: number = 10000): Promise<void> {
    console.log('  - Looking for EDIT button');
    
    await this.editButton().waitFor({ state: 'visible', timeout });
    console.log('  - Found EDIT button');
    
    await this.editButton().click();
    console.log('  - Clicked "EDIT" button');
    
    // Wait for form to be in edit mode
    await this.wait(2000);
  }

  /**
   * Change Support Type field value
   * @param value - Support Type value (e.g., "24/7")
   * @param timeout - Maximum time to wait (default: 60000ms)
   */
  async changeSupportType(value: string, timeout: number = 60000): Promise<void> {
    try {
      console.log(`  - Looking for Support Type field`);
      
      await this.supportTypeField().waitFor({ state: 'visible', timeout });

      // Select value from dropdown
      await this.supportTypeField().selectOption({ label: value });
      console.log(`  - Support Type: Changed to "${value}"`);
    } catch (error) {
      console.log(`  - Support Type error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read a selection field's current value from the License form.
   * Works after SAVE (readonly form renders the label as text) and in edit mode (reads the selected
   * <option> label, falling back to the stored value). XPath primary, CSS fallback.
   * @param fieldName - the Odoo field name (e.g. "support_type", "it_monitoring_mode_select")
   * @returns the value/label text, or '' when the field cannot be read
   */
  private async getSelectionFieldValue(fieldName: string): Promise<string> {
    // Readonly form: the value is rendered as text.
    const readonlyValue = this.readonlyFieldValue(fieldName);
    const readonlyExists = await readonlyValue.count() > 0;
    if (readonlyExists) {
      const text = ((await readonlyValue.textContent().catch(() => '')) || '').trim();
      if (text) return text;
    }
    // Edit mode: the selected option's label.
    const option = this.selectedOption(fieldName);
    const optionExists = await option.count() > 0;
    if (optionExists) {
      const text = ((await option.textContent().catch(() => '')) || '').trim();
      if (text) return text;
    }
    // Last resort: the stored value of the <select>.
    const select = this.page.locator(`select[name="${fieldName}"]`).first();
    const selectExists = await select.count() > 0;
    if (selectExists) {
      return ((await select.inputValue().catch(() => '')) || '').trim();
    }
    return '';
  }

  /** Current "Support Type" value on the License form (e.g. "24/7" / "24_7"). */
  async getSupportTypeValue(): Promise<string> {
    return await this.getSelectionFieldValue('support_type');
  }

  /** Current "for monitoring" value on the License form (e.g. "sockets" / "SOCKET"). */
  async getForMonitoringValue(): Promise<string> {
    return await this.getSelectionFieldValue('it_monitoring_mode_select');
  }
}
