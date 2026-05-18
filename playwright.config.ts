import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const customReporterPath = path.resolve(__dirname, 'config', 'custom-reporter.js');

// Generate timestamp ONCE at config load time
// Format: YYYY-MM-DD-HHMMSS (e.g., 2025-12-10-143527)
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const seconds = String(now.getSeconds()).padStart(2, '0');
const TEST_TIMESTAMP = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;

// Extract test folder from command line
const testPath = process.argv.find(arg => arg.includes('tests/') || arg.includes('tests\\'));
let TEST_FOLDER = 'tests';
if (testPath) {
  const relativePath = testPath.replace(/^.*tests[\/\\]/, '');
  const segments = relativePath.split(/[\/\\]/);
  if (segments.length > 0 && segments[0] !== '') {
    TEST_FOLDER = segments[0];
  }
}

// Extract worker count from command line arguments
const workerArg = process.argv.find(arg => arg.startsWith('--workers='));
const WORKER_COUNT = workerArg ? workerArg.split('=')[1] : '1';

// Set environment variables immediately for use by reporters
process.env.TEST_START_TIMESTAMP = TEST_TIMESTAMP;
process.env.TEST_FOLDER_NAME = TEST_FOLDER;
process.env.WORKER_COUNT = WORKER_COUNT;

/**
 * Generate report folder name with format: YYYY-MM-DD-HHMMSS_FolderName_[Worker-X]_Running
 * Will be renamed to _Passed or _Failed status in custom reporter
 * Example: 2025-12-10-143527_Leads_Assignment_[Worker-4]_Passed
 */
function getReportFolderName(): string {
  return `${TEST_TIMESTAMP}_${TEST_FOLDER}_[Worker-${WORKER_COUNT}]_Running`;
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Global setup and teardown */
  globalSetup: require.resolve('./config/global-setup.ts'),
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Run tests on a single worker */
  workers: 1,
  /* Increase timeout for slow motion */
  timeout: 30000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { 
      open: 'never',
      outputFolder: `playwright-report/${getReportFolderName()}`,
      fileName: 'index.html'
    }],
    ['json', { 
      outputFile: `playwright-report/${getReportFolderName()}/test-results.json` 
    }],
    ['junit', { 
      outputFile: `playwright-report/${getReportFolderName()}/junit-results.xml` 
    }],
    ['list', { 
      printSteps: true 
    }],
    [customReporterPath], // Custom reporter runs last to rename folder after all reports are done
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'on',
    
    /* Record video for all tests (including passed) */
    video: 'on',
    
    /* Launch options */
    launchOptions: {
      slowMo: 100, // Slow down by 100ms to see actions
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], 
        headless: false,  // Shows browser (headed mode)
    }},
    {
      name: 'chromium-headless',
      use: { ...devices['Desktop Chrome'], 
        headless: true,  // Runs browser in headless mode
      },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
