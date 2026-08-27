import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const customReporterPath = path.resolve(__dirname, 'config', 'custom-reporter.js');
// Merges per-Page videos into one full-video.webm and rewrites attachments.
// MUST come before 'html' so the report shows a single video (see reporter[] below).
const videoMergeReporterPath = path.resolve(__dirname, 'config', 'video-merge-reporter.js');

// Per-project video mode. The CI projects keep 'retain-on-failure' so Jenkins behaviour is
// unchanged; a LOCAL run can keep the video of a PASSING test with `VIDEO=on npx playwright test ...`.
const videoMode = process.env.VIDEO === 'on' ? ('on' as const) : ('retain-on-failure' as const);

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

// Derive a MEANINGFUL run label for the report folder name. Priority:
//   1) a --grep / -g filter -> the Test Case ID it targets (e.g. --grep "TC\.-B\.8\.1:" -> "TC.-B.8.1")
//   2) a test path          -> the first folder under tests/ (e.g. tests/1.Project_CRM/... -> "1.Project_CRM")
//   3) fallback             -> "tests"
// (1) keeps single-TC runs (run by ID, with no path arg) from falling back to the unhelpful "tests" label.

/** Read the value of a --grep / -g argument ("--grep X", "--grep=X", "-g X", "-g=X"); undefined if absent. */
function getGrepValue(): string | undefined {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--grep' || a === '-g') return argv[i + 1];
    if (a.startsWith('--grep=')) return a.slice('--grep='.length);
    if (a.startsWith('-g=')) return a.slice('-g='.length);
  }
  return undefined;
}

/** Turn a --grep regex into a filesystem-safe label, e.g. "TC\.-B\.8\.1:" -> "TC.-B.8.1". */
function toFolderLabel(value: string): string {
  return value
    .replace(/\\(.)/g, '$1')        // unescape regex escapes: \. -> . , \- -> -
    .replace(/[\\/:*?"<>|]/g, '')   // drop characters illegal in Windows folder names (incl. the trailing ":")
    .replace(/\s+/g, '_')           // spaces -> underscores
    .replace(/^_+|_+$/g, '')        // trim leading/trailing underscores
    .trim();
}

const grepValue = getGrepValue();
const testPath = process.argv.find(arg => arg.includes('tests/') || arg.includes('tests\\'));
const grepLabel = grepValue ? toFolderLabel(grepValue) : '';

let TEST_FOLDER = 'tests';
if (grepLabel) {
  // Running by Test Case ID (e.g. --grep "TC\.-B\.8\.1:") -> name the report after that ID.
  TEST_FOLDER = grepLabel;
} else if (testPath) {
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
 * Per-run artifact folder: test-results/<timestamp>_<Folder>_[Worker-N]
 *
 * Playwright REMOVES its `outputDir` when a run starts. With the default flat `test-results/`, a
 * second Playwright process started in this repo (a parallel Claude session, a probe run, ...)
 * wipes the videos/screenshots/traces of the run already in flight - the HTML reporter then finds
 * nothing to copy, and the report shows a video player with a dead src (0:00, black) because the
 * attachment entry was recorded but its file is gone.
 *
 * Giving every run its own subfolder means each process only ever deletes its own, so concurrent
 * runs no longer destroy each other's evidence. `npm run clean` (rimraf test-results) and
 * scripts/merge-videos.js (recursive scan) both still work on the nested layout.
 */
function getOutputDirName(): string {
  return `${TEST_TIMESTAMP}_${TEST_FOLDER}_[Worker-${WORKER_COUNT}]`;
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Per-run artifact folder so parallel Playwright processes cannot wipe each other - see
     getOutputDirName(). Override with PW_OUTPUT_DIR when a job needs a fixed path. */
  outputDir: process.env.PW_OUTPUT_DIR || `test-results/${getOutputDirName()}`,
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
    [videoMergeReporterPath], // MUST run before 'html': merges per-Page videos -> one full-video.webm
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
    // Allure raw results (consumed by the combined CRM_Allure_Report job).
    ['allure-playwright', { resultsDir: 'allure-results' }],
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
      // DNS workaround (opt-in): when the agent can reach the pre-prod IP but DNS cannot
      // resolve the hostname, set HOST_RESOLVER_MAP (e.g. "MAP pre-production.nakivo.site
      // 10.220.222.100") and Chrome resolves via the map instead of DNS. The cert still
      // validates against the hostname. Unset => normal DNS, no effect (local/dev default).
      args: process.env.HOST_RESOLVER_MAP
        ? [`--host-resolver-rules=${process.env.HOST_RESOLVER_MAP}`]
        : [],
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
    {
      // CI project: runs on the agent's installed Google Chrome (channel:'chrome')
      // so no Playwright browser is downloaded/extracted. Video is retained only
      // for failing tests (screenshot stays 'on' for every test via the shared
      // `use` block); the Jenkinsfile installs Playwright's small ffmpeg binary so
      // recording works on the agent. Use with: --project=chrome-headless
      name: 'chrome-headless',
      use: { ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: true,
        video: videoMode,
      },
    },

    // --- Per-section suites: run with --project=<Section> (each = its folder, on Chrome).
    //     A Jenkins job declares its section here via the PROJECT parameter. ---
    {
      name: 'SalesReport_Performance',
      testDir: './tests/1.Project_CRM/1.SalesReport_Performance',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      name: 'Leads_Assignment',
      testDir: './tests/1.Project_CRM/2.Leads_Assignment',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      name: 'Lead_Merging',
      testDir: './tests/1.Project_CRM/3.Lead_Merging',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      name: 'Investments',
      testDir: './tests/1.Project_CRM/4.Investments',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      name: 'CRM_Module',
      testDir: './tests/1.Project_CRM/9.CRM_Module',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      name: 'O12',
      testDir: './tests/1.Project_CRM/O12_CE_to_O12_CC',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      // 7.Pre-sales sub-tree of the O12 migration suite (16 specs, titles pre-sale-7.x).
      // Its own project so a dedicated Jenkins job (CRM_O12_PreSales) can run just this
      // folder via --project=PreSales. Overlaps with (is a subset of) the O12 project.
      name: 'PreSales',
      testDir: './tests/1.Project_CRM/O12_CE_to_O12_CC/7.Pre-sales',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      // 1.Business-Process (Salesperson process) sub-tree of the O12 migration suite
      // (74 specs across UC-A-1..UC-A-8, titles tc-a-x / tc-<team>-x). Its own project so a
      // dedicated Jenkins job (CRM_O12_BusinessProcess) can run just this folder via
      // --project=BusinessProcess. Overlaps with (is a subset of) the O12 project.
      name: 'BusinessProcess',
      testDir: './tests/1.Project_CRM/O12_CE_to_O12_CC/1.Business-Process→Salesperson-process-on-Odoo-12CC',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
    },
    {
      // 3 team sub-folders of 2.Leads_Assignment run as ONE job:
      // Marketing_BDEU (23) + CMR_team (13) + THD_team (32) = 68 async-assignment specs.
      // Its own project so a dedicated Jenkins job (CRM_Leads_Assignment_3Teams) runs
      // exactly these three sibling folders via --project=Leads_Assignment_3Teams (a strict
      // subset of the full Leads_Assignment project's 7 team folders). testDir is the whole
      // 2.Leads_Assignment tree and testMatch narrows collection to just these three folders.
      // All 68 poll the async Sales-Team/Salesperson cron (up to 35 min each; the poll breaks
      // early once assigned); THD_team is the slow lane, so the job floors its timeout at 480m.
      name: 'Leads_Assignment_3Teams',
      testDir: './tests/1.Project_CRM/2.Leads_Assignment',
      testMatch: [
        '**/Marketing_BDEU/**/*.spec.ts',
        '**/CMR_team/**/*.spec.ts',
        '**/THD_team/**/*.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], channel: 'chrome', headless: true, video: videoMode },
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
