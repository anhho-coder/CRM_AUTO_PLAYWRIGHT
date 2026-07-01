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
 *  Test Case ID    : ExchangeRate-1.1
 *  Automation-Type : new
 *  Automation-Date : 2026-06-30
 *
 *  Summary:
 *    As Thomas, create + validate a Public Pricelist_EUR (EUR) deal-registration Invoice and capture
 *    its EUR Total; as accountant Faye, read today's EUR Current Rate from Currencies, then on the
 *    Invoices list verify the invoice's "Total in Company Currency" (USD) = InvoiceTotal#1 / EURRate#1.
 *
 *  Command to run:
 *    npx playwright test --grep "ExchangeRate-1\.1:" --project=chromium
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
 *          - Opp name                 = TEST ExchangeRate-1.1 <current date time>
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
 *          - InvoiceTotal#1 = Invoice Total value (in EUR)
 *
 *  Pre-condition #3  -  read today's EUR rate (logged in as Accountant Faye; kept through Steps + Verification):
 *    1. Use the account of Faye (accountant) to login successful
 *    2. Open "Invoicing" > "Configuration" > "Currencies"
 *    3. On the Currencies list, read the current rate of EUR directly from the rate column
 *       -> EURRate#1 (today's "Unit per USD")
 *
 *  Steps to reproduce  (still logged in as Faye):
 *    1. Open "Invoicing" > "Customers" > "Invoices"
 *    2. Search by Invoice#1 (the invoice number) so it shows up in the invoice list
 *       (the "Total in Company Currency" field is visible only in the list view)
 *
 *  Verification Point:
 *    On the Invoices list view, for Invoice#1, verify:
 *      1. Total in Company Currency (USD) = InvoiceTotal#1 / EURRate#1
 *         (example: 100.00 EUR / 0.877116 = 114.01 USD)
 * ===========================================================================
 */

// A validated Invoice (with a confirmed Sales Order) cannot be cleanly deleted, so the created
// Opportunity is RETAINED on pre-prod (same policy as TC.-A.8.x). Leftover IDs are reported.
const SKIP_CLEANUP_OPP = true; // true = skip Opp cleanup (validated Invoice cannot be cleanly deleted)

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('ExchangeRate-1.1 - EUR exchange rate works correctly on Invoice', () => {
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

  test('ExchangeRate-1.1: EUR exchange rate works correctly on Invoice', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    let eurRate = 0;            // EURRate#1 (today's EUR "Current Rate" / "Unit per USD")
    let invoiceTotalEUR = 0;    // InvoiceTotal#1 (the EUR invoice Total)
    let invoiceNumber = '';     // Invoice#1

    // ─── Pre-condition #1: build the deal-registration Internal Note #1 (fresh data each run) ───
    const { leadName, companyEmail, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST ExchangeRate-1.1 ${compactDateTime}`;

    await test.step('Pre-condition #1: Build the deal-registration Internal Note #1 from the template (fresh dynamic values)', async () => {
      console.log('Pre-condition #1: Internal Note #1 key fields (one per line):');
      console.log(`  - Name                 : ${leadName}`);
      console.log(`  - Email                : ${companyEmail}`);
      console.log(`  - Company              : Company Name Lead 1`);
      console.log(`  - Partner Company Name : TEST-Reseller#Automation-Jun10`);
      console.log(`  - IP                   : 128.183.189.157`);
      console.log(`  - Country              : United States`);
      console.log(`  - Opp name (Opp #1)    : ${oppName}`);
      expect(internalNote, 'Internal Note #1 should be assembled').toContain('NAKIVO deal registration*');
      // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #1.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note #1 built').catch(() => {});
    });

    // ─── Pre-condition #2 (steps 1-19): create + validate the EUR Invoice as Thomas (grouped setup) ───
    // Pure setup that ExchangeRate-1.1 does not itself verify -> run as ONE grouped block via the shared
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
    invoiceTotalEUR = money(invoice.invoiceTotal);

    await test.step('Pre-condition #2 - end of section: EUR Invoice#1 created and validated', async () => {
      console.log('Pre-condition #2 captured facts:');
      console.log(`  - Invoice#1            : ${invoiceNumber}`);
      console.log(`  - InvoiceTotal#1 (EUR) : ${invoice.invoiceTotal} (${invoiceTotalEUR})`);
      console.log(`  - Invoice status       : ${invoice.status}`);
      console.log(`  - Invoice URL          : ${invoice.invoiceUrl}`);
      expect(invoiceNumber, 'Invoice#1 (a posted invoice number) should be captured').toBeTruthy();
      expect(invoiceTotalEUR, 'InvoiceTotal#1 (EUR) should be a positive number').toBeGreaterThan(0);
      // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #2.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - EUR Invoice#1 validated').catch(() => {});
    });

    // ─── Pre-condition #3 (logged in as Faye): read today's EUR rate from Currencies ───
    await test.step('Pre-condition #3 - Step 1: Use the account of Faye (accountant) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.accountance_ic_faye.username, users.accountance_ic_faye.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Faye (${users.accountance_ic_faye.displayName})`);
    });

    await test.step('Pre-condition #3 - Step 2: Open "Invoicing" > "Configuration" > "Currencies"', async () => {
      await currencyPage.openCurrenciesList();
      console.log('✓ Currencies list opened');
    });

    await test.step('Pre-condition #3 - Step 3: Read the current rate of EUR from the rate column -> EURRate#1', async () => {
      const rateText = await currencyPage.getCurrencyRate('EUR');
      eurRate = money(rateText);
      console.log(`  - EURRate#1 (today's EUR Current Rate / Unit per USD): ${rateText} (${eurRate})`);
      expect(eurRate, 'EURRate#1 should be a positive number read from the rate column').toBeGreaterThan(0);
      // Boundary screenshot (REQUIREMENT #3): end of Pre-condition #3.
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition III - EUR rate read from Currencies').catch(() => {});
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
      // Rate is displayed to 6 decimals and the company total is rounded to 2 dp -> allow a small,
      // magnitude-scaled tolerance (rate-rounding error grows with the amount).
      const tolerance = Math.max(0.05, expectedUSD * 0.002);

      console.log('Verification - exchange-rate math:');
      console.log(`  - InvoiceTotal#1 (EUR)              : ${invoice.invoiceTotal} (${invoiceTotalEUR})`);
      console.log(`  - EURRate#1 (Unit per USD)          : ${eurRate}`);
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
