# Login Test Suite - Execution Guide

This directory contains comprehensive automated tests for the NAKIVO Partner Portal login functionality, generated from the test plan in `docs/LOGIN_TEST_PLAN.md`.

## Test Files Overview

### 1. `login.spec.ts` - Core Login Tests
Contains all 11 primary test scenarios from the test plan:
- ✅ TC-1: Successful login with valid credentials
- ✅ TC-2: Login with invalid email format
- ✅ TC-3: Login with valid email but wrong password
- ✅ TC-4: Login with empty email field
- ✅ TC-5: Login with empty password field
- ✅ TC-6: Login with both fields empty
- ✅ TC-7: Login with non-existent email
- ✅ TC-8: Login using Enter key
- ✅ TC-9: Password field masking
- ✅ TC-10: Forgot password functionality
- ✅ TC-11: Session persistence

### 2. `login-edge-cases.spec.ts` - Edge Cases & Security Tests
Contains additional security and edge case scenarios:
- 🔒 SQL Injection attempts
- 🔒 XSS (Cross-Site Scripting) attempts
- 🔍 Special characters in input fields
- 🔍 Email format variations
- 🔍 Long input handling
- 🔍 Unicode characters
- 🔍 Case sensitivity tests
- ⚡ Performance tests (rapid attempts)
- 🎯 UI interaction tests (copy-paste, tab navigation)

### 3. `login-with-helper.spec.ts` - Refactored Tests Using Helper
Cleaner, more maintainable version of core tests using `LoginHelper`:
- Same test scenarios as `login.spec.ts`
- Additional scenario tests
- Simplified and more readable code
- Better reusability

### 4. `helpers/login.helper.ts` - Login Page Helper
Reusable helper class providing:
- Page object methods
- Common login operations
- Verification utilities
- Navigation helpers

## Prerequisites

```bash
# Install dependencies
npm install

# Ensure Playwright browsers are installed
npx playwright install
```

## Running Tests

### Run All Login Tests
```bash
npx playwright test tests/login.spec.ts
```

### Run Edge Case Tests
```bash
npx playwright test tests/login-edge-cases.spec.ts
```

### Run Tests with Helper (Recommended)
```bash
npx playwright test tests/login-with-helper.spec.ts
```

### Run All Login-Related Tests
```bash
npx playwright test tests/login*.spec.ts
```

### Run Specific Test Case
```bash
# By test name
npx playwright test -g "TC-1: Successful Login"

# By test ID
npx playwright test -g "TC-3"
```

### Run in Headed Mode (Watch Browser)
```bash
npx playwright test tests/login.spec.ts --headed
```

### Run in Debug Mode
```bash
npx playwright test tests/login.spec.ts --debug
```

### Run with UI Mode
```bash
npx playwright test tests/login.spec.ts --ui
```

### Run Specific Browser
```bash
# Chrome
npx playwright test tests/login.spec.ts --project=chromium

# Firefox
npx playwright test tests/login.spec.ts --project=firefox

# Safari
npx playwright test tests/login.spec.ts --project=webkit
```

### Run Tests in Parallel
```bash
npx playwright test tests/login.spec.ts --workers=4
```

### Run and Generate Report
```bash
npx playwright test tests/login.spec.ts --reporter=html
npx playwright show-report
```

## Test Configuration

Tests use configuration from `config/test.config.ts`:

```typescript
export const config = {
  baseUrl: 'https://sign-off.nakivo.site',
  credentials: {
    username: 'thanh.phan@nakivo.com',
    password: 'TPUaT@0123456789012',
  },
  timeouts: {
    navigation: 15000,
    element: 10000,
    action: 5000,
  },
};
```

## Test Data

### Valid Credentials
- **Email:** `thanh.phan@nakivo.com`
- **Password:** `TPUaT@0123456789012`

### Test Scenarios Use
- Invalid email formats: `invalid-email`, `@nakivo.com`, `user@`
- Non-existent emails: `nonexistent.user@nakivo.com`
- Wrong passwords: `WrongPassword123`, `password123`

## Expected Test Results

### Passing Tests (Green)
All tests should pass when run against a properly functioning login system:
- ✅ Valid credentials → successful login
- ✅ Invalid credentials → error message displayed
- ✅ Empty fields → client-side validation prevents submission
- ✅ Security inputs → handled gracefully without exploitation

### Known Behaviors
- Error message: "Wrong login/password" (generic, doesn't reveal if email exists)
- Password field is always cleared after failed attempt
- Email field retains value after failed attempt
- Client-side validation requires both fields to be filled
- Session persistence redirects logged-in users from login page

## Continuous Integration

### GitHub Actions Example
```yaml
name: Login Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test tests/login*.spec.ts
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Troubleshooting

### Tests Failing Due to Timeout
```bash
# Increase timeout in playwright.config.ts
timeout: 30000
```

### Tests Failing Due to Network
```bash
# Add retries in playwright.config.ts
retries: 2
```

### Session Not Clearing Between Tests
```bash
# Ensure beforeEach clears cookies
await page.context().clearCookies();
```

### Cannot Find Elements
```bash
# Run in headed mode to see what's happening
npx playwright test --headed --debug
```

## Best Practices

1. **Use the Helper Class**: `LoginHelper` provides cleaner, more maintainable tests
2. **Clear Session**: Always clear cookies in `beforeEach` for test isolation
3. **Wait for Elements**: Use Playwright's auto-waiting instead of manual timeouts
4. **Descriptive Names**: Test names follow TC-XX format matching the test plan
5. **Independent Tests**: Each test should run independently without relying on others

## Test Maintenance

### Updating Tests When UI Changes
1. Update selectors in `LoginHelper` if element attributes change
2. Update expected messages if error text changes
3. Update URLs if routing changes

### Adding New Test Scenarios
1. Add scenario to `docs/LOGIN_TEST_PLAN.md`
2. Implement test in appropriate spec file
3. Use `LoginHelper` methods when possible
4. Update this README with new test info

## Coverage Report

To see which parts of the login flow are covered:

```bash
npx playwright test tests/login*.spec.ts --reporter=html
npx playwright show-report
```

## Related Documentation

- 📄 [Full Test Plan](../docs/LOGIN_TEST_PLAN.md)
- 📄 [Helper Functions](../helpers/login.helper.ts)
- 📄 [Configuration](../config/test.config.ts)
- 📄 [Playwright Config](../playwright.config.ts)

## Support

For issues or questions about these tests:
1. Check the test plan documentation
2. Review Playwright documentation: https://playwright.dev
3. Check test execution logs for detailed error messages

---

**Generated from:** `docs/LOGIN_TEST_PLAN.md`  
**Last Updated:** November 6, 2025  
**Test Coverage:** 11 core scenarios + 15 edge cases = 26 total test scenarios
