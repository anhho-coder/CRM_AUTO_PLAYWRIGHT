import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  O12ceOpportunity,
  O12ceQuotationResult,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * =============================================================================
 * O12 CE Main-Business Smoke - Subtotals of the Quotation order line
 * =============================================================================
 * Test Case ID   : CRM-12370_1.5.32
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   Verify all three subtotal columns of the Quotation order line equal Unit Price x Ordered Qty
 *   when no discount applies.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.32 "Subtotals of the Quotation order line"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_1.5.32 <timestamp>
 *          - Email       = <generated, unique per run>
 *          - Country     = United States
 *          - State       = Connecticut
 *          - Sales Team  = (cleared)
 *          - Salesperson = (cleared)
 *          - Lead Form   = License
 *     4. Create the Deal Element this test case owns:
 *          - Pricelist    = Public Pricelist_USD
 *          - Payment Term = Immediate Payment
 *          - Order line   = NAKIVO Backup product
 *     5. Press "NEW QUOTATION" to create the Quotation.
 *     6. Open the "Order Lines" tab and read the Unit Price, Ordered Qty and the three subtotal columns.
 *
 *   Verification:
 *     1. Subtotal before discount equals Unit Price x Ordered Qty.
 *     2. Subtotal After All Discounts equals Unit Price x Ordered Qty.
 *     3. Subtotal equals Unit Price x Ordered Qty.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 1.4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_1\.5\.32:" --project=MigSmoke
 */

const TC = 'CRM-12370_1.5.32';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the order line subtotals',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Subtotals of the Quotation order line`, () => {

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(() => {});
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
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - teardown done`).catch(() => {});
  });

  // CLAUDE.md crm-mig rule: the afterAll sweep also removes what a dying test created but never
  // got to register. Opens its own session, so it costs one extra login per spec file.
  test.afterAll(async ({ browser }) => {
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_1.5.32');
  });

  test(`${TC}: Verify the Quotation order line subtotals equal Unit Price multiplied by Ordered Qty`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let unitPrice = NaN;
    let orderedQty = NaN;
    let expectedSubtotal = NaN;
    let beforeDiscount = NaN;
    let afterAllDiscounts = NaN;
    let subtotal = NaN;

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

    // Manual steps 1-5 - the shared O12 CE setup (Step 1 .. Step 11, labelled by the helper).
    await loginToO12CE(page);
    await openOpportunitiesListOnO12CE(page);
    opp = await createOpportunityOnO12CE(page, TC);
    await addDealElementOnO12CE(page);

    await test.step(STEP.s12, async () => {
      console.log(`\n--- ${STEP.s12} ---`);
      quotation = await pressNewQuotationOnO12CE(page, { opportunityId: opp?.oppId });
      console.log(`  Quotation URL : ${page.url()}`);
      // O12 CE does not navigate on NEW QUOTATION - the helper looks the created Quotation up and
      // puts the form on it. Either route is fine; what this TC needs is to BE on the Quotation.
      expect(
        quotation.landedOnQuotation,
        'the Quotation raised by "NEW QUOTATION" must be open on screen before this TC can read it'
      ).toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation created`);
    });

    await test.step(STEP.s13, async () => {
      console.log(`\n--- ${STEP.s13} ---`);
      await quotationPage.clickOrderLinesTab();
      const cells = await quotationPage.getOrderLineRowCells(0);
      const num = (caption: string) => {
        const match = (cells[caption] || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : NaN;
      };

      unitPrice = num('Unit Price');
      orderedQty = num('Ordered Qty');
      expectedSubtotal = Math.round(unitPrice * orderedQty * 100) / 100;
      beforeDiscount = num('Subtotal before discount');
      afterAllDiscounts = num('Subtotal After All Discounts');
      subtotal = num('Subtotal');
      const close = (value: number) => Math.abs(value - expectedSubtotal) < 0.01;

      console.log(`  - Unit Price                   : ${unitPrice}`);
      console.log(`  - Ordered Qty                  : ${orderedQty}`);
      console.log(`  - Expected subtotal            : ${expectedSubtotal}`);
      console.log(`  - Subtotal before discount     : ${beforeDiscount}`);
      console.log(`  - Subtotal After All Discounts : ${afterAllDiscounts}`);
      console.log(`  - Subtotal                     : ${subtotal}`);

      record('Subtotal before discount', expectedSubtotal, beforeDiscount, close(beforeDiscount));
      record('Subtotal After All Discounts', expectedSubtotal, afterAllDiscounts, close(afterAllDiscounts));
      record('Subtotal', expectedSubtotal, subtotal, close(subtotal));
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation order line subtotals`);

      expect(Number.isNaN(unitPrice) || Number.isNaN(orderedQty), 'Unit Price and Ordered Qty must be readable').toBe(false);
      expect(beforeDiscount, 'Subtotal before discount must be Unit Price x Ordered Qty').toBeCloseTo(expectedSubtotal, 2);
      expect(afterAllDiscounts, 'Subtotal After All Discounts must be Unit Price x Ordered Qty when no discount applies').toBeCloseTo(expectedSubtotal, 2);
      expect(subtotal, 'Subtotal must be Unit Price x Ordered Qty when no discount applies').toBeCloseTo(expectedSubtotal, 2);
    });
  });
});
