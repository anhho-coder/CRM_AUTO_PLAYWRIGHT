import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

/**
 * Investment Page Object
 * Handles interactions with Investment module (Activity Type, etc.)
 */
export class InvestmentPage extends BasePage {
  // Navigation locators
  private readonly investmentMenu = () => this.page.locator('xpath=(//a[contains(., "Investments")])[2]');
  private readonly investmentMenuItem = () => this.page.locator('xpath=//a[contains(., "Investment") and not(contains(., "Configuration"))]').first();
  private readonly configurationMenu = () => this.page.locator('xpath=(//a[contains(., "Configuration")])[1]');
  private readonly activityTypeMenuItem = () => this.page.locator('xpath=//a[contains(., "Activity Type")]');

  // List view locators
  private readonly createButton = () => this.page.locator('xpath=//button[contains(@class, "o_list_button_add") or normalize-space()="CREATE" or normalize-space()="Create"]').first();
  private readonly searchInput = () => this.page.locator('xpath=//input[@class="o_searchview_input"]');
  private readonly actionDropdown = () => this.page.locator('xpath=//button[contains(., "Action")]');
  private readonly deleteMenuItem = () => this.page.locator('xpath=//a[contains(., "Delete")]');

  // Form view locators
  private readonly nameInput = () => this.page.locator('xpath=(//input[@name="name"])[2]');
  private readonly codeInput = () => this.page.locator('xpath=(//input[@name="code"])[2]');
  private readonly investmentNameInput = () => this.page.locator('xpath=//input[@name="name" and not(@type="checkbox")]').first();
  private readonly investmentIDInput = () => this.page.locator('xpath=//input[@name="code"]').first();
  private readonly investmentTypeInput = () => this.page.locator('xpath=//div[@name="type_id"]//input').first();
  private readonly nbrProductListInput = () => this.page.locator('xpath=//div[contains(@name, "product_list_ids")]//input').first();
  private readonly channelInput = () => this.page.locator('xpath=//div[contains(@name, "channel_id")]//input').first();
  private readonly countriesField = () => this.page.locator('xpath=(//div[contains(@name, "country") or contains(@name, "Country") or contains(@name, "countries") or contains(@name, "Countries")])[2]').first();
  private readonly countriesInput = () => this.page.locator('xpath=//div[contains(@name, "country_ids")]//input').first();
  private readonly jiraIDInput = () => this.page.locator('xpath=//input[contains(@name, "jira_id")]').first();
  private readonly dateStartField = () => this.page.locator('xpath=(//input[@name="date_start"])[1]').first();
  private readonly dateEndField = () => this.page.locator('xpath=(//input[@name="date_end"])[1]').first();
  private readonly responsibleSalesField = () => this.page.locator('xpath=//div[contains(@name, "user_sales_id")]//input').first();
  private readonly responsibleMarketingField = () => this.page.locator('xpath=//div[contains(@name, "user_marketing_id")]//input').first();
  private readonly completionEventsField = () => this.page.locator('xpath=//div[contains(@name, "completion_events")]//input').first();
  private readonly conversionEventsField = () => this.page.locator('xpath=//div[contains(@name, "conversion_events")]//input').first();
  private readonly trackConversionDateStartField = () => this.page.locator('xpath=//div[contains(@name, "track_conversion_date_start")]//input').first();
  private readonly trackConversionDateStartInvalidField = () => this.page.locator('xpath=//div[contains(@name, "track_conversion_date_start") and contains(@class, "o_field_invalid")]').first();
  private readonly trackConversionDateEndField = () => this.page.locator('xpath=//div[contains(@name, "track_conversion_date_end")]//input').first();
  private readonly trackConversionDateEndInvalidField = () => this.page.locator('xpath=//div[contains(@name, "track_conversion_date_end") and contains(@class, "o_field_invalid")]').first();
  private readonly invalidFieldsWarning = () =>
    this.page.locator('xpath=//*[contains(@class,"o_notification") or contains(@class,"modal-body") or contains(@class,"o_dialog")][.//*[contains(normalize-space(),"following field")] or contains(normalize-space(),"following field")] | //*[contains(normalize-space(),"The following field") and (contains(@class,"o_notification") or contains(@class,"alert") or contains(@class,"o_error") or contains(@class,"modal"))]').first();

  // ROI tab locators
  private readonly roiTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "ROI")] | //button[contains(normalize-space(), "ROI")] | //li[contains(normalize-space(), "ROI")]//a').first();
  private readonly revenuePlannedField = () => this.page.locator('xpath=//input[contains(@name, "revenue_planned") or (contains(@name, "revenue") and contains(@name, "planned"))]').first();
  private readonly expensesPlannedField = () => this.page.locator('xpath=//span[contains(@name, "expenses_planned") or (contains(@name, "expenses") and contains(@name, "planned"))] | //input[contains(@name, "expenses_planned") or (contains(@name, "expenses") and contains(@name, "planned"))] | //div[contains(@name, "expenses_planned") or (contains(@name, "expenses") and contains(@name, "planned"))]').first();
  private readonly roiPlannedField = () => this.page.locator('xpath=//span[contains(@name, "planned_roi")]/following-sibling::span').first();
  private readonly newCompanyContactsPlannedField = () => this.page.locator('xpath=//input[contains(@name, "planned_new_company_contacts")]').first();
  private readonly euQuotationsPlannedField = () => this.page.locator('xpath=//input[contains(@name, "planned_eu_quotations")]').first();
  private readonly revenueActualField = () => this.page.locator('xpath=//span[contains(@name, "actual_revenue")]').first();
  private readonly revenueActual6MField = () => this.page.locator('xpath=//span[contains(@name, "actual_6m_revenue")]').first();
  private readonly revenueActual3MField = () => this.page.locator('xpath=//span[contains(@name, "actual_3m_revenue")]').first();

  // Planned Expenses tab locators
  private readonly plannedExpensesTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Planned expenses")] | //button[contains(normalize-space(), "Planned expenses")] | //li[contains(normalize-space(), "Planned expenses")]//a').first();
  private readonly addALineLink = () => this.page.locator('xpath=(//a[@role="button" and contains(text(),"Add a line")])[1]').first();
  private readonly plannedExpensesDateField = () => this.page.locator('xpath=//td[contains(@class, "o_data_cell") and @name="date"]//input | //div[@name="date"]//input | //input[@name="date"]').first();
  private readonly plannedExpensesDescriptionField = () => this.page.locator('xpath=//td/textarea[@name="description"]').first();
  private readonly plannedExpensesTypeField = () => this.page.locator('xpath=(//div[@name="type_id"]/div/input[@type="text"])[2]').first();
  private readonly plannedExpensesAmountField = () => this.page.locator('xpath=//td[@class="o_data_cell o_list_number"]//input[@name="amount"]').first();
  private readonly plannedExpensesICField = () => this.page.locator('xpath=//div[@name="employee_id"]/div/input').first();

  // Actual Expenses tab locators
  private readonly actualExpensesTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Actual expenses")] | //button[contains(normalize-space(), "Actual expenses")] | //li[contains(normalize-space(), "Actual expenses")]//a').first();
  private readonly actualExpenses_addALineLink = () => this.page.locator('xpath=(//a[@role="button" and contains(text(),"Add a line")])[2]').first();
  private readonly actualExpensesDateField = () => this.page.locator('xpath=//td[contains(@class, "o_data_cell") and @name="date"]//input | //div[@name="date"]//input | //input[@name="date"]').first();
  private readonly actualExpensesDescriptionField = () => this.page.locator('xpath=//td/textarea[@name="description"]').first();
  private readonly actualExpensesTypeField = () => this.page.locator('xpath=(//div[@name="type_id"]/div/input[@type="text"])[2]').first();
  private readonly actualExpensesAmountField = () => this.page.locator('xpath=//td[@class="o_data_cell o_list_number"]//input[@name="amount"] | //td[@name="price_unit"]//input | //td[@name="amount"]//input | //td[@name="total_amount"]//input').first();
  private readonly actualExpensesBillNumberField = () => this.page.locator('xpath=//input[@name="bill"]').first();
  private readonly actualExpensesICField = () => this.page.locator('xpath=//div[@name="employee_id"]/div/input').first();

  // Audience tab locators
  private readonly audienceTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Audience")] | //button[contains(normalize-space(), "Audience")] | //li[contains(normalize-space(), "Audience")]//a').first();
  private readonly uploadYourFileButton = () => this.page.locator('xpath=//button[contains(normalize-space(), "Upload your file")]').first();
  private readonly importButton = () => this.page.locator('xpath=//button[contains(normalize-space(), "Import")]').first();
  private readonly audience_addALineLink = () => this.page.locator('xpath=(//a[@role="button" and contains(text(),"Add a line")])[5]').first();
  private readonly audienceContactIDField = () => this.page.locator('xpath=//div[@class="modal-content"]//div[@name="partner_id"]//input | //div[@class="modal-content"]//div[@name="contact_id"]//input | //div[@class="modal-content"]//input[@name="partner_id"] | //div[@class="modal-content"]//input[@name="contact_id"]').first();
  private readonly audienceEventLeadTypeField = () => this.page.locator('xpath=//select[@name="contact_type_input"]').first();
  private readonly audienceEngagementTypeField = () => this.page.locator('xpath=//select[@name="engagement_type"]').first();
  private readonly audienceEngagementDateField = () => this.page.locator('xpath=//input[@name="engagement_date"]').first();
  private readonly downloadTemplateLink = () => this.page.locator('xpath=//a[contains(normalize-space(), "Download template")]').first();
  private readonly importErrorLocator = (keyword: string) => this.page.locator(
    `xpath=//*[contains(@class,"o_notification_content") and contains(normalize-space(),"${keyword}")] | //div[contains(@class,"o_dialog")]//div[contains(@class,"modal-body") and contains(normalize-space(),"${keyword}")]`
  ).first();
private readonly importErrorLocatorQA = () => this.page.locator('xpath=(//span[@name="message_error"])[1]').first();
  // Leads tab locators
  private readonly leadsTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Leads")]').first();

  // Quotes tab locators
  private readonly quotesTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Quotes")] | //button[contains(normalize-space(), "Quotes")] | //li[contains(normalize-space(), "Quotes")]//a').first();

  // Invoices tab locators
  private readonly invoicesTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Invoices") or contains(normalize-space(), "Invoice")] | //button[contains(normalize-space(), "Invoices") or contains(normalize-space(), "Invoice")] | //li[contains(normalize-space(), "Invoices") or contains(normalize-space(), "Invoice")]//a').first();

  // Required items tab locators
  private readonly requiredItemsTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Required items")] | //button[contains(normalize-space(), "Required items")] | //li[contains(normalize-space(), "Required items")]//a').first();
  private readonly isDatasheetsField = () => this.page.locator('xpath=//div[@name="is_datasheets"]/input').first();
  private readonly isNotebooksField = () => this.page.locator('xpath=//div[@name="is_notebooks"]/input').first();
  private readonly isPensField = () => this.page.locator('xpath=//div[@name="is_pens"]/input').first();
  private readonly isAmazonCardsField = () => this.page.locator('xpath=//div[@name="is_amazon_cards"]/input').first();
  private readonly isRequiredRollupBannersField = () => this.page.locator('xpath=//div[@name="is_required_rollup_banners"]/input').first();
  private readonly isRequiredDatasheetsField = () => this.page.locator('xpath=//div[@name="is_required_datasheets"]/input').first();
  private readonly isRequiredPrintedSurveysField = () => this.page.locator('xpath=//div[@name="is_required_printed_surveys"]/input').first();
  private readonly isRequiredPresentationsField = () => this.page.locator('xpath=//div[@name="is_required_presentations"]/input').first();

  // Lead tracking tab locators
  private readonly leadTrackingTab = () => this.page.locator('xpath=//a[contains(normalize-space(), "Lead tracking")] | //button[contains(normalize-space(), "Lead tracking")] | //li[contains(normalize-space(), "Lead tracking")]//a').first();
  private readonly leadTracking_addALineLink = () => this.page.locator('xpath=(//a[@role="button" and contains(text(),"Add a line")])[6]').first();
  private readonly leadTrackingUTMTagField = () => this.page.locator('xpath=//input[@name="utm_tag"]').first();
  private readonly leadTrackingValueField = () => this.page.locator('xpath=//input[@name="value"]').first();

  private readonly confirmOkButton = () => this.page.locator('xpath=//button[contains(@class, "btn-primary") and (normalize-space()="Ok" or normalize-space()="OK")]');
  
private readonly saveButton = () => this.page.locator('xpath=(//button[normalize-space()="Save" or normalize-space()="SAVE"])[1]').first();
  protected readonly discardButton = () => this.page.locator('xpath=(//button[normalize-space()="Discard" or normalize-space()="DISCARD"])[1]').first();
  private readonly editButtonLoc = () => this.page.locator('xpath=//button[normalize-space()="Edit" or normalize-space()="EDIT"]').first();

  // Display/readonly locators
  private readonly nameDisplay = () => this.page.locator('xpath=//span[@name="name"]').or(this.page.locator('xpath=//input[@name="name"]'));
  private readonly codeDisplay = () => this.page.locator('xpath=//span[@name="code"]').or(this.page.locator('xpath=//input[@name="code"]'));

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Investments > Configuration > Activity Type
   */
  async navigateToActivityType() {
    // // Click Investments menu
    // await this.investmentMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // await this.investmentMenu().click();
    // await this.wait(2000);

    // Click Configuration submenu
    await this.configurationMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.configurationMenu().click();
    await this.wait(2000);

    // Click Activity Type
    await this.activityTypeMenuItem().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.activityTypeMenuItem().click();
    await this.wait(3000);
  }

  /**
   * Click CREATE button to open new Activity Type form
   */
  async clickCreateButton() {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.createButton().click();
    await this.wait(3000);
  }

  /**
   * Fill Activity Type form fields
   * @param name - Activity Type name
   * @param code - Activity Type code
   */
  async fillActivityTypeForm(name: string, code: string) {
    await this.nameInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.nameInput().fill(name);
    await this.wait(1000);

    await this.codeInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.codeInput().fill(code);
    await this.wait(1000);
  }

  /**
   * Click SAVE button
   */
  async clickSaveButton() {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    await this.wait(3000);
  }

  /**
   * Click DISCARD button, then confirm the "discard changes?" dialog if Odoo shows one.
   */
  async clickDiscardButton(): Promise<void> {
    await this.discardButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.discardButton().click();
    await this.wait(1000);
    // Odoo may show a "Are you sure you want to discard your changes?" confirmation modal
    try {
      await this.confirmOkButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await this.confirmOkButton().click();
      await this.wait(2000);
    } catch {
      // No confirmation dialog appeared — discard completed silently
      await this.wait(1000);
    }
  }

  /**
   * Click EDIT button (skips if already in edit mode — Odoo 17+ auto-edits forms)
   */
  async clickEditButton(): Promise<void> {
    const isVisible = await this.editButtonLoc().isVisible();
    if (isVisible) {
      await this.editButtonLoc().click();
      await this.wait(2000);
    }
  }

  /**
   * Get saved Name value
   */
  async getSavedName(): Promise<string> {
    await this.nameDisplay().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const element = this.nameDisplay().first();
    
    // Check if it's an input field or span
    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'input') {
      return await element.inputValue();
    } else {
      const text = await element.textContent();
      return text?.trim() || '';
    }
  }

  /**
   * Get saved Code value
   */
  async getSavedCode(): Promise<string> {
    await this.codeDisplay().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const element = this.codeDisplay().first();
    
    // Check if it's an input field or span
    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'input') {
      return await element.inputValue();
    } else {
      const text = await element.textContent();
      return text?.trim() || '';
    }
  }

  /**
   * Search for Activity Type by name
   * @param searchTerm - Search term to find Activity Type
   */
  async searchActivityType(searchTerm: string) {
    await this.searchInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.searchInput().fill(searchTerm);
    await this.page.keyboard.press('Enter');
    await this.wait(2000);
  }

  /**
   * Get Activity Type row locator by name
   * @param name - Activity Type name
   */
  private getActivityTypeRow(name: string) {
    return this.page.locator(`xpath=//td[contains(text(),"${name}")]/parent::tr`).first();
  }

  /**
   * Get Activity Type checkbox locator by name
   * @param name - Activity Type name
   */
  private getActivityTypeCheckbox(name: string) {
    return this.page.locator(`xpath=//td[contains(text(),"${name}")]/parent::tr//input[@type="checkbox"]`).first();
  }

  /**
   * Verify Activity Type exists in list with name and code
   * @param name - Activity Type name to verify
   * @param code - Activity Type code to verify
   */
  async verifyActivityTypeInList(name: string, code: string): Promise<void> {
    const row = this.getActivityTypeRow(name);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    
    const rowText = await row.textContent();
    
    // Verify name
    if (!rowText?.includes(name)) {
      throw new Error(`Activity Type name "${name}" not found in row`);
    }
    console.log(`  ✓ Name verified in list: ${name}`);
    
    // Verify code
    if (!rowText?.includes(code)) {
      throw new Error(`Activity Type code "${code}" not found in row`);
    }
    console.log(`  ✓ Code verified in list: ${code}`);
  }

  /**
   * Select Activity Type row in list view using custom-control wrapper
   * @param name - Activity Type name to select
   */
  async selectActivityTypeRow(name: string) {
    const row = this.getActivityTypeRow(name);
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    
    // Click on the label or custom-control wrapper instead of checkbox directly
    const checkboxWrapper = row.locator('label, .custom-control').first();
    await checkboxWrapper.click({ force: true });
    await this.wait(500);
    
    // Verify checkbox is checked
    const checkbox = this.getActivityTypeCheckbox(name);
    const isChecked = await checkbox.isChecked();
    if (!isChecked) {
      throw new Error(`Failed to check Activity Type checkbox for "${name}"`);
    }
  }

  /**
   * Delete selected Activity Type
   */
  async deleteSelectedActivityType() {
    // Click Action dropdown
    await this.actionDropdown().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.actionDropdown().click();
    await this.wait(1000);

    // Click Delete option
    await this.deleteMenuItem().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.deleteMenuItem().click();
    await this.wait(2000);

    // Confirm deletion
    await this.confirmOkButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.confirmOkButton().click();
    await this.wait(3000);
  }

  /**
   * Delete the currently open Investment record from its form view
   * Steps: Action dropdown → Delete → OK
   */
  async deleteCurrentRecord(): Promise<void> {
    await this.clickActionDropdown();
    await this.clickDeleteMenuItem();
    await this.clickConfirmOkButton();
  }

  /**
   * Click the Action dropdown button
   */
  async clickActionDropdown(): Promise<void> {
    await this.actionDropdown().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.actionDropdown().click();
    await this.wait(1000);
  }

  /**
   * Click the Delete menu item inside the Action dropdown
   */
  async clickDeleteMenuItem(): Promise<void> {
    await this.deleteMenuItem().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.deleteMenuItem().click();
    await this.wait(2000);
  }

  /**
   * Click the OK button on the confirmation dialog
   */
  async clickConfirmOkButton(): Promise<void> {
    await this.confirmOkButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.confirmOkButton().click();
    await this.wait(3000);
  }

  /**
   * Create Activity Type with all steps (navigate, create, fill, save)
   * @param name - Activity Type name
   * @param code - Activity Type code
   */
  async createActivityType(name: string, code: string) {
    await this.navigateToActivityType();
    await this.clickCreateButton();
    await this.fillActivityTypeForm(name, code);
    await this.clickSaveButton();
  }

  /**
   * Delete Activity Type by name (search, select, delete)
   * @param name - Activity Type name to delete
   */
  async deleteActivityTypeByName(name: string) {
    await this.navigateToActivityType();
    await this.searchActivityType(name);
    await this.selectActivityTypeRow(name);
    await this.deleteSelectedActivityType();
  }

  /**
   * Navigate to Investments
   */
  async navigateToInvestment() {
    

    // Click Investment menu item
    await this.investmentMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.investmentMenu().click();
    await this.wait(3000);
    
  }

  /**
   * Fill Investment Name field
   */
  async fillInvestmentName(name: string): Promise<void> {
    const field = this.investmentNameInput();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(name);
  }

  /**
   * Fill Investment ID field
   */
  async fillInvestmentID(id: string): Promise<void> {
    const field = this.investmentIDInput();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(id);
  }

  /**
   * Select Investment Type (many2one combobox)
   */
  async selectInvestmentType(value: string): Promise<void> {
    const input = this.investmentTypeInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
    // await this.page.waitForTimeout(1000);
    // const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, .o-autocomplete--dropdown-item, [role="option"]').filter({ hasText: value }).first();
    // await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    // await option.click().catch(async () => {
    //   try { await this.page.keyboard.press('Enter'); } catch (_) {}
    // });
  }

  /**
   * Select Channel (many2one combobox)
   */
  async selectChannel(value: string): Promise<void> {
    const input = this.channelInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
    // await this.page.waitForTimeout(1000);
    // const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, .o-autocomplete--dropdown-item, [role="option"]').filter({ hasText: value }).first();
    // await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    // await option.click().catch(async () => {
    //   try { await this.page.keyboard.press('Enter'); } catch (_) {}
    // });
  }

  /**
   * Select Countries (many2many combobox)
   */
  async selectCountries(value: string): Promise<void> {
    const input = this.countriesInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Fill Date start field (format MM/DD/YYYY)
   */
  async fillDateStart(date: string): Promise<void> {
    const field = this.dateStartField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(date);
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Fill Date end field (format MM/DD/YYYY)
   */
  async fillDateEnd(date: string): Promise<void> {
    const field = this.dateEndField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(date);
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Select Responsible - Sales (many2one combobox)
   */
  async selectResponsibleSales(value: string): Promise<void> {
    const input = this.responsibleSalesField();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Select Responsible - Marketing (many2one combobox)
   */
  async selectResponsibleMarketing(value: string): Promise<void> {
    const input = this.responsibleMarketingField();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Select NBR Product List (many2many combobox)
   */
  async selectNBRProductList(value: string): Promise<void> {
    const input = this.nbrProductListInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(1000);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Select Completion Events (many2many combobox)
   */
  async selectCompletionEvents(value: string): Promise<void> {
    const input = this.completionEventsField();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Select Conversion Events (many2many combobox)
   */
  async selectConversionEvents(value: string): Promise<void> {
    const input = this.conversionEventsField();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await input.fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Fill Track conversion date start field (format MM/DD/YYYY)
   */
  async fillTrackConversionDateStart(date: string): Promise<void> {
    const field = this.trackConversionDateStartField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(date);
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Get the current value of the "Track conversion date start" field (format MM/DD/YYYY)
   */
  async getTrackConversionDateStartValue(): Promise<string> {
    const field = this.trackConversionDateStartField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await field.inputValue()).trim();
  }

  /**
   * Fill Track conversion date end field (format MM/DD/YYYY)
   */
  async fillTrackConversionDateEnd(date: string): Promise<void> {
    const field = this.trackConversionDateEndField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.fill(date);
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Get the current value of the "Track conversion date end" field (format MM/DD/YYYY)
   */
  async getTrackConversionDateEndValue(): Promise<string> {
    const field = this.trackConversionDateEndField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await field.inputValue()).trim();
  }

  /**
   * Clear the "Track conversion date start" field (set to BLANK)
   */
  async clearTrackConversionDateStart(): Promise<void> {
    const field = this.trackConversionDateStartField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.press('Control+a');
    await field.fill('');
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Returns true when the "Track conversion date start" field shows the required-field
   * validation error (Odoo adds the class "o_field_invalid" to its wrapper div).
   */
  async isTrackConversionDateStartFieldInvalid(): Promise<boolean> {
    const indicator = this.trackConversionDateStartInvalidField();
    try {
      await indicator.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the text of the Odoo invalid-fields warning notification/dialog
   * that appears after pressing Save with a blank required field.
   * Tries the notification manager first, then falls back to any visible
   * element that contains the expected warning phrase.
   */
  async getInvalidFieldsWarningText(): Promise<string> {
    // Try dedicated warning locator first
    const warningLoc = this.invalidFieldsWarning();
    try {
      await warningLoc.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return (await warningLoc.innerText()).trim();
    } catch {
      // Fallback: look for any visible element with the phrase
      const fallback = this.page.locator(
        'xpath=//*[contains(normalize-space(),"following field") or contains(normalize-space(),"Track conversion date start")]'
      ).first();
      await fallback.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return (await fallback.innerText()).trim();
    }
  }

  /**
   * Clear the "Track conversion date end" field (set to BLANK)
   */
  async clearTrackConversionDateEnd(): Promise<void> {
    const field = this.trackConversionDateEndField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
    await field.press('Control+a');
    await field.fill('');
    await field.press('Tab');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
  }

  /**
   * Returns true when the "Track conversion date end" field shows the required-field
   * validation error (Odoo adds the class "o_field_invalid" to its wrapper div).
   */
  async isTrackConversionDateEndFieldInvalid(): Promise<boolean> {
    const indicator = this.trackConversionDateEndInvalidField();
    try {
      await indicator.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a blank Investment by filling all general fields, then saving.
   * Corresponds to Pre-condition step 4 in TC CRM-2482_3.1.1.1.x.
   */
  async createBlankInvestment(data: {
    investmentName: string;
    investmentID: string;
    type: string;
    channel: string;
    countries: string;
    dateStart: string;
    dateEnd: string;
    responsibleSales: string;
    responsibleMarketing: string;
    nbrProductList: string;
    completionEvents: string;
    conversionEvents: string;
    trackConversionDateStart: string;
    trackConversionDateEnd: string;
  }): Promise<void> {
    await this.fillInvestmentName(data.investmentName);
    await this.fillInvestmentID(data.investmentID);
    await this.selectInvestmentType(data.type);
    await this.selectChannel(data.channel);
    await this.selectCountries(data.countries);
    await this.fillDateStart(data.dateStart);
    await this.fillDateEnd(data.dateEnd);
    await this.selectResponsibleSales(data.responsibleSales);
    await this.selectResponsibleMarketing(data.responsibleMarketing);
    await this.selectNBRProductList(data.nbrProductList);
    await this.selectCompletionEvents(data.completionEvents);
    await this.selectConversionEvents(data.conversionEvents);
    await this.fillTrackConversionDateStart(data.trackConversionDateStart);
    await this.fillTrackConversionDateEnd(data.trackConversionDateEnd);
    await this.clickSaveButton();
  }

  /**
   * Create an Import Audience CSV file from the template.
   * Performs sub-steps 5.1–5.4:
   *   5.1 Generate test data (contactName, email, company, phone, country, salesTeam, salesperson, tags)
   *   5.2 Read the template CSV
   *   5.3 Build a new row with test data in the correct columns
   *   5.4 Save the file as CSV-Audience-copy1.csv
   * @returns the test data object including emailContact1 and outputPath
   */

  /**
   * Upload an audience CSV file via the "UPLOAD YOUR FILE" button.
   * Uses Playwright's fileChooser event to handle the OS file dialog.
   * @param filePath absolute path to the CSV file to upload
   */
  async uploadAudienceCSV(filePath: string): Promise<void> {
    const uploadBtn = this.uploadYourFileButton();
    await uploadBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      uploadBtn.click(),
    ]);
    await fileChooser.setFiles(filePath);
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Click the "IMPORT" button and wait for import to complete.
   */
  async clickImportButton(): Promise<void> {
    const btn = this.importButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Import a company audience CSV file into the current Investment record.
   * Wraps steps:
   *   1. Press "EDIT" button and wait
   *   2. Click "Audience" tab
   *   3. Click "UPLOAD YOUR FILE" button and select the given CSV file
   *   4. Press "IMPORT" button and wait
   *   5. Press "SAVE" button and wait
   *
   * @param csvFilePath - Absolute path to the audience CSV file to upload
   */
  async importCompanyAudience(csvFilePath: string): Promise<void> {
    // Step 1: Activate edit mode
    await this.clickEditButton();

    // Step 2: Click the Audience tab
    await this.clickAudienceTab();

    // Step 3–5: Upload the CSV file
    await this.uploadAudienceCSV(csvFilePath);

    // Step 6: Click IMPORT button
    await this.clickImportButton();

    // Step 7: Save the record
    await this.clickSaveButton();
  }

  async createImportAudienceFile(options?: { industry?: string; contactName?: string; email?: string; company?: string; tags?: string; createManually?: string; investmentId?: string; outputFileName?: string }): Promise<{
    contactName: string;
    emailContact1: string;
    companyName: string;
    phone: string;
    country: string;
    salesTeam: string;
    salesperson: string;
    tags: string;
    industry?: string;
    createManually?: string;
    investmentId?: string;
    outputPath: string;
  }> {
    // 5.1 Generate test data
    const timestamp = CommonUtils.generateTimestamp();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const hhmmss = `${hh}${min}${ss}`;

    const contactName  = options?.contactName !== undefined ? options.contactName : `TEST_first_name-TEST_last_name_${timestamp}`;
    const emailContact1 = options?.email ?? `Test@company${yyyy}-${mm}-${dd}${hhmmss}.com`;
    const companyName  = `TEST_company_name_${timestamp}`;
    const phone        = '1234125125';
    const country      = 'China';
    const salesTeam    = 'CMR';
    const salesperson  = 'Sergey Karachin';
    const tags         = options?.tags ?? 'test';

    console.log('  ✓ Test data variables created:');
    console.log(`    - Contact Name : ${contactName}`);
    console.log(`    - Email        : ${emailContact1}`);
    console.log(`    - Company      : ${companyName}`);
    console.log(`    - Phone        : ${phone}`);
    console.log(`    - Country      : ${country}`);
    console.log(`    - Sales Team   : ${salesTeam}`);
    console.log(`    - Salesperson  : ${salesperson}`);
    console.log(`    - Tags         : ${tags}`);
    if (options?.investmentId !== undefined) {
      console.log(`    - Investment ID : ${options.investmentId}`);
    }

    // 5.2 Read template CSV
    const templatePath = path.join(process.cwd(), 'test-data', 'investment-module', 'CSV-AudienceTemplate-1.csv');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template CSV not found at: ${templatePath}`);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const lines = templateContent.split(/\r?\n/).filter(line => line.trim() !== '');
    const headers = lines[0].split(',');

    console.log(`  ✓ Template CSV read from : ${templatePath}`);
    console.log(`  ✓ Column count           : ${headers.length}`);

    // 5.3 Build data row
    const dataMap: Record<string, string> = {
      'Contact Name' : contactName,
      'Email'        : emailContact1,
      'Company'      : companyName,
      'Phone'        : phone,
      'Country'      : country,
      'Sales Team'   : salesTeam,
      'Salesperson'  : salesperson,
      'Tags'         : tags,
      ...(options?.industry       !== undefined ? { 'Industry':        options.industry       } : {}),
      ...(options?.createManually  !== undefined ? { 'Create manually': options.createManually  } : {}),
      ...(options?.investmentId    !== undefined ? { 'Investment ID':   options.investmentId   } : {}),
    };
    const dataRow = headers.map(header => dataMap[header.trim()] ?? '');
    const newCsvContent = headers.join(',') + '\n' + dataRow.join(',') + '\n';

    console.log('  ✓ CSV data row assembled (unmapped columns left blank)');
    console.log(`    Row preview: ${dataRow.slice(0, 10).join(', ')} ...`);

    // 5.4 Save file
    const outputFileName = options?.outputFileName ?? 'CSV-Audience-copy1.csv';
    const outputPath = path.join(process.cwd(), 'test-data', 'investment-module', outputFileName);
    fs.writeFileSync(outputPath, newCsvContent, 'utf-8');

    console.log(`  ✓ CSV file saved to: ${outputPath}`);

    return { contactName, emailContact1, companyName, phone, country, salesTeam, salesperson, tags, industry: options?.industry, createManually: options?.createManually, investmentId: options?.investmentId, outputPath };
  }

  /**
   * Create an Import Audience XLS file (XLS-Audience-copy1.xls) from the template.
   * Mirrors createImportAudienceFile() but produces an XLS binary.
   */
  async createImportAudienceXLSFile(): Promise<{
    contactName: string;
    emailContact1: string;
    companyName: string;
    phone: string;
    country: string;
    salesTeam: string;
    salesperson: string;
    tags: string;
    outputPath: string;
  }> {
    // 5.1 Generate test data
    const timestamp = CommonUtils.generateTimestamp();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const hhmmss = `${hh}${min}${ss}`;

    const contactName  = `TEST_first_name-TEST_last_name_${timestamp}`;
    const emailContact1 = `Test@company${yyyy}-${mm}-${dd}${hhmmss}.com`;
    const companyName  = `TEST_company_name_${timestamp}`;
    const phone        = '1234125125';
    const country      = 'China';
    const salesTeam    = 'CMR';
    const salesperson  = 'Sergey Karachin';
    const tags         = 'test';

    console.log('  ✓ Test data variables created:');
    console.log(`    - Contact Name : ${contactName}`);
    console.log(`    - Email        : ${emailContact1}`);
    console.log(`    - Company      : ${companyName}`);
    console.log(`    - Phone        : ${phone}`);
    console.log(`    - Country      : ${country}`);
    console.log(`    - Sales Team   : ${salesTeam}`);
    console.log(`    - Salesperson  : ${salesperson}`);
    console.log(`    - Tags         : ${tags}`);

    // 5.2 Read template XLS
    const templatePath = path.join(process.cwd(), 'test-data', 'investment-module', 'XLS-AudienceTemplate-1.xls');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template XLS not found at: ${templatePath}`);
    }
    const workbook = XLSX.readFile(templatePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    console.log(`  ✓ Template XLS read from : ${templatePath}`);
    console.log(`  ✓ Sheet name             : ${sheetName}`);

    // Decode range and build header column-index map
    const ref = worksheet['!ref'];
    if (!ref) throw new Error('Template XLS sheet has no data range (!ref is missing)');
    const range = XLSX.utils.decode_range(ref);
    const headerColIndex: Record<string, number> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = worksheet[cellAddr];
      if (cell && cell.v !== undefined) {
        headerColIndex[String(cell.v).trim()] = c;
      }
    }
    console.log(`  ✓ Column count           : ${Object.keys(headerColIndex).length}`);

    // 5.3 Fill data row (row index = header row + 1)
    const dataRowIdx = range.s.r + 1;
    const dataMap: Record<string, string> = {
      'Contact Name' : contactName,
      'Email'        : emailContact1,
      'Company'      : companyName,
      'Phone'        : phone,
      'Country'      : country,
      'Sales Team'   : salesTeam,
      'Salesperson'  : salesperson,
      'Tags'         : tags,
    };
    for (const [key, value] of Object.entries(dataMap)) {
      const colIdx = headerColIndex[key];
      if (colIdx !== undefined) {
        const cellAddr = XLSX.utils.encode_cell({ r: dataRowIdx, c: colIdx });
        worksheet[cellAddr] = { v: value, t: 's' };
      }
    }
    // Extend sheet range to cover the new data row
    if (range.e.r < dataRowIdx) range.e.r = dataRowIdx;
    worksheet['!ref'] = XLSX.utils.encode_range(range);

    console.log('  ✓ XLS data row assembled');

    // 5.4 Save file
    const outputPath = path.join(process.cwd(), 'test-data', 'investment-module', 'XLS-Audience-copy1.xls');
    XLSX.writeFile(workbook, outputPath, { bookType: 'xls' });

    console.log(`  ✓ XLS file saved to: ${outputPath}`);

    return { contactName, emailContact1, companyName, phone, country, salesTeam, salesperson, tags, outputPath };
  }

  /**
   * Create an Import Audience XLSX file (XLSX-Audience-copy1.xlsx) from the template.
   * Mirrors createImportAudienceXLSFile() but produces an XLSX binary.
   */
  async createImportAudienceXLSXFile(options?: { industry?: string; email?: string; country?: string; state?: string; salesTeam?: string; salesperson?: string; phone?: string; createManually?: string; type?: string; investmentId?: string; contact?: string; company?: string; contactName?: string }): Promise<{
    contactName: string;
    emailContact1: string;
    companyName: string;
    phone: string;
    country: string;
    salesTeam: string;
    salesperson: string;
    tags: string;
    industry?: string;
    state?: string;
    investmentId?: string;
    contact?: string;
    company?: string;
    outputPath: string;
  }> {
    // 5.1 Generate test data
    const timestamp = CommonUtils.generateTimestamp();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const hhmmss = `${hh}${min}${ss}`;

    const contactName  = options?.contactName !== undefined ? options.contactName : `TEST_first_name-TEST_last_name_${timestamp}`;
    const emailContact1 = options?.email ?? `Test@company${yyyy}-${mm}-${dd}${hhmmss}.com`;
    const companyName  = `TEST_company_name_${timestamp}`;
    const phone        = options?.phone ?? '1234125125';
    const country      = options?.country ?? 'China';
    const salesTeam    = options?.salesTeam ?? 'CMR';
    const salesperson  = options?.salesperson ?? 'Sergey Karachin';
    const tags         = 'test';

    console.log('  ✓ Test data variables created:');
    console.log(`    - Contact Name : ${contactName}`);
    console.log(`    - Email        : ${emailContact1}`);
    console.log(`    - Company      : ${companyName}`);
    console.log(`    - Phone        : ${phone}`);
    console.log(`    - Country      : ${country}`);
    console.log(`    - Sales Team   : ${salesTeam}`);
    console.log(`    - Salesperson  : ${salesperson}`);
    console.log(`    - Tags         : ${tags}`);

    // 5.2 Read template XLSX
    const templatePath = path.join(process.cwd(), 'test-data', 'investment-module', 'XLSX-AudienceTemplate-1.xlsx');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template XLSX not found at: ${templatePath}`);
    }
    const workbook = XLSX.readFile(templatePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    console.log(`  ✓ Template XLSX read from : ${templatePath}`);
    console.log(`  ✓ Sheet name              : ${sheetName}`);

    // Decode range and build header column-index map
    const ref = worksheet['!ref'];
    if (!ref) throw new Error('Template XLSX sheet has no data range (!ref is missing)');
    const range = XLSX.utils.decode_range(ref);
    const headerColIndex: Record<string, number> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = worksheet[cellAddr];
      if (cell && cell.v !== undefined) {
        headerColIndex[String(cell.v).trim()] = c;
      }
    }
    console.log(`  ✓ Column count            : ${Object.keys(headerColIndex).length}`);

    // 5.3 Fill data row (row index = header row + 1)
    const dataRowIdx = range.s.r + 1;
    const dataMap: Record<string, string> = {
      'Contact Name' : contactName,
      'Email'        : emailContact1,
      'Company'      : companyName,
      'Phone'        : phone,
      'Country'      : country,
      'Sales Team'   : salesTeam,
      'Salesperson'  : salesperson,
      'Tags'         : tags,
      ...(options?.industry       !== undefined ? { 'Industry':        options.industry      } : {}),
      ...(options?.state          !== undefined ? { 'State':           options.state         } : {}),
      ...(options?.createManually !== undefined ? { 'Create manually': options.createManually } : {}),
      ...(options?.type           !== undefined ? { 'Type':            options.type          } : {}),
      ...(options?.investmentId   !== undefined ? { 'Investment ID':   options.investmentId  } : {}),
      ...(options?.contact        !== undefined ? { 'Contact':         options.contact       } : {}),
      ...(options?.company        !== undefined ? { 'Company':         options.company       } : {}),
    };
    for (const [key, value] of Object.entries(dataMap)) {
      const colIdx = headerColIndex[key];
      if (colIdx !== undefined) {
        const cellAddr = XLSX.utils.encode_cell({ r: dataRowIdx, c: colIdx });
        if (value === '') {
          delete worksheet[cellAddr]; // Remove cell to make it truly blank
        } else {
          worksheet[cellAddr] = { v: value, t: 's' };
        }
      }
    }
    // Extend sheet range to cover the new data row
    if (range.e.r < dataRowIdx) range.e.r = dataRowIdx;
    worksheet['!ref'] = XLSX.utils.encode_range(range);

    if (options?.createManually !== undefined) {
      console.log(`    - Create manually (override): ${options.createManually}`);
    }
    if (options?.type !== undefined) {
      console.log(`    - Type (override)            : ${options.type}`);
    }
    if (options?.salesTeam !== undefined) {
      console.log(`    - Sales Team (override)  : ${options.salesTeam}`);
    }
    if (options?.salesperson !== undefined) {
      console.log(`    - Salesperson (override) : ${options.salesperson}`);
    }
    if (options?.phone !== undefined) {
      console.log(`    - Phone (override)       : ${options.phone}`);
    }
    if (options?.email !== undefined) {
      console.log(`    - Email (override)   : ${options.email}`);
    }
    if (options?.country !== undefined) {
      console.log(`    - Country (override) : ${options.country}`);
    }
    if (options?.state !== undefined) {
      console.log(`    - State (override)   : ${options.state}`);
    }
    if (options?.industry !== undefined) {
      console.log(`    - Industry (override): ${options.industry}`);
    }
    if (options?.investmentId !== undefined) {
      console.log(`    - Investment ID (override): ${options.investmentId || '(blank)'}`);
    }
    if (options?.contact !== undefined) {
      console.log(`    - Contact (override)      : ${options.contact || '(blank)'}`);
    }
    if (options?.company !== undefined) {
      console.log(`    - Company (override)      : ${options.company || '(blank)'}`);
    }
    console.log('  ✓ XLSX data row assembled');

    // 5.4 Save file
    const outputPath = path.join(process.cwd(), 'test-data', 'investment-module', 'XLSX-Audience-copy1.xlsx');
    XLSX.writeFile(workbook, outputPath, { bookType: 'xlsx' });

    console.log(`  ✓ XLSX file saved to: ${outputPath}`);

    return { contactName, emailContact1, companyName, phone, country, salesTeam, salesperson, tags, industry: options?.industry, state: options?.state, investmentId: options?.investmentId, contact: options?.contact, company: options?.company, outputPath };
  }

  /**
   * Verify Investment Name field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyInvestmentNameField(): Promise<boolean> {
    try {
      const investmentNameField = this.investmentNameInput();
      
      // Wait for field to be visible
      await investmentNameField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's an input element
      const tagName = await investmentNameField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Field is not an input element, got: ${tagName}`);
        return false;
      }
      
      // Verify it's a text type input
      const inputType = await investmentNameField.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ Input type is not text, got: ${inputType}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Investment Name field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Investment ID field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyInvestmentIDField(): Promise<boolean> {
    try {
      const investmentIDField = this.investmentIDInput();
      
      // Wait for field to be visible
      await investmentIDField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's an input element
      const tagName = await investmentIDField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Field is not an input element, got: ${tagName}`);
        return false;
      }
      
      // Verify it's a text type input
      const inputType = await investmentIDField.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ Input type is not text, got: ${inputType}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Investment ID field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Channel field exists and is a combobox/dropdown
   * @returns true if field exists and is a combobox, false otherwise
   */
  async verifyChannelField(): Promise<boolean> {
    try {
      // Target the stable outer div — the inner input is only rendered when focused
      const outerDiv = this.page.locator('xpath=//div[contains(@name, "channel_id")]').first();

      await outerDiv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const classList = await outerDiv.getAttribute('class');
      const isCombobox = classList && (
        classList.includes('o_field_many2one') ||
        classList.includes('o_field_widget') ||
        classList.includes('many2one')
      );

      if (!isCombobox) {
        console.log(`  ⚠️ Channel field does not appear to be a combobox, classes: ${classList}`);
        return false;
      }

      console.log('  ✓ Channel field is a combobox/input element');
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Channel field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Countries field exists and is a combobox/dropdown
   * @returns true if field exists and is a combobox, false otherwise
   */
  async verifyCountriesField(): Promise<boolean> {
    try {
      const countriesFieldElement = this.countriesField();
      
      // Wait for field to be visible
      await countriesFieldElement.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Check if it's a select element or a div acting as a combobox
      const tagName = await countriesFieldElement.evaluate(el => el.tagName.toLowerCase());
      
      if (tagName === 'select') {
        // It's a native select dropdown
        console.log('  ✓ Countries field is a native select element');
        return true;
      } else if (tagName === 'div') {
        // Check if it has combobox-related classes or attributes
        const hasComboboxClass = await countriesFieldElement.evaluate(el => {
          const classList = el.className || '';
          const role = el.getAttribute('role') || '';
          return classList.includes('o_field_many2one') || 
                 classList.includes('o_field_selection') ||
                 classList.includes('o_field_many2many') ||
                 classList.includes('dropdown') ||
                 classList.includes('select') ||
                 role === 'combobox' ||
                 el.querySelector('input') !== null;
        });
        
        if (hasComboboxClass) {
          console.log('  ✓ Countries field is a combobox/dropdown element');
          return true;
        }
      }
      
      console.log(`  ⚠️ Countries field is not a combobox, tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Countries field: ${error}`);
      return false;
    }
  }

  /**
   * Verify JIRA ID field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyJiraIDField(): Promise<boolean> {
    try {
      const jiraIDField = this.jiraIDInput();
      
      // Wait for field to be visible
      await jiraIDField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's an input element
      const tagName = await jiraIDField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Field is not an input element, got: ${tagName}`);
        return false;
      }
      
      // Verify it's a text type input
      const inputType = await jiraIDField.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ Input type is not text, got: ${inputType}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying JIRA ID field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Date start field exists and is a calendar/date input
   * @returns true if field exists and is a date input, false otherwise
   */
  async verifyDateStartField(): Promise<boolean> {
    try {
      const dateStartField = this.dateStartField();
      
      // Wait for field to be visible
      await dateStartField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's an input element
      const tagName = await dateStartField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Field is not an input element, got: ${tagName}`);
        return false;
      }
      
      // Verify it's a date type input or has datepicker classes
      const inputType = await dateStartField.getAttribute('type');
      const classList = await dateStartField.getAttribute('class');
      
      const isDateInput = inputType === 'date' || inputType === 'text';
      const hasDatepickerClass = classList && (classList.includes('datepicker') || classList.includes('o_datepicker') || classList.includes('date'));
      
      if (!isDateInput && !hasDatepickerClass) {
        console.log(`  ⚠️ Input is not a date/calendar field, type: ${inputType}, classes: ${classList}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Date start field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Date end field exists and is a calendar/date input
   * @returns true if field exists and is a date input, false otherwise
   */
  async verifyDateEndField(): Promise<boolean> {
    try {
      const dateEndField = this.dateEndField();
      
      // Wait for field to be visible
      await dateEndField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's an input element
      const tagName = await dateEndField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Field is not an input element, got: ${tagName}`);
        return false;
      }
      
      // Verify it's a date type input or has datepicker classes
      const inputType = await dateEndField.getAttribute('type');
      const classList = await dateEndField.getAttribute('class');
      
      const isDateInput = inputType === 'date' || inputType === 'text';
      const hasDatepickerClass = classList && (classList.includes('datepicker') || classList.includes('o_datepicker') || classList.includes('date'));
      
      if (!isDateInput && !hasDatepickerClass) {
        console.log(`  ⚠️ Input is not a date/calendar field, type: ${inputType}, classes: ${classList}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Date end field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Responsible - Sales field exists and is a combobox
   * @returns true if field exists and is a combobox (many2one), false otherwise
   */
  async verifyResponsibleSalesField(): Promise<boolean> {
    try {
      // Target the stable outer div — the inner input is only rendered when focused
      const outerDiv = this.page.locator('xpath=//div[contains(@name, "user_sales_id")]').first();

      await outerDiv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a many2one/combobox div
      const classList = await outerDiv.getAttribute('class');
      const isCombobox = classList && (
        classList.includes('o_field_many2one') ||
        classList.includes('o_field_widget') ||
        classList.includes('many2one')
      );

      if (!isCombobox) {
        console.log(`  ⚠️ Field does not appear to be a combobox, classes: ${classList}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Responsible - Sales field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Responsible - Marketing field exists and is a combobox
   * @returns true if field exists and is a combobox (many2one), false otherwise
   */
  async verifyResponsibleMarketingField(): Promise<boolean> {
    try {
      // Target the stable outer div — the inner input is only rendered when focused
      const outerDiv = this.page.locator('xpath=//div[contains(@name, "user_marketing_id")]').first();

      await outerDiv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const classList = await outerDiv.getAttribute('class');
      const isCombobox = classList && (
        classList.includes('o_field_many2one') ||
        classList.includes('o_field_widget') ||
        classList.includes('many2one')
      );

      if (!isCombobox) {
        console.log(`  ⚠️ Field does not appear to be a combobox, classes: ${classList}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Responsible - Marketing field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Completion Events field exists and is a multiple selections field
   * @returns true if field exists and is a many2many/multi-select, false otherwise
   */
  async verifyCompletionEventsField(): Promise<boolean> {
    try {
      // Target the stable outer div — the inner input is only rendered when focused
      const outerDiv = this.page.locator('xpath=//div[contains(@name, "completion_events")]').first();

      await outerDiv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const classList = await outerDiv.getAttribute('class');
      const isMultiSelect = classList && (
        classList.includes('o_field_many2many') ||
        classList.includes('o_field_many2many_tags') ||
        classList.includes('o_field_widget') ||
        classList.includes('many2many')
      );

      if (!isMultiSelect) {
        console.log(`  ⚠️ Field does not appear to be a multiple selections field, classes: ${classList}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Completion Events field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Conversion Events field exists and is a multiple selections field
   * @returns true if field exists and is a many2many/multi-select, false otherwise
   */
  async verifyConversionEventsField(): Promise<boolean> {
    try {
      // Target the stable outer div — the inner input is only rendered when focused
      const outerDiv = this.page.locator('xpath=//div[contains(@name, "conversion_events")]').first();

      await outerDiv.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const classList = await outerDiv.getAttribute('class');
      const isMultiSelect = classList && (
        classList.includes('o_field_many2many') ||
        classList.includes('o_field_many2many_tags') ||
        classList.includes('o_field_widget') ||
        classList.includes('many2many')
      );

      if (!isMultiSelect) {
        console.log(`  ⚠️ Field does not appear to be a multiple selections field, classes: ${classList}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Conversion Events field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Track conversion date start field exists and is a Calendar (date input) field
   * @returns true if field exists and is a date input, false otherwise
   */
  async verifyTrackConversionDateStartField(): Promise<boolean> {
    try {
      const trackConversionDateStartField = this.trackConversionDateStartField();
      
      // Wait for field to be visible
      await trackConversionDateStartField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's a date input (calendar field)
      const tagName = await trackConversionDateStartField.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await trackConversionDateStartField.getAttribute('type');
      const classList = await trackConversionDateStartField.getAttribute('class');
      
      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDateClass = classList && (
        classList.includes('o_datepicker') ||
        classList.includes('o_field_date') ||
        classList.includes('datepicker') ||
        classList.includes('o_input')
      );
      
      if (!isInput || (!isDateType && !hasDateClass)) {
        console.log(`  ⚠️ Field does not appear to be a Calendar field, tag: ${tagName}, type: ${inputType}, classes: ${classList}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Track conversion date start field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Track conversion date end field exists and is a Calendar (date input) field
   * @returns true if field exists and is a date input, false otherwise
   */
  /**
   * Click the ROI tab on the Investment record form
   */
  async clickROITab(): Promise<void> {
    await this.roiTab().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.roiTab().click();
    await this.wait(2000);
  }

  /**
   * Verify Revenue-Planned field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyRevenuePlannedField(): Promise<boolean> {
    try {
      const revenuePlannedField = this.revenuePlannedField();

      // Wait for field to be visible
      await revenuePlannedField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's an input element
      const tagName = await revenuePlannedField.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ Revenue-Planned field is not an input element, got: ${tagName}`);
        return false;
      }

      // Verify it's a text type input
      const inputType = await revenuePlannedField.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ Revenue-Planned input type is not text, got: ${inputType}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Revenue-Planned field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Expenses-Planned field exists and is a read-only field
   * @returns true if field exists and is read-only, false otherwise
   */
  async verifyExpensesPlannedField(): Promise<boolean> {
    try {
      const expensesPlannedField = this.expensesPlannedField();

      // Wait for field to be visible
      await expensesPlannedField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await expensesPlannedField.evaluate(el => el.tagName.toLowerCase());

      // A span element is inherently read-only
      if (tagName === 'span' || tagName === 'div') {
        console.log(`  ✓ Expenses-Planned field is a read-only ${tagName} element`);
        return true;
      }

      if (tagName === 'input') {
        // Check for readonly attribute
        const isReadonly = await expensesPlannedField.evaluate(el =>
          (el as HTMLInputElement).readOnly ||
          el.hasAttribute('readonly') ||
          el.getAttribute('aria-readonly') === 'true'
        );
        if (isReadonly) {
          console.log('  ✓ Expenses-Planned input field has readonly attribute');
          return true;
        }
        // Check for readonly via CSS class on the field or its parent
        const hasReadonlyClass = await expensesPlannedField.evaluate(el => {
          const parent = el.closest('[class]');
          const classes = (el.className + ' ' + (parent?.className || ''));
          return classes.includes('o_readonly') || classes.includes('o_field_readonly');
        });
        if (hasReadonlyClass) {
          console.log('  ✓ Expenses-Planned field has readonly CSS class');
          return true;
        }
        console.log('  ⚠️ Expenses-Planned input field is not read-only');
        return false;
      }

      console.log(`  ⚠️ Expenses-Planned field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Expenses-Planned field: ${error}`);
      return false;
    }
  }

  /**
   * Verify ROI-Planned field exists and is a read-only field
   * @returns true if field exists and is read-only, false otherwise
   */
  async verifyROIPlannedField(): Promise<boolean> {
    try {
      const roiPlannedField = this.roiPlannedField();

      // Wait for field to be visible
      await roiPlannedField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await roiPlannedField.evaluate(el => el.tagName.toLowerCase());

      // A span or div element is inherently read-only
      if (tagName === 'span' || tagName === 'div') {
        console.log(`  ✓ ROI-Planned field is a read-only ${tagName} element`);
        return true;
      }

      if (tagName === 'input') {
        // Check for readonly attribute
        const isReadonly = await roiPlannedField.evaluate(el =>
          (el as HTMLInputElement).readOnly ||
          el.hasAttribute('readonly') ||
          el.getAttribute('aria-readonly') === 'true'
        );
        if (isReadonly) {
          console.log('  ✓ ROI-Planned input field has readonly attribute');
          return true;
        }
        // Check for readonly via CSS class on the field or its parent
        const hasReadonlyClass = await roiPlannedField.evaluate(el => {
          const parent = el.closest('[class]');
          const classes = (el.className + ' ' + (parent?.className || ''));
          return classes.includes('o_readonly') || classes.includes('o_field_readonly');
        });
        if (hasReadonlyClass) {
          console.log('  ✓ ROI-Planned field has readonly CSS class');
          return true;
        }
        console.log('  ⚠️ ROI-Planned input field is not read-only');
        return false;
      }

      console.log(`  ⚠️ ROI-Planned field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying ROI-Planned field: ${error}`);
      return false;
    }
  }

  /**
   * Verify New company contacts-Planned field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyNewCompanyContactsPlannedField(): Promise<boolean> {
    try {
      const field = this.newCompanyContactsPlannedField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's an input element
      const tagName = await field.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ New company contacts-Planned field is not an input element, got: ${tagName}`);
        return false;
      }

      // Verify it's a text type input
      const inputType = await field.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ New company contacts-Planned input type is not text, got: ${inputType}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying New company contacts-Planned field: ${error}`);
      return false;
    }
  }

  /**
   * Verify EU Quotations-Planned field exists and is a text input
   * @returns true if field exists and is a text input, false otherwise
   */
  async verifyEUQuotationsPlannedField(): Promise<boolean> {
    try {
      const field = this.euQuotationsPlannedField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's an input element
      const tagName = await field.evaluate(el => el.tagName.toLowerCase());
      if (tagName !== 'input') {
        console.log(`  ⚠️ EU Quotations-Planned field is not an input element, got: ${tagName}`);
        return false;
      }

      // Verify it's a text type input
      const inputType = await field.getAttribute('type');
      if (inputType && inputType !== 'text') {
        console.log(`  ⚠️ EU Quotations-Planned input type is not text, got: ${inputType}`);
        return false;
      }

      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying EU Quotations-Planned field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Actual-Revenue field exists and is a read-only field
   * @returns true if field exists and is read-only, false otherwise
   */
  async verifyActualRevenueField(): Promise<boolean> {
    try {
      const field = this.revenueActualField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await field.evaluate(el => el.tagName.toLowerCase());

      // A span or div element is inherently read-only
      if (tagName === 'span' || tagName === 'div') {
        console.log(`  ✓ Actual-Revenue field is a read-only ${tagName} element`);
        return true;
      }

      if (tagName === 'input') {
        const isReadonly = await field.evaluate(el =>
          (el as HTMLInputElement).readOnly ||
          el.hasAttribute('readonly') ||
          el.getAttribute('aria-readonly') === 'true'
        );
        if (isReadonly) {
          console.log('  ✓ Actual-Revenue input field has readonly attribute');
          return true;
        }
        const hasReadonlyClass = await field.evaluate(el => {
          const parent = el.closest('[class]');
          const classes = (el.className + ' ' + (parent?.className || ''));
          return classes.includes('o_readonly') || classes.includes('o_field_readonly');
        });
        if (hasReadonlyClass) {
          console.log('  ✓ Actual-Revenue field has readonly CSS class');
          return true;
        }
        console.log('  ⚠️ Actual-Revenue input field is not read-only');
        return false;
      }

      console.log(`  ⚠️ Actual-Revenue field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Actual-Revenue field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Actual 6M-Revenue field exists and is a read-only field
   * @returns true if field exists and is read-only, false otherwise
   */
  async verifyActual6MRevenueField(): Promise<boolean> {
    try {
      const field = this.revenueActual6MField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await field.evaluate(el => el.tagName.toLowerCase());

      // A span or div element is inherently read-only
      if (tagName === 'span' || tagName === 'div') {
        console.log(`  ✓ Actual 6M-Revenue field is a read-only ${tagName} element`);
        return true;
      }

      if (tagName === 'input') {
        const isReadonly = await field.evaluate(el =>
          (el as HTMLInputElement).readOnly ||
          el.hasAttribute('readonly') ||
          el.getAttribute('aria-readonly') === 'true'
        );
        if (isReadonly) {
          console.log('  ✓ Actual 6M-Revenue input field has readonly attribute');
          return true;
        }
        const hasReadonlyClass = await field.evaluate(el => {
          const parent = el.closest('[class]');
          const classes = (el.className + ' ' + (parent?.className || ''));
          return classes.includes('o_readonly') || classes.includes('o_field_readonly');
        });
        if (hasReadonlyClass) {
          console.log('  ✓ Actual 6M-Revenue field has readonly CSS class');
          return true;
        }
        console.log('  ⚠️ Actual 6M-Revenue input field is not read-only');
        return false;
      }

      console.log(`  ⚠️ Actual 6M-Revenue field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Actual 6M-Revenue field: ${error}`);
      return false;
    }
  }

  /**
   * Verify Actual 3M-Revenue field exists and is a read-only field
   * @returns true if field exists and is read-only, false otherwise
   */
  async verifyActual3MRevenueField(): Promise<boolean> {
    try {
      const field = this.revenueActual3MField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await field.evaluate(el => el.tagName.toLowerCase());

      // A span or div element is inherently read-only
      if (tagName === 'span' || tagName === 'div') {
        console.log(`  ✓ Actual 3M-Revenue field is a read-only ${tagName} element`);
        return true;
      }

      if (tagName === 'input') {
        const isReadonly = await field.evaluate(el =>
          (el as HTMLInputElement).readOnly ||
          el.hasAttribute('readonly') ||
          el.getAttribute('aria-readonly') === 'true'
        );
        if (isReadonly) {
          console.log('  ✓ Actual 3M-Revenue input field has readonly attribute');
          return true;
        }
        const hasReadonlyClass = await field.evaluate(el => {
          const parent = el.closest('[class]');
          const classes = (el.className + ' ' + (parent?.className || ''));
          return classes.includes('o_readonly') || classes.includes('o_field_readonly');
        });
        if (hasReadonlyClass) {
          console.log('  ✓ Actual 3M-Revenue field has readonly CSS class');
          return true;
        }
        console.log('  ⚠️ Actual 3M-Revenue input field is not read-only');
        return false;
      }

      console.log(`  ⚠️ Actual 3M-Revenue field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Actual 3M-Revenue field: ${error}`);
      return false;
    }
  }

  async clickPlannedExpensesTab(): Promise<void> {
    await this.plannedExpensesTab().click();
    await this.page.waitForTimeout(2000);
  }

  async clickAddALine(): Promise<void> {
    await this.addALineLink().click();
    await this.page.waitForTimeout(2000);
  }
  async actualExpenses_clickAddALine(): Promise<void> {
    await this.actualExpenses_addALineLink().click();
    await this.page.waitForTimeout(2000);
  }

  async clickPlannedExpensesDateField(): Promise<void> {
    await this.plannedExpensesDateField().click();
    await this.page.waitForTimeout(1000);
  }

  async clickPlannedExpensesDescriptionField(): Promise<void> {
    await this.plannedExpensesDescriptionField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyPlannedExpensesDateField(): Promise<boolean> {
    try {
      const field = this.plannedExpensesDateField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a date/calendar input
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');
      const classList = await field.getAttribute('class');

      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDateClass = classList && (
        classList.includes('o_datepicker_input') ||
        classList.includes('o_field_date') ||
        classList.includes('datepicker')
      );

      if (!isInput) {
        console.log(`  ⚠️ Date field has unexpected tag: ${tagName}`);
        return false;
      }

      if (isDateType || hasDateClass) {
        console.log(`  ✓ Date field is a calendar/date input (type=${inputType}, class=${classList})`);
        return true;
      }

      console.log(`  ⚠️ Date field type unexpected: type=${inputType}, class=${classList}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Date field: ${error}`);
      return false;
    }
  }

  async verifyPlannedExpensesDescriptionField(): Promise<boolean> {
    try {
      const field = this.plannedExpensesDescriptionField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a text input or textarea
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      // textarea is inherently a text field
      if (tagName === 'textarea') {
        console.log(`  ✓ Description field is a textarea (text field)`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isTextType = inputType === 'text' || inputType === null;
        if (isTextType) {
          console.log(`  ✓ Description field is a text input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Description field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Description field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Description field: ${error}`);
      return false;
    }
  }

  async clickPlannedExpensesTypeField(): Promise<void> {
    await this.plannedExpensesTypeField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyPlannedExpensesTypeField(): Promise<boolean> {
    try {
      const field = this.actualExpensesTypeField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a text input (Many2one fields render as input[type="text"])
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isTextType = inputType === 'text' || inputType === null;
        if (isTextType) {
          console.log(`  ✓ Type field is a text input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Type field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Type field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Type field: ${error}`);
      return false;
    }
  }

  async clickPlannedExpensesAmountField(): Promise<void> {
    await this.plannedExpensesAmountField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyPlannedExpensesAmountField(): Promise<boolean> {
    try {
      const field = this.plannedExpensesAmountField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a numeric input (monetary/float fields render as input[type="number"] or input[type="text"] in Odoo)
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isNumberType = inputType === 'number' || inputType === 'text' || inputType === null;
        if (isNumberType) {
          console.log(`  ✓ Amount field is a number input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Amount field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Amount field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Amount field: ${error}`);
      return false;
    }
  }

  async clickPlannedExpensesICField(): Promise<void> {
    await this.plannedExpensesICField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyPlannedExpensesICField(): Promise<boolean> {
    try {
      const field = this.plannedExpensesICField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a date/calendar input
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');
      const classList = await field.getAttribute('class');

      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDateClass = classList && (
        classList.includes('o_datepicker_input') ||
        classList.includes('o_field_date') ||
        classList.includes('datepicker')
      );

      if (!isInput) {
        console.log(`  ⚠️ IC field has unexpected tag: ${tagName}`);
        return false;
      }

      if (isDateType || hasDateClass) {
        console.log(`  ✓ IC field is a calendar/date input (type=${inputType}, class=${classList})`);
        return true;
      }

      console.log(`  ⚠️ IC field type unexpected: type=${inputType}, class=${classList}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying IC field: ${error}`);
      return false;
    }
  }

  async clickActualExpensesTab(): Promise<void> {
    await this.actualExpensesTab().click();
    await this.page.waitForTimeout(2000);
  }

  async clickActualExpensesDateField(): Promise<void> {
    await this.actualExpensesDateField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyActualExpensesDateField(): Promise<boolean> {
    try {
      const field = this.actualExpensesDateField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a date/calendar input
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');
      const classList = await field.getAttribute('class');

      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDateClass = classList && (
        classList.includes('o_datepicker_input') ||
        classList.includes('o_field_date') ||
        classList.includes('datepicker')
      );

      if (!isInput) {
        console.log(`  ⚠️ Date field has unexpected tag: ${tagName}`);
        return false;
      }

      if (isDateType || hasDateClass) {
        console.log(`  ✓ Date field is a calendar/date input (type=${inputType}, class=${classList})`);
        return true;
      }

      console.log(`  ⚠️ Date field type unexpected: type=${inputType}, class=${classList}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Date field: ${error}`);
      return false;
    }
  }

  async clickActualExpensesDescriptionField(): Promise<void> {
    await this.actualExpensesDescriptionField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyActualExpensesDescriptionField(): Promise<boolean> {
    try {
      const field = this.actualExpensesDescriptionField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a text input or textarea
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      // textarea is inherently a text field
      if (tagName === 'textarea') {
        console.log(`  ✓ Description field is a textarea (text field)`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isTextType = inputType === 'text' || inputType === null;
        if (isTextType) {
          console.log(`  ✓ Description field is a text input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Description field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Description field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Description field: ${error}`);
      return false;
    }
  }

  async clickActualExpensesAmountField(): Promise<void> {
    await this.actualExpensesAmountField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyActualExpensesAmountField(): Promise<boolean> {
    try {
      const field = this.actualExpensesAmountField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a numeric input (monetary/float fields render as input[type="number"] or input[type="text"] in Odoo)
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isNumberType = inputType === 'number' || inputType === 'text' || inputType === null;
        if (isNumberType) {
          console.log(`  ✓ Amount field is a number input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Amount field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Amount field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Amount field: ${error}`);
      return false;
    }
  }

  async clickActualExpensesBillNumberField(): Promise<void> {
    await this.actualExpensesBillNumberField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyActualExpensesBillNumberField(): Promise<boolean> {
    try {
      const field = this.actualExpensesBillNumberField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Verify it's a text input
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'textarea') {
        console.log(`  ✓ Bill # field is a textarea (text field)`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const isTextType = inputType === 'text' || inputType === null;
        if (isTextType) {
          console.log(`  ✓ Bill # field is a text input (type=${inputType})`);
          return true;
        }
        console.log(`  ⚠️ Bill # field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Bill # field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Bill # field: ${error}`);
      return false;
    }
  }

  async clickActualExpensesICField(): Promise<void> {
    await this.actualExpensesICField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyActualExpensesICField(): Promise<boolean> {
    try {
      const field = this.actualExpensesICField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // IC is a Many2one (combobox) field — renders as input[type="text"] with dropdown
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        console.log(`  ✓ IC field is a select (combobox) element`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const classList = await field.getAttribute('class');
        const isTextType = inputType === 'text' || inputType === null;
        const hasComboClass = classList && (
          classList.includes('o_field_many2one') ||
          classList.includes('o_many2one') ||
          classList.includes('o_input')
        );
        if (isTextType || hasComboClass) {
          console.log(`  ✓ IC field is a combobox input (type=${inputType}, class=${classList})`);
          return true;
        }
        console.log(`  ⚠️ IC field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ IC field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying IC field: ${error}`);
      return false;
    }
  }

  async clickAudienceTab(): Promise<void> {
    await this.audienceTab().click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Click the "Download template" hyperlink in the Audience tab and save the downloaded file.
   * Uses Playwright's download event interception — no browser UI interaction needed.
   * @param saveDir - Directory to save the downloaded file
   * @returns Absolute path to the saved file
   */
  async downloadAudienceTemplate(saveDir: string): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadTemplateLink().click(),
    ]);
    const suggestedFilename = download.suggestedFilename();
    const savePath = path.join(saveDir, suggestedFilename);
    await download.saveAs(savePath);
    console.log(`  ✓ Template downloaded to: ${savePath}`);
    return savePath;
  }

  /**
   * Read the first row (header row) of the first sheet in a downloaded XLSX/XLS file.
   * @param filePath - Absolute path to the xlsx file
   * @returns Array of column header strings (trimmed)
   */
  getXlsxColumnHeaders(filePath: string): string[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    if (!ref) return [];
    const range = XLSX.utils.decode_range(ref);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c });
      const cell = sheet[cellAddr];
      if (cell) headers.push(String(cell.v ?? '').trim());
    }
    return headers;
  }

  /**
   * Get the text of the first data row cell in the Audience table by column header label.
   * Scans <thead> cells for a case-insensitive match, then returns matching <tbody> first row cell text.
   * Skips cells whose innerText spans multiple lines (container/layout cells).
   * @param columnHeader - The visible column header text (e.g. "Contact ID", "Email", "Company")
   */
  async getAudienceFirstRowCellText(columnHeader: string): Promise<string> {
    await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });

    // Wait until the target table has at least one non-header row
    await this.page.waitForFunction((header: string): boolean => {
      const normalizeHeader = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const tables = Array.from(document.querySelectorAll('table'));
      for (const table of tables) {
        const colIndex = Array.from(table.querySelectorAll('thead th, thead td')).findIndex((th) => {
          const text = (th as HTMLElement).innerText ?? th.textContent ?? '';
          return normalizeHeader(text) === normalizeHeader(header);
        });
        if (colIndex === -1) continue;
        const nonHeadTrs = Array.from(table.querySelectorAll('tr')).filter(row => !row.closest('thead'));
        if (nonHeadTrs.length > 0) return true;
      }
      return false;
    }, columnHeader, { timeout: 30000 });

    const cellText = await this.page.evaluate((header: string): string | null => {
      const normalizeHeader = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const tables = Array.from(document.querySelectorAll('table'));
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        const colIndex = headerCells.findIndex((th) => {
          const text = (th as HTMLElement).innerText ?? th.textContent ?? '';
          return normalizeHeader(text) === normalizeHeader(header);
        });
        if (colIndex === -1) continue;

        // Include rows directly in table (without tbody) as well
        const nonHeadTrs = Array.from(table.querySelectorAll('tr')).filter(row => !row.closest('thead'));
        for (const row of nonHeadTrs) {
          // Skip container/wrapper rows where cell[0] holds concatenated column names (multi-line)
          const firstCell = row.querySelectorAll('td')[0];
          if (firstCell) {
            const firstCellText = (firstCell.innerText ?? firstCell.textContent ?? '').trim();
            if (firstCellText.includes('\n')) continue;
          }

          const cell = row.querySelectorAll('td')[colIndex];
          if (!cell) continue;
          return (cell.innerText ?? cell.textContent ?? '').trim();
        }
      }
      return null;
    }, columnHeader);

    if (cellText === null) {
      throw new Error(`Audience table column header "${columnHeader}" not found in any table`);
    }

    return cellText;
  }

  /**
   * Click the "Leads" tab on the Investment record.
   */
  async clickLeadsTab(): Promise<void> {
    const tab = this.leadsTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Get the text of the first data row cell in the Leads table by column header label.
   * Scans <thead> cells for a case-insensitive match, then returns matching <tbody> first row cell text.
   * @param columnHeader - The visible column header text (e.g. "Opportunity", "Email", "Sales Team", "Salesperson")
   */
  async getLeadsFirstRowCellText(columnHeader: string): Promise<string> {
    // Wait for at least one table to be present, then do all DOM work in a single evaluate call
    await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });
    await this.page.waitForTimeout(1000);

    const cellText = await this.page.evaluate((header: string): string | null => {
      const tables = Array.from(document.querySelectorAll('table'));
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        const colIndex = headerCells.findIndex(
          (th) => (th.textContent ?? '').trim().toLowerCase() === header.toLowerCase()
        );
        if (colIndex === -1) continue;
        const firstRow = table.querySelector('tbody tr');
        if (!firstRow) continue;
        const cell = firstRow.querySelectorAll('td')[colIndex];
        if (!cell) continue;
        return (cell.innerText ?? cell.textContent ?? '').trim();
      }
      return null;
    }, columnHeader);

    if (cellText === null) {
      throw new Error(`Leads table column header "${columnHeader}" not found in any table`);
    }

    return cellText;
  }

  async clickQuotesTab(): Promise<void> {
    const tab = this.quotesTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  async clickInvoicesTab(): Promise<void> {
    const tab = this.invoicesTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
  }

  /**
   * Get the text of the first data row cell in the Quotes table by column header label.
   * Scans <thead> cells for a case-insensitive match, then returns matching <tbody> first row cell text.
   * @param columnHeader - The visible column header text (e.g. "Quotation Number", "Status")
   */
  async getQuotesFirstRowCellText(columnHeader: string): Promise<string> {
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL_MS = 3000;

    const tryRead = async (): Promise<string | null> => {
      await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });
      await this.page.waitForTimeout(1000);

      return this.page.evaluate((col: string): string | null => {
        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
          const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
          const colIndex = headerCells.findIndex(
            (th) => (th.textContent ?? '').trim().toLowerCase() === col.toLowerCase()
          );
          if (colIndex === -1) continue;
          const firstRow = table.querySelector('tbody tr');
          if (!firstRow) continue;
          const cell = firstRow.querySelectorAll('td')[colIndex];
          if (!cell) continue;
          const text = ((cell as HTMLElement).innerText ?? cell.textContent ?? '').trim();
          return text.length > 0 ? text : null;
        }
        return null;
      }, columnHeader);
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const cellText = await tryRead();
      if (cellText !== null) {
        if (attempt > 1) {
          console.log(`  ✓ Got value for "${columnHeader}" on attempt ${attempt}: "${cellText}"`);
        }
        return cellText;
      }
      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠ Attempt ${attempt}/${MAX_RETRIES}: "${columnHeader}" not found or empty — retrying in ${RETRY_INTERVAL_MS / 1000}s...`);
        await this.page.waitForTimeout(RETRY_INTERVAL_MS);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(1000);
      }
    }

    throw new Error(`Quotes table column header "${columnHeader}" not found in any table after ${MAX_RETRIES} attempts`);
  }

  /**
   * Get the text of the first data row cell in the Invoices table by column header label.
   * Retries up to 5 times every 3 seconds with page reload if value is not found.
   * @param columnHeader - The visible column header text (e.g. "Number", "Status")
   */
  /**
   * @param columnHeader  - The visible column header text (e.g. "Number", "Sales Team")
   * @param expectedValue - Optional. When provided, the method retries+reloads only when
   *                        actual !== expected. Without it, retries only when column is not found.
   */
  async getInvoicesFirstRowCellText(columnHeader: string, expectedValue?: string): Promise<string> {
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL_MS = 10000;

    const tryRead = async (): Promise<string | null> => {
      await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });
      await this.page.waitForTimeout(1000);

      const result = await this.page.evaluate((col: string): { text: string | null; xpath: string | null } => {
        // Only search inside the active tab pane to avoid matching same-named columns in hidden tabs
        const activePane = document.querySelector('div.tab-pane.active.show') ?? document;
        const tables = Array.from(activePane.querySelectorAll('table'));
        for (let tIdx = 0; tIdx < tables.length; tIdx++) {
          const table = tables[tIdx];
          const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
          const colIndex = headerCells.findIndex(
            (th) => (th.textContent ?? '').trim().toLowerCase() === col.toLowerCase()
          );
          if (colIndex === -1) continue;
          const firstRow = table.querySelector('tbody tr');
          if (!firstRow) continue;
          const cell = firstRow.querySelectorAll('td')[colIndex];
          if (!cell) continue;
          const text = ((cell as HTMLElement).innerText ?? cell.textContent ?? '').trim();
          // Compute absolute table index for XPath (relative to document)
          const allTables = Array.from(document.querySelectorAll('table'));
          const absIdx = allTables.indexOf(table) + 1;
          const xpath = `(//table)[${absIdx}]//tbody//tr[1]//td[${colIndex + 1}]`;
          // Return '' for a blank cell — only null means "not found yet" (triggers retry)
          return { text, xpath };
        }
        return { text: null, xpath: null };
      }, columnHeader);

      if (result.xpath) {
        console.log(`  🔍 [Invoices] XPath: ${result.xpath}  →  value: "${result.text ?? ''}"`);
      }
      return result.text;
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const cellText = await tryRead();

      // Decide whether to accept this reading
      const notFound = cellText === null;
      // If expected is blank (''), treat "not found" the same as blank — both mean no value present
      const expectingBlank = expectedValue === '';
      const mismatch = expectedValue !== undefined && !expectingBlank && cellText !== null && cellText !== expectedValue;
      const shouldRetry = (notFound && !expectingBlank) || mismatch;

      if (!shouldRetry) {
        if (attempt > 1) {
          console.log(`  ✓ Got value for "${columnHeader}" on attempt ${attempt}: "${cellText ?? ''}"`);
        }
        // null with expectingBlank means column absent → treat as ''
        return cellText ?? '';
      }

      if (attempt < MAX_RETRIES) {
        if (notFound) {
          console.log(`  ⚠ Attempt ${attempt}/${MAX_RETRIES}: column "${columnHeader}" not found — retrying in ${RETRY_INTERVAL_MS / 1000}s...`);
        } else {
          console.log(`  ⚠ Attempt ${attempt}/${MAX_RETRIES}: actual "${cellText}" ≠ expected "${expectedValue}" — refreshing in ${RETRY_INTERVAL_MS / 1000}s...`);
        }
        await this.page.waitForTimeout(RETRY_INTERVAL_MS);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(1000);
        await this.clickInvoicesTab();
      }
    }

    throw new Error(`Invoices table column header "${columnHeader}" not found in any table after ${MAX_RETRIES} attempts`);
  }

  /**
   * Get the checked state of a checkbox in the first data row of the Invoices table by column header.
   * Used to verify boolean/checkbox fields such as "License Send".
   * Retries up to 5 times with page reload if the column is not found.
   * @param columnHeader - The visible column header text (e.g. "License Send")
   * @returns true if checkbox is checked, false if unchecked
   */
  async getInvoicesFirstRowCheckboxState(columnHeader: string): Promise<boolean> {
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL_MS = 10000;

    const tryRead = async (): Promise<boolean | null> => {
      await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });
      await this.page.waitForTimeout(1000);

      const result = await this.page.evaluate((col: string): boolean | null => {
        const activePane = document.querySelector('div.tab-pane.active.show') ?? document;
        const tables = Array.from(activePane.querySelectorAll('table'));
        for (const table of tables) {
          const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
          const colIndex = headerCells.findIndex(
            (th) => (th.textContent ?? '').trim().toLowerCase() === col.toLowerCase()
          );
          if (colIndex === -1) continue;
          const firstRow = table.querySelector('tbody tr');
          if (!firstRow) continue;
          const cell = firstRow.querySelectorAll('td')[colIndex];
          if (!cell) continue;
          const checkbox = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
          if (!checkbox) return false; // cell found but no checkbox — treat as unchecked
          return checkbox.checked;
        }
        return null; // column not found
      }, columnHeader);

      return result;
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const state = await tryRead();

      if (state !== null) {
        if (attempt > 1) {
          console.log(`  ✓ Got checkbox state for "${columnHeader}" on attempt ${attempt}: ${state}`);
        }
        return state;
      }

      if (attempt < MAX_RETRIES) {
        console.log(`  ⚠ Attempt ${attempt}/${MAX_RETRIES}: column "${columnHeader}" not found — retrying in ${RETRY_INTERVAL_MS / 1000}s...`);
        await this.page.waitForTimeout(RETRY_INTERVAL_MS);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(1000);
        await this.clickInvoicesTab();
      }
    }

    throw new Error(`Invoices table column header "${columnHeader}" not found in any table after ${MAX_RETRIES} attempts`);
  }

  /**
   * Get the text of the first data row cell in the Quotes table by column header label.
   * Returns '' (empty string) instead of throwing when the column or rows are not found.
   * Use this for verifying BLANK values.
   * @param columnHeader - The visible column header text (e.g. "Expected closing date")
   */
  async getQuotesFirstRowCellTextOrEmpty(columnHeader: string): Promise<string> {
    await this.page.waitForTimeout(1000);

    const hasTable = await this.page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasTable) return '';

    const cellText = await this.page.evaluate((header: string): string => {
      const isVisible = (el: Element): boolean => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).offsetParent === null) return false;
        return true;
      };
      const tables = Array.from(document.querySelectorAll('table')).filter(isVisible);
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        const colIndex = headerCells.findIndex(
          (th) => (th.textContent ?? '').trim().toLowerCase() === header.toLowerCase()
        );
        if (colIndex === -1) continue;
        const firstRow = table.querySelector('tbody tr');
        if (!firstRow) return '';
        const cell = firstRow.querySelectorAll('td')[colIndex];
        if (!cell) return '';
        return ((<HTMLElement>cell).innerText ?? cell.textContent ?? '').trim();
      }
      return '';
    }, columnHeader);

    return cellText;
  }

  /**
   * Verify that a column header exists in the Quotes tab table.
   * @param columnHeader - The visible column header text (e.g. "Quotation Number")
   */
  async verifyQuotesTabColumnExists(columnHeader: string): Promise<boolean> {
    await this.page.waitForSelector('table', { state: 'visible', timeout: 30000 });
    await this.page.waitForTimeout(1000);

    const found = await this.page.evaluate((header: string): boolean => {
      const tables = Array.from(document.querySelectorAll('table'));
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        const colIndex = headerCells.findIndex(
          (th) => (th.textContent ?? '').trim().toLowerCase() === header.toLowerCase()
        );
        if (colIndex !== -1) return true;
      }
      return false;
    }, columnHeader);

    return found;
  }

  async audienceClickAddALine(): Promise<void> {
    await this.audience_addALineLink().click();
    await this.page.waitForTimeout(2000);
  }

  async clickAudienceContactIDField(): Promise<void> {
    await this.audienceContactIDField().click();
    await this.page.waitForTimeout(1000);
  }

  async verifyAudienceContactIDField(): Promise<boolean> {
    try {
      const field = this.audienceContactIDField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Contact ID is a Many2one (combobox) field — renders as input[type="text"] with dropdown
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        console.log(`  ✓ Contact ID field is a select (combobox) element`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const classList = await field.getAttribute('class');
        const isTextType = inputType === 'text' || inputType === null;
        const hasComboClass = classList && (
          classList.includes('o_field_many2one') ||
          classList.includes('o_many2one') ||
          classList.includes('o_input')
        );
        if (isTextType || hasComboClass) {
          console.log(`  ✓ Contact ID field is a combobox input (type=${inputType}, class=${classList})`);
          return true;
        }
        console.log(`  ⚠️ Contact ID field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Contact ID field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Contact ID field: ${error}`);
      return false;
    }
  }

  async clickAudienceEventLeadTypeField(): Promise<void> {
    const field = this.audienceEventLeadTypeField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
  }

  async verifyAudienceEventLeadTypeField(): Promise<boolean> {
    try {
      const field = this.audienceEventLeadTypeField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Event lead type is a Many2one (combobox) field — renders as input[type="text"] with dropdown
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        console.log(`  ✓ Event lead type field is a select (combobox) element`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const classList = await field.getAttribute('class');
        const isTextType = inputType === 'text' || inputType === null;
        const hasComboClass = classList && (
          classList.includes('o_field_many2one') ||
          classList.includes('o_many2one') ||
          classList.includes('o_input')
        );
        if (isTextType || hasComboClass) {
          console.log(`  ✓ Event lead type field is a combobox input (type=${inputType}, class=${classList})`);
          return true;
        }
        console.log(`  ⚠️ Event lead type field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Event lead type field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Event lead type field: ${error}`);
      return false;
    }
  }

  async clickAudienceEngagementTypeField(): Promise<void> {
    const field = this.audienceEngagementTypeField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
  }

  async verifyAudienceEngagementTypeField(): Promise<boolean> {
    try {
      const field = this.audienceEngagementTypeField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Engagement type is a Many2one (combobox) field — renders as input[type="text"] with dropdown
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        console.log(`  ✓ Engagement type field is a select (combobox) element`);
        return true;
      }

      if (tagName === 'input') {
        const inputType = await field.getAttribute('type');
        const classList = await field.getAttribute('class');
        const isTextType = inputType === 'text' || inputType === null;
        const hasComboClass = classList && (
          classList.includes('o_field_many2one') ||
          classList.includes('o_many2one') ||
          classList.includes('o_input')
        );
        if (isTextType || hasComboClass) {
          console.log(`  ✓ Engagement type field is a combobox input (type=${inputType}, class=${classList})`);
          return true;
        }
        console.log(`  ⚠️ Engagement type field type unexpected: type=${inputType}`);
        return false;
      }

      console.log(`  ⚠️ Engagement type field has unexpected tag: ${tagName}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Engagement type field: ${error}`);
      return false;
    }
  }

  async clickAudienceEngagementDateField(): Promise<void> {
    const field = this.audienceEngagementDateField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
  }

  async verifyAudienceEngagementDateField(): Promise<boolean> {
    try {
      const field = this.audienceEngagementDateField();

      // Wait for field to be visible
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      // Engagement date is a calendar (date) field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');
      const classList = await field.getAttribute('class');

      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDatepickerClass = classList && (
        classList.includes('o_datepicker_input') ||
        classList.includes('o_date_input') ||
        classList.includes('o_input')
      );

      if (isInput && (isDateType || hasDatepickerClass)) {
        console.log(`  ✓ Engagement date field is a calendar input (type=${inputType}, class=${classList})`);
        return true;
      }

      console.log(`  ⚠️ Engagement date field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Engagement date field: ${error}`);
      return false;
    }
  }

  async clickRequiredItemsTab(): Promise<void> {
    const tab = this.requiredItemsTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.page.waitForTimeout(1000);
  }

  async clickIsDatasheetsField(): Promise<void> {
    const field = this.isDatasheetsField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsDatasheetsField(): Promise<boolean> {
    try {
      const field = this.isDatasheetsField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Datasheets is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Datasheets field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Datasheets field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Datasheets field: ${error}`);
      return false;
    }
  }

  async clickIsNotebooksField(): Promise<void> {
    const field = this.isNotebooksField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsNotebooksField(): Promise<boolean> {
    try {
      const field = this.isNotebooksField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Notebooks is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Notebooks field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Notebooks field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Notebooks field: ${error}`);
      return false;
    }
  }

  async clickIsPensField(): Promise<void> {
    const field = this.isPensField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsPensField(): Promise<boolean> {
    try {
      const field = this.isPensField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Pens is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Pens field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Pens field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Pens field: ${error}`);
      return false;
    }
  }

  async clickIsAmazonCardsField(): Promise<void> {
    const field = this.isAmazonCardsField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsAmazonCardsField(): Promise<boolean> {
    try {
      const field = this.isAmazonCardsField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Amazon Cards is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Amazon Cards field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Amazon Cards field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Amazon Cards field: ${error}`);
      return false;
    }
  }

  async clickIsRequiredRollupBannersField(): Promise<void> {
    const field = this.isRequiredRollupBannersField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsRequiredRollupBannersField(): Promise<boolean> {
    try {
      const field = this.isRequiredRollupBannersField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Required Rollup Banners is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Required Rollup Banners field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Required Rollup Banners field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Required Rollup Banners field: ${error}`);
      return false;
    }
  }

  async clickIsRequiredDatasheetsField(): Promise<void> {
    const field = this.isRequiredDatasheetsField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsRequiredDatasheetsField(): Promise<boolean> {
    try {
      const field = this.isRequiredDatasheetsField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Required Datasheets is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Required Datasheets field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Required Datasheets field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Required Datasheets field: ${error}`);
      return false;
    }
  }

  async clickIsRequiredPrintedSurveysField(): Promise<void> {
    const field = this.isRequiredPrintedSurveysField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsRequiredPrintedSurveysField(): Promise<boolean> {
    try {
      const field = this.isRequiredPrintedSurveysField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Required Printed Surveys is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Required Printed Surveys field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Required Printed Surveys field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Required Printed Surveys field: ${error}`);
      return false;
    }
  }

  async clickIsRequiredPresentationsField(): Promise<void> {
    const field = this.isRequiredPresentationsField();
    await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.evaluate((el) => (el as HTMLElement).click());
  }

  async verifyIsRequiredPresentationsField(): Promise<boolean> {
    try {
      const field = this.isRequiredPresentationsField();

      // Wait for field to be attached (Bootstrap custom-control-input is visually hidden)
      await field.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });

      // Is Required Presentations is a checkbox field
      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await field.getAttribute('type');

      if (tagName === 'input' && inputType === 'checkbox') {
        console.log(`  ✓ Is Required Presentations field is a checkbox input (type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Is Required Presentations field unexpected: tag=${tagName}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Is Required Presentations field: ${error}`);
      return false;
    }
  }

  async clickLeadTrackingTab(): Promise<void> {
    const tab = this.leadTrackingTab();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await tab.click();
    await this.page.waitForTimeout(1000);
  }

  async leadTrackingClickAddALine(): Promise<void> {
    const addALine = this.leadTracking_addALineLink();
    await addALine.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await addALine.click();
    await this.page.waitForTimeout(1000);
  }

  async clickLeadTrackingUTMTagField(): Promise<void> {
    const field = this.leadTrackingUTMTagField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
  }

  async verifyLeadTrackingUTMTagField(): Promise<boolean> {
    try {
      const field = this.leadTrackingUTMTagField();
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const role = await field.getAttribute('role');
      const inputType = await field.getAttribute('type');

      const isCombobox =
        role === 'combobox' ||
        (tagName === 'input' && (inputType === 'text' || inputType === null || inputType === ''));

      if (isCombobox) {
        console.log(`  ✓ UTM Tag field is a combobox input (tag=${tagName}, role=${role}, type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ UTM Tag field unexpected: tag=${tagName}, role=${role}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying UTM Tag field: ${error}`);
      return false;
    }
  }

  async clickLeadTrackingValueField(): Promise<void> {
    const field = this.leadTrackingValueField();
    await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await field.click();
  }

  async verifyLeadTrackingValueField(): Promise<boolean> {
    try {
      const field = this.leadTrackingValueField();
      await field.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });

      const tagName = await field.evaluate((el) => el.tagName.toLowerCase());
      const role = await field.getAttribute('role');
      const inputType = await field.getAttribute('type');

      const isCombobox =
        role === 'combobox' ||
        (tagName === 'input' && (inputType === 'text' || inputType === null || inputType === ''));

      if (isCombobox) {
        console.log(`  ✓ Value field is a combobox input (tag=${tagName}, role=${role}, type=${inputType})`);
        return true;
      }

      console.log(`  ⚠️ Value field unexpected: tag=${tagName}, role=${role}, type=${inputType}`);
      return false;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Value field: ${error}`);
      return false;
    }
  }

  async verifyTrackConversionDateEndField(): Promise<boolean> {
    try {
      const trackConversionDateEndField = this.trackConversionDateEndField();
      
      // Wait for field to be visible
      await trackConversionDateEndField.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      // Verify it's a date input (calendar field)
      const tagName = await trackConversionDateEndField.evaluate((el) => el.tagName.toLowerCase());
      const inputType = await trackConversionDateEndField.getAttribute('type');
      const classList = await trackConversionDateEndField.getAttribute('class');
      
      const isInput = tagName === 'input';
      const isDateType = inputType === 'date' || inputType === 'datetime-local' || inputType === 'text';
      const hasDateClass = classList && (
        classList.includes('o_datepicker') ||
        classList.includes('o_field_date') ||
        classList.includes('datepicker') ||
        classList.includes('o_input')
      );
      
      if (!isInput || (!isDateType && !hasDateClass)) {
        console.log(`  ⚠️ Field does not appear to be a Calendar field, tag: ${tagName}, type: ${inputType}, classes: ${classList}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.log(`  ⚠️ Error verifying Track conversion date end field: ${error}`);
      return false;
    }
  }


  /**
   * Wait for and return the text of an import error notification or dialog.
   * Matches Odoo notification banners and modal dialogs containing the given keyword.
   * @param keyword - substring expected inside the error message (default: 'do not exist')
   * @param timeout - ms to wait for the locator to become visible (default: 15000)
   * @returns the trimmed inner text of the matched element
   */
  async waitForImportErrorMessage(keyword = 'do not exist', timeout = 15000): Promise<string> {
    const errorLocator = this.importErrorLocatorQA();
    await errorLocator.waitFor({ state: 'visible', timeout });
    return (await errorLocator.innerText()).trim();
  }
}