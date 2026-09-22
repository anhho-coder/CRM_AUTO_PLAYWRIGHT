import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Quotation data verification - Log note summary of the Quotation
 * Test Case ID: TC.Performance.5.6.2
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.5\\.34:" --project=SalesReport_Performance
 *
 * Objective: Verify that the summary log note the Quotation is created with reports the same Payer, End User, Salesperson, Status and Total as the form itself - the log note is a faithful copy, not an independent story.
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
 * 4. Press "DEAL ELEMENT", select Pricelist = Public Pricelist_USD (USD) and Payment Term =
 *    Immediate Payment, add the first "NAKIVO Backup" product in "Order Lines" and press SAVE
 *
 * Steps run:
 * 1. Press "NEW QUOTATION" on the saved Deal Element
 * 2. Read the Payer, End User, Salesperson, Status and Total on the form
 * 3. Read the summary log note in the Log note area
 *
 * Verification:
 * - A summary log note reporting Payer, End User, Salesperson, Status and Total is posted
 * - Its Payer is the Payer of the Quotation
 * - Its End User is the End User of the Quotation
 * - Its Salesperson is the Salesperson of the Quotation
 * - Its Status is Quotation
 * - Its Total is the Total of the Quotation
 *
 * The spec creates its own Opportunity (and its own Deal Element and Quotation) on pre-production,
 * named with the run token <unique> - a timestamp - so the records can always be found again.
 * Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep what they
 * create, exactly like the five baseline Quotation specs: there is no teardown.
 */

const TC = 'TC.Performance.5.6.2';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Creating the Deal Element this test case owns',
  s5: 'Step 5: Pressing NEW QUOTATION to create the Quotation',
  s6: 'Step 6: Verifying the summary log note',
};

test.describe(`${TC} - Log note summary of the Quotation`, () => {
  let oppUrl = '';
  let dealElementUrl = '';
  let quotationUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    dealElementUrl = '';
    quotationUrl = '';
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
    if (quotationUrl) console.log(`Quotation created by this run   : ${quotationUrl}`);
  });

  test(`${TC}: Verify the Log note summary reports the Payer, End User, Salesperson, Status and Total of the Quotation`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);

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
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist(DATA.pricelist);
      await dealElementPage.selectPaymentTerm(DATA.paymentTerm);
      await dealElementPage.addProduct(DATA.product);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      dealElementUrl = page.url();
      console.log(`  - Pricelist    : ${DATA.pricelist}`);
      console.log(`  - Payment Term : ${DATA.paymentTerm}`);
      console.log(`  - Product      : ${DATA.product}`);
      console.log(`  Deal Element saved: ${dealElementUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      await quotationPage.clickNewQuotation();
      await quotationPage.waitForFormView();
      await quotationPage.waitForEditButton();
      quotationUrl = page.url();
      console.log(`  Quotation created: ${quotationUrl}`);
    });

    await test.step(STEP.s6, async () => {
      console.log(STEP.s6);
      const payer = await quotationPage.getFieldPartnerName('partner_id');
      const endUser = await quotationPage.getFieldPartnerName('partner_end_user_id');
      const salesperson = await quotationPage.getSalespersonName();
      const total = await quotationPage.getQuotationTotal();

      const note = await quotationPage.waitForChatterMessage(/Payer:/i);
      console.log(`  - Summary log note: ${note ? note.replace(/\n/g, ' | ') : '(not found)'}`);
      const fields = note ? quotationPage.parseLogNoteFields(note) : {};

      const notedTotal = parseFloat((fields['Total'] || '').replace(/,/g, '')) || 0;

      record('Summary log note posted', 'present', note ? 'present' : '(not found)', note !== null);
      record('Log note Payer', payer, fields['Payer'] || '(missing)');
      record('Log note End User', endUser, fields['End User'] || '(missing)');
      record('Log note Salesperson', salesperson, fields['Salesperson'] || '(missing)');
      record('Log note Status', 'Quotation', fields['Status'] || '(missing)');
      record('Log note Total', total, notedTotal, Math.abs(notedTotal - total) < 0.01);
      printVerify();

      expect(note, 'the Quotation must carry the summary log note').not.toBeNull();
      expect(fields['Payer'], 'the log note must report the Payer of the Quotation').toBe(payer);
      expect(fields['End User'], 'the log note must report the End User of the Quotation').toBe(endUser);
      expect(fields['Salesperson'], 'the log note must report the Salesperson of the Quotation').toBe(salesperson);
      expect(fields['Status'], 'the log note must report the Quotation status').toBe('Quotation');
      expect(notedTotal, 'the log note must report the Total of the Quotation').toBeCloseTo(total, 2);
    });
  });
});
