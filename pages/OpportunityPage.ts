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
  // Contact Name input (XPath primary, CSS fallback) - the visible editable field on the Opp form
  private readonly contactNameInputXPath = () => this.page.locator("xpath=//input[@name='contact_name']").filter({ visible: true }).first();
  private readonly contactNameInputCss = () => this.page.locator('input[name="contact_name"]').filter({ visible: true }).first();
  private readonly streetInput = () => this.page.locator('xpath=(//input[@name="street"])[2]');
  private readonly countryInputXPath = () => this.page.locator("xpath=(//div[contains(@class,'address_country')])[2]/div/input");
  private readonly stateInputXPath = () => this.page.locator("xpath=(//div[contains(@class,'address_state')])[2]/div/input");
  private readonly createdManuallyCheckbox = () => this.createdManuallyRow().locator('input[type="checkbox"]').first();
// Opp page locators
  private readonly salesTeamSelect = () => this.page.locator('select[name="team_id"]').or(this.page.locator('combobox:has-text("Sales Team")').locator('select')).or(this.page.getByLabel('Sales Team')).first();
  private readonly salespersonInput = () => this.page.getByRole('textbox', { name: 'Salesperson' }).first();
  private readonly crmDeveloperTab = () => this.page.getByRole('tab', { name: 'CRM Developer' }).first();
  // "Lead Form": pre-prod = Studio field x_studio_lead_sorce (rendered twice, the 2nd is the Opp form),
  // O12 CE Migration server = module field `lead_form` (char). Accept both so one method fits both hosts.
  private readonly leadFormInput = () => this.page.locator('xpath=(//input[@name="x_studio_lead_sorce"])[2]')
    .or(this.page.locator('xpath=(//input[@name="lead_form"])[last()]'))
    .first();
  // "IP" (x_studio_ip_lead_source) char field on the Opp form. XPath primary, CSS fallback.
  private readonly ipInputXPath = () => this.page.locator("xpath=//input[@name='x_studio_ip_lead_source']").first();
  private readonly ipInputCss = () => this.page.locator("input[name='x_studio_ip_lead_source']").first();
  private readonly saveButton = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  private readonly dropdownOption = () => this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  private readonly contactFieldXPath = () => this.page.locator("xpath=(//a[@name='contact_partner_id'])[2]");
  private readonly companyFieldXPath  = () => this.page.locator("xpath=(//a[@name='partner_id'])[2]");

  // --- Chatter composer locators (backend Opp chatter: Send message / Log note). XPath primary, CSS fallback. ---
  private readonly sendMessageButtonXPath = () => this.page.locator("xpath=//button[contains(@class,'o_chatter_button_new_message')]").first();
  private readonly sendMessageButtonCss = () => this.page.locator("button.o_chatter_button_new_message").first();
  private readonly logNoteButtonXPath = () => this.page.locator("xpath=//button[contains(@class,'o_chatter_button_log_note')]").first();
  private readonly logNoteButtonCss = () => this.page.locator("button.o_chatter_button_log_note").first();
  private readonly composerTextareaXPath = () => this.page.locator("xpath=//div[contains(@class,'o_thread_composer')]//textarea[contains(@class,'o_composer_text_field')]").first();
  private readonly composerTextareaCss = () => this.page.locator("div.o_thread_composer textarea.o_composer_text_field").first();
  private readonly composerSendButtonXPath = () => this.page.locator("xpath=//div[contains(@class,'o_thread_composer')]//button[contains(@class,'o_composer_button_send')]").first();
  private readonly composerSendButtonCss = () => this.page.locator("div.o_thread_composer button.o_composer_button_send").first();
  private readonly composerSuggestedPartnersXPath = () => this.page.locator("xpath=//div[contains(@class,'o_thread_composer')]//div[contains(@class,'o_composer_suggested_partners')]").first();
  private readonly composerSuggestedPartnersCss = () => this.page.locator("div.o_thread_composer div.o_composer_suggested_partners").first();
  private readonly composerInfoXPath = () => this.page.locator("xpath=//div[contains(@class,'o_thread_composer')]//small[contains(@class,'o_chatter_composer_info')]").first();
  private readonly createdManuallyRow = () => this.page.locator('tr:has-text("Create manually")');
  // "Create manually" (is_create_manual) boolean checkbox. The whole widget is often hidden
  // (o_invisible_modifier) on a fresh Opp, so it must be toggled via JS, not a click. XPath primary, CSS fallback.
  private readonly createManualCheckboxXPath = () => this.page.locator("xpath=//div[@name='is_create_manual']//input[@type='checkbox']").first();
  private readonly createManualCheckboxCss = () => this.page.locator("div[name='is_create_manual'] input[type='checkbox']").first();
  private readonly dealElementButton = () => this.page.getByRole('button', { name: 'DEAL ELEMENT' }).or(this.page.getByRole('button', { name: 'Deal Element' })).first();
  private readonly newQuotationButton = () => this.page.getByRole('button', { name: /NEW QUOTATION/i }).or(this.page.getByRole('button', { name: /New Quotation/i })).first();
  // "REQUEST SE SUPPORT" button on the Opp form (opens the "New Ticket" window). XPath primary, role fallback.
  private readonly requestSESupportButtonXPath = () => this.page.locator("xpath=//button[contains(normalize-space(.),'REQUEST SE SUPPORT') or contains(normalize-space(.),'Request SE Support')]").first();
  private readonly requestSESupportButtonRole = () => this.page.getByRole('button', { name: /REQUEST SE SUPPORT/i }).first();
  // Edit-mode input for the header "Expected Revenue" amount (name=planned_revenue_custom, the "$X at Y% = $Z"). XPath primary, CSS fallback.
  private readonly expectedRevenueDealInputXPath = () => this.page.locator("xpath=//input[@name='planned_revenue_custom'] | //*[@name='planned_revenue_custom']//input").first();
  private readonly expectedRevenueDealInputCss = () => this.page.locator("input[name='planned_revenue_custom'], [name='planned_revenue_custom'] input").first();
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
// Stage "New" indicator tolerant of statusbar button OR link/field rendering (a converted Opp shows it as a crm.stage link)
private readonly stageNewIndicator = () => this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='New'] | //div[contains(@class,'o_statusbar_status')]//a[normalize-space()='New'] | //a[contains(@href,'model=crm.stage') and normalize-space()='New']").first();
private readonly stageHotDeal = () => this.page.locator("xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='Hot Deal']");
private readonly stageByName = (stageName: string) => this.page.locator(`xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='${stageName}']`);
private readonly stageMoreButton = () => this.page.locator("xpath=//div[contains(@name,'stage_id')]/button[normalize-space()='MORE' or normalize-space()='More']");
private readonly stageOptionByName = (stageName: string) => this.page.locator(`xpath=//div[contains(@class,'o_statusbar_status')]//button[normalize-space()='${stageName}'] | //ul[contains(@class,'dropdown-menu')]//a[normalize-space()='${stageName}'] | //div[contains(@class,'dropdown-menu')]//button[normalize-space()='${stageName}']`);


private readonly leadFormField = () => this.page.locator('xpath=(//span[@name="x_studio_lead_sorce"])[2]')
    .or(this.page.locator('xpath=(//span[@name="lead_form"])[last()]'))
    .first();
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
  // Odoo's jQuery blockUI full-page overlay shown during an RPC (e.g. a mass delete + list reload). It
  // intercepts pointer events, so any real click while it is up hangs and retries until the timeout.
  private readonly blockOverlay = () =>
    this.page.locator('div.blockOverlay, div.blockUI');
  // Search-view facet chips (the applied filters shown in the search bar, e.g. "Reseller is equal to X").
  private readonly searchFacets = () =>
    this.page.locator('.o_searchview_facet, .o_facet_values');
  private readonly crmMenuLink_CRM_Module = () => this.page.locator('xpath=//a[@class="o_menu_brand" and text()="CRM"]').first();
  private readonly crmConfigurationMenu = () =>
    this.page.locator('xpath=//a[@class="dropdown-toggle o-no-caret o_menu_header_lvl_1" and @data-menu-xmlid="crm.crm_menu_config"]').first();
  private readonly reAssignationMenuItem = () =>
    this.page.locator('xpath=//a[normalize-space()="Re-assignation"]').first();
  // Server error dialog (e.g. "Odoo Server Error" on invalid save)
  private readonly serverErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'o_dialog_warning modal-body')]");

  // Mass Mark as Lost/Duplicate - list row selection, Action menu option, wizard & approval (CRM-10733)
  // A single list row identified by the (unique) Opportunity name in any data cell.
  private readonly oppRowByName = (name: string) =>
    this.page.locator(`xpath=//tr[contains(@class,'o_data_row')][.//td[contains(@class,'o_data_cell') and contains(normalize-space(.),"${name}")]]`);
  private readonly oppRowCheckboxByName = (name: string) =>
    this.oppRowByName(name).locator("xpath=.//td[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  // The selection-dependent Action dropdown toggle - hidden until >=1 row is selected (unambiguous
  // signal that a row selection registered). Primary: the o_dropdown_toggler_btn; fallback: any
  // "Action" button inside the control-panel action-menus container.
  private readonly listSelectionActionToggle = () =>
    this.page.locator("xpath=//button[contains(@class,'o_dropdown_toggler_btn') and (normalize-space()='Action' or normalize-space()='ACTION')] | //div[contains(@class,'o_cp_action_menus')]//button[normalize-space()='Action' or normalize-space()='ACTION']").first();
  // An Action-dropdown menu item by exact visible text (exact match avoids "... and Deactivate").
  private readonly actionMenuOptionByText = (text: string) =>
    this.page.locator(`xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[@role='menuitem' and normalize-space()="${text}"] | //a[@role='menuitem' and normalize-space()="${text}"]`).first();
  // Mass Mark wizard (modal): title, lead count, required Lost Reason combobox, Confirm button.
  private readonly massMarkWizardTitle = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//h4[contains(@class,'modal-title')]").first();
  private readonly massMarkWizardLeadCount = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//span[@name='lead_count']").first();
  private readonly massMarkLostReasonInput = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//div[@name='lost_reason_id']//input[contains(@class,'o_input')]").first();
  private readonly massMarkConfirmButton = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//button[@name='action_apply']").first();
  // Approval Status (state) field on the Opportunity form (CRM Developer tab).
  private readonly approvalStatusField = () =>
    this.page.locator("xpath=//tr[td/label[normalize-space()='Approval Status']]//span[@name='state'] | //span[@name='state']").first();
  // The boolean "active" field on the Opportunity form (CRM Developer tab). An archived/deactivated
  // record has active=false. Odoo may render two inputs (hidden + visible toggle); read the last one.
  private readonly opportunityActiveInputs = () =>
    this.page.locator("xpath=//div[@name='active']//input | //input[@name='active']");
  // Visibility & Access (CRM-10601 section 3): generic helpers to read Action-menu option labels.
  // The checkbox of the FIRST data row in a list (select any 1 record to reveal the list Action menu).
  private readonly firstListRowCheckbox = () =>
    this.page.locator("xpath=(//tr[contains(@class,'o_data_row')])[1]//td[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();
  // The first clickable data cell of the first row (to open that record's form/detail view).
  private readonly firstListRowFirstCell = () =>
    this.page.locator("xpath=(//tr[contains(@class,'o_data_row')])[1]//td[contains(@class,'o_data_cell')][1]").first();
  // Every option label in the currently-open Action dropdown (list toolbar OR form control panel).
  private readonly openActionMenuItems = () =>
    this.page.locator("xpath=//div[contains(@class,'dropdown-menu') and contains(@class,'show')]//a[@role='menuitem']");
  // The "Action" dropdown button on a record FORM (control panel) - text label "Action".
  private readonly formActionMenuButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_control_panel')]//button[normalize-space()='Action']").first();
  // Mass Mark wizard: Cancel button, Lost Reason autocomplete options, and the error popup.
  private readonly massMarkCancelButton = () =>
    this.page.locator("xpath=//div[contains(@class,'modal') and contains(@class,'show')]//footer//button[@special='cancel'] | //div[contains(@class,'modal') and contains(@class,'show')]//footer//button[normalize-space()='Cancel'] | //div[contains(@class,'modal') and contains(@class,'show')]//button[normalize-space()='Cancel']").first();
  private readonly massMarkLostReasonOptions = () =>
    this.page.locator(".ui-menu-item, .o_m2o_dropdown_option, li[role='option']");
  // Error/validation popup shown when a Mass Mark is invalid (e.g. a Won lead is selected).
  private readonly massMarkErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'o_error_dialog')] | //div[contains(@class,'modal') and contains(@class,'show')][.//h4[contains(.,'Error') or contains(.,'Warning') or contains(.,'Invalid') or contains(.,'User Error')] or .//div[contains(@class,'o_dialog_warning')]]//div[contains(@class,'modal-body')]").first();

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

  // Assigned Partner tab + field (UC-A-1: Reseller product registration). XPath primary, CSS fallback.
  private readonly assignedPartnerTabXPath = () =>
    this.page.locator("xpath=//a[contains(@class,'nav-link') and normalize-space()='Assigned Partner']").first();
  private readonly assignedPartnerTabCss = () =>
    this.page.locator("a.nav-link").filter({ hasText: 'Assigned Partner' }).first();
  private readonly assignedPartnerInputXPath = () =>
    this.page.locator("xpath=//div[@name='partner_assigned_id']//input[contains(@class,'o_input')]").first();
  private readonly assignedPartnerInputCss = () =>
    this.page.locator("div[name='partner_assigned_id'] input.o_input").first();
  // Readonly (after save) renderings of the Assigned Partner value. Odoo renders a readonly Many2one
  // as <a name="partner_assigned_id"> (sometimes span/div), NOT a div wrapper - match all forms.
  private readonly assignedPartnerValueXPath = () =>
    this.page.locator("xpath=//a[@name='partner_assigned_id'] | //span[@name='partner_assigned_id'] | //div[@name='partner_assigned_id']//a | //div[@name='partner_assigned_id']").first();

  // Internal Notes tab + description textarea. XPath primary, CSS fallback.
  private readonly internalNotesTabXPath = () =>
    this.page.locator("xpath=//a[contains(@class,'nav-link') and normalize-space()='Internal Notes']").first();
  private readonly internalNotesTabCss = () =>
    this.page.locator("a.nav-link").filter({ hasText: 'Internal Notes' }).first();
  private readonly internalNotesTextareaXPath = () =>
    this.page.locator("xpath=//textarea[@name='description']").first();
  private readonly internalNotesTextareaCss = () =>
    this.page.locator("textarea[name='description']").first();

  // Customer "Phone" (crm.lead.phone) field on the Opp form. Odoo phone widget:
  //   readonly -> <a name="phone" href="tel:<value>">value</a> (text/href = "false" when blank);
  //   edit     -> <input name="phone">.
  // The field is rendered more than once (visible + invisible blocks), so read across all. XPath primary, CSS fallback.
  private readonly phoneInputXPath = () => this.page.locator("xpath=//input[@name='phone']").first();
  private readonly phoneInputCss = () => this.page.locator("input[name='phone']").first();
  private readonly phoneAnchorsXPath = () => this.page.locator("xpath=//a[@name='phone'] | //span[@name='phone']");
  private readonly phoneAnchorsCss = () => this.page.locator("a[name='phone'], span[name='phone']");
  // Customer "Mobile" (crm.lead.mobile) field - same Odoo phone widget as Phone. XPath primary, CSS fallback.
  private readonly mobileInputXPath = () => this.page.locator("xpath=//input[@name='mobile']").first();
  private readonly mobileInputCss = () => this.page.locator("input[name='mobile']").first();
  private readonly mobileAnchorsXPath = () => this.page.locator("xpath=//a[@name='mobile'] | //span[@name='mobile']");
  private readonly mobileAnchorsCss = () => this.page.locator("a[name='mobile'], span[name='mobile']");
  // "Expected Closing" (date_deadline) field. Edit: <input name="date_deadline">; readonly: <span name="date_deadline">.
  private readonly expectedClosingInputXPath = () => this.page.locator("xpath=//input[@name='date_deadline']").first();
  private readonly expectedClosingSpanXPath = () => this.page.locator("xpath=//span[@name='date_deadline']").first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Switch from kanban to list view
   */
  async switchToListView() {
    await this.waitForURL('**/web?*view_type=kanban*', CommonUtils.waitTimes.pageLoad);
    await this.viewListButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    // A loading mask / "Odoo Client Error" modal can sit over the toolbar and intercept the
    // click (observed: 900s timeout - blockUI then o_technical_modal intercepting pointer
    // events on CRM-457_3.1.1.5). Clear them so the click lands on the button, not the overlay.
    await this.dismissErrorDialog();
    await this.waitForLoadingOverlayHidden();
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
   * Fill the "Contact Name" field on the Opportunity form.
   * XPath primary, CSS fallback. Returns true if the field was found and filled.
   * @param name - the contact name to enter
   */
  async fillContactName(name: string): Promise<boolean> {
    let target = this.contactNameInputXPath();
    const visibleByXPath = await target.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) {
      target = this.contactNameInputCss();
      const visibleByCss = await target.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
      if (!visibleByCss) {
        console.log('  ⚠ Contact Name field not found on the Opportunity form');
        return false;
      }
    }
    await target.fill('');
    await target.fill(name);
    await this.wait(CommonUtils.waitTimes.short);
    return true;
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
   * Set the "Create manually" (is_create_manual) boolean to the desired state and confirm it stuck.
   * The field is frequently hidden (o_invisible_modifier) on a fresh Opp, so a click does not work;
   * set the checkbox state via JS and dispatch click + change so Odoo's boolean widget registers it
   * (the value then persists through save). XPath primary, CSS fallback.
   * @param checked - desired state (false = unchecked / "Create manually" = FALSE)
   * @returns true if the field ended in the desired state
   */
  async setCreatedManually(checked: boolean): Promise<boolean> {
    let input = this.createManualCheckboxXPath();
    if (!(await input.count() > 0)) input = this.createManualCheckboxCss();
    if (!(await input.count() > 0)) {
      console.log('  ⚠ "Create manually" (is_create_manual) field not found');
      return false;
    }
    const current = await input.isChecked().catch(() => null);
    if (current === checked) {
      console.log(`  - "Create manually" already ${checked} - no change needed`);
      return true;
    }
    await input.evaluate((el, value) => {
      const cb = el as HTMLInputElement;
      cb.checked = value as boolean;
      cb.dispatchEvent(new Event('click', { bubbles: true }));
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);
    await this.wait(CommonUtils.waitTimes.medium);
    const after = await input.isChecked().catch(() => null);
    console.log(`  - "Create manually" set to ${checked} (was ${current}, now ${after})`);
    return after === checked;
  }

  /**
   * Read the current "Create manually" (is_create_manual) checkbox state.
   * @returns true/false, or null if the field is not present
   */
  async isCreatedManuallyChecked(): Promise<boolean | null> {
    let input = this.createManualCheckboxXPath();
    if (!(await input.count() > 0)) input = this.createManualCheckboxCss();
    if (!(await input.count() > 0)) return null;
    return await input.isChecked().catch(() => null);
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
        // On some Opp forms "Create manually" is checked but hidden (o_invisible_modifier) and
        // therefore not UI-togglable. Don't force-click a hidden control (it throws); skip gracefully.
        const control = row.locator('label, .custom-control').first();
        const controlVisible = await control.isVisible().catch(() => false);
        if (!controlVisible) {
          console.log('  ⚠ "Create manually" is checked but hidden (o_invisible_modifier) - cannot toggle via UI; leaving as-is');
          return false;
        }
        await control.click({ force: true });
        await this.wait(CommonUtils.waitTimes.medium);
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
        // Skip when the control is hidden (o_invisible_modifier) - a force-click on a non-visible
        // element throws and it cannot be toggled via the UI anyway.
        const control = row.locator('label, .custom-control').first();
        const controlVisible = await control.isVisible().catch(() => false);
        if (!controlVisible) {
          console.log('  ⚠ "Create manually" is hidden before save - cannot toggle via UI; leaving as-is');
          return false;
        }
        await control.click({ force: true });
        await this.wait(CommonUtils.waitTimes.medium);
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
   * Click the "REQUEST SE SUPPORT" button on the Opportunity form to open the "New Ticket" window.
   * XPath primary, role fallback.
   */
  async clickRequestSESupport(): Promise<void> {
    await this.dismissErrorDialog();
    let button = this.requestSESupportButtonXPath();
    if (!(await button.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) {
      button = this.requestSESupportButtonRole();
    }
    await button.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await button.scrollIntoViewIfNeeded();
    await button.click({ force: true });
  }

  /**
   * Fill the header "Expected Revenue" (Deal) amount while the Opp form is in EDIT mode.
   * Field name = planned_revenue_custom (the "$X.XX at Y% = $Z" header amount). XPath primary, CSS fallback.
   * Presses Tab afterwards to commit the value and trigger the weighted-revenue recompute.
   * @param amount - the value to enter, e.g. '50'
   */
  async fillExpectedRevenueDeal(amount: string): Promise<void> {
    await this.dismissErrorDialog();
    let input = this.expectedRevenueDealInputXPath();
    if (!(await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      input = this.expectedRevenueDealInputCss();
    }
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(amount);
    await this.wait(CommonUtils.waitTimes.short);
    // Commit + recompute the weighted revenue.
    await this.page.keyboard.press('Tab');
    await this.wait(CommonUtils.waitTimes.medium);
    console.log(`  - Expected Revenue (Deal) set to: ${amount}`);
  }

  /**
   * Read the presence + disabled state of the "REQUEST SE SUPPORT" button on the Opp form.
   * A greyed/non-clickable button is reported as { present: true, disabled: true }.
   * XPath primary, role fallback.
   */
  async getRequestSESupportState(): Promise<{ present: boolean; disabled: boolean }> {
    await this.dismissErrorDialog();
    let button = this.requestSESupportButtonXPath();
    let present = await button.isVisible({ timeout: CommonUtils.waitTimes.elementVisibility }).catch(() => false);
    if (!present) {
      button = this.requestSESupportButtonRole();
      present = await button.isVisible({ timeout: CommonUtils.waitTimes.short }).catch(() => false);
    }
    if (!present) {
      return { present: false, disabled: false };
    }
    await button.scrollIntoViewIfNeeded().catch(() => {});
    const disabled = await button.evaluate((el) => {
      const b = el as HTMLButtonElement;
      const cls = (b.className || '').toString().toLowerCase();
      return b.disabled === true
        || b.hasAttribute('disabled')
        || b.getAttribute('aria-disabled') === 'true'
        || cls.includes('disabled')
        || window.getComputedStyle(b).pointerEvents === 'none';
    }).catch(() => false);
    return { present, disabled };
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
   * Verify the "New" stage is present on the Opportunity status bar - used as the
   * signal that a Lead was converted to an Opportunity successfully.
   * @returns true if the New stage button becomes visible within the wait budget.
   */
  async isStageNewVisible(): Promise<boolean> {
    try {
      await this.stageNewIndicator().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
      return true;
    } catch {
      return false;
    }
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
   * Fill the "IP" (x_studio_ip_lead_source) field on the Opportunity form. XPath primary, CSS fallback.
   * @param ip - the IP value (e.g. from the deal-registration Internal Note)
   */
  async fillIP(ip: string): Promise<void> {
    let input = this.ipInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) input = this.ipInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.scrollIntoViewIfNeeded();
    await input.fill('');
    await input.fill(ip);
    await this.wait(CommonUtils.waitTimes.short);
  }

  /**
   * Read the "IP" (x_studio_ip_lead_source) value on the Opp form (input value in edit, text in readonly).
   * @returns the IP string, or "" if not found
   */
  async getIpReadonly(): Promise<string> {
    let input = this.ipInputXPath();
    if (!(await input.count() > 0)) input = this.ipInputCss();
    if (await input.count() > 0) {
      const v = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '');
      if (v && v.trim()) return v.trim();
    }
    const span = this.page.locator("xpath=//span[@name='x_studio_ip_lead_source']").first();
    if (await span.count() > 0) {
      return ((await span.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').trim();
    }
    return '';
  }

  /**
   * Read the deal-registration banner/alert text on the Opp form, e.g.
   * "This deal has been registered by <partner>. ... has to be approved by <date>.". Returns "" if absent.
   */
  async getDealRegistrationBanner(): Promise<string> {
    const alert = this.page.locator(
      "xpath=//div[contains(@class,'alert')][contains(normalize-space(.),'deal has been registered') or contains(normalize-space(.),'deal registration')]"
    ).first();
    if (!(await alert.count() > 0)) return '';
    return ((await alert.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
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
   * Get the Contact field value (contact_partner_id).
   * Returns the text content of the Contact hyperlink on the Opp form, or null if absent.
   */
  async getContactFieldValue(): Promise<string | null> {
    try {
      const contactField = this.contactFieldXPath();
      const exists = await contactField.count() > 0;
      if (exists) {
        return (await contactField.textContent().catch(() => ''))?.trim() ?? '';
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
   * Return the name of the currently-active (highlighted) Stage on the Opp status bar, e.g. "New".
   * Used to assert an Opp did NOT advance when a stage change is blocked (CRM-12059 regression).
   */
  async getActiveStageName(): Promise<string> {
    const active = this.page.locator('.o_statusbar_status .btn-primary, .o_statusbar_status .o_arrow_button_current').first();
    return ((await active.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Return the full status-bar text (all stage labels, incl. the MORE dropdown toggle), e.g.
   * "MORE LOST ACTIVATED ... NEW". Used to check whether a pipeline includes a given stage
   * (CRM-12059 - the "Activated" stage only exists in the reseller/partner funnel).
   */
  async getStatusBarText(): Promise<string> {
    return ((await this.page.locator('.o_statusbar_status').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
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
    totalMaxTime: number = 300000,
    field: 'company' | 'contact' = 'company'
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

      // Verify the target field contains expected text (Company field by default; Contact field when field='contact')
      try {
        contactValue = field === 'contact'
          ? await this.getContactFieldValue()
          : await this.getCompanyFieldValue();

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
   * Refresh the Opp form until the "Contact" field (contact_partner_id) contains the
   * expected contact name (case-insensitive). Use this after saving an Opp that set a
   * "Contact Name", to confirm the async-created Contact is linked with that name.
   * @param expectedName - the Contact name expected in the Contact field
   * @param maxAttempts - number of refresh attempts (default: 5)
   * @param refreshInterval - wait between refreshes (default: contactCreationWait = 60s)
   * @param totalMaxTime - hard cap for all attempts (default: contactRefreshTotalWait = 5 min)
   * @returns { contactFieldFound, contactValue }
   */
  async waitForContactFieldEquals(
    expectedName: string,
    maxAttempts: number = 5,
    refreshInterval: number = CommonUtils.waitTimes.contactCreationWait,
    totalMaxTime: number = CommonUtils.waitTimes.contactRefreshTotalWait
  ): Promise<{ contactFieldFound: boolean; contactValue: string | null }> {
    return this.waitForContactFieldPopulated(expectedName, maxAttempts, refreshInterval, totalMaxTime, 'contact');
  }

  /**
   * Refresh the Opp form until BOTH the "Company" (partner_id) and "Contact" (contact_partner_id)
   * fields are populated (non-empty) after save. On a deal-registration Opp, filling Email triggers
   * background Company/Contact (partner) creation; reading or acting on the record before those exist
   * yields incomplete partner data (e.g. opening the Deal Element auto-populates an empty/invalid
   * End User, which then blocks the Deal Element save). Call this AFTER saving the Opp and BEFORE
   * opening the Deal Element (mirrors the manual "Refresh until Company and Contact are populated").
   * Reloads up to maxAttempts times, waiting refreshInterval between attempts.
   * @param maxAttempts - number of reload attempts (default: 12)
   * @param refreshInterval - wait between reloads (default: searchOppWait = 5s)
   * @returns { populated, companyValue, contactValue }
   */
  async waitForCompanyAndContactPopulated(
    maxAttempts: number = 12,
    refreshInterval: number = CommonUtils.waitTimes.searchOppWait
  ): Promise<{ populated: boolean; companyValue: string; contactValue: string }> {
    const isFilled = (v: string | null) =>
      !!v && v.trim() !== '' && v.trim().toLowerCase() !== 'false';
    let companyValue = '';
    let contactValue = '';

    // Dismiss any open autocomplete dropdown that could block the reload.
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  - Company/Contact populate check, attempt ${attempt}/${maxAttempts}`);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.waitForPageReady(CommonUtils.waitTimes.contactShowing);
      await this.getContactField().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});

      companyValue = (await this.getCompanyFieldValue().catch(() => '')) ?? '';
      contactValue = (await this.getContactFieldValue().catch(() => '')) ?? '';
      console.log(`    Company: "${companyValue?.trim()}" | Contact: "${contactValue?.trim()}"`);

      if (isFilled(companyValue) && isFilled(contactValue)) {
        console.log('  ✓ Company and Contact are both populated');
        return { populated: true, companyValue: companyValue.trim(), contactValue: contactValue.trim() };
      }

      if (attempt < maxAttempts) {
        await this.wait(refreshInterval);
      }
    }

    console.log('  ⚠ Company and/or Contact were not populated within the allotted attempts');
    return { populated: false, companyValue: (companyValue ?? '').trim(), contactValue: (contactValue ?? '').trim() };
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
      const leadFormInputElement = leadFormCell.locator('input[name="x_studio_lead_sorce"], input[name="x_lead_form"], input[name="lead_form"]');
      
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
   * Get the current Salesperson value on the Opportunity form.
   * Handles both edit mode (Many2one input) and readonly mode (text).
   * @returns The Salesperson value as a string, or empty string if not found
   */
  async getSalespersonValue(): Promise<string> {
    try {
      const salesperson_saved_row = this.page.locator('xpath=//tr[td[contains(text(), "Salesperson")] or td/label[contains(text(), "Salesperson")]]').first();
      const salespersonCell = salesperson_saved_row.locator('xpath=./td[2]').first();
      const salespersonInputElement = salespersonCell.locator('xpath=.//input[@type="text"] | .//input[@role="textbox"]');

      const hasInput = await salespersonInputElement.count() > 0;

      if (hasInput) {
        // Editable mode (unsaved) - get from input value
        const value = await salespersonInputElement.first().inputValue().catch(() => '') || '';
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await salespersonCell.textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Salesperson value: ${error instanceof Error ? error.message : String(error)}`);
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

  // ─── Chatter composer (Send message / Log note) ────────────────────────────

  /**
   * Open the chatter "Send message" composer (posts a customer-visible message to the Opp's followers).
   * XPath primary, CSS fallback; waits for the composer textarea to render.
   */
  async openSendMessageComposer(): Promise<void> {
    let btn = this.sendMessageButtonXPath();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) btn = this.sendMessageButtonCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    let ta = this.composerTextareaXPath();
    if (!(await ta.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) ta = this.composerTextareaCss();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Open the chatter "Log note" composer (posts an internal note, not sent to the customer/followers).
   * XPath primary, CSS fallback; waits for the composer textarea to render.
   */
  async openLogNoteComposer(): Promise<void> {
    let btn = this.logNoteButtonXPath();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.elementAppear }).catch(() => false))) btn = this.logNoteButtonCss();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    let ta = this.composerTextareaXPath();
    if (!(await ta.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) ta = this.composerTextareaCss();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Read the open composer's body text (the textarea value) - used to verify an empty message is blocked.
   */
  async getComposerBodyValue(): Promise<string> {
    let ta = this.composerTextareaXPath();
    if (!(await ta.count() > 0)) ta = this.composerTextareaCss();
    if (!(await ta.count() > 0)) return '';
    return (await ta.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '')) || '';
  }

  /**
   * Whether the open composer is still present (textarea visible). Used to confirm an empty Send does
   * not post and dismiss the composer.
   */
  async isComposerOpen(): Promise<boolean> {
    let ta = this.composerTextareaXPath();
    if (!(await ta.count() > 0)) ta = this.composerTextareaCss();
    return await ta.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false);
  }

  /**
   * Read the suggested-recipients / "To:" text of the OPEN composer (e.g. "To: Followers of <Opp>"
   * and the listed recipient partners). Returns "" when not shown. Call after openSendMessageComposer.
   */
  async getComposerRecipientsText(): Promise<string> {
    const parts: string[] = [];
    const info = this.composerInfoXPath();
    if (await info.count() > 0) parts.push(((await info.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    let sp = this.composerSuggestedPartnersXPath();
    if (!(await sp.count() > 0)) sp = this.composerSuggestedPartnersCss();
    if (await sp.count() > 0) parts.push(((await sp.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    return parts.filter(Boolean).join(' | ');
  }

  /**
   * Whether the OPEN "Send message" composer offers rich-text formatting - i.e. a contenteditable
   * editor or a formatting toolbar. For the Odoo 12 backend chatter this is false: the body is a plain
   * <textarea>. Used to verify the composer has no bold/italic/list controls.
   */
  async composerHasRichText(): Promise<boolean> {
    const ce = await this.page.locator("div.o_thread_composer [contenteditable='true']").count().catch(() => 0);
    const toolbar = await this.page
      .locator("div.o_thread_composer .note-toolbar, div.o_thread_composer .o_wysiwyg_wrapper, div.o_thread_composer .btn-toolbar, div.o_thread_composer .note-editable")
      .count()
      .catch(() => 0);
    return ce > 0 || toolbar > 0;
  }

  /**
   * Fill the OPEN composer textarea with `message` and press "Send". Waits for the composer to close
   * (the message posts via RPC and the composer collapses). XPath primary, CSS fallback.
   * @param message - the body text to post
   */
  async fillComposerAndSend(message: string): Promise<void> {
    let ta = this.composerTextareaXPath();
    if (!(await ta.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) ta = this.composerTextareaCss();
    await ta.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await ta.scrollIntoViewIfNeeded();
    await ta.click();
    await ta.fill('');
    await ta.fill(message);
    // Ensure the input event fires so the Send button enables.
    await ta.evaluate((el) => el.dispatchEvent(new Event('input', { bubbles: true })));
    await this.wait(CommonUtils.waitTimes.short);

    // Uncheck any auto-added suggested recipient. "Send message" on this form auto-adds the customer's
    // email contact (a freshly-created partner) as a checked recipient, and its presence makes the Send
    // a silent no-op. Unchecking it posts the message as a customer-visible comment to the followers and
    // sends reliably. (Log note has no suggested recipients, so this is a no-op there.)
    await this.page
      .locator("div.o_thread_composer div.o_composer_suggested_partners input[type='checkbox']")
      .evaluateAll((cbs) => cbs.forEach((c) => { const el = c as HTMLInputElement; if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); } }))
      .catch(() => {});
    await this.wait(CommonUtils.waitTimes.short);
    await this.dismissErrorDialog().catch(() => {});

    // Click "Send" and confirm the composer collapses (= posted). Try a real click then a JS click
    // (overlay-proof); clear any stray client-error backdrop between attempts.
    let send = this.composerSendButtonXPath();
    if (!(await send.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) send = this.composerSendButtonCss();
    await send.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!(await send.isVisible({ timeout: CommonUtils.waitTimes.medium }).catch(() => false))) break;
      await this.page.evaluate(() => document.querySelectorAll('.modal-backdrop, .o_blockUI, .blockUI').forEach((e) => e.remove())).catch(() => {});
      await send.scrollIntoViewIfNeeded().catch(() => {});
      await send.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      if (await ta.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.elementVisibility }).then(() => true).catch(() => false)) break;
      await send.evaluate((b) => (b as HTMLElement).click()).catch(() => {});
      if (await ta.waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.elementVisibility }).then(() => true).catch(() => false)) break;
      console.log(`  - composer still open after Send (attempt ${attempt}); retrying`);
      await this.dismissErrorDialog().catch(() => {});
      await this.wait(CommonUtils.waitTimes.long);
    }
    await this.wait(CommonUtils.waitTimes.extraLong);
  }

  /**
   * Post a customer-visible message via the chatter "Send message" composer (open + fill + Send).
   * @param message - the message body to post
   */
  async sendChatterMessage(message: string): Promise<void> {
    await this.openSendMessageComposer();
    await this.fillComposerAndSend(message);
  }

  /**
   * Post an internal note via the chatter "Log note" composer (open + fill + Send).
   * @param message - the note body to post
   */
  async logChatterNote(message: string): Promise<void> {
    await this.openLogNoteComposer();
    await this.fillComposerAndSend(message);
  }

  /**
   * Press "Send" on the OPEN composer without typing anything (to verify an empty message is rejected).
   * Returns true if the Send button was clickable and clicked; the caller checks nothing posted.
   */
  async clickComposerSend(): Promise<void> {
    let send = this.composerSendButtonXPath();
    if (!(await send.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) send = this.composerSendButtonCss();
    if (await send.count() > 0 && await send.isVisible().catch(() => false)) {
      await send.scrollIntoViewIfNeeded();
      await send.click().catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.long);
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
   * Non-throwing check: returns true if the "email is invalid" server-error dialog becomes
   * visible within `timeout`, false otherwise. Used to assert a valid email is NOT rejected.
   */
  async isServerErrorDialogVisible(timeout: number = CommonUtils.waitTimes.long): Promise<boolean> {
    return this.serverErrorDialog().first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /**
   * Wait for the record to be saved (the form URL gains a record id). Throws on timeout, so a
   * blocked save (e.g. a rejected email) fails the test. Authoritative "accepted" signal.
   */
  async waitForRecordSaved(timeout: number = CommonUtils.waitTimes.pageLoad): Promise<void> {
    // Wait for a REAL record id (digits): the form URL briefly shows an empty "id=" right after save,
    // so a loose "id=*" glob would resolve too early. Require id=<digits>.
    await this.page.waitForURL(/[?#&]id=\d+/, { timeout });
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
   * Count the data rows currently shown in the Opportunities list. Used to assert a pre-condition
   * holds on live data, e.g. "this customer IS the customer of at least one Stage=Activated
   * Opportunity" after applying the Stage filter plus a customer-name search.
   */
  async countListRows(): Promise<number> {
    await this.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.pageLoad).catch(() => {});
    const count = await this.dataRowsLocator().count();
    console.log(`  - Opportunities list rows: ${count}`);
    return count;
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
   * Wait until Odoo's jQuery blockUI overlay is gone. This overlay is raised during an RPC (notably a
   * mass delete + the list reload that follows) and intercepts pointer events, so a real click issued
   * while it is up hangs and retries until the test timeout. Call this before clicking on the list
   * after any server round-trip. Resolves immediately when no overlay is present.
   */
  async waitForBlockOverlayGone(timeout: number = CommonUtils.waitTimes.savingPage): Promise<void> {
    await this.blockOverlay().first().waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  /**
   * Whether a search-view facet chip whose text contains `text` is currently applied. Used as a SAFETY
   * guard before a mass delete: only delete when the expected filter (e.g. the Reseller facet) is
   * actually present, so a delete can never run against an unfiltered list (which would remove records
   * that do not belong to the test's reseller).
   * @param text - substring the facet chip must contain (e.g. the Reseller partner name)
   */
  async isSearchFacetPresent(text: string): Promise<boolean> {
    const facets = this.searchFacets();
    const count = await facets.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const facetText = await facets.nth(i).textContent().catch(() => '');
      if (facetText && facetText.includes(text)) return true;
    }
    return false;
  }

  // Checkbox of the Nth (0-based) data row in the list, used to delete in small batches.
  private readonly dataRowCheckboxByIndex = (index: number) =>
    this.dataRowsLocator().nth(index).locator("xpath=.//td[contains(@class,'o_list_record_selector')]//input[@type='checkbox']").first();

  /**
   * Select the first `n` data rows in the list by ticking their row checkboxes. Odoo's Bootstrap
   * custom-control checkbox is visually hidden and the row re-renders on click, so we set `checked`
   * and dispatch the click/change events the ListRenderer listens for (the same proven technique as
   * dispatchSelectRow). Returns true once the selection-dependent Action toggle appears (selection
   * registered), false otherwise (list still settling / already empty).
   * @param n - number of leading rows to select
   */
  private async selectFirstNDataRows(n: number): Promise<boolean> {
    for (let i = 0; i < n; i++) {
      const checkbox = this.dataRowCheckboxByIndex(i);
      const attached = await checkbox.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).then(() => true).catch(() => false);
      if (!attached) break;
      await checkbox.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
    }
    await this.wait(CommonUtils.waitTimes.medium);
    return await this.listSelectionActionToggle().isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
  }

  /**
   * Data-prep: hard-delete EVERY record in the currently-filtered list view, in SMALL BATCHES, until
   * the list is empty. Instead of the header "select all" (which ticks the whole visible page of 80
   * and, after the first delete, often fails to re-register on the slowly-reloading pre-prod list -
   * leaving the Action menu absent and timing out the cleanup), this selects only the first
   * `batchSize` rows per round (default 20-40). Smaller batches delete quickly and the list settles
   * fast, so the next selection reliably registers.
   *
   * Each round: settle -> select first `batchSize` rows -> CONFIRM selection registered (Action
   * toggle visible) -> Action > Delete > OK. If a selection does not register (list still settling),
   * the round is retried rather than aborting. Best-effort and time-bounded by `maxDeletes` (cap on
   * successful delete operations) and an attempt budget; returns the number of delete operations done.
   * If the page becomes wedged (a stuck blockUI overlay that a reload would clear), the method returns
   * early after `maxConsecutiveFailures` failed rounds so the caller can reload + re-apply the filter
   * and call again - see the outer recovery loop in the TC.-A.1.1 beforeEach.
   * @param batchSize - how many rows to remove per delete operation (smaller = more reliable on pre-prod)
   * @param maxDeletes - cap on successful delete operations (runaway backstop)
   * @param maxConsecutiveFailures - return early after this many back-to-back failed rounds (wedge signal)
   * @param requiredFacetText - SAFETY: if set, each delete round only proceeds while a search facet
   *   containing this text is applied; if the facet is missing (e.g. a filter failed to re-apply after a
   *   reload) the method returns immediately WITHOUT deleting, so a delete can never hit an unfiltered list.
   * @returns the number of delete operations actually performed
   */
  async deleteFilteredRecordsInBatches(batchSize: number = 20, maxDeletes: number = 40, maxConsecutiveFailures: number = 2, requiredFacetText: string | null = null): Promise<number> {
    let deletes = 0;
    let consecutiveFailures = 0;
    const maxAttempts = maxDeletes * 3; // allow retries for rounds blocked by a transient error/overlay
    for (let attempt = 1; attempt <= maxAttempts && deletes < maxDeletes; attempt++) {
      // Let the previous delete's list re-render finish, then clear the two things that intercept the
      // clicks below: the "Odoo Client Error" popup (frequently raised by the list re-render after a
      // mass delete of leads) and the blockUI RPC overlay. Both are modal/full-page and would make a
      // real click hang and retry until the test timeout.
      await this.wait(CommonUtils.waitTimes.long);
      await this.dismissErrorDialog(CommonUtils.waitTimes.standard).catch(() => {});
      await this.waitForBlockOverlayGone();
      // SAFETY: never delete unless the required filter facet is applied - protects against deleting
      // records outside the reseller's scope if a filter failed to (re-)apply.
      if (requiredFacetText && !(await this.isSearchFacetPresent(requiredFacetText))) {
        console.log(`  ⛔ Required filter facet "${requiredFacetText}" is NOT applied - refusing to delete (returning ${deletes} so the caller can re-filter)`);
        return deletes;
      }
      const rowCount = await this.dataRowsLocator().count().catch(() => 0);
      if (rowCount === 0) {
        // Double-check it is really empty and not just mid-reload before declaring done.
        await this.wait(CommonUtils.waitTimes.long);
        const recount = await this.dataRowsLocator().count().catch(() => 0);
        if (recount === 0) {
          console.log(deletes === 0
            ? '  ℹ️ Filtered list is already empty - nothing to delete'
            : `  ✓ Filtered list emptied after ${deletes} delete operation(s)`);
          return deletes;
        }
        continue;
      }
      const n = Math.min(batchSize, rowCount);
      const registered = await this.selectFirstNDataRows(n);
      if (!registered) {
        // A blocking error popup can stop the selection from registering - clear it and retry.
        await this.dismissErrorDialog(CommonUtils.waitTimes.standard).catch(() => {});
        consecutiveFailures++;
        console.log(`  ⚠ Attempt ${attempt}: selection of first ${n} row(s) did not register - retrying`);
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log(`  ↩ Page appears wedged after ${consecutiveFailures} failed rounds - returning so the caller can reload + re-filter`);
          return deletes;
        }
        continue;
      }
      // Final guard right before the real clicks: no error popup / overlay intercepting.
      await this.dismissErrorDialog(CommonUtils.waitTimes.standard).catch(() => {});
      await this.waitForBlockOverlayGone();
      try {
        await this.clickListActionMenu();
        await this.clickListActionDelete();
        await this.confirmDeleteDialog();
      } catch (e) {
        // A pre-prod "Odoo Client Error" popup / blockUI overlay can intercept a click. With the
        // cleanup page's bounded default timeout this fails fast (rather than hanging to the test
        // timeout); clear the popup and retry the round.
        await this.dismissErrorDialogWithRetry(3, CommonUtils.waitTimes.standard).catch(() => {});
        consecutiveFailures++;
        console.log(`  ⚠ Attempt ${attempt}: delete click failed (${e instanceof Error ? e.message.split('\n')[0] : String(e)}) - clearing error and retrying`);
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log(`  ↩ Page appears wedged after ${consecutiveFailures} failed rounds - returning so the caller can reload + re-filter`);
          return deletes;
        }
        continue;
      }
      deletes++;
      consecutiveFailures = 0;
      console.log(`  ✓ Delete ${deletes}: removed ${n} record(s) (batchSize=${batchSize})`);
      // The mass delete + list re-render frequently raises a (sometimes delayed) "Odoo Client Error"
      // popup; clear it now (with a couple of retries for the delayed case) so it cannot block the
      // next round.
      await this.dismissErrorDialogWithRetry(2, CommonUtils.waitTimes.standard).catch(() => {});
    }
    console.log(`  ⚠ Stopped after ${deletes} delete operation(s) (hit maxDeletes/attempt budget) - some records may remain (best-effort)`);
    return deletes;
  }

  /**
   * Fast teardown helper: delete several Opportunities by (unique) name in ONE list operation
   * (select the matching rows -> Action > Delete > Ok), instead of deleting them one-by-one in
   * separate tabs. Tolerant: silently skips names with no matching row (already deleted/lost).
   * Far faster than per-URL deletion, so cleanup of many-opp tests fits inside the per-test timeout.
   * @param names - the unique Opportunity names to delete
   */
  async deleteOpportunitiesByNames(names: string[]): Promise<void> {
    if (!names || names.length === 0) return;
    await this.clickCRMMenuLink();
    await this.switchToListView();
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    let selectedAny = false;
    for (const name of names) {
      const count = await this.oppRowByName(name).count();
      if (count === 1) {
        await this.dispatchSelectRow(name).catch(() => {});
        selectedAny = true;
      }
    }
    if (!selectedAny) {
      console.log('  ℹ️ No matching Opportunity rows to delete (already cleaned).');
      return;
    }
    const actionVisible = await this.listSelectionActionToggle().isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!actionVisible) {
      console.log('  ⚠ Selection did not register - skipping bulk delete.');
      return;
    }
    await this.clickListActionMenu();
    await this.clickListActionDelete();
    await this.confirmDeleteDialog();
    console.log(`  ✓ Bulk-deleted matching Opportunities (${names.length} requested) in one operation`);
  }

  /**
   * Select exactly ONE Opportunity row in the list by its (unique) name, ticking its row checkbox.
   * Odoo's Bootstrap custom-control checkbox is visually hidden and the row re-renders on click, so a
   * normal/force click does not register selection; instead we set `checked` and dispatch the
   * click/change events the ListRenderer listens for, then confirm selection by waiting for the
   * toolbar "Action" button to appear. Throws if zero or more than one row matches (safety: never
   * mass-act on the wrong records).
   * @param name - the unique Opportunity name to select
   */
  /**
   * Internal: tick a single list row's checkbox by its (unique) name. Odoo's Bootstrap custom-control
   * checkbox is hidden and the row re-renders on click, so we set `checked` and dispatch the
   * click/change events the ListRenderer listens for. Asserts exactly one matching row (safety).
   */
  private async dispatchSelectRow(name: string): Promise<void> {
    const row = this.oppRowByName(name);
    await row.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const count = await row.count();
    if (count !== 1) {
      throw new Error(`Expected exactly 1 Opportunity row matching "${name}", found ${count} - refusing to select to avoid acting on the wrong records.`);
    }
    await row.first().scrollIntoViewIfNeeded();
    const checkbox = this.oppRowCheckboxByName(name);
    await checkbox.waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait });
    await checkbox.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('click', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Select exactly ONE Opportunity row in the list by its (unique) name. Selection is confirmed by
   * the selection-dependent Action dropdown toggle becoming visible (hidden until >=1 row selected),
   * retried for stability. Throws if zero/more than one row matches.
   * @param name - the unique Opportunity name to select
   */
  async selectOpportunityRowByName(name: string): Promise<void> {
    // Let the list finish loading/re-rendering before reading rows (avoids selecting a stale node).
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    const actionToggle = this.listSelectionActionToggle();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await this.dispatchSelectRow(name);
      const registered = await actionToggle.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
      if (registered) {
        console.log(`  ✓ Selected Opportunity row: "${name}" (attempt ${attempt})`);
        return;
      }
      console.log(`  ⚠ Selection not registered yet for "${name}" (attempt ${attempt}/5) - retrying...`);
      await this.wait(CommonUtils.waitTimes.standard);
    }
    throw new Error(`Could not register selection of Opportunity row "${name}" (the "Action" toolbar button never became visible).`);
  }

  /**
   * Select MULTIPLE Opportunity rows in the list by their (unique) names (for mass actions on >1
   * record). Selections accumulate; confirmed by the Action toolbar toggle appearing. The caller
   * should corroborate the count via the wizard's lead_count (getMassMarkLeadCount).
   * @param names - the unique Opportunity names to select
   */
  async selectOpportunityRowsByNames(names: string[]): Promise<void> {
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    for (const name of names) {
      await this.dispatchSelectRow(name);
    }
    await this.listSelectionActionToggle().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    console.log(`  ✓ Selected ${names.length} Opportunity rows`);
  }

  /**
   * Search the Opportunities list by typing text into the search box with REAL keystrokes
   * (pressSequentially) so Odoo's search handler fires, then Enter to create a name filter facet.
   * Use after removeMyPipelineFilter() to surface records the "My Pipeline" favorite hides
   * (e.g. opps already in a pending-lost state, which keep active=true but probability=0).
   * @param text - text to search for (matches the Opportunity name)
   */
  async searchByName(text: string): Promise<void> {
    const input = this.searchViewInputXPath();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 10 });
    await this.wait(CommonUtils.waitTimes.long);
    await input.press('Enter');
    await this.wait(CommonUtils.waitTimes.searchOppWait);
    console.log(`  ✓ Searched Opportunities by name: "${text}"`);
  }

  /**
   * Click an option in the (already open) list Action dropdown menu by its exact visible text.
   * @param optionText - exact menu item text, e.g. "Mass Mark as Duplicate"
   */
  async selectActionMenuOption(optionText: string): Promise<void> {
    const opt = this.actionMenuOptionByText(optionText);
    await opt.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await opt.scrollIntoViewIfNeeded().catch(() => {});
    await opt.click();
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Action menu option selected: "${optionText}"`);
  }

  /**
   * Select the FIRST data row in the current list view (any record) by ticking its checkbox, to reveal
   * the selection-dependent list "Action" menu. Read-only callers only (visibility checks) - no
   * destructive action is taken on the selected record. Confirmed by the Action toolbar toggle appearing.
   */
  async selectFirstListRow(): Promise<void> {
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
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
        console.log(`  ✓ Selected the first list row (attempt ${attempt})`);
        return;
      }
      await this.wait(CommonUtils.waitTimes.standard);
    }
    throw new Error('Could not register selection of the first list row (the "Action" toolbar button never appeared).');
  }

  /**
   * Open the first record in the current list (click its first data cell) and wait for the form view.
   * Use for the "detail screen" visibility checks.
   */
  async openFirstListRecord(): Promise<void> {
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    await this.firstListRowFirstCell().click();
    await this.waitForURL('**view_type=form**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Opened the first record (form/detail view)');
  }

  /**
   * Open the record at 0-based `index` in the current list (click its first data cell) and wait for
   * the form view. Used to scan list records - e.g. iterate Activated Opps looking for a suitable
   * customer (CRM-12059 historical-merge discovery).
   */
  async openListRowByIndex(index: number): Promise<void> {
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    const cell = this.page
      .locator(`xpath=(//tr[contains(@class,'o_data_row')])[${index + 1}]//td[contains(@class,'o_data_cell')][1]`)
      .first();
    await cell.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await cell.click();
    await this.waitForURL('**view_type=form**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Opened list record at index ${index}`);
  }

  /**
   * Open the LEAD/OPP (crm.lead) at 0-based `index` in the current list, robustly. The Archive>All
   * list often renders the first cell as a PARTNER m2o link, so clicking it navigates to the
   * res.partner instead of the lead. This clicks the first PLAIN (non-link) data cell of the row so
   * the crm.lead form opens. Returns true only if a crm.lead form loaded (url model=crm.lead).
   */
  async openListLeadByIndex(index: number): Promise<boolean> {
    await CommonUtils.waitForSpinnersToHide(this.page, CommonUtils.waitTimes.medium, CommonUtils.waitTimes.savingPage).catch(() => {});
    const row = this.page.locator(`xpath=(//tr[contains(@class,'o_data_row')])[${index + 1}]`).first();
    await row.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const cells = row.locator('td.o_data_cell');
    const n = await cells.count();
    let clicked = false;
    for (let j = 0; j < n; j++) {
      const cell = cells.nth(j);
      const hasLink = (await cell.locator('a').count()) > 0;
      if (!hasLink) { await cell.click(); clicked = true; break; }
    }
    if (!clicked && n > 0) await cells.first().click();
    await this.waitForURL('**view_type=form**', CommonUtils.waitTimes.pageLoad).catch(() => {});
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    const isLead = /model=crm\.lead/.test(this.page.url());
    console.log(`  ✓ Opened list row ${index} (crm.lead=${isLead})`);
    return isLead;
  }

  /**
   * Open the "Action" dropdown on a record FORM (detail/control-panel) so its options can be read.
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
   * Use to assert a specific option's presence/absence (e.g. "Mass Mark as Duplicate and Deactivate").
   */
  async getOpenActionMenuOptionLabels(): Promise<string[]> {
    await this.openActionMenuItems().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const labels = (await this.openActionMenuItems().allTextContents()).map((t) => t.trim()).filter(Boolean);
    console.log(`  - Action menu options (${labels.length}): ${JSON.stringify(labels)}`);
    return labels;
  }

  /**
   * Wait for the Mass Mark wizard modal and return its title (e.g. "Mass Mark as Duplicate").
   */
  async waitForMassMarkWizard(): Promise<string> {
    await this.massMarkWizardTitle().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const title = ((await this.massMarkWizardTitle().textContent()) ?? '').trim();
    console.log(`  ✓ Mass Mark wizard opened: "${title}"`);
    return title;
  }

  /**
   * Read the number of leads the Mass Mark wizard will affect (the wizard's lead_count field).
   * @returns the lead count, or 0 if it cannot be read
   */
  async getMassMarkLeadCount(): Promise<number> {
    const txt = await this.massMarkWizardLeadCount().textContent().catch(() => '');
    return parseInt((txt ?? '').trim(), 10) || 0;
  }

  /**
   * Select a Lost Reason in the Mass Mark wizard (required Many2one combobox).
   * @param reason - the Lost Reason label, e.g. "Duplicate"
   */
  async selectMassMarkLostReason(reason: string): Promise<void> {
    const input = this.massMarkLostReasonInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(reason);
    await this.wait(CommonUtils.waitTimes.long);
    const option = this.dropdownOption().filter({ hasText: reason }).first();
    const visible = await option.isVisible().catch(() => false);
    if (visible) {
      await option.click();
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.wait(CommonUtils.waitTimes.short);
    console.log(`  ✓ Mass Mark Lost Reason set: "${reason}"`);
  }

  /**
   * Click the "Confirm" button on the Mass Mark wizard and wait for it to close.
   */
  async confirmMassMarkWizard(): Promise<void> {
    const btn = this.massMarkConfirmButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.massMarkWizardTitle().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await CommonUtils.waitForSpinnersToHide(this.page).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Mass Mark wizard confirmed');
  }

  /**
   * Read the Approval Status (state) value on the Opportunity form (CRM Developer tab).
   * @returns the approval status text (e.g. "None", "Pending Approval", "Approved"), or '' if not found
   */
  async getApprovalStatus(): Promise<string> {
    try {
      const el = this.approvalStatusField();
      const exists = await el.count() > 0;
      if (!exists) return '';
      return (((await el.textContent().catch(() => '')) ?? '')).trim();
    } catch {
      return '';
    }
  }

  /**
   * Read whether the Opportunity is currently Active (true) or deactivated/archived (false).
   * Reads the boolean `active` field on the CRM Developer tab. Call clickCRMDeveloperTab() first so
   * the field is rendered. Returns true (active) defensively if the field cannot be found/read.
   * Used to verify the "Mass Mark as Duplicate and Deactivate" action deactivates the record.
   */
  async isOpportunityActive(): Promise<boolean> {
    const inputs = this.opportunityActiveInputs();
    const count = await inputs.count().catch(() => 0);
    if (count === 0) return true;
    return inputs.last().evaluate((el: HTMLInputElement) => el.checked).catch(() => true);
  }

  /**
   * Create a simple Opportunity from the list view: CREATE -> set name -> ensure Stage = New -> SAVE.
   * Returns the saved Opportunity's URL (leaves the browser on the saved form).
   * @param name - the unique Opportunity name
   */
  async createSimpleOpportunityFromList(name: string): Promise<string> {
    await this.clickCreate();
    await this.fillOpportunityName(name);
    await this.selectStageNew().catch(() => {});
    await this.saveAndWaitForCompletion();
    const url = this.page.url();
    console.log(`  ✓ Created Opportunity "${name}" at ${url}`);
    return url;
  }

  /**
   * Create an Opportunity and move it to the WON stage (via the status-bar MORE dropdown, which
   * handles the "Mark as Won" confirmation). Enough to make the server treat it as Won for the
   * "Mass Mark as Duplicate" validation (which rejects Won leads). Returns the saved URL.
   * @param name - the unique Opportunity name
   */
  async createWonOpportunityFromList(name: string): Promise<string> {
    const url = await this.createSimpleOpportunityFromList(name);
    await this.selectStageViaMore('Won');
    await this.wait(CommonUtils.waitTimes.extraLong);
    console.log(`  ✓ Moved Opportunity "${name}" to WON stage`);
    return url;
  }

  /**
   * Create several simple Opportunities (Stage = New), one per supplied name. Navigates back to the
   * Opportunities list before each CREATE. Returns the saved URLs in the same order as `names`.
   * @param names - unique Opportunity names (caller guarantees uniqueness, e.g. shared stamp + index)
   */
  async createSimpleOpportunities(names: string[]): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < names.length; i++) {
      await this.clickCRMMenuLink();
      await this.switchToListView();
      const url = await this.createSimpleOpportunityFromList(names[i]);
      urls.push(url);
      console.log(`  ✓ Created Opportunity ${i + 1}/${names.length}`);
    }
    return urls;
  }

  /**
   * Create several simple Opportunities (Stage = New) each set to a specific Sales Team, keeping the
   * current user as Salesperson so they remain in the user's pipeline. Navigates to the list before
   * each CREATE. Returns saved URLs in order.
   * @param items - {name, team} per Opportunity (name unique; team is the Sales Team label)
   */
  async createSimpleOpportunitiesWithTeams(items: { name: string; team: string }[]): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < items.length; i++) {
      await this.clickCRMMenuLink();
      await this.switchToListView();
      await this.clickCreate();
      await this.fillOpportunityName(items[i].name);
      await this.selectStageNew().catch(() => {});
      const set = await this.selectSalesTeam(items[i].team);
      if (!set) console.log(`  ⚠ Could not set Sales Team "${items[i].team}" for "${items[i].name}" - left as default`);
      await this.saveAndWaitForCompletion();
      urls.push(this.page.url());
      console.log(`  ✓ Created Opportunity ${i + 1}/${items.length} "${items[i].name}" (team ${items[i].team})`);
    }
    return urls;
  }

  /**
   * Read the Sales Team currently shown on the Opportunity form (readonly or edit).
   * Thin wrapper over getSalesTeamValue() for symmetry in multi-team tests.
   */
  async getSalesTeam(): Promise<string> {
    return this.getSalesTeamValue();
  }

  /**
   * Click "Cancel" on the Mass Mark wizard and wait for the modal to close.
   */
  async cancelMassMarkWizard(): Promise<void> {
    const btn = this.massMarkCancelButton();
    await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await btn.click();
    await this.massMarkWizardTitle().waitFor({ state: 'hidden', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ Mass Mark wizard cancelled');
  }

  /**
   * @returns true if the Mass Mark wizard modal is currently open.
   */
  async isMassMarkWizardOpen(): Promise<boolean> {
    return this.massMarkWizardTitle().isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false);
  }

  /**
   * Read the Lost Reason currently populated in the Mass Mark wizard (the combobox input value).
   * Use to verify the wizard's default Lost Reason.
   * @returns the current Lost Reason text, or '' if empty
   */
  async getMassMarkLostReasonValue(): Promise<string> {
    const input = this.massMarkLostReasonInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return ((await input.inputValue().catch(() => '')) ?? '').trim();
  }

  /**
   * Type a query into the wizard's Lost Reason combobox and return the visible dropdown option texts.
   * Use to verify the Lost Reason field is searchable.
   * @param query - text to type
   * @returns the list of matching option labels
   */
  async searchMassMarkLostReasonOptions(query: string): Promise<string[]> {
    const input = this.massMarkLostReasonInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(query);
    await this.wait(CommonUtils.waitTimes.long);
    const opts = this.massMarkLostReasonOptions();
    await opts.first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    const texts = (await opts.allTextContents()).map((t) => t.trim()).filter(Boolean);
    console.log(`  ✓ Lost Reason search "${query}" -> ${texts.length} option(s): ${JSON.stringify(texts.slice(0, 10))}`);
    return texts;
  }

  /**
   * Read the error/validation popup shown after an invalid Mass Mark (e.g. a Won lead selected).
   * @returns the popup text (whitespace-normalised), or '' if no error popup appears in the wait budget
   */
  async getMassMarkErrorText(): Promise<string> {
    const dlg = this.massMarkErrorDialog();
    const visible = await dlg.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visible) return '';
    return ((await dlg.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Dismiss the Mass Mark error/warning popup by clicking its "Ok" button (best-effort).
   */
  async dismissMassMarkError(): Promise<void> {
    const ok = this.page.locator(
      "xpath=//div[contains(@class,'modal') and contains(@class,'show')]//footer//button[normalize-space()='Ok' or normalize-space()='OK'] | //div[contains(@class,'modal') and contains(@class,'show')]//button[normalize-space()='Ok' or normalize-space()='OK']"
    ).first();
    if (await ok.isVisible({ timeout: CommonUtils.waitTimes.extraLong }).catch(() => false)) {
      await ok.click().catch(() => {});
      await this.wait(CommonUtils.waitTimes.medium);
    }
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
   * Whether the Qualification info tab is EMPTY (key fields blank). Call with the Qualification
   * info tab OPEN in EDIT mode. Reads Use case(s), Requirement(s), Current solution, Competitor,
   * Number of socket and Licensing Model; returns true when all are blank. Used by CRM-12059 to
   * pre-verify a historical Opp has NO qualification data (so an attempted move to Stage>=Activated
   * is safely BLOCKED and never persists).
   */
  async isQualificationInfoEmpty(): Promise<boolean> {
    const readVal = async (loc: () => import('@playwright/test').Locator): Promise<string> => {
      try { return ((await loc().inputValue({ timeout: CommonUtils.waitTimes.abnormalWait })) || '').trim(); }
      catch { return ''; }
    };
    const useCase = await readVal(this.qualInfoUseCaseInput);
    const requirement = await readVal(this.qualInfoRequirementInput);
    const currentSol = await readVal(this.qualInfoCurrentSolutionInput);
    const competitor = await readVal(this.qualInfoCompetitorInput);
    const socket = await readVal(this.qualEnvSocketInput);
    let licensing = '';
    try { licensing = ((await this.qualInfoLicensingSelect().inputValue()) || '').trim(); } catch { /* select may be absent */ }
    console.log(`  - Qual empty check: useCase="${useCase}" requirement="${requirement}" currentSol="${currentSol}" competitor="${competitor}" socket="${socket}" licensing="${licensing}"`);
    const textBlank = [useCase, requirement, currentSol, competitor].every((v) => v === '');
    const socketBlank = socket === '' || socket === '0';
    const licBlank = licensing === '' || /^(false|0)?$/i.test(licensing);
    return textBlank && socketBlank && licBlank;
  }

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

  /**
   * Read the current Opportunity name (input value in edit mode, breadcrumb/text in readonly mode).
   * @returns the opportunity name string, or empty string if not found
   */
  async getOpportunityNameValue(): Promise<string> {
    try {
      const input = this.opportunityNameInput();
      const hasInput = await input.count() > 0 && await input.isVisible().catch(() => false);
      if (hasInput) {
        const value = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (value.trim()) return value.trim();
      }
      // Readonly fallback: the form title / breadcrumb. Guard with count() so a missing element fails
      // fast instead of blocking (actionTimeout is 0 in this project).
      const title = this.page.locator("xpath=(//h1//span[@name='name'])[1] | (//span[@name='name'])[1]").first();
      if (await title.count() > 0) {
        const text = await title.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        return text.trim();
      }
      return '';
    } catch (error) {
      console.error(`Error getting Opportunity name: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Click the "Assigned Partner" tab on the Opportunity form. XPath primary, CSS fallback.
   */
  async clickAssignedPartnerTab(): Promise<void> {
    await this.wait(CommonUtils.waitTimes.medium);
    let tab = this.assignedPartnerTabXPath();
    const visibleByXPath = await tab.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) tab = this.assignedPartnerTabCss();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Set the "Assigned Partner" (partner_assigned_id) Many2one field on the Opportunity form.
   * Canonical Odoo combobox pattern: clear, type the value, commit with Enter (no autocomplete-click).
   * @param name - the partner/contact name to assign (e.g. a Reseller company name)
   */
  async setAssignedPartner(name: string): Promise<void> {
    let input = this.assignedPartnerInputXPath();
    const visibleByXPath = await input.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) input = this.assignedPartnerInputCss();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(name);
    await this.wait(CommonUtils.waitTimes.long);
    await this.page.keyboard.press('Enter');
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Read the Assigned Partner value. In edit mode reads the input value; in readonly mode (after
   * save) reads the m2o link/field text. XPath primary, CSS fallback.
   * @returns the assigned partner display text, or empty string if not found
   */
  async getAssignedPartnerValue(): Promise<string> {
    try {
      // Edit mode: read the autocomplete input value (guard with count(); actionTimeout is 0 here).
      let input = this.assignedPartnerInputXPath();
      if (!(await input.count() > 0)) input = this.assignedPartnerInputCss();
      if (await input.count() > 0 && await input.isVisible().catch(() => false)) {
        const value = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (value.trim()) return value.trim();
      }
      // Readonly mode (after save): read the m2o link/field text.
      const readonly = this.assignedPartnerValueXPath();
      if (await readonly.count() > 0) {
        const text = await readonly.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        return text.trim();
      }
      return '';
    } catch (error) {
      console.error(`Error getting Assigned Partner value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Click the "Internal Notes" tab on the Opportunity form. XPath primary, CSS fallback.
   */
  async clickInternalNotesTab(): Promise<void> {
    await this.wait(CommonUtils.waitTimes.medium);
    let tab = this.internalNotesTabXPath();
    const visibleByXPath = await tab.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) tab = this.internalNotesTabCss();
    await tab.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Fill the Internal Notes (description) textarea on the Opportunity form. XPath primary, CSS fallback.
   * @param text - the internal note / deal-registration text block to enter
   */
  async fillInternalNotes(text: string): Promise<void> {
    let textarea = this.internalNotesTextareaXPath();
    const visibleByXPath = await textarea.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false);
    if (!visibleByXPath) textarea = this.internalNotesTextareaCss();
    await textarea.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await textarea.click();
    await textarea.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await textarea.fill(text);
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Read the Internal Notes (description) value. Reads the textarea value in edit mode, or the
   * field text in readonly mode. XPath primary, CSS fallback.
   * @returns the internal-notes text, or empty string if not found
   */
  async getInternalNotesValue(): Promise<string> {
    try {
      // Edit mode (or readonly textarea): read the textarea value (guard with count(); actionTimeout is 0).
      let textarea = this.internalNotesTextareaXPath();
      if (!(await textarea.count() > 0)) textarea = this.internalNotesTextareaCss();
      if (await textarea.count() > 0) {
        const value = await textarea.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (value.trim()) return value.trim();
      }
      // Readonly mode (after save): any element carrying name="description".
      const readonly = this.page.locator("xpath=//*[@name='description']").first();
      if (await readonly.count() > 0) {
        const text = await readonly.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        return text.trim();
      }
      return '';
    } catch (error) {
      console.error(`Error getting Internal Notes value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Open an Opportunity form by its (already-saved) URL and wait for the form to render.
   * Used to re-open a record captured earlier (e.g. "launch Opp URL #1"). Navigation only - no locators.
   * @param url - the full Opportunity form URL (Odoo hash URL with id=...&model=crm.lead&view_type=form)
   */
  async openByUrl(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.locator('.o_form_view').first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
  }

  /**
   * Read the customer "Phone" (crm.lead.phone) value on the Opportunity form.
   * Handles edit mode (<input name="phone">) and readonly mode (Odoo phone widget
   * <a name="phone" href="tel:<value>">value</a>). An empty phone renders as "false" - normalized to "".
   * XPath primary, CSS fallback. Reads across all renderings and returns the first non-empty value.
   * @returns the phone string, or "" if blank/not found
   */
  async getPhoneValue(): Promise<string> {
    const isBlank = (v: string) => !v || v.trim() === '' || v.trim().toLowerCase() === 'false';
    try {
      // Edit mode: read the input value.
      let input = this.phoneInputXPath();
      if (!(await input.count() > 0)) input = this.phoneInputCss();
      if (await input.count() > 0 && await input.isVisible().catch(() => false)) {
        const value = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (!isBlank(value)) return value.trim();
      }
      // Readonly mode: read the phone-widget anchor(s) - text first, then the tel: href.
      let anchors = this.phoneAnchorsXPath();
      if (!(await anchors.count() > 0)) anchors = this.phoneAnchorsCss();
      const total = await anchors.count();
      for (let i = 0; i < total; i++) {
        const a = anchors.nth(i);
        const text = (await a.textContent().catch(() => '') || '').trim();
        if (!isBlank(text)) return text;
        const href = (await a.getAttribute('href').catch(() => '') || '').trim();
        if (href.toLowerCase().startsWith('tel:')) {
          const num = href.slice(4).trim();
          if (!isBlank(num)) return num;
        }
      }
      return '';
    } catch (error) {
      console.error(`Error getting Phone value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Reload the Opp form until the customer Phone equals the expected value (reload-and-retry),
   * tolerant of a brief delay after a portal-side update.
   * @param expected - the phone value expected on the Opp form
   * @param maxAttempts - number of (read + reload) attempts (default 5)
   * @param interval - wait between reload attempts (default waitTimes.long)
   * @returns the last phone value read (equals `expected` on success)
   */
  async waitForPhoneEquals(
    expected: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    let phone = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      phone = await this.getPhoneValue();
      console.log(`  - Phone check attempt ${attempt}/${maxAttempts}: "${phone}" (expected "${expected}")`);
      if (phone === expected) return phone;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
        await this.phoneAnchorsXPath().first().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
        await this.wait(interval);
      }
    }
    return phone;
  }

  /**
   * Read the customer "Mobile" (crm.lead.mobile) value on the Opportunity form. Same Odoo phone-widget
   * rendering as Phone (edit: <input name="mobile">; readonly: <a name="mobile" href="tel:<value>">).
   * Empty renders as "false" - normalized to "". XPath primary, CSS fallback.
   * @returns the mobile string, or "" if blank/not found
   */
  async getMobileValue(): Promise<string> {
    const isBlank = (v: string) => !v || v.trim() === '' || v.trim().toLowerCase() === 'false';
    try {
      let input = this.mobileInputXPath();
      if (!(await input.count() > 0)) input = this.mobileInputCss();
      if (await input.count() > 0 && await input.isVisible().catch(() => false)) {
        const value = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (!isBlank(value)) return value.trim();
      }
      let anchors = this.mobileAnchorsXPath();
      if (!(await anchors.count() > 0)) anchors = this.mobileAnchorsCss();
      const total = await anchors.count();
      for (let i = 0; i < total; i++) {
        const a = anchors.nth(i);
        const text = (await a.textContent().catch(() => '') || '').trim();
        if (!isBlank(text)) return text;
        const href = (await a.getAttribute('href').catch(() => '') || '').trim();
        if (href.toLowerCase().startsWith('tel:')) {
          const num = href.slice(4).trim();
          if (!isBlank(num)) return num;
        }
      }
      return '';
    } catch (error) {
      console.error(`Error getting Mobile value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Reload the Opp form until the customer Mobile equals the expected value (reload-and-retry).
   * @returns the last mobile value read (equals `expected` on success)
   */
  async waitForMobileEquals(
    expected: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    let mobile = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      mobile = await this.getMobileValue();
      console.log(`  - Mobile check attempt ${attempt}/${maxAttempts}: "${mobile}" (expected "${expected}")`);
      if (mobile === expected) return mobile;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
        await this.wait(interval);
      }
    }
    return mobile;
  }

  /**
   * Reload the Opp form until the readonly Email equals the expected value (reload-and-retry),
   * tolerant of a brief delay after a portal-side update. Uses getEmailReadonly().
   * @returns the last email value read (equals `expected` on success)
   */
  async waitForEmailEquals(
    expected: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    let email = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      email = await this.getEmailReadonly();
      console.log(`  - Email check attempt ${attempt}/${maxAttempts}: "${email}" (expected "${expected}")`);
      if (email === expected) return email;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
        await this.wait(interval);
      }
    }
    return email;
  }

  /**
   * Reload the Opp form until the readonly Company/Customer name CONTAINS the expected substring
   * (reload-and-retry). Uses getCompanyNameReadonly() (the customer name = crm.lead.partner_name).
   * @returns the last company-name text read
   */
  async waitForCompanyNameContains(
    expected: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    let name = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      name = await this.getCompanyNameReadonly();
      console.log(`  - Company name check attempt ${attempt}/${maxAttempts}: "${name}" (expected to contain "${expected}")`);
      if (name.includes(expected)) return name;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
        await this.wait(interval);
      }
    }
    return name;
  }

  /**
   * Read the "Expected Closing" (date_deadline) value on the Opp form. Edit: input value;
   * readonly: <span name="date_deadline"> text. Returns the displayed date string, or "" if blank.
   */
  async getExpectedClosingValue(): Promise<string> {
    const isBlank = (v: string) => !v || v.trim() === '' || v.trim().toLowerCase() === 'false';
    try {
      const input = this.expectedClosingInputXPath();
      if (await input.count() > 0 && await input.isVisible().catch(() => false)) {
        const value = await input.inputValue({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '';
        if (!isBlank(value)) return value.trim();
      }
      const span = this.expectedClosingSpanXPath();
      if (await span.count() > 0) {
        const text = (await span.textContent({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => '') || '').trim();
        if (!isBlank(text)) return text;
      }
      return '';
    } catch (error) {
      console.error(`Error getting Expected Closing value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Reload the Opp form until the Expected Closing date, reduced to its digits (so format differences
   * like 08/15/2026 vs 2026-08-15 don't matter), CONTAINS each digit-group of the expected date
   * (reload-and-retry). Compares on a normalized digit signature.
   * @param expectedDate - the date as entered (e.g. "08/15/2026")
   * @returns the last raw Expected Closing value read
   */
  async waitForExpectedClosingMatches(
    expectedDate: string,
    maxAttempts: number = 5,
    interval: number = CommonUtils.waitTimes.long
  ): Promise<string> {
    // Normalize to a sorted set of numeric parts (year/month/day) regardless of separators/order.
    const sig = (s: string) => (s.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => n > 0).sort((a, b) => a - b).join('-');
    const target = sig(expectedDate);
    let value = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      value = await this.getExpectedClosingValue();
      console.log(`  - Expected Closing check attempt ${attempt}/${maxAttempts}: "${value}" (sig ${sig(value)} vs target ${target})`);
      if (target && sig(value) === target) return value;
      if (attempt < maxAttempts) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForPageReady(CommonUtils.waitTimes.contactShowing).catch(() => {});
        await this.wait(interval);
      }
    }
    return value;
  }

  // ─── SE support: linked-tickets smart button (card 6 - CRM updated on the deal) ────────────────

  /** The "Tickets" smart button on the Opportunity (open_customer_tickets) -> label like "1 Tickets". */
  private readonly linkedTicketsButton = () =>
    this.page.locator("xpath=//button[@name='open_customer_tickets'] | //button[contains(@class,'oe_stat_button')][.//*[contains(normalize-space(),'Tickets')]]").first();

  /**
   * Read the count on the Opportunity's "Tickets" smart button (open_customer_tickets). Returns the
   * integer parsed from its label (e.g. "1 Tickets" -> 1), or 0 if the button/label is absent.
   * This is the CRM's automatic link between the deal and the SE support ticket(s).
   */
  async getLinkedTicketsCount(): Promise<number> {
    const btn = this.linkedTicketsButton();
    if (!(await btn.isVisible({ timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => false))) {
      console.log('  - "Tickets" smart button not visible on the Opportunity');
      return 0;
    }
    const txt = ((await btn.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const m = txt.match(/(\d+)/);
    const count = m ? parseInt(m[1], 10) : 0;
    console.log(`  - Opportunity "Tickets" smart button: "${txt}" -> ${count}`);
    return count;
  }

  // --- CRM-12060: Customer (partner_id) many2one on the Opp form + autocomplete options ---
  // The VISIBLE Customer partner_id widget (the opp form also carries a hidden duplicate marked
  // o_invisible_modifier - exclude it so we type into the real Customer field).
  private readonly oppCustomerInput = () =>
    this.page.locator("xpath=//div[@name='partner_id' and not(contains(@class,'o_invisible_modifier'))]//input")
      .or(this.page.locator("div[name='partner_id']:not(.o_invisible_modifier) input")).first();
  private readonly oppM2oAutocompleteOptions = () =>
    this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]');
  // Kanban quick-create card (opened by CREATE on a partner-scoped crm.lead kanban).
  private readonly kanbanQuickCreateNameInput = () =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_quick_create')]//input[@name='name']").or(this.page.locator('.o_kanban_quick_create input')).first();
  private readonly kanbanQuickCreateAddButton = () =>
    this.page.locator("xpath=//div[contains(@class,'o_kanban_quick_create')]//button[contains(@class,'o_kanban_add') or normalize-space()='Add']").or(this.page.locator('.o_kanban_quick_create button.o_kanban_add')).first();
  private readonly kanbanRecordByText = (text: string) =>
    this.page.locator(`xpath=//div[contains(@class,'o_kanban_record')][contains(normalize-space(.),"${text}")]`).first();

  /**
   * Deep-link to a NEW Opportunity (crm.lead) form and wait for the Opportunity Name input.
   * Hash-safe (works from any module, unlike navigateToCRM which needs the CRM app link visible).
   * Action/menu ids are the pre-prod CRM pipeline (action=152, menu_id=111).
   */
  async openNewOpportunityFormHashSafe(): Promise<void> {
    const origin = new URL(this.page.url()).origin;
    await this.goto(`${origin}/web#action=152&model=crm.lead&view_type=form&menu_id=111`, { waitUntil: 'domcontentloaded' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.dismissErrorDialog().catch(() => {});
    await this.opportunityNameInput().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.wait(CommonUtils.waitTimes.long);
    console.log('  ✓ New Opportunity form opened (Customer field ready)');
  }

  /**
   * Quick-create an Opportunity from a kanban: click CREATE (opens the quick-create card), fill the
   * name, click "Add". When run from a PARTNER-scoped view (contact "Opportunities" smart button),
   * the new Opp is auto-linked to that partner via the context.
   */
  async quickCreateOpportunity(name: string): Promise<void> {
    await this.createButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.createButton().click();
    const input = this.kanbanQuickCreateNameInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.fill(name);
    await this.wait(CommonUtils.waitTimes.medium);
    await this.kanbanQuickCreateAddButton().click();
    await this.wait(CommonUtils.waitTimes.long);
    console.log(`  ✓ Quick-created Opportunity "${name}"`);
  }

  /**
   * Open a kanban card by its visible text (e.g. the quick-created Opp) and return the record URL.
   */
  async openKanbanCardByText(text: string): Promise<string> {
    const card = this.kanbanRecordByText(text);
    await card.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await card.click();
    await this.page.waitForFunction(() => /[#?&]id=\d+/.test(window.location.href), { timeout: CommonUtils.waitTimes.pageLoad }).catch(() => {});
    await this.wait(CommonUtils.waitTimes.long);
    const url = this.page.url();
    console.log(`  - Opened Opportunity card "${text}" -> ${url}`);
    return url;
  }

  /**
   * Type into the Opportunity "Customer" (partner_id) field and return the autocomplete option
   * texts. Does NOT save the record. Used by CRM-12060_2.3 to confirm partner names OUTSIDE the
   * merge wizard have no "(#ID)" suffix.
   * @param searchText - text to type into the Customer field
   */
  async getCustomerDropdownOptions(searchText: string): Promise<string[]> {
    const input = this.oppCustomerInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill('');
    await this.wait(CommonUtils.waitTimes.short);
    await input.fill(searchText);
    await this.wait(CommonUtils.waitTimes.long);
    const opts = (await this.oppM2oAutocompleteOptions().allTextContents())
      .map((o) => o.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    console.log(`  - Opp Customer options for "${searchText}" (${opts.length}): ${JSON.stringify(opts)}`);
    return opts;
  }
}

