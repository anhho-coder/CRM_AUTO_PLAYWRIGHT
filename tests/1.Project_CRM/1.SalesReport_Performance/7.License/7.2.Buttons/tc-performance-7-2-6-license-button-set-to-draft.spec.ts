import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage, LicensePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  The SET TO DRAFT button returns a cancelled License to Draft
 * =============================================================================================
 *  Test Case ID    : TC.Performance.7.2.6
 *  Jira            : -   (authored from the License screen verification scope; no Xray manual TC)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-21
 *  Environment     : PRE-PRODUCTION - https://pre-production.nakivo.site (VPN required)
 * ---------------------------------------------------------------------------------------------
 *  Summary
 *    Creates its own licence, cancels it through the reason window, then presses SET TO DRAFT and
 *    verifies that the licence returns to Draft and that its header carries the four Draft buttons
 *    again. The route runs through CANCEL on purpose - APPROVE generates a real licence and is not
 *    a button automation may press on a shared environment.
 * ---------------------------------------------------------------------------------------------
 *  Command to run
 *    npx playwright test --grep "TC\.Performance\.7\.2\.6:" --project=SalesReport_Performance
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC
 *
 *  Pre-condition(s) - one contiguous setup block, run as seven labelled steps
 *   1. Use the account of admin crm to login successful
 *   2. After login successful, click at "CRM" button, then at "view list" button
 *   3. On the "Opp" page press "CREATE" and enter:
 *        - Opp name          = TEST + current date time
 *        - Email             = Test@company + current date time + ".com"
 *        - Country           = United States
 *        - State             = Connecticut
 *        - Sales Team        = cleared
 *        - Salesperson       = cleared
 *        - Created manually  = FALSE
 *        - Lead form         = License                    (on the "CRM Developer" tab)
 *      Press "SAVE" and wait until Odoo has created the Company/Contact from the e-mail domain
 *   4. Press "DEAL ELEMENT" and enter:
 *        - Pricelist         = Public Pricelist_USD
 *        - Payment Term      = Immediate Payment
 *        - Order Lines       = the first "NAKIVO Backup" product
 *      Press "SAVE"
 *   5. Press "NEW QUOTATION", then press "CONFIRM" to turn the Quotation into a Sales Order
 *   6. Press "CREATE INVOICE", then "CREATE AND VIEW INVOICES", then "VALIDATE"
 *   7. Press "CREATE LICENSE", select "sockets" at the "for monitoring" dropdown and press "SAVE"
 *
 *  Steps to reproduce
 *   1. Press the "CANCEL" button and confirm the window with Cancel reason = Expired
 *   2. Press the "SET TO DRAFT" button of the cancelled licence
 *   3. Reload the licence record and read its state and its header buttons
 *
 *  Verification
 *   - The licence is CANCEL after step 1 and DRAFT again after step 2
 *   - The header carries exactly 4 buttons
 *   - They read APPROVE, CANCEL, SET TO DRAFT, TEST CREATING LICENSE FROM LM in that order
 * ---------------------------------------------------------------------------------------------
 *  Grounding
 *    The expected values are grounded on PRE-PRODUCTION (2026-09-21) against the
 *    license_management.license form view and a licence created through the chain above - not on a
 *    Production screenshot. Odoo keeps a field hidden by attrs in the DOM, so every reader used
 *    here filters on real visibility and reports what a tester actually sees.
 * ---------------------------------------------------------------------------------------------
 *  Test data and cleanup
 *    Every run creates its OWN Opportunity, Deal Element, Quotation, Sales Order, Invoice and
 *    License, named with a fresh timestamp, so two back-to-back runs never collide and no run
 *    depends on a record another test left behind. Nothing is deleted afterwards: the invoice is
 *    VALIDATED and the licence generated from it cannot be removed cleanly, and the
 *    1.SalesReport_Performance family keeps what it creates on pre-production - exactly like the
 *    baseline specs TC.Performance.7.1.1 and TC.Performance.7.1.2. The URL of every
 *    record a run created is printed in afterEach so it can always be found again.
 * =============================================================================================
 */

const TC = 'TC.Performance.7.2.6';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  pre1: 'Pre-condition 1: Use the account of admin crm to login successful',
  pre2: 'Pre-condition 2: Click at "CRM" button, then at "view list" button',
  pre3: 'Pre-condition 3: Press "CREATE" and enter the Opportunity this test case owns, then "SAVE"',
  pre4: 'Pre-condition 4: Press "DEAL ELEMENT", enter the Deal Element this test case owns, then "SAVE"',
  pre5: 'Pre-condition 5: Press "NEW QUOTATION", then "CONFIRM" to create the Sales Order',
  pre6: 'Pre-condition 6: Press "CREATE INVOICE", "CREATE AND VIEW INVOICES", then "VALIDATE"',
  pre7: 'Pre-condition 7: Press "CREATE LICENSE", select "sockets" for monitoring and press "SAVE"',
  s1: 'Step 1: Press the "CANCEL" button and confirm the window with Cancel reason = Expired',
  s2: 'Step 2: Press the "SET TO DRAFT" button of the cancelled licence',
  s3: 'Step 3: Reload the licence record and read its state and its header buttons',
  verify: 'Verification',
} as const;

test.describe(`${TC} - The SET TO DRAFT button returns a cancelled License to Draft`, () => {
  let oppUrl = '';
  let dealElementUrl = '';
  let quotationUrl = '';
  let invoiceUrl = '';
  let licenseUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    dealElementUrl = '';
    quotationUrl = '';
    invoiceUrl = '';
    licenseUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
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
    if (invoiceUrl) console.log(`Invoice created by this run     : ${invoiceUrl}`);
    if (licenseUrl) console.log(`License created by this run     : ${licenseUrl}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: The SET TO DRAFT button returns a cancelled License to Draft`, async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);
    const licensePage = new LicensePage(page);

    const DATA = {
      country: 'United States',
      state: 'Connecticut',
      leadForm: 'License',
      pricelist: 'Public Pricelist_USD',
      paymentTerm: 'Immediate Payment',
      product: 'NAKIVO Backup',
      forMonitoring: 'sockets',
      // The reason the cancel window is confirmed with, where a test case cancels the licence.
      cancelReason: 'Expired',
    };

    // What the chain produced - every "matches the Opportunity / the Invoice" check below is made
    // against these values, never against a hard-coded record.
    let oppName = '';
    let oppEmail = '';
    let oppCompany = '';
    let invoiceNumber = '';
    let licenseTitle = '';

    // What this test case reads on the licence.
    let stateCancelled = '';
    let stateAfter = '';
    let headerLabels: string[] = [];

    // The VERIFY block printed in the last step - filled by record(), printed before the expect()s
    // so it also reaches stdout when a check fails.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    // pass is derived from string equality unless the check is relational (a range, a "greater
    // than", a presence test) - those pass their own verdict as the 4th argument.
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

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`  - Logged in as : ${users.admin_crm.displayName}`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await homePage.navigateToCRM();
      await opportunityPage.switchToListView();
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await opportunityPage.clickCreate();
      oppName = opportunityPage.generateOpportunityName('TEST');
      oppEmail = opportunityPage.generateEmail('Test@company');
      await opportunityPage.fillOpportunityName(oppName);
      await opportunityPage.fillEmail(oppEmail);
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
      console.log(`  - Opp name          : ${oppName}`);
      console.log(`  - Email             : ${oppEmail}`);
      console.log(`  - Country           : ${DATA.country}`);
      console.log(`  - State             : ${DATA.state}`);
      console.log(`  - Lead form         : ${DATA.leadForm}`);
      console.log(`  - Company created   : ${oppCompany}`);
      console.log(`  - Opportunity URL   : ${oppUrl}`);
      expect(oppCompany, 'Odoo must have created the Company for the Opportunity').not.toBe('');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.waitForAutoPopulate();
      await dealElementPage.selectPricelist(DATA.pricelist);
      await dealElementPage.selectPaymentTerm(DATA.paymentTerm);
      await dealElementPage.addProduct(DATA.product);
      await dealElementPage.save(CommonUtils.waitTimes.savingDealElement);
      dealElementUrl = page.url();
      console.log(`  - Pricelist         : ${DATA.pricelist}`);
      console.log(`  - Payment Term      : ${DATA.paymentTerm}`);
      console.log(`  - Product           : ${DATA.product}`);
      console.log(`  - Deal Element URL  : ${dealElementUrl}`);
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await quotationPage.clickNewQuotation();
      await quotationPage.waitForFormView();
      await quotationPage.waitForEditButton();
      quotationUrl = page.url();
      console.log(`  - Quotation URL     : ${quotationUrl}`);
      // The Quotation form needs to settle before CONFIRM, otherwise the click lands on the
      // still-rendering header and the Sales Order is never created.
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  - Quotation confirmed - Sales Order created');
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await invoicePage.clickCreateInvoice();
      await invoicePage.clickCreateAndViewInvoices();
      invoiceUrl = page.url();
      await invoicePage.clickValidate();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      invoiceNumber = await invoicePage.getInvoiceNumber().catch(() => '');
      console.log(`  - Invoice URL       : ${invoiceUrl}`);
      console.log(`  - Invoice number    : ${invoiceNumber}`);
    });

    await test.step(STEP.pre7, async () => {
      console.log(`\n--- ${STEP.pre7} ---`);
      await invoicePage.clickCreateLicense();
      await licensePage.waitForPageLoad();
      await licensePage.selectForMonitoring(DATA.forMonitoring);
      const saveMs = await licensePage.clickSaveAndWaitForCompletion();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      licenseUrl = page.url();
      licenseTitle = await licensePage.getRecordTitle();
      console.log(`  - for monitoring    : ${DATA.forMonitoring}`);
      console.log(`  - SAVE took         : ${(saveMs / 1000).toFixed(2)}s`);
      console.log(`  - License title     : ${licenseTitle}`);
      console.log(`  - License URL       : ${licenseUrl}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - License created and saved');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await licensePage.cancelLicenseWithReason(DATA.cancelReason);
      await licensePage.reloadForm();
      stateCancelled = await licensePage.getActiveStatusBarStage();
      console.log(`  - Cancel reason       : ${DATA.cancelReason}`);
      console.log(`  - State after CANCEL  : ${stateCancelled}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await licensePage.clickSetToDraft();
      console.log('  - SET TO DRAFT pressed');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await licensePage.reloadForm();
      stateAfter = await licensePage.getActiveStatusBarStage();
      headerLabels = await licensePage.getStatusbarButtons();
      console.log(`  - State after         : ${stateAfter}`);
      headerLabels.forEach((b, i) => console.log(`  - Button #${i + 1}          : ${b}`));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - licence back in Draft');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      const EXPECTED = ['APPROVE', 'CANCEL', 'SET TO DRAFT', 'TEST CREATING LICENSE FROM LM'];

      record('The licence was cancelled before SET TO DRAFT', 'CANCEL', stateCancelled);
      record('The licence state after SET TO DRAFT', 'DRAFT', stateAfter);
      record('Number of buttons in the Draft licence header', EXPECTED.length, headerLabels.length);
      record('Button names and their order', EXPECTED.join(' | '), headerLabels.join(' | '));
      printVerify();

      expect(stateCancelled, 'the licence must be cancelled first').toBe('CANCEL');
      expect(stateAfter, 'SET TO DRAFT must return the licence to Draft').toBe('DRAFT');
      expect(headerLabels, 'the Draft licence header must carry exactly 4 buttons').toHaveLength(EXPECTED.length);
      expect(headerLabels, 'the Draft button names and their order must match the documented list').toEqual(EXPECTED);
    });
  });
});
