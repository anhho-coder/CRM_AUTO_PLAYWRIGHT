import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ===========================================================================
 *  ExchangeRate  -  US7: control over rates is not handed to everyone
 * ===========================================================================
 *  Test Case ID    : CRM-11857_1.7.3
 *  Automation-Type : new
 *  Automation-Date : 2026-08-19
 *
 *  Summary:
 *    Log in as a salesperson who does NOT hold accounting-configuration rights and show that the rate
 *    configuration is out of reach: the "Settings" entry that carries the rate source and the update
 *    frequency is not offered under Invoicing > Configuration, the currency form has no "EDIT" button,
 *    and the "Currency Rates" list has no "CREATE" button. The rates themselves stay readable.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11857_1\.7\.3:" --project=chromium
 *
 * ---------------------------------------------------------------------------
 *  Source manual TC  (mirrors the manual steps - same order, same content)
 * ---------------------------------------------------------------------------
 *
 *  Pre-conditions:
 *    - Have the login of a salesperson who does NOT have accounting-configuration rights
 *      (e.g. salesperson Thomas Semerich)
 *    - EUR has at least one rate row
 *    - Log out of the administrator account first
 *
 *  Steps to reproduce:
 *    1. Log in as the salesperson who does not have accounting-configuration rights
 *    2. Open the Invoicing module > Configuration and write down every entry the menu offers
 *    3. If a "Currencies" entry is offered, open it and click the row whose Currency is "EUR"
 *    4. On the currency form look at the top left for an "EDIT" button
 *    5. Click the "Rates" button in the box at the top right and look for a "CREATE" button above the
 *       "Currency Rates" list
 *
 *  Verification Point:
 *    2. The "Settings" entry that carries the rate source and the update frequency is NOT offered under
 *       Invoicing > Configuration, count = 0
 *    3. Where the Currencies list is reachable, the rates are readable
 *    4. No "EDIT" button is present on the currency form, count = 0
 *    5. No "CREATE" button is present above the "Currency Rates" list, count = 0
 *       _ This user can look but cannot change, so control stays with the same people who hold it today
 *
 *  Automation notes:
 *    - The user MUST be one that holds neither "Administration / Settings" nor "Accounting & Finance /
 *      Billing Manager": those are the only two groups with write/create on the currency model. The
 *      accountants Faye and Yulia ARE Billing Managers and therefore CAN edit rates - using either of
 *      them would make this negative case fail for the wrong reason. Thomas Semerich holds neither group
 *      but does hold "Extra Rights / Multi Currencies", so he can still SEE the Currencies list, which is
 *      exactly the read-but-not-write state this case asserts.
 * ===========================================================================
 */

/** The currency whose form and rate list are inspected. */
const CURRENCY_CODE = 'EUR';

test.describe('CRM-11857_1.7.3 - US7: control over rates is not handed to everyone', () => {
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
    // Read-only test: nothing is created or changed, so there is nothing to clean up.
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-11857_1.7.3: US7 - A user without accounting-configuration rights can read rates but change neither the source nor a rate', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const currencyPage = new CurrencyPage(page);

    let configurationPresent = false;
    let configurationLabels: string[] = [];
    let moduleOpened = false;
    let listedCurrencies: string[] = [];
    let eurRate = '';
    let editPresent = true;
    let createPresent = true;

    await test.step('Step 1: Log in as the salesperson who does not have accounting-configuration rights', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as ${users.sale_ic_thomas.displayName} (${users.sale_ic_thomas.username})`);
      console.log('  - This account holds neither "Administration / Settings" nor "Billing Manager", the only two groups that may write rates');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - logged in as the salesperson').catch(() => {});
    });

    await test.step('Step 2: Open the Invoicing module > Configuration and write down every entry the menu offers', async () => {
      // Enter the module from the Applications launcher: a hash deep-link renders the action but leaves
      // the navbar without the module's own menu sections, so "Configuration" would not be readable.
      moduleOpened = await currencyPage.openModuleFromApplications('Invoicing');
      console.log(`  - Invoicing module menu bar rendered: ${moduleOpened}`);
      const configMenu = await currencyPage.getConfigurationMenu();
      configurationPresent = configMenu.present;
      configurationLabels = configMenu.labels;
      console.log(`  - Invoicing > Configuration menu present: ${configurationPresent}`);
      console.log(`  - Invoicing > Configuration offers: ${configurationLabels.join(' | ') || 'nothing'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Configuration menu as the salesperson').catch(() => {});
    });

    await test.step('Step 3: Open the Currencies list and the EUR currency, and read its rate', async () => {
      await currencyPage.openCurrenciesList();
      listedCurrencies = await currencyPage.getListedCurrencyCodes();
      eurRate = await currencyPage.getCurrencyRate(CURRENCY_CODE);
      console.log(`  - Currencies visible to this user: ${listedCurrencies.join(', ')}`);
      console.log(`  - ${CURRENCY_CODE} Current Rate readable as: "${eurRate}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Currencies list as the salesperson').catch(() => {});
    });

    await test.step('Step 4: Open the EUR currency form and look at the top left for an "EDIT" button', async () => {
      const currencyId = await currencyPage.openCurrencyForm(CURRENCY_CODE);
      editPresent = await currencyPage.hasEditButtonOnForm();
      console.log(`  - EUR currency form open (id=${currencyId || 'unknown'}); "EDIT" ${editPresent ? 'IS' : 'is NOT'} offered`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - currency form without EDIT').catch(() => {});

      await test.step('Step 5: Click the "Rates" button and look for a "CREATE" button above the "Currency Rates" list', async () => {
        await currencyPage.clickRatesButtonOnOpenForm(currencyId);
        createPresent = await currencyPage.hasCreateButtonOnList();
        const rateRows = await currencyPage.getRateRows();
        console.log(`  - Rate rows readable on the "Currency Rates" list: ${rateRows.length}`);
        console.log(`  - "CREATE" ${createPresent ? 'IS' : 'is NOT'} offered above the list`);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Currency Rates list without CREATE').catch(() => {});
      });
    });

    await test.step('Verification Point 2-3-4-5: the rates are readable but nothing about them can be changed', async () => {
      // ONE derived outcome, so the assertion has a single meaning whether Odoo hides the whole
      // Configuration menu for this user or merely leaves "Settings" out of it - both mean the rate
      // configuration is out of reach.
      const settingsEntries = configurationLabels.filter((label) => /^settings$/i.test(label.trim()));
      const settingsReachable = configurationPresent && settingsEntries.length > 0;

      console.log('VERIFY - the rate configuration is out of reach for this user:');
      console.log(`  Expected "Settings" reachable under Invoicing > Configuration : false`);
      console.log(`  Actual   "Settings" reachable                                 : ${settingsReachable}`);
      console.log(`  Actual   Configuration menu present at all                    : ${configurationPresent}`);
      console.log(`  Actual   "Settings" entries                                 : ${settingsEntries.length}${settingsEntries.length ? ` (${settingsEntries.join(', ')})` : ''}`);
      console.log(`  Actual   menu entries offered                               : ${configurationLabels.join(' | ')}`);
      console.log(`  Expected "EDIT" on the currency form                        : absent`);
      console.log(`  Actual   "EDIT" on the currency form                        : ${editPresent ? 'present' : 'absent'}`);
      console.log(`  Expected "CREATE" on the "Currency Rates" list              : absent`);
      console.log(`  Actual   "CREATE" on the "Currency Rates" list              : ${createPresent ? 'present' : 'absent'}`);
      console.log(`  Actual   ${CURRENCY_CODE} Current Rate readable                        : "${eurRate}"`);

      expect(moduleOpened, 'The Invoicing module menu bar should have rendered, so the menu really was inspected').toBe(true);
      expect(
        settingsReachable,
        'The "Settings" entry that carries the rate source and the update frequency must NOT be reachable for this user'
      ).toBe(false);
      expect(listedCurrencies.length, 'The user should still be able to SEE the Currencies list').toBeGreaterThan(0);
      expect(parseFloat(eurRate), `The ${CURRENCY_CODE} rate should be readable as a positive number`).toBeGreaterThan(0);
      expect(editPresent, 'No "EDIT" button should be available on the currency form for this user').toBe(false);
      expect(createPresent, 'No "CREATE" button should be available on the "Currency Rates" list for this user').toBe(false);
      console.log('  Result: PASS - this user can look but cannot change; control stays with the same people who hold it today');
      console.log('✅ CRM-11857_1.7.3 verified: rate configuration is neither widened nor exposed to a user without accounting-configuration rights');
    });
  });
});
