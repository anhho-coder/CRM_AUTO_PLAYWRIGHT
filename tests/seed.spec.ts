import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { config } from '../config/test.config';

test.describe('Seed Tests', () => {
  test('Login to Nakivo Partner Portal', async ({ page }) => {
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize authentication helper
    const authHelper = new AuthHelper(page);
    
    // Perform login
    await authHelper.login(config.credentials);
    
    // Verify login was successful
    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBeTruthy();
  });
});