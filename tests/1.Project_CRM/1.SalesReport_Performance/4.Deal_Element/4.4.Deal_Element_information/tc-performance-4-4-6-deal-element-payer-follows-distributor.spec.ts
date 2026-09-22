import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Deal Element data verification - Payer and addresses follow the Distributor
 * Test Case ID: TC.Performance.4.4.6
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.4\\.12:" --project=SalesReport_Performance
 *
 * Objective: Verify that when the Opportunity carries a Distributor, the Deal Element bills the Distributor -
 * Payer, Invoice Address and Delivery Address all become the Distributor - while the End User stays
 * the Company of the Opportunity.
 *
 * Pre-condition:
 * 1. Log in and open CRM > Opportunities (list view)
 * 2. Press CREATE and enter:
 *    - Opp name       = TEST + current date time
 *    - Email          = Test@company + current date time + ".com"
 *    - Country        = United States
 *    - State          = Connecticut
 *    - Sales Team     = cleared
 *    - Salesperson    = cleared
 *    - Created manually = FALSE
 *    - Reseller       = TEST-Reseller#1_Automation_Basic
 *    - Distributor    = TEST-Distributor#1_Automation
 *    - Lead form      = License (CRM Developer tab)
 * 3. Press SAVE and wait until Odoo has created the Company/Contact from the e-mail domain
 *
 * Steps run:
 * 1. Press "DEAL ELEMENT" on the Opportunity
 * 2. On the Deal Element form select:
 *    - Pricelist    = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 3. In "Order Lines" press "Add a product" and take the first NAKIVO Backup product
 * 4. Press SAVE
 *
 * Verification:
 * - Payer = the Distributor of the Opportunity
 * - Invoice Address = the Distributor of the Opportunity
 * - Delivery Address = the Distributor of the Opportunity
 * - End User = the Company of the Opportunity (not the Distributor)
 *
 * The spec creates its own Opportunity (and its own Deal Element) on pre-production, named
 * with the run token <unique> - a timestamp - so the records can always be found again.
 * Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep what
 * they create, exactly like the two baseline Deal Element specs: there is no teardown.
 */

const TC = 'TC.Performance.4.4.6';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Pressing DEAL ELEMENT to open the Deal Element form',
  s5: 'Step 5: Filling the Deal Element and saving it',
  s6: 'Step 6: Verifying the Payer, the addresses and the End User',
};

test.describe(`${TC} - Payer and addresses follow the Distributor`, () => {
  let oppUrl = '';
  let dealElementUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    dealElementUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    if (oppUrl) console.log(`Opportunity created by this run : ${oppUrl}`);
    if (dealElementUrl) console.log(`Deal Element created by this run: ${dealElementUrl}`);
  });

  test(`${TC}: Verify Payer, Invoice Address and Delivery Address follow the Distributor while End User stays the Customer`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);

    const DATA = {
      country: 'United States',
      state: 'Connecticut',
      leadForm: 'License',
      pricelist: 'Public Pricelist_USD',
      paymentTerm: 'Immediate Payment',
      product: 'NAKIVO Backup',
      reseller: 'TEST-Reseller#1_Automation_Basic',
      distributor: 'TEST-Distributor#1_Automation',
    };

    // The Company Odoo creates for the Opportunity out of the e-mail domain; every
    // "matches the Opportunity" check below is made against this value.
    let oppCompany = '';

    // The VERIFY block printed in the last step - filled by record(), printed before the
    // expect()s so it also reaches stdout when a check fails.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    // pass is derived from string equality unless the check is relational (a range, a
    // "greater than", a tolerance) - those pass their own verdict as the 4th argument.
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await test.step(STEP.s1, async () => {
      console.log(STEP.s1);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step(STEP.s2, async () => {
      console.log(STEP.s2);
      await homePage.navigateToCRM();
      await opportunityPage.switchToListView();
    });

    await test.step(STEP.s3, async () => {
      console.log(STEP.s3);
      await opportunityPage.clickCreate();

      const oppName = opportunityPage.generateOpportunityName('TEST');
      const email = opportunityPage.generateEmail('Test@company');
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(email);
      await opportunityPage.selectCountry(DATA.country);
      await opportunityPage.selectState(DATA.state);
      await opportunityPage.clearSalesTeam();
      await opportunityPage.clearSalesperson();
      await opportunityPage.uncheckCreatedManually();
      await opportunityPage.fillReseller(DATA.reseller);
      await opportunityPage.fillDistributor(DATA.distributor);
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm(DATA.leadForm);
      await opportunityPage.verifyCreatedManuallyBeforeSave();
      await opportunityPage.saveAndWaitForCompletion();
      await opportunityPage.waitForContactFieldPopulated('company', 5, 20000);

      oppUrl = page.url();
      oppCompany = (await opportunityPage.getCompanyFieldValue()) || '';

      console.log(`  - Opportunity : ${oppName}`);
      console.log(`  - Email       : ${email}`);
      console.log(`  - Country     : ${DATA.country}`);
      console.log(`  - State       : ${DATA.state}`);
      console.log(`  - Lead form   : ${DATA.leadForm}`);
      console.log(`  - Company     : ${oppCompany}`);
      console.log(`  Opportunity saved: ${oppUrl}`);

      expect(oppCompany, 'Odoo must have created the Company for the Opportunity').not.toBe('');
    });

    await test.step(STEP.s4, async () => {
      console.log(STEP.s4);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist(DATA.pricelist);
      await dealElementPage.selectPaymentTerm(DATA.paymentTerm);
      await dealElementPage.addProduct(DATA.product);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      dealElementUrl = page.url();
      console.log(`  Deal Element saved: ${dealElementUrl}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(STEP.s6);
      const payer = await dealElementPage.getFieldPartnerName('partner_id');
      const invoiceAddress = await dealElementPage.getFieldPartnerName('partner_invoice_id');
      const deliveryAddress = await dealElementPage.getFieldPartnerName('partner_shipping_id');
      const endUser = await dealElementPage.getFieldPartnerName('partner_end_user_id');

      record('Payer = Opportunity Distributor', DATA.distributor, payer);
      record('Invoice Address = Opportunity Distributor', DATA.distributor, invoiceAddress);
      record('Delivery Address = Opportunity Distributor', DATA.distributor, deliveryAddress);
      record('End User = Opportunity Company', oppCompany, endUser);
      printVerify();

      expect(payer, 'the Distributor pays, so the Payer is the Distributor').toBe(DATA.distributor);
      expect(invoiceAddress, 'the invoice goes to the Distributor').toBe(DATA.distributor);
      expect(deliveryAddress, 'the delivery goes to the Distributor').toBe(DATA.distributor);
      expect(endUser, 'the End User stays the Company of the Opportunity').toBe(oppCompany);
    });
  });
});
