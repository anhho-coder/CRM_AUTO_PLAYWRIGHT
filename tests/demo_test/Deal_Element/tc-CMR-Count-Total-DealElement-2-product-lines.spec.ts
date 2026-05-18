import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Verify Total equals Sum of Sub Totals on Deal Element with 2 Product Lines
 * Test Case ID: CMR-Count-Total-DealElement-2-product-lines
 *
 * Summary: Verify that the Total at the bottom of the Order Lines tab equals the sum of all Sub Totals
 *
 * Command to run:
 * npx playwright test --grep "CMR-Count-Total-DealElement-2-product-lines:" --project=chromium
 *
 * I. Condition#1 - Pre-existing hardcoded data:
 * 1. Opportunity#1:
 *    URL_Opp#1      = http://10.220.222.100/web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111
 *    Name_Opp#1     = TEST Opp 1 CRM-2338_1.2.1
 * 2. EndUser#1:
 *    URL_EndUser#1  = http://10.220.222.100/web?#id=619457&model=res.partner&menu_id=
 *    Name_EndUser#1 = TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907
 *    Email_EndUser#1= Test-EndUser@EndUser-company2026-05-04-114907.com
 * 3. Login as admin_crm
 * 4. Launch the web using URL_Opp#1 above
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 * 2. Once the "Deal Element" screen shows up select the following:
 *    + Pricelist = Public Pricelist_USD (USD)
 *    + Payment Term = Immediate Payment
 * 3. At "Order Lines" section:
 *    - Add [A2144B]: Ordered Qty = 1 ; Unit of Measure = Socket
 * 4. Press "SAVE" button on the top page
 * 5. At "Order Lines" section:
 *    - Add [A2145B]: Ordered Qty = 1 ; Unit of Measure = Socket
 * 6. Sum number of "Subtotal After All Discounts" on every Order Line called Sum_Subtotal_After_All_Discounts
 *
 * VIII. Verification:
 * 1. The Total number at bottom of "Order Lines" tab = value of Sum_Subtotal_After_All_Discounts
 *
 */

test.describe('CMR-Count-Total-DealElement-2-product-lines - Verify Total equals Sum of Sub Totals in Order Lines', () => {

  // ==============================================================
  // I. Condition#1 - Pre-existing hardcoded data
  // ==============================================================
  const url_Opp1      = 'http://10.220.222.100/web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111';
  const name_Opp1     = 'TEST Opp 1 CRM-2338_1.2.1';

  const url_EndUser1   = 'http://10.220.222.100/web?#id=619457&model=res.partner&menu_id=';
  const name_EndUser1  = 'TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907';
  const email_EndUser1 = 'Test-EndUser@EndUser-company2026-05-04-114907.com';

  test('CMR-Count-Total-DealElement-2-product-lines: Verify Total equals Sum of Sub Totals in Order Lines', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId = 'CMR-Count-Total-DealElement-2-product-lines';

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

    await test.step('Step II.4: Press SAVE button', async () => {
      console.log('Step II.4: Clicking SAVE button');
      await dealElementPage.save();
      console.log('\u2713 Deal Element#1 saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.4 - Deal Element saved');
    });

    await test.step('Step II.5: Press EDIT and add product [A2145B], Ordered Qty = 1, UoM = Socket', async () => {
      console.log('Step II.5: Clicking EDIT button');
      await dealElementPage.clickEdit();
      console.log('  \u2713 Edit mode activated');
      console.log('Step II.5: Adding product [A2145B], Qty=1, UoM=Socket');
      await dealElementPage.addProductLine('[A2145B]', 1, 'Socket');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.5 - Product [A2145B] added');
    });

    await test.step('Step II.5 (cont): Press SAVE button', async () => {
      console.log('Step II.5 (cont): Clicking SAVE button');
      await dealElementPage.save();
      console.log('\u2713 Deal Element#1 saved with both products');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.5 cont - Deal Element saved');
    });

    // ==============================================================
    // III. VERIFICATION
    // ==============================================================

    await test.step('Step II.6: Sum "Subtotal After All Discounts" of every Order Line = Sum_Subtotal_After_All_Discounts', async () => {
      console.log('\nStep II.6: Reading Subtotal After All Discounts for each Order Line');
      const subtotalAfterDiscount1 = await dealElementPage.getSubtotalAfterAllDiscountsForProduct('[A2144B]');
      const subtotalAfterDiscount2 = await dealElementPage.getSubtotalAfterAllDiscountsForProduct('[A2145B]');
      const sumSubtotalAfterAllDiscounts = parseFloat((subtotalAfterDiscount1 + subtotalAfterDiscount2).toFixed(2));
      console.log(`  Subtotal After All Discounts [A2144B] : ${subtotalAfterDiscount1}`);
      console.log(`  Subtotal After All Discounts [A2145B] : ${subtotalAfterDiscount2}`);
      console.log(`  Sum_Subtotal_After_All_Discounts      : ${sumSubtotalAfterAllDiscounts}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.6 - Subtotals After All Discounts read');

      console.log(`\n=== III. VERIFICATION ===`);
      console.log('Step III.1: Reading Total at bottom of Order Lines tab');
      const orderTotalRaw = await dealElementPage.getOrderLinesTotal();
      const orderTotal = parseFloat(orderTotalRaw.toFixed(2));
      console.log(`  Order Lines Total                     : ${orderTotal}`);
      expect(orderTotal, `III.1: Order Lines Total (${orderTotal}) should equal Sum_Subtotal_After_All_Discounts (${sumSubtotalAfterAllDiscounts})`).toBe(sumSubtotalAfterAllDiscounts);
      console.log(`\u2713 III.1: Total ${orderTotal} = Sum_Subtotal_After_All_Discounts ${sumSubtotalAfterAllDiscounts} \u2014 confirmed`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Total verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CMR-Count-Total-DealElement-2-product-lines completed successfully');
      console.log(`   Name_Opp#1     : "${name_Opp1}"`);
      console.log(`   URL_Opp#1      : ${url_Opp1}`);
      console.log(`   Name_EndUser#1 : "${name_EndUser1}"`);
      console.log('   II.6 : Sum_Subtotal_After_All_Discounts computed from [A2144B] + [A2145B]');
      console.log('   III.1: Order Lines Total = Sum_Subtotal_After_All_Discounts \u2014 confirmed');
      console.log('==================================================\n');
    });
  });
});
