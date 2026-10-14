import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createValidatedInvoiceAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-8-invoice.helper';

/**
 * ===========================================================================
 *  ExchangeRate  -  EUR exchange rate works correctly on Invoice
 * ===========================================================================
 *  Test Case ID    : Exchange-rate_1.1.5
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-14
 *
 *  Summary:
 *    As Thomas, create + validate a Public Pricelist_EUR (EUR) deal-registration Invoice and capture
 *    its EUR Total and Invoice Date; as accountant Faye, read the EUR rate that applies to that Invoice
 *    Date from Currencies > EUR > Rates, then on the Invoices list verify the invoice's "Total in Company
 *    Currency" (USD) = InvoiceTotal#1 / EURRate#1, to the cent.
 *
 *  Command to run:
 *    npx playwright test --grep "Exchange-rate_1\.1\.5:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-condition #1  -  the deal-registration Internal Note #1:
 *    Build Internal Note #1 from the template, filling the <...> placeholders with fresh dynamic
 *    values each run (one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<current date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Solution used              = Acronis
 *      - Edition                    = Enterprise
 *      - License Type               = Perpetual
 *      - IP                         = 128.183.189.157
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - Country                    = United States
 *    (Remaining template lines are static defaults.)
 *
 *  Pre-condition #2  -  create and validate the EUR invoice (logged in as Thomas), steps 1-19:
 *    1.  Use the account of Thomas to login successful
 *    2.  Click "CRM" > "view list"
 *    3.  On Opp page, click "CREATE"
 *    4.  Enter:
 *          - Opp name                 = TEST Exchange-rate_1.1.5 <current date time>
 *          - Contact name             = Name from Internal Note #1
 *          - CompanyName              = Company Name Lead 1 (from Internal Note #1)
 *          - Email                    = Email from Internal Note #1
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = IP from Internal Note #1
 *          - Create manually checkbox = FALSE
 *          - Sales Team dropdown      = cleared
 *          - Salesperson dropdown     = cleared
 *    5.  "CRM Developer" tab: Lead form textbox = NAKIVO deal registration*
 *    6.  "Assigned Partner" tab: Assigned Partner = TEST-Reseller#Automation-Jun10
 *    7.  "Internal Notes" tab: paste Internal Note #1 (edited in Pre-condition #1)
 *    8.  Press "SAVE"
 *    9.  Refresh until Company and Contact are populated in Opp #1 (within ~10s)
 *    10. Click "Deal Element" button to create a new deal element
 *    11. Set Pricelist     = Public Pricelist_EUR (EUR)
 *    12. Set Payment terms = Immediate Payment
 *    13. In Order Lines tab, click "Add a product" -> select ONE random product (Product#1), Quantity = 1
 *    14. Click "New Quotation" button -> wait until created -> click "Confirm"   (small deal, no approval)
 *    15. Wait until "Create invoice" button appears, then click it
 *    16. In Invoice Order popup, select the first option "Invoiceable lines"
 *    17. Click "Create and view invoices" button
 *    18. Wait until the invoice is created completely, on the invoice screen click "Validate"
 *    19. Note:
 *          - Invoice#1      = Invoice number
 *          - InvoiceDate#1  = Invoice Date
 *          - InvoiceTotal#1 = Invoice Total value (in EUR)
 *
 *  Pre-condition #3  -  read the EUR rate of the invoice date (logged in as Accountant Faye; kept through Steps + Verification):
 *    1. Use the account of Faye (accountant) to login successful
 *    2. Open "Invoicing" > "Configuration" > "Currencies", click "EUR" and click the "Rates" button
 *    3. Read, to six decimals, the Rate of the row that applies to InvoiceDate#1 - the row with the latest
 *       Date on or before it -> EURRate#1. Do not use the "Current Rate" column: it is today's rate, and
 *       the Invoice Date is not always today (INV/2026/11281, created on 14 Oct 2026, carries Invoice
 *       Date 13 Oct 2026)
 *
 *  Steps to reproduce  (still logged in as Faye):
 *    1. Open "Invoicing" > "Customers" > "Invoices"
 *    2. Search by Invoice#1 (the invoice number) so it shows up in the invoice list
 *       (the "Total in Company Currency" field is visible only in the list view)
 *
 *  Verification Point:
 *    On the Invoices list view, for Invoice#1, verify:
 *      1. Total in Company Currency (USD) = InvoiceTotal#1 / EURRate#1, rounded to two decimals
 *         (example: INV/2026/11281 dated 13 Oct 2026, 289.00 EUR / 0.894374 = 323.13 USD)
 *         _ Only a rounding difference of 0.01 is allowed
 * ===========================================================================
 */

// A validated Invoice (with a confirmed Sales Order) cannot be cleanly deleted, so the created
// Opportunity is RETAINED on pre-prod (same policy as TC.-A.8.x). Leftover IDs are reported.
const SKIP_CLEANUP_OPP = true; // true = skip Opp cleanup (validated Invoice cannot be cleanly deleted)

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

/**
 * The company total is the euro Total converted at ONE stored rate (six decimals) and rounded to the
 * cent, so with the rate of the invoice's own date the only possible difference is rounding.
 */
const ROUNDING_TOLERANCE = 0.01;

test.describe('Exchange-rate_1.1.5 - EUR exchange rate works correctly on Invoice', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // Boundary screenshot (REQUIREMENT #3): end of beforeEach (cleanup/reset done). Guarded.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // No-op while SKIP_CLEANUP_OPP = true (validated Invoice cannot be cleanly deleted -> retained).
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
    // Boundary screenshot (REQUIREMENT #3): end of afterEach (teardown done). Guarded.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('Exchange-rate_1.1.5: EUR exchange rate works correctly on Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    let eurRate = 0;            // EURRate#1 (the EUR "Unit per USD" of the row that applies to InvoiceDate#1)
    let eurRateDate = '';       // the Date of that rate row, as rendered
    let invoiceTotalEUR = 0;    // InvoiceTotal#1 (the EUR invoice Total)
    let invoiceNumber = '';     // Invoice#1
    let invoiceDate = '';       // InvoiceDate#1 (rendered MM/DD/YYYY)

    // ─── Pre-condition #1: build the deal-registration Internal Note #1 (fresh data each run) ───
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Exchange-rate_1.1.5 ${compactDateTime}`;

    await test.step('Pre-condition #1: Build the deal-registration Internal Note #1 from the template (fresh dynamic values)', async () => {
      console.log('Pre-condition #1: Internal Note #1 key fields (one per line):');
      console.log(`  - Name                 : ${leadName}`);
      console.log(`  - Email                : ${companyEmail}`);
      console.log(`  - Company              : Company Name Lead 1`);
      console.log(`  - Partner Company Name : TEST-Reseller#Automation-Jun10`);
      console.log(`  - IP                   : 128.183.189.157`);
      console.log(`  - Country              : United States`);
      console.log(`  - Opp name (Opp #1)    : ${oppName}`);
      let __verifyPassed = false;
      try {
        expect(internalNote, 'Internal Note #1 should be assembled').toContain('NAKIVO deal registration*');
        // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #1.
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition I - Internal Note #1 built', passed: __verifyPassed }).catch(() => {});
      }
    });

    // ─── Pre-condition #2 (steps 1-19): create + validate the EUR Invoice as Thomas (grouped setup) ───
    // Pure setup that Exchange-rate_1.1.5 does not itself verify -> run as ONE grouped block via the shared
    // helper (it still emits one test.step per manual sub-step for traceability). Pricelist = EUR.
    const invoice = await createValidatedInvoiceAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      pricelist: 'Public Pricelist_EUR',
      pricelistLabel: 'Public Pricelist_EUR (EUR)',
      stepPrefix: 'Pre-condition #2',
    });
    createdOppUrl = invoice.oppUrl;
    invoiceNumber = invoice.invoiceNumber;
    invoiceDate = invoice.invoiceDate;
    invoiceTotalEUR = money(invoice.invoiceTotal);

    await test.step('Pre-condition #2 - end of section: EUR Invoice#1 created and validated', async () => {
      console.log('Pre-condition #2 captured facts:');
      console.log(`  - Invoice#1            : ${invoiceNumber}`);
      console.log(`  - InvoiceDate#1        : ${invoiceDate}`);
      console.log(`  - InvoiceTotal#1 (EUR) : ${invoice.invoiceTotal} (${invoiceTotalEUR})`);
      console.log(`  - Invoice status       : ${invoice.status}`);
      console.log(`  - Invoice URL          : ${invoice.invoiceUrl}`);
      let __verifyPassed = false;
      try {
        expect(invoiceNumber, 'Invoice#1 (a posted invoice number) should be captured').toBeTruthy();
        expect(invoiceDate, 'InvoiceDate#1 should be read from the validated invoice').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(invoiceTotalEUR, 'InvoiceTotal#1 (EUR) should be a positive number').toBeGreaterThan(0);
        // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #2.
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition II - EUR Invoice#1 validated', passed: __verifyPassed }).catch(() => {});
      }
    });

    // ─── Pre-condition #3 (logged in as Faye): read the EUR rate that applies to InvoiceDate#1 ───
    await test.step('Pre-condition #3 - Step 1: Use the account of Faye (accountant) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
    });

    await test.step('Pre-condition #3 - Step 2: Open "Invoicing" > "Configuration" > "Currencies", click "EUR" and click the "Rates" button', async () => {
      await currencyPage.openRatesForCurrency('EUR');
      console.log('✓ EUR "Currency Rates" list opened');
    });

    await test.step('Pre-condition #3 - Step 3: Read the Rate of the row that applies to InvoiceDate#1 -> EURRate#1', async () => {
      const applicable = await currencyPage.getRateApplicableToDate(CurrencyPage.toIsoDate(invoiceDate));
      eurRate = applicable ? applicable.rate : 0;
      eurRateDate = applicable ? applicable.rawDate : '';
      console.log(`  - EURRate#1 (Unit per USD, row dated ${eurRateDate || 'none found'} for InvoiceDate#1 ${invoiceDate}): ${eurRate}`);
      let __verifyPassed = false;
      try {
        expect(eurRate, `EURRate#1 should be a positive number read from the EUR rate row that applies to ${invoiceDate}`).toBeGreaterThan(0);
        // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #3.
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Pre-condition III - EUR rate of the invoice date read from the history', passed: __verifyPassed }).catch(() => {});
      }
    });

    // ─── Steps to reproduce (still logged in as Faye) ───
    await test.step('Steps to reproduce - Step 1: Open "Invoicing" > "Customers" > "Invoices"', async () => {
      await invoicePage.openCustomerInvoicesList();
      console.log('✓ Customer Invoices list opened');
    });

    await test.step('Steps to reproduce - Step 2: Search by Invoice#1 so it shows up in the invoice list', async () => {
      await invoicePage.searchInvoiceInList(invoiceNumber);
      console.log(`✓ Searched the Invoices list for Invoice#1 ("${invoiceNumber}")`);
      // Boundary screenshot (REQUIREMENT #3): end of Steps to reproduce.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Invoices list filtered by Invoice#1').catch(() => {});
    });

    // ─── Verification Point ───
    await test.step('Verification Point: Total in Company Currency (USD) = InvoiceTotal#1 / EURRate#1', async () => {
      const totalCompanyText = await invoicePage.getTotalInCompanyCurrencyFromList(invoiceNumber);
      const actualUSD = money(totalCompanyText);
      const expectedUSD = invoiceTotalEUR / eurRate;
      // The rate is the stored rate of the invoice's own date, so only cent rounding remains.
      const tolerance = ROUNDING_TOLERANCE;

      console.log('Verification - exchange-rate math:');
      console.log(`  - InvoiceTotal#1 (EUR)              : ${invoice.invoiceTotal} (${invoiceTotalEUR})`);
      console.log(`  - InvoiceDate#1                     : ${invoiceDate}`);
      console.log(`  - EURRate#1 (Unit per USD)          : ${eurRate} (rate row dated ${eurRateDate})`);
      console.log(`  - Expected Total in Company Currency: ${expectedUSD.toFixed(2)} USD  (= ${invoiceTotalEUR} / ${eurRate})`);
      console.log(`  - Actual   Total in Company Currency: "${totalCompanyText}" (${actualUSD} USD)`);
      console.log(`  - Allowed tolerance                 : +/- ${tolerance.toFixed(4)} USD`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Total in Company Currency on Invoices list');

      expect(actualUSD, 'The list "Total in Company Currency" (USD) should be a positive number').toBeGreaterThan(0);
      expect(
        Math.abs(actualUSD - expectedUSD),
        `Total in Company Currency (${actualUSD} USD) should equal InvoiceTotal#1 / EURRate#1 (${expectedUSD.toFixed(2)} USD)`
      ).toBeLessThanOrEqual(tolerance);
      console.log('✅ EUR exchange rate is applied correctly on the Invoice (Total in Company Currency matches InvoiceTotal#1 / EURRate#1)');
    });
  });
});
