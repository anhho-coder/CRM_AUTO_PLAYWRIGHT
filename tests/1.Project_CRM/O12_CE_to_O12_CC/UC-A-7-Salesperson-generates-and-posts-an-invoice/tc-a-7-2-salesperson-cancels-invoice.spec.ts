import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Invoice Cancel Test - Salesperson cancels the Invoice (single browser)
 * Test Case ID: TC.-A.7.2
 * Automation-Type: refactored
 * Automation-Date: 2026-06-05
 *
 * Summary: Verify the Salesperson can cancel the Invoice successfully.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.7\.2:" --project=chromium
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
 *    - Sales Team dropdown     = cleared
 *    - Salesperson dropdown    = cleared
 * 5. Click at "CRM Developer" tab at the bottom of page; Lead form textbox = License
 * 6. Press "SAVE" button
 * 7. Refresh page to see the "Contact" field is entered equal to the value of Contact_name#1
 * 8. Create "DEAL ELEMENT": press "DEAL ELEMENT" button
 * 9. On the "Deal Element" screen, select:
 *    - Pricelist    = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 10. At "Order Lines" section: press "Add a product", then select the first product in the dropdown
 * 11. Press "SAVE" button on the Deal Element and wait
 * 12. Press "NEW QUOTATION" button and wait
 * 13. Press "CONFIRM" button and wait to create a Sales Order
 * 14. On the "Sales Order" screen, press "CREATE INVOICE" button and wait
 * 15. On the "Invoice Order" window, press "CREATE AND VIEW INVOICES" button and wait
 * 16. Press "VALIDATE" button and wait (posts the Invoice)
 *
 * Step run:
 * 1. Press the "CANCEL" button, then press "OK" on the "Are you sure you want to cancel this invoice?" confirmation
 *
 * Verification:
 * - The Invoice is cancelled successfully (the status changes from "Open" to "Cancelled").
 */

test.describe('TC.-A.7.2 - Salesperson cancels the Invoice', () => {

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

  test('TC.-A.7.2: Verify the Salesperson can cancel the Invoice successfully', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

    // Test data captured at test scope
    const TC_ID = 'TC.-A.7.2';
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
      // The Deal Element chatter can raise an "Odoo Server Error - Missing Record" (mail.followers)
      // popup on load that intercepts clicks - clear it (retry for the delayed appearance) first.
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  - Pricelist: Public Pricelist_USD (USD)');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  - Payment Term: Immediate Payment');
    });

    // Pre-condition 10: Add the first product in Order Lines (Qty 1, under the $4k threshold -> no approval)
    await test.step('Step 10: Add the first product in Order Lines', async () => {
      console.log('Step 10: Adding the first product in Order Lines');
      await dealElementPage.dismissErrorDialog();
      // Empty product name -> the "Add a product" dropdown is opened and the first option is selected
      const added = await dealElementPage.addProduct('');
      console.log(added ? '  - First product selected' : '  - Could not add a product');
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

    // Pre-condition 13: Confirm the Quotation to a Sales Order
    await test.step('Step 13: Press CONFIRM to create a Sales Order', async () => {
      console.log('Step 13: Clicking CONFIRM (Quotation -> Sales Order)');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      // The Sales Order re-renders its chatter on confirm - clear any "Missing Record" / client-error popup.
      await quotationPage.dismissErrorDialogWithRetry();
      // Let the Sales Order state settle (CONFIRM consumed) before creating the invoice
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Sales Order created');
    });

    // Pre-condition 14: Create the Invoice from the Sales Order
    await test.step('Step 14: Press CREATE INVOICE on the Sales Order', async () => {
      console.log('Step 14: Clicking CREATE INVOICE');
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCreateInvoice();
      console.log('✓ CREATE INVOICE pressed (Invoice Order window opened)');
    });

    // Pre-condition 15: Create and view the Invoice
    await test.step('Step 15: Press CREATE AND VIEW INVOICES', async () => {
      console.log('Step 15: Clicking CREATE AND VIEW INVOICES');
      const invoiceCreationMs = await invoicePage.clickCreateAndViewInvoices();
      // The newly opened Invoice loads its own chatter - clear any "Missing Record" / client-error popup.
      await invoicePage.dismissErrorDialogWithRetry();
      console.log(`✓ Invoice created and opened (took ${(invoiceCreationMs / 1000).toFixed(1)}s)`);
    });

    // Pre-condition 16: Validate (post) the Invoice
    await test.step('Step 16: Press VALIDATE to post the Invoice', async () => {
      console.log('Step 16: Clicking VALIDATE');
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickValidate();
      console.log('✓ VALIDATE pressed (Invoice posted)');
    });

    // Step run 1: Cancel the Invoice
    await test.step('Step run 1: Press CANCEL and confirm (OK) to cancel the Invoice', async () => {
      console.log('Step run 1: Cancelling the Invoice (CANCEL -> OK on the confirmation)');
      await invoicePage.dismissErrorDialog();
      await invoicePage.clickCancelInvoice();
      // The invoice re-renders after cancelling - clear any "Missing Record" / client-error popup.
      await invoicePage.dismissErrorDialogWithRetry();
      console.log('✓ CANCEL pressed');
    });

    // Verification: the Invoice is cancelled
    await test.step('Verification: The Invoice is cancelled', async () => {
      console.log('Verification: Confirming the Invoice is cancelled');
      let status = '';
      try {
        status = await invoicePage.getInvoiceStatus();
      } catch {
        console.log('  ⚠ Could not read the Invoice status');
      }
      console.log(`  - Invoice status: "${status}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.7.2 - Invoice after CANCEL');
      // After cancelling, the statusbar should no longer read "Open" - it shows "Cancelled" in this Odoo.
      expect(
        status,
        `After cancelling, the Invoice should be "Cancelled" (was "${status}")`
      ).toMatch(/Cancel/i);
      console.log('✅ Invoice cancelled successfully');
    });
  });
});
