import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation - Field Verification Test
 * Test Case ID: tc-verify-fields-on-Quotation
 *
 * Summary: Verify the field on Quotation page
 *
 * Command to run:
 * npx playwright test "tests/demo_test/tc-verify-fields-on-Quotation.spec.ts" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful
 * 2. Have the following variables and their values:
 *    - Quotation Number = SO198097
 *    - URL              = http://10.220.222.100/web?debug#id=231300&active_id=231294&model=sale.order&view_type=form&menu_id=111
 *    - Company Name     = TEST_company_name_2026-03-16-182832
 *    - Company Email    = Test@company2026-03-16182832.com
 *    - Quotation Status = Quotation
 *
 * Steps to reproduce:
 * 1. Launch the webpage using the "URL"
 * 2. Get the value of "Quotation Number" called Quotation_Number_Contact#1
 * 3. Verify "Quotation Number" = SO198097
 * 4. Get the value of "Total in Company Currency" called Quotation_Total_Company_Currency_Contact#1
 * 5. Verify "Quotation_Total_Company_Currency_Contact#1" = 329.00
 * 6. Get the status of Quotation
 * 7. Verify the status of Quotation = value of "Quotation Status"
 */

test.describe('tc-verify-fields-on-Quotation - Verify the field on Quotation page', () => {

  // Pre-condition variables
  const QUOTATION_NUMBER                       = 'SO198097';
  const QUOTATION_URL                          = 'http://10.220.222.100/web?debug#id=231300&active_id=231294&model=sale.order&view_type=form&menu_id=111';
  const COMPANY_NAME                           = 'TEST_company_name_2026-03-16-182832';
  const COMPANY_EMAIL                          = 'Test@company2026-03-16182832.com';
  const TOTAL_IN_COMPANY_CURRENCY              = '329.00';
  const QUOTATION_STATUS                       = 'Quotation';

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

  test('Verify the field on Quotation page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);

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
      console.log(`  Quotation Number             : ${QUOTATION_NUMBER}`);
      console.log(`  URL                          : ${QUOTATION_URL}`);
      console.log(`  Company Name                 : ${COMPANY_NAME}`);
      console.log(`  Company Email                : ${COMPANY_EMAIL}`);
      console.log(`  Total in Company Currency    : ${TOTAL_IN_COMPANY_CURRENCY}`);
      console.log(`  Quotation Status             : ${QUOTATION_STATUS}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Launch the webpage using the URL
    await test.step('Step 1: Launch the webpage using the URL', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO QUOTATION URL ===');

      await page.goto(QUOTATION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);

      console.log(`✓ Navigated to: ${QUOTATION_URL}`);
    });

    // Step 2: Get the value of "Quotation Number" (Quotation_Number_Contact#1)
    let quotationNumberActual = '';
    await test.step('Step 2: Get the value of "Quotation Number" called Quotation_Number_Contact#1', async () => {
      console.log('=== STEP 2: GET QUOTATION NUMBER ===');

      quotationNumberActual = await quotationPage.getSalesOrderNumber();
      console.log(`  ✓ Quotation_Number_Contact#1 : ${quotationNumberActual}`);
    });

    // Step 3: Verify "Quotation Number" = SO198097
    await test.step('Step 3: Verify "Quotation Number" = SO198097', async () => {
      console.log('=== STEP 3: VERIFY QUOTATION NUMBER ===');
      console.log(`  Quotation Number actual  : "${quotationNumberActual}"`);
      console.log(`  Quotation Number expected: "${QUOTATION_NUMBER}"`);

      expect(quotationNumberActual, `Quotation Number should be "${QUOTATION_NUMBER}"`).toBe(QUOTATION_NUMBER);

      console.log(`  ✓ Quotation Number = ${QUOTATION_NUMBER} — verified`);
    });

    // Step 4: Get the value of "Total in Company Currency" (Quotation_Total_Company_Currency_Contact#1)
    let totalInCompanyCurrencyActual = '';
    await test.step('Step 4: Get the value of "Total in Company Currency" called Quotation_Total_Company_Currency_Contact#1', async () => {
      console.log('=== STEP 4: GET TOTAL IN COMPANY CURRENCY ===');

      totalInCompanyCurrencyActual = await quotationPage.getTotalInCompanyCurrency();
      console.log(`  ✓ Quotation_Total_Company_Currency_Contact#1 : ${totalInCompanyCurrencyActual}`);
    });

    // Step 5: Verify "Quotation_Total_Company_Currency_Contact#1" = 329.00
    await test.step('Step 5: Verify "Quotation_Total_Company_Currency_Contact#1" = 329.00', async () => {
      console.log('=== STEP 5: VERIFY TOTAL IN COMPANY CURRENCY ===');
      console.log(`  Total in Company Currency actual  : "${totalInCompanyCurrencyActual}"`);
      console.log(`  Total in Company Currency expected: "${TOTAL_IN_COMPANY_CURRENCY}"`);

      expect(totalInCompanyCurrencyActual, `Total in Company Currency should be "${TOTAL_IN_COMPANY_CURRENCY}"`).toBe(TOTAL_IN_COMPANY_CURRENCY);

      console.log(`  ✓ Total in Company Currency = ${TOTAL_IN_COMPANY_CURRENCY} — verified`);
    });

    // Step 6: Get the status of Quotation
    let quotationStatusActual = '';
    await test.step('Step 6: Get the status of Quotation', async () => {
      console.log('=== STEP 6: GET QUOTATION STATUS ===');

      quotationStatusActual = await quotationPage.getQuotationStatus();
      console.log(`  ✓ Quotation status : ${quotationStatusActual}`);
    });

    // Step 7: Verify the status of Quotation = value of "Quotation Status"
    await test.step('Step 7: Verify the status of Quotation = value of "Quotation Status"', async () => {
      console.log('=== STEP 7: VERIFY QUOTATION STATUS ===');
      console.log(`  Quotation status actual  : "${quotationStatusActual}"`);
      console.log(`  Quotation status expected: "${QUOTATION_STATUS}"`);

      expect(quotationStatusActual, `Quotation status should be "${QUOTATION_STATUS}"`).toBe(QUOTATION_STATUS);

      console.log(`  ✓ Quotation status = ${QUOTATION_STATUS} — verified`);
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
  });
});

