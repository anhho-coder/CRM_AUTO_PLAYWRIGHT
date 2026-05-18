const fs = require('fs');
const path = require('path');

/**
 * Custom reporter to track test failures and rename report folder
 */
class CustomReporter {
  constructor() {
    this.hasFailures = false;
    this.timestamp = '';
    this.folderName = '';
    this.workerCount = '';
  }

  onBegin(config, suite) {
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

  onTestEnd(test, result) {
    if (result.status === 'failed' || result.status === 'timedOut') {
      this.hasFailures = true;
      console.log(`[Custom Reporter] Test failed: ${test.title}`);
    }
  }

  onEnd(result) {
    console.log('\n========== CUSTOM REPORTER ENDING ==========');
    console.log(`Has Failures: ${this.hasFailures}`);
    console.log(`Result Status: ${result.status}`);
    
    // Wait 3 seconds synchronously
    console.log('Waiting 3 seconds before rename...');
    const waitUntil = Date.now() + 3000;
    while (Date.now() < waitUntil) {
      // Busy wait
    }
    
    console.log('Starting folder rename...');
    try {
      this.renameReportFolder();
      console.log('Folder rename completed');
    } catch (error) {
      console.error('ERROR IN RENAME:', error);
    }
    console.log('===========================================\n');
  }

  renameReportFolder() {
    console.log(`[Custom Reporter] Attempting to rename report folder...`);
    console.log(`[Custom Reporter] Timestamp: ${this.timestamp}`);
    console.log(`[Custom Reporter] Folder Name: ${this.folderName}`);
    console.log(`[Custom Reporter] Has Failures: ${this.hasFailures}`);
    
    const status = this.hasFailures ? 'Failed' : 'Passed';
    const reportDir = path.join(process.cwd(), 'playwright-report');

    // Build the expected folder name for THIS test run
    const expectedFolderName = `${this.timestamp}_${this.folderName}_[Worker-${this.workerCount}]_Running`;
    console.log(`[Custom Reporter] Looking for specific folder: ${expectedFolderName}`);

    const tempFolder = path.join(reportDir, expectedFolderName);
    
    // Check if the expected folder exists
    if (!fs.existsSync(tempFolder)) {
      console.log(`[Custom Reporter] Warning: Expected folder not found: ${expectedFolderName}`);
      console.log(`[Custom Reporter] Listing all folders in report directory:`);
      try {
        const allFolders = fs.readdirSync(reportDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        allFolders.forEach(folder => console.log(`  - ${folder}`));
      } catch (error) {
        console.error(`[Custom Reporter] Error listing folders:`, error.message);
      }
      return;
    }

    // Rename the specific folder for this test run
    const finalFolderName = `${this.timestamp}_${this.folderName}_[Worker-${this.workerCount}]_${status}`;
    const finalFolder = path.join(reportDir, finalFolderName);

    console.log(`[Custom Reporter] Renaming: ${expectedFolderName} -> ${finalFolderName}`);

    try {
      // Use atomic rename - this is a single operation, no copying involved
      fs.renameSync(tempFolder, finalFolder);
      console.log(`✓ Report folder renamed to: ${finalFolderName}`);
    } catch (error) {
      console.error(`[Custom Reporter] Error renaming folder:`, error.message);
      // If rename fails, try the copy approach as fallback
      try {
        console.log(`[Custom Reporter] Trying copy approach as fallback...`);
        fs.mkdirSync(finalFolder, { recursive: true });
        this.copyFolderRecursive(tempFolder, finalFolder);
        this.deleteFolderRecursive(tempFolder);
        console.log(`✓ Report folder copied to: ${finalFolderName}`);
      } catch (fallbackError) {
        console.error(`[Custom Reporter] Fallback also failed:`, fallbackError.message);
      }
    }
  }

  copyFolderRecursive(source, target) {
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

  deleteFolderRecursive(folderPath) {
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

module.exports = CustomReporter;
