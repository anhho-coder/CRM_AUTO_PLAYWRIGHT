import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Import File Verification Test
 * Test Case ID: CRM-3374_1.20
 *
 * Summary: Verify the import file includes "Create manually" field
 *
 * Command to run:
 * npx playwright test --grep "CRM-3374_1\.20:" --project=chromium
 * 
 * Pre-condition:
 * I. Download template:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Click at "Audience" tab
 * 5. Click "Download template" hyperlink
 * 6. Once the "Downloads" popup displays, click at "Keep" button
 * 7. Wait for the download complete
 * 8. Open the downloaded xlsx file and verify:
 *
 * Steps to reproduce:
 * 1. The "Create manually" field exist in the xlsx file
 *
 * Tear down (Clean up test data):
 * 1. Delete the downloaded xlsx file
 */

test.describe('CRM-3374_1.20 - Verify the import file includes "Create manually" field', () => {

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
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);

      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }

      // Additional wait for page to fully stabilize
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('CRM-3374_1.20: Verify the import file includes "Create manually" field', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);

    // Save path of the downloaded template for tear down
    let downloadedFilePath = '';

    // ===== PRE-CONDITION I: Navigate to Investment and download template =====

    // Pre-condition I.1: Login and navigate to Investments module
    await test.step('Pre-condition I.1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION I.1: LOGIN ===`);
      console.log(`Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Clicked "Investments" button');
    });

    // Pre-condition I.2: Select "Investment" from top menu
    await test.step('Pre-condition I.2: Select "Investment" from top menu', async () => {
      console.log('=== PRE-CONDITION I.2: NAVIGATE TO INVESTMENT ===');

      await investmentPage.navigateToInvestment();

      console.log('✓ Selected "Investment" from top menu\n');
    });

    // Pre-condition I.3: Press CREATE button and wait
    await test.step('Pre-condition I.3: Press CREATE button and wait', async () => {
      console.log('=== PRE-CONDITION I.3: CLICK CREATE BUTTON ===');

      await investmentPage.clickCreateButton();

      console.log('✓ Create form opened');
    });

    // Pre-condition I.4: Click "Audience" tab
    await test.step('Pre-condition I.4: Click "Audience" tab', async () => {
      console.log('=== PRE-CONDITION I.4: CLICK AUDIENCE TAB ===');

      await investmentPage.clickAudienceTab();

      console.log('✓ Audience tab clicked');
    });

    // Pre-condition I.5: Click "Download template" and wait for download
    await test.step('Pre-condition I.5: Click "Download template" hyperlink and wait for download', async () => {
      console.log('=== PRE-CONDITION I.5: DOWNLOAD TEMPLATE ===');

      const saveDir = path.join(process.cwd(), 'test-data', 'investment-module');
      downloadedFilePath = await investmentPage.downloadAudienceTemplate(saveDir);

      console.log(`✓ Template downloaded: ${downloadedFilePath}`);
    });

    console.log('\n✅ PRE-CONDITION I COMPLETED SUCCESSFULLY');

    // ===== STEPS TO REPRODUCE =====

    // Step 1: Verify "Create manually" field exists in the xlsx file
    await test.step('Step 1: Verify the "Create manually" field exists in the downloaded xlsx file', async () => {
      console.log('\n=== STEP 1: VERIFY "Create manually" FIELD IN XLSX ===');

      // Helper: convert 0-based column index to Excel column letter (0→"A", 25→"Z", 26→"AA", ...)
      const toColumnLetter = (idx: number): string => {
        let letter = '';
        let n = idx + 1;
        while (n > 0) {
          const rem = (n - 1) % 26;
          letter = String.fromCharCode(65 + rem) + letter;
          n = Math.floor((n - 1) / 26);
        }
        return letter;
      };

      const headers = investmentPage.getXlsxColumnHeaders(downloadedFilePath);
      console.log(`  Column headers found: ${JSON.stringify(headers)}`);

      const colIndex = headers.findIndex(h => h.toLowerCase() === 'create manually');
      const hasCreateManually = colIndex !== -1;

      if (hasCreateManually) {
        console.log(`  ✓ "Create manually" field found at column ${toColumnLetter(colIndex)} (index ${colIndex})`);
      }

      expect(hasCreateManually, 'Step 1: The downloaded xlsx template should contain "Create manually" column').toBe(true);

      console.log('  ✓ "Create manually" field exists in the xlsx file — verified');
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // ---- Tear Down ----
    await test.step('Tear Down: Delete the downloaded xlsx file', async () => {
      console.log('\n=== TEAR DOWN ===');

      if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
        fs.unlinkSync(downloadedFilePath);
        console.log(`✓ Downloaded xlsx file deleted: ${downloadedFilePath}`);
      }

      console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
    });
  });
});
