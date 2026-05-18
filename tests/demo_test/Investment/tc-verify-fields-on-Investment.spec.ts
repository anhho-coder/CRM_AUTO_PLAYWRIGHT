import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Investments - Field Verification Test
 * Test Case ID: tc-verify-fields-on-Investment
 *
 * Summary: Verify field on Investment
 *
 * Command to run:
 * npx playwright test "tests/demo_test/tc-verify-fields-on-Investment.spec.ts" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful
 * 2. Have the following variables and their values:
 *    - Investment Name             = TEST Investment 2026-03-17-142921
 *    - URL                         = http://10.220.222.100/web?debug#id=490&action=2376&model=nakivo.investment.activity&view_type=form&menu_id=866
 *    - Company Name                = TEST_company_name_2026-03-17-143012
 *    - Company Email               = Test@company2026-03-17143012.com
 *    - Total in Company Currency   = 329.00
 *
 * Steps to reproduce:
 * 1. Launch the webpage by using the URL above
 * 2. Click at "Quotes" tab
 * 3. Verify the following:
 *    3.1. Value at "Expected closing date" row    = BLANK
 *    3.2. Value at "Quotation date" row           = current date
 *    3.3. Value at "Payer" row                    = value of "Company Name"
 *    3.4. Value at "Salesperson" row              = createdByName (from User file)
 *    3.5. Value at "Sales Team" row               = BLANK
 *    3.6. Value at "Total in Company Currency" row = value of "Total in Company Currency"
 */

test.describe('tc-verify-fields-on-Investment - Verify field on Investment', () => {

  // Pre-condition variables
  const INVESTMENT_NAME              = 'TEST Investment 2026-03-17-142921';
  const INVESTMENT_URL               = 'http://10.220.222.100/web?debug#id=490&action=2376&model=nakivo.investment.activity&view_type=form&menu_id=866';
  const COMPANY_NAME                 = 'TEST_company_name_2026-03-17-143012';
  const COMPANY_EMAIL                = 'Test@company2026-03-17143012.com';
  const TOTAL_IN_COMPANY_CURRENCY    = '329.00';
  const SALESPERSON_NAME             = users.admin_crm.createdByName;

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('Verify field on Investment', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage      = new LoginPage(page);
    const investmentPage = new InvestmentPage(page);

    // Pre-condition 1: Login
    await test.step('Pre-condition 1: Login', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');
    });

    // Pre-condition 2: Log the known variables
    await test.step('Pre-condition 2: Known variables', async () => {
      console.log('\n=== PRE-CONDITION VARIABLES ===');
      console.log(`  Investment Name           : ${INVESTMENT_NAME}`);
      console.log(`  URL                       : ${INVESTMENT_URL}`);
      console.log(`  Company Name              : ${COMPANY_NAME}`);
      console.log(`  Company Email             : ${COMPANY_EMAIL}`);
      console.log(`  Total in Company Currency : ${TOTAL_IN_COMPANY_CURRENCY}`);
      console.log(`  Salesperson               : ${SALESPERSON_NAME}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Launch the webpage using the URL
    await test.step('Step 1: Launch the webpage using the URL', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO INVESTMENT URL ===');

      await page.goto(INVESTMENT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log(`✓ Navigated to: ${INVESTMENT_URL}`);
    });

    // Step 2: Click at "Quotes" tab
    await test.step('Step 2: Click at "Quotes" tab', async () => {
      console.log('\n=== STEP 2: CLICK QUOTES TAB ===');

      await investmentPage.clickQuotesTab();

      console.log('✓ Clicked "Quotes" tab');
    });

    // Step 3: Verify fields in the Quotes tab
    await test.step('Step 3: Verify fields in the Quotes tab', async () => {

      // Current date in MM/DD/YYYY format (Odoo display format)
      const today = new Date();
      const currentDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

      // 3.1 Expected closing date = BLANK
      await test.step('Step 3.1: Verify "Expected closing date" = BLANK', async () => {
        console.log('\n=== STEP 3.1: VERIFY EXPECTED CLOSING DATE ===');
        const value = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Expected closing date');
        console.log(`  Expected closing date actual  : "${value}"`);
        console.log(`  Expected closing date expected: "" (BLANK)`);
        expect(value, `"Expected closing date" should be blank`).toBe('');
        console.log('  ✓ Expected closing date = BLANK — verified');
      });

      // 3.2 Quotation date = current date (Odoo may include time, e.g. "03/17/2026 16:16:37")
      await test.step('Step 3.2: Verify "Quotation date" = current date', async () => {
        console.log('\n=== STEP 3.2: VERIFY QUOTATION DATE ===');
        const rawValue = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Quotation date');
        const value = rawValue.split(' ')[0]; // strip time portion if present
        console.log(`  Quotation date actual  : "${value}" (raw: "${rawValue}")`);
        console.log(`  Quotation date expected: "${currentDate}"`);
        expect(value, `"Quotation date" should be current date "${currentDate}"`).toBe(currentDate);
        console.log(`  ✓ Quotation date = ${currentDate} — verified`);
      });

      // 3.3 Payer = Company Name
      await test.step('Step 3.3: Verify "Payer" = Company Name', async () => {
        console.log('\n=== STEP 3.3: VERIFY PAYER ===');
        const value = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Payer');
        console.log(`  Payer actual  : "${value}"`);
        console.log(`  Payer expected: "${COMPANY_NAME}"`);
        expect(value, `"Payer" should be "${COMPANY_NAME}"`).toBe(COMPANY_NAME);
        console.log(`  ✓ Payer = ${COMPANY_NAME} — verified`);
      });

      // 3.4 Salesperson = createdByName
      await test.step('Step 3.4: Verify "Salesperson" = createdByName', async () => {
        console.log('\n=== STEP 3.4: VERIFY SALESPERSON ===');
        const value = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Salesperson');
        console.log(`  Salesperson actual  : "${value}"`);
        console.log(`  Salesperson expected: "${SALESPERSON_NAME}"`);
        expect(value, `"Salesperson" should be "${SALESPERSON_NAME}"`).toBe(SALESPERSON_NAME);
        console.log(`  ✓ Salesperson = ${SALESPERSON_NAME} — verified`);
      });

      // 3.5 Sales Team = BLANK
      await test.step('Step 3.5: Verify "Sales Team" = BLANK', async () => {
        console.log('\n=== STEP 3.5: VERIFY SALES TEAM ===');
        const value = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Sales Team');
        console.log(`  Sales Team actual  : "${value}"`);
        console.log(`  Sales Team expected: "" (BLANK)`);
        expect(value, `"Sales Team" should be blank`).toBe('');
        console.log('  ✓ Sales Team = BLANK — verified');
      });

      // 3.6 Total in Company Currency = 329.00
      await test.step('Step 3.6: Verify "Total in Company Currency" = Total in Company Currency', async () => {
        console.log('\n=== STEP 3.6: VERIFY TOTAL IN COMPANY CURRENCY ===');
        const value = await investmentPage.getQuotesFirstRowCellTextOrEmpty('Total in Company Currency');
        console.log(`  Total in Company Currency actual  : "${value}"`);
        console.log(`  Total in Company Currency expected: "${TOTAL_IN_COMPANY_CURRENCY}"`);
        expect(value, `"Total in Company Currency" should be "${TOTAL_IN_COMPANY_CURRENCY}"`).toBe(TOTAL_IN_COMPANY_CURRENCY);
        console.log(`  ✓ Total in Company Currency = ${TOTAL_IN_COMPANY_CURRENCY} — verified`);
      });
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
  });
});
