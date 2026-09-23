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

  // --- CRM-12501: expiry / maintenance block ------------------------------------------------
  // The License form drives this whole block with `attrs`, so a field that does not apply is
  // HIDDEN rather than blanked (grounded on form view 2441, pre-prod, 2026-09-07):
  //   expiration_days      invisible when expires     != 'in'
  //   expire_start_date    invisible when expire_mode != 'PER_LICENSE'
  //   expiration_end_date  invisible when expire_mode != 'PER_LICENSE'  (and REQUIRED when it is)
  //   start_date / end_date / maintenance_days
  //                        invisible when maintenance_mode != 'PER_LICENSE'
  // So "a perpetual licence carries no expiry" is observable as: Expires = never,
  // Expire Mode = none, and the three expiry fields absent from the screen.
  /** Every rendered node carrying an Odoo field name - used to test whether the form DISPLAYS it. */
  private readonly fieldNodeByFieldName = (fieldName: string) =>
    this.page.locator(`xpath=//*[@name="${fieldName}"]`)
      .or(this.page.locator(`[name="${fieldName}"]`));
  /** Editable input of a non-selection field (the form opens in EDIT mode right after CREATE LICENSE). */
  private readonly fieldInputByFieldName = (fieldName: string) =>
    this.page.locator(`xpath=//input[@name="${fieldName}"]`)
      .or(this.page.locator(`input[name="${fieldName}"]`))
      .first();

  /** The cancel-reason wizard modal (target="new" dialog opened by set_cancel). */
  private readonly cancelWizardModal = () =>
    this.page.locator("xpath=//div[contains(@class,'modal')][.//select[@name='cancel_reason']]")
      .or(this.page.locator('.modal:has(select[name="cancel_reason"])'))
      .filter({ visible: true })
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
    // EDIT mode FIRST, whenever the form renders a <select> for this field. Ordering matters:
    // Odoo wraps the <select> in a <div name="<field>">, whose textContent is EVERY option label
    // glued together ("innever" for `expires`), so a readonly-text-first read reports that blob as
    // the value on a freshly generated licence. Verified on the 2026-09-07 CRM-12501 run.
    const select = this.page
      .locator(`xpath=//select[@name="${fieldName}"]`)
      .or(this.page.locator(`select[name="${fieldName}"]`))
      .first();
    const selectExists = await select.count().catch(() => 0);
    if (selectExists > 0) {
      // The selected option's LABEL (o12 stores PER_LICENSE / NONE but shows available / none).
      const option = this.selectedOption(fieldName);
      const optionExists = await option.count().catch(() => 0);
      if (optionExists > 0) {
        const text = ((await option.textContent().catch(() => '')) || '').trim();
        if (text) return text;
      }
      // Blank option selected (the field is simply unset) or no option node -> the stored value,
      // which is '' for an unset selection.
      return ((await select.inputValue().catch(() => '')) || '').trim();
    }
    // Readonly form: the value is rendered as text.
    const readonlyValue = this.readonlyFieldValue(fieldName);
    const readonlyExists = await readonlyValue.count().catch(() => 0);
    if (readonlyExists > 0) {
      return ((await readonlyValue.textContent().catch(() => '')) || '').trim();
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

  // ---------------------------------------------------------------------------------------------
  // CRM-12501 - expiry / maintenance readers
  // ---------------------------------------------------------------------------------------------

  /**
   * Read a NON-selection field (integer / date / char) from the License form.
   * Readonly form -> the value rendered as text; EDIT mode -> the input's value.
   * @returns the trimmed value, or '' when the field holds nothing OR is not rendered at all
   */
  private async getTextFieldValue(fieldName: string): Promise<string> {
    const readonlyText = await this.readFieldTextByName(fieldName);
    if (readonlyText) return readonlyText;
    const input = this.fieldInputByFieldName(fieldName);
    const inputExists = await input.count().catch(() => 0);
    if (inputExists > 0) {
      return ((await input.inputValue().catch(() => '')) || '').trim();
    }
    return '';
  }

  /**
   * Whether the License form actually DISPLAYS a field right now.
   * An `attrs`-hidden Odoo field stays in the DOM carrying `o_invisible_modifier` (display:none),
   * so presence is not enough - every copy of the field is probed for real visibility.
   * @param fieldName - the Odoo field name (e.g. "expiration_days")
   */
  async isFieldDisplayed(fieldName: string): Promise<boolean> {
    const nodes = this.fieldNodeByFieldName(fieldName);
    const total = Math.min(await nodes.count().catch(() => 0), 8);
    for (let i = 0; i < total; i++) {
      const visible = await nodes.nth(i).isVisible().catch(() => false);
      if (visible) return true;
    }
    return false;
  }

  /** "Licensing" - the billing type the licence was generated for ("Perpetual" / "Subscription"). */
  async getLicensingValue(): Promise<string> {
    return await this.getSelectionFieldValue('licensing');
  }

  /** "Expires" - "never" on a perpetual licence, "in" on a subscription licence. */
  async getExpiresValue(): Promise<string> {
    return await this.getSelectionFieldValue('expires');
  }

  /** "Expire Mode" - "none" (NONE) when nothing expires, "available" (PER_LICENSE) when it does. */
  async getExpireModeValue(): Promise<string> {
    return await this.getSelectionFieldValue('expire_mode');
  }

  /** "Maintenance Mode" - "available" (PER_LICENSE) while the SKU's support window applies. */
  async getMaintenanceModeValue(): Promise<string> {
    return await this.getSelectionFieldValue('maintenance_mode');
  }

  /** "Expiration Days" - hidden by Odoo unless Expires = in; '' when not rendered. */
  async getExpirationDaysValue(): Promise<string> {
    return await this.getTextFieldValue('expiration_days');
  }

  /** "Expire Start Date" - hidden by Odoo unless Expire Mode = available; '' when not rendered. */
  async getExpireStartDateValue(): Promise<string> {
    return await this.getTextFieldValue('expire_start_date');
  }

  /** "Expiration End Date" - hidden by Odoo unless Expire Mode = available; '' when not rendered. */
  async getExpirationEndDateValue(): Promise<string> {
    return await this.getTextFieldValue('expiration_end_date');
  }

  /** "Maintenance Days" - the SKU's support window in days (365 for a 1-Year-Support SKU). */
  async getMaintenanceDaysValue(): Promise<string> {
    return await this.getTextFieldValue('maintenance_days');
  }

  /** Maintenance "Start Date" (Odoo field `start_date`), as displayed (en_US -> MM/DD/YYYY). */
  async getMaintenanceStartDateValue(): Promise<string> {
    return await this.getTextFieldValue('start_date');
  }

  /** Maintenance "End Date" (Odoo field `end_date`), as displayed (en_US -> MM/DD/YYYY). */
  async getMaintenanceEndDateValue(): Promise<string> {
    return await this.getTextFieldValue('end_date');
  }

  /** The licence record's name / title (e.g. "Essential Pro (for 5.0+ only) PRODUCTION 11.1 INV/..."). */
  async getLicenseNameValue(): Promise<string> {
    return await this.getTextFieldValue('name');
  }

  /**
   * "Generated by Odoo" checkbox (field generated_by_odoo, readonly on the form). TRUE marks a licence
   * the automatic WebShop path created; the manual License Manager button leaves it FALSE.
   * Odoo renders a readonly boolean as a disabled <input type="checkbox"> inside <div name="...">.
   */
  async isGeneratedByOdooChecked(): Promise<boolean> {
    const box = this.page
      .locator('xpath=//div[@name="generated_by_odoo"]//input[@type="checkbox"] | //input[@type="checkbox"][@name="generated_by_odoo"]')
      .or(this.page.locator('div[name="generated_by_odoo"] input[type="checkbox"], input[type="checkbox"][name="generated_by_odoo"]'))
      .first();
    const exists = await box.count().catch(() => 0);
    if (exists === 0) return false;
    return await box.isChecked().catch(() => false);
  }

  /** "Installer provider" (field `vendor`) - "Nakivo" on a licence the WebShop path generated. */
  async getInstallerProviderValue(): Promise<string> {
    return await this.getSelectionFieldValue('vendor');
  }

  // =============================================================================================
  //  LAYOUT / STATE READERS - TC.Performance.1.1.7.3 .. 1.1.7.30
  //  Grounded on PRE-PRODUCTION 2026-09-21 against the license_management.license form view
  //  (fields_view_get arch + a licence created through
  //   Opportunity -> Deal Element -> Quotation -> Sales Order -> Invoice -> VALIDATE -> CREATE LICENSE).
  //
  //  What the grounding established, and why these readers look the way they do:
  //   * The header keeps the WHOLE button set in the DOM and hides the ones the current state may
  //     not use, so every reader below drops the hidden ones and returns what a tester reads:
  //        draft     -> APPROVE | CANCEL | SET TO DRAFT | TEST CREATING LICENSE FROM LM
  //        approved  -> SEND BY EMAIL | SEND WITH CERTIFICATE | CERTIFICATE | SEND CERTIFICATE |
  //                     CANCEL | SET TO DRAFT | TEST CREATING LICENSE FROM LM
  //        sent      -> the same set as approved
  //        cancel    -> DRAFT | SET TO DRAFT | TEST CREATING LICENSE FROM LM
  //     ("Fill data" and "Save as template" carry invisible="1" - they show in no state at all.)
  //   * The statusbar is pinned to statusbar_visible="draft,approved", so the bar always draws
  //     DRAFT and APPROVED; SENT / CANCELLED only join it while the record is in them. Its DOM
  //     order is REVERSED (Approved before Draft), hence the sort on the on-screen x position.
  //   * The form groups render as <table class="o_inner_group">. General and Info carry their
  //     ".o_horizontal_separator" INSIDE the table; Limits carries it as a sibling <div> ahead of
  //     TWO tables (left column + right column) - getGroupColumns() resolves both shapes.
  //   * A field hidden by attrs stays in the DOM with o_invisible_modifier (display:none), so every
  //     reader filters on real visibility. That is what keeps "License File" (hidden until the
  //     licence has a file) and "Expire Start Date" / "Expiration End Date" (hidden unless
  //     expire_mode = PER_LICENSE) out of the field lists of a freshly created perpetual licence.
  // =============================================================================================

  /**
   * The control-panel buttons of the form, in screen order.
   * Read mode returns ["EDIT", "Print", "Action"]; edit mode returns ["SAVE", "DISCARD"].
   */
  async getControlPanelButtons(): Promise<string[]> {
    const panel = this.page.locator('.o_control_panel').first();
    await panel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    return await panel
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button, a.btn'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ((b as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /** The header buttons the current state actually shows, in screen order. */
  async getStatusbarButtons(): Promise<string[]> {
    return (await this.getStatusbarButtonMap()).map((b) => b.label);
  }

  /**
   * The visible header buttons paired with the Odoo method they call, in screen order, so a failure
   * names the action (set_approved) instead of a DOM index.
   */
  async getStatusbarButtonMap(): Promise<Array<{ label: string; name: string }>> {
    const bar = this.page.locator('.o_statusbar_buttons').first();
    await bar.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    if ((await bar.count()) === 0) return [];
    return await bar
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ({
            label: ((b as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim(),
            name: b.getAttribute('name') || '',
            left: b.getBoundingClientRect().left,
          }))
          .filter((e) => e.label.length > 0)
          .sort((a, b) => a.left - b.left)
          .map((e) => ({ label: e.label, name: e.name }))
      )
      .catch(() => [] as Array<{ label: string; name: string }>);
  }

  /**
   * The stages the statusbar offers, LEFT TO RIGHT as a tester reads them - DRAFT / APPROVED.
   * Sorted on the on-screen x position because Odoo 12 floats the bar right and querySelectorAll
   * returns the stages reversed.
   */
  async getStatusBarStages(): Promise<string[]> {
    const bar = this.page.locator('.o_statusbar_status').first();
    await bar.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    if ((await bar.count()) === 0) return [];
    return await bar
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ({
            left: b.getBoundingClientRect().left,
            text: ((b as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim(),
          }))
          .filter((e) => e.text.length > 0)
          .sort((a, b) => a.left - b.left)
          .map((e) => e.text)
      )
      .catch(() => [] as string[]);
  }

  /**
   * The stage the statusbar highlights - the state the record is in, as the screen prints it.
   * Odoo marks it with aria-checked="true" + btn-primary (title "Current state").
   */
  async getActiveStatusBarStage(): Promise<string> {
    const bar = this.page.locator('.o_statusbar_status').first();
    await bar.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    if ((await bar.count()) === 0) return '';
    return await bar
      .evaluate((el: HTMLElement) => {
        const active = el.querySelector('button[aria-checked="true"], button[aria-current="step"], button.btn-primary');
        return active ? ((active as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim() : '';
      })
      .catch(() => '');
  }

  /** The notebook tab names, in order - Invoices / Technical Info / Renewal Licenses / CRM Technical. */
  async getNotebookTabs(): Promise<string[]> {
    const notebook = this.page.locator('.o_notebook').first();
    await notebook.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await notebook
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('.nav-link'))
          .filter((a) => !!((a as HTMLElement).offsetParent || a.getClientRects().length))
          .map((a) => ((a as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /**
   * The stat buttons above the sheet, in screen order, each as { label, name }.
   * A freshly created licence shows "$ <amount> Invoiced" (action_view_invoice) and "Active"
   * (toggle_active); the label's line break is collapsed to a single space.
   */
  async getButtonBoxButtons(): Promise<Array<{ label: string; name: string }>> {
    const box = this.page.locator('.oe_button_box').first();
    await box.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    if ((await box.count()) === 0) return [];
    return await box
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('button'))
          .filter((b) => !!((b as HTMLElement).offsetParent || b.getClientRects().length))
          .map((b) => ({
            label: ((b as HTMLElement).innerText || '').replace(/[​⁣ ]/g, ' ').replace(/\s+/g, ' ').trim(),
            name: b.getAttribute('name') || '',
          }))
          .filter((e) => e.label.length > 0)
      )
      .catch(() => [] as Array<{ label: string; name: string }>);
  }

  /**
   * The VISIBLE field labels of one named form group, split into the two columns the group draws
   * them in, each top-to-bottom: getGroupColumns('Limits') -> { left: [Allocate ... Grace period
   * (days)], right: [Expire Mode ... Maintenance Days] }.
   *
   * General and Info render as a single table each (their separator sits in the table's first row),
   * so their whole list comes back in `left` and `right` is empty. Limits renders as a separator
   * followed by two sibling tables, so the split is made on the label's x position against the
   * middle of the sheet - the DOM carries no left/right marker.
   *
   * @param groupTitle - the heading exactly as the screen prints it ("General" / "Info" / "Limits")
   */
  async getGroupColumns(groupTitle: string): Promise<{ left: string[]; right: string[] }> {
    const sheet = this.page.locator('.o_form_sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await sheet
      .evaluate((el: HTMLElement, title: string) => {
        const clean = (s: string) => (s || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim();
        const sep = Array.from(el.querySelectorAll('.o_horizontal_separator'))
          .filter((s) => !!((s as HTMLElement).offsetParent || s.getClientRects().length))
          .find((s) => clean((s as HTMLElement).innerText) === title);
        if (!sep) return { left: [] as string[], right: [] as string[] };
        const container = (sep.closest('table.o_inner_group') as HTMLElement | null) || (sep.parentElement as HTMLElement);
        if (!container) return { left: [] as string[], right: [] as string[] };
        const sheetBox = el.getBoundingClientRect();
        const middle = sheetBox.left + sheetBox.width / 2;
        const entries = Array.from(container.querySelectorAll('td.o_td_label > label'))
          .filter((l) => !!((l as HTMLElement).offsetParent || l.getClientRects().length))
          .map((l) => {
            const r = l.getBoundingClientRect();
            return { text: clean((l as HTMLElement).innerText), left: r.left, top: r.top };
          })
          .filter((e) => e.text.length > 0);
        const byScreenOrder = (a: { top: number }, b: { top: number }) => a.top - b.top;
        return {
          left: entries.filter((e) => e.left < middle).sort(byScreenOrder).map((e) => e.text),
          right: entries.filter((e) => e.left >= middle).sort(byScreenOrder).map((e) => e.text),
        };
      }, groupTitle)
      .catch(() => ({ left: [] as string[], right: [] as string[] }));
  }

  /** The headings the sheet draws above its groups, in screen order - General / Info / Limits / Description. */
  async getGroupHeadings(): Promise<string[]> {
    const sheet = this.page.locator('.o_form_sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await sheet
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('.o_horizontal_separator'))
          .filter((h) => !!((h as HTMLElement).offsetParent || h.getClientRects().length))
          .map((h) => ({
            text: ((h as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim(),
            top: h.getBoundingClientRect().top,
            left: h.getBoundingClientRect().left,
          }))
          .filter((h) => h.text.length > 0)
          .sort((a, b) => a.top - b.top || a.left - b.left)
          .map((h) => h.text)
      )
      .catch(() => [] as string[]);
  }

  /** The items a control-panel dropdown ("Print" / "Action") offers, in order. */
  async getControlPanelMenuItems(menuLabel: string, opts: { keepOpen?: boolean } = {}): Promise<string[]> {
    const toggle = this.page
      .locator('.o_control_panel button.dropdown-toggle, .o_control_panel a.dropdown-toggle')
      .filter({ hasText: new RegExp('^\\s*' + menuLabel + '\\s*$', 'i') })
      .first();
    if (!(await toggle.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false))) return [];
    await toggle.click().catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
    const items = await this.page
      .locator('.dropdown-menu.show a, .o_dropdown_menu.show a')
      .evaluateAll((els: Element[]) =>
        els
          .filter((a) => !!((a as HTMLElement).offsetParent || a.getClientRects().length))
          .map((a) => ((a as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
    // keepOpen: leave the menu ON SCREEN so the caller can take the VERIFY-POINT evidence shot
    // with the entries still visible (a shot taken after Escape proves nothing). The caller is
    // then responsible for closeControlPanelMenu().
    if (!opts.keepOpen) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.wait(CommonUtils.waitTimes.standard);
    }
    return items;
  }

  /** Close a control-panel dropdown left open by getControlPanelMenuItems(.., { keepOpen: true }). */
  async closeControlPanelMenu(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /** One entry per chatter message, NEWEST FIRST, with the inner line breaks preserved. */
  async getChatterMessages(timeout: number = CommonUtils.waitTimes.checkingChatterLog): Promise<string[]> {
    const messages = this.page.locator('.o_thread_message .o_thread_message_content');
    await messages.first().waitFor({ state: 'visible', timeout }).catch(() => {});
    const count = await messages.count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await messages
        .nth(i)
        .evaluate((el: HTMLElement) => el.innerText.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim())
        .catch(() => '');
      if (text) out.push(text);
    }
    return out;
  }

  /**
   * Read any field of the License form by its Odoo field name, whatever widget draws it.
   * Selection fields go through the selection reader (which handles the "innever" option-blob trap),
   * everything else through the text/date/integer reader.
   * @returns the value a tester reads, or '' when the field holds nothing OR is not rendered
   */
  async getFieldValue(fieldName: string): Promise<string> {
    const select = this.page.locator(`select[name="${fieldName}"]`);
    if ((await select.count().catch(() => 0)) > 0) return await this.getSelectionFieldValue(fieldName);
    const value = await this.getTextFieldValue(fieldName);
    if (value) return value;
    return await this.getSelectionFieldValue(fieldName);
  }

  /** A readonly boolean field, as the form draws it (a disabled checkbox inside <div name="...">). */
  async isCheckboxChecked(fieldName: string): Promise<boolean> {
    const box = this.page
      .locator(`xpath=//div[@name="${fieldName}"]//input[@type="checkbox"] | //input[@type="checkbox"][@name="${fieldName}"]`)
      .or(this.page.locator(`div[name="${fieldName}"] input[type="checkbox"], input[type="checkbox"][name="${fieldName}"]`))
      .first();
    if ((await box.count().catch(() => 0)) === 0) return false;
    return await box.isChecked().catch(() => false);
  }

  /** The licence title the sheet prints in its <h1> (the record name). */
  async getRecordTitle(): Promise<string> {
    const title = this.page.locator('.o_form_sheet .oe_title').first();
    await title.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return ((await title.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Press one of the header buttons by the Odoo method it calls, and wait for the form to settle.
   * Using @name rather than the caption keeps the click unambiguous where three buttons share one
   * method (Send by email / Send with certificate / Send certificate all call action_license_send).
   * @param methodName - e.g. "set_approved", "set_cancel", "set_to_draft", "set_draft"
   */
  async clickHeaderButton(methodName: string, timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    const button = this.page
      .locator(`xpath=//div[contains(@class,'o_statusbar_buttons')]//button[@name="${methodName}"]`)
      .or(this.page.locator(`.o_statusbar_buttons button[name="${methodName}"]`))
      .filter({ visible: true })
      .first();
    await button.waitFor({ state: 'visible', timeout });
    await button.click({ timeout });
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /** Press APPROVE (set_approved) - draft -> approved. */
  async clickApprove(timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    await this.clickHeaderButton('set_approved', timeout);
  }

  /** Press CANCEL (set_cancel) - draft / approved / sent -> cancelled. */
  async clickCancelLicense(timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    await this.clickHeaderButton('set_cancel', timeout);
  }

  /** Press SET TO DRAFT (set_to_draft) - the button the form shows in every state. */
  async clickSetToDraft(timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    await this.clickHeaderButton('set_to_draft', timeout);
  }

  /**
   * Reload the licence record and wait until the form has drawn itself again.
   * Odoo does NOT re-render the statusbar and the header buttons after a state action, so every
   * read of those AFTER pressing APPROVE / CANCEL / SET TO DRAFT goes through a reload first.
   */
  async reloadForm(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.formViewLocator().waitFor({ state: 'visible', timeout });
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Open the "license Management" application from the apps home (the app the licence records live
   * in - menu_id 433, action 985). The caption is lower-case "license Management" on pre-production.
   */
  async openLicenseManagementApp(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<void> {
    const tile = this.page.locator('a.o_app, .o_app').filter({ hasText: /licen[cs]e\s*management/i }).first();
    await tile.waitFor({ state: 'visible', timeout });
    await tile.click();
    await this.page.waitForLoadState('networkidle', { timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.extraLong);
  }

  /** The application name the navbar prints on the left ("license Management"). */
  async getAppBrand(): Promise<string> {
    const brand = this.page.locator('.o_main_navbar .o_menu_brand').first();
    await brand.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return ((await brand.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * The sub-menus the current application offers in the navbar, LEFT TO RIGHT.
   * On the licence application that is: licenses | Invoices | Settings | LM license log |
   * Product Registration.
   */
  async getAppMenuSections(): Promise<string[]> {
    const sections = this.page.locator('.o_main_navbar .o_menu_sections').first();
    await sections.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    if ((await sections.count()) === 0) return [];
    return await sections
      .evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll(':scope > li > a, :scope > a'))
          .filter((a) => !!((a as HTMLElement).offsetParent || a.getClientRects().length))
          .map((a) => ({
            text: ((a as HTMLElement).innerText || '').replace(/[​⁣]/g, '').replace(/\s+/g, ' ').trim(),
            left: a.getBoundingClientRect().left,
          }))
          .filter((m) => m.text.length > 0)
          .sort((a, b) => a.left - b.left)
          .map((m) => m.text)
      )
      .catch(() => [] as string[]);
  }
  /**
   * The text a field DISPLAYS right now, whatever tag Odoo drew it with.
   * getFieldValue() goes through the <span name="..."> / <input name="..."> readers, which is not
   * enough on this form: "Total file share (TB)" renders as a literal <field name="total_file_share">
   * node, and several Limits values sit on an <a> or a bare <div>. This reader takes the first
   * VISIBLE node carrying the field name and returns its innerText.
   * @returns the displayed text, or '' when no visible node carries that field name
   */
  async getFieldDisplayText(fieldName: string): Promise<string> {
    return await this.page
      .evaluate((name: string) => {
        const nodes = Array.from(document.querySelectorAll(`[name="${name}"]`)).filter(
          (n) => !!((n as HTMLElement).offsetParent || n.getClientRects().length)
        );
        if (nodes.length === 0) return '';
        return ((nodes[0] as HTMLElement).innerText || '').replace(/[\u200b\u2063\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
      }, fieldName)
      .catch(() => '');
  }

  /**
   * The "Allocate" rows of the Limits group, top to bottom, as a tester reads them.
   * Each row is returned as { text, number, unit }:
   *   text   - the whole value cell, e.g. "specific 1 sockets" / "0 EC2 instances"
   *   number - the first number in that cell ("1", "0", "0.00"), '' when the cell carries none
   *   unit   - what is left after the number and the leading "specific", e.g. "sockets",
   *            "for monitoring", "EC2 instances"
   * Only the row's VISIBLE spans are read: Odoo keeps the per-mode count fields (vm_count,
   * ec2_instance_count, ...) in the DOM behind o_invisible_modifier and shows only the one the
   * row's mode selects, so reading the raw DOM would report two numbers for one row.
   */
  async getLimitsAllocationRows(): Promise<Array<{ text: string; number: string; unit: string }>> {
    const sheet = this.page.locator('.o_form_sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await sheet
      .evaluate((el: HTMLElement) => {
        const clean = (s: string) => (s || '').replace(/[\u200b\u2063\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
        const sep = Array.from(el.querySelectorAll('.o_horizontal_separator'))
          .filter((s) => !!((s as HTMLElement).offsetParent || s.getClientRects().length))
          .find((s) => clean((s as HTMLElement).innerText) === 'Limits');
        if (!sep) return [] as Array<{ text: string; number: string; unit: string }>;
        const container = (sep.closest('table.o_inner_group') as HTMLElement | null) || (sep.parentElement as HTMLElement);
        if (!container) return [] as Array<{ text: string; number: string; unit: string }>;
        return Array.from(container.querySelectorAll('td.o_td_label > label'))
          .filter((l) => !!((l as HTMLElement).offsetParent || l.getClientRects().length))
          .filter((l) => clean((l as HTMLElement).innerText) === 'Allocate')
          .map((l) => {
            const row = l.closest('tr');
            const cell = row ? (row.querySelector('td:not(.o_td_label)') as HTMLElement | null) : null;
            const text = cell ? clean(cell.innerText) : '';
            const match = text.match(/\d+(?:\.\d+)?/);
            const number = match ? match[0] : '';
            const unit = clean(text.replace(/^specific/i, '').replace(number, ''));
            return { text, number, unit };
          })
          .filter((r) => r.text.length > 0);
      })
      .catch(() => [] as Array<{ text: string; number: string; unit: string }>);
  }
  // ---------------------------------------------------------------------------------------------
  //  Cancel-reason wizard - grounded on PRE-PRODUCTION 2026-09-22
  //
  //  CANCEL does NOT cancel the licence on its own: set_cancel returns an ir.actions.act_window
  //  that opens the wizard `license.cancel.reason.wizard` ("Please indicate the reason for
  //  cancelling the license"). Its `cancel_reason` select is REQUIRED, and until OK
  //  (button[name="action_confirm"]) is pressed the licence stays in DRAFT - which is what a spec
  //  that clicks CANCEL and asserts straight away reads back.
  //
  //  The seven reasons, as the wizard lists them (the stored value is JSON-quoted, e.g. "expired"):
  //    Expired | Renewed | Generation Error | Split / Joined | Upgrade |
  //    License regeneration / BUG | Mistaken PO
  //
  //  After OK the statusbar reads DRAFT | APPROVED | CANCEL with CANCEL current, the header offers
  //  DRAFT | SET TO DRAFT | TEST CREATING LICENSE FROM LM, and "Cancel reason" carries the label.
  // ---------------------------------------------------------------------------------------------

  /** Whether the cancel-reason wizard is on screen. */
  async isCancelReasonWizardOpen(timeout: number = CommonUtils.waitTimes.elementVisibility): Promise<boolean> {
    return await this.cancelWizardModal()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /** The wizard's own title, as the modal prints it. */
  async getCancelReasonWizardTitle(): Promise<string> {
    const title = this.cancelWizardModal().locator('.modal-title').first();
    return ((await title.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** The reasons the wizard offers, in order, as a tester reads them. */
  async getCancelReasonOptions(): Promise<string[]> {
    const select = this.cancelWizardModal().locator('select[name="cancel_reason"]').first();
    await select.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => {});
    return await select
      .locator('option')
      .evaluateAll((os: Element[]) =>
        os
          .map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0)
      )
      .catch(() => [] as string[]);
  }

  /**
   * Pick a reason in the cancel wizard and press OK.
   * @param reasonLabel the reason as the wizard prints it, e.g. "Expired"
   */
  async confirmCancelReason(reasonLabel: string, timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    const modal = this.cancelWizardModal();
    await modal.waitFor({ state: 'visible', timeout });
    const select = modal.locator('select[name="cancel_reason"]').first();
    await select.waitFor({ state: 'visible', timeout });
    await select.selectOption({ label: reasonLabel });
    const ok = modal.locator('button[name="action_confirm"]').first();
    await ok.waitFor({ state: 'visible', timeout });
    await ok.click({ timeout });
    await modal.waitFor({ state: 'hidden', timeout }).catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Press CANCEL and carry the wizard through with the given reason - the whole cancellation, as a
   * user performs it.
   */
  async cancelLicenseWithReason(reasonLabel: string, timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    await this.clickCancelLicense(timeout);
    await this.confirmCancelReason(reasonLabel, timeout);
  }
}
