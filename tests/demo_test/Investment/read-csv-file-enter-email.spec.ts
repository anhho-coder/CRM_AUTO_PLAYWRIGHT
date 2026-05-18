import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Audience Importing Verification Test
 * Test Case ID: read-csv-file-enter-email
 *
 * Summary: Create a CSV audience file with test data for import verification
 *
 * Description:
 * This test creates test data variables (Contact Name, Email, Company, Phone,
 * Country, Sales Team, Salesperson, Tags), reads the template CSV file, fills
 * in the test data values into the correct columns, and saves the result as
 * CSV-Audience-copy1.csv in the test-data/investment-module folder.
 *
 * Command to run:
 * npx playwright test --grep "read-csv-file-enter-email" --project=chromium
 *
 * Pre-condition:
 * - Template CSV file exists at test-data/investment-module/CSV-AudienceTemplate-1-Company-email.csv
 *
 * Test Data:
 * - Contact Name  : TEST_first_name-TEST_last_name_<timestamp>
 * - Email         : Test@company<YYYY>-<MM>-<DD><HHMMSS>.com
 * - Company       : TEST_company_name_<timestamp>
 * - Phone         : 1234125125
 * - Country       : China
 * - Sales Team    : CMR
 * - Salesperson   : Sergey Karachin
 * - Tags          : test
 *
 * Output:
 * - File: test-data/investment-module/CSV-Audience-copy1.csv
 */

test.describe('DEMO - Create CSV audience file with test data for import verification', () => {

  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();

    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);

    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');

      // Wait for any loading spinners to disappear
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');

      // Wait for all spinners to hide
      await page.waitForTimeout(3000);

      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }

      // Additional wait for page to fully stabilize
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('DEMO: Create CSV audience file with test data for import', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Declare test data variables (assigned inside step, used across steps)
    let contactName: string;
    let emailContact1: string;
    let companyName: string;
    let phone: string;
    let country: string;
    let salesTeam: string;
    let salesperson: string;
    let tags: string;

    // ---------- Step 1: Create test data variables ----------
    await test.step('Step 1: Create test data variables', async () => {
      const timestamp = CommonUtils.generateTimestamp();
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const hhmmss = `${hh}${min}${ss}`;

      contactName  = `TEST_first_name-TEST_last_name_${timestamp}`;
      emailContact1 = `Test@company${yyyy}-${mm}-${dd}${hhmmss}.com`;
      companyName  = `TEST_company_name_${timestamp}`;
      phone        = '1234125125';
      country      = 'China';
      salesTeam    = 'CMR';
      salesperson  = 'Sergey Karachin';
      tags         = 'test';

      console.log('  ✓ Test data variables created:');
      console.log(`    - Contact Name : ${contactName}`);
      console.log(`    - Email        : ${emailContact1}`);
      console.log(`    - Company      : ${companyName}`);
      console.log(`    - Phone        : ${phone}`);
      console.log(`    - Country      : ${country}`);
      console.log(`    - Sales Team   : ${salesTeam}`);
      console.log(`    - Salesperson  : ${salesperson}`);
      console.log(`    - Tags         : ${tags}`);
    });

    // ---------- Step 2: Read template CSV file ----------
    let headers: string[];
    const templatePath = path.join(process.cwd(), 'test-data', 'investment-module', 'CSV-AudienceTemplate-1-Company-email.csv');

    await test.step('Step 2: Read template CSV file', async () => {
      expect(fs.existsSync(templatePath), `Template CSV not found at: ${templatePath}`).toBeTruthy();

      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      // Use the first non-empty line as the header row
      const lines = templateContent.split(/\r?\n/).filter(line => line.trim() !== '');
      headers = lines[0].split(',');

      console.log(`  ✓ Template CSV read from : ${templatePath}`);
      console.log(`  ✓ Column count           : ${headers.length}`);
      console.log(`  ✓ Columns                : ${headers.join(' | ')}`);
    });

    // ---------- Step 3: Fill CSV columns with test data ----------
    let newCsvContent: string;

    await test.step('Step 3: Fill in CSV columns with test data', async () => {
      // Map exact column header names → test data values
      const dataMap: Record<string, string> = {
        'Contact Name' : contactName,
        'Email'        : emailContact1,
        'Company'      : companyName,
        'Phone'        : phone,
        'Country'      : country,
        'Sales Team'   : salesTeam,
        'Salesperson'  : salesperson,
        'Tags'         : tags,
      };

      // Build data row aligned to header column order; unmapped columns remain empty
      const dataRow = headers.map(header => dataMap[header.trim()] ?? '');

      newCsvContent = headers.join(',') + '\n' + dataRow.join(',') + '\n';

      console.log('  ✓ CSV data row assembled (unmapped columns left blank)');
      console.log(`    Row preview: ${dataRow.slice(0, 10).join(', ')} ...`);
    });

    // ---------- Step 4: Save new CSV file ----------
    await test.step('Step 4: Save CSV file as CSV-Audience-copy1.csv', async () => {
      const outputPath = path.join(process.cwd(), 'test-data', 'investment-module', 'CSV-Audience-copy1.csv');

      fs.writeFileSync(outputPath, newCsvContent, 'utf-8');

      console.log(`  ✓ CSV file saved to: ${outputPath}`);
      expect(fs.existsSync(outputPath), `Output CSV was not created at: ${outputPath}`).toBeTruthy();

      // Verify the saved content contains the expected contact name and email
      const savedContent = fs.readFileSync(outputPath, 'utf-8');
      expect(savedContent).toContain(contactName);
      expect(savedContent).toContain(emailContact1);
      expect(savedContent).toContain(companyName);

      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');
    });

    // ---------- Step 5: Delete the created CSV file ----------
    await test.step('Step 5: Delete the created CSV file CSV-Audience-copy1.csv', async () => {
      const outputPath = path.join(process.cwd(), 'test-data', 'investment-module', 'CSV-Audience-copy1.csv');

      expect(fs.existsSync(outputPath), `CSV file to delete not found at: ${outputPath}`).toBeTruthy();
      fs.unlinkSync(outputPath);

      expect(fs.existsSync(outputPath), `CSV file was not deleted: ${outputPath}`).toBeFalsy();
      console.log(`  ✓ CSV file deleted: ${outputPath}`);
    });
  });
});
