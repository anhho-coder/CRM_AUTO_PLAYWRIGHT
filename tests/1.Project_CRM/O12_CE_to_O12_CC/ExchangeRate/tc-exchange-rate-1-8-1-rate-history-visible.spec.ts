import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US8: a currency's rate history is reachable and readable
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.8.1
 *  Automation-Type : new
 *  Automation-Date : 2026-08-18
 *
 *  Summary:
 *    As a CRM administrator, open Invoicing > Configuration > Accounting > Currencies, open EUR and
 *    click the "Rates" button in the button box at the top right. Verify the separate "Currency Rates"
 *    list opens with the breadcrumb "Currencies / EUR / Currency Rates", the columns Date | Rate |
 *    Company, more than one dated row, distinct dates, and that the rate history has NO menu entry of
 *    its own under Invoicing > Configuration (it is reachable only from a currency).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.8\.1:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Login as a CRM administrator with accounting-configuration rights (e.g. Anh Ho)
 *    - EUR has rate rows on several dates
 *
 *  Steps to reproduce:
 *    1. Open the Invoicing module > Configuration > Accounting > Currencies and click the row whose
 *       Currency is "EUR"
 *    2. Click the "Rates" button in the box at the top right of the currency form, to the left of the
 *       Active / Inactive marker
 *    3. Read the title of the list that opens, its breadcrumb and its column headers
 *    4. Read the pager at the top right to see how many rows the history holds, and click the Date
 *       column header to sort by date
 *    5. Go back through the Invoicing module menus looking for a separate rate or rate-history entry
 *       of its own
 *
 *  Verification Point:
 *    3. A list titled "Currency Rates" opens, breadcrumb "Currencies / EUR / Currency Rates"
 *       _ Its columns are Date, Rate and Company
 *    4. The pager shows more than one row, so past rates and not only the current one are on file
 *       _ The list can be sorted by Date
 *    5. No separate rate or rate-history menu entry exists anywhere under the Invoicing module, count = 0
 *       _ The history is reachable only from the currency itself, exactly as it is today
 * ===========================================================================
 */

/** The currency whose history is inspected. EUR is the busiest transacting currency on pre-prod. */
const CURRENCY_CODE = 'EUR';

test.describe('CRM-11857_1.8.1 - US8: rate history is reachable from the currency', () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // Boundary screenshot (REQUIREMENT #3): end of beforeEach. Guarded - no UI yet, so best-effort.
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

  test('CRM-11857_1.8.1: US8 - A currency rate history is reachable from the currency itself', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let breadcrumbText = '';
    let columnHeaders: string[] = [];
    let historyRowCount = 0;
    let configurationLabels: string[] = [];
    let sortedDates: string[] = [];

    await test.step('Pre-condition: Login as a CRM administrator with accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as the CRM administrator (${users.admin_crm.username})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - logged in as administrator').catch(() => {});
    });

    await test.step('Step 1-2: Open Currencies, click the EUR row, then click the "Rates" button at the top right', async () => {
      const currencyId = await currencyPage.openRatesForCurrency(CURRENCY_CODE);
      console.log(`  - ${CURRENCY_CODE} currency record id: ${currencyId || 'unknown'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1-2 - Currency Rates list opened from the currency').catch(() => {});
    });

    await test.step('Step 3: Read the title of the list that opens, its breadcrumb and its column headers', async () => {
      breadcrumbText = await currencyPage.getBreadcrumbText();
      columnHeaders = await currencyPage.getListColumnHeaders();
      console.log(`  - Breadcrumb : "${breadcrumbText}"`);
      console.log(`  - Columns    : ${columnHeaders.join(' | ')}`);
    });

    await test.step('Step 4: Read the pager to see how many rows the history holds, and sort by the Date column', async () => {
      historyRowCount = await currencyPage.getListTotalCount();
      await currencyPage.sortListByColumn('Date', 'desc');
      const rows = await currencyPage.getRateRows();
      sortedDates = rows.map((r) => r.date);
      console.log(`  - Rows in the ${CURRENCY_CODE} history (pager total): ${historyRowCount}`);
      console.log(`  - Newest 5 dates after sorting Date descending: ${sortedDates.slice(0, 5).join(', ')}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - history sorted by Date descending').catch(() => {});
    });

    await test.step('Step 5: Look through the Invoicing module menus for a separate rate or rate-history entry', async () => {
      // Enter the module from the Applications launcher, not by an action hash: a hash deep-link renders
      // the action but leaves the navbar without the module's own menu sections, so "Configuration"
      // would not be there to read.
      const moduleOpened = await currencyPage.openModuleFromApplications('Invoicing');
      console.log(`  - Invoicing module menu bar rendered: ${moduleOpened}`);
      configurationLabels = await currencyPage.getConfigurationMenuLabels();
      console.log(`  - Invoicing > Configuration entries: ${configurationLabels.join(' | ')}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Invoicing Configuration menu entries').catch(() => {});
    });

    await test.step('Verification Point 3: The "Currency Rates" list opens with the expected breadcrumb and columns', async () => {
      console.log('VERIFY - list identity:');
      console.log(`  Expected breadcrumb to contain : "Currencies", "${CURRENCY_CODE}", "Currency Rates"`);
      console.log(`  Actual breadcrumb              : "${breadcrumbText}"`);
      console.log(`  Expected columns to include    : Date, Rate, Company`);
      console.log(`  Actual columns                 : ${columnHeaders.join(' | ')}`);

      expect(breadcrumbText, 'The breadcrumb should show the Currencies list as the parent').toContain('Currencies');
      expect(breadcrumbText, `The breadcrumb should name the currency "${CURRENCY_CODE}"`).toContain(CURRENCY_CODE);
      expect(breadcrumbText, 'The breadcrumb should end on the "Currency Rates" list').toContain('Currency Rates');
      expect(columnHeaders, 'The Currency Rates list should carry a "Date" column').toContain('Date');
      expect(columnHeaders, 'The Currency Rates list should carry a "Rate" column').toContain('Rate');
      expect(columnHeaders, 'The Currency Rates list should carry a "Company" column').toContain('Company');
      console.log('  Result: PASS - the rate history opens as its own "Currency Rates" list with Date | Rate | Company');
    });

    await test.step('Verification Point 4: More than one dated row is on file and the dates are distinct', async () => {
      const distinctDates = new Set(sortedDates);
      const isDescending = sortedDates.every((d, i) => i === 0 || sortedDates[i - 1] >= d);

      console.log('VERIFY - history contents:');
      console.log(`  Expected rows in history       : > 1`);
      console.log(`  Actual rows in history         : ${historyRowCount}`);
      console.log(`  Expected loaded dates          : all distinct, sorted newest first`);
      console.log(`  Actual loaded / distinct dates : ${sortedDates.length} / ${distinctDates.size}`);
      console.log(`  Actual sorted descending       : ${isDescending}`);

      expect(historyRowCount, 'The rate history should hold more than one row, so past rates are on file').toBeGreaterThan(1);
      expect(sortedDates.length, 'At least one rate row should be readable from the list').toBeGreaterThan(0);
      expect(distinctDates.size, 'Every loaded row should carry its own date - no date appears twice').toBe(sortedDates.length);
      expect(isDescending, 'After sorting by Date descending the newest date should come first').toBe(true);
      console.log('  Result: PASS - past rates are on file, one row per date, and the list sorts by Date');
    });

    await test.step('Verification Point 5: The rate history has no menu entry of its own under Invoicing', async () => {
      const rateMenuEntries = configurationLabels.filter((label) => /\brate/i.test(label));

      console.log('VERIFY - no separate rate-history menu:');
      console.log(`  Expected rate-named entries under Invoicing > Configuration : 0`);
      console.log(`  Actual rate-named entries                                   : ${rateMenuEntries.length}${rateMenuEntries.length ? ` (${rateMenuEntries.join(', ')})` : ''}`);

      expect(configurationLabels.length, 'The Invoicing > Configuration menu should have been read').toBeGreaterThan(0);
      expect(
        rateMenuEntries,
        'No rate / rate-history entry of its own should exist under Invoicing > Configuration - the history is reachable only from a currency'
      ).toHaveLength(0);
      console.log('  Result: PASS - the rate history is reachable only from the currency itself');
      console.log('✅ CRM-11857_1.8.1 verified: the rate history is its own "Currency Rates" list, opened from the currency, with no menu entry of its own');
    });
  });
});
