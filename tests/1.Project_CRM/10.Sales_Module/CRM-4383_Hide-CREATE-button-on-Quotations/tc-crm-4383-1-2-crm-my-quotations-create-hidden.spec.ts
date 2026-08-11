import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-4383_1.2 - Salesperson: the "CREATE" button is hidden on CRM > Sales > My Quotations
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-4383_1.2
 *  Jira:            CRM-4383 (regression of CRM-2329)
 *  Automation-Type: new
 *  Automation-Date: 2026-08-11
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    The CRM-4383 fix hides the list-view "CREATE" button on every Quotations screen a Salesperson
 *    can reach, not only Orders > Quotations. This TC verifies the "My Quotations" list reached from
 *    the CRM app (CRM > Sales > My Quotations): the list still opens, but there is no "CREATE" button.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-4383_1\.2:" --project=chromium
 *
 *  Pre-conditions:
 *    - Login as a Salesperson (Ex: Thomas Semerich).
 *
 *  Steps:
 *    1. Open the "CRM" feature.
 *    2. Select "Sales" menu, select "My Quotations"; observe the list toolbar.
 *
 *  Expected Result:
 *    - The "My Quotations" list opens normally, but there is NO "CREATE" button for the Salesperson.
 *
 *  Design notes:
 *    - "CRM > Sales > My Quotations" = act_window 345 (sale.order, context search_default_my_quotation).
 *      It shares the sale.order tree view with Orders > Quotations, so the same view-level Create-button
 *      hide applies - this TC proves the fix is not scoped to a single menu/action.
 */

const SALES = users.sale_ic_thomas; // Salesperson (no CRM-Team right) -> must NOT see the Create button

test.describe('CRM-4383_1.2 - Salesperson: CREATE hidden on CRM > Sales > My Quotations', () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('X TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      await CommonUtils.waitForSpinnersToHide(page).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
  });

  test('CRM-4383_1.2: Salesperson sees no CREATE button on CRM > Sales > My Quotations', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const quotationPage = new QuotationPage(page);

    await test.step('Pre-condition: Login as a Salesperson (Thomas Semerich)', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(SALES.username, SALES.password, 120000);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log(`✓ Logged in as Salesperson ${SALES.displayName}`);
    });

    let listLoaded = false;
    let rowCount = 0;
    await test.step('Step 1-2: Open CRM > Sales > My Quotations and observe the list', async () => {
      listLoaded = await quotationPage.openQuotationsList({ action: 345, menuId: 202 });
      rowCount = await quotationPage.getQuotationsListRowCount();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'CRM > Sales > My Quotations - Salesperson view');
    });

    await test.step('Expected: the list opens but there is NO "CREATE" button', async () => {
      const createVisible = await quotationPage.isListCreateButtonVisible();
      const importVisible = await quotationPage.isListImportButtonVisible();

      console.log('==== VERIFY (CRM-4383_1.2) ====');
      console.log('Expected: My Quotations list opens for the Salesperson AND the CREATE button is hidden');
      console.log(`Actual  : listLoaded=${listLoaded}, rows=${rowCount}, CREATE visible=${createVisible}, IMPORT visible=${importVisible}`);
      console.log(`Result  : ${listLoaded && !createVisible ? 'PASS' : 'FAIL'}`);

      expect(listLoaded, 'The My Quotations list should still open for the Salesperson').toBeTruthy();
      expect(createVisible, 'CRM-4383: the "CREATE" button must be HIDDEN on CRM > Sales > My Quotations for a Salesperson').toBeFalsy();
      console.log('✅ CRM-4383_1.2 verified: no CREATE button on CRM > Sales > My Quotations for the Salesperson');
    });
  });
});
