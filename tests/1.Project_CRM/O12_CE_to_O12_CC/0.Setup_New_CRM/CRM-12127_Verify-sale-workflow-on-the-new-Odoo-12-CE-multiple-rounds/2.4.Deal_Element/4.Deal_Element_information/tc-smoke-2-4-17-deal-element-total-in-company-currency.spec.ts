import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { users } from '@config/users.config';
import { DealElementPage, OpportunityPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  registerMigRecordFromUrl,
  O12CE_DATA,
  O12ceOpportunity,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * O12 CE Main-Business Smoke - Total in Company Currency
 * Test Case ID: CRM-12325_2.4.17
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify the Total in Company Currency is filled and reports the same amount as the single order
 *   line of the Deal Element.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.17 "Deal Element Total in Company Currency".
 *
 * O12 CE notes (grounded on crm-mig over XML-RPC, 2026-09-17):
 *   - The Deal Element form on O12 CE is the dedicated view `sale.order.deal.element.view.form`
 *     (id 2140, `create="false" delete="false"`) - the same view pre-production renders.
 *   - EXPECTED RED - O12 CE renders the Order Lines column headers in UPPERCASE ("PRODUCT",
 *     "SUBTOTAL") where pre-production renders title case ("Product", "Subtotal"), and it
 *     renders Ordered Qty as "1.000" where pre-production renders "1". Because
 *     getOrderLineRowCells() keys each cell on its header, the casing difference also makes
 *     every cell read come back undefined. The pre-production captions and formats are kept,
 *     so this spec is EXPECTED TO FAIL on O12 CE (run 2026-09-18-100823).
 *   - The company currency is USD and the pricelist is the USD one, so the company-currency total and
 *     the order line Subtotal are the same number (329.00 for one NAKIVO Backup line).
 *
 * Pre-conditions:
 *   The O12 CE Migration server is reachable and the Admin account can log in (CRM-12325_1.1.1).
 *
 * Steps:
 *   1. Use the account of Admin to login successful.
 *   2. Open "CRM" and switch to the Opportunities list view.
 *   3. On the "Opp" page, click at "CREATE" button.
 *   4. Enter the opportunity information (Country = United States, State = Connecticut, Sales Team and
 *      Salesperson cleared, "Create manually" FALSE).
 *   5. Click at "CRM Developer" tab at the bottom of page (Lead form = License).
 *   6. Press "SAVE" button.
 *   7. Refresh page to see the "Contact" field is entered.
 *   8. Create "DEAL ELEMENT" - press the "DEAL ELEMENT" button.
 *   9. On the "Deal Element" screen select Pricelist = Public Pricelist_USD and
 *      Payment Term = Immediate Payment.
 *  10. At "Order Lines" section - press "Add a product" and select the NAKIVO Backup product.
 *  11. Press "SAVE" button on the top page and wait for the saved (readonly) form.
 *  12. Read the Total in Company Currency and the order line Subtotal of the saved Deal Element.
 *
 * Verification Points:
 *   1. Total in Company Currency is greater than 0.
 *   2. Total in Company Currency equals the Subtotal of the order line.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.4\.17:" --project=MigSmoke
 */

const TC = 'CRM-12325_2.4.17';

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Total in Company Currency`, () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePageMig(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await teardownMigRecords(page, SKIP_CLEANUP_OPP);
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP_OPP) {
      console.log('[mig-sweep] SKIPPED by SKIP_CLEANUP_OPP=true - records KEPT on O12 CE for hand-inspection.');
      return;
    }
    await sweepMigLeftoversAfterAll(browser, 'CRM-12325_2.4.17');
  });

  test('CRM-12325_2.4.17: Verify the Total in Company Currency matches the order line of the Deal Element', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const dealElementPage = new DealElementPage(page);
    const opportunityPage = new OpportunityPage(page);

    let opp: O12ceOpportunity | null = null;
    let dealElementUrl = '';

    // The VERIFY block printed before the expect()s, so a failing check still reaches stdout.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    const oppCompany = opp.companyValue;

    await addDealElementOnO12CE(page);
    dealElementUrl = page.url();
    registerMigRecordFromUrl(dealElementUrl, `Deal Element ${TC}`, 'sale.order');
    console.log(`  Deal Element saved: ${dealElementUrl}`);

    await test.step('Verification', async () => {
      const totalInCompanyCurrency = await dealElementPage.getFieldNumber('amount_total_company_signed');
      await dealElementPage.clickOrderLinesTab();
      const line = await dealElementPage.getOrderLineRowCells(0);
      const lineSubtotal = parseFloat((line['Subtotal'] || '').replace(/[^0-9.]/g, ''));

      record(
        'Total in Company Currency is greater than 0',
        'greater than 0',
        String(totalInCompanyCurrency),
        totalInCompanyCurrency > 0
      );
      record(
        'Total in Company Currency = order line Subtotal',
        String(lineSubtotal),
        String(totalInCompanyCurrency),
        Math.abs(totalInCompanyCurrency - lineSubtotal) < 0.01
      );
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Total in Company Currency`);

      expect(totalInCompanyCurrency, 'Total in Company Currency must be filled').toBeGreaterThan(0);
      expect(totalInCompanyCurrency, 'Total in Company Currency must match the Order Lines').toBeCloseTo(
        lineSubtotal,
        2
      );
    });
  });
});
