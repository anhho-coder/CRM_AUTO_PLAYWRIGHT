import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, InvoicePageMig , MigPlatformPage} from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { registerMigRecord, teardownMigRecords } from '@helpers/o12ce-main-business.helper';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_3.7: invoice before first UAH rate converts 1:1
 * ===========================================================================
 *  Test Case ID    : CRM-11857_3.7
 *  Jira            : CRM-13398
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13398 updated 2026-10-09T07:07:23+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Create a UAH invoice dated 2026-06-03 (before the first migrated UAH rate of 2026-06-04).
 *    Validate it and read the Journal Entry's Receivable line. Since no rate exists for this date,
 *    the conversion must fall back to 1:1 (Amount in UAH = Amount in company currency USD).
 *    No error is raised during validation. This is the fallback behavior when a currency has no
 *    rate on or before the transaction date.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_3\.7:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13398 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - On production, the first UAH rate is dated 2026-06-04. The crm-mig data has been
 *      migrated from production.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies, open UAH and click "Rates"
 *     Expected Result: No row is dated before 2026-06-04
 *
 *  2. Open Invoicing > Customers > Invoices and click Create. Set Customer =
 *     AUTO-CRM-11857-3.7-<runId> (type the name and click Create), Invoice Date =
 *     2026-06-03, Currency = UAH; add a line with Description = AUTO-CRM-11857-3.7,
 *     Quantity = 1, Unit Price = 100.00; click Save, then Validate
 *     Expected Result: No error is shown
 *                      Status = Open
 *                      Total = 100.00 UAH
 *
 *  3. Open the Other Info tab and click the Journal Entry
 *     Expected Result: The Receivable line shows Amount Currency = 100.00 UAH and Debit =
 *                      100.00
 *
 * ===========================================================================
 */

const CURRENCY_CODE = 'UAH';
const INVOICE_AMOUNT = 100.00;
const INVOICE_QTY = 1;
const INVOICE_UNIT_PRICE = 100.00;
const INVOICE_DATE = '06/03/2026'; // 2026-06-03, before first UAH rate
const UAH_FIRST_RATE_DATE = '2026-06-04';

const money = (s: string | undefined | null): number =>
  parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open UAH and click "Rates"',
  s2: 'Step 2: Open Invoicing > Customers > Invoices and click Create. Set Customer = AUTO-CRM-11857-3.7-<runId> (type the name and click Create), Invoice Date = 2026-06-03, Currency = UAH; add a line with Description = AUTO-CRM-11857-3.7, Quantity = 1, Unit Price = 100.00; click Save, then Validate',
  s3: 'Step 3: Open the Other Info tab and click the Journal Entry',
  verify: 'Verification: invoice dated before first UAH rate converts 1:1 without error',
  teardown: 'Teardown: delete the test invoice and its customer',
} as const;

test.describe('CRM-11857_3.7 - Exchange Rates: validating a UAH invoice dated before the first UAH rate converts it 1:1 without an error', () => {
  test.describe.configure({ timeout: config.timeouts.test });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_3.7: Validating a UAH invoice dated before the first UAH rate converts it 1:1 without an error', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const invoicePage = new InvoicePageMig(page);
    const platform = new MigPlatformPage(page);
    const runId = `${Date.now()}`;
    const customerName = `AUTO-CRM-11857-3.7-${runId}`;
    const invoiceLineDesc = `AUTO-CRM-11857-3.7`;

    let oldestUahRateDate = '';
    let noRateBeforeFirstDate = false;
    let invoiceNumber = '';
    let invoiceStatus = '';
    let invoiceTotal = 0;
    let debitFromJournal = 0;
    let journalAmountCurrency = 0;

    try {
      await test.step(STEP.pre, async () => {
        console.log(`\n--- ${STEP.pre} ---`);
        console.log(`  Target  : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
        await loginPage.dismissLocationPermissionDialog().catch(() => {});
        console.log(`  Run ID  : ${runId}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await currencyPage.openRatesForCurrency(CURRENCY_CODE);
        await currencyPage.sortListByColumn('Date', 'asc');
        await page.waitForTimeout(CommonUtils.waitTimes.standard);

        const rows = await currencyPage.getRateRows();
        if (rows.length > 0) {
          oldestUahRateDate = rows[0].date;
          noRateBeforeFirstDate = oldestUahRateDate >= UAH_FIRST_RATE_DATE;
          console.log(`  - Oldest UAH rate: ${rows[0].rawDate || oldestUahRateDate} = ${rows[0].rate}`);
          console.log(`  - No row before 2026-06-04? : ${noRateBeforeFirstDate}`);
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - UAH rate history').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await invoicePage.openCustomerInvoicesList();
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
        const created = await invoicePage.clickCreateOnInvoiceList();
        expect(created, 'Create invoice button should work').toBe(true);

        // Set customer - create if needed
        // The partner must EXIST before it can be selected: taking the Customer dropdown's
        // "Create" option on crm-mig raises "Warning! You must first select a partner.", leaves the
        // field empty and then blocks every later click. The partner is a pre-condition of this
        // case, not the thing under test, so it is created over the session's own JSON-RPC and
        // registered for teardown.
        const __partnerId = await platform.createPartnerByName(customerName);
        expect(__partnerId, `The customer ${customerName} should be created before it is selected`).toBeGreaterThan(0);
        registerMigRecord('res.partner', __partnerId, `${customerName} (customer for this case)`);
        const customerSet = await invoicePage.setInvoiceCustomer(customerName);
        expect(customerSet, `Customer ${customerName} should be set`).toBe(true);

        // Set invoice date (before first UAH rate)
        const dateSet = await invoicePage.setInvoiceDate(INVOICE_DATE);
        expect(dateSet, 'Invoice date should be set to 2026-06-03').toBe(true);

        // Set currency
        const currencySet = await invoicePage.setInvoiceCurrency(CURRENCY_CODE);
        expect(currencySet, `Currency ${CURRENCY_CODE} should be set`).toBe(true);

        // Add invoice line
        // The crm-mig invoice form additionally REQUIRES "End User" and "Payment Terms";
        // without them the record never leaves edit mode and the save silently times out.
        // Neither field is mentioned by the TC - raised as an OPEN QUESTION for its author.
        await invoicePage.fillRequiredInvoiceFields(customerName);
        const lineAdded = await invoicePage.addInvoiceLine({
          description: invoiceLineDesc,
          quantity: String(INVOICE_QTY),
          unitPrice: String(INVOICE_UNIT_PRICE),
        });
        expect(lineAdded, 'Invoice line should be added').toBe(true);

        // Save
        const saved = await invoicePage.clickSaveAndWaitForCompletion();
        expect(saved, 'Invoice should be saved').toBe(true);
        await page.waitForTimeout(CommonUtils.waitTimes.standard);

        // Read back the invoice values
        invoiceNumber = await invoicePage.getInvoiceNumber();
        invoiceStatus = await invoicePage.getInvoiceStatus();
        const totalText = await invoicePage.getInvoiceTotal();
        invoiceTotal = money(totalText);

        console.log(`  - Invoice number: ${invoiceNumber}`);
        console.log(`  - Status (before validate): ${invoiceStatus}`);
        console.log(`  - Total: ${invoiceTotal}`);

        // Validate the invoice
        const validated = await invoicePage.clickValidateAndWaitPosted();
        expect(validated, 'Invoice should be validated').toBe(true);
        await page.waitForTimeout(CommonUtils.waitTimes.standard);

        invoiceStatus = await invoicePage.getInvoiceStatus();
        console.log(`  - Status (after validate): ${invoiceStatus}`);

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Invoice created and validated').catch(() => {});

        // Register the invoice for cleanup
        if (invoiceNumber) {
          registerMigRecord('account.invoice', invoiceNumber, customerName);
        }
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        const journalOpened = await invoicePage.openJournalEntryFromOtherInfo();
        expect(journalOpened, 'Journal Entry should open from invoice Other Info tab').toBe(true);

        const journalLines = await invoicePage.getJournalEntryLines();
        console.log(`  - Journal Entry lines found: ${journalLines.length}`);

        let receivableLine = null;
        for (const line of journalLines) {
          // The account name sits in the ACCOUNT column on this build, not Description -
          // match any cell of the row so a column rename cannot fake a "not found".
          if (Object.values(line).join(' ').toLowerCase().includes('receivable')) {
            receivableLine = line;
            break;
          }
        }

        if (receivableLine) {
          journalAmountCurrency = money(receivableLine['Amount Currency']);
          debitFromJournal = money(receivableLine['Debit']);
          console.log(`  - Receivable line Amount Currency: ${journalAmountCurrency}`);
          console.log(`  - Receivable line Debit: ${debitFromJournal}`);
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Journal Entry').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const tolerance = 0.01; // Exact 1:1 match expected
        const usesOneToOne = Math.abs(debitFromJournal - INVOICE_AMOUNT) <= tolerance;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1: No UAH rate exists before 2026-06-04:');
        console.log(`     Expected : Oldest UAH rate >= 2026-06-04`);
        console.log(`     Actual   : ${oldestUahRateDate}`);
        console.log(`     Result   : ${noRateBeforeFirstDate ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Step 2: Invoice created and validated with no error:');
        console.log(`     Expected : Status = Open, Total = 100.00 UAH`);
        console.log(`     Actual   : Status = ${invoiceStatus}, Total = ${invoiceTotal}`);
        console.log(`     Result   : ${invoiceStatus === 'Open' && Math.abs(invoiceTotal - INVOICE_AMOUNT) < 0.01 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Step 3: Journal Entry Receivable line uses 1:1 conversion (no rate fallback):');
        console.log(`     Expected : Debit = 100.00 (exact 1:1 match)`);
        console.log(`     Actual   : Debit = ${debitFromJournal}, Amount Currency = ${journalAmountCurrency}`);
        console.log(`     Uses 1:1? : ${usesOneToOne}`);
        console.log(`     Result   : ${usesOneToOne ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${noRateBeforeFirstDate && invoiceStatus === 'Open' && Math.abs(invoiceTotal - INVOICE_AMOUNT) < 0.01 && usesOneToOne ? 'PASS' : 'FAIL'} - invoice before first UAH rate converted 1:1`);

        let __verifyPassed = false;
        try {
          expect(noRateBeforeFirstDate, 'No UAH rate should exist before 2026-06-04').toBe(true);
          expect(invoiceStatus, 'Invoice status after validation').toBe('Open');
          expect(invoiceTotal, 'Invoice total').toBeCloseTo(INVOICE_AMOUNT, 2);
          expect(Math.abs(debitFromJournal - INVOICE_AMOUNT), 'Journal debit should match 1:1 conversion').toBeLessThanOrEqual(tolerance);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_3.7 - Invoice before first UAH rate converted 1:1',
            passed: __verifyPassed,
            highlight: ['table.o_list_view'],
          }).catch(() => {});
        }
      });
    } finally {
      await test.step(STEP.teardown, async () => {
        console.log(`\n--- ${STEP.teardown} ---`);
        try {
          await teardownMigRecords(page, false);
          console.log('  - Test records deleted');
        } catch (e) {
          console.log(`  ! Teardown error: ${(e as Error).message}`);
        }
      });
    }
  });
});
