import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Page Object
 * Handles interactions with Lead list and form pages
 */
export class LeadPage extends BasePage {
  // List view locators
  private readonly createButton = () => this.page.getByRole('button', { name: /CREATE/i });
  
  // Form view locators
  private readonly leadOpportunityInput = () => this.page.getByRole('textbox', { name: 'Lead Opportunity' }).or(this.page.locator('input[name="name"]')).first();
  private readonly contactNameInput = () => this.page.getByRole('textbox', { name: 'Contact Name' });
  private readonly companyNameInput = () => this.page.getByRole('textbox', { name: 'Company Name' });
  private readonly streetInput = () => this.page.locator('xpath=(//input[@name="street"])[1]');
  private readonly emailInput = () => this.page.locator('tr').filter({ hasText: 'Email' }).filter({ hasNotText: 'Email Templates' }).locator('input:visible').first();
  private readonly countryInput = () => this.page.getByPlaceholder('C﻿o﻿u﻿n﻿t﻿r﻿y').or(this.page.locator('input[placeholder*="ountry"]')).first();
  private readonly stateInput = () => this.page.getByPlaceholder('S﻿t﻿a﻿t﻿e').or(this.page.locator('input[placeholder*="tate"]')).first();
  private readonly dropdownMenuItem = () => this.page.locator('li.ui-menu-item, .ui-menu-item, .o_m2o_dropdown_option');
  private readonly salesTeamSelect = () => this.page.locator('select[name="team_id"]').or(this.page.locator('combobox:has-text("Sales Team")').locator('select')).or(this.page.getByLabel('Sales Team')).first();
  private readonly salespersonInput = () => this.page.getByRole('textbox', { name: 'Salesperson' }).first();
  private readonly createdManuallyRow = () => this.page.locator('tr:has-text("Create manually")');
  private readonly createdManuallyCheckbox = () => this.createdManuallyRow().locator('input[type="checkbox"]').first();
  private readonly tagsInput = () => this.page.locator('xpath=(//tr[td/label[contains(text(), "Tags")] or td[contains(text(), "Tags")]]//input)[2]').first();
  private readonly crmDeveloperTab = () => this.page.locator('xpath=(//a[@class="nav-link"][normalize-space()="CRM Developer"])');
  private readonly crmDeveloperTab_targetLead = () => this.page.locator('xpath=(//a[@class="nav-link"][normalize-space()="CRM Developer"])[2]');
  private readonly dealRegistrationTab = () => this.page.getByRole('tab', { name: 'Deal registration' });
  private readonly registeredDealCheckbox = () => this.page.locator('xpath=(//div[@name="registered_deal"]/input)[1]');
  private readonly dealRegistrationStartDateInput = () => this.page.locator('xpath=//input[@name="deal_registration_start_date"]');
  private readonly dealRegistrationEndDateInput = () => this.page.locator('xpath=//input[@name="deal_registration_end_date"]');
  private readonly dealRegistrationStartDate_OnlyMode = () => this.page.locator('xpath=(//span[@name="deal_registration_start_date"])[1]');
  private readonly dealRegistrationEndDate_OnlyMode = () => this.page.locator('xpath=(//span[@name="deal_registration_end_date"])[1]');
  private readonly leadFormInput = () => this.page.getByRole('textbox', { name: /Lead Form/i }).or(this.page.locator('input[name="x_lead_form"]')).first();
  private readonly activeCheckbox = () => this.page.locator('xpath=(//div[@name="active"]/input)[2]');
  private readonly isWonSelect = () => this.page.locator('xpath=//span[@name="won_status"]');
  private readonly lostReasonInput = () => this.page.locator('xpath=(//a[contains(@name,"lost_reason")])[2]');
  private readonly lostReasonInput_edit = () => this.page.locator('xpath=(//div[contains(@name,"lost_reason")]/div/input)[2]');
  private readonly nakivoCustomerRow = () => this.page.locator('.nav-link').filter({ hasText: 'Nakivo Customer' }).first();
  private readonly saveButton = () => this.page.getByRole('button', { name: 'Save' }).or(this.page.getByRole('button', { name: 'SAVE' })).first();
  private readonly serverErrorDialog = () =>
    this.page.locator("xpath=//div[contains(@class,'o_dialog_warning modal-body')]");
  private readonly editButtonLoc = () => this.page.locator('xpath=//button[normalize-space()="Edit" or normalize-space()="EDIT"]');
  private readonly editableFormLocator = () => this.page.locator('.o_form_editable, input:not([readonly])');
  private readonly salesTeam_saved_row = () => this.page.locator('xpath=//tr[td[contains(text(), "Sales Team")] or td/label[contains(text(), "Sales Team")]]').first();
  private readonly salesperson_saved_row = () => this.page.locator('xpath=//tr[td[contains(text(), "Salesperson")] or td/label[contains(text(), "Salesperson")]]').first();
  private readonly leadForm_saved_row = () => this.page.locator('xpath=//tr[td[contains(text(), "Lead Form")] or td/label[contains(text(), "Lead Form")]]').first();
  private readonly mergeNotification = () => this.page.locator('xpath=//p[contains(text(),"This lead has been merged into")]');
  private readonly chatterLogArea = () => this.page.locator('.o_thread_message_content, .o_mail_thread');
  private readonly contactNameRow = () => this.page.locator('td:has-text("Contact Name")').locator('..');
  private readonly emailLink = () => this.page.locator('a[href*="mailto:"]');
  private readonly addressRow = () => this.page.locator('td:has-text("Address")').locator('..');
  private readonly tagsRow = () => this.page.locator('xpath=//tr[td/label[contains(text(), "Tags")] or td[contains(text(), "Tags")]]').first();
  private readonly tagsList = () => this.page.locator('xpath=(//div[@name="tag_ids"])[1]').first();

  // Inline-extracted locators
  private readonly resellerInput = () => this.page.locator('tr').filter({ hasText: 'Reseller' }).locator('input').first();
  private readonly distributorInput = () => this.page.locator('tr').filter({ hasText: 'Distributor' }).locator('input').first();
  private readonly mainLeadTab = () => this.page.locator('a.nav-link[name="lead"]').first();
  private readonly registeredDealDiv = () => this.page.locator('xpath=//div[@name="registered_deal"]');
  private readonly nakivoCustomerDiv = () => this.page.locator('div[name="nakivo_customer"]');
  private readonly activatedPartnerDivLoc = () => this.page.locator('div[name="activated_partner"]');
  private readonly partnerDivLoc = () => this.page.locator('div[name="partner"]');
  private readonly newPartnerDivLoc = () => this.page.locator('div[name="new_partner"]');
  private readonly secondTagsContainerLoc = () => this.page.locator('xpath=(//div[@name="tag_ids"])[2]');
  private readonly companyNameRowLoc = () => this.page.locator('td:has-text("Company Name")').locator('..');
  private readonly activeCheckedAttrInput = () => this.page.locator('xpath=//input[@name="active"][@checked or @checked="checked"]');
  private readonly activeCheckedCssInput = () => this.page.locator('input[name="active"]:checked');
  private readonly formView = () => this.page.locator('.o_form_view');

  // Field cell locators (second column of saved rows)
  private readonly salesTeamCell = () => this.salesTeam_saved_row().locator('xpath=./td[2]').first();
  private readonly salespersonCell = () => this.salesperson_saved_row().locator('xpath=./td[2]').first();
  private readonly leadFormCell = () => this.leadForm_saved_row().locator('xpath=./td[2]').first();
  
  // Input/select element locators within cells
  private readonly salesTeamSelectElement = () => this.salesTeamCell().locator('xpath=.//select | .//*[@role="combobox"]');
  private readonly salesTeamSelectedOption = () => this.salesTeamSelectElement().locator('option:checked').first();
  private readonly salespersonInputElement = () => this.salespersonCell().locator('xpath=.//input[@type="text"] | .//input[@role="textbox"]');
  private readonly leadFormInputElement = () => this.leadFormCell().locator('input[name="x_studio_lead_sorce"]');
  private readonly actionMenuButton = () =>
    this.page.locator('xpath=//button[normalize-space()="Action" or normalize-space()="ACTION"] | //span[normalize-space()="Action" or normalize-space()="ACTION"]/parent::button | //div[contains(@class,"o_cp_action_menus")]//button').first();
  private readonly actionMenuDeleteOption = () =>
    this.page.locator('xpath=//div[contains(@class,"dropdown-menu") and contains(@class,"show")]//a[normalize-space()="Delete" or normalize-space()="DELETE"] | //ul[contains(@class,"dropdown-menu") and contains(@class,"show")]//a[normalize-space()="Delete"]').first();
  private readonly actionMenuDeleteOptionFallback = () =>
    this.page.locator('.dropdown-menu.show a.dropdown-item, .o_dropdown_menu.show a, [role="menu"]:visible a[role="menuitem"]')
      .filter({ hasText: /^Delete$/i }).first();
  private readonly confirmDeleteOkButton = () =>
    this.page.locator('xpath=//button[normalize-space()="Ok" or normalize-space()="OK"] | //button[contains(@class,"btn-primary")][normalize-space()="Ok" or normalize-space()="OK"]').first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Get Lead Opportunity input locator (public accessor for waiting)
   */
  getLeadOpportunityInput() {
    return this.leadOpportunityInput();
  }

  /**
   * Get Street input locator (public accessor for waiting)
   */
  getStreetInput() {
    return this.streetInput();
  }

  /**
   * Get Company Name input locator (public accessor for waiting)
   */
  getCompanyNameInput() {
    return this.companyNameInput();
  }

  /**
   * Get Email input locator (public accessor for waiting)
   */
  getEmailInput() {
    return this.emailInput();
  }

  /**
   * Get Edit button locator (public accessor)
   */
  getEditButton() {
    return this.editButtonLoc();
  }

  /**
   * Get CREATE button locator (public accessor for highlighting)
   */
  getCreateButton() {
    return this.createButton();
  }

  /**
   * Get SAVE button locator (public accessor for highlighting)
   */
  getSaveButton() {
    return this.saveButton();
  }

  /**
   * Get editable form locator (for waiting after entering edit mode)
   */
  getEditableFormLocator() {
    return this.editableFormLocator();
  }

  /**
   * Click CREATE button to open lead creation form
   */
  async clickCreate() {
    await this.createButton().click();
    await this.waitForURL('**/web?*view_type=form*', CommonUtils.waitTimes.elementAppear);
    await this.wait(300);
  }

  /**
   * Fill lead opportunity name
   */
  async fillLeadOpportunity(name: string) {
    await this.leadOpportunityInput().fill(name);
  }

  /**
   * Fill contact name
   */
  async fillContactName(name: string) {
    await this.contactNameInput().fill(name);
  }

  /**
   * Fill company name
   */
  async fillCompanyName(name: string) {
    await this.companyNameInput().fill(name);
  }

  /**
   * Fill street address
   */
  async fillStreet(street: string) {
    await this.streetInput().fill(street);
  }

  /**
   * Fill email address
   */
  async fillEmail(email: string) {
    await this.emailInput().fill(email);
  }

  /**
   * Select country from dropdown
   * Handles partial match issues - verifies correct country was selected and retries if needed
   * @param country - The exact country name to select
   */
  async selectCountry(country: string) {
    const input = this.countryInput();
    await input.click();
    await input.fill('');
    await this.wait(150);
    await input.fill(country);
    await this.wait(500);
    
    // Define countries with known partial match issues and their exclusion patterns
    const partialMatchExclusions: Record<string, string> = {
      'India': 'British Indian Ocean Territory'
    };
    
    // Select from dropdown with exclusion filter if needed
    let option;
    if (partialMatchExclusions[country]) {
      option = this.dropdownMenuItem()
        .filter({ hasText: country })
        .filter({ hasNotText: partialMatchExclusions[country] })
        .first();
    } else {
      option = this.dropdownMenuItem()
        .filter({ hasText: country })
        .first();
    }
    
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
    
    // Verify the correct country was selected (for all countries, not just India)
    await this.wait(200);
    const selectedValue = await input.inputValue().catch(() => '');
    
    // Check if wrong country was selected (doesn't match expected or is excluded pattern)
    const isWrongCountry = selectedValue === '' || 
                          !selectedValue.includes(country) ||
                          (partialMatchExclusions[country] && selectedValue.includes(partialMatchExclusions[country]));
    
    if (isWrongCountry) {
      console.log(`  - Wrong country detected: "${selectedValue}", re-selecting ${country}...`);
      
      // Retry with slower typing for better autocomplete accuracy
      await input.click();
      await this.wait(500);
      await input.fill('');
      
      // Type first 3 characters slowly to trigger autocomplete
      const searchTerm = country.substring(0, Math.min(3, country.length));
      await input.pressSequentially(searchTerm, { delay: 150 });
      await this.wait(1500);
      
      // Select with exclusion filter if applicable
      if (partialMatchExclusions[country]) {
        await this.dropdownMenuItem()
          .filter({ hasText: country })
          .filter({ hasNotText: partialMatchExclusions[country] })
          .first()
          .click();
      } else {
        await this.dropdownMenuItem()
          .filter({ hasText: country })
          .first()
          .click();
      }
      
      await this.wait(500);
    }
  }

  /**
   * Select state from dropdown
   */
  async selectState(state: string) {
    await this.wait(150);
    const input = this.stateInput();
    await input.click();
    await input.fill('');
    await this.wait(150);
    await input.fill(state);
    await this.wait(500);
    
    const option = this.dropdownMenuItem().filter({ hasText: state }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
  }

  /**
   * Clear sales team selection
   */
  async clearSalesTeam() {
    await this.wait(150);
    const select = this.salesTeamSelect();
    const exists = await select.count() > 0;
    if (exists) {
      await select.selectOption({ index: 0 });
      return true;
    }
    return false;
  }

  /**
   * Select sales team by name
   * @param teamName - The name of the sales team to select (e.g., 'CMR')
   */
  async selectSalesTeam(teamName: string) {
    await this.wait(500);
    const select = this.salesTeamSelect();
    await select.selectOption({ label: teamName });
  }

  /**
   * Clear salesperson field
   */
  async clearSalesperson() {
    await this.wait(150);
    const input = this.salespersonInput();
    const exists = await input.count() > 0;
    if (exists) {
      await input.click();
      await input.fill('');
      await this.wait(100);
      await this.page.locator('td:has-text("Sales Team")').click();
      await this.wait(100);
      return true;
    }
    return false;
  }

  /**
   * Select salesperson by name
   * @param personName - The name of the salesperson to select (e.g., 'Jayden Nguyen')
   */
  async selectSalesperson(personName: string) {
    await this.wait(500);
    const input = this.salespersonInput();
    await input.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await input.click();
    await input.fill(personName);
    await this.wait(1000);
    
    // Wait for dropdown options to appear and click the matching one
    const option = this.page.locator('.ui-menu-item, .o_m2o_dropdown_option, li[role="option"]')
      .filter({ hasText: new RegExp(`^${personName}$`, 'i') })
      .first();
    
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await option.click();
    await this.wait(500);
  }

  /**
   * Fill Reseller field with contact name
   * @param contactName - The name of the contact to set as reseller
   */
  async fillReseller(contactName: string) {
    const resellerInput = this.resellerInput();
    await resellerInput.click();
    await resellerInput.fill('');
    await this.wait(300);
    await resellerInput.fill(contactName);
    await this.wait(800);
    
    const option = this.dropdownMenuItem().filter({ hasText: contactName }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
  }

  /**
   * Fill Distributor field with contact name
   * @param contactName - The name of the contact to set as distributor
   */
  async fillDistributor(contactName: string) {
    const distributorInput = this.distributorInput();
    await distributorInput.click();
    await distributorInput.fill('');
    await this.wait(300);
    await distributorInput.fill(contactName);
    await this.wait(800);
    
    const option = this.dropdownMenuItem().filter({ hasText: contactName }).first();
    await option.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    await option.click().catch(async () => {
      await this.page.keyboard.press('Enter');
    });
  }

  /**
   * Uncheck "Created Manually" checkbox
   */
  async uncheckCreatedManually() {
    await this.wait(150);
    const row = this.createdManuallyRow();
    const exists = await row.count() > 0;
    if (exists) {
      const checkbox = this.createdManuallyCheckbox();
      const isChecked = await checkbox.isChecked();
      if (isChecked) {
        await row.locator('label, .custom-control').first().click({ force: true });
        await this.wait(100);
        const nowUnchecked = await checkbox.isChecked() === false;
        return nowUnchecked;
      }
      return true; // Already unchecked
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
   * Add a tag to the Tags field
   * @param tagName - The name of the tag to add (e.g., "Enterprise account")
   */
  async addTag(tagName: string) {
    await this.wait(CommonUtils.waitTimes.abnormalWait);
    
    try {
      // Check if Tags field exists
      const tagsInput = this.tagsInput();
      const exists = await tagsInput.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Tags field not found');
        return false;
      }
      
      // Click and fill the tags input
      await tagsInput.click();
      await this.wait(300);
      await tagsInput.fill(tagName);
      await this.wait(800);
      
      // Look for the tag option in the dropdown
      const option = this.page.locator(`xpath=//*[contains(@class, 'ui-menu-item') or contains(@class, 'o_m2o_dropdown_option') or contains(@class, 'badge')][contains(., '${tagName}')]`).first();
      const optionVisible = await option.isVisible().catch(() => false);
      
      if (optionVisible) {
        // Try pressing Enter to create/select the tag
        await this.page.keyboard.press('Enter');
        await this.wait(300);
        console.log(`  ✓ Tag "${tagName}" added via Enter key`);
        return true;
       
      } else {
         
        await option.click();
        await this.wait(300);
        console.log(`  ✓ Tag "${tagName}" added successfully`);
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error adding tag: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Click CRM Developer tab on target lead page
   */
  async clickCRMDeveloperTab_targetLead() {
    await this.wait(500);
    await this.crmDeveloperTab_targetLead().click();
    await this.wait(500);
  }
/**
   * Click CRM Developer tab
   * Handles case where tab is already active by clicking main tab first
   */
  async clickCRMDeveloperTab() {
    await this.wait(150);
    
    // Check if CRM Developer tab is already active
    const isActive = await this.crmDeveloperTab().first().evaluate((el) => {
      return el.classList.contains('active');
    }).catch(() => false);
    
    if (isActive) {
      // If already active, click main tab first to deactivate, then click back
      console.log('  - CRM Developer tab already active, clicking main tab first...');
      await this.clickMainTabToExitCRMDeveloper();
    }
    
    await this.crmDeveloperTab().first().click();
    await this.wait(300);
  }

  /**
   * Click main tab to exit CRM Developer tab state
   * Returns to the main lead view from CRM Developer tab
   */
  async clickMainTabToExitCRMDeveloper() {
    const mainTabLocator = this.mainLeadTab();
    const isVisible = await mainTabLocator.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (isVisible) {
      await mainTabLocator.click();
      await this.wait(1000); // CommonUtils.waitTimes.standard
      return true;
    }
    return false;
  }

  /**
   * Click Deal Registration tab
   */
  async clickDealRegistrationTab() {
    await this.wait(500);
    await this.dealRegistrationTab().click();
    await this.wait(1000);
  }

  /**
   * Check "Registered deal" checkbox
   * Uses multi-strategy approach: scroll into view, force click, JavaScript fallback
   */
  async checkRegisteredDeal() {
    await this.wait(500);
    
    try {
      const checkbox = this.registeredDealCheckbox();
      const exists = await checkbox.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Registered deal checkbox not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (!isChecked) {
        // Strategy 1: Scroll into view and try clicking with force
        try {
          await checkbox.scrollIntoViewIfNeeded({ timeout: 3000 });
          await this.wait(300);
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked Registered deal checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Force click failed, trying JavaScript approach...');
        }
        
        // Strategy 2: Use JavaScript to click and set state
        try {
          await checkbox.evaluate((el: HTMLInputElement) => {
            // Scroll element into view
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Set checked state
            el.checked = true;
            
            // Trigger all relevant events
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          });
          
          await this.wait(500);
          const nowChecked = await checkbox.isChecked().catch(() => false);
          
          if (nowChecked) {
            console.log('  ✓ Successfully checked Registered deal checkbox using JavaScript');
            return true;
          }
        } catch (error) {
          console.log(`  - JavaScript approach failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Strategy 3: Try clicking the parent div container
        try {
          const parentDiv = this.registeredDealDiv();
          await parentDiv.scrollIntoViewIfNeeded({ timeout: 3000 });
          await this.wait(300);
          await parentDiv.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked Registered deal checkbox via parent div');
            return true;
          }
        } catch (error) {
          console.log(`  - Parent div click failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        console.log('  ⚠ All strategies failed to check Registered deal checkbox');
        return false;
      } else {
        console.log('  ✓ Registered deal checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking Registered deal: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Fill Deal Registration Start Date
   * @param date - Date in YYYY-MM-DD format
   */
  async fillDealRegistrationStartDate(date: string) {
    await this.wait(300);
    const input = this.dealRegistrationStartDateInput();
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await input.fill(date);
    await input.press('Enter');
    await this.wait(500);
  }

  /**
   * Fill Deal Registration End Date
   * @param date - Date in YYYY-MM-DD format
   */
  async fillDealRegistrationEndDate(date: string) {
    await this.wait(300);
    const input = this.dealRegistrationEndDateInput();
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await input.fill(date);
    await input.press('Enter');
    await this.wait(500);
  }

  /**
   * Check if Registered deal checkbox is checked
   * @returns Promise<boolean> - true if checkbox is checked
   */
  async isRegisteredDealChecked(): Promise<boolean> {
    return await this.registeredDealCheckbox().isChecked().catch(() => false);
  }

  /**
   * Get Deal registration start date value
   * @returns Promise<string> - The start date in YYYY-MM-DD format
   */
  async getDealRegistrationStartDate(): Promise<string> {
    const text = await this.dealRegistrationStartDate_OnlyMode().textContent().catch(() => '');
    if (!text || !text.trim()) return '';
    
    const trimmed = text.trim();
    // Check if format is MM/DD/YYYY and convert to YYYY-MM-DD
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month}-${day}`;
    }
    // Already in YYYY-MM-DD format or other format
    return trimmed;
  }

  /**
   * Get Deal registration end date value
   * @returns Promise<string> - The end date in YYYY-MM-DD format
   */
  async getDealRegistrationEndDate(): Promise<string> {
    const text = await this.dealRegistrationEndDate_OnlyMode().textContent().catch(() => '');
    if (!text || !text.trim()) return '';
    
    const trimmed = text.trim();
    // Check if format is MM/DD/YYYY and convert to YYYY-MM-DD
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month}-${day}`;
    }
    // Already in YYYY-MM-DD format or other format
    return trimmed;
  }

  /**
   * Wait for no merge confirmation (90 seconds)
   * Used in negative merge tests to ensure leads do not merge
   */
  async waitForNoMergeConfirmation() {
    console.log('⏳ Waiting 90 seconds to confirm no merge occurs...');
    await this.wait(CommonUtils.waitTimes.leadMergingNotHappen);
    console.log('✓ Wait completed - no merge should have occurred');
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
      await this.wait(150);
      await input.fill(value);
      await this.wait(500);
      
      const option = this.page.locator(`xpath=//*[contains(@class, 'ui-menu-item') or contains(@class, 'o_m2o_dropdown_option')][contains(., '${value}')]`).first();
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
   * Check "Nakivo Customer" checkbox
   */
  async checkNakivoCustomer() {
    await this.wait(500);
    
    try {
      // Find the div with name="nakivo_customer" and get the checkbox inside
      const nakivoDiv = this.nakivoCustomerDiv();
      const exists = await nakivoDiv.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Nakivo Customer checkbox div not found');
        return false;
      }
      
      // Get the checkbox input inside the div
      const checkbox = nakivoDiv.locator('input[type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      
      if (!checkboxExists) {
        console.log('  ⚠ Nakivo Customer checkbox input not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (!isChecked) {
        // Strategy 1: Try clicking the checkbox directly with force
        try {
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked Nakivo Customer checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Click failed, trying JavaScript evaluation...');
        }
        
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
            console.log('  ✓ Successfully checked Nakivo Customer checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to check Nakivo Customer checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ Nakivo Customer checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking Nakivo Customer: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Uncheck "Nakivo Customer" checkbox
   */
  async uncheckNakivoCustomer() {
    await this.wait(500);
    
    try {
      // Find the div with name="nakivo_customer" and get the checkbox inside
      const nakivoDiv = this.nakivoCustomerDiv();
      const exists = await nakivoDiv.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Nakivo Customer checkbox div not found');
        return false;
      }
      
      // Get the checkbox input inside the div
      const checkbox = nakivoDiv.locator('input[type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      
      if (!checkboxExists) {
        console.log('  ⚠ Nakivo Customer checkbox input not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (isChecked) {
        // Strategy 1: Try clicking the checkbox directly with force
        try {
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowUnchecked = await checkbox.isChecked().catch(() => true);
          if (!nowUnchecked) {
            console.log('  ✓ Successfully unchecked Nakivo Customer checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Click failed, trying JavaScript evaluation...');
        }
        
        // Strategy 2: Use JavaScript to set the checkbox state directly
        try {
          await checkbox.evaluate((el: HTMLInputElement) => {
            el.checked = false;
            // Trigger change event to notify any listeners
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          
          await this.wait(500);
          const nowUnchecked = await checkbox.isChecked().catch(() => true);
          
          if (!nowUnchecked) {
            console.log('  ✓ Successfully unchecked Nakivo Customer checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to uncheck Nakivo Customer checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ Nakivo Customer checkbox already unchecked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error unchecking Nakivo Customer: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Check "Activated Partner" checkbox
   */
  async checkActivatedPartner() {
    await this.wait(500);
    
    try {
      // Find the div with name="activated_partner" and get the checkbox inside
      const activatedPartnerDiv = this.activatedPartnerDivLoc();
      const exists = await activatedPartnerDiv.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Activated Partner checkbox div not found');
        return false;
      }
      
      // Get the checkbox input inside the div
      const checkbox = activatedPartnerDiv.locator('input[type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      
      if (!checkboxExists) {
        console.log('  ⚠ Activated Partner checkbox input not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (!isChecked) {
        // Strategy 1: Try clicking the checkbox directly with force
        try {
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked Activated Partner checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Click failed, trying JavaScript evaluation...');
        }
        
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
            console.log('  ✓ Successfully checked Activated Partner checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to check Activated Partner checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ Activated Partner checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking Activated Partner: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async checkPartner() {
    await this.wait(500);
    
    try {
      // Find the div with name="partner" and get the checkbox inside
      const partnerDiv = this.partnerDivLoc();
      const exists = await partnerDiv.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ Partner checkbox div not found');
        return false;
      }
      
      // Get the checkbox input inside the div
      const checkbox = partnerDiv.locator('input[type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      
      if (!checkboxExists) {
        console.log('  ⚠ Partner checkbox input not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (!isChecked) {
        // Strategy 1: Try clicking the checkbox directly with force
        try {
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked Partner checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Click failed, trying JavaScript evaluation...');
        }
        
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
            console.log('  ✓ Successfully checked Partner checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to check Partner checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ Partner checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking Partner: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Check "New Partner" checkbox in CRM Developer tab
   * Uses two-strategy approach: direct click first, then JavaScript fallback
   * @returns true if checkbox was successfully checked or already checked, false otherwise
   */
  async checkNewPartner() {
    await this.wait(500);
    
    try {
      // Find the div with name="new_partner" and get the checkbox inside
      const newPartnerDiv = this.newPartnerDivLoc();
      const exists = await newPartnerDiv.count() > 0;
      
      if (!exists) {
        console.log('  ⚠ New Partner checkbox div not found');
        return false;
      }
      
      // Get the checkbox input inside the div
      const checkbox = newPartnerDiv.locator('input[type="checkbox"]').first();
      const checkboxExists = await checkbox.count() > 0;
      
      if (!checkboxExists) {
        console.log('  ⚠ New Partner checkbox input not found');
        return false;
      }
      
      const isChecked = await checkbox.isChecked().catch(() => false);
      
      if (!isChecked) {
        // Strategy 1: Try clicking the checkbox directly with force
        try {
          await checkbox.click({ force: true, timeout: 5000 });
          await this.wait(500);
          
          const nowChecked = await checkbox.isChecked().catch(() => false);
          if (nowChecked) {
            console.log('  ✓ Successfully checked New Partner checkbox');
            return true;
          }
        } catch (error) {
          console.log('  - Click failed, trying JavaScript evaluation...');
        }
        
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
            console.log('  ✓ Successfully checked New Partner checkbox using JavaScript');
            return true;
          } else {
            console.log('  ⚠ Failed to check New Partner checkbox - state did not change');
            return false;
          }
        } catch (error) {
          console.log(`  ⚠ JavaScript evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      } else {
        console.log('  ✓ New Partner checkbox already checked');
        return true;
      }
    } catch (error) {
      console.log(`  ⚠ Error checking New Partner: ${error instanceof Error ? error.message : String(error)}`);
      return false;
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
   * Click save button
   */
  async clickSave() {
    // Dismiss any open autocomplete dropdowns that might block the save button
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.wait(100);
    
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
  }

  /**
   * Click edit button
   */
  async clickEdit() {
    await this.editButtonLoc().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.editButtonLoc().click();
    await this.wait(1000);
  }

  /**
   * Wait for save to complete
   */
  async waitForSaveComplete(timeout: number = 60000) {
    await this.waitForURL('**/web?*id=*&*', timeout);
  }

  /**
   * Check if Active checkbox is checked
   * @returns Promise<boolean> - true if checkbox is checked
   */
  async isActiveChecked(): Promise<boolean> {
    return await this.activeCheckbox().isChecked().catch(() => true);
  }

  /**
   * Check if Active checkbox is checked using DOM property evaluation
   * Approach 2: Uses evaluate() to directly access the DOM element's checked property
   * @returns Promise<boolean> - true if checkbox is checked
   */
  async isActiveCheckedViaEvaluate(): Promise<boolean> {
    return await this.activeCheckbox().evaluate((el: HTMLInputElement) => el.checked).catch(() => false);
  }

  /**
   * Check if Active checkbox is checked using getAttribute
   * Approach 3: Uses getAttribute() to check if 'checked' attribute exists
   * Note: This checks the HTML attribute, not the DOM property
   * @returns Promise<boolean> - true if checkbox has 'checked' attribute
   */
  async isActiveCheckedViaAttribute(): Promise<boolean> {
    const checkedAttr = await this.activeCheckbox().getAttribute('checked').catch(() => null);
    return checkedAttr !== null;
  }

  /**
   * Check if Active checkbox is checked using count-based verification
   * Approach 4: Uses a filtered locator to count checked checkboxes
   * @returns Promise<boolean> - true if a checked active checkbox is found
   */
  async isActiveCheckedViaCount(): Promise<boolean> {
    const checkedCount = await this.activeCheckedAttrInput().count();
    if (checkedCount > 0) {
      return true;
    }
    // Fallback: Check using :checked pseudo-selector
    const checkedCountCss = await this.activeCheckedCssInput().count();
    return checkedCountCss > 0;
  }

  /**
   * Get the current Is Won value from CRM Developer tab
   * @returns Promise<string> - The selected option text (e.g., 'Pending', 'Won', 'Lost')
   */
  async getIsWonValue(): Promise<string> {
    const textContent = await this.isWonSelect().textContent().catch(() => 'Pending');
    return textContent?.trim() || 'Pending';
  }

  /**
   * Get the current Lost Reason value from CRM Developer tab
   * Approach 1: Uses inputValue() method (works if element has value attribute)
   * @returns Promise<string> - The lost reason text value, or empty string if blank
   */
  // async getLostReasonValue(): Promise<string> {
  //   return await this.lostReasonInput_edit().inputValue().catch(() => '');
  // }

  /**
   * Get the current Lost Reason value using textContent
   * Approach 2 -Quoc Anh - Stable: Uses textContent() to get the text content of the anchor element
   * @returns Promise<string> - The lost reason text value, or empty string if blank
   */
  async getLostReasonValueViaTextContent(): Promise<string> {
    const textContent = await this.lostReasonInput().textContent().catch(() => '');
    return textContent?.trim() || '';
  }

  /**
   * Get the current Lost Reason value using innerText via evaluate
   * Approach 3: Uses evaluate() to access DOM element's innerText property
   * @returns Promise<string> - The lost reason text value, or empty string if blank
   */
  // async getLostReasonValueViaInnerText(): Promise<string> {
  //   return await this.lostReasonInput_edit().evaluate((el: HTMLElement) => el.innerText?.trim() || '').catch(() => '');
  // }

  /**
   * Get the current Lost Reason value using title attribute
   * Approach 4: Uses getAttribute('title') to get the title attribute value
   * Useful if the anchor element has a title attribute with the lost reason
   * @returns Promise<string> - The lost reason from title attribute, or empty string if not found
   */
  // async getLostReasonValueViaTitle(): Promise<string> {
  //   const title = await this.lostReasonInput_edit().getAttribute('title').catch(() => null);
  //   return title?.trim() || '';
  // }

  /**
   * Get the current Lost Reason value using multiple fallback strategies
   * Approach 5: Tries multiple methods in order until one succeeds
   * @returns Promise<string> - The lost reason text value, or empty string if all methods fail
   */
  async getLostReasonValueWithFallback(): Promise<string> {
    // Try textContent first (most reliable for anchor elements)
    let value = await this.lostReasonInput_edit().textContent().catch(() => null);
    if (value && value.trim()) {
      return value.trim();
    }
    
    // Try innerText via evaluate
    value = await this.lostReasonInput().evaluate((el: HTMLElement) => el.innerText).catch(() => null);
    if (value && value.trim()) {
      return value.trim();
    }
    
    // Try title attribute
    value = await this.lostReasonInput().getAttribute('title').catch(() => null);
    if (value && value.trim()) {
      return value.trim();
    }
    
    // Try inputValue as last resort
    value = await this.lostReasonInput().inputValue().catch(() => null);
    return value?.trim() || '';
  }

  /**
   * Get the current Lead Form value
   * Handles both edit mode (input field) and readonly mode (text)
   * @returns The Lead Form value as a string, or empty string if not found
   */
  async getLeadFormValue(): Promise<string> {
    try {
      // Look for Lead Form field - can be either editable (input) or readonly (text)
      const hasInput = await this.leadFormInputElement().count() > 0;
      
      if (hasInput) {
        // Editable mode (unsaved) - get from input
        const value = await this.leadFormInputElement().inputValue().catch(() => '') || '';
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await this.leadFormCell().textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Lead Form value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get company name value
   * @returns The company name value as a string
   */
  async getCompanyNameValue(): Promise<string> {
    return await this.companyNameInput().inputValue();
  }

  /**
   * Get street value
   * @returns The street value as a string
   */
  async getStreetValue(): Promise<string> {
    return await this.streetInput().inputValue();
  }

  /**
   * Get country value
   * @returns The country value as a string
   */
  async getCountryValue(): Promise<string> {
    return await this.countryInput().inputValue();
  }

  /**
   * Get state value
   * @returns The state value as a string
   */
  async getStateValue(): Promise<string> {
    return await this.stateInput().inputValue();
  }

  /**
   * Get email value
   * @returns The email value as a string
   */
  async getEmailValue(): Promise<string> {
    return await this.emailInput().inputValue();
  }

  /**
   * Wait for lead form to fully load in edit mode
   * Waits for loading spinner to hide and key form elements to be visible
   * @param spinnerTimeout - Timeout for loading spinner (default: 60000ms)
   * @param elementTimeout - Timeout for each form element (default: 15000ms)
   */
  async waitForLeadFormToLoad(spinnerTimeout: number = 60000, elementTimeout: number = 15000): Promise<void> {
    // Wait for loading spinner to hide
    await this.waitForLoadingSpinnerToHide(spinnerTimeout);
    
    // Wait for key form elements to be visible and attached
    await Promise.all([
      this.leadOpportunityInput().waitFor({ state: 'attached', timeout: elementTimeout }).catch(() => 
        console.log('  - Waiting for Lead Opportunity input...')
      ),
      this.streetInput().waitFor({ state: 'attached', timeout: elementTimeout }).catch(() => 
        console.log('  - Waiting for Street input...')
      ),
      this.companyNameInput().waitFor({ state: 'attached', timeout: elementTimeout }).catch(() => 
        console.log('  - Waiting for Company Name input...')
      ),
      this.emailInput().waitFor({ state: 'attached', timeout: elementTimeout }).catch(() => 
        console.log('  - Waiting for Email input...')
      )
    ]);
    
    // Wait for elements to be actually visible (not just attached)
    await Promise.all([
      this.leadOpportunityInput().waitFor({ state: 'visible', timeout: elementTimeout }).catch(() => {}),
      this.streetInput().waitFor({ state: 'visible', timeout: elementTimeout }).catch(() => {}),
      this.companyNameInput().waitFor({ state: 'visible', timeout: elementTimeout }).catch(() => {}),
      this.emailInput().waitFor({ state: 'visible', timeout: elementTimeout }).catch(() => {})
    ]);
    
    // Wait for page to be stable (no layout shifts)
    await this.wait(5000);
    
    // Verify at least one key element is interactive
    const isInteractive = await this.leadOpportunityInput().isEditable().catch(() => false);
    if (!isInteractive) {
      console.log('  - Warning: Form may not be fully interactive yet, waiting 8 more seconds...');
      await this.wait(8000);
    }
  }

  /**
   * Check if merge notification is visible
   * @returns Promise<boolean> - true if merge notification is visible
   */
  async isMergeNotificationVisible(): Promise<boolean> {
    return await this.mergeNotification().isVisible().catch(() => false);
  }

  /**
   * Get merge notification text
   * @returns Promise<string> - The merge notification text content
   */
  async getMergeNotificationText(): Promise<string> {
    return await this.mergeNotification().textContent() || '';
  }

  /**
   * Get chatter/log area text content
   * @returns Promise<string> - The chatter log area text content
   */
  async getChatterLogText(): Promise<string> {
    const chatterArea = this.chatterLogArea();
    await chatterArea.first().waitFor({ state: 'attached', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
    return await chatterArea.allTextContents().then(texts => texts.join(' ')) || '';
  }

  /**
   * * Quoc Anh's comment: This method is used on Target Lead
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
   * Quoc Anh's comment: This method is used on Source Lead
   * Check if chatter log contains merge message showing this lead was merged into a target lead
   * Validates the exact format: "This lead has been merged into [Target Lead]"
   * @param leadName - The name of the target lead this lead was merged into
   * @returns Promise<boolean> - true if merge message with exact format is found
   */
  async hasTargetLeadMergeMessage(leadName: string): Promise<boolean> {
    const logText = await this.getChatterLogText();
    const expectedMessage = `This lead has been merged into ${leadName}`;
    console.log(`  ℹ️ Expected merge message: "${expectedMessage}"`);
    
    return logText.includes(expectedMessage);
  }

  /**
   * Wait for lead merging to happen by checking for merge notification
   * Polls the page by refreshing and checking for target lead merge message
   * @param targetLeadName - The name of the target lead this lead was merged into
   * @param maxAttempts - Maximum number of attempts (default: 6)
   * @param waitBetweenAttempts - Wait time in ms between attempts (default: 30000)
   * @returns Promise<boolean> - true if merge notification was found, false otherwise
   */
  async waitForLeadMergingHappen(targetLeadName: string, maxAttempts: number = 6, waitBetweenAttempts: number = 30000): Promise<boolean> {
    await this.wait(2000);
    
    let mergeNotificationFound = false;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Attempt ${attempt}/${maxAttempts}: Checking for merge notification...`);
      
      // Refresh the page to get latest state
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      
      // Wait for page to be fully loaded
      //Feb 02, 2026: check, we might need longer wait here due to chatter loading delay after reload      
      await this.wait(CommonUtils.waitTimes.checkingChatterLog || 50000);
      
      // Check if chatter log contains merge message
      const hasMergeMessage = await this.hasTargetLeadMergeMessage(targetLeadName);
      if (hasMergeMessage) {
        console.log(`✓ Merge message found: "This lead has been merged into ${targetLeadName}"`);
        mergeNotificationFound = true;
        break;
      }
      
      console.log(`  ℹ️ Merge message not yet found (attempt ${attempt}/${maxAttempts})`);
      
      // Wait before next attempt (only if not the last attempt)
      if (attempt < maxAttempts) {
        console.log(`  ⏳ Waiting ${waitBetweenAttempts / 1000} seconds before next refresh...`);
        await this.page.waitForTimeout(waitBetweenAttempts);
      }
    }
    
    return mergeNotificationFound;
  }
/**
   * QUOC ANH: Stay at TARGET LEAD - Wait for lead merging to happen by checking for merge notification
   * Polls the page by refreshing and checking for target lead merge message
   * @param sourceLeadName - The name of the source lead this lead was merged into
   * @param maxAttempts - Maximum number of attempts (default: 6)
   * @param waitBetweenAttempts - Wait time in ms between attempts (default: 30000)
   * @returns Promise<boolean> - true if merge notification was found, false otherwise
   */
  async waitForLeadMergingHappen_OnTargetLead(sourceLeadName: string, maxAttempts: number = 6, waitBetweenAttempts: number = 30000): Promise<boolean> {
    await this.wait(2000);
    
    let mergeNotificationFound = false;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Attempt ${attempt}/${maxAttempts}: Checking for merge notification...`);
      
      // Refresh the page to get latest state
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      
      // Wait for page to be fully loaded
      //Feb 02, 2026: check, we might need longer wait here due to chatter loading delay after reload      
      await this.wait(CommonUtils.waitTimes.checkingChatterLog || 50000);
      
      // Check if chatter log contains merge message
      const hasMergeMessage = await this.hasSourceLeadMergeMessage(sourceLeadName);
      if (hasMergeMessage) {
        console.log(`✓ Merge message found: "${sourceLeadName}, has been merged into this lead"`);
        mergeNotificationFound = true;
        break;
      }
      
      console.log(`  ℹ️ Merge message not yet found (attempt ${attempt}/${maxAttempts})`);
      
      // Wait before next attempt (only if not the last attempt)
      if (attempt < maxAttempts) {
        console.log(`  ⏳ Waiting ${waitBetweenAttempts / 1000} seconds before next refresh...`);
        await this.page.waitForTimeout(waitBetweenAttempts);
      }
    }
    
    return mergeNotificationFound;
  }
  /**
   * Get tags text
   * @returns The tags text content as a string
   */
  async getTagsText(): Promise<string> {
    return await this.tagsRow().textContent() || '';
  }

  /**
   * Get the current Sales Team value
   * Handles both edit mode (select dropdown) and readonly mode (text)
   * @returns The Sales Team value as a string, or empty string if not found
   */
  async getSalesTeamValue(): Promise<string> {
    try {
      // Look for Sales Team field - can be either editable (select) or readonly (text)
      const hasSelect = await this.salesTeamSelectElement().count() > 0;
      
      if (hasSelect) {
        // Editable mode (unsaved) - get from select element's selectedOptions
        const value = await this.salesTeamSelectElement().evaluate((select: HTMLSelectElement) => {
          const selectedOption = select.options[select.selectedIndex];
          return selectedOption ? selectedOption.textContent || '' : '';
        }).catch(() => '');
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await this.salesTeamCell().textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Sales Team value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get the current Salesperson value
   * Handles both edit mode (input field) and readonly mode (text)
   * @returns The Salesperson value as a string, or empty string if not found
   */
  async getSalespersonValue(): Promise<string> {
    try {
      // Look for Salesperson field - can be either editable (input) or readonly (text)
      const hasInput = await this.salespersonInputElement().count() > 0;
      
      if (hasInput) {
        // Editable mode (unsaved) - get from input
        const value = await this.salespersonInputElement().inputValue().catch(() => '') || '';
        return value.trim();
      } else {
        // Readonly mode (saved) - get from cell text
        const value = await this.salespersonCell().textContent().catch(() => '') || '';
        return value.trim();
      }
    } catch (error) {
      console.error(`Error getting Salesperson value: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Generate a unique lead name with timestamp
   */
  generateLeadName(): string {
    const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    return `Lead_${currentDateTime}`;
  }

  /**
   * Generate a unique email with timestamp
   */
  generateEmail(): string {
    const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
    const dateTimeParts = currentDateTime.split('_');
    const emailDateTime = `${dateTimeParts[0]}-${dateTimeParts[1]}`;
    return `test@${emailDateTime}.com`;
  }

  /**
   * Create a complete lead with all required fields
   */
  async createLead(data: {
    leadOpportunity?: string;
    contactName: string;
    email?: string;
    country: string;
    state: string;
    clearSalesTeam?: boolean;
    clearSalesperson?: boolean;
    uncheckCreatedManually?: boolean;
    leadForm?: string;
  }) {
    // Fill basic information
    await this.fillLeadOpportunity(data.leadOpportunity || this.generateLeadName());
    await this.fillContactName(data.contactName);
    await this.fillEmail(data.email || this.generateEmail());
    
    // Fill address
    await this.selectCountry(data.country);
    await this.selectState(data.state);
    
    // Clear sales fields if requested
    if (data.clearSalesTeam !== false) {
      await this.clearSalesTeam();
    }
    if (data.clearSalesperson !== false) {
      await this.clearSalesperson();
    }
    
    // Uncheck created manually if requested
    if (data.uncheckCreatedManually !== false) {
      await this.uncheckCreatedManually();
    }
    
    // Fill CRM Developer tab if leadForm is provided
    if (data.leadForm) {
      await this.clickCRMDeveloperTab();
      await this.fillLeadForm(data.leadForm);
    }
    
    // Save
    await this.clickSave();
    await this.waitForSaveComplete();
  }

  /**
   * Verify saved lead data
   */
  async verifyLeadData(expectedData: {
    contactName?: string;
    email?: string;
    country?: string;
    state?: string;
  }): Promise<{ contactName: boolean; email: boolean; address: boolean }> {
    await this.wait(500);
    
    const results = {
      contactName: false,
      email: false,
      address: false
    };
    
    // Verify Contact Name
    if (expectedData.contactName) {
      const contactNameText = await this.contactNameRow().textContent({ timeout: 3000 }).catch(() => '') || '';
      results.contactName = contactNameText.includes(expectedData.contactName);
    }
    
    // Verify Email
    if (expectedData.email) {
      const emailLinkText = await this.emailLink().first().textContent({ timeout: 3000 }).catch(() => '') || '';
      results.email = emailLinkText.includes(expectedData.email.split('@')[0]) && emailLinkText.includes('.com');
    }
    
    // Verify Country/State
    if (expectedData.country || expectedData.state) {
      const addressText = await this.addressRow().textContent({ timeout: 3000 }).catch(() => '') || '';
      const hasCountry = expectedData.country ? addressText.includes(expectedData.country) : true;
      const hasState = expectedData.state ? addressText.includes(expectedData.state) : true;
      results.address = hasCountry && hasState;
    }
    
    return results;
  }

  /**
   * Wait for Sales Team and Salesperson to be auto-assigned
   * Periodically refreshes the page and checks if the fields are populated
   * @param maxWaitTime - Maximum time to wait in milliseconds
   * @param checkInterval - Time between checks in milliseconds (default: 5000)
   * @returns Object containing salesTeamValue, salespersonValue, and assignment status
   */
  async waitForSalesTeamAssignment(
    maxWaitTime: number,
    checkInterval: number = 5000
  ): Promise<{
    salesTeamValue: string;
    salespersonValue: string;
    salesTeamAssigned: boolean;
    salespersonAssigned: boolean;
    totalWaitTime: number;
    attemptCount: number;
  }> {
    const startWaitTime = Date.now();
    let salesTeamAssigned = false;
    let salespersonAssigned = false;
    let salesTeamValue = '';
    let salespersonValue = '';
    let attemptCount = 0;
    
    while ((!salesTeamAssigned || !salespersonAssigned) && (Date.now() - startWaitTime) < maxWaitTime) {
      attemptCount++;
      
      // Refresh the page to get latest data
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.wait(2000);
      
      // Quoc Anh: Feb 03, 26 : Wait for Sales Team select element to be visible (handles both edit and readonly modes)
      await this.salesTeam_saved_row().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear }).catch(() => {});
      // Check if Sales Team and Salesperson fields are populated
      try {
        // Get Sales Team value (handles both edit and readonly modes)
        if (!salesTeamAssigned) {
          salesTeamValue = await this.getSalesTeamValue();
          
          if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
            salesTeamAssigned = true;
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            console.log(`  ✓ Sales Team assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
            console.log(`  - Sales Team Value: "${salesTeamValue}"`);
          }
        }
        
        // Get Salesperson value (handles both edit and readonly modes)
        if (!salespersonAssigned) {
          salespersonValue = await this.getSalespersonValue();
          
          if (salespersonValue && salespersonValue !== '' && salespersonValue !== 'Salesperson') {
            salespersonAssigned = true;
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            console.log(`  ✓ Salesperson assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
            console.log(`  - Salesperson Value: "${salespersonValue}"`);
          }
        }
        
        if (!salesTeamAssigned || !salespersonAssigned) {
          const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
          const statusSalesTeam = salesTeamAssigned ? '✓' : '⧖';
          const statusSalesperson = salespersonAssigned ? '✓' : '⧖';
          console.log(`  - Attempt ${attemptCount} (${elapsedTime}s): ${statusSalesTeam} Sales Team, ${statusSalesperson} Salesperson - waiting...`);
          await this.wait(checkInterval);
        }
      } catch (error) {
        console.log(`  - Attempt ${attemptCount}: Error checking fields - ${error instanceof Error ? error.message : String(error)}`);
        await this.wait(checkInterval);
      }
    }
    
    const totalWaitTime = parseFloat(((Date.now() - startWaitTime) / 1000).toFixed(2));
    
    if (!salesTeamAssigned) {
      console.log(`  ⚠ Warning: Sales Team not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
      console.log(`  - Sales Team Value: "${salesTeamValue}"`);
    }
    
    if (!salespersonAssigned) {
      console.log(`  ⚠ Warning: Salesperson not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
      console.log(`  - Salesperson Value: "${salespersonValue}"`);
    }
    
    return {
      salesTeamValue,
      salespersonValue,
      salesTeamAssigned,
      salespersonAssigned,
      totalWaitTime,
      attemptCount
    };
  }

  /**
   * Verify Sales Team assignment by getting current values and logging checkpoints
   * @param expectedSalesTeam - Expected Sales Team value
   * @returns Object containing salesTeamValue and salespersonValue for further assertions
   */
  async verifySalesTeamAssignment(expectedSalesTeam: string): Promise<{
    salesTeamValue: string;
    salespersonValue: string;
  }> {
    console.log('\n========== VERIFICATION (2 Checkpoints) ==========');
    
    // Get the current Sales Team value (handles both edit and readonly modes)
    const salesTeamValue = await this.getSalesTeamValue();
    
    // Get the current Salesperson value (handles both edit and readonly modes)
    const salespersonValue = await this.getSalespersonValue();
    
    console.log('\n✓ Checkpoint 1: Sales Team validation');
    console.log(`  Expected: "${expectedSalesTeam}"`);
    console.log(`  Actual:   "${salesTeamValue}"`);
    console.log(`  Match:    ${salesTeamValue === expectedSalesTeam ? '✓ PASSED' : '✗ FAILED'}`);
    
    console.log('\n✓ Checkpoint 2: Salesperson validation');
    console.log(`  Expected: Any person (not empty)`);
    console.log(`  Actual:   "${salespersonValue}"`);
    console.log(`  Match:    ${salespersonValue && salespersonValue !== '' && salespersonValue !== 'Salesperson' ? '✓ PASSED' : '✗ FAILED'}`);
    
    console.log('\n==================================================');
    
    return {
      salesTeamValue,
      salespersonValue
    };
  }

  /**
   * Get tags text from divs with data-index attribute only
   * Filters out divs without data-index attribute and returns text content
   * @returns Array of tag text strings from divs with data-index attribute
   */
  async getTagsWithDataIndex(): Promise<string[]> {
    try {
      // Get the tags container
      const tagsContainer = this.tagsList();
      
      // Locate all divs within the container that have data-index attribute
      const tagDivsWithIndex = tagsContainer.locator('xpath=.//div[@data-index]');
      
      // Get the count of matching divs
      const count = await tagDivsWithIndex.count();
      
      if (count === 0) {
        console.log('  ⚠ No tags with data-index attribute found');
        return [];
      }
      
      // Extract text from each div with data-index
      const tagTexts: string[] = [];
      for (let i = 0; i < count; i++) {
        const tagText = await tagDivsWithIndex.nth(i).textContent() || '';
        if (tagText.trim()) {
          tagTexts.push(tagText.trim());
        }
      }
      
      console.log(`  ✓ Found ${tagTexts.length} tags with data-index: ${tagTexts.join(', ')}`);
      return tagTexts;
    } catch (error) {
      console.error(`Error getting tags with data-index: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Get tags text from the second tag_ids container (xpath=(//div[@name="tag_ids"])[2])
   * Extracts text content from the second tags container, typically used in edit mode
   * @returns Promise<string> - The text content of all tags in the second container
   */
  async getTagsFromSecondContainer(): Promise<string> {
    try {
      const secondTagsContainer = this.secondTagsContainerLoc();
      const tagsText = await secondTagsContainer.textContent().catch(() => '');
      console.log(`  ✓ Tags from second container: "${tagsText?.trim() || '(empty)'}"`);
      return tagsText?.trim() || '';
    } catch (error) {
      console.error(`Error getting tags from second container: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get individual tags as array from the second tag_ids container
   * Parses the second tags container and returns each tag as separate array element
   * @returns Promise<string[]> - Array of individual tag names (e.g., ['Renewal', 'Trial download'])
   */
  async getTagsArrayFromSecondContainer(): Promise<string[]> {
    try {
      const secondTagsContainer = this.secondTagsContainerLoc();
      
      // Try to get individual tag elements within the container
      const tagElements = secondTagsContainer.locator('xpath=.//div[@data-index]');
      const count = await tagElements.count();
      
      if (count > 0) {
        // If we found individual tag divs, extract text from each
        const tags: string[] = [];
        for (let i = 0; i < count; i++) {
          const tagText = await tagElements.nth(i).textContent() || '';
          if (tagText.trim()) {
            tags.push(tagText.trim());
          }
        }
        console.log(`  ✓ Found ${tags.length} tags in second container: ${tags.join(', ')}`);
        return tags;
      } else {
        // Fallback: get all text and split by common delimiters
        const allText = await secondTagsContainer.textContent().catch(() => '') || '';
        const tags = allText.split(/[\n,]/).map(t => t.trim()).filter(t => t !== '');
        console.log(`  ✓ Found ${tags.length} tags in second container (fallback): ${tags.join(', ')}`);
        return tags;
      }
    } catch (error) {
      console.error(`Error getting tags array from second container: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Check if a specific tag exists in the tags list
   * Uses getTagsWithDataIndex() to retrieve tags and checks if the specified tag exists
   * @param tagName - The tag name to search for (case-sensitive)
   * @returns Promise<boolean> - true if the tag exists, false otherwise
   */
  async hasTag(tagName: string): Promise<boolean> {
    try {
      const tags = await this.getTagsWithDataIndex();
      const hasTag = tags.includes(tagName);
      console.log(`  ✓ Tag "${tagName}" ${hasTag ? 'exists' : 'does not exist'} in tags list`);
      return hasTag;
    } catch (error) {
      console.error(`Error checking if tag exists: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Get the count of tags with data-index attribute
   * Uses getTagsWithDataIndex() to retrieve tags and returns the count
   * @returns Promise<number> - The number of tags found
   */
  async getTagsCount(): Promise<number> {
    try {
      const tags = await this.getTagsWithDataIndex();
      console.log(`  ✓ Found ${tags.length} tag(s) with data-index`);
      return tags.length;
    } catch (error) {
      console.error(`Error getting tags count: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * Get all tags as a formatted string
   * Uses getTagsWithDataIndex() to retrieve tags and joins them with a separator
   * @param separator - The separator to use between tags (default: ', ')
   * @returns Promise<string> - All tags joined as a string (e.g., 'Renewal, Trial download')
   */
  async getTagsAsString(separator: string = ', '): Promise<string> {
    try {
      const tags = await this.getTagsWithDataIndex();
      const tagsString = tags.join(separator);
      console.log(`  ✓ Tags as string: "${tagsString}"`);
      return tagsString;
    } catch (error) {
      console.error(`Error getting tags as string: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Verify that all expected tags exist in the tags list
   * Uses getTagsWithDataIndex() to retrieve tags and checks if all expected tags are present
   * @param expectedTags - Array of tag names that should exist
   * @returns Promise<{allFound: boolean; found: string[]; missing: string[]}> - Result object with verification details
   */
  async verifyExpectedTags(expectedTags: string[]): Promise<{
    allFound: boolean;
    found: string[];
    missing: string[];
  }> {
    try {
      const actualTags = await this.getTagsWithDataIndex();
      const found: string[] = [];
      const missing: string[] = [];
      
      for (const expectedTag of expectedTags) {
        if (actualTags.includes(expectedTag)) {
          found.push(expectedTag);
        } else {
          missing.push(expectedTag);
        }
      }
      
      const allFound = missing.length === 0;
      console.log(`  ✓ Tag verification: ${allFound ? 'All tags found' : `${missing.length} tag(s) missing`}`);
      if (found.length > 0) {
        console.log(`    Found: ${found.join(', ')}`);
      }
      if (missing.length > 0) {
        console.log(`    Missing: ${missing.join(', ')}`);
      }
      
      return { allFound, found, missing };
    } catch (error) {
      console.error(`Error verifying expected tags: ${error instanceof Error ? error.message : String(error)}`);
      return { allFound: false, found: [], missing: expectedTags };
    }
  }

  /**
   * Get Company Name value in readonly mode
   * Locates the Company Name row and extracts the text content
   * @returns Promise<string> - The company name text content
   */
  async getCompanyNameReadonly(): Promise<string> {
    try {
      const companyNameRow = this.companyNameRowLoc().first();
      const companyNameText = await companyNameRow.textContent() || '';
      return companyNameText.trim();
    } catch (error) {
      console.error(`Error getting Company Name (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get Contact Name field value in readonly mode
   * Locates the Contact Name row and extracts the text content
   * @returns Promise<string> - The contact name text content
   */
  async getContactNameReadonly(): Promise<string> {
    try {
      const contactNameRow = this.contactNameRow().first();
      const contactNameText = await contactNameRow.textContent() || '';
      return contactNameText.trim();
    } catch (error) {
      console.error(`Error getting Contact Name (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Get Address field value in readonly mode
   * Locates the Address row and extracts the text content (includes Street, City, State, Country)
   * @returns Promise<string> - The full address text content
   */
  async getAddressReadonly(): Promise<string> {
    try {
      const addressRow = this.addressRow().first();
      const addressText = await addressRow.textContent() || '';
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
      const emailLink = this.emailLink().first();
      const emailText = await emailLink.textContent() || '';
      return emailText.trim();
    } catch (error) {
      console.error(`Error getting Email (readonly): ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Navigate to a merged lead with action=682
   * Replaces action=149 with action=682 in the URL and navigates to the merged lead
   * @param leadUrl - The original lead URL with action=149
   * @param leadId - The lead ID for URL validation
   * @param loadingSpinnerTimeout - Timeout for loading spinner (default: 30000ms)
   * @returns Promise<string> - The modified URL that was used for navigation
   */
  async navigateToMergedLeadWithAction682(leadUrl: string, leadId: string, loadingSpinnerTimeout: number = 30000): Promise<string> {
    // Replace action=149 with action=682 in leadUrl
    const modifiedUrl = leadUrl.replace('action=149', 'action=682');
    console.log(`Modified Lead URL with action=682: ${modifiedUrl}`);
    
    try {
      // Use location.replace for hash-based navigation in Odoo
      await this.page.evaluate((url) => {
        window.location.replace(url);
      }, modifiedUrl);
      
      // Wait for URL pattern to match (flexible for hash URLs)
      await this.page.waitForURL(`**id=${leadId}**`, { timeout: 30000 });
      console.log('✓ URL changed successfully');
      
      // Refresh page to ensure merged lead loads properly
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      console.log('✓ Page refreshed');
      
      // Wait for loading spinner to hide
      await this.waitForLoadingSpinnerToHide(loadingSpinnerTimeout);
      
      // Wait for the form view to be visible
      await this.formView().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      
      console.log(`Current URL after navigation: ${this.page.url()}`);
      console.log('✓ Lead opened successfully with action=682\n');
      
      // Bring browser window to front
      await this.page.bringToFront();
      console.log('✓ Browser window brought to front');
      
      return modifiedUrl;
    } catch (error) {
      console.log(`❌ Navigation error: ${error}`);
      console.log(`Expected Lead ID: ${leadId}`);
      console.log(`Current URL: ${this.page.url()}`);
      throw error;
    }
  }

  /**
   * Click Action menu button on the lead form header
   */
  async clickActionMenu(): Promise<void> {
    await this.actionMenuButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.actionMenuButton().click();
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Click Delete option in the Action dropdown menu
   * Uses retry logic with XPath as primary and CSS as fallback for flaky dropdown elements
   */
  async clickActionDeleteOption(): Promise<void> {
    // First, ensure the dropdown is open by checking for visible menu
    await this.wait(CommonUtils.waitTimes.medium);
    
    // Try primary locator first (XPath-based, aligns with page object locator convention)
    try {
      const primaryLocator = this.actionMenuDeleteOption();
      await primaryLocator.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await primaryLocator.click();
      console.log('  ✓ Delete option clicked (primary XPath locator)');
      await this.wait(CommonUtils.waitTimes.medium);
      return;
    } catch (e) {
      console.log('  ⚠ Primary XPath Delete locator failed, trying CSS fallback...');
    }
    
    // Try fallback locator (CSS-based, targets visible dropdown menus)
    try {
      const fallbackLocator = this.actionMenuDeleteOptionFallback();
      await fallbackLocator.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
      await fallbackLocator.click();
      console.log('  ✓ Delete option clicked (CSS fallback locator)');
      await this.wait(CommonUtils.waitTimes.medium);
      return;
    } catch (e) {
      console.log('  ⚠ Fallback Delete locator failed, trying force click...');
    }
    
    // Last resort: find any visible Delete link and force click
    const lastResort = this.page.locator('a:visible').filter({ hasText: /^Delete$/i }).first();
    await lastResort.click({ force: true });
    console.log('  ✓ Delete option clicked (force click)');
    await this.wait(CommonUtils.waitTimes.medium);
  }

  /**
   * Click OK on the delete confirmation dialog
   */
  async confirmDeleteDialog(): Promise<void> {
    await this.confirmDeleteOkButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.confirmDeleteOkButton().click();
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Delete the current lead record via Action > Delete > OK
   * @param leadUrl - URL of the lead to navigate to before deleting
   */
  async deleteLead(leadUrl: string): Promise<void> {
    await this.page.goto(leadUrl);
    await this.waitForPageReady();
    await this.wait(CommonUtils.waitTimes.standard);
    await this.clickActionMenu();
    await this.clickActionDeleteOption();
    await this.confirmDeleteDialog();
  }
}

