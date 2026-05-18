# CRM Automation Framework - TypeScript

A robust TypeScript-based test automation framework using Playwright for testing the Nakivo Partner Portal CRM system.

## 🏗️ Project Structure

```
CRM_AUTO/
├── config/
│   └── test.config.ts          # Test configuration and environment settings
├── helpers/
│   ├── auth.helper.ts          # Authentication helper class
│   └── crm.helper.ts           # CRM operations helper class
├── tests/
│   ├── seed.spec.ts            # Seed/setup tests
│   ├── example.spec.ts         # Example Playwright tests
│   └── tc-performance-1-1-5-4-create-crm-lead.spec.ts  # Performance test case
├── playwright.config.ts        # Playwright configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Node.js dependencies
```

## 🚀 Features

- ✅ **TypeScript Support**: Fully typed codebase with interfaces and type safety
- ✅ **Helper Classes**: Reusable helper classes for authentication and CRM operations
- ✅ **Centralized Configuration**: Single source of truth for test data and settings
- ✅ **Page Object Pattern**: Encapsulated page interactions in helper classes
- ✅ **Multiple Browser Support**: Chromium, Firefox, and WebKit
- ✅ **Parallel Test Execution**: Run tests in parallel for faster execution
- ✅ **Rich Reporting**: HTML reports with screenshots and videos on failure

## 📦 Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode
npm run test:headed

# Run tests in UI mode
npm run test:ui

# Run specific test file
npx playwright test tests/tc-performance-1-1-5-4-create-crm-lead.spec.ts

# Run tests with specific project (browser)
npx playwright test --project=chromium

# Debug tests
npm run test:debug
```

## 📝 Test Configuration

### Environment Settings (`config/test.config.ts`)

- Base URL
- Login credentials
- Timeouts
- CRM-specific URLs
- Test data

### Playwright Configuration (`playwright.config.ts`)

- Test directory
- Browser configurations
- Parallel execution settings
- Reporters
- Trace and screenshot settings

## 🛠️ Helper Classes

### AuthHelper (`helpers/auth.helper.ts`)

Handles authentication operations:
- `login(credentials)` - Performs login to the portal
- `isLoggedIn()` - Checks if user is currently logged in

### CRMHelper (`helpers/crm.helper.ts`)

Handles CRM Lead operations:
- `navigateToLeadForm()` - Navigates to lead creation form
- `fillLeadForm(leadData)` - Fills the lead form with provided data
- `saveLead()` - Saves the lead
- `getLeadId()` - Retrieves the created lead ID
- `verifyLeadCreated(leadName)` - Verifies lead was created successfully

## 📊 Test Reports

After test execution, view the HTML report:

```bash
npx playwright show-report
```

## 🔧 TypeScript Configuration

The framework uses TypeScript with strict mode enabled for better type safety:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "types": ["node", "@playwright/test"]
  }
}
```

## 📖 Writing New Tests

### Example Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { CRMHelper } from '../helpers/crm.helper';
import { config, testData } from '../config/test.config';

test.describe('Your Test Suite', () => {
  test('Your test case', async ({ page }) => {
    // Initialize helpers
    const authHelper = new AuthHelper(page);
    const crmHelper = new CRMHelper(page);

    // Perform test steps
    await authHelper.login(config.credentials);
    await crmHelper.navigateToLeadForm();
    
    // Add your test logic here
  });
});
```

## 🔒 Security

- Credentials are stored in `config/test.config.ts`
- Consider using environment variables for sensitive data in production
- Add `config/test.config.ts` to `.gitignore` if it contains real credentials

## 🤝 Best Practices

1. Use helper classes for reusable operations
2. Keep test data in configuration files
3. Use TypeScript interfaces for type safety
4. Write descriptive test names
5. Add proper assertions to verify expected behavior
6. Use page object pattern for better maintainability
7. Avoid hard-coded waits (use Playwright's auto-waiting)

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

## 👨‍💻 Development

To add new helper methods:

1. Create or update helper classes in `helpers/` directory
2. Define TypeScript interfaces for data structures
3. Update `config/test.config.ts` if new configuration is needed
4. Write tests using the helper methods

## 🐛 Troubleshooting

If tests fail:

1. Check the HTML report: `npx playwright show-report`
2. Review screenshots in `test-results/` directory
3. Watch video recordings for failed tests
4. Enable debug mode: `npx playwright test --debug`

## 📄 License

ISC
