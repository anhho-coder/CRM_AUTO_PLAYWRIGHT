import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Invoice - Field Verification Test
 * Test Case ID: tc-verify-fields-on-Invoice
 *
 * Summary: Verify the field on Invoice page
 *
 * Command to run:
 * npx playwright test --grep "tc-verify-fields-on-Invoice" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful
 * 2. Have the following variable and their value:
 *    - Sales Order Number       = SO198100
 *    - Invoice Number           = INV/2026/1052
 *    - URL                      = http://10.220.222.100/web?debug#id=195942&action=289&active_id=72387&model=account.invoice&view_type=form&menu_id=111
 *    - Payer                    = TEST_company_name_2026-03-17-143012
 *    - End User Contact         = TEST_company_name_2026-03-17-143012
 *    - End User Email           = Test@company2026-03-17143012.com
 *    - Invoice Status           = Paid
 *    - Invoice Date             = 03/19/2026
 *    - Due Date                 = 03/19/2026
 *    - Distributor              = BLANK
 *    - Reseller                 = BLANK
 *    - Sales Team               = BLANK
 *    - Salesperson              = Ho Quoc Anh
 *    - Amount Due               = 0.00
 *
 * Steps to reproduce:
 * 1. Launch the webpage using the "URL"
 * 2. Get the value of "Invoice Number" called Invoice_Number_Contact#1
 * 3. Verify "Invoice Number" on page = value of "Invoice Number"
 * 4. Get the status of Invoice
 * 5. Verify the status of Invoice on Page = value of "Invoice Status"
 * 6. Click at "Payments" tab and verify the following:
 *    6.1 Get the value of "Total in Company Currency" called Invoice_Total_Company_Currency_Contact#1
 *    6.2 Verify "Total in Company Currency" on page = 329.00
 *    6.3 Get the value of "Payment Amount" called Invoice_Payment_Amount_Contact#1
 *    6.4 Verify "Payment Amount" on page = 329.00
 *    6.5 Get the value of "Actually Received" called Invoice_Actually_Received_Contact#1
 *    6.6 Verify "Actually Received" on page = 329.00
 * 7. Get the value of "End User"
 * 8. Verify the value of "End User" on page = value of "End User Contact"
 * 9. Click at "Other Infor" tab and verify the following:
 *    9.1 Get the value of "Source Document" called Invoice_Source_Document_Contact#1
 *    9.2 Verify value of "Source Document" on page = value of "Sales Order Number"
 * 10. Get the value of "Invoice Date" called Invoice_Date_Contact#1
 * 11. Verify "Invoice Date" on page = value of "Invoice Date"
 * 12. Get the value of "Distributor" called Invoice_Distributor_Contact#1
 * 13. Verify "Distributor" on page = value of "Distributor"
 * 14. Get the value of "Reseller" called Invoice_Reseller_Contact#1
 * 15. Verify "Reseller" on page = value of "Reseller"
 * 16. Get the value of "Sales Team" called Invoice_Sales_Team_Contact#1
 * 17. Verify "Sales Team" on page = value of "Sales Team"
 * 18. Get the value of "Salesperson" called Invoice_Salesperson_Contact#1
 * 19. Verify "Salesperson" on page = value of "Salesperson"
 * 20. Get the value of "Due Date" called Invoice_Due_Date_Contact#1
 * 21. Verify "Due Date" on page = value of "Due Date"
 * 22. Click at "Invoice Lines" tab and verify the following:
 *    22.1 Get the value of "Amount Due" called Invoice_Amount_Due_Contact#1
 *    22.2 Verify "Amount Due" on page CONTAINS value of "Amount Due"
 */

test.describe('tc-verify-fields-on-Invoice - Verify the field on Invoice page', () => {

  // Pre-condition variables
  const SALES_ORDER_NUMBER                     = 'SO198100';
  const INVOICE_NUMBER                         = 'INV/2026/1052';
  const INVOICE_URL                            = 'http://10.220.222.100/web?debug#id=195942&action=289&active_id=72387&model=account.invoice&view_type=form&menu_id=111';
  const PAYER                                  = 'TEST_company_name_2026-03-17-143012';
  const END_USER_CONTACT                       = 'TEST_company_name_2026-03-17-143012';
  const END_USER_EMAIL                         = 'Test@company2026-03-17143012.com';
  const INVOICE_STATUS                         = 'Paid';
  const INVOICE_DATE                           = '03/19/2026';
  const DUE_DATE                               = '03/19/2026';
  const DISTRIBUTOR                            = 'BLANK';
  const RESELLER                               = 'BLANK';
  const SALES_TEAM                             = 'BLANK';
  const SALESPERSON                            = 'Ho Quoc Anh';
  const AMOUNT_DUE                             = '0.00';
  const EXPECTED_AMOUNT                        = '329.00';

  const normalizeBlankValue = (value: string): string => {
    const trimmed = value.trim();
    return trimmed.toUpperCase() === 'BLANK' ? '' : trimmed;
  };

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('Verify the field on Invoice page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

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
      console.log(`  Sales Order Number           : ${SALES_ORDER_NUMBER}`);
      console.log(`  Invoice Number               : ${INVOICE_NUMBER}`);
      console.log(`  URL                          : ${INVOICE_URL}`);
      console.log(`  Payer                        : ${PAYER}`);
      console.log(`  End User Contact             : ${END_USER_CONTACT}`);
      console.log(`  End User Email               : ${END_USER_EMAIL}`);
      console.log(`  Invoice Status               : ${INVOICE_STATUS}`);
      console.log(`  Invoice Date                 : ${INVOICE_DATE}`);
      console.log(`  Due Date                     : ${DUE_DATE}`);
      console.log(`  Distributor                  : ${DISTRIBUTOR}`);
      console.log(`  Reseller                     : ${RESELLER}`);
      console.log(`  Sales Team                   : ${SALES_TEAM}`);
      console.log(`  Salesperson                  : ${SALESPERSON}`);
      console.log(`  Amount Due                   : ${AMOUNT_DUE}`);
      console.log(`  Expected Amount              : ${EXPECTED_AMOUNT}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // Step 1: Launch the webpage using the URL
    await test.step('Step 1: Launch the webpage using the URL', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO INVOICE URL ===');

      await page.goto(INVOICE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait);

      console.log(`✓ Navigated to: ${INVOICE_URL}`);
    });

    // Step 2: Get the value of Invoice Number (Invoice_Number_Contact#1)
    let invoiceNumberActual = '';
    await test.step('Step 2: Get the value of "Invoice Number" called Invoice_Number_Contact#1', async () => {
      console.log('=== STEP 2: GET INVOICE NUMBER ===');

      invoiceNumberActual = await invoicePage.getInvoiceNumber();
      console.log(`  ✓ Invoice_Number_Contact#1 : ${invoiceNumberActual}`);
    });

    // Step 3: Verify Invoice Number on page = value of Invoice Number
    await test.step('Step 3: Verify "Invoice Number" on page = value of "Invoice Number"', async () => {
      console.log('=== STEP 3: VERIFY INVOICE NUMBER ===');
      console.log(`  Invoice Number actual  : "${invoiceNumberActual}"`);
      console.log(`  Invoice Number expected: "${INVOICE_NUMBER}"`);

      expect(invoiceNumberActual, `Invoice Number should be "${INVOICE_NUMBER}"`).toBe(INVOICE_NUMBER);

      console.log(`  ✓ Invoice Number = ${INVOICE_NUMBER} — verified`);
    });

    // Step 4: Get the status of Invoice
    let invoiceStatusActual = '';
    await test.step('Step 4: Get the status of Invoice', async () => {
      console.log('=== STEP 4: GET INVOICE STATUS ===');

      invoiceStatusActual = await invoicePage.getInvoiceStatus();
      console.log(`  ✓ Invoice status : ${invoiceStatusActual}`);
    });

    // Step 5: Verify the status of Invoice on page = value of Invoice Status
    await test.step('Step 5: Verify the status of Invoice on Page = value of "Invoice Status"', async () => {
      console.log('=== STEP 5: VERIFY INVOICE STATUS ===');
      console.log(`  Invoice status actual  : "${invoiceStatusActual}"`);
      console.log(`  Invoice status expected: "${INVOICE_STATUS}"`);

      expect(invoiceStatusActual, `Invoice status should be "${INVOICE_STATUS}"`).toBe(INVOICE_STATUS);

      console.log(`  ✓ Invoice status = ${INVOICE_STATUS} — verified`);
    });

    // Step 6: Click Payments tab and verify required values
    let totalInCompanyCurrencyActual = '';
    let paymentAmountActual = '';
    let actuallyReceivedActual = '';
    await test.step('Step 6: Click at "Payments" tab and verify all required values', async () => {
      console.log('=== STEP 6: PAYMENTS TAB VERIFICATION ===');

      await invoicePage.clickPaymentsTab();

      // 6.1 + 6.2
      totalInCompanyCurrencyActual = await invoicePage.getTotalInCompanyCurrencyOnInvoice();
      console.log(`  ✓ Invoice_Total_Company_Currency_Contact#1 : "${totalInCompanyCurrencyActual}"`);
      console.log(`    Expected                                : "${EXPECTED_AMOUNT}"`);
      expect(totalInCompanyCurrencyActual, `Total in Company Currency should be "${EXPECTED_AMOUNT}"`).toBe(EXPECTED_AMOUNT);
      console.log(`  ✓ Total in Company Currency = ${EXPECTED_AMOUNT} — verified`);

      // 6.3 + 6.4
      paymentAmountActual = await invoicePage.getPaymentAmountFromPaymentsTab();
      console.log(`  ✓ Invoice_Payment_Amount_Contact#1 : "${paymentAmountActual}"`);
      console.log(`    Expected                         : "${EXPECTED_AMOUNT}"`);
      expect(paymentAmountActual, `Payment Amount should be "${EXPECTED_AMOUNT}"`).toBe(EXPECTED_AMOUNT);
      console.log(`  ✓ Payment Amount = ${EXPECTED_AMOUNT} — verified`);

      // 6.5 + 6.6
      actuallyReceivedActual = await invoicePage.getActuallyReceivedFromPaymentsTab();
      console.log(`  ✓ Invoice_Actually_Received_Contact#1 : "${actuallyReceivedActual}"`);
      console.log(`    Expected                            : "${EXPECTED_AMOUNT}"`);
      expect(actuallyReceivedActual, `Actually Received should be "${EXPECTED_AMOUNT}"`).toBe(EXPECTED_AMOUNT);
      console.log(`  ✓ Actually Received = ${EXPECTED_AMOUNT} — verified`);
    });

    // Step 7: Get the value of End User
    let endUserActual = '';
    await test.step('Step 7: Get the value of "End User"', async () => {
      console.log('=== STEP 7: GET END USER ===');

      endUserActual = await invoicePage.getEndUser();
      console.log(`  ✓ End User : ${endUserActual}`);
    });

    // Step 8: Verify End User = End User Contact
    await test.step('Step 8: Verify the value of "End User" on page = value of "End User Contact"', async () => {
      console.log('=== STEP 8: VERIFY END USER ===');
      console.log(`  End User actual  : "${endUserActual}"`);
      console.log(`  End User expected: "${END_USER_CONTACT}"`);

      expect(endUserActual, `End User should be "${END_USER_CONTACT}"`).toBe(END_USER_CONTACT);

      console.log(`  ✓ End User = ${END_USER_CONTACT} — verified`);
    });

    // Step 9: Click Other Infor tab and verify Source Document
    let sourceDocumentActual = '';
    await test.step('Step 9: Click at "Other Infor" tab and verify "Source Document"', async () => {
      console.log('=== STEP 9: OTHER INFOR TAB / SOURCE DOCUMENT ===');

      await invoicePage.clickOtherInforTab();

      sourceDocumentActual = await invoicePage.getSourceDocument();
      console.log(`  ✓ Invoice_Source_Document_Contact#1 : "${sourceDocumentActual}"`);
      console.log(`    Expected                          : "${SALES_ORDER_NUMBER}"`);

      expect(sourceDocumentActual, `Source Document should be "${SALES_ORDER_NUMBER}"`).toBe(SALES_ORDER_NUMBER);
      console.log(`  ✓ Source Document = ${SALES_ORDER_NUMBER} — verified`);
    });

    // Step 10: Get the value of Invoice Date
    let invoiceDateActual = '';
    await test.step('Step 10: Get the value of "Invoice Date" called Invoice_Date_Contact#1', async () => {
      console.log('=== STEP 10: GET INVOICE DATE ===');

      invoiceDateActual = await invoicePage.getInvoiceDate();
      console.log(`  ✓ Invoice_Date_Contact#1 : "${invoiceDateActual}"`);
    });

    // Step 11: Verify Invoice Date on page = value of Invoice Date
    await test.step('Step 11: Verify "Invoice Date" on page = value of "Invoice Date"', async () => {
      console.log('=== STEP 11: VERIFY INVOICE DATE ===');
      console.log(`  Invoice Date actual  : "${invoiceDateActual}"`);
      console.log(`  Invoice Date expected: "${INVOICE_DATE}"`);

      expect(invoiceDateActual, `Invoice Date should be "${INVOICE_DATE}"`).toBe(INVOICE_DATE);
      console.log(`  ✓ Invoice Date = ${INVOICE_DATE} — verified`);
    });

    // Step 12: Get the value of Distributor
    let distributorActual = '';
    await test.step('Step 12: Get the value of "Distributor" called Invoice_Distributor_Contact#1', async () => {
      console.log('=== STEP 12: GET DISTRIBUTOR ===');

      distributorActual = await invoicePage.getDistributor();
      console.log(`  ✓ Invoice_Distributor_Contact#1 : "${distributorActual}"`);
    });

    // Step 13: Verify Distributor on page = value of Distributor
    await test.step('Step 13: Verify "Distributor" on page = value of "Distributor"', async () => {
      console.log('=== STEP 13: VERIFY DISTRIBUTOR ===');
      const expectedDistributor = normalizeBlankValue(DISTRIBUTOR);
      console.log(`  Distributor actual  : "${distributorActual}"`);
      console.log(`  Distributor expected: "${expectedDistributor}" (from ${DISTRIBUTOR})`);

      expect(distributorActual, `Distributor should be "${expectedDistributor}"`).toBe(expectedDistributor);
      console.log(`  ✓ Distributor = "${expectedDistributor}" — verified`);
    });

    // Step 14: Get the value of Reseller
    let resellerActual = '';
    await test.step('Step 14: Get the value of "Reseller" called Invoice_Reseller_Contact#1', async () => {
      console.log('=== STEP 14: GET RESELLER ===');

      resellerActual = await invoicePage.getReseller();
      console.log(`  ✓ Invoice_Reseller_Contact#1 : "${resellerActual}"`);
    });

    // Step 15: Verify Reseller on page = value of Reseller
    await test.step('Step 15: Verify "Reseller" on page = value of "Reseller"', async () => {
      console.log('=== STEP 15: VERIFY RESELLER ===');
      const expectedReseller = normalizeBlankValue(RESELLER);
      console.log(`  Reseller actual  : "${resellerActual}"`);
      console.log(`  Reseller expected: "${expectedReseller}" (from ${RESELLER})`);

      expect(resellerActual, `Reseller should be "${expectedReseller}"`).toBe(expectedReseller);
      console.log(`  ✓ Reseller = "${expectedReseller}" — verified`);
    });

    // Step 16: Get the value of Sales Team
    let salesTeamActual = '';
    await test.step('Step 16: Get the value of "Sales Team" called Invoice_Sales_Team_Contact#1', async () => {
      console.log('=== STEP 16: GET SALES TEAM ===');

      salesTeamActual = await invoicePage.getSalesTeam();
      console.log(`  ✓ Invoice_Sales_Team_Contact#1 : "${salesTeamActual}"`);
    });

    // Step 17: Verify Sales Team on page = value of Sales Team
    await test.step('Step 17: Verify "Sales Team" on page = value of "Sales Team"', async () => {
      console.log('=== STEP 17: VERIFY SALES TEAM ===');
      const expectedSalesTeam = normalizeBlankValue(SALES_TEAM);
      console.log(`  Sales Team actual  : "${salesTeamActual}"`);
      console.log(`  Sales Team expected: "${expectedSalesTeam}" (from ${SALES_TEAM})`);

      expect(salesTeamActual, `Sales Team should be "${expectedSalesTeam}"`).toBe(expectedSalesTeam);
      console.log(`  ✓ Sales Team = "${expectedSalesTeam}" — verified`);
    });

    // Step 18: Get the value of Salesperson
    let salespersonActual = '';
    await test.step('Step 18: Get the value of "Salesperson" called Invoice_Salesperson_Contact#1', async () => {
      console.log('=== STEP 18: GET SALESPERSON ===');

      salespersonActual = await invoicePage.getSalesperson();
      console.log(`  ✓ Invoice_Salesperson_Contact#1 : "${salespersonActual}"`);
    });

    // Step 19: Verify Salesperson on page = value of Salesperson
    await test.step('Step 19: Verify "Salesperson" on page = value of "Salesperson"', async () => {
      console.log('=== STEP 19: VERIFY SALESPERSON ===');
      console.log(`  Salesperson actual  : "${salespersonActual}"`);
      console.log(`  Salesperson expected: "${SALESPERSON}"`);

      expect(salespersonActual, `Salesperson should be "${SALESPERSON}"`).toBe(SALESPERSON);
      console.log(`  ✓ Salesperson = "${SALESPERSON}" — verified`);
    });

    // Step 20: Get the value of Due Date
    let dueDateActual = '';
    await test.step('Step 20: Get the value of "Due Date" called Invoice_Due_Date_Contact#1', async () => {
      console.log('=== STEP 20: GET DUE DATE ===');

      dueDateActual = await invoicePage.getDueDate();
      console.log(`  ✓ Invoice_Due_Date_Contact#1 : "${dueDateActual}"`);
    });

    // Step 21: Verify Due Date on page = value of Due Date
    await test.step('Step 21: Verify "Due Date" on page = value of "Due Date"', async () => {
      console.log('=== STEP 21: VERIFY DUE DATE ===');
      console.log(`  Due Date actual  : "${dueDateActual}"`);
      console.log(`  Due Date expected: "${DUE_DATE}"`);

      expect(dueDateActual, `Due Date should be "${DUE_DATE}"`).toBe(DUE_DATE);
      console.log(`  ✓ Due Date = "${DUE_DATE}" — verified`);
    });

    // Step 22: Click Invoice Lines tab and verify Amount Due
    let amountDueActual = '';
    await test.step('Step 22: Click at "Invoice Lines" tab and verify "Amount Due"', async () => {
      console.log('=== STEP 22: INVOICE LINES TAB / AMOUNT DUE ===');

      await invoicePage.clickInvoiceLinesTab();

      // 22.1 Get the value of Amount Due
      amountDueActual = await invoicePage.getAmountDue();
      console.log(`  ✓ Invoice_Amount_Due_Contact#1 : "${amountDueActual}"`);
      console.log(`    Expected                      : "${AMOUNT_DUE}"`);

      // 22.2 Verify Amount Due on page CONTAINS value of Amount Due
      expect(amountDueActual, `Amount Due should contain "${AMOUNT_DUE}"`).toContain(AMOUNT_DUE);
      console.log(`  ✓ Amount Due contains "${AMOUNT_DUE}" — verified`);
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');
  });
});
