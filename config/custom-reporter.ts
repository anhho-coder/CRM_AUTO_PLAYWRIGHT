import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom reporter to track test failures and rename report folder
 */
class CustomReporter implements Reporter {
  private hasFailures: boolean = false;
  private timestamp: string = '';
  private folderName: string = '';
  private workerCount: string = '';
  private loginFailures: number = 0;
  private step2Failures: number = 0;
  private totalFailures: number = 0;

  onBegin(config: FullConfig, suite: Suite) {
    console.log('\n========== CUSTOM REPORTER STARTED ==========');
    // Get timestamp and folder name from environment
    this.timestamp = process.env.TEST_START_TIMESTAMP || '';
    this.folderName = process.env.TEST_FOLDER_NAME || 'tests';
    this.workerCount = process.env.WORKER_COUNT || '1';
    console.log(`Timestamp: ${this.timestamp}`);
    console.log(`Folder Name: ${this.folderName}`);
    console.log(`Worker Count: ${this.workerCount}`);
    console.log('=============================================\n');
  }

  onTestBegin(test: TestCase) {
    // Extract TC ID from test title (e.g. "CRM-3374_1.16:" → "CRM-3374_1\.16:")
    const tcIdMatch = test.title.match(/^([A-Z]+-\d+_[\d.]+):/);
    if (tcIdMatch) {
      const tcId = tcIdMatch[1];
      // Escape dots for use as a grep pattern
      const grepPattern = tcId.replace(/\./g, '\\.');
      console.log('\n===============================================================');
      console.log(`  Command to run this test:`);
      console.log(`  npx playwright test --grep "${grepPattern}:" --project=chromium`);
      console.log('===============================================================\n');
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      this.hasFailures = true;
      this.totalFailures++;
      console.log(`[Custom Reporter] Test failed: ${test.title}`);
      
      // Check if failure occurred during login step (Step 1) or navigation (Step 2)
      const errorMessage = result.error?.message || '';
      const stepTitle = result.steps.find(step => step.error)?.title || '';
      
      if (stepTitle.includes('Step 1') || stepTitle.toLowerCase().includes('login') ||
          errorMessage.includes('Login') || errorMessage.includes('login')) {
        this.loginFailures++;
        console.log(`[Custom Reporter] ⚠️  Login failure detected in test: ${test.title}`);
      } else if (stepTitle.includes('Step 2') || stepTitle.toLowerCase().includes('navigate to crm')) {
        this.step2Failures++;
        console.log(`[Custom Reporter] ⚠️  Step 2 (Navigate to CRM) failure detected in test: ${test.title}`);
      }
    }
  }

  onEnd(result: FullResult) {
    console.log('\n========== CUSTOM REPORTER ENDING ==========');
    console.log(`Has Failures: ${this.hasFailures}`);
    console.log(`Result Status: ${result.status}`);
    console.log('');
    console.log('📊 TEST STATISTICS:');
    console.log(`   Total Failures: ${this.totalFailures}`);
    console.log(`   Login Failures (Step 1): ${this.loginFailures}`);
    console.log(`   Step 2 Failures (Navigate to CRM): ${this.step2Failures}`);
    console.log(`   Other Failures: ${this.totalFailures - this.loginFailures - this.step2Failures}`);
    console.log('');
    
    // Force flush console output
    if (process.stdout.write('')) {
      // Output flushed
    }
    
    // Wait 3 seconds before renaming
    console.log('Waiting 3 seconds before rename...');
    const waitUntil = Date.now() + 3000;
    while (Date.now() < waitUntil) {
      // Busy wait
    }
    
    console.log('Starting folder rename...');
    this.renameReportFolder();
    console.log('Folder rename completed');
    console.log('===========================================\n');
  }

  private renameReportFolder() {
    console.log(`[Custom Reporter] Attempting to rename report folder...`);
    console.log(`[Custom Reporter] Timestamp: ${this.timestamp}`);
    console.log(`[Custom Reporter] Folder Name: ${this.folderName}`);
    console.log(`[Custom Reporter] Has Failures: ${this.hasFailures}`);
    
    if (!this.timestamp) {
      console.log('[Custom Reporter] Warning: No timestamp found, skipping report folder rename');
      return;
    }

    const status = this.hasFailures ? 'Failed' : 'Passed';
    const reportDir = path.join(process.cwd(), 'playwright-report');
    const tempFolderName = `${this.timestamp}_${this.folderName}_[Worker-${this.workerCount}]_Running`;
    const finalFolderName = `${this.timestamp}_${this.folderName}_[Worker-${this.workerCount}]_${status}`;
    const tempFolder = path.join(reportDir, tempFolderName);
    const finalFolder = path.join(reportDir, finalFolderName);

    console.log(`[Custom Reporter] Looking for folder: ${tempFolderName}`);
    console.log(`[Custom Reporter] Source path: ${tempFolder}`);
    console.log(`[Custom Reporter] Target path: ${finalFolder}`);
    console.log(`[Custom Reporter] Folder exists: ${fs.existsSync(tempFolder)}`);

    if (fs.existsSync(tempFolder)) {
      try {
        // Create new folder with correct name
        console.log(`[Custom Reporter] Creating new folder: ${finalFolderName}`);
        fs.mkdirSync(finalFolder, { recursive: true });
        
        // Copy all files from old folder to new folder
        console.log(`[Custom Reporter] Copying files from ${tempFolderName} to ${finalFolderName}`);
        this.copyFolderRecursive(tempFolder, finalFolder);
        
        // Inject statistics into index.html
        console.log(`[Custom Reporter] Injecting statistics into index.html...`);
        this.injectStatisticsIntoIndexHtml(finalFolder);
        
        // Delete old folder
        console.log(`[Custom Reporter] Deleting old folder: ${tempFolderName}`);
        this.deleteFolderRecursive(tempFolder);
        
        console.log(`\n✓ Report folder renamed to: ${finalFolderName}`);
      } catch (error) {
        console.error(`[Custom Reporter] Error renaming report folder:`, error);
      }
    } else {
      console.log(`[Custom Reporter] Warning: Report folder not found: ${tempFolderName}`);
      console.log(`[Custom Reporter] Checking what folders exist in ${reportDir}:`);
      try {
        const folders = fs.readdirSync(reportDir);
        folders.forEach(folder => console.log(`  - ${folder}`));
      } catch (error) {
        console.error(`[Custom Reporter] Error listing folders:`, error);
      }
    }
  }

  private injectStatisticsIntoIndexHtml(folderPath: string) {
    const indexPath = path.join(folderPath, 'index.html');
    
    if (!fs.existsSync(indexPath)) {
      console.log('[Custom Reporter] Warning: index.html not found');
      return;
    }

    try {
      let htmlContent = fs.readFileSync(indexPath, 'utf8');
      
      const statisticsBanner = `
  <style>
    .custom-stats-banner {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 30px;
      margin: 0;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .custom-stats-container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .custom-stats-title {
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 15px 0;
    }
    .custom-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 15px;
    }
    .custom-stat-item {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 15px;
      backdrop-filter: blur(10px);
    }
    .custom-stat-label {
      font-size: 12px;
      opacity: 0.9;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .custom-stat-value {
      font-size: 36px;
      font-weight: bold;
    }
  </style>
  <div class="custom-stats-banner">
    <div class="custom-stats-container">
      <div class="custom-stats-title">📊 Test Statistics</div>
      <div class="custom-stats-grid">
        <div class="custom-stat-item">
          <div class="custom-stat-label">Total Failures</div>
          <div class="custom-stat-value">${this.totalFailures}</div>
        </div>
        <div class="custom-stat-item">
          <div class="custom-stat-label">Login Failures (Step 1)</div>
          <div class="custom-stat-value">${this.loginFailures}</div>
        </div>
        <div class="custom-stat-item">
          <div class="custom-stat-label">Step 2 Failures</div>
          <div class="custom-stat-value">${this.step2Failures}</div>
        </div>
        <div class="custom-stat-item">
          <div class="custom-stat-label">Other Failures</div>
          <div class="custom-stat-value">${this.totalFailures - this.loginFailures - this.step2Failures}</div>
        </div>
      </div>
    </div>
  </div>
`;
      
      // Inject after opening <body> tag
      htmlContent = htmlContent.replace(/<body[^>]*>/, (match) => match + statisticsBanner);
      
      fs.writeFileSync(indexPath, htmlContent, 'utf8');
      console.log('[Custom Reporter] ✓ Statistics injected into index.html');
    } catch (error) {
      console.error('[Custom Reporter] Error injecting statistics:', error);
    }
  }

  private copyFolderRecursive(source: string, target: string) {
    const files = fs.readdirSync(source);
    
    files.forEach(file => {
      const sourcePath = path.join(source, file);
      const targetPath = path.join(target, file);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true });
        this.copyFolderRecursive(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    });
  }

  private deleteFolderRecursive(folderPath: string) {
    if (fs.existsSync(folderPath)) {
      fs.readdirSync(folderPath).forEach(file => {
        const filePath = path.join(folderPath, file);
        if (fs.statSync(filePath).isDirectory()) {
          this.deleteFolderRecursive(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(folderPath);
    }
  }
}

export default CustomReporter;
