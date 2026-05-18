import * as path from 'path';
import * as fs from 'fs';

/**
 * Global teardown to rename report folder with final status
 */
async function globalTeardown() {
  const timestamp = process.env.TEST_START_TIMESTAMP;
  const folderName = process.env.TEST_FOLDER_NAME || 'tests';
  
  // Read test status from file written by custom reporter
  const statusFile = path.join(process.cwd(), '.test-status.json');
  let hasFailures = false;
  
  try {
    if (fs.existsSync(statusFile)) {
      const statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      hasFailures = statusData.hasFailures;
      // Clean up the status file
      fs.unlinkSync(statusFile);
    }
  } catch (error) {
    console.error('Error reading test status file:', error);
  }
  
  const status = hasFailures ? 'Failed' : 'Passed';
  
  if (!timestamp) {
    console.log('Warning: No timestamp found, skipping report folder rename');
    return;
  }
  
  const finalFolderName = `${timestamp}_${folderName}_${status}`;
  const reportDir = path.join(process.cwd(), 'playwright-report');
  const tempFolderName = `${timestamp}_${folderName}_Running`;
  const tempFolder = path.join(reportDir, tempFolderName);
  const finalFolder = path.join(reportDir, finalFolderName);
  
  // Check if temp folder exists
  if (fs.existsSync(tempFolder)) {
    try {
      // Small delay to ensure all files are written
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Rename the folder
      fs.renameSync(tempFolder, finalFolder);
      console.log(`\n✓ Report folder renamed: ${finalFolderName}`);
    } catch (error) {
      console.error(`Error renaming report folder: ${error}`);
    }
  } else {
    console.log(`Warning: Temp report folder not found: ${tempFolderName}`);
    console.log(`Looking in: ${reportDir}`);
  }
}

export default globalTeardown;
