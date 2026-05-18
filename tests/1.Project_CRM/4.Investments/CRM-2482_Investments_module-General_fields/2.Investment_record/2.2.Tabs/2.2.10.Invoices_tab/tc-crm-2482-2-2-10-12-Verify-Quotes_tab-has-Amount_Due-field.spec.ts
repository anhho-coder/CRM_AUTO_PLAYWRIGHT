import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Investments - Quotes Tab Verification Test
 * Test Case ID: CRM-2482_2.2.10.12
 *
 * Summary: Verify the Invoices tab of an Investment record includes "Amount Due" field
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_2\.2\.10\.12" --project=chromium
 *
 * Pre-condition:
 * I. Create Investment#1 and import audiences:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox        = TEST Investment + current date time
 *    - "Investment ID" textbox          = TEST-Investment-current date time
 *    - "Type" combobox                  = Webinar
 *    - "Channel" combobox               = Channel (search name of CMR in channel field)
 *    - "Countries" combobox             = Albania
 *    - "Date start" date                = current date
 *    - "Date end" date                  = current date
 *    - "Responsible - Sales" combobox   = Aleksey Galbur
 *    - "Responsible - Marketing" combobox = Nadiia Suprun
 *    - "NBR Product List" combobox      = M365
 *    - "Completion Events" combobox     = Attended webinar
 *    - "Conversion Events" combobox     = Download free trial
 *    - "Track conversion date start" date = current date
 *    - "Track conversion date end" date   = current date + 6 months
 * 5. Create an Import Audience file by doing the following:
 *    5.1. Create the test data with the following information:
 *         - "Contact Name" = TEST_first_name-TEST_last_name + current date time
 *         - "Email" = use the template: Test@company + current date + current time.com
 *           (Remember the created email, called Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = test
 *         - "Investment ID" = test
 *    5.2. Use the template CSV file "CSV-AudienceTemplate-1.csv" in folder "CRM_AUTO\test-data\investment-module"
 *    5.3. Create another CSV file (named CSV-Audience-copy1) and put the data at Step#1 to respective columns:
 *         - "Contact Name" = TEST_first_name-TEST_last_name + current date time
 *         - "Email" = Test@company + current date + current time.com  (Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = test
 *         - "Investment ID" = test
 *    5.4. Save the file in folder "CRM_AUTO\test-data\investment-module"
 * 6. Import a Company from CSV-Audience-copy1 file
 * 7. Copy the current URL called URL_Investment#1
 * 8. Press "Application" button to back to Home page
 *
 * II. Create Quotation:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Search" textbox, remove "My Pipeline" and wait
 * 4. On "Search" textbox, enter value of "Company Email" then enter to start to search
 * 5. On "Opp" page, click at the line of "Email" = value of "Email_Contact#1"
 * 6. On "Opp" page, press "DEAL ELEMENT" button
 * 7. Once the "Deal Element" screen shows up select the following:
 *    - Pricelist = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 8. At "Order Lines" section:
 *    - Press "Add a product" link, when a dropdown list of "Product" displays, select the first one
 * 9. Finally, press "SAVE" button on the top page and wait
 * 10. Press "NEW QUOTATION" button and wait
 * 11. Press "CONFIRM" button and wait to create a Sales Order
 * 12. On "Sales Order" screen, press "CREATE INVOICE" button and wait
 * 13. On "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait
 * 14. Press "VALIDATE" button and wait
 * 15. Press "REGISTER PAYMENT" button and wait
 * 16. Once, "Register Payment" screen appears then:
 *     - Get the number from "Payment Amount" field called Payment_Amount_Contact#1
 * 17. Then set:
 *     - "Actually Received($)" = value of Payment_Amount_Contact#1
 * 18. Press "VALIDATE" button and wait
 * 19. Click at "Invoice Lines" tab and verify the following:
 *     19.1. Get the value of "Amount Due" called Invoice_Amount_Due_Contact#1
 *
 * Steps to reproduce:
 * 1. Launch the webpage with URL_Investment#1
 * 2. Click at "Invoice" tab
 * 3. Verify the following:
 *    3.1. Value at "Amount Due" row CONTAINS value of Invoice_Amount_Due_Contact#1
 *
 * Tear down (Clean up test data):
 * 1. Delete Investment item has just created by doing the following steps:
 *    1.1. Select "Action" dropdown list on header of page
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" button on "Are you sure you want to delete this record?" window
 * 2. Delete CSV file (CSV-Audience-copy1) has just created
 */

test.describe('CRM-2482_2.2.10.12 - Verify the Invoices tab of an Investment record includes "Amount Due" field = Invoice_Amount_Due_Contact#1', () => {

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

  test('CRM-2482_2.2.10.12: Verify the Invoices tab of an Investment record includes "Amount Due" field = Invoice_Amount_Due_Contact#1', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDate = `${mm}/${dd}/${yyyy}`;
    const currentDateForID = `${yyyy}-${mm}-${dd}`;

    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const smYYYY = sixMonthsLater.getFullYear();
    const smMM = String(sixMonthsLater.getMonth() + 1).padStart(2, '0');
    const smDD = String(sixMonthsLater.getDate()).padStart(2, '0');
    const dateEndPlus6Months = `${smMM}/${smDD}/${smYYYY}`;

    const investmentName = `TEST Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

    // Variables to hold Investment URL and values for verification
    let investmentUrl = '';
    let paymentAmountContact1 = '';
    let invoiceAmountDue = '';

    // ===== PRE-CONDITION I: Create Investment#1 and import audiences =====

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

    // Pre-condition I.4: Create a blank Investment
    await test.step('Pre-condition I.4: Create a blank Investment', async () => {
      console.log('=== PRE-CONDITION I.4: CREATE A BLANK INVESTMENT ===');

      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
        type: 'Webinar',
        channel: 'Channel',
        countries: 'Albania',
        dateStart: currentDate,
        dateEnd: currentDate,
        responsibleSales: 'Aleksey Galbur',
        responsibleMarketing: 'Nadiia Suprun',
        nbrProductList: 'M365',
        completionEvents: 'Attended webinar',
        conversionEvents: 'Download free trial',
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });

      console.log('✓ Investment record created and saved successfully');
      console.log(`✓ Investment Name: ${investmentName}`);
      console.log(`✓ Investment ID  : ${investmentID}`);
    });

    // ---- Pre-condition I.5: Create an Import Audience file ----
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Pre-condition I.5: Create an Import Audience file (CSV-Audience-copy1.csv)', async () => {
      console.log('=== PRE-CONDITION I.5: CREATE IMPORT AUDIENCE FILE ===');

      audienceData = await investmentPage.createImportAudienceFile({ investmentId: 'test' });

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);

      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');
      console.log(`  ✓ Email_Contact#1 : ${audienceData.emailContact1}`);
    });

    console.log('\n✅ PRE-CONDITION I.5 COMPLETED SUCCESSFULLY');

    // Pre-condition I.6: Import a Company from CSV-Audience-copy1 file
    await test.step('Pre-condition I.6: Import Company audience from CSV-Audience-copy1 file', async () => {
      console.log('\n=== PRE-CONDITION I.6: IMPORT COMPANY AUDIENCE ===');

      await investmentPage.importCompanyAudience(audienceData.outputPath);

      console.log(`✓ Audience CSV imported and record saved: ${audienceData.outputPath}`);
    });

    // Pre-condition I.7: Copy the current Investment URL
    await test.step('Pre-condition I.7: Copy URL_Investment#1', async () => {
      console.log('=== PRE-CONDITION I.7: SAVE INVESTMENT URL ===');

      investmentUrl = page.url();
      console.log(`  ✓ URL_Investment#1 saved: ${investmentUrl}`);
    });

    // Pre-condition I.8: Press "Application" button to back to Home page
    await test.step('Pre-condition I.8: Press "Application" button to back to Home page', async () => {
      console.log('=== PRE-CONDITION I.8: NAVIGATE BACK TO HOME ===');

      await homePage.returnToHome();

      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ PRE-CONDITION I COMPLETED SUCCESSFULLY');

    // ===== PRE-CONDITION II: Create Quotation =====

    // Pre-condition II.1: Click at "CRM" button
    await test.step('Pre-condition II.1: Click at "CRM" button', async () => {
      console.log('\n=== PRE-CONDITION II.1: NAVIGATE TO CRM ===');

      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to CRM module');
    });

    // Pre-condition II.2: Switch to list view
    await test.step('Pre-condition II.2: Click at "view list" button', async () => {
      console.log('=== PRE-CONDITION II.2: SWITCH TO LIST VIEW ===');

      await opportunityPage.switchToListView();

      console.log('✓ Switched to list view');
    });

    // Pre-condition II.3: Remove "My Pipeline" filter
    await test.step('Pre-condition II.3: Remove "My Pipeline" from Search textbox and wait', async () => {
      console.log('=== PRE-CONDITION II.3: REMOVE MY PIPELINE FILTER ===');

      await opportunityPage.removeMyPipelineFilter();

      console.log('✓ "My Pipeline" filter removed');
    });

    // Pre-condition II.4: Search by Email_Contact#1
    await test.step('Pre-condition II.4: Enter Email_Contact#1 in Search textbox and press Enter', async () => {
      console.log('=== PRE-CONDITION II.4: SEARCH BY EMAIL ===');

      await opportunityPage.searchByEmail(audienceData.emailContact1);

      console.log(`✓ Searched for email: ${audienceData.emailContact1}`);
    });

    // Pre-condition II.5: Click the Opportunity row matching Email_Contact#1
    await test.step('Pre-condition II.5: Click the row where Email = Email_Contact#1', async () => {
      console.log('=== PRE-CONDITION II.5: CLICK OPPORTUNITY ROW ===');

      await opportunityPage.clickOppRowByEmail(audienceData.emailContact1);

      console.log(`✓ Clicked Opportunity row matching email: ${audienceData.emailContact1}`);
    });

    // Pre-condition II.6: Press "DEAL ELEMENT" button
    await test.step('Pre-condition II.6: Press "DEAL ELEMENT" button', async () => {
      console.log('=== PRE-CONDITION II.6: CLICK DEAL ELEMENT ===');

      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();

      console.log('✓ Deal Element form opened');
    });

    // Pre-condition II.7: Select Pricelist and Payment Term
    await test.step('Pre-condition II.7: Select Pricelist = "Public Pricelist_USD (USD)" and Payment Term = "Immediate Payment"', async () => {
      console.log('=== PRE-CONDITION II.7: FILL DEAL ELEMENT INFO ===');

      await dealElementPage.waitForAutoPopulate();
      console.log('  - Auto-populate fields loaded');

      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  - Pricelist: Public Pricelist_USD');

      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  - Payment Term: Immediate Payment');

      console.log('✓ Pricelist and Payment Term selected');
    });

    // Pre-condition II.8: Add a product in Order Lines section
    await test.step('Pre-condition II.8: Add a product at the "Order Lines" section', async () => {
      console.log('=== PRE-CONDITION II.8: ADD PRODUCT ===');

      await dealElementPage.addProductLineWithQuantity('', CommonUtils.waitTimes.selectProductLine);

      console.log('✓ Product added to Order Lines');
    });

    // Pre-condition II.9: Save Deal Element
    await test.step('Pre-condition II.9: Press SAVE button and wait', async () => {
      console.log('=== PRE-CONDITION II.9: SAVE DEAL ELEMENT ===');

      await dealElementPage.save(CommonUtils.waitTimes.savingPage);

      console.log('✓ Deal Element saved');
    });

    // Pre-condition II.10: Press "NEW QUOTATION" button
    await test.step('Pre-condition II.10: Press "NEW QUOTATION" button and wait', async () => {
      console.log('=== PRE-CONDITION II.10: CLICK NEW QUOTATION ===');

      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);

      console.log('✓ New Quotation created and page loaded');
    });

    // Pre-condition II.11: Press "CONFIRM" button and wait
    await test.step('Pre-condition II.11: Press "CONFIRM" button and wait to create a Sales Order', async () => {
      console.log('=== PRE-CONDITION II.11: CLICK CONFIRM ===');

      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.clickConfirm();
      await quotationPage.waitForConfirmButtonToDisappear();

      console.log('✓ CONFIRM clicked — Sales Order created');
    });

    // Pre-condition II.12: Press "CREATE INVOICE" button
    await test.step('Pre-condition II.12: Press "CREATE INVOICE" button and wait', async () => {
      console.log('=== PRE-CONDITION II.12: CLICK CREATE INVOICE ===');

      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await invoicePage.clickCreateInvoice();

      console.log('✓ "CREATE INVOICE" button clicked — Invoice Order dialog appeared');
    });

    // Pre-condition II.13: Press "CREATE AND VIEW INVOICES" button
    await test.step('Pre-condition II.13: Press "CREATE AND VIEW INVOICES" button and wait', async () => {
      console.log('=== PRE-CONDITION II.13: CLICK CREATE AND VIEW INVOICES ===');

      await invoicePage.clickCreateAndViewInvoices();

      console.log('✓ Invoice created and page loaded');
    });

    // Pre-condition II.14: Press "VALIDATE" button
    await test.step('Pre-condition II.14: Press "VALIDATE" button and wait', async () => {
      console.log('=== PRE-CONDITION II.14: CLICK VALIDATE ===');

      await invoicePage.clickValidate();

      console.log('✓ Invoice validated');
    });

    // Pre-condition II.15: Press "REGISTER PAYMENT" button
    await test.step('Pre-condition II.15: Press "REGISTER PAYMENT" button and wait', async () => {
      console.log('=== PRE-CONDITION II.15: CLICK REGISTER PAYMENT ===');

      await invoicePage.clickRegisterPayment();

      console.log('✓ Register Payment dialog appeared');
    });

    // Pre-condition II.16: Get Payment Amount (Payment_Amount_Contact#1)
    await test.step('Pre-condition II.16: Get "Payment Amount" value (Payment_Amount_Contact#1)', async () => {
      console.log('=== PRE-CONDITION II.16: GET PAYMENT AMOUNT ===');

      paymentAmountContact1 = await invoicePage.getPaymentAmount();
      console.log(`  ✓ Payment_Amount_Contact#1 : ${paymentAmountContact1}`);
    });

    // Pre-condition II.17: Set "Actually Received($)" = Payment_Amount_Contact#1
    await test.step('Pre-condition II.17: Set "Actually Received($)" = Payment_Amount_Contact#1', async () => {
      console.log('=== PRE-CONDITION II.17: FILL ACTUALLY RECEIVED ===');

      await invoicePage.fillActuallyReceived(paymentAmountContact1);

      console.log(`  ✓ "Actually Received($)" set to: ${paymentAmountContact1}`);
    });

    // Pre-condition II.18: Press "VALIDATE" button in Register Payment screen
    await test.step('Pre-condition II.18: Press "VALIDATE" button in Register Payment screen and wait', async () => {
      console.log('=== PRE-CONDITION II.18: CLICK VALIDATE (REGISTER PAYMENT) ===');

      await invoicePage.clickValidate_RegisterPayment();

      console.log('✓ Payment validated — Invoice marked as paid');
    });

    // Pre-condition II.19: Click at "Invoice Lines" tab and get "Amount Due" (Invoice_Amount_Due_Contact#1)
    await test.step('Pre-condition II.19: Click at "Invoice Lines" tab and get "Amount Due" (Invoice_Amount_Due_Contact#1)', async () => {
      console.log('=== PRE-CONDITION II.19: GET AMOUNT DUE FROM INVOICE LINES TAB ===');

      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await invoicePage.clickInvoiceLinesTab();
      invoiceAmountDue = await invoicePage.getAmountDue();

      console.log(`  ✓ Invoice_Amount_Due_Contact#1 : "${invoiceAmountDue}"`);
    });

    console.log('\n✅ PRE-CONDITION II COMPLETED SUCCESSFULLY');

    // ===== STEPS TO REPRODUCE =====

    // Step 1: Navigate to URL_Investment#1
    await test.step('Step 1: Launch the webpage with URL_Investment#1', async () => {
      console.log('\n=== STEP 1: NAVIGATE TO INVESTMENT RECORD ===');
      console.log(`  - Navigating to: ${investmentUrl}`);

      await page.goto(investmentUrl);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investment record (URL_Investment#1)');
    });

    // Step 2: Click "Invoice" tab
    await test.step('Step 2: Click at "Invoice" tab', async () => {
      console.log('=== STEP 2: CLICK INVOICES TAB ===');

      await investmentPage.clickInvoicesTab();

      console.log('✓ Invoices tab clicked');
    });

    // Step 3: Verify Amount Due CONTAINS Invoice_Amount_Due_Contact#1
    await test.step('Step 3: Verify "Amount Due" row CONTAINS value of Invoice_Amount_Due_Contact#1', async () => {
      console.log('=== STEP 3: VERIFY AMOUNT DUE VALUE ===');

      const MAX_RETRIES = 5;
      const RETRY_INTERVAL_MS = 3000;
      let actualValue = '';

      // Strip currency symbols/prefixes (e.g. "$ 0.00" → "0.00") for cross-view comparison
      const numericExpected = invoiceAmountDue.replace(/[^0-9.,]/g, '').trim();
      console.log(`  3.1 Amount Due expected (raw): "${invoiceAmountDue}" → numeric: "${numericExpected}"`);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        actualValue = await investmentPage.getInvoicesFirstRowCellText('Amount Due');
        console.log(`  3.1 Attempt ${attempt}/${MAX_RETRIES} — Amount Due actual  : "${actualValue}"`);
        console.log(`  3.1 Attempt ${attempt}/${MAX_RETRIES} — Amount Due expected to contain: "${numericExpected}" (Invoice_Amount_Due_Contact#1)`);

        if (actualValue.includes(numericExpected)) break;

        if (attempt < MAX_RETRIES) {
          console.log(`  ⚠ Values do not match — refreshing page in ${RETRY_INTERVAL_MS / 1000}s...`);
          await page.waitForTimeout(RETRY_INTERVAL_MS);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(CommonUtils.waitTimes.standard);
          await investmentPage.clickInvoicesTab();
        }
      }

      expect(actualValue, 'Step 3.1: "Amount Due" in Invoices tab should contain Invoice_Amount_Due_Contact#1').toContain(numericExpected);

      console.log(`  ✓ 3.1 Amount Due contains "${numericExpected}" — verified`);
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // ---- Tear Down ----
    await test.step('Tear Down: Delete Investment record and CSV file', async () => {
      console.log('\n=== TEAR DOWN ===');

      // Navigate back to investment record if not already there
      if (!page.url().includes(investmentUrl)) {
        await page.goto(investmentUrl);
        await page.waitForTimeout(CommonUtils.waitTimes.long);
      }

      // Delete the Investment record
      await investmentPage.deleteCurrentRecord();
      console.log(`✓ Investment record deleted: ${investmentName}`);

      // Delete the generated CSV file
      if (audienceData?.outputPath && fs.existsSync(audienceData.outputPath)) {
        fs.unlinkSync(audienceData.outputPath);
        console.log(`✓ CSV file deleted: ${audienceData.outputPath}`);
      }

      console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
    });
  });
});
