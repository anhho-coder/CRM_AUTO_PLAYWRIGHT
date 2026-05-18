# Helper Classes Documentation

This document describes the helper classes available in the framework and how to use them.

## AuthHelper

Located in: `helpers/auth.helper.ts`

### Purpose
Handles authentication and login operations for the Nakivo Partner Portal.

### Constructor
```typescript
constructor(page: Page)
```

### Methods

#### `login(credentials: LoginCredentials): Promise<void>`
Performs login to the Nakivo Partner Portal.

**Parameters:**
- `credentials`: Object containing username and password
  ```typescript
  interface LoginCredentials {
    username: string;
    password: string;
  }
  ```

**Example:**
```typescript
const authHelper = new AuthHelper(page);
await authHelper.login({ 
  username: 'user@example.com', 
  password: 'password123' 
});
```

#### `isLoggedIn(): Promise<boolean>`
Checks if the user is currently logged in.

**Returns:** `Promise<boolean>` - True if logged in, false otherwise

**Example:**
```typescript
const isLoggedIn = await authHelper.isLoggedIn();
if (!isLoggedIn) {
  await authHelper.login(credentials);
}
```

---

## CRMHelper

Located in: `helpers/crm.helper.ts`

### Purpose
Handles CRM Lead creation and management operations.

### Constructor
```typescript
constructor(page: Page)
```

### Interfaces

```typescript
interface CRMLeadData {
  leadName: string;
  state?: string;
  country?: string;
  salesTeam?: string;
  salesperson?: string;
  reseller?: string;
  distributor?: string;
  leadForm?: string;
  endUser?: string;
}
```

### Methods

#### `navigateToLeadForm(): Promise<void>`
Navigates to the CRM Lead creation form and waits for it to load.

**Example:**
```typescript
const crmHelper = new CRMHelper(page);
await crmHelper.navigateToLeadForm();
```

#### `fillLeadForm(leadData: CRMLeadData): Promise<void>`
Fills the CRM Lead form with provided data. All fields except `leadName` are optional.

**Parameters:**
- `leadData`: Object containing lead information

**Example:**
```typescript
await crmHelper.fillLeadForm({
  leadName: 'Test Lead',
  state: 'Connecticut',
  country: 'United States',
  salesTeam: 'CMR',
  salesperson: 'Bear Lin',
  reseller: 'Reseller#1',
  distributor: 'Distributor#1'
});
```

#### `saveLead(): Promise<void>`
Saves the CRM Lead form and waits for the save operation to complete.

**Example:**
```typescript
await crmHelper.saveLead();
```

#### `getLeadId(): string`
Retrieves the ID of the created lead from the URL.

**Returns:** `string` - The lead ID, or empty string if not found

**Example:**
```typescript
const leadId = crmHelper.getLeadId();
console.log(`Lead ID: ${leadId}`);
```

#### `verifyLeadCreated(leadName: string): Promise<boolean>`
Verifies that a lead was created successfully.

**Parameters:**
- `leadName`: Expected name of the lead

**Returns:** `Promise<boolean>` - True if lead was created successfully

**Example:**
```typescript
const isCreated = await crmHelper.verifyLeadCreated('Test Lead');
expect(isCreated).toBeTruthy();
```

---

## CommonUtils

Located in: `helpers/common.utils.ts`

### Purpose
Provides common utility functions used across tests.

### Static Methods

#### `generateRandomString(length?: number): string`
Generates a random alphanumeric string.

**Parameters:**
- `length` (optional): Length of the string (default: 10)

**Returns:** `string` - Random string

**Example:**
```typescript
const randomStr = CommonUtils.generateRandomString(15);
// Output: "aB3xY9pQ2mN4kL7"
```

#### `generateUniqueId(prefix?: string): string`
Generates a timestamp-based unique identifier.

**Parameters:**
- `prefix` (optional): Prefix for the identifier

**Returns:** `string` - Unique identifier

**Example:**
```typescript
const uniqueId = CommonUtils.generateUniqueId('LEAD');
// Output: "LEAD_1699123456789_5432"
```

#### `takeScreenshot(page: Page, name: string): Promise<void>`
Takes a full-page screenshot.

**Parameters:**
- `page`: Playwright page object
- `name`: Name for the screenshot file

**Example:**
```typescript
await CommonUtils.takeScreenshot(page, 'error-state');
```

#### `formatDate(date?: Date): string`
Formats a date to YYYY-MM-DD format.

**Parameters:**
- `date` (optional): Date object (default: current date)

**Returns:** `string` - Formatted date string

**Example:**
```typescript
const today = CommonUtils.formatDate();
// Output: "2025-11-05"

const customDate = CommonUtils.formatDate(new Date('2025-12-25'));
// Output: "2025-12-25"
```

#### `getCurrentTimestamp(): string`
Gets current timestamp in ISO format.

**Returns:** `string` - ISO formatted timestamp

**Example:**
```typescript
const timestamp = CommonUtils.getCurrentTimestamp();
// Output: "2025-11-05T12:34:56.789Z"
```

#### `scrollToElement(page: Page, selector: string): Promise<void>`
Scrolls to a specific element on the page.

**Parameters:**
- `page`: Playwright page object
- `selector`: CSS selector of the element

**Example:**
```typescript
await CommonUtils.scrollToElement(page, '#save-button');
```

#### `isElementVisible(page: Page, selector: string): Promise<boolean>`
Checks if an element is visible on the page.

**Parameters:**
- `page`: Playwright page object
- `selector`: CSS selector of the element

**Returns:** `Promise<boolean>` - True if visible, false otherwise

**Example:**
```typescript
const isVisible = await CommonUtils.isElementVisible(page, '.error-message');
if (isVisible) {
  // Handle error
}
```

#### `retry<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>`
Retries an async function multiple times on failure.

**Parameters:**
- `fn`: Async function to retry
- `retries` (optional): Number of retry attempts (default: 3)
- `delay` (optional): Delay between retries in ms (default: 1000)

**Returns:** `Promise<T>` - Result from the function

**Example:**
```typescript
const result = await CommonUtils.retry(
  async () => {
    // Some operation that might fail
    return await page.locator('.dynamic-element').textContent();
  },
  3,  // retry 3 times
  2000 // wait 2 seconds between retries
);
```

---

## Usage Examples

### Complete Test Example

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { CRMHelper } from '../helpers/crm.helper';
import { CommonUtils } from '../helpers/common.utils';
import { config } from '../config/test.config';

test.describe('CRM Lead Tests', () => {
  test('Create new lead with unique name', async ({ page }) => {
    // Initialize helpers
    const authHelper = new AuthHelper(page);
    const crmHelper = new CRMHelper(page);
    
    // Login
    await authHelper.login(config.credentials);
    
    // Generate unique lead name
    const leadName = `TEST_${CommonUtils.generateUniqueId()}`;
    
    // Navigate and create lead
    await crmHelper.navigateToLeadForm();
    await crmHelper.fillLeadForm({
      leadName: leadName,
      state: 'Connecticut',
      country: 'United States'
    });
    
    // Save and verify
    await crmHelper.saveLead();
    const leadId = crmHelper.getLeadId();
    
    // Log results
    console.log(`Created lead: ${leadName} with ID: ${leadId}`);
    
    // Take screenshot
    await CommonUtils.takeScreenshot(page, `lead-created-${leadId}`);
    
    // Assertions
    expect(leadId).not.toBe('');
    const isCreated = await crmHelper.verifyLeadCreated(leadName);
    expect(isCreated).toBeTruthy();
  });
});
```

---

## Best Practices

1. **Always initialize helpers at the start of your test**
   ```typescript
   const authHelper = new AuthHelper(page);
   const crmHelper = new CRMHelper(page);
   ```

2. **Use try-catch for error handling when needed**
   ```typescript
   try {
     await crmHelper.saveLead();
   } catch (error) {
     await CommonUtils.takeScreenshot(page, 'save-error');
     throw error;
   }
   ```

3. **Leverage CommonUtils for dynamic data**
   ```typescript
   const leadName = `Lead_${CommonUtils.generateUniqueId()}`;
   const timestamp = CommonUtils.getCurrentTimestamp();
   ```

4. **Chain helper methods for cleaner code**
   ```typescript
   await crmHelper
     .navigateToLeadForm()
     .then(() => crmHelper.fillLeadForm(leadData))
     .then(() => crmHelper.saveLead());
   ```

5. **Use verification methods for assertions**
   ```typescript
   const isCreated = await crmHelper.verifyLeadCreated(leadName);
   expect(isCreated).toBeTruthy();
   ```
