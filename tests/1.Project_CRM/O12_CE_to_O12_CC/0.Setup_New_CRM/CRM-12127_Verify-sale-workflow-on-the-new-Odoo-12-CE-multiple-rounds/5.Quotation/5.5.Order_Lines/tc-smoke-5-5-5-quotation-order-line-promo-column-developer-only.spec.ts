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
import { baseUrl_mig } from '@config/users.config';

/**
 * =============================================================================
 * O12 CE Main-Business Smoke - Promo Discount Amount is a developer-only Order Lines column
 * =============================================================================
 * Test Case ID   : CRM-12370_5.5.5
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   "Promo Discount Amount" must be hidden from a normal session and appear at position 10 of
 *   the Order Lines list once Odoo developer (debug) mode is on.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.39 "Promo Discount Amount is a developer-only Order Lines column"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12370_5.5.5 <timestamp>
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
 *     6. Read the Order Lines columns in a normal session, then reopen the same record with developer mode on and read them again.
 *
 *   Verification:
 *     1. A normal session shows the 13 Order Lines columns and NOT "Promo Discount Amount".
 *     2. Developer mode adds "Promo Discount Amount" at position 10, for 14 columns in total.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * O12 CE notes:
 *   - This TC deliberately turns Odoo developer (?debug) mode on. A debug session renders fields
 *   - and columns a normal session never shows - that difference is the point of the TC, and the
 *   - normal-session read above it is what guards against reading the debug view as the real one.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12370_5\.5\.5:" --project=MigSmoke
 */

const TC = 'CRM-12370_5.5.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify the column is developer-only',
  verify: 'Verification',
} as const;

/** The developer-only column of the Quotation Order Lines list. */
const DEVELOPER_ONLY_COLUMN = 'Promo Discount Amount';

/** What a NORMAL session shows - see CRM-12370_5.5.1. */
const EXPECTED_COLUMNS = [
  'Product',
  'Start Date',
  'End Date',
  'Ordered Qty',
  'Unit of Measure',
  'Unit Price',
  'Subtotal before discount',
  'Special Discount(%)',
  'Special Discount Amount',
  'Partner Discount',
  'Partner Discount Amount',
  'Subtotal After All Discounts',
  'Subtotal',
];

/** What the SAME record shows once Odoo developer (debug) mode is on. */
const EXPECTED_COLUMNS_DEBUG = [
  'Product',
  'Start Date',
  'End Date',
  'Ordered Qty',
  'Unit of Measure',
  'Unit Price',
  'Subtotal before discount',
  'Special Discount(%)',
  'Special Discount Amount',
  'Promo Discount Amount',
  'Partner Discount',
  'Partner Discount Amount',
  'Subtotal After All Discounts',
  'Subtotal',
];

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Promo Discount Amount is a developer-only Order Lines column`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12370_5.5.5');
  });

  test(`${TC}: Verify the Promo Discount Amount column of the Quotation Order Lines is developer-only`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let normalColumns: string[] = [];
    let debugColumns: string[] = [];

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
      normalColumns = await quotationPage.getOrderLineColumns();
      console.log('  Columns in a NORMAL session :');
      normalColumns.forEach((c, i) => console.log(`      #${i + 1} ${c}`));

      await quotationPage.reopenCurrentRecordInDebugMode(baseUrl_mig);
      await quotationPage.clickOrderLinesTab();
      debugColumns = await quotationPage.getOrderLineColumns();
      console.log('  Columns with DEBUG mode ON  :');
      debugColumns.forEach((c, i) => console.log(`      #${i + 1} ${c}`));

      record('Column count in a normal session', EXPECTED_COLUMNS.length, normalColumns.length);
      record('"Promo Discount Amount" in a normal session', 'absent',
        normalColumns.includes(DEVELOPER_ONLY_COLUMN) ? 'present' : 'absent');
      record('Column count with debug mode ON', EXPECTED_COLUMNS_DEBUG.length, debugColumns.length);
      record('Columns with debug mode ON, in order', EXPECTED_COLUMNS_DEBUG.join(' | '), debugColumns.join(' | '));
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation Order Lines in developer mode`);

      expect(normalColumns, 'a normal session must show the 13 Order Lines columns').toEqual(
        EXPECTED_COLUMNS
      );
      expect(
        normalColumns.includes(DEVELOPER_ONLY_COLUMN),
        '"Promo Discount Amount" must not be shown to a normal user'
      ).toBe(false);
      expect(debugColumns, 'debug mode must add "Promo Discount Amount" at position 10').toEqual(
        EXPECTED_COLUMNS_DEBUG
      );
    });
  });
});
