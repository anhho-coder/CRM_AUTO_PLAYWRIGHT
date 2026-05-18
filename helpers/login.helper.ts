import { Page, expect } from '@playwright/test';

/**
 * Login Page Helper
 * Provides reusable methods for interacting with the NAKIVO Partner Portal login page
 */
export class LoginHelper {
  private readonly LOGIN_URL = 'http://10.220.222.100/weblogin';
  private readonly RESET_PASSWORD_URL = 'http://10.220.222.100/web/reset_password';
  private readonly DASHBOARD_URL_PATTERN = '**/web?*';

  constructor(private page: Page) {}

  /**
   * Navigate to the login page
   */
  async navigateToLogin(): Promise<void> {
    await this.page.goto(this.LOGIN_URL);
    await expect(this.page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
  }

  /**
   * Get the email input field
   */
  getEmailField() {
    return this.page.getByRole('textbox', { name: 'Email' });
  }

  /**
   * Get the password input field
   */
  getPasswordField() {
    return this.page.getByRole('textbox', { name: 'Password' });
  }

  /**
   * Get the login button
   */
  getLoginButton() {
    return this.page.getByRole('button', { name: 'Log in' });
  }

  /**
   * Get the forgot password link
   */
  getForgotPasswordLink() {
    return this.page.getByRole('link', { name: 'Forgot password?' });
  }

  /**
   * Get the error alert
   */
  getErrorAlert() {
    return this.page.getByRole('alert');
  }

  /**
   * Fill email field
   */
  async fillEmail(email: string): Promise<void> {
    await this.getEmailField().click();
    await this.getEmailField().fill(email);
  }

  /**
   * Fill password field
   */
  async fillPassword(password: string): Promise<void> {
    await this.getPasswordField().click();
    await this.getPasswordField().fill(password);
  }

  /**
   * Click the login button
   */
  async clickLogin(): Promise<void> {
    await this.getLoginButton().click();
  }

  /**
   * Perform login with credentials
   * @param email - User email
   * @param password - User password
   */
  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickLogin();
  }

  /**
   * Perform login and wait for success
   */
  async loginAndWaitForSuccess(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.page.waitForURL(this.DASHBOARD_URL_PATTERN, { timeout: 15000 });
    await expect(this.page).toHaveTitle(/Odoo/);
  }

  /**
   * Perform login and expect error
   */
  async loginAndExpectError(email: string, password: string, errorMessage: string = 'Wrong login/password'): Promise<void> {
    await this.login(email, password);
    await expect(this.getErrorAlert()).toContainText(errorMessage);
    await expect(this.page).toHaveURL(this.LOGIN_URL);
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.getForgotPasswordLink().click();
    await expect(this.page).toHaveURL(this.RESET_PASSWORD_URL);
  }

  /**
   * Verify login page is displayed
   */
  async verifyLoginPageDisplayed(): Promise<void> {
    await expect(this.page).toHaveURL(this.LOGIN_URL);
    await expect(this.page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
    await expect(this.getEmailField()).toBeVisible();
    await expect(this.getPasswordField()).toBeVisible();
    await expect(this.getLoginButton()).toBeVisible();
  }

  /**
   * Verify user is logged in and on dashboard
   */
  async verifyLoggedIn(userName?: string): Promise<void> {
    await this.page.waitForURL(this.DASHBOARD_URL_PATTERN, { timeout: 10000 });
    await expect(this.page).toHaveTitle(/Odoo/);
    
    if (userName) {
      await expect(this.page.getByRole('button', { name: new RegExp(userName) })).toBeVisible();
    }
  }

  /**
   * Clear cookies and session
   */
  async clearSession(): Promise<void> {
    await this.page.context().clearCookies();
  }

  /**
   * Verify email field value
   */
  async verifyEmailValue(expectedValue: string): Promise<void> {
    await expect(this.getEmailField()).toHaveValue(expectedValue);
  }

  /**
   * Verify password field value
   */
  async verifyPasswordValue(expectedValue: string): Promise<void> {
    await expect(this.getPasswordField()).toHaveValue(expectedValue);
  }

  /**
   * Verify password field is masked
   */
  async verifyPasswordMasked(): Promise<void> {
    await expect(this.getPasswordField()).toHaveAttribute('type', 'password');
  }

  /**
   * Submit form using Enter key
   */
  async submitWithEnterKey(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  /**
   * Navigate using Tab key
   */
  async pressTab(): Promise<void> {
    await this.page.keyboard.press('Tab');
  }

  /**
   * Verify all login page elements are present
   */
  async verifyAllElements(): Promise<void> {
    await expect(this.getEmailField()).toBeVisible();
    await expect(this.getPasswordField()).toBeVisible();
    await expect(this.getLoginButton()).toBeVisible();
    await expect(this.getForgotPasswordLink()).toBeVisible();
    await expect(this.page.locator('img[alt*="Logo"]').first()).toBeVisible();
  }

  /**
   * Check if email field has required attribute
   */
  async verifyEmailRequired(): Promise<void> {
    await expect(this.getEmailField()).toHaveAttribute('required', '');
  }

  /**
   * Check if password field has required attribute
   */
  async verifyPasswordRequired(): Promise<void> {
    await expect(this.getPasswordField()).toHaveAttribute('required', '');
  }

  /**
   * Wait for error message to appear
   */
  async waitForError(timeout: number = 5000): Promise<void> {
    await expect(this.getErrorAlert()).toBeVisible({ timeout });
  }

  /**
   * Verify no error is displayed
   */
  async verifyNoError(): Promise<void> {
    await expect(this.getErrorAlert()).not.toBeVisible();
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.page.goto('https://sign-off.nakivo.site/web/session/logout');
    await expect(this.page).toHaveURL(this.LOGIN_URL);
  }
}
