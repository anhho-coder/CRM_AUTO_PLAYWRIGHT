/**
 * Script to rename the report folder after test execution
 * This should be run after Playwright tests complete
 */

const fs = require('fs');
const path = require('path');

function renameReportFolder() {
  const reportDir = path.join(process.cwd(), 'playwright-report');
  
  if (!fs.existsSync(reportDir)) {
    console.log('No report directory found');
    return;
  }
  
  // Find folders with "_Running" suffix
  const folders = fs.readdirSync(reportDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => name.endsWith('_Running'));
  
  if (folders.length === 0) {
    console.log('No running report folders found');
    return;
  }
  
  // Read test status from file
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
  
  // Rename each running folder
  folders.forEach(folderName => {
    const oldPath = path.join(reportDir, folderName);
    const newName = folderName.replace('_Running', `_${status}`);
    const newPath = path.join(reportDir, newName);
    
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`✓ Report folder renamed: ${newName}`);
    } catch (error) {
      console.error(`Error renaming folder ${folderName}:`, error);
    }
  });
}

// Run the rename function
renameReportFolder();
