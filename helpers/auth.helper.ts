import { Page, expect } from '@playwright/test';

/**
 * Login credentials interface
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Authentication helper class for managing login operations
 */
export class AuthHelper {
  constructor(private page: Page) {}

  /**
   * Performs login to Nakivo Partner Portal
   * @param credentials - Login credentials (username and password)
   */
  async login(credentials: LoginCredentials): Promise<void> {
    // Navigate to Nakivo Partner Portal
    await this.page.goto('http://10.220.222.100/web?debug=assets');
    
    // Wait for login form to be visible
    await this.page.waitForSelector('input[name="login"]', { timeout: 10000 });
    
    // Enter username
    await this.page.fill('input[name="login"]', credentials.username);
    
    // Enter password
    await this.page.fill('input[name="password"]', credentials.password);
    
    // Click login button
    await this.page.click('button[type="submit"]');
    
    // Wait for successful login (check for URL change)
    await this.page.waitForURL('**/web?*', { timeout: 15000 });
    
    // Verify successful login by checking page title
    await expect(this.page).toHaveTitle(/Odoo/);
  }

  /**
   * Checks if user is currently logged in
   * @returns True if user is logged in, false otherwise
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await expect(this.page).toHaveTitle(/Odoo/, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
