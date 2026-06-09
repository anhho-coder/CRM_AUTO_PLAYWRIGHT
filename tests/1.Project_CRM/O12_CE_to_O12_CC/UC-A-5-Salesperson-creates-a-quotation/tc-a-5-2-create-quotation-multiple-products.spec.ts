import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation Creation Test - Salesperson creates a Quotation with MULTIPLE products
 * Test Case ID: TC.-A.5.2
 *
 * Summary: Verify the Salesperson creates a Quotation with multiple order-line products successfully.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.5\.2:" --project=chromium
 *
 * Pre-condition / Steps:
 * 1. Use the account of Thomas to login successful
 * 2. After login successful, click at "CRM" button; on "CRM" page, click at "view list" button
 * 3. On "Opp" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Opp name textbox      = TEST + Test Case ID + current date time
 *    - Contact name textbox  = TEST + Test Case ID + current date time (captured as Contact_name#1)
 *    - Email textbox         = Company email (Test@company + current date + current time .com) (in the Address section)
 *    - Country dropdown      = United States
 *    - State dropdown        = Connecticut
 *    - Sales Team dropdown     = cleared
 *    - Salesperson dropdown    = cleared
 * 5. Click at "CRM Developer" tab at the bottom of page; Lead form textbox = License
 * 6. Press "SAVE" button
 * 7. Refresh page to see the "Contact" field is entered equal to the value of Contact_name#1
 * 8. Create "DEAL ELEMENT": press "DEAL ELEMENT" button
 * 9. On the "Deal Element" screen, select:
 *    - Pricelist    = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 10. At "Order Lines" section: add TWO products - [A2144B] (Qty 1) and [A2145B] (Qty 1)
 * 11. Press "SAVE" button on the Deal Element and wait
 * 12. Verify the Deal Element has both order lines (line count >= 2, total > 0)
 *
 * Step run:
 * 1. Press "NEW QUOTATION" button on the Deal Element
 *
 * Verification:
 * - The Quotation (Sale Order) is created successfully with the multiple order lines, logged in the
 *   Deal Element chatter ("Sale Order created" plus the new record's "Status: Quotation").
 */

test.describe('TC.-A.5.2 - Salesperson creates a Quotation with multiple products', () => {

  test.beforeEach(async ({ context, page }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - stabilizing page before screenshot...');
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('TC.-A.5.2: Verify the Salesperson creates a Quotation with multiple products successfully', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    // Test data (captured at test scope for the Step 7 Contact-field verification)
    const TC_ID = 'TC.-A.5.2';
    let contactName1 = '';

    // Pre-condition 1-2: Login as Thomas and open CRM
    await test.step('Step 1: Login as Thomas and open CRM', async () => {
      console.log(`Step 1: Logging in as ${users.sale_ic_thomas.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      console.log('✓ Logged in and CRM opened');
    });

    // Pre-condition 2: Switch to the Opportunities list view
    await test.step('Step 2: Switch to the Opportunities list view', async () => {
      console.log('Step 2: Switching to list view');
      await opportunityPage.switchToListView();
      console.log('✓ Opportunity list view opened');
    });

    // Pre-condition 3: Open the create form
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opportunity creation form opened');
    });

    // Pre-condition 4: Enter the opportunity information
    await test.step('Step 4: Enter opportunity information', async () => {
      const oppName = opportunityPage.generateOpportunityName(`TEST ${TC_ID} `);
      contactName1 = opportunityPage.generateOpportunityName(`TEST ${TC_ID} `);
      const emailAddress = opportunityPage.generateEmail('Test@company');
      console.log('Step 4: Entering opportunity information');
      console.log(`  - Opportunity Name: ${oppName}`);
      console.log(`  - Contact Name (Contact_name#1): ${contactName1}`);
      console.log(`  - Email: ${emailAddress}`);
      await opportunityPage.fillOpportunityName(oppName);
      const contactNameFilled = await opportunityPage.fillContactName(contactName1);
      console.log(contactNameFilled ? '  - Contact Name: Filled' : '  - Contact Name: Field not found, skipping');
      await opportunityPage.fillEmail(emailAddress);
      await opportunityPage.selectCountry('United States');
      await opportunityPage.selectState('Connecticut');
      const salesTeamCleared = await opportunityPage.clearSalesTeam();
      console.log(salesTeamCleared ? '  - Sales Team: Cleared' : '  - Sales Team: Field not found, skipping');
      const salespersonCleared = await opportunityPage.clearSalesperson();
      console.log(salespersonCleared ? '  - Salesperson: Cleared' : '  - Salesperson: Field not found, skipping');
    });

    // Pre-condition 5: CRM Developer tab -> Lead form = License
    await test.step('Step 5: Set Lead form to License (CRM Developer tab)', async () => {
      console.log('Step 5: Filling CRM Developer tab');
      await opportunityPage.clickCRMDeveloperTab();
      const leadFormFilled = await opportunityPage.fillLeadForm('License');
      console.log(leadFormFilled ? '  - Lead Form: License' : '  - Lead Form: Field not found, skipping');
    });

    // Pre-condition 6: Save the opportunity
    await test.step('Step 6: Save the opportunity', async () => {
      console.log('Step 6: Saving the opportunity');
      await opportunityPage.saveAndWaitForCompletion();
      console.log('✓ Opportunity saved successfully');
    });

    // Pre-condition 7: Refresh and verify the Contact field equals Contact_name#1
    await test.step('Step 7: Refresh and verify the Contact field equals Contact_name#1', async () => {
      console.log('Step 7: Refreshing page and verifying the Contact field equals Contact_name#1');
      console.log(`  - Expected Contact (Contact_name#1): "${contactName1}"`);
      const { contactFieldFound, contactValue } = await opportunityPage.waitForContactFieldEquals(contactName1);
      console.log(`  - Contact field value: "${contactValue}"`);
      expect(
        contactFieldFound,
        `The "Contact" field should equal Contact_name#1 ("${contactName1}") after the async Contact creation`
      ).toBeTruthy();
      console.log('✓ Contact field equals Contact_name#1');
    });

    // Pre-condition 8: Open the Deal Element
    await test.step('Step 8: Click DEAL ELEMENT', async () => {
      console.log('Step 8: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element form opened');
    });

    // Pre-condition 9: Pricelist + Payment Term
    await test.step('Step 9: Set Pricelist and Payment Term on the Deal Element', async () => {
      console.log('Step 9: Filling Deal Element information');
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  - Pricelist: Public Pricelist_USD (USD)');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  - Payment Term: Immediate Payment');
    });

    // Pre-condition 10: Add TWO products in Order Lines
    await test.step('Step 10: Add two products in Order Lines', async () => {
      console.log('Step 10: Adding two products in Order Lines');
      await dealElementPage.addProductLine('[A2144B]', 1);
      console.log('  - Product 1 added: [A2144B] (Qty 1)');
      await dealElementPage.addProductLine('[A2145B]', 1);
      console.log('  - Product 2 added: [A2145B] (Qty 1)');
    });

    // Pre-condition 11: Save the Deal Element
    await test.step('Step 11: Save the Deal Element', async () => {
      console.log('Step 11: Saving the Deal Element');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('✓ Deal Element saved successfully');
    });

    // Pre-condition 12: Verify both order lines are present on the Deal Element
    await test.step('Step 12: Verify the Deal Element has both order lines', async () => {
      console.log('Step 12: Verifying the order lines on the Deal Element');
      const lineCount = await dealElementPage.getOrderLineCount();
      const total = await dealElementPage.getOrderLinesTotal();
      console.log(`  - Order line count: ${lineCount}`);
      console.log(`  - Order lines total: ${total}`);
      expect(lineCount, 'The Deal Element should have at least 2 order lines (two products)').toBeGreaterThanOrEqual(2);
      expect(total, 'The order-lines total should be greater than 0').toBeGreaterThan(0);
      console.log('✓ Both products are present on the Deal Element');
    });

    // Step run 1: Press "NEW QUOTATION" on the Deal Element
    await test.step('Step run 1: Press NEW QUOTATION', async () => {
      console.log('Step run 1: Clicking NEW QUOTATION');
      const hasButton = await opportunityPage.hasNewQuotationButton();
      expect(hasButton, '"NEW QUOTATION" button should be available after the Deal Element is saved').toBeTruthy();
      await opportunityPage.clickNewQuotation();
      console.log('✓ NEW QUOTATION pressed');
    });

    // Verification: the Quotation (Sale Order) is created successfully
    await test.step('Verification: The Quotation is created successfully', async () => {
      console.log('Verification: Confirming the Quotation (Sale Order) was created');
      const { found, chatterText } = await dealElementPage.waitForQuotationCreatedInChatter();
      console.log(`  - Quotation creation logged in chatter: ${found}`);
      console.log(`  - Chatter (first 300 chars): "${chatterText.substring(0, 300)}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.5.2 - Quotation created with multiple products (Deal Element chatter)');
      expect(found, 'The Quotation (Sale Order) should be created and logged in the Deal Element chatter ("Sale Order created" / "Status: Quotation")').toBeTruthy();
      expect(chatterText, 'The Deal Element chatter should reflect the created record\'s "Quotation" status').toContain('Quotation');
      console.log('✅ Quotation created successfully with multiple products');
    });
  });
});
