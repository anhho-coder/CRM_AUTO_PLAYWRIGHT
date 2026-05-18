import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Re-Assignation Page Object
 * Handles interactions with the CRM Re-assignation configuration page
 */
export class ReAssignationPage extends BasePage {
  // Locators
  private readonly customerTypeLabel = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Customer type")]'
    ).first();
  private readonly customerTypeCombobox = () =>
    this.page.locator(
      'xpath=//td/label[contains(text(),"Customer type")]/following::td[1]//input'
    ).first();
  private readonly currentSalespersonLabel = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Current Salesperson")]'
    ).first();
  private readonly currentSalespersonCombobox = () =>
    this.page.locator(
      'xpath=//input[@name="user_id"] | //label[normalize-space()="Current Salesperson"]/ancestor::tr//input | //div[@name="user_id"]//input'
    ).first();
  private readonly reAssignmentToLabel = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Re-assignment to")]'
    ).first();
  private readonly reAssignmentToCombobox = () =>
    this.page.locator(
      'xpath=//select[@name="reassignment_to"] | //label[normalize-space()="Re-assignment to"]/ancestor::tr//select | //div[@name="reassignment_to"]//select | //label[normalize-space()="Re-assignment to"]/ancestor::tr//input'
    ).first();
  private readonly totalText = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Total")]'
    ).first();
  private readonly totalValueText = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Total")]/following-sibling::span[1] | //tr[td/label[contains(text(),"Total")]]//td[2]//span | //td[label[contains(text(),"Total")]]/following-sibling::td[1]//span | //td[label[contains(text(),"Total")]]/following-sibling::td[1]//input | //td[label[contains(text(),"Total")]]/following-sibling::td[1]'
    ).first();
  private readonly stageLabel = () =>
    this.page.locator(
      'xpath=//label[contains(text(),"Stage")]'
    ).first();
  private readonly stageCombobox = () =>
    this.page.locator(
      'xpath=//td/label[text()="Stage"]/following::td[1]//input'
    ).first();
  private readonly countryLabel = () =>
    this.page.locator(
      'xpath=(//label[text()="Country"])[2]'
    ).first();
  private readonly countryCombobox = () =>
    this.page.locator(
      'xpath=//td/label[text()="Country"]/following::td[1]//input'
    ).first();
  private readonly countryStateLabel = () =>
    this.page.locator(
      'xpath=//label[text()="Country state"]'
    ).first();
  private readonly countryStateCombobox = () =>
    this.page.locator(
      'xpath=//td/label[text()="Country state"]/following::td[1]//input'
    ).first();
  private readonly reAssigmentButton = () =>
    this.page.locator(
      'xpath=//button/span[normalize-space()="Re-assignment"]'
    ).first();
  private readonly selectedSalespersonValue = () =>
    this.page.locator(
      'xpath=//td[normalize-space()="Selected Salesperson"]/following-sibling::td[1]'
    ).first();
  private readonly selectedReAssignmentToValue = () =>
    this.page.locator(
      'xpath=//td[normalize-space()="Selected “Re-assignment to” Salesperson"]/following-sibling::td[1]'
    ).first();
  private readonly selectedCountriesValue = () =>
    this.page.locator(
      'xpath=//td[normalize-space()="Selected Countries"]/following-sibling::td[1]'
    ).first();
  private readonly selectedStatesValue = () =>
    this.page.locator(
      'xpath=//td[normalize-space()="Selected states"]/following-sibling::td[1]'
    ).first();
  private readonly confirmButton = () =>
    this.page.locator(
      'xpath=//button[normalize-space()="Confirm"]'
    ).first();
  private readonly stageOfProcessValue = () =>
    this.page.locator(
      'xpath=//div[@name="state"]/button[@aria-checked="true"]'
    ).first();
  private readonly saveButton = () =>
    this.page.locator(
      'xpath=//button[normalize-space()="Save" or normalize-space()="SAVE"]'
    ).first();
  private readonly validationErrorNotification = () =>
    this.page.locator(
      'xpath=//*[contains(@class,"o_notification_content") or contains(@class,"o_notification")][contains(normalize-space(),"following field") or contains(normalize-space(),"invalid")] | //*[contains(normalize-space(),"The following field") and (contains(@class,"o_notification") or contains(@class,"alert") or contains(@class,"o_error") or contains(@class,"modal"))]'
    ).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Get the "Customer type" label locator for assertion
   */
  getCustomerTypeLabel() {
    return this.customerTypeLabel();
  }

  /**
   * Get the "Customer type" combobox locator for assertion
   */
  getCustomerTypeCombobox() {
    return this.customerTypeCombobox();
  }

  

  /**
   * Get the "Current Salesperson" label locator for assertion
   */
  getCurrentSalespersonLabel() {
    return this.currentSalespersonLabel();
  }

  /**
   * Get the "Current Salesperson" combobox locator for assertion
   */
  getCurrentSalespersonCombobox() {
    return this.currentSalespersonCombobox();
  }

  /**
   * Get the "Re-assignment to" label locator for assertion
   */
  getReAssignmentToLabel() {
    return this.reAssignmentToLabel();
  }

  /**
   * Get the "Re-assignment to" combobox locator for assertion
   */
  getReAssignmentToCombobox() {
    return this.reAssignmentToCombobox();
  }

  /**
   * Get the "Total" text locator for assertion
   */
  getTotalText() {
    return this.totalText();
  }

  /**
   * Get the "Total" count value text (e.g. "0 / 1")
   */
  async getTotalValueText(): Promise<string> {
    const el = this.totalValueText();
    await el.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const tagName = await el.evaluate((node) => node.tagName.toLowerCase());
    if (tagName === 'input') {
      return (await el.inputValue()).trim();
    }
    return (await el.innerText()).trim();
  }

  /**
   * Get the "Stage" label locator for assertion
   */
  getStageLabel() {
    return this.stageLabel();
  }

  /**
   * Get the "Stage" combobox locator for assertion
   */
  getStageCombobox() {
    return this.stageCombobox();
  }

  /**
   * Get the "Country" label locator for assertion
   */
  getCountryLabel() {
    return this.countryLabel();
  }

  /**
   * Get the "Country" combobox locator for assertion
   */
  getCountryCombobox() {
    return this.countryCombobox();
  }

  /**
   * Get the "Country state" label locator for assertion
   */
  getCountryStateLabel() {
    return this.countryStateLabel();
  }

  /**
   * Get the "Country state" combobox locator for assertion
   */
  getCountryStateCombobox() {
    return this.countryStateCombobox();
  }

  /**
   * Get the "RE-ASSIGMENT" button locator for assertion
   */
  getReAssigmentButton() {
    return this.reAssigmentButton();
  }

  /**
   * Clear the "Customer type" combobox (set to BLANK)
   */
  async clearCustomerType(): Promise<void> {
    await this.customerTypeCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.customerTypeCombobox().clear();
    await this.customerTypeCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.customerTypeCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Customer type set to BLANK');
  }

  /**
   * Select a value in the "Current Salesperson" combobox
   */
  async selectCurrentSalesperson(value: string): Promise<void> {
    await this.currentSalespersonCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.currentSalespersonCombobox().clear();
    await this.currentSalespersonCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.currentSalespersonCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Current Salesperson set to "${value}"`);
  }
/**
   * Select a value in the "Customer type" combobox
   */
  async selectCustomerType(value: string): Promise<void> {
    await this.customerTypeCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.customerTypeCombobox().clear();
    await this.customerTypeCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.customerTypeCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Customer type set to "${value}"`);
  }
  /**
   * Clear the "Current Salesperson" combobox (set to BLANK)
   */
  async clearCurrentSalesperson(): Promise<void> {
    await this.currentSalespersonCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.currentSalespersonCombobox().clear();
    await this.currentSalespersonCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.currentSalespersonCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Current Salesperson set to BLANK');
  }

  /**
   * Select a value in the "Re-assignment to" combobox
   */
  async selectReAssignmentTo(value: string): Promise<void> {
    await this.reAssignmentToCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.reAssignmentToCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.reAssignmentToCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log(`  ✓ Re-assignment to set to "${value}"`);
  }

  /**
   * Clear the "Re-assignment to" combobox (set to BLANK)
   */
  async clearReAssignmentTo(): Promise<void> {
    await this.reAssignmentToCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.reAssignmentToCombobox().clear();
    await this.reAssignmentToCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.reAssignmentToCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Re-assignment to set to BLANK');
  }

  /**
   * Select a value in the "Country" combobox
   */
  async selectCountry(value: string): Promise<void> {
    await this.countryCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.countryCombobox().clear();
    await this.countryCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.countryCombobox().press('Enter');
    await this.countryCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log(`  ✓ Country set to "${value}"`);    
  }

  /**
   * Clear the "Country" combobox (set to BLANK)
   */
  async clearCountry(): Promise<void> {
    await this.countryCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.countryCombobox().clear();
    await this.countryCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.countryCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Country set to BLANK');
  }

  /**
   * Select a value in the "Country state" combobox
   */
  async selectCountryState(value: string): Promise<void> {
    await this.countryStateCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.countryStateCombobox().clear();
    await this.countryStateCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.countryStateCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log(`  ✓ Country state set to "${value}"`);    
  }

  /**
   * Clear the "Country state" combobox (set to BLANK)
   */
  async clearCountryState(): Promise<void> {
    await this.countryStateCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.countryStateCombobox().clear();
    await this.countryStateCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.countryStateCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Country state set to BLANK');
  }

  /**
   * Select a value in the "Stage" combobox
   */
  async selectStage(value: string): Promise<void> {
    await this.stageCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageCombobox().fill(value);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.stageCombobox().press('Enter');
    await this.page.waitForTimeout(CommonUtils.waitTimes.long);
    console.log(`  ✓ Stage set to "${value}"`);    
  }

  /**
   * Clear the "Stage" combobox (set to BLANK)
   */
  async clearStage(): Promise<void> {
    await this.stageCombobox().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.stageCombobox().clear();
    await this.stageCombobox().fill('');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    await this.stageCombobox().press('Escape');
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Stage set to BLANK');
  }

  /**
   * Click the "Save" button
   */
  async clickSaveButton(): Promise<void> {
    await this.saveButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.saveButton().click();
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ Save button clicked');
  }

  /**
   * Get the validation error notification text
   */
  async getValidationErrorText(): Promise<string> {
    await this.validationErrorNotification().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await this.validationErrorNotification().innerText()).trim();
  }

  /**
   * Check if validation error notification is visible (without waiting)
   */
  async isValidationErrorVisible(): Promise<boolean> {
    return this.validationErrorNotification().isVisible();
  }

  /**
   * Click the "RE-ASSIGNMENT" button and wait for the Confirmed Re-assignation page
   */
  async clickReAssignmentButton(): Promise<void> {
    await this.reAssigmentButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.reAssigmentButton().click();
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ RE-ASSIGNMENT button clicked');
  }

  /**
   * Click the "CONFIRM" button on the Confirmed Re-assignation page and wait
   */
  async clickConfirmButton(): Promise<void> {
    await this.confirmButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    await this.confirmButton().click();
    await CommonUtils.waitForSpinnersToHide(this.page);
    await this.page.waitForTimeout(CommonUtils.waitTimes.standard);
    console.log('  ✓ CONFIRM button clicked');
  }

  /**
   * Get the value of "Stage of process" on the result page after confirming re-assignation
   */
  async getStageOfProcessText(): Promise<string> {
    await this.stageOfProcessValue().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await this.stageOfProcessValue().innerText()).trim();
  }

  /**
   * Get the value of "Selected Re-assignment to" on the Confirmed Re-assignation page
   */
  async getSelectedReAssignmentToText(): Promise<string> {
    await this.selectedReAssignmentToValue().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await this.selectedReAssignmentToValue().innerText()).trim();
  }

  /**
   * Get the value of "Selected Salesperson" on the Confirmed Re-assignation page
   */
  async getSelectedSalespersonText(): Promise<string> {
    await this.selectedSalespersonValue().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    return (await this.selectedSalespersonValue().innerText()).trim();
  }

  /**
   * Get the value of "Selected States" on the Confirmed Re-assignation page
   */
  async getSelectedStatesText(): Promise<string> {
    await this.selectedStatesValue().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await this.selectedStatesValue().evaluate(el => el.textContent ?? '');
    return [...raw]
      .filter(ch => /[\p{L}\p{N}\s\-]/u.test(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get the value of "Selected Countries" on the Confirmed Re-assignation page
   */
  async getSelectedCountriesText(): Promise<string> {
    await this.selectedCountriesValue().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
    const raw = await this.selectedCountriesValue().evaluate(el => el.textContent ?? '');
    // Spread into Unicode code points (not UTF-16 units) so each emoji counts as one entry.
    // Keep only Unicode letters, numbers, spaces, hyphens and apostrophes — strips flag emoji, surrogates, variation selectors, etc.
    return [...raw]
      .filter(ch => /[\p{L}\p{N}\s\-]/u.test(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
