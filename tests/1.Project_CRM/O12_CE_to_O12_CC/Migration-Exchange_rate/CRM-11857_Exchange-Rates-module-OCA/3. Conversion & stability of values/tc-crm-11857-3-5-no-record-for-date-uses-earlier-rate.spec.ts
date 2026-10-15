import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, CurrencyPageMig, InvoicePageMig , MigPlatformPage} from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { registerMigRecord, teardownMigRecords } from '@helpers/o12ce-main-business.helper';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_3.5: invoice dated in rate gap uses earlier rate
 * ===========================================================================
 *  Test Case ID    : CRM-11857_3.5
 *  Jira            : CRM-13396
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13396 updated 2026-10-09T06:46:26+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Create a EUR invoice dated 2026-06-29 (a day with no EUR rate - a gap between 2026-06-28 and
 *    2026-06-30). Validate it and read the Journal Entry's Receivable line. The conversion must have
 *    used the rate from 2026-06-28 (the latest rate before the gap), not the rate from 2026-06-30
 *    and not 1:1. No error is raised during validation or posting.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_3\.5:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13396 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - On production, no rate was recorded on 2026-06-29 (missed update day). The crm-mig
 *      data has been migrated from production.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies, open EUR and click
 *     "Rates". Note the Rate of 2026-06-28 as R0 and of 2026-06-30 as R1
 *     Expected Result: No row is dated 2026-06-29
 *                      R0 is different from R1
 *
 *  2. Open Invoicing > Customers > Invoices and click Create. Set Customer =
 *     AUTO-CRM-11857-3.5-<runId> (type the name and click Create), Invoice Date =
 *     2026-06-29, Currency = EUR; add a line with Description = AUTO-CRM-11857-3.5,
 *     Quantity = 1, Unit Price = 100.00; click Save, then Validate
 *     Expected Result: No error is shown
 *                      Status = Open
 *                      Total = 100.00 €
 *
 *  3. Open the Other Info tab and click the Journal Entry
 *     Expected Result: The Receivable line shows Amount Currency = 100.00 € and Debit =
 *                      100.00 / R0, rounded to 2 decimals
 *                      Debit is not 100.00 / R1 and not 100.00
 *
 * ===========================================================================
 */

const CURRENCY_CODE = 'EUR';
const INVOICE_AMOUNT = 100.00;
const INVOICE_QTY = 1;
const INVOICE_UNIT_PRICE = 100.00;
const GAP_DATE = '2026-06-29';
const RATE_DATE_BEFORE = '2026-06-28';
const RATE_DATE_AFTER = '2026-06-30';

const money = (s: string | undefined | null): number =>
  parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig as a user with Billing Manager, Multi Currencies, Settings and Show Full Accounting Features access rights',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open EUR and click "Rates". Note the Rate of 2026-06-28 as R0 and of 2026-06-30 as R1',
  s2: 'Step 2: Open Invoicing > Customers > Invoices and click Create. Set Customer = AUTO-CRM-11857-3.5-<runId> (type the name and click Create), Invoice Date = 2026-06-29, Currency = EUR; add a line with Description = AUTO-CRM-11857-3.5, Quantity = 1, Unit Price = 100.00; click Save, then Validate',
  s3: 'Step 3: Open the Other Info tab and click the Journal Entry',
  verify: 'Verification: the invoice in the rate gap converted using the pre-gap rate (R0), not the post-gap rate (R1) and not 1:1',
  teardown: 'Teardown: delete the test invoice and its customer',
} as const;

test.describe('CRM-11857_3.5 - Exchange Rates: invoice dated on a day with no EUR rate converts at the latest earlier EUR rate', () => {
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

  test('CRM-11857_3.5: Validating an EUR invoice dated on a day with no EUR rate converts it at the latest earlier EUR rate', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const invoicePage = new InvoicePageMig(page);
    const platform = new MigPlatformPage(page);
    const runId = `${Date.now()}`;
    const customerName = `AUTO-CRM-11857-3.5-${runId}`;
    const invoiceLineDesc = `AUTO-CRM-11857-3.5`;

    let gapExists = false;
    let rate28 = 0;
    let rate30 = 0;
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
        await currencyPage.sortListByColumn('Date', 'desc');

        const rows = await currencyPage.getRateRows();
        let foundBefore = false;
        let foundAfter = false;

        for (const row of rows) {
          if (row.date === RATE_DATE_BEFORE) {
            rate28 = row.rate;
            foundBefore = true;
          }
          if (row.date === RATE_DATE_AFTER) {
            rate30 = row.rate;
            foundAfter = true;
          }
        }

        // Check that no row exists for the gap date
        const gapRowExists = rows.some((row) => row.date === GAP_DATE);
        gapExists = !gapRowExists && foundBefore && foundAfter && rate28 !== rate30;

        console.log(`  - Date ${RATE_DATE_BEFORE}: ${rate28}`);
        console.log(`  - Date ${GAP_DATE}: (no row found)`);
        console.log(`  - Date ${RATE_DATE_AFTER}: ${rate30}`);
        console.log(`  - Gap exists (no 2026-06-29, rates differ): ${gapExists}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - EUR rate history').catch(() => {});
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

        // Set invoice date
        const dateSet = await invoicePage.setInvoiceDate('06/29/2026');
        expect(dateSet, 'Invoice date should be set to 2026-06-29').toBe(true);

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
        const expectedDebit = rate28 > 0 ? (INVOICE_AMOUNT / rate28) : 0;
        const tolerance = Math.max(0.05, expectedDebit * 0.002);
        const usedRate28 = Math.abs(debitFromJournal - expectedDebit) <= tolerance;
        const usedRate30 = Math.abs(debitFromJournal - INVOICE_AMOUNT / rate30) <= tolerance;
        const usedOneToOne = Math.abs(debitFromJournal - INVOICE_AMOUNT) <= tolerance;

        console.log('==================== VERIFY ====================');
        console.log('  Verify #1 - Step 1: Rate gap exists (no row for 2026-06-29, and rates differ):');
        console.log(`     Expected : Gap exists with R0 != R1`);
        console.log(`     Actual   : Gap=${gapExists}, R0=${rate28}, R1=${rate30}`);
        console.log(`     Result   : ${gapExists ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #2 - Step 2: Invoice created and validated with no error:');
        console.log(`     Expected : Status = Open, Total = 100.00 EUR`);
        console.log(`     Actual   : Status = ${invoiceStatus}, Total = ${invoiceTotal}`);
        console.log(`     Result   : ${invoiceStatus === 'Open' && Math.abs(invoiceTotal - INVOICE_AMOUNT) < 0.01 ? 'PASS' : 'FAIL'}`);

        console.log('  Verify #3 - Step 3: Journal Entry Receivable line uses R0 (pre-gap rate), not R1 or 1:1:');
        console.log(`     Expected : Debit = 100.00 / ${rate28} = ${expectedDebit.toFixed(2)} (tolerance +/- ${tolerance.toFixed(4)})`);
        console.log(`     Actual   : Debit = ${debitFromJournal}, Amount Currency = ${journalAmountCurrency}`);
        console.log(`     Uses R0? : ${usedRate28}, Uses R1? : ${usedRate30}, Uses 1:1? : ${usedOneToOne}`);
        console.log(`     Result   : ${usedRate28 && !usedRate30 && !usedOneToOne ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${gapExists && invoiceStatus === 'Open' && Math.abs(invoiceTotal - INVOICE_AMOUNT) < 0.01 && usedRate28 && !usedRate30 && !usedOneToOne ? 'PASS' : 'FAIL'} - invoice in rate gap converted at pre-gap rate`);

        let __verifyPassed = false;
        try {
          expect(gapExists, 'Rate gap should exist (no 2026-06-29, rates differ)').toBe(true);
          expect(invoiceStatus, 'Invoice status after validation').toBe('Open');
          expect(invoiceTotal, 'Invoice total').toBeCloseTo(INVOICE_AMOUNT, 2);
          expect(Math.abs(debitFromJournal - expectedDebit), 'Journal debit should match pre-gap rate conversion').toBeLessThanOrEqual(tolerance);
          expect(usedRate30, 'Should NOT use post-gap rate').toBe(false);
          expect(usedOneToOne, 'Should NOT use 1:1 fallback').toBe(false);
          __verifyPassed = true;
        } finally {
          await CommonUtils.captureVerifyEvidence(page, testInfo, {
            name: 'CRM-11857_3.5 - Invoice in rate gap converted at pre-gap rate',
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
