import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Verify Expected Revenue on Opportunity equals Total from Deal Element
 * Test Case ID: CMR-Count-Expected-Revenue-From-DealElement
 *
 * Summary: Verify Expected Revenue on Opp = Total from Deal Element; Expected After Probability = Total * Probability / 100
 *
 * Command to run:
 * npx playwright test --grep "CMR-Count-Expected-Revenue-From-DealElement:" --project=chromium
 *
 * I. Condition#1 - Pre-existing hardcoded data:
 * 1. Opportunity#1:
 *    URL_Opp#1      = ${baseUrl}web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111
 *    Name_Opp#1     = TEST Opp 1 CRM-2338_1.2.1
 * 2. EndUser#1:
 *    URL_EndUser#1  = ${baseUrl}web?#id=619457&model=res.partner&menu_id=
 *    Name_EndUser#1 = TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907
 *    Email_EndUser#1= Test-EndUser@EndUser-company2026-05-04-114907.com
 * 3. Login as admin_crm
 * 4. Launch the web using URL_Opp#1 above
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 * 2. Press "Edit" button and set:
 *    + Pricelist = Public Pricelist_USD (USD)
 *    + Payment Term = Immediate Payment
 * 3. At "Order Lines" section:
 *    + Add [A2144B]: Ordered Qty = 1 ; Unit of Measure = Socket
 *    + Add [A2145B]: Ordered Qty = 1 ; Unit of Measure = Socket
 * 4. Press SAVE button
 * 5. Get Total number at bottom of "Order Lines" tab = Total_Subtotal_After_All_Discounts_Opp1
 * 6. Press the Link of Opportunity to back to Opportunity screen
 * 7. Get value of Expected Revenue = Expected_Revenue_Opp1
 * 8. Get value of Expected After Probability = Expected_Revenue_After_Probability_Opp1
 *
 * III. Verification:
 * 1. Expected_Revenue_Opp1 = Total_Subtotal_After_All_Discounts_Opp1
 * 2. Expected_Revenue_After_Probability_Opp1 = Total_Subtotal_After_All_Discounts_Opp1 * Probability / 100
 *
 */

test.describe('CMR-Count-Expected-Revenue-From-DealElement - Verify Expected Revenue on Opp equals Total from Deal Element', () => {

  // ==============================================================
  // I. Condition#1 - Pre-existing hardcoded data
  // ==============================================================
  const url_Opp1      = `${baseUrl}web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111`;
  const name_Opp1     = 'TEST Opp 1 CRM-2338_1.2.1';

  const url_EndUser1   = `${baseUrl}web?#id=619457&model=res.partner&menu_id=`;
  const name_EndUser1  = 'TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907';
  const email_EndUser1 = 'Test-EndUser@EndUser-company2026-05-04-114907.com';

  test('CMR-Count-Expected-Revenue-From-DealElement: Verify Expected Revenue on Opp equals Total from Deal Element', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId = 'CMR-Count-Expected-Revenue-From-DealElement';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Name_Opp#1     : ${name_Opp1}`);
    console.log(`  URL_Opp#1      : ${url_Opp1}`);
    console.log(`  Name_EndUser#1 : ${name_EndUser1}`);
    console.log(`  Email_EndUser#1: ${email_EndUser1}`);

    // ==============================================================
    // I. LOGIN + NAVIGATE TO URL_Opp#1
    // ==============================================================

    await test.step('Pre-condition I.3: Login as admin_crm', async () => {
      console.log(`\n=== I. LOGIN ===`);
      console.log(`Step I.3: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\u2713 Login successful');
    });

    await test.step('Pre-condition I.4: Launch URL_Opp#1', async () => {
      console.log('Step I.4: Navigating to URL_Opp#1');
      await page.goto(url_Opp1);
      await opportunityPage.waitForSaveComplete();
      console.log(`\u2713 Opp#1 page loaded: "${name_Opp1}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'I.4 - Opp#1 loaded');
    });

    // ==============================================================
    // VII. STEPS TO REPRODUCE  /  II. Create Deal Element#1
    // ==============================================================

    await test.step('Step VII.1 / II.1: Press "DEAL ELEMENT" button', async () => {
      console.log(`\n=== VII. STEPS TO REPRODUCE ===`);
      console.log('Step VII.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('\u2713 Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.1 - Deal Element form opened');
    });

    await test.step('Step II.2: Press EDIT button, set Pricelist = Public Pricelist_USD and Payment Term = Immediate Payment', async () => {
      console.log('Step II.2: Clicking EDIT button');
      await dealElementPage.clickEdit();
      console.log('  \u2713 Edit mode activated');
      console.log('Step II.2: Setting Pricelist and Payment Term');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  \u2713 Pricelist = "Public Pricelist_USD"');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  \u2713 Payment Term = "Immediate Payment"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.2 - Pricelist and Payment Term set');
    });

    await test.step('Step II.3: Add product [A2144B], Ordered Qty = 1, UoM = Socket', async () => {
      console.log('Step II.3: Adding product [A2144B], Qty=1, UoM=Socket');
      await dealElementPage.addProductLine('[A2144B]', 1, 'Socket');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3 - Product [A2144B] added');
    });

    await test.step('Step II.3b: Add product [A2145B], Ordered Qty = 1, UoM = Socket', async () => {
      console.log('Step II.3b: Adding product [A2145B], Qty=1, UoM=Socket');
      await dealElementPage.addProductLine('[A2145B]', 1, 'Socket');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3b - Product [A2145B] added');
    });

    await test.step('Step II.4: Press SAVE button', async () => {
      console.log('Step II.4: Clicking SAVE button');
      await dealElementPage.save();
      console.log('\u2713 Deal Element saved with both products');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.4 - Deal Element saved');
    });

    // ==============================================================
    // III. VERIFICATION
    // ==============================================================

    let totalSubtotalAfterAllDiscountsOpp1 = 0;

    await test.step('Step VII.5: Get Total from Order Lines tab = Total_Subtotal_After_All_Discounts_Opp1', async () => {
      console.log('\nStep VII.5: Reading Total at bottom of Order Lines tab');
      const orderTotalRaw = await dealElementPage.getOrderLinesTotal();
      totalSubtotalAfterAllDiscountsOpp1 = parseFloat(orderTotalRaw.toFixed(2));
      console.log(`  Total_Subtotal_After_All_Discounts_Opp1 : ${totalSubtotalAfterAllDiscountsOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.5 - Total read from Deal Element');
    });

    await test.step('Step VII.6: Press Opportunity link to navigate back to Opportunity screen', async () => {
      console.log('Step VII.6: Clicking breadcrumb Opportunity link');
      await dealElementPage.clickBackToOpportunity();
      console.log('\u2713 Back on Opportunity page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.6 - Back on Opportunity page');
    });

    let expectedRevenueOpp1 = 0;
    let expectedAfterProbabilityOpp1 = 0;
    let probability = 0;

    await test.step('Step VII.7-8: Get Expected Revenue and Expected After Probability from Opportunity', async () => {
      console.log('Step VII.7: Reading Expected Revenue from Opportunity');
      expectedRevenueOpp1 = await opportunityPage.getExpectedRevenue();
      console.log(`  Expected_Revenue_Opp1                   : ${expectedRevenueOpp1}`);

      console.log('Step VII.7 (cont): Reading Probability from Opportunity');
      probability = await opportunityPage.getProbability();
      console.log(`  Probability                             : ${probability}%`);

      console.log('Step VII.8: Reading Expected After Probability from Opportunity');
      expectedAfterProbabilityOpp1 = await opportunityPage.getExpectedAfterProbability();
      console.log(`  Expected_Revenue_After_Probability_Opp1 : ${expectedAfterProbabilityOpp1}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.7-8 - Expected Revenue fields read');
    });

    await test.step('III.1: Verify Expected_Revenue_Opp1 = Total_Subtotal_After_All_Discounts_Opp1', async () => {
      console.log(`\n=== III. VERIFICATION ===`);
      console.log(`Step III.1: Expected Revenue (${expectedRevenueOpp1}) should equal Total (${totalSubtotalAfterAllDiscountsOpp1})`);
      expect(expectedRevenueOpp1, `III.1: Expected_Revenue_Opp1 (${expectedRevenueOpp1}) should equal Total_Subtotal_After_All_Discounts_Opp1 (${totalSubtotalAfterAllDiscountsOpp1})`).toBe(totalSubtotalAfterAllDiscountsOpp1);
      console.log(`\u2713 III.1: Expected_Revenue_Opp1 ${expectedRevenueOpp1} = Total ${totalSubtotalAfterAllDiscountsOpp1} \u2014 confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Expected Revenue verified');
    });

    await test.step('III.2: Verify Expected_Revenue_After_Probability_Opp1 = Total * Probability / 100', async () => {
      const expectedCalc = parseFloat((totalSubtotalAfterAllDiscountsOpp1 * probability / 100).toFixed(2));
      console.log(`Step III.2: Expected After Probability (${expectedAfterProbabilityOpp1}) should equal Total * Probability / 100 = ${totalSubtotalAfterAllDiscountsOpp1} * ${probability} / 100 = ${expectedCalc}`);
      expect(expectedAfterProbabilityOpp1, `III.2: Expected_Revenue_After_Probability_Opp1 (${expectedAfterProbabilityOpp1}) should equal Total * Probability / 100 (${expectedCalc})`).toBe(expectedCalc);
      console.log(`\u2713 III.2: Expected_After_Probability ${expectedAfterProbabilityOpp1} = ${totalSubtotalAfterAllDiscountsOpp1} * ${probability} / 100 = ${expectedCalc} \u2014 confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.2 - Expected After Probability verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CMR-Count-Expected-Revenue-From-DealElement completed successfully');
      console.log(`   Name_Opp#1     : "${name_Opp1}"`);
      console.log(`   URL_Opp#1      : ${url_Opp1}`);
      console.log(`   Name_EndUser#1 : "${name_EndUser1}"`);
      console.log(`   VII.5: Total_Subtotal_After_All_Discounts_Opp1 = ${totalSubtotalAfterAllDiscountsOpp1}`);
      console.log(`   VII.7: Expected_Revenue_Opp1 = ${expectedRevenueOpp1} | Probability = ${probability}%`);
      console.log(`   VII.8: Expected_After_Probability_Opp1 = ${expectedAfterProbabilityOpp1}`);
      console.log('   III.1: Expected_Revenue_Opp1 = Total \u2014 confirmed');
      console.log('   III.2: Expected_After_Probability = Total * Probability / 100 \u2014 confirmed');
      console.log('==================================================\n');
    });
  });
});
