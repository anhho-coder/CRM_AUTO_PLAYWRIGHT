import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * CRM-2338 - Opportunity Expected Revenue Calculation
 * Test Case ID: CRM-2338_1.3.2.1
 *
 * Summary: Verify the Deal Element.Total is updated automatically after editing Product name
 *
 * Command to run:
 * npx playwright test --grep "CRM-2338_1\.3\.2\.1:" --project=chromium
 *
 * I. beforeEach - Clean Opps:
 * 1.  Login as admin_crm and navigate to CRM
 * 2.  Navigate to Archive > All
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * II. beforeEach - Clean Contacts:
 * 1.  Login as admin_crm and navigate to Contacts
 * 2.  Remove "Created by Anh Ho" filter, switch to list view
 * 3.  Filter: Salesperson = Thomas Semerich
 * 4.  Filter: Country = Chile
 * 5.  Filter: State = Antofagasta
 * 6.  Filter: Active = is true
 * 7.  If no records found → skip; else delete all
 * 12. Close the browser
 *
 * V.  Pre-condition#3 - Create EndUser#1 (Contact with Pricelist = Public Pricelist_EUR)
 * VI. Pre-condition#4 - Create Opp#1 (NO Reseller, NO Distributor)
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 * 2. Set Pricelist = Public Pricelist_USD ; Payment Terms = Immediate Payment
 * 3. At "Order Lines" section:
 *    - Add [A2144B]: Ordered Qty = 1 ; Unit of Measure = Socket
 *    - Add [A2145B]: Ordered Qty = 1 ; Unit of Measure = Socket
 * 4. Press SAVE button
 * 5. Press EDIT button
 * 6. Select the added product line named [A2144B] to be edited
 * 7. Change the product to [A2146C]
 * 8. Press SAVE button
 *
 * VIII. Verification:
 * 1. The Total number at bottom of "Order Lines" tab = Sum_Subtotal_After_All_Discounts
 *
 * IX. Tear down:
 * 1. Delete EndUser#1 via URL_EndUser#1
 * 2. Delete Opp#1 via URL_Opp#1
 * 3. Close all browsers
 */

test.describe('CRM-2338_1.3.2.1 - Verify the Deal Element Total is updated automatically after editing Product name', () => {

  let url_EndUser1 = '';
  let url_Opp1     = '';

  let name_EndUser1  = '';
  let email_EndUser1 = '';

  const product_line1 = '[A2144B]';
  const product_line2 = '[A2145B]';
  const product_edit1 = '[A2146C]';

  test.beforeEach(async ({ browser, context }) => {
    const SKIP_CLEANUP_OPPS     = true; // Toggle to false to re-enable Opps cleanup
    const SKIP_CLEANUP_CONTACTS = true; // Toggle to false to re-enable Contacts cleanup

    await context.clearCookies();
    await context.grantPermissions([]);

    // ============================================================
    // I. Clean Opps (Chile / Antofagasta / Thomas Semerich)
    // ============================================================
    if (!SKIP_CLEANUP_OPPS) {
    const cleanOppsContext = await browser.newContext();
    const cleanOppsPage   = await cleanOppsContext.newPage();

    const loginPageOpps        = new LoginPage(cleanOppsPage);
    const homePageOpps         = new HomePage(cleanOppsPage);
    const opportunityPageClean = new OpportunityPage(cleanOppsPage);

    await test.step('beforeEach I: Clean Opps (Login → All → Filters → Delete)', async () => {
      test.setTimeout(config.timeouts.test);
      console.log('beforeEach I.1: Logging in for Opps cleanup');
      await loginPageOpps.navigateTo(baseUrl);
      await loginPageOpps.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageOpps.dismissLocationPermissionDialog();
      await homePageOpps.navigateToCRM();
      await homePageOpps.waitForPageReady();
      console.log('✓ beforeEach I.1: Logged in and navigated to CRM');
      await opportunityPageClean.navigateToAllLeads();
      console.log('✓ beforeEach I.2: Archive > All Opps page loaded');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Salesperson');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Thomas Semerich');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('✓ beforeEach I.3: Salesperson filter applied');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Country');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Chile');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('✓ beforeEach I.4: Country filter applied');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('State');
      await opportunityPageClean.selectCustomFilterOperator('is equal to');
      await opportunityPageClean.selectCustomFilterValue('Antofagasta');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('✓ beforeEach I.5: State filter applied');
      await opportunityPageClean.clickFilterButton();
      await opportunityPageClean.clickAddCustomFilter();
      await opportunityPageClean.selectCustomFilterField('Active');
      await opportunityPageClean.selectCustomFilterOperator('is true');
      await opportunityPageClean.clickApplyFilter();
      await opportunityPageClean.clickFilterButton();
      console.log('✓ beforeEach I.6: Active filter applied');
      const isEmpty = await opportunityPageClean.isListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach I.7: No qualified Opps found - skipping delete');
      } else {
        console.log('  ⚠ Qualified Opps found - proceeding to delete');
        await opportunityPageClean.clickSelectAllCheckbox();
        await opportunityPageClean.clickListActionMenu();
        await opportunityPageClean.clickListActionDelete();
        await opportunityPageClean.confirmDeleteDialog();
        console.log('✓ beforeEach I.7: Qualified Opps deleted');
      }
    });

    await cleanOppsContext.close();
    console.log('✓ beforeEach I: Opps cleanup browser closed');
    } // end !SKIP_CLEANUP_OPPS

    // ============================================================
    // II. Clean Contacts (Chile / Antofagasta / Thomas Semerich)
    // ============================================================
    if (!SKIP_CLEANUP_CONTACTS) {
    const cleanContactsContext = await browser.newContext();
    const cleanContactsPage    = await cleanContactsContext.newPage();

    const loginPageContacts = new LoginPage(cleanContactsPage);
    const homePageContacts  = new HomePage(cleanContactsPage);
    const contactPageClean  = new ContactPage(cleanContactsPage);

    await test.step('beforeEach II: Clean Contacts (Login → List → Filters → Delete)', async () => {
      console.log('beforeEach II.1: Logging in for Contacts cleanup');
      await loginPageContacts.navigateTo(baseUrl);
      await loginPageContacts.login(users.admin_crm.username, users.admin_crm.password);
      await loginPageContacts.dismissLocationPermissionDialog();
      await homePageContacts.navigateToContactsFromHome();
      await homePageContacts.waitForPageReady();
      console.log('✓ beforeEach II.1: Navigated to Contacts page');
      await contactPageClean.removeMyPipelineFilter();
      await contactPageClean.clickViewListButtonIfVisible();
      console.log('✓ beforeEach II.2: List view ready');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Salesperson');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Thomas Semerich');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('✓ beforeEach II.3: Salesperson filter applied');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Country');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Chile');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('✓ beforeEach II.4: Country filter applied');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('State');
      await contactPageClean.selectCustomFilterOperator('is equal to');
      await contactPageClean.selectCustomFilterValue('Antofagasta');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('✓ beforeEach II.5: State filter applied');
      await contactPageClean.clickFilterButton();
      await contactPageClean.clickAddCustomFilter();
      await contactPageClean.selectCustomFilterField('Active');
      await contactPageClean.selectCustomFilterOperator('is true');
      await contactPageClean.clickApplyFilter();
      await contactPageClean.clickFilterButton();
      console.log('✓ beforeEach II.6: Active filter applied');
      const isEmpty = await contactPageClean.isRecordListEmpty();
      if (isEmpty) {
        console.log('✓ beforeEach II.7: No qualified Contacts found - skipping delete');
      } else {
        console.log('  ⚠ Qualified Contacts found - proceeding to delete');
        await contactPageClean.clickSelectAllCheckbox();
        await contactPageClean.clickListActionMenu();
        await contactPageClean.clickListActionDelete();
        await contactPageClean.confirmDeleteDialog();
        console.log('✓ beforeEach II.7: Qualified Contacts deleted');
      }
    });

    await cleanContactsContext.close();
    console.log('✓ beforeEach II: Contacts cleanup browser closed');
    } // end !SKIP_CLEANUP_CONTACTS
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      await CommonUtils.waitForSpinnersToHide(page);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ Page stabilized');
    }

    console.log('\n=== IX. TEAR DOWN ===');

    const teardownPage = new ContactPage(page);

    await test.step('IX.1: Delete EndUser#1', async () => {
      if (!url_EndUser1) { console.log('  ⚠ No URL for EndUser#1 - skipping'); return; }
      console.log(`Step IX.1: Deleting EndUser#1 at ${url_EndUser1}`);
      await teardownPage.deleteContactByURL(url_EndUser1);
      console.log('✓ IX.1: EndUser#1 deleted');
    });

    await test.step('IX.2: Delete Opp#1', async () => {
      if (!url_Opp1) { console.log('  ⚠ No URL for Opp#1 - skipping'); return; }
      console.log(`Step IX.2: Deleting Opp#1 at ${url_Opp1}`);
      await teardownPage.deleteContactByURL(url_Opp1);
      console.log('✓ IX.2: Opp#1 deleted');
    });

    await test.step('IX.3: Close all browsers', async () => {
      console.log('Step IX.3: Closing all pages in context');
      const allPages = page.context().pages();
      for (const p of allPages) {
        if (!p.isClosed()) await p.close();
      }
      console.log('✓ IX.3: All browsers closed');
    });

    url_EndUser1   = '';
    url_Opp1       = '';
    email_EndUser1 = '';
  });

  test('CRM-2338_1.3.2.1: Verify the Deal Element Total is updated automatically after editing Product name', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const homePage        = new HomePage(page);
    const contactPage     = new ContactPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId      = 'CRM-2338_1.3.2.1';
    const timestamp = CommonUtils.generateTimestamp();

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Timestamp      : ${timestamp}`);
    console.log(`  product_line1  : ${product_line1}`);
    console.log(`  product_line2  : ${product_line2}`);
    console.log(`  product_edit1  : ${product_edit1}`);

    // ==============================================================
    // V. PRE-CONDITION#3: Create EndUser#1
    // ==============================================================

    await test.step('Pre-condition V.1: Login and navigate to Contacts', async () => {
      console.log(`\n=== V. PRE-CONDITION#3: Create EndUser#1 ===`);
      console.log(`Step V.1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('✓ Login successful');
      await homePage.navigateToContactsFromHome();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to Contacts');
    });

    await test.step('Pre-condition V.2: Create EndUser#1', async () => {
      name_EndUser1  = `TEST-EndUser#1_${tcId}_${timestamp}`;
      email_EndUser1 = `Test-EndUser@EndUser-company${timestamp}.com`;
      console.log(`Step V.2: Creating EndUser#1 - Name: "${name_EndUser1}"`);

      await contactPage.clickCreate();
      const result = await contactPage.createContact(
        'Company',
        name_EndUser1,
        email_EndUser1,
        'Chile',
        'BDEU',
        'Antofagasta',
        'Thomas Semerich'
      );
      console.log(`  ✓ EndUser#1 created (id=${result.contactId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.2 - EndUser#1 created');
    });

    await test.step('Pre-condition V.3: Set Pricelist on Sales & Purchases tab', async () => {
      console.log('Step V.3: Setting Pricelist = "Public Pricelist_EUR" on Sales & Purchases tab');
      await contactPage.clickEdit();
      await contactPage.clickSalesPurchasesTab();
      await contactPage.selectPricelist('Public Pricelist_EUR');
      console.log('✓ V.3: Pricelist set to "Public Pricelist_EUR"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.3 - Pricelist set');
    });

    await test.step('Pre-condition V.4: Save EndUser#1 and copy URL', async () => {
      console.log('Step V.4: Saving EndUser#1 and capturing URL');
      await contactPage.clickSaveIfEditable();
      await contactPage.waitForSaveComplete();
      await page.waitForFunction(
        () => { const m = window.location.href.match(/[?&#]id=(\d+)/); return m && m[1]; },
        { timeout: 30000 }
      ).catch(() => {});
      url_EndUser1 = page.url();
      console.log(`✓ URL_EndUser#1 = ${url_EndUser1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'V.4 - EndUser#1 complete');
    });

    await test.step('Pre-condition V.5: Return to home page', async () => {
      console.log('Step V.5: Returning to home page');
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      console.log('✓ Home page loaded');
    });

    // ==============================================================
    // VI. PRE-CONDITION#4: Create Opp#1
    // ==============================================================

    await test.step('Pre-condition VI.1: Navigate to CRM and switch to list view', async () => {
      console.log(`\n=== VI. PRE-CONDITION#4: Create Opp#1 ===`);
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      console.log('✓ CRM list view activated');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.1 - CRM list view');
    });

    await test.step('Pre-condition VI.2: Click CREATE for Opp#1', async () => {
      console.log('Step VI.2: Clicking CREATE button');
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.2 - Opp creation form');
    });

    await test.step('Pre-condition VI.3: Fill Opp#1 information', async () => {
      const oppName = `TEST Opp 1 ${tcId}`;
      console.log(`Step VI.3: Filling Opp#1 - Name: "${oppName}"`);
      await opportunityPage.fillOpportunityName(oppName);
      console.log(`  ✓ Opp name: "${oppName}"`);
      await opportunityPage.fillEmail(email_EndUser1);
      console.log(`  ✓ Email: "${email_EndUser1}" (EndUser#1)`);
      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log('  ✓ Company Name: "Company Name Opp 1"');
      await opportunityPage.fillStreet('123street');
      console.log('  ✓ Street: "123street"');
      await opportunityPage.selectCountry('Chile');
      console.log('  ✓ Country: Chile');
      await opportunityPage.selectState('Antofagasta');
      console.log('  ✓ State: Antofagasta');
      await opportunityPage.selectSalesTeam('BDEU');
      console.log('  ✓ Sales Team: BDEU');
      await opportunityPage.selectSalesperson('Thomas Semerich');
      console.log('  ✓ Salesperson: Thomas Semerich');
      await opportunityPage.uncheckCreatedManually();
      console.log('  ✓ Created manually: FALSE');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.3 - Opp#1 fields filled');
    });

    await test.step('Pre-condition VI.4: Click CRM Developer tab and set Lead form', async () => {
      console.log('Step VI.4: Setting Lead form = Download Free Trial');
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log('✓ Lead form = "Download Free Trial"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.4 - CRM Developer tab');
    });

    await test.step('Pre-condition VI.5: Select Stage = NEW', async () => {
      console.log('Step VI.5: Selecting Stage = NEW');
      await opportunityPage.selectStage('New');
      console.log('✓ Stage = NEW');
    });

    await test.step('Pre-condition VI.6: Save Opp#1 and copy URL', async () => {
      console.log('Step VI.6: Saving Opp#1');
      await opportunityPage.clickSave();
      await opportunityPage.waitForSaveComplete();
      await opportunityPage.waitForIdInUrlAndExtract();
      url_Opp1 = page.url();
      console.log(`✓ URL_Opp#1 = ${url_Opp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.6 - Opp#1 saved');
    });

    await test.step('Pre-condition VI.7: Refresh page to verify Contact field (up to 5 times)', async () => {
      console.log('Step VI.7: Waiting for Contact field to populate (up to 5 refreshes)');
      const refreshResult = await opportunityPage.waitForContactFieldPopulated(name_EndUser1, 5, 60000);
      console.log(`  Contact field found: ${refreshResult.contactFieldFound}`);
      console.log(`  Contact value: "${refreshResult.contactValue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VI.7 - After contact field refresh');
    });

    // ==============================================================
    // VII. STEPS TO REPRODUCE
    // ==============================================================

    await test.step('Step VII.1: Press "DEAL ELEMENT" button', async () => {
      console.log(`\n=== VII. STEPS TO REPRODUCE ===`);
      console.log('Step VII.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('✓ Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.1 - Deal Element form opened');
    });

    await test.step('Step VII.2: Set Pricelist = Public Pricelist_USD and Payment Terms = Immediate Payment', async () => {
      console.log('Step VII.2: Setting Pricelist and Payment Terms');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  ✓ Pricelist = "Public Pricelist_USD"');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  ✓ Payment Terms = "Immediate Payment"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.2 - Pricelist and Payment Terms set');
    });

    await test.step(`Step VII.3a: Add product ${product_line1}, Ordered Qty = 1, UoM = Socket`, async () => {
      console.log(`Step VII.3a: Adding product ${product_line1}, Qty=1, UoM=Socket`);
      await dealElementPage.addProductLine(product_line1, 1, 'Socket');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `VII.3a - Product ${product_line1} added`);
    });

    await test.step(`Step VII.3b: Add product ${product_line2}, Ordered Qty = 1, UoM = Socket`, async () => {
      console.log(`Step VII.3b: Adding product ${product_line2}, Qty=1, UoM=Socket`);
      await dealElementPage.addProductLine(product_line2, 1, 'Socket');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `VII.3b - Product ${product_line2} added`);
    });

    await test.step('Step VII.4: Press SAVE button', async () => {
      console.log('Step VII.4: Clicking SAVE button');
      await dealElementPage.save();
      console.log('✓ Deal Element saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.4 - Deal Element saved');
    });

    await test.step('Step VII.5: Press EDIT button', async () => {
      console.log('Step VII.5: Clicking EDIT button');
      await dealElementPage.clickEdit();
      console.log('✓ Form is now editable');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.5 - Edit mode activated');
    });

    await test.step(`Step VII.6-7: Select ${product_line1} row and change product to ${product_edit1}`, async () => {
      console.log(`Step VII.6-7: Changing product ${product_line1} → ${product_edit1}`);
      await dealElementPage.changeProductInRow(product_line1, product_edit1);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `VII.6-7 - Product changed to ${product_edit1}`);
    });

    await test.step('Step VII.8: Press SAVE button', async () => {
      console.log('Step VII.8: Clicking SAVE button');
      await dealElementPage.save();
      console.log('✓ Deal Element saved after edit');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.8 - Deal Element saved after edit');
    });

    // ==============================================================
    // VIII. VERIFICATION
    // ==============================================================

    await test.step('VIII.1: Verify Total at bottom of Order Lines = Sum_Subtotal_After_All_Discounts', async () => {
      console.log(`\n=== VIII. VERIFICATION ===`);
      console.log('Step VIII.1: Reading Subtotal After All Discounts for each Order Line');
      const subTotal_edit1 = await dealElementPage.getSubtotalAfterAllDiscountsForProduct(product_edit1);
      const subTotal2      = await dealElementPage.getSubtotalAfterAllDiscountsForProduct(product_line2);
      const sumSubtotalAfterAllDiscounts = parseFloat((subTotal_edit1 + subTotal2).toFixed(2));
      console.log(`  Subtotal After All Discounts ${product_edit1} : ${subTotal_edit1}`);
      console.log(`  Subtotal After All Discounts ${product_line2}  : ${subTotal2}`);
      console.log(`  Sum_Subtotal_After_All_Discounts               : ${sumSubtotalAfterAllDiscounts}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.1a - Subtotals After All Discounts read');

      console.log('Step VIII.1: Reading Total at bottom of Order Lines tab');
      const orderTotalRaw = await dealElementPage.getOrderLinesTotal();
      const orderTotal = parseFloat(orderTotalRaw.toFixed(2));
      console.log(`  Order Lines Total                              : ${orderTotal}`);
      expect(orderTotal, `VIII.1: Order Lines Total (${orderTotal}) should equal Sum_Subtotal_After_All_Discounts (${sumSubtotalAfterAllDiscounts})`).toBe(sumSubtotalAfterAllDiscounts);
      console.log(`✓ VIII.1: Total ${orderTotal} = Sum_Subtotal_After_All_Discounts ${sumSubtotalAfterAllDiscounts} — confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VIII.1b - Total verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: CRM-2338_1.3.2.1 verification completed successfully');
      console.log(`   EndUser#1     : "${name_EndUser1}"`);
      console.log(`   URL_Opp#1     : ${url_Opp1}`);
      console.log(`   VIII.1: Order Lines Total = Sum_Subtotal_After_All_Discounts (${product_edit1} + ${product_line2}) — confirmed`);
      console.log('   IX    : All records will be deleted in afterEach (tear down)');
      console.log('==================================================\n');
    });
  });
});
