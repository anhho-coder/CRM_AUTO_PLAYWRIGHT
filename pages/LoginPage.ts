import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { CommonUtils } from '@/helpers/common.utils';

/**
 * Login Page Object
 * Handles login functionality for the application
 */
export class LoginPage extends BasePage {
  // Locators
  private readonly emailInput = () => this.page.getByRole('textbox', { name: 'Email' });
  private readonly passwordInput = () => this.page.getByRole('textbox', { name: 'Password' });
  private readonly loginButton = () => this.page.getByRole('button', { name: 'Log in' });
  private readonly crmMenuLink = () => this.page.locator('xpath=//a[contains(@data-menu-xmlid, "crm.crm_menu_root")]').first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to login page
   */
  async navigateTo(baseUrl: string) {
    await this.goto(`${baseUrl}web/login`);
    // Quoc Anh: (Mar 02, 26) Sometimes the login page . This may up to 4-5 mins. 
    await this.waitForURL('**web/login*', CommonUtils.waitTimes.pageLoad);

     // Quoc Anh: (Feb 24, 26) Handle error dialog if it appears
    await this.dismissErrorDialog();
  }

  /**
   * Fill in email field
   */
  async fillEmail(email: string) {
    await this.emailInput().fill(email);
  }

  /**
   * Fill in password field
   */
  async fillPassword(password: string) {
    await this.passwordInput().fill(password);
  }

  /**
   * Click login button
   */
  async clickLogin() {
    await this.loginButton().click();
  }
 /**
   * Wait for login page appear   */
  async waitForLoginPage(timeout: number = CommonUtils.waitTimes.login) {
    await this.waitForURL('**web/login', timeout);
    
  }
  /**
   * Wait for successful login (redirect to home page)
   * Uses the CRM menu link appearance as the signal of login success
   */
  async waitForLoginSuccess(timeout: number = CommonUtils.waitTimes.login) {
    await this.crmMenuLink().waitFor({ state: 'visible', timeout });
  }

  /**
   * Perform complete login action
   */
  async login(email: string, password: string, timeout: number = CommonUtils.waitTimes.login) {
    // Maximize browser window
    await this.page.setViewportSize({ width: 1920, height: 1080 });

    // Wait for login page to load
    await this.waitForLoginPage(timeout);
    
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickLogin();

    //[Feb 05, 2026] Quoc Anh: Dismiss location permission dialog if it appears
    await this.dismissLocationPermissionDialog();
    //await this.wait(CommonUtils.waitTimes.login);
    await this.waitForLoginSuccess(timeout);
  }

  /**
   * Log out of the current Odoo session deterministically, then land on the login page.
   * Use this before logging in as a DIFFERENT user in the same browser context (clearing cookies
   * alone is racy - the previous session can survive and the new login silently no-ops).
   */
  async logout(baseUrl: string, timeout: number = CommonUtils.waitTimes.pageLoad) {
    await this.goto(`${baseUrl}web/session/logout`);
    await this.waitForURL('**web/login*', timeout);
    await this.dismissErrorDialog();
  }

  /**
   * Log in WITHOUT waiting for the CRM admin menu. For partner-portal users (e.g. a Reseller) who
   * land on the "/my" portal instead of the CRM backend - they have no CRM menu, so the standard
   * login()'s waitForLoginSuccess would time out. The caller waits for the portal's own signal
   * (e.g. ResellerPortalPage.waitForPortalReady()).
   */
  async loginPortalUser(email: string, password: string, timeout: number = CommonUtils.waitTimes.login) {
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    await this.waitForLoginPage(timeout);
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickLogin();
    await this.dismissLocationPermissionDialog();
  }

  /**
   * Dismiss location permission dialog if it appears
   * Handles the "Know your location" popup that may appear after login
   */
  async dismissLocationPermissionDialog() {
    const neverAllowButton = this.page.getByRole('button', { name: 'Never allow' });
    if (await neverAllowButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await neverAllowButton.click();
      await this.wait(200);
    }
  }
}
