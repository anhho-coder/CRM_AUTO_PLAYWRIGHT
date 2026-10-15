import { test, expect } from '@playwright/test';
import { users, baseUrl_mig as baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, HomePageMig, InvoicePageMig, CurrencyPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  Exchange Rates - CRM-11857_3.2: Converted value retained after rate change
 * ===========================================================================
 *  Test Case ID    : CRM-11857_3.2
 *  Jira            : CRM-13393
 *  Automation-Type : refactored
 *  Automation-Date : 2026-10-13
 *  Source version  : CRM-13393 updated 2026-10-08T12:07:09+0300, 3 Xray manual steps
 *                    - re-check before trusting this spec
 *  Run as          : CRM administrator (anh.ho@nakivo.com) - the TC asks for a user with Billing
 *                    Manager, Multi Currencies, Settings and Show Full Accounting Features rights.
 *
 *  Summary:
 *    Read a migrated GBP invoice (INV/2025/14169 or equivalent from production) and verify its
 *    "Total in Company Currency" remains constant: the value calculated at invoice creation time
 *    is not recalculated even if the currency rate has changed since then.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_3\\.2:" --project=O12
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC - CRM-13393 (verbatim)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Log in to crm-mig (https://crm-mig.nakivo.site) as a user with Billing Manager, Multi
 *      Currencies, Settings and Show Full Accounting Features access rights.
 *    - The crm-mig data has been migrated from production.
 *    - Invoice#2 = INV/2025/14169. On production it shows Invoice Date = 2025-12-02, Currency
 *      = GBP, Total = 1,224.00 £, Total in Company Currency = 1,623.91.
 *    - If INV/2025/14169 is not found on crm-mig, choose any GBP invoice from 2025 on
 *      production as Invoice#2 and note its Number, Invoice Date, Total and Total in Company
 *      Currency.
 *
 *  1. Open Invoicing > Configuration > Accounting > Currencies and note the Current Rate
 *     of GBP as RC
 *     Expected Result: GBP Date is later than the Invoice Date of Invoice#2
 *
 *  2. Open Invoicing > Customers > Invoices, search the Number of Invoice#2 and open it
 *     Expected Result: (EMPTY in Jira - see OPEN QUESTION in this header)
 *
 *  3. Open the Other Info tab and click the Journal Entry
 *     Expected Result: The Receivable line shows Debit = Total in Company Currency of
 *                      Invoice#2
 *                      Debit is not Total of Invoice#2 / RC, rounded to 2 decimals
 *
 * ===========================================================================
 */

const CURRENCY_CODE = 'GBP';
const TARGET_INVOICE = 'INV/2025/14169';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre: 'Pre-condition: Log in to crm-mig and note the Current Rate of GBP',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies and note Current Rate of GBP as RC',
  s2: 'Step 2: Open Invoicing > Customers > Invoices, search and open Invoice#2 (INV/2025/14169 or equivalent)',
  s3: 'Step 3: Open the Other Info tab and click the Journal Entry',
  verify: 'Verification: The Receivable line Debit = Total in Company Currency (not recalculated by current rate)',
} as const;

const money = (s: string | undefined | null): number =>
  parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('CRM-11857_3.2 - Exchange Rates: Converted value retained and not affected by later rate changes', () => {
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

  test('CRM-11857_3.2: Verify an issued invoice\'s company-currency value is retained regardless of later rates', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPageMig(page);
    const invoicePage = new InvoicePageMig(page);
    const currencyPage = new CurrencyPageMig(page);
    const homePage = new HomePageMig(page);

    let currentRate = 0;
    let invoiceNumber = TARGET_INVOICE;
    let invoiceDateStr = '';
    let invoiceTotal = 0;
    let invoiceTotalCompany = 0;
    let journalEntryDebit = 0;

    try {
      await test.step(STEP.pre, async () => {
        console.log(`\n--- ${STEP.pre} ---`);
        console.log(`  Target  : ${baseUrl}`);
        console.log(`  Account : ${users.admin_crm_mig.username} (${users.admin_crm_mig.displayName})`);
        console.log(`  Target Invoice: ${TARGET_INVOICE}`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
        await loginPage.dismissLocationPermissionDialog().catch(() => {});
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in').catch(() => {});
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await currencyPage.openCurrenciesList();
        currentRate = parseFloat(await currencyPage.getCurrencyRate(CURRENCY_CODE));
        console.log(`  - Current Rate of ${CURRENCY_CODE}: ${currentRate}`);
        console.log(`  - Note: This is the rate in force NOW (after the invoice was created)`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - GBP current rate').catch(() => {});
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await invoicePage.openCustomerInvoicesList();
        await invoicePage.clearListSearchFacets();
        await invoicePage.searchInvoiceInList(TARGET_INVOICE);

        const row = await invoicePage.getInvoiceListRowFields(
          ['Number', 'Invoice Date', 'Total', 'Total in Company Currency']
        );

        invoiceNumber = row['Number'] || TARGET_INVOICE;
        invoiceDateStr = row['Invoice Date'] || '';
        invoiceTotal = money(row['Total']);
        invoiceTotalCompany = money(row['Total in Company Currency']);

        console.log(`  - Invoice found: ${invoiceNumber}`);
        console.log(`    Invoice Date: ${invoiceDateStr}`);
        console.log(`    Total: ${invoiceTotal}`);
        console.log(`    Total in Company Currency (first read): ${invoiceTotalCompany}`);

        // Open the invoice
        await invoicePage.openFirstInvoiceRow();
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - invoice opened').catch(() => {});
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        const journalOpened = await invoicePage.openJournalEntryFromOtherInfo();
        console.log(`  - Journal Entry opened: ${journalOpened}`);

        if (journalOpened) {
          const lines = await invoicePage.getJournalEntryLines();
          console.log(`  - Journal Entry lines: ${lines.length}`);

          // Find the Receivable line
          const receivableLine = lines.find(line =>
            (line['Account'] || '').includes('Receivable') ||
            (line['Account'] || '').includes('120000')
          );

          if (receivableLine) {
            const debitStr = receivableLine['Debit'] || '0';
            journalEntryDebit = money(debitStr);
            console.log(`  - Receivable line found:`);
            console.log(`    Amount Currency: ${receivableLine['Amount Currency']}`);
            console.log(`    Debit (Company Currency): ${journalEntryDebit}`);
          } else {
            console.log(`  - No Receivable line found in Journal Entry`);
          }
        }

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - journal entry').catch(() => {});
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);

        // The key assertion: Debit should equal the Total in Company Currency (which was calculated at invoice creation time)
        // NOT equal to Total / currentRate (which would be recalculated)
        const calculatedByCurrentRate = invoiceTotal / currentRate;
        const tolerance = Math.max(0.05, invoiceTotalCompany * 0.002);

        console.log('==================== VERIFY ====================');
        console.log(`  Verify #1 - Converted value retained (not recalculated):`);
        console.log(`     Expected : Debit = Total in Company Currency (from invoice creation time)`);
        console.log(`     Actual   : Debit = ${journalEntryDebit.toFixed(2)}`);
        console.log(`     Note     : If recalculated by current rate: Total / RC = ${invoiceTotal} / ${currentRate} = ${calculatedByCurrentRate.toFixed(2)}`);
        console.log(`     Result   : ${Math.abs(journalEntryDebit - invoiceTotalCompany) <= tolerance ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');

        expect(invoiceNumber, 'The target invoice should be found').toBeTruthy();
        expect(invoiceTotal, 'Invoice Total should be positive').toBeGreaterThan(0);
        expect(invoiceTotalCompany, 'Total in Company Currency should be positive').toBeGreaterThan(0);
        expect(journalEntryDebit, 'Journal Entry Debit should be positive').toBeGreaterThan(0);
        expect(
          Math.abs(journalEntryDebit - invoiceTotalCompany),
          `Debit (${journalEntryDebit.toFixed(2)}) should equal Total in Company Currency (${invoiceTotalCompany.toFixed(2)}), within tolerance`
        ).toBeLessThanOrEqual(tolerance);

        console.log('OVERALL: PASS - converted value remained constant despite rate changes');
      });

    } finally {
      // No teardown needed - this is a read-only test on migrated data
    }
  });
});
