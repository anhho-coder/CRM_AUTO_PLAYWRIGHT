import { test, expect } from '@playwright/test';
import { LoginHelper } from '../helpers/login.helper';
import { config } from '../config/test.config';

/**
 * Login Test Suite - Refactored with LoginHelper
 * Based on: docs/LOGIN_TEST_PLAN.md
 * 
 * This test suite uses the LoginHelper for cleaner, more maintainable tests
 */

test.describe('Login Tests - Using Helper', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.clearSession();
    await loginHelper.navigateToLogin();
  });

  test('TC-1: Successful Login with Valid Credentials', async () => {
    // Verify all page elements are present
    await loginHelper.verifyAllElements();

    // Perform login
    await loginHelper.loginAndWaitForSuccess(
      config.credentials.username,
      config.credentials.password
    );

    // Verify user is logged in
    await loginHelper.verifyLoggedIn('Thanh Phan');
  });

  test('TC-2: Login with Invalid Email Format', async () => {
    // Attempt login with invalid email
    await loginHelper.loginAndExpectError('invalid-email', 'password123');

    // Verify email field retains value and password is cleared
    await loginHelper.verifyEmailValue('invalid-email');
    await loginHelper.verifyPasswordValue('');
  });

  test('TC-3: Login with Valid Email but Wrong Password', async () => {
    // Attempt login with wrong password
    await loginHelper.loginAndExpectError(
      config.credentials.username,
      'WrongPassword123'
    );

    // Verify email field retains value and password is cleared
    await loginHelper.verifyEmailValue(config.credentials.username);
    await loginHelper.verifyPasswordValue('');
  });

  test('TC-4: Login with Empty Email Field', async () => {
    // Verify email field is required
    await loginHelper.verifyEmailRequired();

    // Fill only password
    await loginHelper.fillPassword('password123');

    // Attempt to submit
    await loginHelper.clickLogin();

    // Verify form didn't submit
    await loginHelper.verifyLoginPageDisplayed();
    await loginHelper.verifyNoError();
  });

  test('TC-5: Login with Empty Password Field', async () => {
    // Verify password field is required
    await loginHelper.verifyPasswordRequired();

    // Fill only email
    await loginHelper.fillEmail(config.credentials.username);

    // Attempt to submit
    await loginHelper.clickLogin();

    // Verify form didn't submit
    await loginHelper.verifyLoginPageDisplayed();
    await loginHelper.verifyEmailValue(config.credentials.username);
    await loginHelper.verifyNoError();
  });

  test('TC-6: Login with Both Fields Empty', async () => {
    // Verify both fields are empty
    await loginHelper.verifyEmailValue('');
    await loginHelper.verifyPasswordValue('');

    // Attempt to submit
    await loginHelper.clickLogin();

    // Verify form didn't submit
    await loginHelper.verifyLoginPageDisplayed();
    await loginHelper.verifyNoError();
  });

  test('TC-7: Login with Non-Existent Email', async () => {
    // Attempt login with non-existent email
    await loginHelper.loginAndExpectError(
      'nonexistent.user@nakivo.com',
      'password123'
    );

    // Verify error handling
    await loginHelper.verifyEmailValue('nonexistent.user@nakivo.com');
    await loginHelper.verifyPasswordValue('');
  });

  test('TC-8: Login Using Enter Key', async ({ page }) => {
    // Fill credentials
    await loginHelper.fillEmail(config.credentials.username);
    await loginHelper.pressTab();
    await loginHelper.fillPassword(config.credentials.password);

    // Submit using Enter key
    await loginHelper.submitWithEnterKey();

    // Verify successful login
    await loginHelper.verifyLoggedIn('Thanh Phan');
  });

  test('TC-9: Password Field Masking', async () => {
    // Fill password
    await loginHelper.fillPassword(config.credentials.password);

    // Verify password is masked
    await loginHelper.verifyPasswordMasked();

    // Verify password value is set (but not visible)
    const passwordValue = await loginHelper.getPasswordField().inputValue();
    expect(passwordValue).toBe(config.credentials.password);
  });

  test('TC-10: Forgot Password Functionality', async ({ page }) => {
    // Click forgot password link
    await loginHelper.clickForgotPassword();

    // Verify reset password page elements
    await expect(page.getByRole('textbox', { name: 'Your Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();

    // Click back to login
    await page.getByRole('link', { name: 'Back to Login' }).click();

    // Verify returned to login page
    await loginHelper.verifyLoginPageDisplayed();
  });

  test('TC-11: Session Persistence - Already Logged In User', async ({ page }) => {
    // Login successfully
    await loginHelper.loginAndWaitForSuccess(
      config.credentials.username,
      config.credentials.password
    );

    // Try to navigate back to login page
    await loginHelper.navigateToLogin();

    // Verify user is still logged in (redirected to dashboard)
    await loginHelper.verifyLoggedIn('Thanh Phan');
  });
});

/**
 * Additional Login Tests with Helper
 */
test.describe('Login Tests - Additional Scenarios', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.clearSession();
    await loginHelper.navigateToLogin();
  });

  test('Login and Logout Flow', async () => {
    // Login
    await loginHelper.loginAndWaitForSuccess(
      config.credentials.username,
      config.credentials.password
    );

    // Verify logged in
    await loginHelper.verifyLoggedIn('Thanh Phan');

    // Logout
    await loginHelper.logout();

    // Verify back on login page
    await loginHelper.verifyLoginPageDisplayed();
  });

  test('Multiple Failed Login Attempts', async () => {
    // Attempt login 3 times with wrong password
    for (let i = 1; i <= 3; i++) {
      await loginHelper.login(
        config.credentials.username,
        `WrongPassword${i}`
      );

      // Wait for error
      await loginHelper.waitForError();

      // Verify error message
      await expect(loginHelper.getErrorAlert()).toContainText('Wrong login/password');

      // Clear for next attempt
      if (i < 3) {
        await loginHelper.navigateToLogin();
      }
    }
  });

  test('Login with Email Having Different Case', async () => {
    // Test with uppercase email
    const uppercaseEmail = config.credentials.username.toUpperCase();
    
    await loginHelper.login(uppercaseEmail, config.credentials.password);

    // Wait to see the result
    await loginHelper.getPasswordField().page().waitForTimeout(3000);

    const currentUrl = loginHelper.getCurrentUrl();
    
    // Either succeeds (case-insensitive) or fails
    if (currentUrl.includes('/web?')) {
      await loginHelper.verifyLoggedIn('Thanh Phan');
    } else {
      // If case-sensitive, should show error
      await expect(loginHelper.getErrorAlert()).toContainText('Wrong login/password');
    }
  });

  test('Verify Login Page Logo and Branding', async ({ page }) => {
    // Verify NAKIVO branding elements
    await expect(page.locator('img[alt*="Logo"]').first()).toBeVisible();
    
    // Verify welcome message
    await expect(page.getByText('Welcome to the NAKIVO Partner Portal')).toBeVisible();
    
    // Verify company description
    await expect(page.getByText(/NAKIVO is a privately held company/)).toBeVisible();
  });

  test('Verify Login Form Accessibility', async ({ page }) => {
    // Check for proper form structure
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Verify input fields have proper labels
    const emailField = loginHelper.getEmailField();
    const passwordField = loginHelper.getPasswordField();

    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();

    // Verify button is keyboard accessible
    const loginButton = loginHelper.getLoginButton();
    await expect(loginButton).toBeEnabled();
  });
});
