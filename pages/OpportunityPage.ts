import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opportunity Page Object
 * Handles interactions with Opportunity list and form pages
 */
export class OpportunityPage extends BasePage {
  // List view locators
  private readonly viewListButton = () => this.page.getByRole('button', { name: 'View list' });
  private readonly myPipelineFilterDeleteXPath = () =>
    this.page.locator("xpath=//div[contains(@title,'Remove')]");
  private readonly searchViewInputXPath = () =>
    this.page.locator("xpath=//div[contains(@class,'o_searchview')]//input[contains(@class,'o_searchview_input')]");
  private readonly createButton = () => this.page.getByRole('button', { name: /CREATE/i });
  
  // Form view locators
  private readonly opportunityNameInput = () => this.page.getByRole('textbox', { name: 'Opportunity' }).or(this.page.locator('input[name="name"]')).first();
  private readonly emailInput = () => this.page.locator('tr').filter({ hasText: 'Email' }).filter({ hasNotText: 'Email Templates' }).locator('input:visible').first();
  private readonly companyNameInput = () => this.page.locator('xpath=(//input[@name="partner_name"])[3]');
  private readonly streetInput = () => this.page.locator('xpath=(//input[@name="street"])[2]');
  private readonly countryInputXPath = () => this.page.locator("xpath=(//div[contains(@class,'address_country')])[2]/div/input");
  private readonly stateInputXPath = () => this.page.locator("xpath=(//div[contains(@class,'address_state')])[2]/div/input");
  private readonly createdManuallyCheckbox = () => this.createdManuallyRow().locator('input[type="checkbox"]').first();
// Opp page locators
  private readonly salesTeamSelect = () => this.page.locator('select[name="team_id"]').or(this.page.locator('combobox:has-text("Sales Team")').locator('select')).or(this.page.getByLabel('Sales Team')).first();
  private readonly salespersonInput = () => this.page.getByRole('textbox', { name: 'Salesperson' }).first();
  private readonly crmDeveloperTab = () => this.page.getByRole('tab', { name: 'CRM Developer' }).first();
  private readonly leadFormInput = () => this.page.locator('xpath=(//input[@name="x_studio_lead_sorce"])[2]');
  private readonly saveButton = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly contactFieldXPath = () => this.page.locator("xpath=(//a[@name='contact_partner_id'])[2]");
  private readonly companyFieldXPath  = () => this.page.locator("xpath=(//a[@name='partner_id'])[2]");
  private readonly createdManuallyRow = () => this.page.locator('tr:has-text("Create manually")');
  private readonly dealElementButton = () => this.page.getByRole('button', { name: 'DEAL ELEMENT' }).or(this.page.getByRole('button', { name: 'Deal Element' })).first();
  private readonly newQuotationButton = () => this.page.getByRole('button', { name: /NEW QUOTATION/i }).or(this.page.getByRole('button', { name: /New Quotation/i })).first();
  private readonly resellerInputOpp = () => this.page.locator('xpath=//div[@name="reseller_id"]//input').first();
  private readonly distributorInputOpp = () => this.page.locator('xpath=//div[@name="distributor_id"]//input').first();
  
  
  // Menu locators
  private readonly archiveButtonXPath = () => this.page.locator("xpath=//a[normalize-space()='Archive']");
  private readonly allMenuItemXPath = () => this.page.locator("xpath=//a[@role='menuitem' and normalize-space()='All']");
  private readonly allLeadsText = () => this.page.locator("xpath=//li[contains(text(),'All Leads')]");
  private readonly devRequiredCheckboxXPath = () => this.page.locator(
    "xpath=//tr[td[normalize-space()='Development required'] or td/label[normalize-space()='Development required']]//input[@type='checkbox']"
  );
  private readonly devRequiredRow = () => this.page.locator(
    "tr:has-text('Development required')"
  );
  private readonly devRequiredTextboxXPath = () => this.page.locator("xpath=//input[@name='development_detail']");
  private readonly devRequiredTextbox_Readonly = () => this.page.locator("xpath=//span[@name='development_detail']");
//Stage:
private readonly stageNew = () => this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='New']");
private readonly stageHotDeal = () => this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='Hot Deal']");
private readonly stageByName = (stageName: string) => this.page.locator(`xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='${stageName}']`);
private readonly stageMoreButton = () => this.page.locator("xpath=//div[contains(@name,'stage_id')]/button[normalize-space()='MORE' or normalize-space()='More']");
private readonly stageOptionByName = (stageName: string) => this.page.locator(`xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='${stageName}'] | //ul[contains(@class,'dropdown-menu')]//a[normalize-space()='${stageName}'] | //div[contains(@class,'dropdown-menu')]//button[normalize-space()='${stageName}']`);


private readonly leadFormField = () => this.page.locator('xpath=(//span[@name="x_studio_lead_sorce"])[2]');
private readonly tagsRow = () => this.page.locator('xpath=//tr[td/label[contains(text(), "Tags")] or td[contains(text(), "Tags")]]').first();
  private readonly tagsList = () => this.page.locator('xpath=(//div[@name="tag_ids"])[1]').first();
  private readonly companyNameRow = () => this.page.locator("xpath=(//td/span[contains(@name,'partner_name')])[3]").first();
  private readonly addressRow = () => this.page.locator("xpath=//tr[td[contains(normalize-space(),'Address')]]").first();

  // Custom filter locators
  private readonly filterDropdownButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_search_options')]//button[normalize-space()='Filters']").first();
  //Link "Add Custom Filter" 
  private readonly addCustomFilterLink = () =>
    this.page.locator("xpath=//button[contains(normalize-space(),'Add Custom Filter') or contains(normalize-space(),'Add Customer Filter')]").first();
  //Dropdown_List#1 First Selector
  private readonly customFilterFieldSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_field')]").first();
      //Dropdown_List#2 Second Selector
  private readonly customFilterOperatorSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_op')]").first();
  private readonly applyFilterButton = () =>
    this.page.locator("xpath=//button[normalize-space()='Apply']").first();
  // Dropdown_List#3: custom filter value (input for many2one/text, select for selection fields)
  private readonly customFilterValueInput = () =>
    this.page.locator("xpath=(//div[@role='menuitem']//input[contains(@class,'o_input')])[1]").first();
  private readonly customFilterValueSelect = () =>
    this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_value')]").first();
  private readonly customFilterValueDropdownOption = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly buttonAddCondition = () =>
    this.page.locator("xpath=//button[contains(normalize-space(),'Add a condition')]").first();
  // Last-row variants — used after "Add a condition" adds a second OR-branch row
  private readonly customFilterFieldSelectLast = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_field')]").last();
  private readonly customFilterOperatorSelectLast = () =>
    this.page.locator("xpath=//select[contains(@class,'o_input o_searchview_extended_prop_op')]").last();
  private readonly customFilterValueInputLast = () =>
    this.page.locator("xpath=(//div[@role='menuitem']//input[contains(@class,'o_input')])[2]").first();
  private readonly customFilterValueSelectLast = () =>
    this.page.locator("xpath=//select[contains(@class,'o_searchview_extended_prop_value')]").last();
  // List view: empty-state placeholder
  private readonly emptyListPlaceholder = () =>
    this.page.locator("xpath=//p[contains(normalize-space(),'Create an opportunity in your pipeline')]").first();
  // List view: generic data rows (works on any list page)
  private readonly dataRowsLocator = () => this.page.locator('tr.o_data_row');
  // List view: header "select all" checkbox — the input is visually hidden, click via JS
  private readonly selectAllCheckboxInput = () =>
    this.page.locator("xpath=//th[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  // Fallback: the <th> cell itself
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
  private readonly crmMenuLink_CRM_Module = () => this.page.locator('xpath=//a[@class="o_menu_brand" and text()="CRM"]').first();
  private readonly crmConfigurationMenu = () =>
    this.page.locator('xpath=//a[@class="dropdown-toggle o-no-caret o_menu_header_lvl_1" and @data-menu-xmlid="crm.crm_menu_config"]').first();
  private readonly reAssignationMenuItem = () =>
    this.page.locator('xpath=//a[normalize-space()="Re-assignation"]').first();
  // Server error dialog (e.g. "Odoo Server Error" on invalid save)
  private readonly serverErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'o_dialog_warning modal-body')]");

  // Qualification info tab & fields
  private readonly qualificationInfoTab = () => this.page.getByRole('tab', { name: 'Qualification info' }).first();
  private readonly qualEnvSocketInput    = () => this.page.locator("xpath=//tr[td[normalize-space()='Number of socket']]//input").first();
  private readonly qualEnvVmsInput       = () => this.page.locator("xpath=//tr[td[normalize-space()='VMs']]//input").first();
  private readonly qualEnvPhysicalInput  = () => this.page.locator("xpath=//tr[td[normalize-space()='Physical hosts']]//input").first();
  private readonly qualEnvAwsInput       = () => this.page.locator("xpath=//tr[td[normalize-space()='AWS EC2']]//input").first();
  private readonly qualEnvWorkstationsInput = () => this.page.locator("xpath=//tr[td[normalize-space()='Workstations']]//input").first();
  private readonly qualEnvOffice365Input = () => this.page.locator("xpath=//tr[td[normalize-space()='Office365 Users']]//input").first();
  private readonly qualEnvOracleInput    = () => this.page.locator("xpath=//tr[td[normalize-space()='Oracle Databases']]//input").first();
  private readonly qualEnvTbInput        = () => this.page.locator("xpath=//tr[td[normalize-space()='TB']]//input").first();
  private readonly qualInfoLicensingSelect = () => this.page.locator("xpath=//tr[td[normalize-space()='Licensing Model']]//select").first();
  private readonly qualInfoUseCaseInput  = () => this.page.locator("xpath=//tr[td[normalize-space()='Use case(s)']]//input | //tr[td[normalize-space()='Use case(s)']]//textarea").first();
  private readonly qualInfoRequirementInput = () => this.page.locator("xpath=//tr[td[normalize-space()='Requirement(s)']]//input | //tr[td[normalize-space()='Requirement(s)']]//textarea").first();
  private readonly qualInfoCurrentSolutionInput = () => this.page.locator("xpath=//tr[td[normalize-space()='Current solution']]//input").first();
  private readonly qualInfoCompetitorInput = () => this.page.locator("xpath=//tr[td[normalize-space()='Competitor']]//input").first();
  private readonly expectedClosingInput  = () => this.page.locator("xpath=(//input[@name='date_deadline'])[2]").first();
  // Expected Revenue / Prorated Revenue / Probability — Opportunity form header stats
  private readonly expectedRevenueXPath = () =>
    this.page.locator("xpath=//div/span[@name='planned_revenue_custom']").first();
  private readonly proratedRevenueXPath = () =>
    this.page.locator("xpath=//div/span[@name='expected_revenue_after_probability']").first();
  private readonly probabilityXPath = () =>
    this.page.locator("xpath=//div/span[@name='probability']").first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Switch from kanban to list view
   */
  async switchToListView() {
    await this.waitForURL('**/web?*view_type=kanban*', CommonUtils.waitTimes.pageLoad);
    await this.viewListButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.viewListButton().click();
    await this.waitForURL('**/web?*view_type=list*', CommonUtils.waitTimes.pageLoad);
    await this.page.locator('.o_list_view, table.o_list_table').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Navigate to Archive > All Leads via the top menu
   */
  async navigateToAllLeads() {
    await this.archiveButtonXPath().click();
    await this.allMenuItemXPath().click();
    await this.allLeadsText().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  getDevRequiredCheckbox() {
    return this.devRequiredCheckboxXPath();
  }

  getDevRequiredTextbox_Readonly() {
    return this.devRequiredTextbox_Readonly();
  }

  async checkDevRequired() {
    await this.wait(500);
    const row = this.devRequiredRow();
    const exists = await row.count() > 0;
    if (exists) {
      const checkbox = this.devRequiredCheckboxXPath().first();
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await row.locator('label, .custom-control').first().click({ force: true });
        await this.wait(300);
        const nowChecked = await checkbox.isChecked();
        return nowChecked;
      }
      return true; // Already checked
    }
    return false; // Field not found
  }

  async fillDevRequired(value: string) {
    const textbox = this.devRequiredTextboxXPath().first();
    await textbox.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await textbox.fill(value);
  }

  /**
   * Click CREATE button to open opportunity creation form
   */
  async clickCreate() {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.createButton().scrollIntoViewIfNeeded();
    await this.createButton().click();
    await this.waitForURL('**/web?*view_type=form*', CommonUtils.waitTimes.pageLoad);
    await this.page.locator('.o_form_view').waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  }

  /**
   * Fill opportunity name
   */
  async fillOpportunityName(name: string) {
    await this.opportunityNameInput().fill(name);
  }

  /**
   * Fill email address
   */
  async fillEmail(email: string) {
    await this.emailInput().fill(email);
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Fill company name
   */
  async fillCompanyName(name: string) {
    await this.companyNameInput().fill(name);
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Fill street address
   */
  async fillStreet(street: string) {
    await this.streetInput().fill(street);
  }

  /**
   * Select country from dropdown using XPath
   */
  async selectCountry(country: string) {
    try {
      const input = this.countryInputXPath();
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.click();
      await this.wait(1000);
      await input.fill(country);
      await this.wait(1000);
      
      const option = this.dropdownOption().filter({ hasText: country }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (optionVisible) {
        await option.click();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Select state from dropdown using XPath
   */
  async selectState(state: string) {
    try {
      const input = this.stateInputXPath();
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.click();
      await input.fill(state);
      await this.wait(1000);
      
      const option = this.dropdownOption().filter({ hasText: state }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (optionVisible) {
        await option.click();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear sales team selection
   */
  async clearSalesTeam() {
    await this.wait(500);
    const select = this.salesTeamSelect();
    const exists = await select.count() > 0;
    if (exists) {
      await select.selectOption({ index: 0 });
      return true;
    }
    return false;
  }

  /**
   * Clear salesperson field
   */
  async clearSalesperson() {
    await this.wait(500);
    const input = this.salespersonInput();
    const exists = await input.count() > 0;
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(300);
      await this.page.locator('td:has-text("Sales Team")').click().catch(() => {});
      await this.wait(300);
      return true;
    }
    return false;
  }

  /**
   * Select sales team from dropdown
   */
  async selectSalesTeam(teamName: string) {
    await this.wait(500);
    const select = this.salesTeamSelect();
    const exists = await select.count() > 0;
    if (exists) {
      await select.selectOption({ label: teamName });
      await this.wait(500);
      return true;
    }
    return false;
  }

  /**
   * Select salesperson from dropdown
   */
  async selectSalesperson(salespersonName: string) {
    try {
      const input = this.salespersonInput();
      await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await input.click();
      await this.wait(500);
      await input.fill(salespersonName);
      await this.wait(1000);
      
      const option = this.dropdownOption().filter({ hasText: salespersonName }).first();
      const optionVisible = await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (optionVisible) {
        await option.click();
        await this.wait(500);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Uncheck "Created Manually" checkbox
   */
  async uncheckCreatedManually() {
    const row = this.createdManuallyRow();
    const rowExists = await row.count() > 0;
    if (rowExists) {
      const checkbox = row.locator('input[type="checkbox"]').first();
      const isChecked = await checkbox.isChecked();
      if (isChecked) {
        await row.locator('label, .custom-control').first().click({ force: true });
        await this.wait(500);
        return true;
      } else {
        return true; // Already unchecked
      }
    }
    return false; // Field not found
  }

  /**
   * Check "Created Manually" checkbox
   */
  async checkCreatedManually() {
    await this.wait(500);
    const row = this.createdManuallyRow();
    const exists = await row.count() > 0;
    if (exists) {
      const checkbox = this.createdManuallyCheckbox();
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await row.locator('label, .custom-control').first().click({ force: true });
        await this.wait(300);
        const nowChecked = await checkbox.isChecked();
        return nowChecked;
      }
      return true; // Already checked
    }
    return false; // Field not found
  }

  /**
   * Verify and re-uncheck "Created Manually" checkbox before save
   * Odoo sometimes auto-checks this field, so we verify before saving
   */
  async verifyCreatedManuallyBeforeSave() {
    const row = this.createdManuallyRow();
    const rowExists = await row.count() > 0;
    if (rowExists) {
      const checkbox = row.locator('input[type="checkbox"]').first();
      const isChecked = await checkbox.isChecked();
      if (isChecked) {
        await row.locator('label, .custom-control').first().click({ force: true });
        await this.wait(500);
        return true;
      }
    }
    return false;
  }

  /**
   * Click "DEAL ELEMENT" button to open Deal Element form
   */
  async clickDealElement() {
    
    // Handle error dialog if it appears (dismiss only if it shows up)
    await this.dismissErrorDialog();
    
    const button = this.dealElementButton();
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await button.scrollIntoViewIfNeeded();
    await button.click({ force: true });
  }

  /**
   * Fill Reseller field on the Opportunity form
   * @param contactName - The name of the contact to set as reseller
   */
  async fillReseller(contactName: string) {
    const input = this.resellerInputOpp();
    await input.click();
    await input.fill('');
    await this.wait(300);
    await input.fill(contactName);
    await this.wait(800);
    const option = this.dropdownOption().filter({ hasText: contactName }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => { await this.page.keyboard.press('Enter'); });
  }

  /**
   * Fill Distributor field on the Opportunity form
   * @param contactName - The name of the contact to set as distributor
   */
  async fillDistributor(contactName: string) {
    const input = this.distributorInputOpp();
    await input.click();
    await input.fill('');
    await this.wait(300);
    await input.fill(contactName);
    await this.wait(800);
    const option = this.dropdownOption().filter({ hasText: contactName }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => { await this.page.keyboard.press('Enter'); });
  }

  /**
   * Click CRM Developer tab
   */
  async clickCRMDeveloperTab() {
    await this.wait(500);
    await this.crmDeveloperTab().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.crmDeveloperTab().scrollIntoViewIfNeeded();
    await this.crmDeveloperTab().click();
    await this.wait(500);
  }


/**
   * Select Stage - New on Opp page
   */
  async selectStageNew() {
    await this.wait(500);
    await this.stageNew().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageNew().scrollIntoViewIfNeeded();
    await this.stageNew().click({ force: true });
    await this.wait(500);
  }

  /**
   * Select any Stage by name on Opp page
   * @param stageName - The exact stage name as displayed on the stage bar (e.g., 'New', 'Hot Deal', 'Qualified')
   */
  async selectStage(stageName: string) {
    await this.wait(500);
    const stageBtn = this.stageByName(stageName);
    await stageBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await stageBtn.scrollIntoViewIfNeeded();
    await stageBtn.click({ force: true });
    await this.wait(500);
  }

  /**
   * Select Stage - Hot Deal on Opp page
   */
  async selectStageHotDeal(stage: string) {
    await this.wait(500);
    await this.stageHotDeal().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageHotDeal().scrollIntoViewIfNeeded();
    await this.stageHotDeal().click();
    await this.wait(500);
  }
  /**
   * Select Stage via the "MORE" button in the status bar
   * Use this when the stage (e.g. Won) is hidden behind the MORE dropdown
   * @param stageName - The exact stage name as shown in the dropdown (e.g., 'Won')
   */
  async selectStageViaMore(stageName: string) {
    await this.wait(500);
    await this.stageMoreButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageMoreButton().scrollIntoViewIfNeeded();
    await this.stageMoreButton().click();
    await this.wait(300);
    await this.stageOptionByName(stageName).first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageOptionByName(stageName).first().click();
    await this.wait(500);
    // Odoo shows a "Mark as Won" confirmation dialog when Won stage is selected
    const markWonDialog = this.page.locator('.modal, .o_dialog').filter({ hasText: /Mark Won|Mark as Won/i });
    const dialogVisible = await markWonDialog.isVisible({ timeout: 3000 }).catch(() => false);
    if (dialogVisible) {
      console.log('  ℹ️ "Mark as Won" dialog detected - confirming');
      const confirmBtn = markWonDialog.getByRole('button', { name: /Mark Won|Confirm|OK/i }).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await confirmBtn.click();
      await this.wait(500);
      console.log('  ✓ "Mark as Won" dialog confirmed');
    }
  }

  /**
   * Fill Lead Form field
   */
  async fillLeadForm(value: string) {
    const input = this.leadFormInput();
    const exists = await input.count() > 0;
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(300);
      await input.fill(value);
      await this.wait(800);
      
      const option = this.dropdownOption().filter({ hasText: value }).first();
      const optionVisible = await option.isVisible().catch(() => false);
      if (optionVisible) {
        await option.click();
      } else {
        await this.page.keyboard.press('Enter');
      }
      return true;
    }
    return false;
  }

  /**
   * Click edit button
   */
  async clickEdit() {
    const button = this.editButton();
    const exists = await button.count() > 0;
    if (exists) {
      await button.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await button.first().scrollIntoViewIfNeeded();
      await button.first().click();
      await this.page.locator('.o_form_editable, input:not([readonly])').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      return true;
    }
    return false;
  }

  /**
   * Click save button
   */
  async clickSave() {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().scrollIntoViewIfNeeded();
    await this.saveButton().click();
  }

  /**
   * Save and wait for completion
   * Includes waiting for URL change and page stabilization
   */
  async saveAndWaitForCompletion() {
    await this.saveButton().waitFor({ state: 'visible' });
    await this.saveButton().scrollIntoViewIfNeeded();
    await this.saveButton().click();
    
    // Wait for save to complete - URL will change to include the ID
    await this.waitForURL('**/web?*id=*&*', CommonUtils.waitTimes.pageLoad);
    
    // Wait for Save button to disappear or become disabled
    await this.saveButton().waitFor({ state: 'hidden' }).catch(async () => {
      await this.page.waitForSelector('button.o_form_button_save:disabled', { timeout: 10000 }).catch(() => {});
    });
    
    // Wait for page to stabilize
    await this.waitForFormSaved();
  }

  /**
   * Wait for save to complete
   */
  async waitForSaveComplete(timeout: number = 60000) {
    await this.waitForURL('**/web?*id=*&*', timeout);
    await this.editButton().waitFor({ state: 'visible', timeout });
  }

  /**
   * Generate a unique opportunity name with timestamp
   */
  generateOpportunityName(prefix: string = 'TEST'): string {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0].replace(/-/g, '');
    const currentTime = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6);
    return `${prefix}${currentDate}${currentTime}`;
  }

  /**
   * Generate a unique email with timestamp
   */
  generateEmail(prefix: string = 'Test@company'): string {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0].replace(/-/g, '');
    const currentTime = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6);
    return `${prefix}${currentDate}${currentTime}.com`;
  }

  /**
   * Get dropdown option locator (Odoo dropdown items)
   * Returns locator for dropdown options in Odoo Many2One fields and autocomplete
   */
  getDropdownOption(hasText?: string | RegExp) {
    const baseLocator = this.dropdownOption();
    if (hasText) {
      return baseLocator.filter({ hasText });
    }
    return baseLocator;
  }

  /**
   * Get Contact field locator
   * Returns the contact_partner_id field element in the opportunity form
   */
  getContactField() {
    return this.contactFieldXPath();
  }

  /**
   * Get Company field value (partner_id)
   * Returns the text content of the Company hyperlink on the Opp form
   */
  async getCompanyFieldValue(): Promise<string | null> {
    try {
      const companyField = this.companyFieldXPath();
      const exists = await companyField.count() > 0;
      if (exists) {
        return await companyField.textContent().catch(() => '');
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  /**
   * Get the URL (href) of the Company field hyperlink (partner_id)
   * Returns the full URL of the partner_id anchor element.
   * Used to capture the auto-created Company contact URL after saving an Opp.
   * @returns Promise<string> - The full URL of the Company hyperlink, or empty string if not found
   */
  async getCompanyFieldUrl(): Promise<string> {
    try {
      const companyField = this.companyFieldXPath();
      const exists = await companyField.count() > 0;
      if (!exists) return '';
      const href = await companyField.getAttribute('href').catch(() => '');
      if (!href) return '';
      if (href.startsWith('http')) return href;
      const origin = new URL(this.page.url()).origin;
      return origin + (href.startsWith('/') ? href : '/' + href);
    } catch (error) {
      return '';
    }
  }

  /**
   * Get tags text
   * @returns The tags text content as a string
   */
  async getTagsText(): Promise<string> {
    await this.waitForPageReady(CommonUtils.waitTimes.long);
    return await this.tagsRow().textContent() || '';
  }
  /**
   * Wait for Contact field to be populated after save
   * Refreshes page up to maxAttempts times, checking if Contact field contains expectedText
   * @param expectedText - Text to search for in Contact field (case-insensitive)
   * @param maxAttempts - Maximum number of refresh attempts (default: 5)
   * @param refreshInterval - Time in ms between refresh attempts (default: 60000 = 60s)
   * @param totalMaxTime - Maximum total time in ms for all attempts (default: 300000 = 5 min)
   * @returns Object with contactFieldFound boolean and contactValue string
   */
  async waitForContactFieldPopulated(
    expectedText: string = 'test',
    maxAttempts: number = 5,
    refreshInterval: number = 60000,
    totalMaxTime: number = 300000
  ): Promise<{ contactFieldFound: boolean; contactValue: string | null }> {
    let contactFieldFound = false;
    let contactValue: string | null = '';
    const startTime = Date.now();

// Quoc Anh: Dismiss any open autocomplete dropdowns that might block the save button
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(300);
// Quoc Anh

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const elapsedTime = Date.now() - startTime;

      // Check if we've exceeded the total max time
      if (elapsedTime >= totalMaxTime) {
        console.log(`  ⚠ Maximum time limit (${totalMaxTime / 60000} minutes) reached. Stopping refresh attempts.`);
        break;
      }

      console.log(`  - Refresh attempt ${attempt}/${maxAttempts}`);

      // Reload the page to ensure data persistence
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForPageReady(CommonUtils.waitTimes.contactShowing);
      // Wait for the Contact <a> element to be rendered (form data loads via AJAX after nav)
      await this.getContactField().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});

      // Verify Contact field contains expected text
      try {
        contactValue = await this.getCompanyFieldValue();

        if (contactValue && contactValue.toLowerCase().includes(expectedText.toLowerCase())) {
          console.log(`  ✓ Contact field verified: "${contactValue}"`);
          contactFieldFound = true;
          break; // Stop refreshing once Contact field has data
        } else if (contactValue) {
          console.log(`  ⚠ Contact field value: "${contactValue}" (expected to contain "${expectedText}")`);
        } else {
          console.log(`  ⚠ Contact field not found on page (attempt ${attempt})`);
        }
      } catch (error) {
        console.log(`  ⚠ Contact field verification error: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Wait before next refresh attempt (if not the last attempt and Contact not found)
      // Always wait the full refreshInterval (1 min) before making the next refresh
      if (!contactFieldFound && attempt < maxAttempts) {
        console.log(`  - Waiting ${(refreshInterval / 1000).toFixed(0)} seconds before next refresh...`);
        await this.wait(refreshInterval);
      }
    }

    if (!contactFieldFound) {
      console.log(`  ⚠ Contact field was not populated after ${maxAttempts} refresh attempts`);
    }

    return { contactFieldFound, contactValue };
  }

  /**
   * Wait for the chatter / log area to contain a specific text.
   * Refreshes the page up to maxAttempts times with an interval between each attempt.
   * @param expectedText - Exact text (substring) to search for in the chatter log
   * @param maxAttempts - Maximum number of refresh attempts (default: 5)
   * @param refreshInterval - Time in ms to wait between refreshes (default: 60000 = 60 s)
   * @param totalMaxTime - Hard cap in ms for all attempts combined (default: 300000 = 5 min)
   * @returns Object with found boolean and the full chatterText string of the last read
   */
  async waitForChatterContaining(
    expectedText: string,
    maxAttempts: number = 5,
    refreshInterval: number = 60000,
    totalMaxTime: number = 300000
  ): Promise<{ found: boolean; chatterText: string }> {
    let found = false;
    let chatterText = '';
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  - Refresh attempt ${attempt}/${maxAttempts}`);

      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForPageReady(CommonUtils.waitTimes.contactShowing);
      await this.wait(CommonUtils.waitTimes.checkingChatterLog);

      chatterText = await this.getChatterLogText();
      // Normalize whitespace so multi-line chatter messages (e.g. messages split
      // across <p> tags) still match a single-space expected string.
      chatterText = chatterText.replace(/\s+/g, ' ').trim();

      if (chatterText.includes(expectedText)) {
        console.log(`  ✓ Chatter log contains expected text after attempt ${attempt}`);
        found = true;
        break;
      } else {
        console.log(`  ⚠ Expected text not found in chatter yet (attempt ${attempt})`);
        const preview = chatterText.substring(0, 300);
        console.log(`  ℹ️ Chatter content (first 300 chars): "${preview}"`);
      }

      // Time-limit check happens AFTER the reload+check so the current attempt
      // always completes before we decide to stop.
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime >= totalMaxTime) {
        console.log(`  ⚠ Maximum time limit (${(totalMaxTime / 60000).toFixed(1)} minutes) reached after attempt ${attempt}. Stopping.`);
        break;
      }

      if (attempt < maxAttempts && refreshInterval > 0) {
        console.log(`  - Waiting ${(refreshInterval / 1000).toFixed(0)} seconds before next refresh...`);
        await this.wait(refreshInterval);
      }
    }

    if (!found) {
      console.log(`  ⚠ Expected chatter text not found after ${maxAttempts} refresh attempts`);
    }

    return { found, chatterText };
  }

  /**
   * Check if Active checkbox is checked
   * @returns Promise<boolean> - true if checkbox is checked
   */
  async isActiveChecked(): Promise<boolean> {
    const activeCheckbox = this.page.locator('xpath=(//div[@name="active"]/input)[2]');
    return await activeCheckbox.isChecked().catch(() => true);
  }

  /**
   * Get the current Is Won value from CRM Developer tab
   * @returns Promise<string> - The selected option text (e.g., 'Pending', 'Won', 'Lost')
   */
  async getIsWonValue(): Promise<string> {
    const isWonSelect = this.page.locator('xpath=//span[@name="won_status"]');
    const textContent = await isWonSelect.textContent().catch(() => 'Pending');
    return textContent?.trim() || 'Pending';
  }

  /**
   * Get the current Lost Reason value using textContent
   * @returns Promise<string> - The lost reason text value, or empty string if blank
   */
  async getLostReasonValueViaTextContent(): Promise<string> {
    const lostReasonInput = this.page.locator('xpath=(//a[contains(@name,"lost_reason")])[2]');
    const textContent = await lostReasonInput.textContent().catch(() => '');
    return textContent?.trim() || '';
  }

  /**
   * Get the current Lead Form value
   * Handles both edit mode (input field) and readonly mode (text)
   * @returns The Lead Form value as a string, or empty string if not found
   */
  async getLeadFormValue(): Promise<string> {
    try {
      const leadForm_saved_row = this.page.locator('xpath=//tr[td[contains(text(), "Lead Form")] or td/label[contains(text(), "Lead Form")]]').first();
      const leadFormCell = leadForm_saved_row.locator('xpath=./td[2]').first();
      const leadFormInputElement = leadFormCell.locator('input[name="x_studio_lead_sorce"]');
      
      const hasInput = await leadFormInputElement.count() > 0;
      
      if (hasInput) {
        // Editable mode (unsaved) - get from input
        const value = await leadFormInputElement.inputValue().catch(() => '') || '';
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await leadFormCell.textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Lead Form value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get the current Sales Team value
   * Handles both edit mode (select dropdown) and readonly mode (text)
   * @returns The Sales Team value as a string, or empty string if not found
   */
  async getSalesTeamValue(): Promise<string> {
    try {
      const salesTeam_saved_row = this.page.locator('xpath=//tr[td[contains(text(), "Sales Team")] or td/label[contains(text(), "Sales Team")]]').first();
      const salesTeamCell = salesTeam_saved_row.locator('xpath=./td[2]').first();
      const salesTeamSelectElement = salesTeamCell.locator('xpath=.//select | .//*[@role="combobox"]');
      
      const hasSelect = await salesTeamSelectElement.count() > 0;
      
      if (hasSelect) {
        // Editable mode (unsaved) - get from select element's selectedOptions
        const value = await salesTeamSelectElement.evaluate((select: HTMLSelectElement) => {
          const selectedOption = select.options[select.selectedIndex];
          return selectedOption ? selectedOption.textContent || '' : '';
        }).catch(() => '');
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await salesTeamCell.textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Sales Team value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get chatter/log area text content
   * @returns Promise<string> - The chatter log area text content
   */
  async getChatterLogText(): Promise<string> {
    const chatterLogArea = this.page.locator('.o_thread_message_content, .o_mail_thread');
    await chatterLogArea.first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await chatterLogArea.allTextContents().then(texts => texts.join(' ')) || '';
  }

  /**
   * Check if chatter log contains merge message for a specific lead
   * Validates the format: "Source Lead, has been merged into this lead" (handles variable spacing)
   * @param leadName - The name of the source lead that was merged
   * @returns Promise<boolean> - true if merge message with format is found
   */
  async hasSourceLeadMergeMessage(leadName: string): Promise<boolean> {
    const logText = await this.getChatterLogText();
    // Use regex to handle variable spacing after comma
    const messagePattern = `${leadName},\\s+has been merged into this lead`;
    const regex = new RegExp(messagePattern);
    console.log(`  ℹ️ Expected merge message pattern: "${leadName}, has been merged into this lead"`);
    
    return regex.test(logText);
  }

  /**
   * Quoc Anh's comment: This method is used on Source Opp
   * Check if chatter log contains merge message showing this opp was merged into a target lead
   * Validates the exact format: "This lead has been merged into [Target Lead]"
   * @param leadName - The name of the target lead this opp was merged into
   * @returns Promise<boolean> - true if merge message with exact format is found
   */
  async hasTargetLeadMergeMessage(leadName: string): Promise<boolean> {
    const logText = await this.getChatterLogText();
    const expectedMessage = `This lead has been merged into ${leadName}`;
    console.log(`  ℹ️ Expected merge message: "${expectedMessage}"`);
    
    return logText.includes(expectedMessage);
  }

  /**
   * Get Company Name value in readonly mode
   * Locates the Company Name row and extracts the text content
   * @returns Promise<string> - The company name text content
   */
  async getCompanyNameReadonly(): Promise<string> {
    try {
      const companyNameText = await this.companyNameRow().textContent() || '';
      return companyNameText.trim();
    } catch (error) {
      console.error(`Error getting Company Name (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Wait for the Odoo Server Error dialog to appear and return its text content.
   * @param timeout - ms to wait for the dialog (default: elementAppear)
   */
  async waitForServerErrorDialog(timeout: number = CommonUtils.waitTimes.elementAppear): Promise<string> {
    const dialog = this.serverErrorDialog();
    await dialog.waitFor({ state: 'visible', timeout });
    return ((await dialog.textContent()) ?? '').trim();
  }

  /**
   * Get Address field value in readonly mode
   * Locates the Address row and extracts the text content (includes Street, City, State, Country)
   * @returns Promise<string> - The full address text content
   */
  async getAddressReadonly(): Promise<string> {
    try {
      const addressText = await this.addressRow().textContent() || '';
      return addressText.trim();
    } catch (error) {
      console.error(`Error getting Address (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get Email value in readonly mode by finding the mailto link
   * @returns Promise<string> - The email address from the mailto link
   */
  async getEmailReadonly(): Promise<string> {
    try {
      // List view: email appears as plain text in a <td> (same pattern as clickOppRowByEmail)
      const emailTd = this.page.locator('xpath=//td[contains(text(),"@")]').first();
      const tdVisible = await emailTd.isVisible().catch(() => false);
      if (tdVisible) {
        return (await emailTd.textContent() || '').trim();
      }
      // Form view fallback: email rendered as a mailto anchor link
      const emailLink = this.page.locator('xpath=//a[contains(@href,"mailto:")]').first();
      const linkVisible = await emailLink.isVisible().catch(() => false);
      if (linkVisible) {
        return (await emailLink.textContent() || '').trim();
      }
      return '';
    } catch (error) {
      console.error(`Error getting Email (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Check if NEW QUOTATION button exists
   * @returns Promise<boolean> - true if button exists
   */
  async hasNewQuotationButton(): Promise<boolean> {
    const count = await this.newQuotationButton().count();
    return count > 0;
  }

  /**
   * Click NEW QUOTATION button
   * @param force - Whether to force the click (default: true)
   */
  async clickNewQuotation(force: boolean = true): Promise<void> {
    await this.newQuotationButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.newQuotationButton().click({});
  }

  /**
   * Remove "My Pipeline" default filter from the search bar
   * Clicks the × (delete) button on the "My Pipeline" facet in the search view
   * @param timeout - Max time to wait for the filter facet (default: 10000)
   */
  async removeMyPipelineFilter(timeout: number = 10000): Promise<void> {
    const deleteBtn = this.myPipelineFilterDeleteXPath();
    const exists = await deleteBtn.count() > 0;
    if (exists) {
      await deleteBtn.waitFor({ state: 'visible', timeout });
      await deleteBtn.click();
      await this.wait(CommonUtils.waitTimes.long);
      console.log('  ✓ "My Pipeline" filter removed');
    } else {
      console.log('  ⚠ "My Pipeline" filter not found, may already be cleared');
    }
    //Quoc Anh's comment: Added wait for the delete button to be hidden after clicking, to ensure the filter is fully removed before proceeding
    await deleteBtn.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Type an email in the search box and press Enter to filter the list
   * @param email - The email address to search for
   * @param timeout - Max time to wait for the search input (default: 10000)
   */
  async searchByEmail(email: string, timeout: number = 10000): Promise<void> {
    const input = this.searchViewInputXPath();
    await input.waitFor({ state: 'visible', timeout });
    await input.click();
    await input.clear();
    // Use pressSequentially to simulate real keystrokes so Odoo's event handlers fire
    await input.pressSequentially(email, { delay: 10 });
    await this.wait(CommonUtils.waitTimes.long);
    await input.press('Enter');
    await this.wait(CommonUtils.waitTimes.searchOppWait);
    console.log(`  ✓ Searched by email: ${email}`);
  }

  /**
   * Click the first Opportunity list row whose visible text contains the given email
   * @param email - The email address to look for in the row
   * @param timeout - Max time to wait for each row-presence check (default: 15000)
   */
  async clickOppRowByEmail(email: string, timeout: number = 30000): Promise<void> {
  // Find the td containing the email, go up to the row, then click the name cell (not the mailto td)
  const rowWithEmail = this.page.locator(
    `xpath=//td[contains(text(),'${email}')]`
  );
  const emailRowFound = await rowWithEmail.first().isVisible().catch(() => false);

  if (emailRowFound) {
    await rowWithEmail.first().waitFor({ state: 'visible', timeout });
    await rowWithEmail.first().scrollIntoViewIfNeeded();
    await rowWithEmail.first().click({ force: true });
    console.log(`  ✓ Clicked Opp row matching email: ${email}`);
  } else {
    // Fallback: the search already filtered by email so click the first result row
    console.log(`  ⚠ Email not visible as a column — clicking first search result row`);
    const firstRow = this.page.locator(
      `xpath=//table[contains(@class,'o_list_table')]//tr[contains(@class,'o_data_row')]`
    ).first();
    await firstRow.waitFor({ state: 'visible', timeout });
    await firstRow.click();
    console.log(`  ✓ Clicked first Opp row (filtered by email search)`);
  }

  await this.wait(CommonUtils.waitTimes.searchOppWait);
}
/**
   * Click the first Opportunity list row whose visible text contains the given opportunity name
   * @param oppName - The opportunity name to look for in the row
   * @param timeout - Max time to wait for each row-presence check (default: 15000)
   */
  async clickOppRowByOppName(oppName: string, timeout: number = 30000): Promise<void> {
  // Find the td containing the opportunity name, go up to the row, then click the name cell (not the mailto td)
  const rowWithOppName = this.page.locator(
    `xpath=//td[contains(text(),'${oppName}')]`
  );
  const oppNameRowFound = await rowWithOppName.first().isVisible().catch(() => false);

  if (oppNameRowFound) {
    await rowWithOppName.first().waitFor({ state: 'visible', timeout });
    await rowWithOppName.first().scrollIntoViewIfNeeded();
    await rowWithOppName.first().click({ force: true });
    console.log(`  ✓ Clicked Opp row matching opportunity name: ${oppName}`);
  } else {
    // Fallback: the search already filtered by opportunity name so click the first result row
    console.log(`  ⚠ Opportunity name not visible as a column — clicking first search result row`);
    const firstRow = this.page.locator(
      `xpath=//table[contains(@class,'o_list_table')]//tr[contains(@class,'o_data_row')]`
    ).first();
    await firstRow.waitFor({ state: 'visible', timeout });
    await firstRow.click();
    console.log(`  ✓ Clicked first Opp row (filtered by opportunity name search)`);
  }

  await this.wait(CommonUtils.waitTimes.searchOppWait);
}

  /**
   * Click the Filter dropdown button in the search bar
   */
  async clickFilterButton(): Promise<void> {
    const filterBtn = this.filterDropdownButton();
    await filterBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await filterBtn.click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Filter dropdown opened');
  }

  /**
   * Click "Add Custom Filter" option in the Filter dropdown
   */
  async clickAddCustomFilter(): Promise<void> {
    const addFilterLink = this.addCustomFilterLink();
    await addFilterLink.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await addFilterLink.click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Add Custom Filter clicked');
  }

  /**
   * Click the "Add a condition" button to add an OR branch to the current filter group
   */
  async clickAddCondition(): Promise<void> {
    const btn = this.buttonAddCondition();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Add a condition clicked');
  }

  /**
   * Select a field from Dropdown_List#1 in the custom filter row
   * @param fieldName - The label of the field to select (e.g., "Development required")
   */
  async selectCustomFilterField(fieldName: string): Promise<void> {
    const fieldSelect = this.customFilterFieldSelect();
    await fieldSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await fieldSelect.selectOption({ label: fieldName });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Custom filter field selected: ${fieldName}`);
  }

  /**
   * Select an operator from Dropdown_List#2 in the custom filter row
   * @param operator - The label of the operator to select (e.g., "is true", "is false")
   */
  async selectCustomFilterOperator(operator: string): Promise<void> {
    const operatorSelect = this.customFilterOperatorSelect();
    await operatorSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await operatorSelect.selectOption({ label: operator });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Custom filter operator selected: ${operator}`);
  }

  /**
   * Click the APPLY button to apply the custom filter
   */
  async clickApplyFilter(): Promise<void> {
    const applyBtn = this.applyFilterButton();
    await applyBtn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await applyBtn.click();
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Custom filter applied');
  }

  /**
   * Select a value from Dropdown_List#3 in the custom filter row.
   * Handles many2one autocomplete inputs and <select> elements.
   * @param value - The label/text of the value to select (e.g., "Thomas Semerich", "Belgium")
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

  /** Select field in the LAST filter row (after "Add a condition" creates a second OR row) */
  async selectLastCustomFilterField(fieldName: string): Promise<void> {
    const fieldSelect = this.customFilterFieldSelectLast();
    await fieldSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await fieldSelect.selectOption({ label: fieldName });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Last custom filter field selected: ${fieldName}`);
  }

  /** Select operator in the LAST filter row */
  async selectLastCustomFilterOperator(operator: string): Promise<void> {
    const operatorSelect = this.customFilterOperatorSelectLast();
    await operatorSelect.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await operatorSelect.selectOption({ label: operator });
    await this.wait(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Last custom filter operator selected: ${operator}`);
  }

  /** Select value in the LAST filter row (handles both many2one input and <select>) */
  async selectLastCustomFilterValue(value: string): Promise<void> {
    const inputEl  = this.customFilterValueInputLast();
    const selectEl = this.customFilterValueSelectLast();
    const isInput  = await inputEl.isVisible({ timeout: 2000 }).catch(() => false);
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
    console.log(`  ✓ Last custom filter value selected: ${value}`);
  }

  /**
   * Check if the list view shows the empty-state placeholder
   * ("Create an opportunity in your pipeline" / no records)
   * @returns true if no records are shown
   */
  async isListEmpty(): Promise<boolean> {
    const placeholder = this.emptyListPlaceholder();
    return await placeholder.isVisible({ timeout: 3000 }).catch(() => false);
  }

  /**
   * Check if the list view has no data rows (works for any list page, not just Leads)
   * @returns true if no data rows are found
   */
  async isRecordListEmpty(): Promise<boolean> {
    const firstRowVisible = await this.dataRowsLocator().first().isVisible({ timeout: 3000 }).catch(() => false);
    return !firstRowVisible;
  }

  /**
   * Click the "View list" button if it is visible (does NOT require kanban URL)
   * Use this when switching to list view from any module (e.g., Contacts, Leads)
   */
  async clickViewListButtonIfVisible(timeout: number = 5000): Promise<void> {
    const btn = this.viewListButton();
    const isVisible = await btn.isVisible({ timeout }).catch(() => false);
    if (isVisible) {
      await btn.click();
      await this.wait(CommonUtils.waitTimes.standard);
      console.log('  ✓ "View list" button clicked');
    } else {
      console.log('  ⚠ "View list" button not visible, already in list view');
    }
  }

  /**
   * Click the header "select all" checkbox in the list view
   */
  async clickSelectAllCheckbox(): Promise<void> {
    // The checkbox input is visually hidden via Odoo's Bootstrap custom-control pattern.
    // Strategy 1: JS click on the input (bypasses visibility/size checks)
    // Strategy 2: force-click the <th> cell as fallback
    const input = this.selectAllCheckboxInput();
    const attached = await input.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
    if (attached) {
      await input.evaluate((el: HTMLInputElement) => el.click());
      await this.wait(500);
      // Verify it got checked; if not, try force-clicking the th
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
   * Click on CRM menu link from CRM page to go back to CRM home/dashboard
   */
  async clickCRMMenuLink(): Promise<void> {
    await this.crmMenuLink_CRM_Module().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.crmMenuLink_CRM_Module().click();
    await this.wait(CommonUtils.waitTimes.long);
  }

  async clickConfigurationMenu(): Promise<void> {
    await this.crmConfigurationMenu().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.crmConfigurationMenu().click();
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Clicked Configuration menu');
  }

  async clickReAssignationMenuItem(): Promise<void> {
    await this.reAssignationMenuItem().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.reAssignationMenuItem().click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.wait(CommonUtils.waitTimes.standard);
    console.log('  ✓ Clicked Re-assignation menu item');
  }

  /**
   * Click the "Qualification info" tab
   */
  async clickQualificationInfoTab(): Promise<void> {
    await this.wait(500);
    await this.qualificationInfoTab().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.qualificationInfoTab().scrollIntoViewIfNeeded();
    await this.qualificationInfoTab().click();
    await this.wait(500);
  }

  /**
   * Fill an integer field inside a table row by locator
   */
  private async fillIntegerField(locatorFn: () => import('@playwright/test').Locator, value: string): Promise<void> {
    const input = locatorFn();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.fill(value);
    await this.wait(300);
  }

  /** Fill Environment fields inside Qualification info tab */
  async fillQualEnvSocket(value: string)      { await this.fillIntegerField(this.qualEnvSocketInput, value); }
  async fillQualEnvVms(value: string)          { await this.fillIntegerField(this.qualEnvVmsInput, value); }
  async fillQualEnvPhysicalHosts(value: string){ await this.fillIntegerField(this.qualEnvPhysicalInput, value); }
  async fillQualEnvAwsEc2(value: string)       { await this.fillIntegerField(this.qualEnvAwsInput, value); }
  async fillQualEnvWorkstations(value: string) { await this.fillIntegerField(this.qualEnvWorkstationsInput, value); }
  async fillQualEnvOffice365(value: string)    { await this.fillIntegerField(this.qualEnvOffice365Input, value); }
  async fillQualEnvOracle(value: string)       { await this.fillIntegerField(this.qualEnvOracleInput, value); }
  async fillQualEnvTb(value: string)           { await this.fillIntegerField(this.qualEnvTbInput, value); }

  /**
   * Select Licensing Model from the dropdown in Qualification info tab
   * @param value - The label of the option (e.g., 'Perpetual')
   */
  async selectQualInfoLicensingModel(value: string): Promise<void> {
    const sel = this.qualInfoLicensingSelect();
    await sel.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await sel.selectOption({ label: value });
    await this.wait(300);
  }

  /**
   * Fill a text/many2one field in the Info section by locator
   */
  private async fillInfoTextField(locatorFn: () => import('@playwright/test').Locator, value: string): Promise<void> {
    const input = locatorFn();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.pressSequentially(value, { delay: 50 });
    await this.page.keyboard.press('Tab');
    await this.wait(300);
  }

  private async fillMany2OneField(locatorFn: () => import('@playwright/test').Locator, value: string): Promise<void> {
    const input = locatorFn();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.pressSequentially(value, { delay: 50 });
    const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]')
      .filter({ hasText: new RegExp(`^${value}$`) })
      .first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click();
    await this.wait(300);
  }

  async fillQualInfoUseCase(value: string)        { await this.fillInfoTextField(this.qualInfoUseCaseInput, value); }
  async fillQualInfoRequirement(value: string)    { await this.fillInfoTextField(this.qualInfoRequirementInput, value); }
  async fillQualInfoCurrentSolution(value: string){ await this.fillMany2OneField(this.qualInfoCurrentSolutionInput, value); }
  async fillQualInfoCompetitor(value: string)     { await this.fillMany2OneField(this.qualInfoCompetitorInput, value); }

  /**
   * Fill the Expected Closing date field
   * @param dateStr - Date in MM/DD/YYYY format (Odoo's default locale)
   */
  async fillExpectedClosing(dateStr: string): Promise<void> {
    const input = this.expectedClosingInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click({ clickCount: 3 });
    await input.pressSequentially(dateStr, { delay: 50 });
    await this.page.keyboard.press('Tab');
    await this.wait(300);
  }

  /**
   * Read the Expected Revenue value from the Opportunity form.
   * Handles both input (edit mode) and span (read mode) renderings.
   * @returns parsed numeric value, or 0 if not found
   */
  async getExpectedRevenue(): Promise<number> {
    const el = this.expectedRevenueXPath();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const tagName = await el.evaluate((node) => node.tagName.toLowerCase());
    const raw = tagName === 'input'
      ? await el.inputValue().catch(() => '0')
      : await el.innerText().catch(() => '0');
    const value = parseFloat(raw.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - Expected Revenue: ${value} (raw: "${raw.trim()}")`);
    return value;
  }

  /**
   * Read the Expected After Probability (prorated revenue) value from the Opportunity form.
   * Handles both input (edit mode) and span (read mode) renderings.
   * @returns parsed numeric value, or 0 if not found
   */
  async getExpectedAfterProbability(): Promise<number> {
    const el = this.proratedRevenueXPath();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const tagName = await el.evaluate((node) => node.tagName.toLowerCase());
    const raw = tagName === 'input'
      ? await el.inputValue().catch(() => '0')
      : await el.innerText().catch(() => '0');
    const value = parseFloat(raw.trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')) || 0;
    console.log(`  - Expected After Probability: ${value} (raw: "${raw.trim()}")`);
    return value;
  }

  /**
   * Read the Probability (%) value from the Opportunity form.
   * Returns a number 0–100 (e.g. 50 means 50%).
   * @returns parsed numeric probability, or 0 if not found
   */
  async getProbability(): Promise<number> {
    const el = this.probabilityXPath();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await el.innerText().catch(() => '0');
    const value = parseFloat(raw.trim().replace(/[^0-9.]/g, '')) || 0;
    console.log(`  - Probability: ${value}% (raw: "${raw.trim()}")`);
    return value;
  }
}

