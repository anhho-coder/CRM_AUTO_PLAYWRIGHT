import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation Confirmation Test - Salesperson directly confirms an under-$4k Quotation (no approval)
 * Test Case ID: TC.-A.6.4
 *
 * Summary: Verify the Salesperson can confirm a Quotation under the $4k approval threshold directly
 *          to a Sales Order, without requiring Sales Manager approval.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.6\.4:" --project=chromium
 *
 * Pre-condition / Steps (Salesperson "Thomas" - single browser):
 * 1. Use the account of Thomas to login successful
 * 2. After login successful, click at "CRM" button; on "CRM" page, click at "view list" button
 * 3. On "Opp" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Opp name textbox      = TEST + current date time
 *    - Contact name textbox  = TEST + Test Case ID + current date time (captured as Contact_name#1)
 *    - Email textbox         = Company email (Test@company + current date + current time .com) (in the Address section)
 *    - Country dropdown      = United States
 *    - State dropdown        = Connecticut
 *    - Sales Team dropdown   = cleared
 *    - Salesperson dropdown  = cleared
 * 5. Click at "CRM Developer" tab at the bottom of page; Lead form textbox = License
 * 6. Press "SAVE" button
 * 7. Refresh page to see the "Contact" field is entered equal to the value of Contact_name#1
 * 8. Create "DEAL ELEMENT": press "DEAL ELEMENT" button
 * 9. On the "Deal Element" screen, select:
 *    - Pricelist    = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 10. At "Order Lines" section: press "Add a product", select the first product (Ordered Qty = 1)
 *     (this keeps the Quotation total BELOW the > $4k approval threshold - no manager approval required)
 * 11. Press "SAVE" button on the Deal Element and wait
 * 12. Press "NEW QUOTATION" button and wait
 *
 * Step run:
 * 1. (Thomas) Press the "CONFIRM" button directly (no "TO APPROVE" / no manager approval needed)
 *
 * Verification:
 * - The under-$4k Quotation is confirmed directly to a Sales Order by the Salesperson: status
 *   becomes "Sales Order", the CONFIRM button disappears and the LOCK button appears.
 */

test.describe('TC.-A.6.4 - Salesperson confirms an under-$4k Quotation without approval', () => {

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

  test('TC.-A.6.4: Verify the Salesperson can confirm an under-$4k Quotation to a Sales Order without approval', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    // Test data captured at test scope
    const TC_ID = 'TC.-A.6.4';
    let contactName1 = '';

    // Pre-condition 1: Login as Thomas and open CRM
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
      const oppName = opportunityPage.generateOpportunityName('TEST');
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

    // Pre-condition 10: Add the first product with Ordered Qty = 1 (keeps total below the $4k threshold)
    await test.step('Step 10: Add the first product (Ordered Qty = 1, under the $4k threshold)', async () => {
      console.log('Step 10: Adding the first product in Order Lines (Qty 1, under the $4k approval threshold)');
      const added = await dealElementPage.addProduct('');
      console.log(added ? '  - First product selected (Qty 1)' : '  - Could not add a product');
    });

    // Pre-condition 11: Save the Deal Element
    await test.step('Step 11: Save the Deal Element', async () => {
      console.log('Step 11: Saving the Deal Element');
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      console.log('✓ Deal Element saved successfully');
    });

    // Pre-condition 12: Create the Quotation (NEW QUOTATION)
    await test.step('Step 12: Press NEW QUOTATION', async () => {
      console.log('Step 12: Clicking NEW QUOTATION');
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation created');
    });

    // Step run 1: Press CONFIRM directly (no manager approval is required below $4k)
    await test.step('Step run 1: Press CONFIRM to confirm the under-$4k Quotation to a Sales Order', async () => {
      console.log('Step run 1: Pressing CONFIRM (no approval required below $4k)');
      await quotationPage.clickConfirm();
      console.log('✓ CONFIRM pressed');
      // Clear any "Odoo Client Error" popup that may surface around CONFIRM, then reload to reflect
      // the committed Sales Order state and clear the popup again if it reappears on load.
      await quotationPage.dismissErrorDialogWithRetry();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

      // Verification: the Quotation is confirmed directly to a Sales Order
      console.log('Verification: Confirming the under-$4k Quotation became a Sales Order without approval');
      const result = await quotationPage.verifyConfirmedToSalesOrder();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.6.4 - Under-$4k Quotation confirmed to Sales Order');
      expect(
        result.confirmed,
        'The under-$4k Quotation should be confirmed directly to a Sales Order (status "Sales Order", or CONFIRM gone and LOCK visible) without manager approval'
      ).toBeTruthy();
      console.log('✅ Under-$4k Quotation confirmed to a Sales Order without approval');
    });
  });
});
