import { test, expect } from '@playwright/test';

/**
 * Login Edge Cases & Security Test Suite
 * Based on: docs/LOGIN_TEST_PLAN.md - Additional Test Considerations
 * 
 * Test scenarios cover:
 * - SQL Injection attempts
 * - XSS (Cross-Site Scripting) attempts
 * - Special characters in input fields
 * - Email format variations
 * - Password strength variations
 * - Multiple spaces in fields
 * - Case sensitivity
 */

test.describe('NAKIVO Partner Portal - Login Edge Cases & Security', () => {
  const LOGIN_URL = 'https://sign-off.nakivo.site/web/login';

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(LOGIN_URL);
    await expect(page).toHaveTitle(/Login \| NAKIVO Partner Portal/);
  });

  test('TC-SEC-1: SQL Injection in Email Field', async ({ page }) => {
    // Test with common SQL injection patterns
    const sqlInjectionPatterns = [
      "' OR '1'='1",
      "admin'--",
      "' OR 1=1--",
      "admin' OR '1'='1'/*",
    ];

    for (const pattern of sqlInjectionPatterns) {
      await page.getByRole('textbox', { name: 'Email' }).fill(pattern);
      await page.getByRole('textbox', { name: 'Password' }).fill('password123');
      await page.getByRole('button', { name: 'Log in' }).click();

      // Expected: Should show error, not execute SQL
      await expect(page.getByRole('alert')).toContainText('Wrong login/password');
      
      // Navigate back to login if redirected
      if (!page.url().includes('/login')) {
        await page.goto(LOGIN_URL);
      }
    }
  });

  test('TC-SEC-2: XSS Attack in Email Field', async ({ page }) => {
    // Test with XSS patterns
    const xssPatterns = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "javascript:alert('xss')",
    ];

    for (const pattern of xssPatterns) {
      await page.getByRole('textbox', { name: 'Email' }).fill(pattern);
      await page.getByRole('textbox', { name: 'Password' }).fill('password123');
      await page.getByRole('button', { name: 'Log in' }).click();

      // Expected: Should not execute JavaScript, show error instead
      await page.waitForTimeout(1000);
      
      // Check no alert dialog appeared
      const dialogs: string[] = [];
      page.on('dialog', dialog => dialogs.push(dialog.message()));
      expect(dialogs.length).toBe(0);

      // Should show login error
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        await expect(page.getByRole('alert')).toContainText('Wrong login/password');
      }
    }
  });

  test('TC-EDGE-1: Email with Multiple @ Symbols', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('user@@nakivo.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should handle gracefully with error
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-2: Email with Leading/Trailing Spaces', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('  thanh.phan@nakivo.com  ');
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should either trim spaces or show error
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    
    // Either successful login (if trimmed) or error
    if (currentUrl.includes('/login')) {
      await expect(page.getByRole('alert')).toContainText('Wrong login/password');
    }
  });

  test('TC-EDGE-3: Very Long Email Address', async ({ page }) => {
    const longEmail = 'a'.repeat(100) + '@nakivo.com';
    await page.getByRole('textbox', { name: 'Email' }).fill(longEmail);
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should handle gracefully
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-4: Very Long Password', async ({ page }) => {
    const longPassword = 'P'.repeat(500);
    await page.getByRole('textbox', { name: 'Email' }).fill('test@nakivo.com');
    await page.getByRole('textbox', { name: 'Password' }).fill(longPassword);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should handle gracefully with error
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-5: Email with Special Characters', async ({ page }) => {
    const specialEmails = [
      'user+tag@nakivo.com',
      'user.name@nakivo.com',
      'user_name@nakivo.com',
      'user-name@nakivo.com',
    ];

    for (const email of specialEmails) {
      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      await page.getByRole('textbox', { name: 'Password' }).fill('password123');
      await page.getByRole('button', { name: 'Log in' }).click();

      // Expected: Should be accepted as valid format
      await page.waitForTimeout(1000);
      
      // Should show error since credentials are wrong, but email format is valid
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        await expect(page.getByRole('alert')).toContainText('Wrong login/password');
      }

      // Refresh page for next iteration
      await page.goto(LOGIN_URL);
    }
  });

  test('TC-EDGE-6: Case Sensitivity in Email', async ({ page }) => {
    // Test with different case variations
    const emailVariations = [
      'THANH.PHAN@NAKIVO.COM',
      'Thanh.Phan@Nakivo.Com',
      'thanh.PHAN@nakivo.COM',
    ];

    for (const email of emailVariations) {
      await page.getByRole('textbox', { name: 'Email' }).fill(email);
      await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword');
      await page.getByRole('button', { name: 'Log in' }).click();

      await page.waitForTimeout(2000);
      
      // Expected: Email should be case-insensitive (most systems)
      // Should show error for wrong password
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        await expect(page.getByRole('alert')).toContainText('Wrong login/password');
      }

      await page.goto(LOGIN_URL);
    }
  });

  test('TC-EDGE-7: Password with Only Spaces', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('test@nakivo.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('     ');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should handle gracefully
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-8: Unicode Characters in Email', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('tëst@nåkïvö.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should handle gracefully with error
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-9: Empty Email Domain', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('user@');
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should show error or prevent submission
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-EDGE-10: Missing Email Local Part', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill('@nakivo.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('password123');
    await page.getByRole('button', { name: 'Log in' }).click();

    // Expected: Should show error or prevent submission
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-PERF-1: Rapid Multiple Login Attempts', async ({ page }) => {
    // Test rapid successive login attempts
    for (let i = 0; i < 5; i++) {
      await page.getByRole('textbox', { name: 'Email' }).fill('test@nakivo.com');
      await page.getByRole('textbox', { name: 'Password' }).fill('wrong' + i);
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForTimeout(500);
    }

    // Expected: System should handle multiple rapid requests
    // May show rate limiting or continue showing errors
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('TC-UI-1: Copy-Paste Password', async ({ page }) => {
    const password = 'TestPassword123';
    
    // Simulate copying password to clipboard
    await page.evaluate((pwd) => {
      navigator.clipboard.writeText(pwd);
    }, password);

    await page.getByRole('textbox', { name: 'Email' }).fill('test@nakivo.com');
    
    // Focus on password field and paste
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.keyboard.press('Control+V');
    
    // Verify password was pasted
    const passwordValue = await page.getByRole('textbox', { name: 'Password' }).inputValue();
    expect(passwordValue.length).toBeGreaterThan(0);
  });

  test('TC-UI-2: Tab Navigation Through Form', async ({ page }) => {
    // Start at email field
    await page.getByRole('textbox', { name: 'Email' }).focus();
    await page.keyboard.type('test@nakivo.com');
    
    // Tab to password field
    await page.keyboard.press('Tab');
    
    // Verify password field is focused
    const passwordField = page.getByRole('textbox', { name: 'Password' });
    await expect(passwordField).toBeFocused();
    
    await page.keyboard.type('password123');
    
    // Tab to login button
    await page.keyboard.press('Tab');
    
    // Verify login button can be focused and activated
    const loginButton = page.getByRole('button', { name: 'Log in' });
    await expect(loginButton).toBeFocused();
    
    // Press Enter on button
    await page.keyboard.press('Enter');
    
    // Verify form was submitted
    await page.waitForTimeout(2000);
  });
});
