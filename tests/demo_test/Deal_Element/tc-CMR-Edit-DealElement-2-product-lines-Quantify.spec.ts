import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Edit Deal Element with 2 Product Lines
 * Test Case ID: CMR-Edit-DealElement-2-product-lines
 *
 * Summary: Verify the Opp has Reseller and Distributor
 *
 * Command to run:
 * npx playwright test "tests/demo_test/Deal_Element/tc-CMR-Edit-DealElement-2-product-lines-Quantify.spec.ts" --project=chromium
 *
 * I. Condition#1 - Pre-existing hardcoded data:
 * 1. Opportunity#1:
 *    URL_Opp#1      = http://10.220.222.100/web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111
 *    Name_Opp#1     = TEST Opp 1 CRM-2338_1.2.1
 * 2. EndUser#1:
 *    URL_EndUser#1  = http://10.220.222.100/web?#id=619457&model=res.partner&menu_id=
 *    Name_EndUser#1 = TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907
 *    Email_EndUser#1= Test-EndUser@EndUser-company2026-05-04-114907.com
 * 3. DealElement#1 (pre-existing):
 *    Product line#1 = [A2144B]
 *    Product line#2 = [A2145B]
 * 4. Login as admin_crm
 * 5. Launch the web using URL_Opp#1 above
 *
 * II. Condition#2 - Edit Deal Element#1:
 * 1. Press "DEAL ELEMENT" button
 * 2. Press "EDIT" button on the top page
 * 3. Select the added product line named "[A2144B]" to be edited
 * 4. Change the Description to "TEST"
 * 5. Press "SAVE" button on the top page
 *
 * III. Verification:
 * 1. The description at product line named "[A2144B]" is changed to "TEST"
 *
 */

test.describe('CMR-Edit-DealElement-2-product-lines - Verify the Opp has Reseller and Distributor', () => {

  // ==============================================================
  // I. Condition#1 - Pre-existing hardcoded data
  // ==============================================================
  const url_Opp1      = 'http://10.220.222.100/web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111';
  const name_Opp1     = 'TEST Opp 1 CRM-2338_1.2.1';

  const url_EndUser1   = 'http://10.220.222.100/web?#id=619457&model=res.partner&menu_id=';
  const name_EndUser1  = 'TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907';
  const email_EndUser1 = 'Test-EndUser@EndUser-company2026-05-04-114907.com';

  // DealElement#1 product lines (pre-existing)
  const product_line1 = '[A2144B]';
  const product_line2 = '[A2145B]';

  test('CMR-Edit-DealElement-2-product-lines: Verify the Opp has Reseller and Distributor', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId = 'CMR-Edit-DealElement-2-product-lines';

    console.log(`\n=== TEST DATA ===`);
    console.log(`  TC ID          : ${tcId}`);
    console.log(`  Name_Opp#1     : ${name_Opp1}`);
    console.log(`  URL_Opp#1      : ${url_Opp1}`);
    console.log(`  Name_EndUser#1 : ${name_EndUser1}`);
    console.log(`  Email_EndUser#1: ${email_EndUser1}`);
    console.log(`  DealElement#1  : ${product_line1}, ${product_line2} (pre-existing)`);

    // ==============================================================
    // I. LOGIN + NAVIGATE TO URL_Opp#1
    // ==============================================================

    await test.step('Pre-condition I.4: Login as admin_crm', async () => {
      console.log(`\n=== I. LOGIN ===`);
      console.log(`Step I.4: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\u2713 Login successful');
    });

    await test.step('Pre-condition I.5: Launch URL_Opp#1', async () => {
      console.log('Step I.5: Navigating to URL_Opp#1');
      await page.goto(url_Opp1);
      await opportunityPage.waitForSaveComplete();
      console.log(`\u2713 Opp#1 page loaded: "${name_Opp1}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'I.5 - Opp#1 loaded');
    });

    // ==============================================================
    // II. CONDITION#2: Edit Deal Element#1
    // ==============================================================

    await test.step('Step II.1: Press "DEAL ELEMENT" button', async () => {
      console.log(`\n=== II. EDIT DEAL ELEMENT#1 ===`);
      console.log('Step II.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('\u2713 Deal Element#1 opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.1 - Deal Element opened');
    });

    await test.step('Step II.2: Press EDIT button', async () => {
      console.log('Step II.2: Clicking EDIT button');
      await dealElementPage.clickEdit();
      console.log('\u2713 Form is now editable');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.2 - Edit mode activated');
    });

    await test.step('Step II.3-4: Select [A2144B] row and change Description to "TEST"', async () => {
      console.log('Step II.3-4: Changing description of [A2144B] row to "TEST"');
      await dealElementPage.changeDescriptionInRow('[A2144B]', 'TEST');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3-4 - Description changed to TEST');
    });

    await test.step('Step II.5: Press SAVE button', async () => {
      console.log('Step II.5: Clicking SAVE button');
      await dealElementPage.save();
      console.log('\u2713 Deal Element#1 saved after edit');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.5 - Deal Element saved after edit');
    });

    // ==============================================================
    // III. VERIFICATION
    // ==============================================================

    await test.step('III.1: Verify description at [A2144B] row is changed to "TEST"', async () => {
      console.log(`\n=== III. VERIFICATION ===`);
      const hasDescription = await dealElementPage.isDescriptionInOrderLine('[A2144B]', 'TEST');
      expect(hasDescription, 'III.1: Description at [A2144B] row should be "TEST"').toBe(true);
      console.log('\u2713 III.1: Description "TEST" confirmed on [A2144B] row');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'III.1 - Description verified');
    });

    await test.step('Final Summary', async () => {
      console.log('\n\u2705 TEST PASSED: CMR-Edit-DealElement-2-product-lines completed successfully');
      console.log(`   Name_Opp#1     : "${name_Opp1}"`);
      console.log(`   URL_Opp#1      : ${url_Opp1}`);
      console.log(`   Name_EndUser#1 : "${name_EndUser1}"`);
      console.log('   II.3-4: Description of [A2144B] row changed to "TEST"');
      console.log('   III.1 : Description "TEST" on [A2144B] row \u2014 confirmed');
      console.log('==================================================\n');
    });
  });
});
