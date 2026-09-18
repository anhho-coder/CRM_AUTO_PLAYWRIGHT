import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvoicePage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US1: the company-currency figure does not drift on re-read
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.1.3
 *  Automation-Type : new
 *  Automation-Date : 2026-08-18
 *
 *  Summary:
 *    Take one issued euro invoice from the Invoices list, read its "Total in Company Currency", then
 *    read it twice more - once after a browser reload and once after logging out and back in. All three
 *    reads must be identical to the cent, proving the figure is stored on the document rather than
 *    recalculated on every read.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.1\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - No data needs creating - this case reads an invoice that already exists
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Customers > Invoices, filter to Paid with "Filters" > "Add Custom
 *       Filter" on Status, then isolate the currency with a SECOND custom filter on Currency using the
 *       operator "contains". "Total in Company Currency" is already a default column on this list, and
 *       Open and Paid cannot be combined because Odoo ANDs two separate custom filters
 *    2. Pick one euro invoice, write down its Number and its "Total in Company Currency"
 *    3. Press F5 to reload the browser page, re-apply the column if it is not remembered, find the same
 *       invoice by typing its Number in the search box and pressing Enter, and read the value again
 *    4. Log out, log back in as the same user, and read the value a third time
 *
 *  Verification Point:
 *    3. The value is identical to the value written down in step 2, to the cent
 *    4. The value is identical again after logging out and back in
 *       _ The figure is stored on the document and is not recalculated on each read
 * ===========================================================================
 */

/** The currency whose issued invoice is inspected. */
const CURRENCY_CODE = 'EUR';

/**
 * The status used to isolate an ISSUED invoice. "Paid" is chosen over "Open" because Odoo ANDs two
 * separate custom filters, so Open and Paid cannot be OR-ed as two facets - and every transacting
 * currency has thousands of Paid invoices (EUR 62926, GBP 3173, CHF 1189) while Open is scarce
 * (GBP 8, CHF 1), which left the filtered list empty for GBP.
 */
const ISSUED_STATUS = 'Paid';

/** Parse a money/number string ("EUR 85.85", "$ 114.01", "1,234.56") to a number. */
const money = (s: string | undefined | null): number => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;

test.describe('CRM-11857_1.1.3 - US1: the company-currency figure does not drift on re-read', () => {
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
    // Read-only test: nothing is created, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.1.3: US1 - Re-reading an issued invoice returns exactly the same company-currency figure', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const invoicePage = new InvoicePage(page);

    let invoiceNumber = '';
    let readOne = 0;
    let readTwo = 0;
    let readThree = 0;
    let rawOne = '';
    let rawTwo = '';
    let rawThree = '';

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Step 1-2: Open the Invoices list, isolate one issued euro invoice and read its company-currency figure', async () => {
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.clearListSearchFacets();
      await invoicePage.addInvoiceListCustomFilter('Currency', CURRENCY_CODE, { operator: 'contains' });
      await invoicePage.addInvoiceListCustomFilter('Status', ISSUED_STATUS);

      const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency']);
      invoiceNumber = row['Number'] || '';
      rawOne = row['Total in Company Currency'] || '';
      readOne = money(rawOne);
      console.log(`  - Invoice picked: ${invoiceNumber}`);
      console.log(`  - Read #1 (first look): "${rawOne}" (${readOne})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - read #1 on the Invoices list').catch(() => {});
    });

    await test.step('Step 3: Reload the browser page, find the same invoice by its Number and read the value again', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.searchInvoiceInList(invoiceNumber);
      const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency']);
      rawTwo = row['Total in Company Currency'] || '';
      readTwo = money(rawTwo);
      console.log(`  - Read #2 (after reload): "${rawTwo}" (${readTwo})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - read #2 after reload').catch(() => {});
    });

    await test.step('Step 4: Log out, log back in as the same user and read the value a third time', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await invoicePage.openCustomerInvoicesList();
      await invoicePage.searchInvoiceInList(invoiceNumber);
      const row = await invoicePage.getInvoiceListRowFields(['Number', 'Total in Company Currency']);
      rawThree = row['Total in Company Currency'] || '';
      readThree = money(rawThree);
      console.log(`  - Read #3 (after logout and login): "${rawThree}" (${readThree})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - read #3 after re-login').catch(() => {});
    });

    await test.step('Verification Point 3-4: All three reads of the company-currency figure are identical', async () => {
      console.log('VERIFY - stability of the stored figure:');
      console.log(`  Invoice                            : ${invoiceNumber}`);
      console.log(`  Expected read #2 and #3 to equal #1: ${readOne}`);
      console.log(`  Actual   read #1 / #2 / #3         : ${readOne} / ${readTwo} / ${readThree}`);
      console.log(`  Raw text  #1 / #2 / #3             : "${rawOne}" / "${rawTwo}" / "${rawThree}"`);

      expect(invoiceNumber, 'An issued euro invoice should have been found on the list').toBeTruthy();
      expect(readOne, 'The first read of "Total in Company Currency" should be a positive number').toBeGreaterThan(0);
      expect(readTwo, 'The value after a browser reload should be identical to the first read').toBe(readOne);
      expect(readThree, 'The value after logging out and back in should be identical to the first read').toBe(readOne);
      console.log('  Result: PASS - the figure did not drift across a reload or a new session');
      console.log('✅ CRM-11857_1.1.3 verified: the company-currency figure is stored on the document, not recalculated per read');
    });
  });
});
