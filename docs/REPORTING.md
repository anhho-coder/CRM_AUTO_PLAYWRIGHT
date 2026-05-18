# Test Reporting Guide

## 📊 Professional Test Reports

This project generates comprehensive test reports in multiple formats for professional test result presentation.

## 🎯 Report Types Generated

### 1. **HTML Report** (Primary Report)
- **Location**: `playwright-report/index.html`
- **Features**:
  - Interactive web interface
  - Test execution timeline
  - Screenshots and videos of failures
  - Detailed test steps
  - Filter by status (passed/failed/skipped)
  - Search functionality
  - Attachments (screenshots, traces)

### 2. **JSON Report** (Machine-readable)
- **Location**: `test-results/test-results.json`
- **Use Cases**:
  - CI/CD integration
  - Custom report parsing
  - Data analysis
  - Metrics tracking

### 3. **JUnit XML Report** (CI/CD Compatible)
- **Location**: `test-results/junit-results.xml`
- **Use Cases**:
  - Jenkins integration
  - Azure DevOps integration
  - GitLab CI/CD
  - GitHub Actions

### 4. **Console Output** (Real-time)
- **Features**:
  - Live test execution progress
  - Step-by-step output
  - Colored status indicators
  - Execution time per test

## 🚀 Running Tests & Generating Reports

### Option 1: Using Batch Scripts (Windows)

#### Run All Tests
```cmd
run-tests.bat
```
This will:
- Clean previous results
- Run all Lead Assignment tests
- Generate all report formats
- Automatically open HTML report

#### Run Specific Test Suites
```cmd
run-specific-tests.bat
```
Edit the file to uncomment the test suites you want to run.

### Option 2: Using NPM Scripts

#### Run Lead Assignment Tests
```cmd
npm run test:leads
```

#### Run Performance Tests
```cmd
npm run test:performance
```

#### Run All Test Suites
```cmd
npm run test:all-suites
```

#### View Last Report
```cmd
npm run report
```

### Option 3: Direct Playwright Commands

#### Run Specific Test File
```cmd
npx playwright test tests/Leads_Assignment/tc-bdeu-1-1-1-1-lead-assigned-to-bdeu.spec.ts --project=chromium
```

#### Run All Tests in a Folder
```cmd
npx playwright test tests/Leads_Assignment --project=chromium
```

#### Run Multiple Folders
```cmd
npx playwright test tests/Leads_Assignment tests/SalesReport_Performance --project=chromium
```

## 📁 Report Structure

```
playwright-report/
├── index.html              # Main HTML report
└── data/                   # Test result data files

test-results/
├── test-results.json       # JSON format results
├── junit-results.xml       # JUnit XML format
└── [test-name]/            # Individual test artifacts
    ├── video.webm         # Recording of test execution
    ├── screenshot.png     # Failure screenshots
    └── trace.zip          # Playwright trace files
```

## 🔍 HTML Report Features

### 1. **Test Overview**
- Total tests executed
- Passed/Failed/Skipped counts
- Execution time
- Success rate percentage

### 2. **Test Details**
For each test:
- Test name and description
- Execution status
- Duration
- Detailed steps with timing
- Console logs
- Network requests (if enabled)

### 3. **Failure Analysis**
- Error message and stack trace
- Screenshot at failure point
- Video replay of execution
- Trace viewer link (for deep debugging)

### 4. **Attachments**
- Custom screenshots (like Sales Team assignment evidence)
- Videos of test execution
- Trace files for debugging

## 🎨 Customizing Reports

### Add More Reporters
Edit `playwright.config.ts`:

```typescript
reporter: [
  ['html'],
  ['json', { outputFile: 'test-results/results.json' }],
  ['junit', { outputFile: 'test-results/junit.xml' }],
  // Add more reporters:
  ['dot'],                    // Simple progress dots
  ['line'],                   // Compact line output
  ['github'],                 // GitHub Actions annotations
],
```

### Configure HTML Report
```typescript
['html', { 
  open: 'never',            // 'always', 'never', 'on-failure'
  outputFolder: 'my-report',
  host: 'localhost',
  port: 9323
}]
```

## 📧 Sharing Reports

### Local Sharing
1. Open `playwright-report/index.html` in browser
2. Share the entire `playwright-report` folder
3. Recipient opens `index.html` locally

### CI/CD Sharing
The HTML report is a static website that can be:
- Published to GitHub Pages
- Hosted on internal web servers
- Archived as build artifacts
- Sent via email (zip the folder)

## 🔧 Troubleshooting

### Report Not Generated
```cmd
# Check if tests ran successfully
npm run test:leads

# Manually generate report
npx playwright show-report
```

### Clear Old Reports
```cmd
npm run clean
```

### Report Won't Open
```cmd
# Open manually
start playwright-report/index.html

# Or specify browser
"C:\Program Files\Google\Chrome\Application\chrome.exe" playwright-report/index.html
```

## 📊 Sample Report Output

After running tests, you'll see:

```
Running 1 test using 1 worker

  ✓ TC.BDEU.1.1.1.1 - Lead Assignment to BDEU Team › Verify the lead is assigned to BDEU team (1.3m)

  1 passed (1.3m)

To open last HTML report run:

  npx playwright show-report
```

## 🎯 Best Practices

1. **Always Clean Before Important Runs**
   ```cmd
   npm run clean
   npm run test:all-suites
   ```

2. **Use Descriptive Test Names**
   - Helps in report readability
   - Makes filtering easier

3. **Add Screenshots for Evidence**
   - Use `testInfo.attach()` for important validations
   - Already implemented in Lead Assignment test

4. **Review Reports After Each Run**
   - Check for flaky tests
   - Analyze performance trends
   - Identify common failure patterns

5. **Archive Important Reports**
   - Save reports for regression testing
   - Compare execution times over releases
   - Track test stability metrics

## 📈 Continuous Improvement

### Metrics to Track
- Test execution time trends
- Success rate over time
- Flaky test identification
- Performance benchmarks

### Report Analysis
- Review failure patterns weekly
- Update test data based on results
- Optimize slow-running tests
- Document recurring issues

---

**For More Information:**
- [Playwright Reporters Documentation](https://playwright.dev/docs/test-reporters)
- [HTML Reporter Guide](https://playwright.dev/docs/test-reporters#html-reporter)
- [Test Reports Best Practices](https://playwright.dev/docs/test-reporters#multiple-reporters)
