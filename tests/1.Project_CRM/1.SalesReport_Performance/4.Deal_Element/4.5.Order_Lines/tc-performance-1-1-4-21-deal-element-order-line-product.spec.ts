import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Deal Element data verification - Order line product data
 * Test Case ID: TC.Performance.1.1.4.21
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.4\\.21:" --project=SalesReport_Performance
 *
 * Objective: Verify that adding one product through "Add a product" leaves exactly one order line, carrying
 * that product, its description, Ordered Qty 1 and the product Unit of Measure.
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
 * - The Deal Element carries exactly 1 order line
 * - Product contains the product that was searched for
 * - Description repeats the product
 * - Ordered Qty = 1
 * - Unit of Measure = Socket
 *
 * The spec creates its own Opportunity (and its own Deal Element) on pre-production, named
 * with the run token <unique> - a timestamp - so the records can always be found again.
 * Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep what
 * they create, exactly like the two baseline Deal Element specs: there is no teardown.
 */

const TC = 'TC.Performance.1.1.4.21';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Pressing DEAL ELEMENT to open the Deal Element form',
  s5: 'Step 5: Filling the Deal Element and saving it',
  s6: 'Step 6: Verifying the order line product data',
};

test.describe(`${TC} - Order line product data`, () => {
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

  test(`${TC}: Verify the order line carries the product that was added, with quantity 1 and its Unit of Measure`, async ({ page }) => {
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
      await dealElementPage.clickOrderLinesTab();
      const lineCount = await dealElementPage.getOrderLineCount();
      const line = await dealElementPage.getOrderLineRowCells(0);

      record('Order line count', 1, lineCount);
      record(
        'Product contains the searched product',
        DATA.product,
        line['Product'] || '(empty)',
        (line['Product'] || '').includes(DATA.product)
      );
      record('Description repeats the Product', line['Product'] || '(empty)', line['Description'] || '(empty)');
      record('Ordered Qty', '1', line['Ordered Qty'] || '(empty)');
      record('Unit of Measure', 'Socket', line['Unit of Measure'] || '(empty)');
      printVerify();

      expect(lineCount, 'one product was added, so there must be one order line').toBe(1);
      expect(line['Product'], 'the order line must carry the product that was added').toContain(
        DATA.product
      );
      expect(line['Description'], 'the description defaults to the product').toBe(line['Product']);
      expect(line['Ordered Qty'], 'Ordered Qty defaults to 1').toBe('1');
      expect(line['Unit of Measure'], 'the socket-licensed product is sold per Socket').toBe('Socket');
    });
  });
});
