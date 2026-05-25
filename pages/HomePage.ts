import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Home Page Object
 * Handles navigation from the home page to different modules
 */
export class HomePage extends BasePage {
  // Locators (using XPath where possible for consistency)
  private readonly crmLink = () => this.page.locator('xpath=//a[contains(@data-menu-xmlid, "crm.crm_menu_root")]').first();
  private readonly investmentLink = () => this.page.getByRole('link', { name: 'Investments', exact: true });
  private readonly crmMenuLink = () => this.page.locator('//a[contains(@href, "menu_id=111")]');
  // Sidebar menu link for Contacts (not a button)
  private readonly odooClientError_OK_Btn = () => this.page.locator('xpath=//button/span[contains(text(),"Ok")]');
  private readonly contactsMenuLink = () => this.page.locator('//a[contains(., "Contacts") and contains(@href, "menu_id=94")]');
  // Home page Contacts link (top-level navigation) - exact text match
  private readonly contactsLink = () => this.page.locator('(//a[@class="o_app o_menuitem" and normalize-space(.)="Contacts"])').first();
  private readonly leadsButton = () => this.page.getByRole('button', { name: 'Leads' });
  private readonly leadsMenuItem = () => this.page.getByRole('menuitem', { name: 'Leads', exact: true });
  private readonly opportunitiesMenuItem = () => this.page.getByRole('menuitem', { name: 'Pipeline' });
  // Applications menu link using XPath - updated to match the actual element
  private readonly applicationMenuLink = () => this.page.locator('//a[@title="Applications"]').or(this.page.locator('//button[contains(., "Applications")]')).first();
  constructor(page: Page) {
    super(page);
  }

  /**
   * Wait for home page to load completely
   */
  async waitForHomePageLoad(timeout: number = 60000) {
    await this.wait(10000); // Wait for applications menu to load
    await this.crmLink().waitFor({ state: 'visible', timeout });
  }

  /**
   * Click at CRM module
   */
  async navigateToCRM() {
    //await this.wait(CommonUtils.waitTimes.login);
    await this.crmLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.crmLink().click();
    await this.waitForURL('**/web?*view_type=kanban*', CommonUtils.waitTimes.pageLoad);

   // Quoc Anh: (Feb 24, 26) Handle error dialog if it appears
    await this.dismissErrorDialog();
  }
  /**
   * Click at Investments module
   */
  async navigateToInvestment() {
    //await this.wait(CommonUtils.waitTimes.login);
    await this.investmentLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.investmentLink().click();
    await this.waitForURL('**/web?*menu_id=866*', CommonUtils.waitTimes.pageLoad);

    //[Feb 05, 2026] Quoc Anh: Dismiss Odoo Client Error if it appears
    await this.dismissOdooClientError();

  }
/**
   * Dismiss location permission dialog if it appears
   * Handles the "Know your location" popup that may appear after login
   */
  async dismissOdooClientError() {
    const dismissOdooClientError = this.odooClientError_OK_Btn();
    if (await dismissOdooClientError.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissOdooClientError.click();
      await this.wait(500);
    }
  }
  /**
   * Navigate to CRM > Contacts
   */
  async navigateToContacts() {
    // Click the Contacts link in the sidebar menu
    await this.contactsMenuLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.contactsMenuLink().click();
    await this.page.waitForURL('**menu_id=94**', { timeout: 60000 });
    await this.wait(2000);
  }

  /**
   * Get the application menu link locator
   * @returns Playwright Locator for the application menu link
   */
  async getApplicationMenuLink() {
    await this.applicationMenuLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    return this.applicationMenuLink();
  }

  /**
   * Wait for ApplicationMenuLink menu link to appear on the page
   * Waits for the applicationMenuLink locator to be visible with fallback handling
   * @param timeout - Maximum time to wait for the element to appear (default: 30000ms)
   * @param waitAfter - Time to wait after element appears (default: 1000ms)
   */
  async waitForPageFullyLoaded(timeout: number = 30000, waitAfter: number = 1000): Promise<void> {
    try {
      await this.applicationMenuLink().waitFor({ state: 'visible', timeout });
      await this.wait(waitAfter);
      console.log(`  ✓ Application menu link is visible - page fully loaded`);
    } catch (error) {
      await this.wait(waitAfter);
      console.log(`  ⚠️ Application menu link not visible after ${timeout}ms - proceeding with ${waitAfter}ms wait`);
    }
  }

  /**
   * Click Application icon to open app menu
   */
  async clickApplicationMenu() {
    await this.applicationMenuLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.applicationMenuLink().click();
    await this.wait(2000);
  }
/**
   * Click Application icon to open app menu
   */
  async clickCRMMenu() {
    await this.applicationMenuLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.applicationMenuLink().click();
    await this.wait(2000);
  }
  /**
   * Navigate to Contacts from home page
   * Clicks the top-level "Contacts" link from the home page
   */
  async navigateToContactsFromHome() {
    await this.contactsLink().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.pageLoad });
    await this.contactsLink().click();
    await this.waitForURL('**/web?*action=118*', CommonUtils.waitTimes.pageLoad);
    //await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Click Applications link to return to home page
   */
  async returnToHome() {
    await this.applicationMenuLink().click();
    await this.wait(CommonUtils.waitTimes.long);
  }

  /**
   * Quoc Anh: Assume that we are already in CRM module
   * Navigate to CRM > Leads
   */
  async navigateToLeads() {
    //await this.navigateToCRM();
    
    // Wait for the Leads button to be visible
    await this.leadsButton().waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.elementAppear });
    await this.wait(300);
    
    // Click on the Leads button to open dropdown
    await this.leadsButton().click();
    await this.wait(200);
    
    // Click on the "Leads" menuitem in the dropdown
    await this.leadsMenuItem().click();
    
    // QA: Feb 25, 2026 : Wait for the Leads list view to load
    await this.waitForURL('**/web?*view_type=list*', CommonUtils.waitTimes.pageLoad);
    await this.wait(500);
  }

  /**
   * Navigate to CRM > Opportunities (Pipeline)
   */
  async navigateToOpportunities() {
    await this.navigateToCRM();
    await this.waitForURL('**/web?*view_type=kanban*', CommonUtils.waitTimes.pageLoad);
  }

}
