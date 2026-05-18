import { test, expect } from '@playwright/test';
import { config } from '../config/test.config';

/**
 * Login Test Suite
 * Based on: docs/LOGIN_TEST_PLAN.md
 * 
 * Test scenarios cover:
 * 1. Successful login with valid credentials
 * 2. Login with invalid email format
 * 3. Login with valid email but wrong password
 * 4. Login with empty email field
 * 5. Login with empty password field
 * 6. Login with both fields empty
 * 7. Login with non-existent email
 * 8. Login using Enter key
 * 9. Password field masking
 * 10. Forgot password functionality
 * 11. Session persistence - already logged in user
 */

test.describe('NAKIVO Partner Portal - Login Functionality', () => {
  const LOGIN_URL = 'http://10.220.222.100/';
  const DASHBOARD_URL_PATTERN = '**/web?*';
  
  // Navigate to login page before each test
  test.beforeEach(async ({ page }) => {
    // Clear cookies to ensure fresh state
    await page.context().clearCookies();
    await page.goto(LOGIN_URL);
    
    // Verify login page is loaded
    await expect(page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  });

  test('TC-1: Successful Login with Valid Credentials', async ({ page }) => {
    // Step 1: Verify the login page elements
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.locator('img[alt*="Logo"]').first()).toBeVisible();

    // Step 2: Enter valid email
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);

    // Step 3: Enter valid password
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(config.credentials.password);

    // Step 4: Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Verify successful login
    await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 15000 });
    await expect(page).toHaveTitle(/Odoo/);
    
    // Verify navigation menu is present
    await expect(page.getByRole('link', { name: 'CRM' })).toBeVisible();
    
    // Verify user profile shows correct name
    await expect(page.getByRole('button', { name: /Thanh Phan/ })).toBeVisible();
  });

  test('TC-2: Login with Invalid Email Format', async ({ page }) => {
    // Step 1: Enter invalid email format (without @ symbol)
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('invalid-email');

    // Step 2: Enter password
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');

    // Step 3: Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Verify error handling
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.getByRole('alert')).toContainText('Wrong login/password');
    
    // Verify email field retains value
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('invalid-email');
    
    // Verify password field is cleared
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('');
  });

  test('TC-3: Login with Valid Email but Wrong Password', async ({ page }) => {
    // Step 1: Enter valid email
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);

    // Step 2: Enter wrong password
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword123');

    // Step 3: Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Verify error handling
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.getByRole('alert')).toContainText('Wrong login/password');
    
    // Verify email field retains value
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(config.credentials.username);
    
    // Verify password field is cleared
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('');
  });

  test('TC-4: Login with Empty Email Field', async ({ page }) => {
    // Step 1: Leave email empty and enter password
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');

    // Step 2: Try to click login button
    const emailInput = page.getByRole('textbox', { name: 'Email' });
    
    // Verify HTML5 validation is present
    await expect(emailInput).toHaveAttribute('required', '');
    
    // Attempt form submission
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Form should not submit (stay on same page)
    await expect(page).toHaveURL(LOGIN_URL);
    
    // Verify no error alert appears (client-side validation prevents submission)
    const alert = page.getByRole('alert');
    await expect(alert).not.toBeVisible();
  });

  test('TC-5: Login with Empty Password Field', async ({ page }) => {
    // Step 1: Enter email but leave password empty
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);

    // Step 2: Verify password field has required attribute
    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    await expect(passwordInput).toHaveAttribute('required', '');

    // Step 3: Attempt form submission
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Form should not submit
    await expect(page).toHaveURL(LOGIN_URL);
    
    // Verify email field retains value
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(config.credentials.username);
    
    // Verify no error alert appears (client-side validation)
    const alert = page.getByRole('alert');
    await expect(alert).not.toBeVisible();
  });

  test('TC-6: Login with Both Fields Empty', async ({ page }) => {
    // Step 1: Verify both fields are empty
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('');

    // Step 2: Try to submit form
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Form should not submit
    await expect(page).toHaveURL(LOGIN_URL);
    
    // Verify no error alert appears
    const alert = page.getByRole('alert');
    await expect(alert).not.toBeVisible();
  });

  test('TC-7: Login with Non-Existent Email', async ({ page }) => {
    // Step 1: Enter non-existent but valid format email
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('nonexistent.user@nakivo.com');

    // Step 2: Enter password
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');

    // Step 3: Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected Results: Verify error handling (same as wrong password)
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page.getByRole('alert')).toContainText('Wrong login/password');
    
    // Verify email field retains value
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('nonexistent.user@nakivo.com');
    
    // Verify password field is cleared
    await expect(page.getByRole('textbox', { name: 'Password' })).toHaveValue('');
  });

  test('TC-8: Login Using Enter Key on Password Field', async ({ page }) => {
    // Step 1: Enter valid email
    await page.getByRole('textbox', { name: 'Email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);

    // Step 2: Tab to password field
    await page.keyboard.press('Tab');

    // Step 3: Enter valid password
    await page.getByRole('textbox', { name: 'Password' }).fill(config.credentials.password);

    // Step 4: Press Enter key
    await page.keyboard.press('Enter');

    // Expected Results: Verify successful login
    await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 15000 });
    await expect(page).toHaveTitle(/Odoo/);
    await expect(page.getByRole('button', { name: /Thanh Phan/ })).toBeVisible();
  });

  test('TC-9: Password Field Masking', async ({ page }) => {
    // Step 1: Click on password field
    await page.getByRole('textbox', { name: 'Password' }).click();

    // Step 2: Type password
    await page.getByRole('textbox', { name: 'Password' }).fill(config.credentials.password);

    // Expected Results: Verify password field properties
    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    
    // Verify input type is password
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Verify password value is set but not visible in DOM (masked)
    const inputValue = await passwordInput.inputValue();
    expect(inputValue).toBe(config.credentials.password);
    
    // Additional check: Verify the input field masks the password
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('TC-10: Forgot Password Functionality', async ({ page }) => {
    // Step 1: Locate the "Forgot password?" link
    const forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    await expect(forgotPasswordLink).toBeVisible();

    // Step 2: Click on "Forgot password?" link
    await forgotPasswordLink.click();

    // Expected Results: Verify navigation to reset password page
    await expect(page).toHaveURL('https://sign-off.nakivo.site/web/reset_password');
    await expect(page).toHaveTitle(/Reset password \| NAKIVO Partner Portal/);
    
    // Verify reset password form elements
    await expect(page.getByRole('textbox', { name: 'Your Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Login' })).toBeVisible();
    
    // Additional Verification: Click "Back to Login"
    await page.getByRole('link', { name: 'Back to Login' }).click();
    
    // Verify return to login page
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
  });

  test('TC-11: Session Persistence - Already Logged In User', async ({ page }) => {
    // Step 1: Login with valid credentials
    await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);
    await page.getByRole('textbox', { name: 'Password' }).fill(config.credentials.password);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Step 2: Verify successful login
    await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 15000 });
    await expect(page).toHaveTitle(/Odoo/);

    // Step 3: Navigate back to login page
    await page.goto(LOGIN_URL);

    // Expected Results: User should be redirected to dashboard
    await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: 10000 });
    await expect(page).toHaveTitle(/Odoo/);
    
    // Verify user is still logged in (dashboard visible, not login form)
    await expect(page.getByRole('button', { name: /Thanh Phan/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CRM' })).toBeVisible();
  });
});
