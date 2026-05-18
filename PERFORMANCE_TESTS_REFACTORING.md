# Performance Tests Refactoring Summary

## Date: 2025-12-10

## Objective
Refactor all test files in the `1.SalesReport_Performance` folder to use the same reliable login pattern as the Marketing BDEU tests.

## Changes Made

### 1. Import Statements
**Before:**
```typescript
import { config } from '../../../config/test.config';
import { LoginPage, HomePage, LeadPage } from '../../../pages';
```

**After:**
```typescript
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
```

### 2. beforeEach Hook
**Before:**
```typescript
test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  await page.waitForTimeout(1000);
});
```

**After:**
```typescript
test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  await context.grantPermissions([]);
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
});
```

### 3. Login Flow

#### For tests using LoginPage helper:
**Before:**
```typescript
await loginPage.navigateTo(config.baseUrl);
await loginPage.login(config.credentials.username, config.credentials.password);
```

**After:**
```typescript
await loginPage.navigateTo(baseUrl);
await loginPage.login(users.admin_crm.username, users.admin_crm.password);
await loginPage.dismissLocationPermissionDialog();
```

#### For tests using direct page navigation:
**Before:**
```typescript
await page.goto(`${config.baseUrl}web/login`);
await page.getByRole('textbox', { name: 'Email' }).fill(config.credentials.username);
await page.getByRole('textbox', { name: 'Password' }).fill(config.credentials.password);
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL('**/web?*', { waitUntil: 'domcontentloaded' });
```

**After:**
```typescript
await page.goto(`${baseUrl}web/login`);
await page.getByRole('textbox', { name: 'Email' }).fill(users.admin_crm.username);
await page.getByRole('textbox', { name: 'Password' }).fill(users.admin_crm.password);
await page.getByRole('button', { name: 'Log in' }).click();

// Dismiss location permission dialog if present
try {
  await page.locator('button.btn-secondary:has-text("Don\'t allow")').click({ timeout: 2000 });
} catch (error) {
  // Dialog may not appear, continue
}

await page.waitForURL('**/web?*', { waitUntil: 'domcontentloaded' });
```

## Files Updated

All 18 test files in `tests/1.Project_CRM/1.SalesReport_Performance/`:

1. ✅ tc-performance-1-1-1-1-create-lead.spec.ts
2. ✅ tc-performance-1-1-1-2-edit-lead.spec.ts
3. ✅ tc-performance-1-1-2-1-create-opp.spec.ts
4. ✅ tc-performance-1-1-2-2-edit-opp.spec.ts
5. ✅ tc-performance-1-1-3-1-create-contact.spec.ts
6. ✅ tc-performance-1-1-3-2-edit-contact.spec.ts
7. ✅ tc-performance-1-1-4-1-create-deal-element.spec.ts
8. ✅ tc-performance-1-1-4-2-edit-deal-element.spec.ts
9. ✅ tc-performance-1-1-5-1-create-quotation.spec.ts
10. ✅ tc-performance-1-1-5-2-edit-quotation.spec.ts
11. ✅ tc-performance-1-1-5-3-send-quotation.spec.ts
12. ✅ tc-performance-1-1-5-4-approve-quotation.spec.ts
13. ✅ tc-performance-1-1-5-5-reject-quotation.spec.ts
14. ✅ tc-performance-1-1-6-1-create-invoice.spec.ts
15. ✅ tc-performance-1-1-6-2-edit-invoice.spec.ts
16. ✅ tc-performance-1-1-6-3-send-invoice.spec.ts
17. ✅ tc-performance-1-1-7-1-create-license.spec.ts
18. ✅ tc-performance-1-1-7-2-edit-license.spec.ts

## Key Improvements

1. **Consistent Authentication**: All tests now use the same authentication pattern from `users.config`, making credentials management centralized.

2. **Location Permission Handling**: Added `dismissLocationPermissionDialog()` call to handle the browser location permission dialog that can block test execution.

3. **Permission Grants**: Added `context.grantPermissions([])` in beforeEach to ensure consistent permission state.

4. **Standardized Imports**: Using path aliases (`@config`, `@pages`, `@helpers`) instead of relative paths for cleaner, more maintainable code.

5. **Centralized Timeouts**: Using `CommonUtils.waitTimes.standard` instead of hardcoded timeout values.

## User Credentials Used

- **Admin CRM**: `users.admin_crm` (for license tests and some core tests)
- **Thomas (Sales IC)**: `users.sale_ic_thomas` (for quotation and invoice tests)
- **Max (Manager)**: `users.manager_max` (for approve/reject quotation tests)

## Test Execution

To run all performance tests:
```bash
npx playwright test tests/1.Project_CRM/1.SalesReport_Performance/ --project=chromium
```

To run a specific performance test:
```bash
npx playwright test tests/1.Project_CRM/1.SalesReport_Performance/tc-performance-1-1-1-1-create-lead.spec.ts --project=chromium
```

## Notes

- The refactoring ensures all Performance tests follow the same login pattern as the working Marketing BDEU tests.
- All tests now properly handle the location permission dialog that appears after login.
- The consistent pattern makes future maintenance easier and reduces login-related failures.
