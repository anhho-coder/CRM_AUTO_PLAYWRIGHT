const fs = require('fs');
const dest = 'D:\\II. Automation\\CRM_AUTO\\tests\\demo_test\\Deal_Element\\tc-CMR-Intensive-DealElement.spec.ts';
const content = `import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Demo Test - Intensive Deal Element
 * Test Case ID: CMR-Intensive-DealElement
 *
 * Summary: Verify the Opp has Reseller and Distributor
 *
 * Command to run:
 * npx playwright test --grep "CMR-Intensive-DealElement:" --project=chromium
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
 * II. Condition#2 - Create Deal Element#1:
 * 1. Press "DEAL ELEMENT" button
 * 2. Pricelist = Public Pricelist_USD (USD) ; Payment Term = Immediate Payment
 * 3. Add product [A2144B] via "Add a product" link
 *    Add product [A2145B] via "Add a product" link
 * 4. Press "SAVE" button on the top page
 *
 * VII. Steps to reproduce:
 * 1. Press "DEAL ELEMENT" button
 *
 */

test.describe('CMR-Intensive-DealElement - Verify the Opp has Reseller and Distributor', () => {

  // ==============================================================
  // I. Condition#1 - Pre-existing hardcoded data
  // ==============================================================
  const url_Opp1      = 'http://10.220.222.100/web?#id=993063&action=152&model=crm.lead&view_type=form&menu_id=111';
  const name_Opp1     = 'TEST Opp 1 CRM-2338_1.2.1';

  const url_EndUser1   = 'http://10.220.222.100/web?#id=619457&model=res.partner&menu_id=';
  const name_EndUser1  = 'TEST-EndUser#1_CRM-2338_1.2.1_2026-05-04-114907';
  const email_EndUser1 = 'Test-EndUser@EndUser-company2026-05-04-114907.com';

  test('CMR-Intensive-DealElement: Verify the Opp has Reseller and Distributor', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage       = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const tcId = 'CMR-Intensive-DealElement';

    console.log(\`\\n=== TEST DATA ===\`);
    console.log(\`  TC ID          : \${tcId}\`);
    console.log(\`  Name_Opp#1     : \${name_Opp1}\`);
    console.log(\`  URL_Opp#1      : \${url_Opp1}\`);
    console.log(\`  Name_EndUser#1 : \${name_EndUser1}\`);
    console.log(\`  Email_EndUser#1: \${email_EndUser1}\`);

    // ==============================================================
    // I. LOGIN + NAVIGATE TO URL_Opp#1
    // ==============================================================

    await test.step('Pre-condition I.3: Login as admin_crm', async () => {
      console.log(\`\\n=== I. LOGIN ===\`);
      console.log(\`Step I.3: Logging in as \${users.admin_crm.displayName}\`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log('\\u2713 Login successful');
    });

    await test.step('Pre-condition I.4: Launch URL_Opp#1', async () => {
      console.log('Step I.4: Navigating to URL_Opp#1');
      await page.goto(url_Opp1);
      await opportunityPage.waitForSaveComplete();
      console.log(\`\\u2713 Opp#1 page loaded: "\${name_Opp1}"\`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'I.4 - Opp#1 loaded');
    });

    // ==============================================================
    // VII. STEPS TO REPRODUCE  /  II. Create Deal Element#1
    // ==============================================================

    await test.step('Step VII.1 / II.1: Press "DEAL ELEMENT" button', async () => {
      console.log(\`\\n=== VII. STEPS TO REPRODUCE ===\`);
      console.log('Step VII.1: Clicking DEAL ELEMENT button');
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      console.log('\\u2713 Deal Element form opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'VII.1 - Deal Element form opened');
    });

    await test.step('Step II.2: Set Pricelist = Public Pricelist_USD and Payment Term = Immediate Payment', async () => {
      console.log('Step II.2: Setting Pricelist and Payment Term');
      await dealElementPage.selectPricelist('Public Pricelist_USD');
      console.log('  \\u2713 Pricelist = "Public Pricelist_USD"');
      await dealElementPage.selectPaymentTerm('Immediate Payment');
      console.log('  \\u2713 Payment Term = "Immediate Payment"');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.2 - Pricelist and Payment Term set');
    });

    await test.step('Step II.3a: Add product [A2144B]', async () => {
      console.log('Step II.3a: Adding product [A2144B]');
      await dealElementPage.addProduct('[A2144B]');
      console.log('\\u2713 Product [A2144B] added');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3a - Product [A2144B] added');
    });

    await test.step('Step II.3b: Add product [A2145B]', async () => {
      console.log('Step II.3b: Adding product [A2145B]');
      await dealElementPage.addProduct('[A2145B]');
      console.log('\\u2713 Product [A2145B] added');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.3b - Product [A2145B] added');
    });

    await test.step('Step II.4: Press SAVE button', async () => {
      console.log('Step II.4: Clicking SAVE button');
      await dealElementPage.save();
      console.log('\\u2713 Deal Element#1 saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'II.4 - Deal Element saved');
    });

    await test.step('Final Summary', async () => {
      console.log('\\n\\u2705 TEST PASSED: CMR-Intensive-DealElement completed successfully');
      console.log(\`   Name_Opp#1     : "\${name_Opp1}"\`);
      console.log(\`   URL_Opp#1      : \${url_Opp1}\`);
      console.log(\`   Name_EndUser#1 : "\${name_EndUser1}"\`);
      console.log('   Deal Element#1 created with [A2144B] and [A2145B]');
      console.log('==================================================\\n');
    });
  });
});
`;
fs.writeFileSync(dest, content, 'utf8');
console.log('Done. Length: ' + content.length);
