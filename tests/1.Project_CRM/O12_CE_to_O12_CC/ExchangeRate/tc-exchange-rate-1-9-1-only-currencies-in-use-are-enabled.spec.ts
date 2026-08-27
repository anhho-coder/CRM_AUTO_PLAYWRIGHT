import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US9: only the currencies in use are enabled
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.9.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Read the Currencies list with no filter and verify the enabled set is exactly the seven currencies
 *    the business transacts in. Then apply the "Archived" filter and verify it is not empty - the unused
 *    currencies were disabled rather than deleted, so the starting set is clean while nothing was lost.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.9\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies without changing any filter
 *       and write down every Currency listed
 *    2. Read the pager at the top right to confirm the count
 *    3. Click "Filters" and select "Inactive" (this build labels the filter "Inactive", not "Archived") after dropping the default "Active" facet, then read the pager again
 *    4. Remove the "Inactive" filter by clicking the small x on its tag in the search bar
 *    5. Open the Invoicing module > Customers > Invoices, click "CREATE", set Customer =
 *       "Cust-Set-<unique>", open the "Other Info" tab and click the "Currency" drop-down
 *    6. Write down every currency offered, then click "DISCARD" so no invoice is left behind
 *       _ Steps 5 and 6 are MANUAL for now - see the automation notes.
 *
 *  Verification Point:
 *    2. The set of enabled currencies EQUALS exactly {USD, EUR, GBP, CHF, IDR, INR, UAH}, count = 7
 *    3. The archived list is not empty, so the currencies that are not in use are still on file rather
 *       than deleted
 *
 *  Automation notes:
 *    - The manual case also opens a new invoice and reads its Currency drop-down to prove only the enabled
 *      currencies are offered. That checkpoint needs the create-an-invoice surface, which this repo does
 *      not have yet (invoices are only created through Opportunity > Deal Element > New Quotation >
 *      Create Invoice). It is covered indirectly here: Odoo only offers ACTIVE records in a many2one, so
 *      the enabled set read in step 1 is the set a drop-down can offer. The direct check is added when the
 *      invoice-creation surface lands.
 * ===========================================================================
 */

/** The currencies the business transacts in - the set that must be enabled, and nothing else. */
const CURRENCIES_IN_USE = ['USD', 'EUR', 'GBP', 'CHF', 'IDR', 'INR', 'UAH'];

test.describe('CRM-11857_1.9.1 - US9: only the currencies in use are enabled', () => {
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
    // Read-only test: only a search filter is toggled, and no record is created or changed.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.9.1: US9 - Only the currencies the business uses are enabled, and the unused ones remain on file but disabled', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let enabledCodes: string[] = [];
    let enabledCount = 0;
    let inactiveApplied = false;
    let inactiveCodes: string[] = [];
    let inactiveCount = 0;

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
    });

    await test.step('Step 1-2: Open the Currencies list with no filter and read every Currency plus the pager count', async () => {
      await currencyPage.openCurrenciesList();
      enabledCodes = await currencyPage.getListedCurrencyCodes();
      enabledCount = await currencyPage.getListTotalCount();
      console.log(`  - Enabled currencies (${enabledCodes.length} read, pager says ${enabledCount}): ${enabledCodes.join(', ')}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - enabled currencies').catch(() => {});
    });

    await test.step('Step 3-4: Drop the default "Active" facet, apply the "Inactive" filter, read the pager, then reset the list', async () => {
      inactiveApplied = await currencyPage.applyInactiveFilter();
      if (inactiveApplied) {
        inactiveCodes = await currencyPage.getListedCurrencyCodes();
        inactiveCount = await currencyPage.getListTotalCount();
        console.log(`  - Inactive (disabled) currencies (pager says ${inactiveCount}); first few: ${inactiveCodes.slice(0, 10).join(', ')}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3-4 - archived currencies').catch(() => {});
      // Leave the list as it was found: drop the filter again.
      await currencyPage.openCurrenciesList();
    });

    await test.step('Verification Point 2: The enabled set is exactly the seven currencies in use', async () => {
      const sortedActual = [...enabledCodes].sort();
      const sortedExpected = [...CURRENCIES_IN_USE].sort();
      const extra = sortedActual.filter((c) => !sortedExpected.includes(c));
      const missing = sortedExpected.filter((c) => !sortedActual.includes(c));

      console.log('VERIFY - the enabled currency set:');
      console.log(`  Expected set (count ${sortedExpected.length}) : ${sortedExpected.join(', ')}`);
      console.log(`  Actual   set (count ${sortedActual.length}) : ${sortedActual.join(', ')}`);
      console.log(`  Unexpected extras               : ${extra.length ? extra.join(', ') : 'none'}`);
      console.log(`  Missing from the list           : ${missing.length ? missing.join(', ') : 'none'}`);

      expect(sortedActual, 'The enabled currencies should be exactly the seven the business transacts in').toEqual(sortedExpected);
      expect(enabledCount, 'The pager should report exactly seven enabled currencies').toBe(CURRENCIES_IN_USE.length);
      console.log('  Result: PASS - the starting set is clean: exactly the seven currencies in use, nothing else');
    });

    await test.step('Verification Point 3: The archived list is not empty, so unused currencies were disabled and not deleted', async () => {
      console.log('VERIFY - unused currencies are disabled rather than deleted:');
      console.log(`  Expected "Inactive" filter to be available : yes`);
      console.log(`  Actual   "Inactive" filter applied         : ${inactiveApplied}`);
      console.log(`  Expected inactive count                    : > 0`);
      console.log(`  Actual   inactive count                    : ${inactiveCount}`);

      expect(inactiveApplied, 'The "Inactive" filter should be offered on the Currencies list').toBe(true);
      expect(inactiveCount, 'The archived list should not be empty - unused currencies are kept, only disabled').toBeGreaterThan(0);
      expect(
        inactiveCodes.some((c) => !CURRENCIES_IN_USE.includes(c)),
        'At least one archived currency should be outside the in-use set, proving those records still exist'
      ).toBe(true);
      console.log('  Result: PASS - the unused currencies are still on file, just disabled');
      console.log('✅ CRM-11857_1.9.1 verified: only the currencies in use are enabled; the rest are disabled rather than deleted');
    });
  });
});
