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
 * O12 CE Main-Business Smoke - The product of the order line
 * Test Case ID: CRM-12370_1.4.21
 * Automation-Type: new
 * Automation-Date: 2026-09-17
 *
 * Summary:
 *   Verify that adding one product through "Add a product" leaves exactly one order line, carrying
 *   that product, its description, Ordered Qty 1 and the Socket unit of measure.
 *
 * Source manual TC (pre-production): TC.Performance.1.1.4.21 "Deal Element order line product".
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
 *   - Product 28 on crm-mig is sold per **Socket** at 329.00 with no tax; its order line Description
 *     repeats the product (internal reference `[A2144B]` included), so both cells are compared after
 *     whitespace normalisation.
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
 *  12. Open the Order Lines tab of the saved Deal Element and read the single row.
 *
 * Verification Points:
 *   1. The Deal Element carries exactly one order line.
 *   2. The Product cell carries the product that was added.
 *   3. The Description repeats the Product.
 *   4. Ordered Qty is 1.
 *   5. Unit of Measure is Socket.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.4\.21:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.4.21';

const EXPECTED_UOM = 'Socket';

const SKIP_CLEANUP_OPP = process.env.SKIP_CLEANUP_OPP === 'true'; // default false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Order line product`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.4.21');
  });

  test('CRM-12370_1.4.21: Verify the single order line carries the added product, its description, Qty 1 and Socket', async ({ page }, testInfo) => {
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
      await dealElementPage.clickOrderLinesTab();
      const lineCount = await dealElementPage.getOrderLineCount();
      const line = await dealElementPage.getOrderLineRowCells(0);
      const squash = (text: string) => (text || '').replace(/\s+/g, ' ').trim();

      record('Order line count', 1, lineCount);
      record(
        'Product contains the searched product',
        O12CE_DATA.product,
        line['Product'] || '(empty)',
        (line['Product'] || '').includes(O12CE_DATA.product)
      );
      record(
        'Description repeats the Product',
        squash(line['Product']) || '(empty)',
        squash(line['Description']) || '(empty)'
      );
      record('Ordered Qty', '1', line['Ordered Qty'] || '(empty)');
      record('Unit of Measure', EXPECTED_UOM, line['Unit of Measure'] || '(empty)');
      printVerify();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Order line product`);

      expect(lineCount, 'one product was added, so there must be one order line').toBe(1);
      expect(line['Product'], 'the order line must carry the product that was added').toContain(
        O12CE_DATA.product
      );
      expect(squash(line['Description']), 'the description defaults to the product').toBe(
        squash(line['Product'])
      );
      expect(line['Ordered Qty'], 'Ordered Qty defaults to 1').toBe('1');
      expect(line['Unit of Measure'], 'the socket-licensed product is sold per Socket').toBe(EXPECTED_UOM);
    });
  });
});
