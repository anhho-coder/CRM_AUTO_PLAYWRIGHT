import { Page, expect } from '@playwright/test';
import { baseUrl } from '../config/users.config';

// Quoc Anh: (Sep 17, 26) The host of baseUrl, escaped for use inside a RegExp, so every URL
// assertion below pins the real server instead of accepting any host.
const HOST = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\./g, '\\.');

/**
 * Login Page Helper
 * Provides reusable methods for interacting with the NAKIVO Partner Portal login page
 */
export class LoginHelper {
  // Quoc Anh: (Sep 17, 26) Hostname, not the raw IP: the IP resolves to the same box but serves a
  // different dbfilter, so every login here came back "Wrong login/password". The old value also
  // had a typo - "/weblogin" instead of "/web/login" - which is why the page title assertion saw
  // "Odoo" rather than the login page.
  private readonly LOGIN_URL = `${baseUrl}web/login`;
  private readonly RESET_PASSWORD_URL = `${baseUrl}web/reset_password`;
  // A fresh login lands on ".../web?" and this glob matches that shape.
  private readonly DASHBOARD_URL_PATTERN = '**/web?*';
  // Quoc Anh: (Sep 17, 26) ...but an already-authenticated visit to /web/login is redirected to
  // ".../web" with NO query string, which '**/web?*' can never match - '?' is a literal character
  // in a Playwright glob. This regex covers both shapes while still pinning host and path.
  private readonly BACKEND_URL_PATTERN = new RegExp(`^https?://${HOST}/web(\\?|#|$)`);
  // Quoc Anh: (Sep 17, 26) Host-pinned, and the trailing (\?|$) ends the path. The earlier
  // /^https?:\/\/[^/]+\/web\/login$/ accepted ANY host, and a version without the ending would also
  // have accepted "/web/loginfoo".
  private readonly LOGIN_URL_PATTERN = new RegExp(`^https?://${HOST}/web/login(\\?|$)`);
  private readonly RESET_PASSWORD_URL_PATTERN = new RegExp(`^https?://${HOST}/web/reset_password(\\?|$)`);

  constructor(private page: Page) {}

  /**
   * Navigate to the login page
   */
  async navigateToLogin(): Promise<void> {
    await this.page.goto(this.LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
  }

  /**
   * Open the login URL WITHOUT asserting that the login page rendered.
   *
   * Quoc Anh: (Sep 17, 26) Use this when a session may still be active: Odoo bounces an
   * authenticated visit to /web/login straight to the backend, so navigateToLogin()'s title
   * assertion fails by design there - that redirect is exactly what the session-persistence
   * test wants to observe.
   */
  async gotoLoginUrl(): Promise<void> {
    await this.page.goto(this.LOGIN_URL, { waitUntil: 'domcontentloaded' });
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
    // Quoc Anh: (Sep 17, 26) NOT `fill(password)` on purpose - Playwright writes the filled value
    // into the step title, so the password shows up in the HTML report and inside trace.zip.
    // Setting it through the DOM keeps the step title at "Evaluate locator(...)"; the input/change
    // events keep the form behaving as if typed. Same treatment as LoginPage.fillPassword().
    const field = this.getPasswordField();
    await field.click();
    await field.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, password);
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
    // Quoc Anh: (Sep 17, 26) Odoo never fires 'load' event; must use 'domcontentloaded' to avoid timeout.
    await this.page.waitForURL(this.DASHBOARD_URL_PATTERN, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveTitle(/Odoo/);
  }

  /**
   * Perform login and expect error
   */
  async loginAndExpectError(email: string, password: string, errorMessage: string = 'Wrong login/password'): Promise<void> {
    await this.login(email, password);
    await expect(this.getErrorAlert()).toContainText(errorMessage);
    // Quoc Anh: (Sep 17, 26) Server redirects http -> https; must use regex that tolerates both schemes.
    await expect(this.page).toHaveURL(this.LOGIN_URL_PATTERN);
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.getForgotPasswordLink().click();
    // Quoc Anh: (Sep 17, 26) Server redirects http -> https; must use regex that tolerates both schemes.
    await expect(this.page).toHaveURL(this.RESET_PASSWORD_URL_PATTERN);
  }

  /**
   * Verify login page is displayed
   */
  async verifyLoginPageDisplayed(): Promise<void> {
    // Quoc Anh: (Sep 17, 26) Server redirects http -> https; must use regex that tolerates both schemes.
    await expect(this.page).toHaveURL(this.LOGIN_URL_PATTERN);
    await expect(this.page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
    await expect(this.getEmailField()).toBeVisible();
    await expect(this.getPasswordField()).toBeVisible();
    await expect(this.getLoginButton()).toBeVisible();
  }

  /**
   * Verify user is logged in and on dashboard
   */
  async verifyLoggedIn(userName?: string): Promise<void> {
    // Quoc Anh: (Sep 17, 26) Odoo never fires 'load' event; must use 'domcontentloaded' to avoid timeout.
    // BACKEND_URL_PATTERN, not the glob: this is also called right after a redirect to a bare ".../web".
    await this.page.waitForURL(this.BACKEND_URL_PATTERN, { timeout: 10000, waitUntil: 'domcontentloaded' });
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
    // Quoc Anh: (Sep 17, 26) 'img[alt*="Logo"]' matches zero elements; real logos have src*="logo" or alt="Nakivo".
    await expect(this.page.locator('img[src*="logo"]').first()).toBeVisible();
  }

  /**
   * Check if email field has required attribute
   */
  async verifyEmailRequired(): Promise<void> {
// Quoc Anh: (Sep 17, 26) Odoo renders required="required" - assert the DOM property.
    await expect(this.getEmailField()).toHaveJSProperty('required', true);
  }

  /**
   * Check if password field has required attribute
   */
  async verifyPasswordRequired(): Promise<void> {
// Quoc Anh: (Sep 17, 26) Odoo renders required="required" - assert the DOM property.
    await expect(this.getPasswordField()).toHaveJSProperty('required', true);
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
    await this.page.goto(`${baseUrl}web/session/logout`);
    // Quoc Anh: (Sep 17, 26) Server redirects http -> https; must use regex that tolerates both schemes.
    await expect(this.page).toHaveURL(this.LOGIN_URL_PATTERN);
  }
}
