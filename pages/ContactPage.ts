import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Contact Page Object
 * Handles interactions with Contact list and form pages
 */
export class ContactPage extends BasePage {
  // List view locators
  private readonly createButton = () => this.page.getByRole('button', { name: /CREATE/i });
  
  // Form view locators (using XPath for new locators as per instructions)
  private readonly companyTypeRadio = () => this.page.locator('//label[contains(text(), "Company")]//input[@type="radio"]').or(this.page.locator('//input[@type="radio"][@name="company_type"][@value="company"]')).or(this.page.locator('//label[@class=\'custom-control-label o_form_label\'][normalize-space()=\'Company\']')).first();
  private readonly companyCheckbox = () => this.page.locator('//input[@type="checkbox" and contains(@name, "is_company")]').first();
  private readonly contactNameInput = () => this.page.getByRole('textbox', { name: 'Name' }).or(this.page.locator('input[name="name"]')).first();
  private readonly emailInput = () => this.page.locator('tr').filter({ hasText: 'Email' }).filter({ hasNotText: 'Email Templates' }).locator('input:visible').first();
  private readonly streetInput = () => this.page.locator('xpath=(//input[@name="street"])[1]');
  private readonly countryInput = () => this.page.getByPlaceholder('C﻿o﻿u﻿n﻿t﻿r﻿y').or(this.page.locator('input[placeholder*="ountry"]')).first();
  private readonly stateInput = () => this.page.getByPlaceholder('S﻿t﻿a﻿t﻿e').or(this.page.locator('input[placeholder*="tate"]')).first();
  private readonly salespersonRow = () => this.page.locator('tr').filter({ hasText: 'Salesperson' }).first();
  private readonly salespersonFieldWidget = () => this.page.locator('xpath=(//a[@name="user_id"])[1]').first();
  private readonly salesTeamRow = () => this.page.locator('tr').filter({ hasText: 'Sales Team' }).first();
  private readonly saveButton = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  
  // Child contact locators
  private readonly contactsAddressesTab = () => this.page.locator('xpath=//a[@role="tab" and contains(., "Contacts & Addresses")]');
  private readonly addButton = () => this.page.locator('xpath=//div[@name="child_ids"]//button[contains(., "Add")]').first();
  private readonly modalDialog = () => this.page.locator('xpath=//div[contains(@class, "modal-dialog") or contains(@class, "o_dialog")]');
  private readonly childNameInput = () => this.page.locator('xpath=//div[contains(@class, "modal-dialog") or contains(@class, "o_dialog")]//input[@name="name"]');
  private readonly childEmailInput = () => this.page.locator('xpath=//div[contains(@class, "modal-dialog") or contains(@class, "o_dialog")]//input[@name="email"]');
  private readonly saveAndCloseButton = () => this.page.locator('xpath=//button[contains(., "Save & Close") or contains(., "Save and Close")]');

  // Readonly view locators
  private readonly contactNameReadonly = () => this.page.locator('h1, .o_field_widget[name="name"]').first();
  private readonly emailReadonly = () => this.page.locator('a[href*="mailto:"]').first();
  private readonly addressReadonly = () => this.page.locator('td:has-text("Address")').locator('..');
  private readonly formEditable = () => this.page.locator('.o_form_editable, input:not([readonly])').first();

  // Partner assignation locators
  private readonly nakivoCustomerDiv = () => this.page.locator('xpath=//div[@name="nakivo_customer"]');
  private readonly partnerAssignationTab = () => this.page.locator('xpath=//a[contains(normalize-space(),"Partner Assignation")]').first();
  private readonly changeLevelButton = () => this.page.locator('xpath=//button[@name="action_change_partner_level" and contains(normalize-space(),"Change Level")]').first();
  private readonly targetLevelRow = () => this.page.locator('xpath=(//td//div[@name="grade_id"]//input)[2]').first();
  private readonly targetLevelSelect = () => this.page.locator('xpath=//*[@name="target_level"]').first();
  private readonly dialogContent = () => this.page.locator('xpath=//*[contains(@class,"modal-content") or contains(@class,"o_dialog")]');
  private readonly levelPeriodEndInput = () => this.page.locator('xpath=//tr[contains(.,"Level period end")]//input').first();
  private readonly activationDateInput = () => this.page.locator('xpath=//input[@name="activation_date"]').first();
  private readonly submitButton = () => this.page.locator('xpath=//button[@name="action_confirm" and contains(normalize-space(),"Submit")]').first();

  // Dropdown option helper (dynamic)
  private readonly dropdownOption = (text: string) => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option').filter({ hasText: text }).first();

  // List view: View list button
  private readonly viewListButton = () => this.page.getByRole('button', { name: 'View list' });
  // Search filter delete (×) button — removes any active facet (e.g. "Created by Anh Ho")
  private readonly myPipelineFilterDeleteXPath = () =>
    this.page.locator("xpath=//div[contains(@title,'Remove')]");
  // Custom filter locators
  private readonly filterDropdownButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_search_options')]//button[normalize-space()='Filters']").first();
  private readonly addCustomFilterLink = () =>
    this.page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter') or contains(normalize-space(),'Add Customer Filter')]").first();
  private readonly customFilterFieldSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_field')]").first();
  private readonly customFilterOperatorSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_op')]").first();
  private readonly applyFilterButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Apply']").first();
  private readonly customFilterValueInput = () =>
    this.page.locator("xpath=(//div[@role='menuitem']//input[contains(@class,'o_input')])[1]").first();
  private readonly customFilterValueSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_value')]").first();
  private readonly customFilterValueDropdownOption = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  // List view: generic data rows
  private readonly dataRowsLocator = () => this.page.locator('tr.o_data_row');
  // List view: header "select all" checkbox
  private readonly selectAllCheckboxInput = () =>
    this.page.locator("xpath=//th[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  private readonly selectAllCheckboxTh = () =>
    this.page.locator("th.o_list_record_selector").first();
  // Action menu button in list view toolbar
  private readonly listActionMenuButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Action' or normalize-space()='ACTION'] | //div[contains(@class,'o_cp_action_menus')]//button").first();
  // Delete option inside Action dropdown
  private readonly listActionDeleteOption = () =>
    this.page.locator("xpath=//span[normalize-space()='Delete']/parent::a | //a[normalize-space()='Delete']").first();
  // Confirm delete OK button
  private readonly confirmDeleteButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Ok' or normalize-space()='OK']").first();
  // Standalone Action button (used in new-tab delete flow)
  private readonly actionButton = (p: import('@playwright/test').Page = this.page) =>
    p.locator("xpath=//button[normalize-space()='Action' or normalize-space()='ACTION']").first();
  // Form view: Action menu button on form header
  private readonly formActionMenuButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Action' or normalize-space()='ACTION'] | //span[normalize-space()='Action' or normalize-space()='ACTION']/parent::button | //div[contains(@class,'o_cp_action_menus')]//button").first();
  // Form view: Delete option inside Action dropdown
  private readonly formActionMenuDeleteOption = () =>
    this.page.locator("xpath=//a[normalize-space()='Delete' or normalize-space()='DELETE'] | //span[normalize-space()='Delete' or normalize-space()='DELETE']/parent::a | //li[contains(@class,'o_menu_item')]//a[normalize-space()='Delete']").first();
  // Sales & Purchases tab
  private readonly salesPurchasesTab = () =>
    this.page.locator("xpath=//a[contains(normalize-space(),'Sales & Purchases') or contains(normalize-space(),'Sales &amp; Purchases')]").first();
  // Pricelist many2one input (Sales & Purchases tab)
  private readonly pricelistInput = () =>
    this.page.locator("xpath=//div[@name='property_product_pricelist']//input").first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Click CREATE button to open contact creation form
   */
  async clickCreate() {
    await this.createButton().click();
    await this.page.waitForURL('**/web?*view_type=form*', { timeout: 60000 });
    await this.wait(1000);
  }

  /**
   * Select company type (Company or Individual) - using radio button
   */
  async selectCompanyType() {
    const radio = this.companyTypeRadio();
    const exists = await radio.count() > 0;
    if (exists) {
      const isChecked = await radio.isChecked();
      if (!isChecked) {
        await radio.click({ force: true });
        await this.wait(500);
      }
      return true;
    }
    return false;
  }

  /**
   * Check "Company" checkbox or radio button
   */
  async checkCompanyCheckbox() {
    // First try the radio button
    const radioExists = await this.companyTypeRadio().count() > 0;
    if (radioExists) {
      return await this.selectCompanyType();
    }
    
    // If no radio, try checkbox
    const checkbox = this.companyCheckbox();
    const exists = await checkbox.count() > 0;
    if (exists) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.check({ force: true });
        await this.wait(500);
      }
      return true;
    }
    return false;
  }

  /**
   * Fill contact name
   */
  async fillContactName(name: string) {
    await this.contactNameInput().fill(name);
  }

  /**
   * Fill email address
   */
  async fillEmail(email: string) {
    await this.emailInput().fill(email);
  }

  /**
   * Fill street address
   */
  async fillStreet(street: string) {
    await this.streetInput().fill(street);
  }

  /**
   * Select country from dropdown
   */
  async selectCountry(country: string) {
    const input = this.countryInput();
    await input.click();
    await input.fill('');
    await this.wait(300);
    await input.fill(country);
    await this.wait(800);
    
    const option = this.dropdownOption(country);
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
  }

  /**
   * Select state from dropdown
   */
  async selectState(state: string) {
    await this.wait(500);
    const input = this.stateInput();
    await input.click();
    await input.fill('');
    await this.wait(300);
    await input.fill(state);
    await this.wait(800);
    
    const option = this.dropdownOption(state);
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
  }

  /**
   * Clear salesperson field
   */
  async clearSalesperson() {
    await this.wait(500);
    const row = this.salespersonRow();
    const input = row.locator('input').first();
    const exists = await input.count() > 0;
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(500);
      await this.page.keyboard.press('Escape');
      await this.wait(300);
      return true;
    }
    return false;
  }

  /**
   * Select salesperson from dropdown
   * @param salesperson - The name of the salesperson to select (e.g., "Bilal Saab")
   */
  async selectSalesperson(salesperson: string) {
    await this.wait(500);
    const row = this.salespersonRow();
    const input = row.locator('input').first();
    const exists = await input.count() > 0;
    
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(300);
      await input.fill(salesperson);
      await this.wait(800);
      
      const option = this.dropdownOption(salesperson);
      await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      await option.click().catch(async () => {
        await this.page.keyboard.press('Enter');
      });
      return true;
    }
    return false;
  }

  /**
   * Clear sales team field
   */
  async clearSalesTeam() {
    await this.wait(500);
    const row = this.salesTeamRow();
    const input = row.locator('input').first();
    const exists = await input.count() > 0;
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(500);
      await this.page.keyboard.press('Escape');
      await this.wait(300);
      return true;
    }
    return false;
  }

  /**
   * Select sales team from dropdown
   * @param salesTeam - Sales team name (e.g., "CMR", "BDR")
   */
  async selectSalesTeam(salesTeam: string) {
    await this.wait(500);
    const row = this.salesTeamRow();
    const input = row.locator('input').first();
    await input.click();
    await this.wait(300);
    
    const option = this.dropdownOption(salesTeam);
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
    await this.wait(500);
  }

  /**
   * Click save button
   */
  async clickSave() {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
  }

  /**
   * Click save only if the form is currently in edit mode (Save button visible).
   * If the form already auto-saved (view mode), skip the save.
   * Also presses Escape first to dismiss any potential overlay dialogs.
   */
  async clickSaveIfEditable(timeout: number = 5000): Promise<boolean> {
    await this.page.keyboard.press('Escape');
    await this.wait(500);
    const visible = await this.saveButton().isVisible({ timeout }).catch(() => false);
    if (visible) {
      await this.saveButton().click();
      console.log('  ✓ Save button clicked (form was in edit mode)');
      return true;
    }
    console.log('  ✓ Save button not visible — form already in view mode (auto-saved by Odoo)');
    return false;
  }

  /**
   * Get the current value of the Salesperson field (readonly mode).
   * The locator (//a[@name="user_id"])[1] targets the <a> element directly,
   * so innerText() returns the displayed salesperson name.
   */
  async getSalespersonValue(): Promise<string> {
    const widget = this.salespersonFieldWidget();
    await widget.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await widget.innerText()).trim();
  }

  /**
   * Wait for save to complete
   */
  async waitForSaveComplete(timeout: number = 60000) {
    await this.page.waitForURL(/[#?&]id=\d+/, { timeout });
  }

  /**
   * Get contact name in readonly mode
   */
  async getContactNameReadonly(): Promise<string> {
    try {
      return await this.contactNameReadonly().textContent({ timeout: 3000 }) || '';
    } catch {
      return '';
    }
  }

  /**
   * Get email in readonly mode
   */
  async getEmailReadonly(): Promise<string> {
    try {
      return await this.emailReadonly().textContent({ timeout: 3000 }) || '';
    } catch {
      return '';
    }
  }

  /**
   * Get address in readonly mode (contains country and state)
   */
  async getAddressReadonly(): Promise<string> {
    try {
      return await this.addressReadonly().textContent({ timeout: 3000 }) || '';
    } catch {
      return '';
    }
  }

  /**
   * Click edit button
   */
  async clickEdit() {
    const button = this.editButton();
    const exists = await button.count() > 0;
    if (exists) {
      await button.first().click();
      await this.formEditable().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return true;
    }
    return false;
  }

  /**
   * Click Contacts & Addresses tab
   */
  async clickContactsAddressesTab() {
    await this.contactsAddressesTab().click();
    await this.wait(1000);
  }

  /**
   * Click Add button to add child contact
   */
  async clickAddChildContact() {
    await this.addButton().click();
    await this.wait(2000);
  }

  /**
   * Fill child contact name in modal dialog
   */
  async fillChildContactName(name: string) {
    await this.childNameInput().fill(name);
    await this.wait(300);
  }

  /**
   * Fill child contact email in modal dialog
   */
  async fillChildContactEmail(email: string) {
    await this.childEmailInput().fill(email);
    await this.wait(300);
  }

  /**
   * Click Save & Close button in modal dialog
   */
  async clickSaveAndClose() {
    await this.saveAndCloseButton().click();
    await this.wait(2000);
  }

  /**
   * Create child contact (all-in-one method)
   * @param childName - Name for the child contact
   * @param childEmail - Email for the child contact
   */
  async createChildContact(childName: string, childEmail: string) {
    await this.clickContactsAddressesTab();
    await this.clickAddChildContact();
    await this.fillChildContactName(childName);
    await this.fillChildContactEmail(childEmail);
    await this.clickSaveAndClose();
  }

  /**
   * Generate a unique contact name with timestamp
   */
  generateContactName(): string {
    const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    return `TEST Contact_${currentDateTime}`;
  }

  /**
   * Generate a unique email with timestamp
   */
  generateEmail(): string {
    const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    const currentDate = currentDateTime.split('_')[0];
    const currentTime = currentDateTime.split('_')[1];
    return `Test-Contact@company${currentDate}${currentTime}.com`;
  }

  /**
   * Check "Is a Nakivo Customer" checkbox
   */
  async checkIsNakivoCustomer() {
    await this.wait(500);
    
    try {
      const nakivoDiv = this.nakivoCustomerDiv();
      const exists = await nakivoDiv.count() > 0;
      if (!exists) {
        console.log('  ⚠ Is a Nakivo Customer checkbox div not found');
        return false;
      }
      // Get the checkbox input inside the div
      const checkbox = nakivoDiv.locator('xpath=.//input[@type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      if (!checkboxExists) {
        console.log('  ⚠ Is a Nakivo Customer checkbox input not found');
        return false;
      }
      const isChecked = await checkbox.isChecked().catch(() => false);
      if (!isChecked) {    
        // Strategy 2: Use JavaScript to set the checkbox state directly
        try {
          await checkbox.evaluate((el: HTMLInputElement) => {
            el.checked = true;
            // Trigger change event to notify any listeners
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          
          await this.wait(500);
          const nowChecked = await checkbox.isChecked().catch(() => false);
          
          if (nowChecked) {
            console.log('  ✓ Successfully checked Is a Nakivo Customer checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to check Is a Nakivo Customer checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ Is a Nakivo Customer checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking Is a Nakivo Customer: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Remove any active search facet (e.g. "Created by Anh Ho") from the search bar
   */
  async removeMyPipelineFilter(timeout: number = 10000): Promise<void> {
    const deleteBtn = this.myPipelineFilterDeleteXPath();
    const exists = await deleteBtn.count() > 0;
    if (exists) {
      await deleteBtn.waitFor({ state: 'visible', timeout });
      await deleteBtn.click();
      await this.wait(CommonUtils.waitTimes.long);
      console.log('  ✓ Search filter removed');
    } else {
      console.log('  ⚠ No active search filter found, may already be cleared');
    }
    await deleteBtn.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  /**
   * Click the "View list" button if it is visible
   */
  async clickViewListButtonIfVisible(timeout: number = 5000): Promise<void> {
    const btn = this.viewListButton();
    const isVisible = await btn.isVisible({ timeout }).catch(() => false);
    if (isVisible) {
      await btn.click();
      await this.wait(CommonUtils.waitTimes.searchOppWait);
      console.log('  ✓ "View list" button clicked');
    } else {
      console.log('  ⚠ "View list" button not visible, already in list view');
    }
  }

  /**
   * Click the Filter dropdown button in the search bar
   */
  async clickFilterButton(): Promise<void> {
    await this.filterDropdownButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.filterDropdownButton().click();
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Click "Add Custom Filter" link inside the Filters dropdown
   */
  async clickAddCustomFilter(): Promise<void> {
    await this.addCustomFilterLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.addCustomFilterLink().click();
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Select the field in the custom filter row (Dropdown_List#1)
   */
  async selectCustomFilterField(fieldName: string): Promise<void> {
    await this.customFilterFieldSelect().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.customFilterFieldSelect().selectOption({ label: fieldName });
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Select the operator in the custom filter row (Dropdown_List#2)
   */
  async selectCustomFilterOperator(operator: string): Promise<void> {
    await this.customFilterOperatorSelect().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.customFilterOperatorSelect().selectOption({ label: operator });
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Set the value in the custom filter row (Dropdown_List#3)
   * Handles many2one input fields and selection dropdowns
   */
  async selectCustomFilterValue(value: string): Promise<void> {
    const inputEl = this.customFilterValueInput();
    const selectEl = this.customFilterValueSelect();

    const isInput = await inputEl.isVisible({ timeout: 2000 }).catch(() => false);
    if (isInput) {
      await inputEl.fill(value);
      await this.wait(500);
      const option = this.customFilterValueDropdownOption().filter({ hasText: value }).first();
      await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await option.click();
    } else {
      await selectEl.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await selectEl.selectOption({ label: value });
    }
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Custom filter value selected: ${value}`);
  }

  /**
   * Click the Apply button to apply the custom filter
   */
  async clickApplyFilter(): Promise<void> {
    await this.applyFilterButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.applyFilterButton().click();
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Check if the list view has no data rows
   */
  async isRecordListEmpty(): Promise<boolean> {
    const firstRowVisible = await this.dataRowsLocator().first().isVisible({ timeout: 3000 }).catch(() => false);
    return !firstRowVisible;
  }

  /**
   * Click the header "select all" checkbox in the list view
   */
  async clickSelectAllCheckbox(): Promise<void> {
    const input = this.selectAllCheckboxInput();
    const attached = await input.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (attached) {
      await input.evaluate((el: HTMLInputElement) => el.click());
      await this.wait(500);
      const checked = await input.isChecked().catch(() => false);
      if (!checked) {
        await this.selectAllCheckboxTh().click({ force: true });
      }
    } else {
      await this.selectAllCheckboxTh().click({ force: true });
    }
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Select-all checkbox clicked');
  }

  /**
   * Click the Action menu button in the list toolbar
   */
  async clickListActionMenu(): Promise<void> {
    const btn = this.listActionMenuButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Action menu opened');
  }

  /**
   * Click the Delete option inside the Action dropdown
   */
  async clickListActionDelete(): Promise<void> {
    const opt = this.listActionDeleteOption();
    await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await opt.click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Delete option selected');
  }

  /**
   * Confirm delete by pressing OK on the confirmation dialog
   */
  async confirmDeleteDialog(): Promise<void> {
    const btn = this.confirmDeleteButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Delete confirmed');
  }

  /**
   * Internal: fill contact form fields and save. Returns the new contact's ID.
   */
  private async _fillAndSaveContact(
    contactType: string,
    contactName: string,
    email: string,
    country: string,
    salesTeam: string,
    state?: string,
    salesperson?: string
  ): Promise<{ contactId: string; contactName: string }> {
    await this.page.getByLabel('Company Type').getByText(contactType).click();
    await this.wait(500);

    await this.fillContactName(contactName);
    await this.fillEmail(email);
    await this.selectCountry(country);
    if (state) await this.selectState(state);

    await this.salesTeamRow().locator('input').first().click();
    await this.dropdownOption(salesTeam).click();

    if (salesperson) {
      await this.selectSalesperson(salesperson);
    } else {
      await this.clearSalesperson();
    }

    await this.clickSave();
    await this.page.waitForSelector('text=Loading', { state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.page.waitForFunction(() => {
      const url = window.location.href;
      const match = url.match(/[?&#]id=(\d+)/);
      return match && match[1];
    }, { timeout: 60000 });

    const contactUrl = this.page.url();
    const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
    const contactId = idMatch ? idMatch[1] : '';

    return { contactId, contactName };
  }

  /**
   * Internal: edit a saved contact and assign a partner level via Partner Assignation tab.
   */
  private async _applyPartnerLevel(
    targetLevel: string,
    comment: string,
    levelPeriodEnd: string = '',
    activationDate?: string
  ): Promise<void> {
    await this.clickEdit();
    await this.wait(2000);

    await this.partnerAssignationTab().click();
    await this.wait(2000);

    if (activationDate) await this.setActivationDate(activationDate);

    await this.changeLevelButton().click();
    await this.wait(3000);

    try {
      const targetLevelField = this.targetLevelRow();
      await targetLevelField.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
      await targetLevelField.click();
      await this.wait(500);
      const levelOption = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, option').filter({ hasText: targetLevel }).first();
      await levelOption.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
      await levelOption.click();
    } catch {
      await this.targetLevelSelect().selectOption({ label: targetLevel });
    }

    const commentField = this.dialogContent().locator('textarea:not([disabled]), input[type="text"]:not([disabled])').last();
    await commentField.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
    await commentField.fill(comment);

    if (levelPeriodEnd) {
      const levelPeriodEndField = this.levelPeriodEndInput();
      const visible = await levelPeriodEndField.isVisible().catch(() => false);
      if (visible) {
        await levelPeriodEndField.click();
        await levelPeriodEndField.fill(levelPeriodEnd);
      }
    }

    await this.clickSubmitPartnerLevel();
  }

  /**
   * Create a Company or Individual contact (no partner level assignment).
   * @param contactType - "Company" or "Individual"
   * @param contactName - Contact name
   * @param email - Email address
   * @param country - Country name
   * @param salesTeam - Sales team name (e.g., "CMR")
   * @param state - Optional state/province
   * @param salesperson - Optional salesperson name; clears the field if omitted
   */
  async createContact(
    contactType: string,
    contactName: string,
    email: string,
    country: string,
    salesTeam: string,
    state?: string,
    salesperson?: string
  ): Promise<{ contactId: string; contactName: string }> {
    return await this._fillAndSaveContact(contactType, contactName, email, country, salesTeam, state, salesperson);
  }

  /**
   * Create a contact and assign the Distributor partner level via Partner Assignation tab.
   * @param contactType - "Company" or "Individual"
   * @param contactName - Contact name
   * @param email - Email address
   * @param country - Country name
   * @param salesTeam - Sales team name
   * @param comment - Comment for the level change
   * @param levelPeriodEnd - Level period end date (leave '' if not applicable)
   * @param state - Optional state/province
   * @param salesperson - Optional salesperson name
   * @param activationDate - Optional activation date to set before changing level
   */
  async createDistributorContact(
    contactType: string,
    contactName: string,
    email: string,
    country: string,
    salesTeam: string,
    comment: string,
    levelPeriodEnd: string = '',
    state?: string,
    salesperson?: string,
    activationDate?: string
  ): Promise<{ contactId: string; contactName: string }> {
    const result = await this._fillAndSaveContact(contactType, contactName, email, country, salesTeam, state, salesperson);
    await this._applyPartnerLevel('Distributor', comment, levelPeriodEnd, activationDate);
    return result;
  }

  /**
   * Create a contact and assign a Reseller partner level (Bronze, Silver, Gold, Basic)
   * via Partner Assignation tab.
   * @param contactType - "Company" or "Individual"
   * @param contactName - Contact name
   * @param email - Email address
   * @param country - Country name
   * @param salesTeam - Sales team name
   * @param resellerLevel - Partner level: "Bronze", "Silver", "Gold", or "Basic"
   * @param comment - Comment for the level change
   * @param levelPeriodEnd - Level period end date (leave '' if not applicable)
   * @param state - Optional state/province
   * @param salesperson - Optional salesperson name
   * @param activationDate - Optional activation date to set before changing level
   */
  async createResellerContact(
    contactType: string,
    contactName: string,
    email: string,
    country: string,
    salesTeam: string,
    resellerLevel: string,
    comment: string,
    levelPeriodEnd: string = '',
    state?: string,
    salesperson?: string,
    activationDate?: string
  ): Promise<{ contactId: string; contactName: string }> {
    const result = await this._fillAndSaveContact(contactType, contactName, email, country, salesTeam, state, salesperson);
    await this._applyPartnerLevel(resellerLevel, comment, levelPeriodEnd, activationDate);
    return result;
  }

  /**
   * Click Action menu button on the contact form header
   */
  async clickActionMenu(): Promise<void> {
    await this.formActionMenuButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.formActionMenuButton().click();
    await this.wait(500);
  }

  /**
   * Click Delete option in the Action dropdown menu (form view)
   */
  async clickActionDeleteOption(): Promise<void> {
    await this.formActionMenuDeleteOption().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.formActionMenuDeleteOption().click();
    await this.wait(500);
  }

  /**
   * Open the given contact/record URL in a new tab, delete it via Action → Delete → OK,
   * then close the tab.
   * @param url - The full URL of the contact record to delete
   */
  async deleteContactByURL(url: string): Promise<void> {
    const newTab = await this.page.context().newPage();
    const tabPage = new ContactPage(newTab);
    await tabPage.goto(url, { waitUntil: 'networkidle' });
    await tabPage.waitForPageReady();
    await newTab.waitForTimeout(CommonUtils.waitTimes.long);
    // Wait for the Action button to be visible (up to 60s for hash-based SPA routing)
    await this.actionButton(newTab).waitFor({ state: 'visible', timeout: 60000 });
    await tabPage.clickActionMenu();
    await tabPage.clickActionDeleteOption();
    await tabPage.confirmDeleteDialog();
    await newTab.close();
  }

  /**
   * Click the "Partner Assignation" tab on the Contact form
   */
  async clickPartnerAssignationTab(): Promise<void> {
    await this.partnerAssignationTab().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.partnerAssignationTab().click();
    await this.wait(2000);
  }

  /**
   * Set the Activation Date field in the Partner Assignation view
   * @param date - Date string in the format used by the UI (e.g. "04/21/2026")
   */
  async setActivationDate(date: string): Promise<void> {
    const input = this.activationDateInput();
    const exists = await input.isVisible({ timeout: 5000 }).catch(() => false);
    if (exists) {
      await input.click();
      await input.fill(date);
      await this.wait(300);
      await this.page.keyboard.press('Escape');
      await this.wait(300);
    }
  }

  /**
   * Click "CHANGE LEVEL" button in the Partner Assignation view
   */
  async clickChangeLevelButton(): Promise<void> {
    await this.changeLevelButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.changeLevelButton().click();
    await this.wait(3000);
  }

  /**
   * Select the target partner level in the "Change partner level" dialog
   * @param level - Level name (e.g., "Distributor", "Bronze", "Silver", "Gold")
   */
  async selectTargetLevel(level: string): Promise<void> {
    try {
      const row = this.targetLevelRow();
      await row.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
      await row.click();
      await this.wait(500);
      const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, option').filter({ hasText: level }).first();
      await option.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
      await option.click();
    } catch {
      await this.targetLevelSelect().selectOption({ label: level });
    }
    await this.wait(500);
  }

  /**
   * Fill the comment field in the "Change partner level" dialog
   * @param comment - Comment text to enter
   */
  async fillChangeLevelComment(comment: string): Promise<void> {
    const commentField = this.dialogContent().locator('textarea:not([disabled]), input[type="text"]:not([disabled])').last();
    await commentField.waitFor({ timeout: CommonUtils.waitTimes.abnormalWait });
    await commentField.fill(comment);
    await this.wait(300);
  }

  /**
   * Set the "Level period end" date field in the "Change partner level" dialog
   * @param date - Date string in the format used by the UI (e.g. "04/21/2026")
   */
  async setLevelPeriodEndDate(date: string): Promise<void> {
    const field = this.levelPeriodEndInput();
    const visible = await field.isVisible().catch(() => false);
    if (visible) {
      await field.click();
      await field.fill(date);
      await this.wait(300);
    }
  }

  /**
   * Click the SUBMIT button in the "Change partner level" dialog.
   *
   * Root cause: After SUBMIT, Odoo queues a programmatic input[type=file].click() via
   * setTimeout (fires ~10-20s later for Chile/BDEU certificate config). This blocks the
   * browser with a native OS dialog that Playwright cannot dismiss via CDP.
   *
   * Fix: Before clicking SUBMIT, inject a PERMANENT JS override that:
   *  1. Overrides HTMLInputElement.prototype.click to no-op for file inputs (never restored)
   *  2. Disables all existing file inputs in the DOM
   *  3. Attaches a MutationObserver to disable any dynamically-added file inputs
   * The override persists for the entire test lifetime so deferred setTimeout callbacks
   * (even 20s later) cannot open the OS dialog.
   */
  async clickSubmitPartnerLevel(): Promise<void> {
    const submitInDialog = this.dialogContent()
      .locator('xpath=.//button[contains(normalize-space(),"SUBMIT") or contains(normalize-space(),"Submit")]')
      .first();
    await submitInDialog.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    // Permanently block ALL file input programmatic clicks for this page lifetime.
    // Do NOT restore — the deferred Odoo setTimeout fires long after SUBMIT.
    await this.page.evaluate(() => {
      if ((window as any).__fileInputBlocked) return; // already installed
      (window as any).__fileInputBlocked = true;

      // 1. Override prototype so .click() on file inputs is a no-op
      const origClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function(this: HTMLInputElement) {
        if (this.type === 'file') return;
        origClick.call(this);
      };

      // 2. Disable all existing file inputs
      document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(el => {
        el.disabled = true;
      });

      // 3. Watch for dynamically added file inputs and disable them immediately
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach(node => {
            if (node instanceof HTMLInputElement && node.type === 'file') {
              node.disabled = true;
            }
            if (node instanceof HTMLElement) {
              node.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(el => {
                el.disabled = true;
              });
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await submitInDialog.click();

    // Wait for the Change Level modal to disappear
    try {
      await this.dialogContent().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait });
    } catch {
      // Modal may have already closed
    }
    await this.wait(2000);
  }

  /**
   * Click the "Sales & Purchases" tab on the Contact form
   */
  async clickSalesPurchasesTab(): Promise<void> {
    await this.salesPurchasesTab().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.salesPurchasesTab().click();
    await this.wait(2000);
  }

  /**
   * Select a Pricelist from the many2one dropdown on the Sales & Purchases tab
   * @param pricelist - Pricelist name to select (e.g., "Public Pricelist_EUR (EUR)")
   */
  async selectPricelist(pricelist: string): Promise<void> {
    const input = this.pricelistInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // Clear existing value: triple-click to select all → Backspace → Escape to close any open dropdown
    await input.click({ clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.wait(300);
    await this.page.keyboard.press('Escape');
    await this.wait(300);
    // Now fill with the desired value
    await input.click();
    await input.fill(pricelist);
    await this.wait(800);
    const option = this.dropdownOption(pricelist);
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
    await this.wait(500);
  }
}
