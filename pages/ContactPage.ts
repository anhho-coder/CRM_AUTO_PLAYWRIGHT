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
  // Readonly Email field of the contact currently on screen.
  // Must be keyed on the FIELD (@name='email'), not on any 'mailto:' anchor: an Odoo contact form
  // also carries HIDDEN duplicate mail widgets that render as href="mailto:false" / text "false",
  // and they come FIRST in the DOM - so a plain `a[href*="mailto:"]`.first() read back "false" on
  // every contact that has one. The child contacts in "Contacts & Addresses" are also @name='email'
  // anchors but come later, so .first() is the record's own address.
  private readonly emailReadonly = () =>
    this.page.locator("xpath=//a[@name='email' and not(contains(@class,'o_invisible_modifier'))]")
      .or(this.page.locator('a[name="email"]'));
  // Fallback only (see getEmailReadonly): every mail anchor on the page, hidden ones included.
  private readonly mailtoAnchors = () => this.page.locator('a[href*="mailto:"]');
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

  // --- Partner program conditions (res.partner.grade) + readonly Level/Discount readers (Discount-1.1) ---
  // Contacts module control-panel search box.
  private readonly contactsSearchInput = () =>
    this.page.locator('xpath=//input[contains(@class,"o_searchview_input")]').first();
  // First matching contact result (list row OR kanban card) by visible name.
  private readonly contactResultByName = (name: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][contains(normalize-space(.),"${name}")] | //div[contains(@class,"o_kanban_record")][contains(normalize-space(.),"${name}")]`).first();
  // "Configuration" top-menu dropdown toggle in the Contacts module menu bar (label/xmlid based - env agnostic).
  private readonly configurationMenuToggle = () =>
    this.page.locator('xpath=//a[@data-menu-xmlid="contacts.res_partner_menu_config"] | //a[contains(@class,"o_menu_header_lvl_1") and contains(normalize-space(),"Configuration")]').first();
  // "Partner program conditions" entry inside the Configuration dropdown.
  private readonly partnerProgramConditionsMenuItem = () =>
    this.page.locator('xpath=//a[contains(@class,"dropdown-item")][contains(normalize-space(),"Partner program condition")] | //a[contains(@class,"dropdown-item")][contains(normalize-space(),"Partner Program Condition")]').first();
  // A data row in the Partner program conditions (res.partner.grade) tree, by Level name.
  private readonly programConditionRowByName = (name: string) =>
    this.page.locator(`xpath=//tr[contains(@class,"o_data_row")][.//td[normalize-space()="${name}"]]`).first();
  // Readonly "Level" (grade_id) on the contact form: the POPULATED grade_id link (href -> res.partner.grade),
  // e.g. <a name="grade_id" href="#id=11&model=res.partner.grade">Bronze</a>. The href filter excludes the
  // many EMPTY grade_id anchors (href="#") in the Partner-Assignation level-history grid. CSS fallback.
  private readonly partnerLevelReadonlyXPath = () =>
    this.page.locator('xpath=//a[@name="grade_id" and contains(@href,"res.partner.grade")]').first();
  private readonly partnerLevelReadonlyCss = () =>
    this.page.locator('a[name="grade_id"][href*="res.partner.grade"]').first();
  // Readonly "Discount %" (discount_id) on the res.partner.grade form: an m2o link to nakivo_sale.discount
  // whose text IS the percent (e.g. "15.0"). XPath primary (any tag bearing name="discount_id"), CSS fallback.
  private readonly programDiscountReadonlyXPath = () =>
    this.page.locator('xpath=//a[@name="discount_id"] | //span[@name="discount_id"] | //div[@name="discount_id"]').first();
  private readonly programDiscountReadonlyCss = () =>
    this.page.locator('[name="discount_id"]').first();

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
  // Visibility & Access (CRM-10601 3.4): first-row checkbox, first-row cell, open-menu items, selection toggle.
  private readonly firstListRowCheckbox = () =>
    this.page.locator("xpath=(//tr[contains(@class,'o_data_row')])[1]//td[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  private readonly firstListRowFirstCell = () =>
    this.page.locator("xpath=(//tr[contains(@class,'o_data_row')])[1]//td[contains(@class,'o_data_cell')][1]").first();
  private readonly openActionMenuItems = () =>
    this.page.locator("xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[@role='menuitem']");
  private readonly listSelectionActionToggle = () =>
    this.page.locator("xpath=//button[contains(@class,'o_dropdown_toggler_btn') and (normalize-space()='Action' or normalize-space()='ACTION')] | //div[contains(@class,'o_cp_action_menus')]//button[normalize-space()='Action' or normalize-space()='ACTION']").first();
  // Sales & Purchases tab
  private readonly salesPurchasesTab = () =>
    this.page.locator("xpath=//a[contains(normalize-space(),'Sales & Purchases') or contains(normalize-space(),'Sales &amp; Purchases')]").first();
  // Pricelist many2one input (Sales & Purchases tab)
  private readonly pricelistInput = () =>
    this.page.locator("xpath=//div[@name='property_product_pricelist']//input").first();

  // --- CRM-12060: manual "Merge Contacts" wizard (base.partner.merge.automatic.wizard) ---
  // "Merge Contacts" entry inside an OPEN list Action dropdown.
  private readonly mergeContactsActionOption = () =>
    this.page.locator("xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[normalize-space()='Merge Contacts']")
      .or(this.page.locator("xpath=//a[contains(@class,'dropdown-item') and normalize-space()='Merge Contacts']")).first();
  // The merge wizard modal (identified by its heading text; CSS fallback to the generic modal).
  private readonly mergeWizardModal = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and .//*[contains(normalize-space(),'Merge the following contacts')]]")
      .or(this.page.locator('.modal-dialog')).first();
  // "Destination Contact" many2one input inside the merge wizard.
  private readonly destinationContactInput = () =>
    this.page.locator("xpath=//div[@name='dst_partner_id']//input").or(this.page.locator("div[name='dst_partner_id'] input")).first();
  // Wizard footer "Merge Contacts" confirm button (name=action_merge).
  private readonly mergeConfirmButton = () =>
    this.page.locator("xpath=//button[@name='action_merge']").or(this.page.locator("button[name='action_merge']")).first();
  // Wizard footer visible "Cancel" button (the invisible duplicate carries o_invisible_modifier).
  private readonly mergeWizardCancelButton = () =>
    this.page.locator("xpath=//div[contains(@class,'modal-footer')]//button[normalize-space()='Cancel' and not(contains(@class,'o_invisible_modifier'))]")
      .or(this.page.locator("xpath=//footer//button[normalize-space()='Cancel']")).first();
  // jQuery-UI / Odoo many2one autocomplete option list (collection).
  private readonly m2oAutocompleteOptions = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  // Contacts control-panel search input (reused by name search).
  private readonly searchViewInputCP = () =>
    this.page.locator('xpath=//input[contains(@class,"o_searchview_input")]').or(this.page.locator('input.o_searchview_input')).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Click CREATE button to open contact creation form
   */
  async clickCreate() {
    // Bounded wait for the list/kanban Create button so a failed upstream navigation surfaces
    // quickly with a clear error instead of hanging until the test timeout.
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementVisibility });
    await this.createButton().click();
    await this.page.waitForURL('**/web?*view_type=form*', { timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.standard);
  }

  /**
   * Wait for the Contacts list/kanban view to finish rendering after navigation.
   *
   * The breadcrumb/URL hash flips to `action=118` before the view actually paints, so a
   * URL-only wait can pass while Odoo is still showing the "Loading" overlay. On a slow
   * Pre-Production backend this lets the test march on to clickCreate() and time out there
   * with a misleading "CREATE button not visible" error. This method first lets the Loading
   * spinner clear, then waits for the CREATE button - the definitive signal the list view
   * has rendered - surfacing a genuinely slow/stuck load with a clear error at the nav step.
   */
  async waitForListReady() {
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {
      console.log('  ⚠️ "Loading" overlay still present after wait - continuing to check for CREATE button');
    });
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
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
    // Odoo renders an EMPTY email widget as the literal string "false" - that is an empty value, not
    // an address, so it must never be handed back to a caller as if it were one.
    const clean = (t: string) => (/^false$/i.test(t.trim()) ? '' : t.trim());
    try {
      const field = this.emailReadonly();
      if (await field.count()) {
        return clean(((await field.first().textContent({ timeout: CommonUtils.waitTimes.extraLong })) || ''));
      }
    } catch {
      // fall through to the anchor scan
    }
    try {
      // Fallback for forms that do not tag the field: first VISIBLE mail anchor. Must skip hidden
      // ones - Odoo's hidden duplicate widgets sit FIRST in the DOM and render "mailto:false".
      const anchors = this.mailtoAnchors();
      const total = await anchors.count();
      for (let i = 0; i < total; i++) {
        const anchor = anchors.nth(i);
        if (!(await anchor.isVisible().catch(() => false))) continue;
        const text = clean(((await anchor.textContent().catch(() => '')) || ''));
        if (text) return text;
      }
    } catch {
      // ignore - treated as "no email"
    }
    return '';
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
   * Select the FIRST data row in the contacts list (any record) by ticking its checkbox, to reveal the
   * selection-dependent list "Action" menu. Read-only callers only (visibility checks). Confirmed by the
   * Action toolbar toggle appearing.
   */
  async selectFirstListRow(): Promise<void> {
    const actionToggle = this.listSelectionActionToggle();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const cb = this.firstListRowCheckbox();
      await cb.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
      await cb.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await this.wait(CommonUtils.waitTimes.medium);
      const registered = await actionToggle.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
      if (registered) {
        console.log(`  ✓ Selected the first contact row (attempt ${attempt})`);
        return;
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    throw new Error('Could not register selection of the first contact row (the "Action" toolbar button never appeared).');
  }

  /**
   * Open the first contact in the list (click its first data cell) and wait for the form view.
   */
  async openFirstListRecord(): Promise<void> {
    await this.firstListRowFirstCell().click();
    await this.page.waitForURL('**view_type=form**', { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Opened the first contact (form/detail view)');
  }

  /**
   * Open the "Action" dropdown on a contact FORM (detail/control panel).
   */
  async clickFormActionMenu(): Promise<void> {
    const btn = this.formActionMenuButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Form Action menu opened');
  }

  /**
   * Read every visible option label in the currently-open Action dropdown (list toolbar OR form).
   */
  async getOpenActionMenuOptionLabels(): Promise<string[]> {
    await this.openActionMenuItems().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const labels = (await this.openActionMenuItems().allTextContents()).map((t) => t.trim()).filter(Boolean);
    console.log(`  - Action menu options (${labels.length}): ${JSON.stringify(labels)}`);
    return labels;
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Partner Level + Partner program conditions Discount % (Discount-1.1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open a contact directly by its backend form URL (the reseller's hard-configured contact URL).
   * @param url - the res.partner backend form URL (e.g. ".../web#id=<id>&model=res.partner&view_type=form")
   */
  async openContactByUrl(url: string): Promise<void> {
    await this.goto(url, { waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Open a contact form by URL and WAIT UNTIL THAT RECORD IS ACTUALLY RENDERED.
   *
   * Why this exists next to `openContactByUrl`: this Odoo web client is hash-routed, so navigating
   * from another record's form to "...#id=<n>&model=res.partner" is a SAME-DOCUMENT navigation -
   * `goto()` resolves instantly and `waitForFormView()` is satisfied by the PREVIOUS record's form,
   * which is still on screen while the SPA fetches the new one. Any field read in that window comes
   * off the stale record (observed: a crm.lead form's empty email read back as the string "false").
   * So this uses the hash-route + reload pattern of `openContactsList`, then gates on the contact's
   * own Name matching `expectedName` before returning.
   *
   * @param url - the contact's backend form URL
   * @param expectedName - display name to wait for; when omitted only the form view is awaited
   */
  async openContactFormByUrl(url: string, expectedName?: string): Promise<boolean> {
    await this.goto(url, { waitUntil: 'domcontentloaded' });
    // A hash-only change does not reload; force a real load of the hash route.
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    if (!expectedName) {
      await this.wait(CommonUtils.waitTimes.long);
      return true;
    }
    const target = expectedName.replace(/\s+/g, ' ').trim();
    for (let attempt = 1; attempt <= 6; attempt++) {
      const shown = ((await this.getContactNameReadonly()) || '').replace(/\s+/g, ' ').trim();
      // A child contact is referenced elsewhere by its DISPLAY name ("Company, Child") but its own
      // form shows just "Child", so the trailing segment counts as a match too.
      if (shown && (shown === target || target.endsWith(`, ${shown}`))) {
        console.log(`  ✓ Contact form rendered for "${target}"`);
        return true;
      }
      console.log(`  - Waiting for contact form "${target}" (showing "${shown}") - attempt ${attempt}/6`);
      await this.wait(CommonUtils.waitTimes.long);
    }
    console.log(`  ⚠ Contact form for "${target}" did not render in time`);
    return false;
  }

  /**
   * Search the Contacts list for a name and open the first matching record (list row or kanban card).
   * Returns the opened record's backend form URL. Used to capture the reseller's contact URL.
   * @param name - the contact name to search (e.g. "TEST-Reseller#Automation-Jun10")
   */
  async searchAndOpenContact(name: string): Promise<string> {
    const search = this.contactsSearchInput();
    await search.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // Odoo's searchview ignores fill() - it needs real key events to build the "Search Name for: X"
    // option, which Enter then applies as a name filter. Type via the keyboard.
    await search.click();
    await this.page.keyboard.type(name, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long); // let the search dropdown render
    await this.page.keyboard.press('Enter'); // apply "Search Name for: <name>"
    await this.wait(CommonUtils.waitTimes.long);
    const row = this.contactResultByName(name);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await row.click();
    await this.page.waitForURL(/[#?&]id=\d+/, { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const url = this.page.url();
    console.log(`  - Opened contact "${name}" -> ${url}`);
    return url;
  }

  /**
   * Read the partner "Level" (grade_id) shown on the contact form, e.g. "Bronze".
   * The field sits on the "Partner Assignation" tab; reads via textContent so an inactive
   * (display:none) notebook page is still readable, and falls back to clicking the tab if empty.
   * @returns the Level name (whitespace-normalised), or "" if not found
   */
  async getPartnerLevel(): Promise<string> {
    const readOnce = async (): Promise<string> => {
      let el = this.partnerLevelReadonlyXPath();
      if (!(await el.count().catch(() => 0))) el = this.partnerLevelReadonlyCss();
      return ((await el.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    let value = await readOnce();
    if (!value) {
      const tab = this.partnerAssignationTab();
      if (await tab.count().catch(() => 0)) {
        await tab.click().catch(() => {});
        await this.wait(CommonUtils.waitTimes.long);
      }
      value = await readOnce();
    }
    console.log(`  - Partner Level (grade_id): "${value}"`);
    return value;
  }

  /**
   * Navigate Contacts > Configuration > "Partner program conditions" (res.partner.grade tree).
   * Label/xmlid-based menu navigation so it works regardless of per-DB action ids.
   */
  async openPartnerProgramConditions(): Promise<void> {
    // Primary: deep-link to the action (menu_id=840&action=2224, xmlid
    // partner_level_management.res_partners_program_conditions - same id on prod and pre-prod).
    // Set the hash, then reload() so the Odoo web client boots fresh on that hash and loads the action -
    // a plain goto from another /web#... URL is a same-document hash change and would NOT load the action.
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#menu_id=840&action=2224`, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    let ready = await this.programConditionRowByName('Bronze')
      .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad })
      .then(() => true)
      .catch(() => false);

    // Fallback: label/xmlid-based menu navigation if the deep-link did not land on the tree.
    if (!ready) {
      console.log('  - Deep-link did not load the grade tree; falling back to the Configuration menu');
      const toggle = this.configurationMenuToggle();
      await toggle.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await toggle.click();
      await this.wait(CommonUtils.waitTimes.standard);
      const item = this.partnerProgramConditionsMenuItem();
      await item.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await item.click();
      ready = await this.programConditionRowByName('Bronze')
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad })
        .then(() => true)
        .catch(() => false);
    }
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Partner program conditions opened (tree ready: ${ready}) -> ${this.page.url()}`);
  }

  /**
   * Open a partner level (res.partner.grade) record from the Partner program conditions tree.
   * @param levelName - "Basic" | "Bronze" | "Silver" | "Gold"
   */
  async openPartnerProgramLevel(levelName: string): Promise<void> {
    const row = this.programConditionRowByName(levelName);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await row.click();
    await this.waitForFormView(CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  - Partner level "${levelName}" opened -> ${this.page.url()}`);
  }

  /**
   * Read the "Discount %" (discount_id) value on a res.partner.grade form, e.g. "15.0".
   * The field is a many2one to nakivo_sale.discount whose display name IS the percent.
   * @returns the displayed discount value (whitespace-normalised), or "" if not found
   */
  async getProgramDiscountPercent(): Promise<string> {
    let el = this.programDiscountReadonlyXPath();
    if (!(await el.count().catch(() => 0))) el = this.programDiscountReadonlyCss();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const value = ((await el.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`  - Program Discount % (discount_id): "${value}"`);
    return value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CRM-12060: manual Merge Contacts wizard (Destination Contact shows "Name (#ID)")
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Deep-link to the Contacts LIST view and wait until it renders. Uses the hash-route +
   * reload pattern (this Odoo web client is hash-routed, so a URL-glob wait is unreliable);
   * `waitForListReady` gates on the CREATE button, the definitive "list rendered" signal.
   */
  async openContactsList(): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=118&model=res.partner&view_type=list&menu_id=94`, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    await this.waitForListReady();
    console.log('  ✓ Contacts list opened');
  }

  /**
   * Click CREATE on the Contacts list and wait for the NEW contact form to be ready.
   * Hash-safe variant of `clickCreate()` - waits for the Name input (not a `web?...` URL glob,
   * which never matches this hash-routed app's `web#...view_type=form` URLs).
   */
  async openNewContactForm(): Promise<void> {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.createButton().click();
    await this.contactNameInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ New contact form opened');
  }

  /**
   * Type a name into the Contacts search box, apply it as a "Search Name for: X" filter,
   * and return the number of matching data rows in the list.
   * @param name - the contact name to search for
   */
  async searchContactsByName(name: string): Promise<number> {
    const search = this.searchViewInputCP();
    await search.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await search.click();
    // Clear any prior text, then type - Odoo's searchview needs real key events to build the filter.
    await this.page.keyboard.press('Control+A').catch(() => {});
    await this.page.keyboard.press('Backspace').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    await this.page.keyboard.type(name, { delay: 30 });
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.long);
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    const count = await this.dataRowsLocator().count();
    console.log(`  - Contacts matching "${name}": ${count} row(s)`);
    return count;
  }

  /**
   * Search the Contacts list by EMAIL DOMAIN - the merge-eligibility key for a manual
   * "Merge Contacts": the selected contacts must share ONE email domain (NOT one Company Name).
   *
   * Primary path: type the domain into the searchview and apply the default facet. This Odoo's
   * res.partner search view matches `email ilike self` as well as the display name, so
   * "@acme.com" returns every contact whose email sits in that domain.
   * Fallback (primary returned nothing): Filters > Add Custom Filter > Email contains <domain>.
   * The value widget of a char field is a plain text input (no m2o autocomplete), so the value is
   * filled directly here rather than through `selectCustomFilterValue` (which expects a dropdown).
   *
   * @param domain - bare domain ("acme.com") or the "@acme.com" form; always matched WITH the '@'
   *                 so "acme.com" cannot also match a display name.
   * @returns the number of matching data rows in the list.
   */
  async searchContactsByEmailDomain(domain: string): Promise<number> {
    const term = domain.startsWith('@') ? domain : `@${domain}`;
    const viaSearchView = await this.searchContactsByName(term);
    if (viaSearchView > 0) {
      console.log(`  - Contacts in email domain "${term}" (searchview): ${viaSearchView} row(s)`);
      return viaSearchView;
    }
    console.log(`  ! Searchview returned 0 rows for "${term}" - retrying with an Email custom filter`);
    await this.openContactsList();
    await this.clickFilterButton();
    await this.clickAddCustomFilter();
    await this.selectCustomFilterField('Email');
    await this.selectCustomFilterOperator('contains');
    const valueInput = this.customFilterValueInput();
    await valueInput.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await valueInput.fill(term);
    await this.wait(CommonUtils.waitTimes.medium);
    await this.clickApplyFilter();
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    const count = await this.dataRowsLocator().count();
    console.log(`  - Contacts in email domain "${term}" (Email custom filter): ${count} row(s)`);
    return count;
  }

  /**
   * Poll (re-search the email domain) until the number of contacts in `domain` reaches `expected`,
   * or attempts run out; returns the last observed count. Absorbs the post-merge lag where the
   * consumed source contact has not yet dropped out of the search index.
   */
  async waitForEmailDomainRowCount(
    domain: string,
    expected: number,
    attempts: number = 6,
    interval: number = CommonUtils.waitTimes.searchOppWait
  ): Promise<number> {
    let count = -1;
    for (let a = 1; a <= attempts; a++) {
      await this.openContactsList();
      count = await this.searchContactsByEmailDomain(domain);
      if (count === expected) return count;
      console.log(`  - waitForEmailDomainRowCount("${domain}") = ${count}, want ${expected} (attempt ${a}/${attempts})`);
      if (a < attempts) await this.wait(interval);
    }
    return count;
  }

  /**
   * Open the list Action menu and click "Merge Contacts"; wait for the wizard modal.
   * Requires rows to be already selected (the Action menu is selection-dependent).
   */
  async openMergeContactsWizard(): Promise<void> {
    await this.clickListActionMenu();
    const opt = this.mergeContactsActionOption();
    await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await opt.click();
    await this.mergeWizardModal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Merge Contacts wizard opened');
  }

  /**
   * Whether "Merge Contacts" is present in the currently-open list Action dropdown.
   * (Call after `clickListActionMenu()`.)
   */
  async isMergeContactsActionAvailable(): Promise<boolean> {
    return this.mergeContactsActionOption().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
  }

  /**
   * Open the "Destination Contact" dropdown in the merge wizard and return each option's
   * visible text (e.g. "Loxodonta AB (#470683)"). The "Create and Edit..." entry is included.
   */
  async getDestinationContactOptions(): Promise<string[]> {
    const input = this.destinationContactInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await this.wait(CommonUtils.waitTimes.long);
    const opts = (await this.m2oAutocompleteOptions().allTextContents())
      .map((o) => o.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    console.log(`  - Destination Contact options (${opts.length}): ${JSON.stringify(opts)}`);
    return opts;
  }

  /**
   * Select the Destination Contact whose dropdown option text contains "(#<id>)".
   * @param id - the res.partner ID to pick as the merge destination
   * @returns the chosen option's text
   */
  async selectDestinationContactById(id: string): Promise<string> {
    const input = this.destinationContactInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const option = this.m2oAutocompleteOptions().filter({ hasText: `(#${id})` }).first();
    // Open the m2o autocomplete: the jQuery-UI menu is only VISIBLE while the input is focused/open,
    // and a prior open (e.g. reading options) can leave it toggled shut - so retry the toggle until
    // the target option renders visibly.
    let opened = false;
    for (let attempt = 1; attempt <= 4 && !opened; attempt++) {
      await input.click();
      await this.wait(CommonUtils.waitTimes.standard);
      opened = await option.isVisible().catch(() => false);
      if (!opened) {
        await this.page.keyboard.press('ArrowDown').catch(() => {});
        await this.wait(CommonUtils.waitTimes.short);
        opened = await option.isVisible().catch(() => false);
      }
    }
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const text = ((await option.textContent()) || '').replace(/\s+/g, ' ').trim();
    await option.click();
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  ✓ Destination Contact set to "${text}"`);
    return text;
  }

  /**
   * Click the wizard's "Merge Contacts" (action_merge) confirm button and wait for the wizard
   * to close. Tolerates a secondary "Ok/Confirm" dialog if one appears.
   */
  async confirmMergeContacts(): Promise<void> {
    const btn = this.mergeConfirmButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    // Some Odoo builds pop a confirm dialog before performing the merge.
    const okBtn = this.confirmDeleteButton(); // reuse the generic "Ok/OK" locator
    if (await okBtn.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false)) {
      await okBtn.click().catch(() => {});
    }
    await this.mergeWizardModal().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Merge confirmed (action_merge)');
  }

  /**
   * Read the "Opportunities" smart-button count on the currently-open Contact (res.partner) form.
   * Returns 0 if the stat button is absent. Used by CRM-12059_1.4 to require a destination contact
   * that has MULTIPLE (high-stage) opportunities.
   */
  async getOpportunityStatCount(): Promise<number> {
    const btn = this.page
      .locator("xpath=//button[contains(@class,'oe_stat_button')][.//*[contains(normalize-space(),'Opportunit')]]")
      .first();
    const visible = await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visible) return 0;
    const txt = ((await btn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    const m = txt.match(/(\d[\d,]*)/);
    const count = m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
    console.log(`  - Contact "Opportunities" stat-button count: ${count}`);
    return count;
  }

  /**
   * Cancel / close the merge wizard WITHOUT merging.
   */
  async cancelMergeWizard(): Promise<void> {
    const btn = this.mergeWizardCancelButton();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await this.mergeWizardModal().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    }
    console.log('  ✓ Merge wizard cancelled');
  }

  /**
   * Count the list rows whose NAME cell text EXACTLY equals `name` (trimmed). Used by the
   * CRM-12059 historical-merge flow to confirm a historical company name resolves to exactly ONE
   * pre-existing contact (so a same-named throwaway makes the select-set exactly two). Child
   * contacts render as "Company, child" and are correctly excluded by the exact match.
   */
  async countRowsWithExactName(name: string): Promise<number> {
    const rows = this.dataRowsLocator();
    const total = await rows.count();
    const target = name.trim();
    let matches = 0;
    for (let i = 0; i < total; i++) {
      const cell = rows.nth(i).locator('td.o_data_cell').first();
      const txt = ((await cell.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (txt === target) matches++;
    }
    console.log(`  - Rows with exact Name "${name}": ${matches} of ${total}`);
    return matches;
  }

  /**
   * Poll (re-search + exact-name count) until the number of contacts whose Name equals `name`
   * reaches `expected`, or attempts run out. Returns the last observed count. Absorbs the small
   * post-merge lag where the source contact's unlink hasn't propagated to the search index yet
   * (the merge wizard closes slightly before the source disappears from search results).
   */
  async waitForExactNameCount(
    name: string,
    expected: number,
    attempts: number = 6,
    interval: number = CommonUtils.waitTimes.searchOppWait
  ): Promise<number> {
    let count = -1;
    for (let a = 1; a <= attempts; a++) {
      await this.openContactsList();
      await this.searchContactsByName(name);
      count = await this.countRowsWithExactName(name);
      if (count === expected) return count;
      console.log(`  - waitForExactNameCount("${name}") = ${count}, want ${expected} (attempt ${a}/${attempts})`);
      if (a < attempts) await this.wait(interval);
    }
    return count;
  }

  /**
   * Tick the row checkboxes of EVERY list row whose NAME cell text EXACTLY equals `name` (trimmed),
   * then confirm the selection registered (the selection-dependent "Action" toolbar appears).
   * Returns the number of rows selected. The hidden Bootstrap custom-control checkbox needs a JS
   * checked+dispatch (a normal click / .check() does not register selection in this Odoo list).
   */
  async selectContactRowsByExactName(name: string): Promise<number> {
    const rows = this.dataRowsLocator();
    const total = await rows.count();
    const target = name.trim();
    let selected = 0;
    for (let i = 0; i < total; i++) {
      const row = rows.nth(i);
      const cell = row.locator('td.o_data_cell').first();
      const txt = ((await cell.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (txt !== target) continue;
      const cb = row.locator("td.o_list_record_selector input[type='checkbox']").first();
      await cb.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
      await cb.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      selected++;
      await this.wait(CommonUtils.waitTimes.short);
    }
    if (selected > 0) {
      await this.listSelectionActionToggle()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
        .catch(() => { throw new Error('Row selection did not register (the "Action" toolbar never appeared).'); });
    }
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Selected ${selected} contact row(s) with exact Name "${name}"`);
    return selected;
  }

  /**
   * Extract the res.partner ID from the current form URL (e.g. ".../web#id=669585&...").
   * @returns the numeric ID string, or '' if not present.
   */
  getCurrentRecordId(): string {
    const m = this.page.url().match(/[#?&]id=(\d+)/);
    return m ? m[1] : '';
  }

  /**
   * Return the visible Name-column text of every data row currently shown in the Contacts list.
   * (First data cell of each row - the selector checkbox cell is a separate o_list_record_selector.)
   */
  async getListRowNames(): Promise<string[]> {
    const cells = this.page.locator("xpath=//tr[contains(@class,'o_data_row')]//td[contains(@class,'o_data_cell')][1]");
    await cells.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const names = (await cells.allTextContents()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    console.log(`  - List row Name cells (${names.length}): ${JSON.stringify(names)}`);
    return names;
  }

  // --- CRM-12060 3.2: contact "Opportunities" stat button (action_view_opportunities) ---
  // The VISIBLE opportunities stat button (a hidden duplicate carries o_invisible_modifier).
  private readonly opportunitiesSmartButton = () =>
    this.page.locator("xpath=//button[@name='action_view_opportunities' and not(contains(@class,'o_invisible_modifier'))]")
      .or(this.page.locator("button[name='action_view_opportunities']")).first();

  /**
   * Read the integer count on the contact's "Opportunities" stat button (e.g. "1 Opportunities" -> 1).
   * @returns the count, or 0 if the button/label is absent.
   */
  async getOpportunitiesCount(): Promise<number> {
    const btn = this.opportunitiesSmartButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const txt = ((await btn.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const m = txt.match(/(\d+)/);
    const count = m ? parseInt(m[1], 10) : 0;
    console.log(`  - Contact "Opportunities" stat button: "${txt}" -> ${count}`);
    return count;
  }

  /**
   * Click the contact's "Opportunities" stat button and wait for the partner-scoped crm.lead view
   * (its CREATE button pre-fills the new Opportunity's Customer with this contact via the context).
   */
  async clickOpportunitiesSmartButton(): Promise<void> {
    const btn = this.opportunitiesSmartButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.page.waitForURL('**model=crm.lead**', { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Opened the contact\'s Opportunities (partner-scoped crm.lead view)');
  }
}
