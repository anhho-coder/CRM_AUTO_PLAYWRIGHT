import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 *  CRM-4383_1.1 - Salesperson: the "CREATE" button is hidden on Sales > Orders > Quotations
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-4383_1.1
 *  Jira:            CRM-4383 ("The \"CREATE\" button appears again on \"Quotations\" screen")
 *                   Regression of CRM-2329 ("Close creating quotes without opps")
 *  Automation-Type: new
 *  Automation-Date: 2026-08-11
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    A quotation may only be started from an Opportunity, so the list-view "CREATE" button must be
 *    HIDDEN on the Quotations screen for a Salesperson (everyone except the narrow CRM-Team group).
 *    Before the fix, a Salesperson saw "CREATE" and could fill a whole quotation that then failed to
 *    save - a dead end. This TC verifies the fix on Sales > Orders > Quotations: the list still opens,
 *    but there is no "CREATE" (and no "IMPORT") button.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-4383_1\.1:" --project=chromium
 *
 *  Pre-conditions:
 *    - Login as a Salesperson (Ex: Thomas Semerich) - a user WITHOUT the CRM-Team create-quotation right.
 *
 *  Steps:
 *    1. Open the "Sales" feature.
 *    2. Select "Orders" menu, select the "Quotations" sub-menu; observe the list toolbar.
 *
 *  Expected Result:
 *    - The Quotations list opens normally (records are listed), but there is NO "CREATE" button
 *      (the "IMPORT" button is hidden together with it).
 *
 *  Design notes:
 *    - "Sales > Orders > Quotations" = act_window 344 (sale.order, domain is_deal_element=False),
 *      opened via the hash-route deep link (this Odoo web client is hash-routed), mirroring the repo's
 *      QuotationPage.openNewQuotationForm pattern. The Create-button hide is view-level, so it is
 *      identical across every sale.order Quotations list (covered on other screens by 1.2 / 1.3).
 *    - Absence is asserted with a short wait AFTER the list toolbar has fully rendered
 *      (waitForQuotationsListReady), so a "hidden" verdict is prompt and trustworthy.
 */

const SALES = users.sale_ic_thomas; // Salesperson (no CRM-Team right) -> must NOT see the Create button

test.describe('CRM-4383_1.1 - Salesperson: CREATE hidden on Orders > Quotations', () => {

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

  test('CRM-4383_1.1: Salesperson sees no CREATE button on Sales > Orders > Quotations', async ({ page }, testInfo) => {
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
    await test.step('Step 1-2: Open Sales > Orders > Quotations and observe the list', async () => {
      listLoaded = await quotationPage.openQuotationsList({ action: 344, menuId: 202 });
      rowCount = await quotationPage.getQuotationsListRowCount();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Orders > Quotations - Salesperson view');
    });

    await test.step('Expected: the list opens but there is NO "CREATE" (and no "IMPORT") button', async () => {
      const createVisible = await quotationPage.isListCreateButtonVisible();
      const importVisible = await quotationPage.isListImportButtonVisible();

      console.log('==== VERIFY (CRM-4383_1.1) ====');
      console.log('Expected: Quotations list opens for the Salesperson AND the CREATE button is hidden (Import also hidden)');
      console.log(`Actual  : listLoaded=${listLoaded}, rows=${rowCount}, CREATE visible=${createVisible}, IMPORT visible=${importVisible}`);
      console.log(`Result  : ${listLoaded && !createVisible && !importVisible ? 'PASS' : 'FAIL'}`);

      expect(listLoaded, 'The Quotations list should still open for the Salesperson (only the Create button is removed)').toBeTruthy();
      expect(createVisible, 'CRM-4383: the "CREATE" button must be HIDDEN on Orders > Quotations for a Salesperson').toBeFalsy();
      expect(importVisible, 'CRM-4383: the "IMPORT" button is hidden together with CREATE for a Salesperson').toBeFalsy();
      console.log('✅ CRM-4383_1.1 verified: no CREATE/IMPORT button on Orders > Quotations for the Salesperson');
    });
  });
});
