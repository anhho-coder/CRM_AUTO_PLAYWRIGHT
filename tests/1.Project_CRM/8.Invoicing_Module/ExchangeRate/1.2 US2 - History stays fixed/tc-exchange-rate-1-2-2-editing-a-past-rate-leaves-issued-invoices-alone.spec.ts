import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US2: editing a past rate must not touch issued documents
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.2.2
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Take an issued euro invoice, find the rate row that applied on its Invoice Date, and change that rate
 *    to a clearly different value. The invoice's "Total in Company Currency" must not move - it was
 *    computed and stored when the document was issued, and correcting the rate table afterwards must not
 *    rewrite accounting that has already been reported. The rate is then restored and the figure re-read.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.2\.2:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - Pick one existing issued euro invoice, write down its Number, its Invoice Date and its "Total in
 *      Company Currency" (use the Invoices list with the column shown)
 *    - On Currencies > EUR > the "Rates" button, find the rate row that applies to that invoice date and
 *      write down its Date and its Rate to six decimals
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies, click "EUR", click the
 *       "Rates" button, and find the rate row written down in the pre-conditions
 *    2. Click its Rate cell, replace the value with a clearly different one (the original plus 0.05) and
 *       click "SAVE"
 *    3. Open the Invoicing module > Customers > Invoices, search the invoice by its Number, press Enter
 *       and read "Total in Company Currency"
 *    4. Return to the EUR "Currency Rates" list, restore the Rate to the exact original value written down
 *       in the pre-conditions and click "SAVE"
 *    5. Read the invoice's "Total in Company Currency" once more
 *
 *  Verification Point:
 *    3. The invoice's "Total in Company Currency" is identical to the value written down in the
 *       pre-conditions
 *       _ Editing the rate of a past date does not rewrite a document that was already issued
 *    5. The value is still identical after the rate has been restored
 *       _ The environment is left exactly as it was found
 *
 *  Automation notes:
 *    - This case changes a LIVE historical EUR rate, the most-used currency here, so the restore is
 *      treated as part of the contract rather than housekeeping. Step 4 restores on the happy path; a
 *      `finally` block restores again if the run broke before reaching it; and the rate actually on file is
 *      then read back and ASSERTED against the original. A run cannot report green while a wrong EUR rate
 *      is still stored.
 *    - The rate is recorded and restored to SIX decimals, which is what the list renders. Restoring a
 *      rounded value would leave a different number on file than the one found.
 *    - The invoice is re-read by SEARCHING its Number rather than by row position, so the comparison
 *      cannot drift onto a different invoice. Facets are cleared between passes because a hash navigation
 *      does not reset the search bar.
 * ===========================================================================
 */

/** Set to true to skip this case without deleting it - it WRITES to the shared rate table. */
const SKIP_MUTATING_TESTS = false;

const CURRENCY_CODE = 'EUR';
/** Paid is used because Odoo ANDs two separate custom filters, so Open and Paid cannot be OR-ed. */
const ISSUED_STATUS = 'Paid';
/** How far the rate is moved away from the original, so a leak into the invoice would be unmistakable. */
const RATE_OFFSET = 0.05;

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

const describeBlock = SKIP_MUTATING_TESTS ? test.describe.skip : test.describe;

describeBlock('CRM-11857_1.2.2 - US2: editing a past rate must not touch issued documents', () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'beforeEach - cookies cleared').catch(() => {});
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.2.2: US2 - Changing the rate of a past date does not alter an invoice already issued on that date', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);
    const currencyPage = new CurrencyPage(page);

    let invoiceNumber = '';
    let invoiceDate = '';
    let companyTotalBefore = '';
    let companyTotalBeforeNumeric = 0;
    let companyTotalAfterEdit = '';
    let companyTotalAfterRestore = '';

    let rateRowDate = '';
    let originalRate = '';
    let changedRate = '';
    let rateChanged = false;
    let restored = false;
    let rateOnFileAfterRestore = '';

    /** Read one invoice's "Total in Company Currency" by searching its Number. */
    const readCompanyTotal = async (): Promise<string> => {
      await invoicePage.openCustomerInvoicesList();
      // A hash navigation does not reset the search bar, so drop any facet left by the previous pass.
      await invoicePage.clearListSearchFacets();
      await invoicePage.searchInvoiceInList(invoiceNumber);
      const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency']);
      expect(row['Number'], `The invoice re-read should be ${invoiceNumber}, not ${row['Number']}`).toBe(invoiceNumber);
      return row['Total in Company Currency'] || '';
    };

    /** Restore the original rate and report whether the list accepted the save. */
    const restoreRate = async (): Promise<boolean> => {
      await currencyPage.discardEditableList().catch(() => {});
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      const ok = await currencyPage.setRateForDate(rateRowDate, originalRate);
      const rows = await currencyPage.getRateRows();
      const row = rows.find((r) => r.rawDate === rateRowDate);
      rateOnFileAfterRestore = row ? row.rate.toFixed(6) : '';
      console.log(`  - ${CURRENCY_CODE} rate on file for ${rateRowDate} after restore: ${rateOnFileAfterRestore || 'row not found'}`);
      return ok;
    };

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step(`Pre-condition: Pick one issued ${CURRENCY_CODE} invoice and write down its Number, Invoice Date and "Total in Company Currency"`, async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.addInvoiceListCustomFilter('Currency', CURRENCY_CODE, { operator: 'contains' });
      await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

      const rowsInList = await invoicePage.getInvoiceListRowCount();
      expect(rowsInList, `At least one issued ${CURRENCY_CODE} invoice is needed to run this case`).toBeGreaterThan(0);

      const row = await invoicePage.getInvoiceListRowFields(['Number', 'Invoice Date', 'Total in Company Currency']);
      invoiceNumber = row['Number'] || '';
      invoiceDate = row['Invoice Date'] || '';
      companyTotalBefore = row['Total in Company Currency'] || '';
      companyTotalBeforeNumeric = money(companyTotalBefore);

      console.log(`  - Invoice picked: ${invoiceNumber} dated ${invoiceDate}`);
      console.log(`  - Total in Company Currency recorded: ${companyTotalBefore}`);
      expect(invoiceNumber, 'An Invoice Number should have been recorded').toBeTruthy();
      expect(invoiceDate, 'An Invoice Date should have been recorded').toBeTruthy();
      expect(companyTotalBeforeNumeric, '"Total in Company Currency" should be a positive number').toBeGreaterThan(0);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - issued invoice recorded').catch(() => {});
    });

    await test.step(`Pre-condition: Find the ${CURRENCY_CODE} rate row that applies to the invoice date and write down its Date and Rate`, async () => {
      await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      const isoInvoiceDate = CurrencyPage.toIsoDate(invoiceDate);
      const applicable = await currencyPage.getRateApplicableToDate(isoInvoiceDate);
      expect(
        applicable,
        `A ${CURRENCY_CODE} rate effective on or before the invoice date ${isoInvoiceDate} is needed to run this case`
      ).not.toBeNull();

      rateRowDate = applicable!.rawDate;
      originalRate = applicable!.rate.toFixed(6);
      changedRate = (applicable!.rate + RATE_OFFSET).toFixed(6);
      console.log(`  - Invoice date ${invoiceDate} (${isoInvoiceDate}) converts at the row dated ${rateRowDate}`);
      console.log(`  - Original rate recorded: ${originalRate}; it will be changed to ${changedRate}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - applicable rate row recorded').catch(() => {});
    });

    try {
      await test.step('Step 1-2: Change the Rate of the row that applies to the invoice date, then "SAVE"', async () => {
        const saved = await currencyPage.setRateForDate(rateRowDate, changedRate);
        rateChanged = saved;
        expect(saved, `The ${CURRENCY_CODE} rate row dated ${rateRowDate} should have accepted ${changedRate}`).toBe(true);

        const rows = await currencyPage.getRateRows();
        const row = rows.find((r) => r.rawDate === rateRowDate);
        console.log(`  - ${CURRENCY_CODE} rate on file for ${rateRowDate} is now ${row ? row.rate.toFixed(6) : 'row not found'}`);
        expect(row?.rate, `The stored rate for ${rateRowDate} should be the value just entered`)
          .toBeCloseTo(parseFloat(changedRate), 6);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - past rate changed').catch(() => {});
      });

      await test.step('Step 3: Search the invoice by its Number and read "Total in Company Currency"', async () => {
        companyTotalAfterEdit = await readCompanyTotal();
        console.log(`  - ${invoiceNumber} reads Total in Company Currency ${companyTotalAfterEdit} while the past rate is ${changedRate}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - invoice read while the rate is changed').catch(() => {});
      });

      await test.step('Verification Point 3: the issued figure is unchanged by the rate edit', async () => {
        console.log('VERIFY - an issued invoice against an edited past rate:');
        console.log(`  Invoice                     : ${invoiceNumber} dated ${invoiceDate}`);
        console.log(`  Rate on ${rateRowDate} moved       : ${originalRate} -> ${changedRate}`);
        console.log(`  Expected Total in Company Currency: ${companyTotalBefore}`);
        console.log(`  Actual   Total in Company Currency: ${companyTotalAfterEdit}`);

        expect(
          money(companyTotalAfterEdit),
          `${invoiceNumber} was issued and reported at ${companyTotalBefore}. Correcting the rate table for ` +
            `${rateRowDate} afterwards must not rewrite it, but it now reads ${companyTotalAfterEdit}.`
        ).toBeCloseTo(companyTotalBeforeNumeric, 2);
        console.log('  Result: PASS - editing the rate of a past date does not rewrite a document already issued');
      });

      await test.step('Step 4: Restore the Rate to its exact original value, then "SAVE"', async () => {
        const ok = await restoreRate();
        restored = ok && rateOnFileAfterRestore === originalRate;
        console.log(`  - Restore accepted: ${ok}; rate on file matches the original: ${rateOnFileAfterRestore === originalRate}`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - past rate restored').catch(() => {});
      });

      await test.step('Step 5: Read the invoice\'s "Total in Company Currency" once more', async () => {
        companyTotalAfterRestore = await readCompanyTotal();
        console.log(`  - ${invoiceNumber} reads Total in Company Currency ${companyTotalAfterRestore} after the restore`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - invoice read after the restore').catch(() => {});
      });

      await test.step('Verification Point 5: the figure is still identical after the rate has been restored', async () => {
        console.log('VERIFY - the issued figure after the restore:');
        console.log(`  Expected Total in Company Currency: ${companyTotalBefore}`);
        console.log(`  Actual   Total in Company Currency: ${companyTotalAfterRestore}`);
        expect(
          money(companyTotalAfterRestore),
          `${invoiceNumber} should still read ${companyTotalBefore} once the rate is back to ${originalRate}`
        ).toBeCloseTo(companyTotalBeforeNumeric, 2);
        console.log('  Result: PASS - the issued figure never moved, in either direction');
      });
    } finally {
      await test.step('Teardown: make sure the original rate is the one on file', async () => {
        // Step 4 restores on the happy path. This is the net for a run that broke before reaching it - and
        // the gate that stops a green report while a wrong EUR rate is still stored. The try/catch wraps
        // only the ACTIONS; the verdict is asserted afterwards, outside it, or the catch would swallow it.
        try {
          if (rateChanged && !restored) {
            console.log('  - The rate was changed but not restored on the happy path; restoring now');
            await restoreRate();
          } else if (rateChanged) {
            console.log('  - The rate was already restored in step 4; confirming what is on file');
            await currencyPage.discardEditableList().catch(() => {});
            await currencyPage.openRatesForCurrency(CURRENCY_CODE);
            const rows = await currencyPage.getRateRows();
            const row = rows.find((r) => r.rawDate === rateRowDate);
            rateOnFileAfterRestore = row ? row.rate.toFixed(6) : '';
            console.log(`  - ${CURRENCY_CODE} rate on file for ${rateRowDate}: ${rateOnFileAfterRestore || 'row not found'}`);
          }
        } catch (e) {
          console.log(`  ⚠ Teardown actions could not complete: ${(e as Error).message}. Set the ${CURRENCY_CODE} rate for ${rateRowDate} back to ${originalRate} by hand.`);
        }
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Teardown - EUR rate restored').catch(() => {});

        if (rateChanged) {
          expect(
            rateOnFileAfterRestore,
            `The ${CURRENCY_CODE} rate for ${rateRowDate} must be back to exactly ${originalRate}. It is ` +
              `${rateOnFileAfterRestore || 'not readable'}. ${CURRENCY_CODE} is the most-used currency here, so ` +
              `set it back by hand before anyone reads a converted figure.`
          ).toBe(originalRate);
        }
      });
    }
  });
});
