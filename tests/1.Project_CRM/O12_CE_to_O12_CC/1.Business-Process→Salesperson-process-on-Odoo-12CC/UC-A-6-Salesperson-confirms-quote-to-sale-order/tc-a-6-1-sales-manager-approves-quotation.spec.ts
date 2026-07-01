import { test, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation Approval Test - Sales Manager approves a Quotation (two browsers)
 * Test Case ID: TC.-A.6.1
 *
 * Summary: Verify the Sales Manager can approve the Quotation successfully.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.6\.1:" --project=chromium
 *
 * Pre-condition / Steps (Salesperson "Thomas" - browser #1):
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
 * 10. At "Order Lines" section: press "Add a product", select the first product, then set Ordered Qty = 30
 *     (this pushes the Quotation total above the > $4k approval threshold, triggering the approval rule)
 * 11. Press "SAVE" button on the Deal Element and wait
 * 12. Press "NEW QUOTATION" button and wait
 *
 * Steps run:
 * 1. (Thomas) Press "TO APPROVE" button
 * 2. (Thomas) Copy the Quotation URL
 * 3. Open another browser and login as the Max account (Sales Manager)
 * 4. (Max) Paste the URL from step 2 to open the Quotation
 * 5. (Max) Press the "APPROVE" button
 *
 * Verification:
 * - The approval process is successful: after Max approves, the "APPROVE" (pending-approval)
 *   button is gone and a post-approval action (CONFIRM / SEND BY EMAIL) is available on the Quotation.
 */

test.describe('TC.-A.6.1 - Sales Manager approves a Quotation', () => {

  // Holds the second (Sales Manager / Max) browser context so it can be closed in afterEach
  let managerContext: BrowserContext | null = null;

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
    // Close the Sales Manager (Max) browser context if it was created
    if (managerContext) {
      await managerContext.close().catch(() => {});
      managerContext = null;
    }
  });

  test('TC.-A.6.1: Verify the Sales Manager can approve the Quotation successfully', async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

    // Test data captured at test scope
    const TC_ID = 'TC.-A.6.1';
    let contactName1 = '';
    let quotationUrl = '';

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

    // Pre-condition 10: Add the first product and set Ordered Qty = 30 (triggers the > $4k approval rule)
    await test.step('Step 10: Add the first product and set Ordered Qty to 30', async () => {
      console.log('Step 10: Adding the first product and setting Ordered Qty = 30');
      const added = await dealElementPage.addProduct('');
      console.log(added ? '  - First product selected' : '  - Could not add a product');
      await dealElementPage.setLastRowQty(30);
      console.log('  - Ordered Qty: 30 (pushes the total above the > $4k approval threshold)');
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

    // Steps run 1-2: Thomas submits for approval and copies the Quotation URL
    await test.step('Step run 1-2: Press TO APPROVE and copy the Quotation URL', async () => {
      console.log('Step run 1: Clicking TO APPROVE (request approval)');
      await quotationPage.clickToApprove();
      quotationUrl = page.url();
      console.log(`Step run 2: Quotation URL captured: ${quotationUrl}`);
      expect(quotationUrl, 'A Quotation URL should be captured after pressing TO APPROVE').toContain('model=sale.order');
    });

    // Steps run 3-5: Max (Sales Manager) opens the URL in a second browser and approves
    await test.step('Step run 3-5: Login as Max in a second browser, open the URL, and press APPROVE', async () => {
      console.log(`Step run 3: Opening a second browser and logging in as ${users.manager_max.displayName}`);
      // recordVideo is required for every context: a manually-created context does NOT inherit use.video
      managerContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ...(process.env.CI ? {} : { recordVideo: { dir: 'test-results', size: { width: 1920, height: 1080 } } })
      });
      const managerPage = await managerContext.newPage();
      const managerLoginPage = new LoginPage(managerPage);
      const managerQuotationPage = new QuotationPage(managerPage);

      await managerLoginPage.navigateTo(baseUrl);
      await managerLoginPage.login(users.manager_max.username, users.manager_max.password);
      console.log(`✓ Logged in as ${users.manager_max.displayName}`);

      console.log('Step run 4: Opening the Quotation URL in the Sales Manager browser');
      await managerPage.goto(quotationUrl);
      // Opening the Quotation raises an "Odoo Client Error" popup that can appear with a DELAY -
      // clear it robustly (retry) before touching the form, otherwise it interferes with APPROVE.
      await managerQuotationPage.dismissErrorDialogWithRetry();
      await managerQuotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);
      console.log('✓ Quotation opened in the Sales Manager browser');

      console.log('Step run 5: Pressing APPROVE as the Sales Manager');
      const approveMs = await managerQuotationPage.clickApprove();
      console.log(`✓ APPROVE pressed (took ${(approveMs / 1000).toFixed(1)}s)`);

      // Clear any "Odoo Client Error" popup that may surface around APPROVE (same handling as Step run 4).
      await managerQuotationPage.dismissErrorDialogWithRetry();
      // Reload to reflect the committed post-approval state (the popup can block the in-place UI update),
      // then clear the popup again if it reappears on load.
      await managerPage.reload({ waitUntil: 'domcontentloaded' });
      await managerQuotationPage.dismissErrorDialogWithRetry();
      await managerQuotationPage.waitForFormView(CommonUtils.waitTimes.pageLoad);

      // Verification: the approval process is successful
      console.log('Verification: Confirming the approval process is successful');
      const result = await managerQuotationPage.verifyApprovalSuccess();
      await CommonUtils.captureAndAttachScreenshot(managerPage, testInfo, 'TC.-A.6.1 - Quotation after Sales Manager approval');
      expect(
        result.approved,
        'The approval should be successful: the "APPROVE" button gone and a post-approval action (CONFIRM / SEND BY EMAIL) available'
      ).toBeTruthy();
      console.log('✅ Approval process successful - the Sales Manager approved the Quotation');
    });
  });
});
