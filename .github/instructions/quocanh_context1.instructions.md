Context for Creating New Test Cases Using the Page Object Model

HOW TO ADDRESS THE USER
- Whenever you need the user's decision, confirmation, or input, address the user by the name configured in Git `user.name` (run `git config user.name`).
- In this repository that name is currently `anh.ho`, so prompts should call the user "anh.ho" (e.g. "anh.ho, which Sales Team should this test assign?").
- Always read the current Git `user.name` rather than hardcoding the name, so the correct name is used if it changes.

AUTOMATION METRICS HEADER TAGS (mandatory on every spec you create/refactor)
- Right under `Test Case ID:` in the spec header add: `Automation-Type: new` or `Automation-Type: refactored`, plus `Automation-Date: YYYY-MM-DD` (today).
- `new` = a just-created TC, or one that has NEVER run yet (still being built to its first pass); edits before the first run keep it `new`. `refactored` = code change to a TC that has ALREADY run before.
- These feed the daily automation-metrics report (`scripts/metrics/`, output `metrics/master-report.html`) which buckets tagged specs into New vs Updated/Refactored with count / run-time / fail count. Untagged specs are not counted.
- When you change the code of a spec that has already run, set `Automation-Type: refactored` and bump `Automation-Date` to today.

CRITICAL RULE: STRICT PAGE OBJECT MODEL ENFORCEMENT
**ABSOLUTELY NO HARDCODED LOCATORS IN TEST FILES**
- ALL locators MUST be defined in Page Object classes (e.g., LoginPage.ts, HomePage.ts, LeadPage.ts, ContactPage.ts)
- ALL interactions with page elements MUST go through Page Object methods
- Test files (.spec.ts) should ONLY contain:
  * Test logic and flow
  * Page Object method calls
  * Assertions using expect()
  * Console logging for test output
  
**FORBIDDEN IN TEST FILES:**
- ❌ Direct page.locator() calls: `await page.locator('select[name="team_id"]').selectOption({ label: 'CMR' });`
- ❌ Direct page.getByRole() calls: `await page.getByRole('textbox', { name: 'Company Name' }).fill('value');`
- ❌ Direct page.getByText() calls: `await page.getByText('Submit').click();`
- ❌ Direct page.getByPlaceholder() calls
- ❌ Direct page.filter() calls
- ❌ Any direct Playwright locator methods in test files

**REQUIRED IN TEST FILES:**
- ✅ Page Object method calls: `await leadPage.selectSalesTeam('CMR');`
- ✅ Page Object method calls: `await leadPage.fillCompanyName('Company Name');`
- ✅ Page Object method calls: `await contactPage.clickSaveButton();`

Page Object Structure
Each page in the application must have its own class in the pages folder (e.g., LoginPage.ts, HomePage.ts, ContactPage.ts, etc.).
Each Page class should contain methods representing actions or queries on that page (e.g., login(), fillForm(), clickButton(), selectSalesTeam(), fillCompanyName(), ...).
All locators MUST be defined as private/protected properties in the Page class.
All locators MUST be grouped in the locator section at the top of the Page class (e.g., near `// Locators` in `ContactPage.ts`), not scattered between methods.
All element interactions MUST be wrapped in public methods in the Page class.

Using Helpers and Config
When utility functions are needed (e.g., string handling, date, random, etc.), import and use them from common.utils.ts.
Always import and use configuration variables from test.config.ts (and other files in config as needed) for any environment values, timeouts, URLs, or test data.
Do not hardcode values such as timeouts, URLs, or credentials; always reference them from the config files.

**MANDATORY SALESPERSON / SALES TEAM TEST DATA**
- The canonical list of Salespersons and their Sales Teams is declared in `test-data/sales-team/salesteam.users.ts` (the `salesTeamUsers` map; each entry has `email`, `displayName`, and `team`, e.g. `sale_ic_bdeu_thomas` -> displayName "Thomas Semerich", team "BDEU").
- Whenever you create or update a test that assigns or verifies a Salesperson and/or a Sales Team, you MUST take the values from `salesteam.users` - import `salesTeamUsers` and reference its entries (e.g. `salesTeamUsers.sale_ic_bdeu_thomas.displayName` for the Salesperson and `salesTeamUsers.sale_ic_bdeu_thomas.team` for the Sales Team). Do NOT hardcode Salesperson names or Sales Team labels as inline string literals in the test or Page Object.
- A Salesperson and its Sales Team must stay paired: use the `displayName` and `team` from the SAME `salesTeamUsers` entry so the pairing matches the data declared in `salesteam.users`.
- If a required Salesperson/Sales Team pairing is missing from `salesteam.users`, add the new entry to that file FIRST, then reference it from the test.
- This keeps Salesperson/Sales Team values consistent, correct, and maintainable across all tests.

New Locators
If you need to define a new locator for an element in any Page Object, you MUST use a multi-layer locator strategy.
Define the locator(s) as private/protected variables in the Page class.
For **all new locators in all Page files**, use this mandatory order:
- **Primary locator = XPath**
- **Fallback locator = CSS selector**
When Copilot generates a new scenario that introduces new elements/locators, you MUST add those new locators into the top locator group of the corresponding Page file.
**MANDATORY:** If there is no existing method to interact with this element, you MUST create a new method in the Page class before using it in tests.

Locator Fallback Strategy
- The layered strategy is **required by default for all newly created locators in all Page Objects**, not only for known flaky elements.
- **Primary locator must be XPath** to match the project convention.
- **Fallback locator must be CSS** so dynamic UI states can still be targeted when XPath is less resilient.
- Required pattern for every new locator implementation:
  - define the primary XPath locator first
  - define the CSS fallback locator second
  - try primary first, then fallback inside the Page Object method
- Do NOT put fallback locator logic in test files; keep it inside Page Objects only.
- Apply this rule across all Page files such as `LoginPage.ts`, `HomePage.ts`, `LeadPage.ts`, `ContactPage.ts`, `OpportunityPage.ts`, `InvestmentPage.ts`, `ReAssignationPage.ts`, and any future Page Object.
- Example use cases: buttons, inputs, dropdown items, action menus, delete menu items, floating dialogs, overlays, popovers, and lazy-rendered elements.
Creating New Methods When Needed
If a new action does not have a suitable method in the Page, you MUST create a new method with clear and sufficient parameters.
Name the method according to the action and target, e.g., clickLoginButton(), enterUsername(username: string), selectSalesTeam(teamName: string), fillCompanyName(name: string), ...
When creating new test files, FIRST check if required methods exist in Page Objects. If not, add them to the appropriate Page Object BEFORE writing the test.
How to Write a Test Case
Import the required Page Object.
Initialize the Page Object with Playwright’s page.
Use ONLY the Page Object's methods to perform test steps - NO direct page interactions.
Use helpers from common.utils.ts for any supporting logic.
Always import and use variables from test.config.ts for timeouts, URLs, and other configuration.
Test Case Skeleton Example
```typescript
import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

test.describe('Test Suite Name', () => {
  test('Test Case: Description', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    // Step 1: Login
    await test.step('Step 1: Login', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
    });
    
    // Step 2: Navigate and perform actions using Page Object methods ONLY
    await test.step('Step 2: Perform actions', async () => {
      await homePage.navigateToCRM();
      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity('Test Lead');
      await leadPage.selectSalesTeam('CMR'); // ✅ CORRECT - Page Object method
      // ❌ NEVER: await page.locator('select[name="team_id"]').selectOption({ label: 'CMR' });
    });
    
    // Step 3: Assertions
    await test.step('Step 3: Verify results', async () => {
      const teamName = await leadPage.getSalesTeamValue();
      expect(teamName).toBe('CMR');
    });
  });
});
```

Notes
Ensure each Page Object only contains logic relevant to that page.
If you find a method lacks necessary parameters or does not exist, you MUST add or create the method in the corresponding Page Object BEFORE using it in tests.
Never hardcode environment values, timeouts, or URLs; always use the config files.
**NEVER use direct page.locator(), page.getByRole(), page.getByText() or any Playwright locator methods in test files.**
Handling Known Defects in Test Cases
If a test case is known to fail due to a specific Defect ID, always use Option 1: test.fail() with annotation. This ensures the test is still executed, tracked, and easily filtered by defect. Example usage:

```typescript
test('CRM-1234 [BUG-5678]: My test title', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'defect', description: 'CRM-1234' });
  test.fail(); // Mark as expected to fail due to known defect
  // ...test steps...
});
```

- Always include the Defect ID in the annotation.
- Always include the Defect ID in the test title as well, for example: `CRM-3374_2.4 [CRM-9857]: Verify ...`
- Reason: Playwright `--grep` matches the test title, not annotation metadata. Annotation alone is NOT enough for `--grep "CRM-9857"` to find the test.
- When the user asks to add a bug to a TS test, you MUST update the TS so the test can be run by either:
  - Test case prefix/name, for example: `npx playwright test --grep "CRM-3374_2\.4:" --project=chromium`
  - Bug ID, for example: `npx playwright test --grep "CRM-9857" --project=chromium`
- This means you must update BOTH:
  - The test title to include the bug ID
  - The header comment block's `Command to run:` section to include both grep commands when applicable
- Do NOT use test.fixme() for known defects, as it will skip the test entirely.
- This approach ensures visibility and tracking of defect-related failures in reports.

**EXCEPTION - WHEN THE USER EXPLICITLY ASKS TO SKIP A TEST DUE TO A BUG**
- If the user specifically requests to skip the test because of a bug or defect, you MUST use declaration-level skipping so Playwright skips the test before fixtures are created.
- Use one of these patterns:
  - `test.skip('... @BUG-ID', async ({ page }) => { ... });`
  - `test.describe.skip(...)` when the whole suite must be skipped.
- Do NOT call `test.skip(true, 'Bug ...')` inside the test body.
- Reason: calling `test.skip()` inside the test body happens after Playwright has already started setting up fixtures such as `page`, which can still open the browser.
- When applying this exception, still keep the bug ID in the test title so `--grep "BUG-ID"` continues to work.
- When applicable, also keep the bug-specific `Command to run:` entry in the file header comment.

**MANDATORY TEST REPORTING FORMAT**
- ALL new or updated test scripts (TS) MUST wrap each logical step with `test.step()`.
- Step label strings MUST use only plain ASCII characters. Do NOT use Unicode escapes (e.g., `\u2013`) or special typographic characters (e.g., en dash –, em dash —) inside `test.step()` labels. Use a plain hyphen `-` instead.
  - ✅ Correct: `'Step 3-5: ...'`
  - ❌ Wrong:   `'Step 3\u20135: ...'` or `'Step 3–5: ...'`
- This ensures each step appears in the Playwright test report with clear numbering and description (see example in attachments).
- Example:
  ```typescript
  await test.step('Step 1: Login as Thomas', async () => {
    // ...step logic...
  });
  ```
- Steps in the report must match the business/test case flow (e.g., Step 1: Login, Step 2: Navigate to CRM, etc.).
- Do NOT combine multiple logical actions into a single step unless they are inseparable for reporting.
- This is required for all new and updated test scripts.

**MANDATORY WAITING PRACTICE**
- All waits in test scripts MUST use the appropriate value from `CommonUtils.waitTimes` (e.g., `await page.waitForTimeout(CommonUtils.waitTimes.standard);`).
- Do NOT use fixed numeric values like `await page.waitForTimeout(2000);` or `await page.waitForTimeout(5000);`.
- This rule also applies to ALL Page Object files in `pages/`.
- For every wait-related method in page files - such as `locator.waitFor(...)`, `page.waitForSelector(...)`, `page.waitForURL(...)`, `locator.isVisible({ timeout: ... })`, `locator.inputValue({ timeout: ... })`, `locator.textContent({ timeout: ... })`, and similar methods that accept a timeout - you MUST use the appropriate value from `CommonUtils.waitTimes`.
- NEVER use fixed numeric timeout values such as `3000`, `5000`, `10000`, `30000`, or `60000` directly inside page methods.
- Always choose the most suitable named timeout from `CommonUtils.waitTimes` based on the action context (for example: `standard`, `long`, `extraLong`, `abnormalWait`, `pageLoad`, `savingPage`, `elementAppear`, etc.).
- This ensures maintainability, consistency, and easy adjustment of wait times across all tests.
- To avoid Unicode corruption during PowerShell file edits, always pass `-Encoding UTF8` to `Get-Content` and `Set-Content`.
- Example:
  ```typescript
  // Good:
  await page.waitForTimeout(CommonUtils.waitTimes.standard);
  await link.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait });
  // Bad:
  await page.waitForTimeout(2000);
  await link.waitFor({ state: 'visible', timeout: 10000 });
  ```

**MANDATORY CLEANUP TOGGLE PATTERN FOR beforeEach/afterEach**
- For every new or updated Playwright test that contains cleanup logic in `beforeEach` and/or `afterEach`, you MUST generate explicit boolean toggle constants so cleanup can be enabled or skipped without rewriting the test.
- Define the toggle constants near the top of the `describe` block or near the test setup area, before the hooks use them.
- Use clear names based on the data being cleaned, for example:
  - `const SKIP_CLEANUP_OPPS = false;`
  - `const SKIP_CLEANUP_CONTACTS = false;`
  - `const SKIP_CLEANUP_LEADS = false;`
- The meaning must always be consistent:
  - `true` = skip cleanup logic
  - `false` = run cleanup logic
- Default generated value should be `false` unless the user explicitly asks to keep cleanup disabled for debugging or data retention.
- Wrap the cleanup sections with guards such as:
  - `if (!SKIP_CLEANUP_OPPS) { ... }`
  - `if (!SKIP_CLEANUP_CONTACTS) { ... }`
- Apply this pattern to both:
  - `beforeEach` cleanup/pre-test data reset
  - `afterEach` tear-down/post-test cleanup
- Always include a short inline comment so the switch is easy for humans to flip later.
- Example pattern:

```typescript
const SKIP_CLEANUP_OPPS = false; // Toggle to true to skip Opps cleanup
const SKIP_CLEANUP_CONTACTS = false; // Toggle to true to skip Contacts cleanup

test.beforeEach(async ({ browser, context }) => {
  if (!SKIP_CLEANUP_OPPS) {
    // cleanup logic here
  }
});

test.afterEach(async ({ page }, testInfo) => {
  if (!SKIP_CLEANUP_CONTACTS) {
    // cleanup logic here
  }
});
```
- If multiple entities are cleaned in the same test, prefer separate toggles per entity instead of one large shared switch.
- Do not remove this switch pattern from existing tests when updating them unless the user explicitly requests a different cleanup strategy.

# Test Automation Context Requirements (Effective Jan 2026)

For any Playwright test that is created or updated in this project, you must ensure:

1. **Step Reporting:**
   - All major actions and verifications must be wrapped in `test.step()` so that they appear as clear steps in the Playwright HTML report.
   - Step descriptions should be meaningful and match the business/test documentation.

2. **Screenshot and Video Capture:**
   - The test must capture screenshots and record video for all browser contexts, regardless of which user/account is logged in (e.g., Thomas, Max, etc.).
   - Video and screenshot capture must be enabled for both the main and any additional browser contexts (e.g., via `recordVideo` in `browser.newContext`).
   - At the end of each test, capture a final screenshot and attach it to the report.

> These requirements are mandatory for all new and updated tests. PRs that do not comply will be rejected.

- For every new TypeScript (.ts) test file, you must add a command to run the test using Playwright's --grep option. This command should be placed in the file's header comment block, immediately below the Summary section. Example:

  Command to run:
  npx playwright test --grep "<Test Case ID or unique test name>" --project=chromium

- If the test is linked to a known bug/defect ID, the header comment block must include BOTH run commands:

  Command to run:
  npx playwright test --grep "<Test Case ID or unique test name>" --project=chromium
  npx playwright test --grep "<Bug ID>" --project=chromium

- Example:

  Command to run:
  npx playwright test --grep "CRM-3374_2\.4:" --project=chromium
  npx playwright test --grep "CRM-9857" --project=chromium