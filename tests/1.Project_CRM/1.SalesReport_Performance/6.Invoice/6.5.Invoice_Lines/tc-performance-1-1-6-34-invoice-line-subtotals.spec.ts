import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage, DealElementPage, QuotationPage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Invoice Invoice Lines - The Invoice line subtotals equal Price multiplied by Quantity
 * Test Case ID: TC.Performance.1.1.6.34
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.6\\.34:" --project=SalesReport_Performance
 *
 * Objective: Verify Subtotal After All Discounts, Booked value (company currency) and Subtotal of an undiscounted Invoice line all equal Price x Quantity.
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
 * 5. Press "NEW QUOTATION", then press "CONFIRM" to turn the Quotation into a Sales Order
 * 6. Press "CREATE INVOICE", then "CREATE AND VIEW INVOICES" on the "Invoice Order" window
 *
 * Steps run:
 * 1. Read the Price and the Quantity of the first Invoice line
 * 2. Read Subtotal After All Discounts, Booked value (company currency) and Subtotal of the same line
 *
 * Verification:
 * - Subtotal After All Discounts equals Price x Quantity
 * - Booked value (company currency) equals Price x Quantity, the Invoice being in the company currency
 * - Subtotal equals Price x Quantity
 *
 * The spec creates its own Opportunity (and its own Deal Element, Quotation, Sales Order and
 * Invoice) on pre-production, named with the run token <unique> - a timestamp - so the records can
 * always be found again. Pre-production is the team's test bed and the 1.SalesReport_Performance
 * specs keep what they create, exactly like the three baseline Invoice specs: there is no teardown.
 */

const TC = 'TC.Performance.1.1.6.34';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Opening the Opportunity list in CRM',
  s3: 'Step 3: Creating the Opportunity this test case owns',
  s4: 'Step 4: Creating the Deal Element this test case owns',
  s5: 'Step 5: Pressing NEW QUOTATION and CONFIRM to reach the Sales Order',
  s6: 'Step 6: Pressing CREATE INVOICE and CREATE AND VIEW INVOICES',
  s7: 'Step 7: Verifying the three subtotal columns of the Invoice line',
};

test.describe(`${TC} - The Invoice line subtotals equal Price multiplied by Quantity`, () => {
  let oppUrl = '';
  let dealElementUrl = '';
  let quotationUrl = '';
  let invoiceUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    dealElementUrl = '';
    quotationUrl = '';
    invoiceUrl = '';
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
    if (invoiceUrl) console.log(`Invoice created by this run     : ${invoiceUrl}`);
  });

  test(`${TC}: Verify the Invoice line subtotals equal Price multiplied by Quantity`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const invoicePage = new InvoicePage(page);

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
    // The Sales Order the invoice is generated from - its number is what the Source Document and
    // the creation log note carry.
    let saleOrderNumber = '';

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

      // The Quotation form needs to settle before CONFIRM, otherwise the click lands on the
      // still-rendering header and the Sales Order is never created.
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  Quotation confirmed - Sales Order created');
    });

    await test.step(STEP.s6, async () => {
      console.log(STEP.s6);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      await invoicePage.clickCreateInvoice();
      const elapsed = await invoicePage.clickCreateAndViewInvoices();
      invoiceUrl = page.url();
      console.log(`  Invoice created in ${(elapsed / 1000).toFixed(2)}s: ${invoiceUrl}`);

      // "Source Document" (origin) lives on the Other Info tab, so its widget is HIDDEN while the
      // Invoice Lines tab is in front - reading it there times out on a span that is in the DOM but
      // not visible. Open Other Info to read it, then bring Invoice Lines back to the front so every
      // reader below sees the screen exactly as the invoice opens.
      await invoicePage.openOtherInfoTab();
      saleOrderNumber = await invoicePage.getSourceDocument();
      await invoicePage.clickInvoiceLinesTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  Source Document (Sales Order): ${saleOrderNumber}`);
    });

    await test.step(STEP.s7, async () => {
      console.log(STEP.s7);
      const row = await invoicePage.getInvoiceLineRowCells(0);
      const num = (cell: string) => {
        const match = (cell || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };
      const price = num(row['Price']);
      const quantity = num(row['Quantity']);
      const expected = price * quantity;
      const afterDiscounts = num(row['Subtotal After All Discounts']);
      const bookedValue = num(row['Booked value (company currency)']);
      const subtotal = num(row['Subtotal']);
      const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
      console.log(`  - Price ${price} x Quantity ${quantity} = ${expected.toFixed(2)}`);
      console.log(`  - After all discounts: ${afterDiscounts} | Booked value: ${bookedValue} | Subtotal: ${subtotal}`);

      record('Price is read', 'a number greater than 0', price, price > 0);
      record('Subtotal After All Discounts', expected.toFixed(2), afterDiscounts.toFixed(2), close(afterDiscounts, expected));
      record('Booked value (company currency)', expected.toFixed(2), bookedValue.toFixed(2), close(bookedValue, expected));
      record('Subtotal', expected.toFixed(2), subtotal.toFixed(2), close(subtotal, expected));
      printVerify();

      expect(price, 'the Invoice line must carry a price').toBeGreaterThan(0);
      expect(close(afterDiscounts, expected), `Subtotal After All Discounts must be ${expected.toFixed(2)}, read ${afterDiscounts}`).toBe(true);
      expect(close(bookedValue, expected), `Booked value must be ${expected.toFixed(2)}, read ${bookedValue}`).toBe(true);
      expect(close(subtotal, expected), `Subtotal must be ${expected.toFixed(2)}, read ${subtotal}`).toBe(true);
    });
  });
});
