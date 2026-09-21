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
 * O12 CE Main-Business Smoke - Total in Company Currency of a foreign-currency Quotation
 * =============================================================================
 * Test Case ID   : CRM-12325_2.5.26
 * Jira           : CRM-12325
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 *
 * Summary:
 *   On a Quotation priced in EUR, verify the company-currency total is filled and is a CONVERTED
 *   figure - i.e. it differs from the EUR total the form shows.
 *
 * -----------------------------------------------------------------------------
 * Source manual TC (pre-production): TC.Performance.1.1.5.26 "Total in Company Currency of a foreign-currency Quotation"
 * -----------------------------------------------------------------------------
 *   Pre-condition(s):
 *     - The O12 CE Migration server is reachable and the Admin account can log in
 *       (CRM-12325_1.1.1).
 *
 *   Steps to reproduce (the manual TC's 6 steps):
 *     1. Log in to the CRM.
 *     2. Open "CRM" and switch to the Opportunities list view.
 *     3. Create the Opportunity this test case owns:
 *          - Opp name    = TEST CRM-12325_2.5.26 <timestamp>
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
 *     6. Reopen the Quotation with developer mode on and read "Total in Company Currency" against the Quotation Total.
 *
 *   Verification:
 *     1. Total in Company Currency is filled and above zero.
 *     2. The Quotation Total is filled and above zero.
 *     3. Total in Company Currency differs from the EUR total - it is the converted figure.
 *
 *   Manual steps 1-5 are the shared O12 CE setup and are run by the suite helper
 *   (o12ce-main-business.helper), which expands them into Step 1 .. Step 11 plus Step 12
 *   below - the same grouping the 2.4.Deal_Element specs use. Manual step 6 is Step 13,
 *   mapped 1:1.
 *
 * -----------------------------------------------------------------------------
 * Baseline rule (CLAUDE.md): the assertions below are the PRE-PRODUCTION baseline, ported
 * unchanged. Where O12 CE behaves differently this spec stays RED - it is never adapted to
 * what O12 CE happens to do.
 * -----------------------------------------------------------------------------
 *
 * O12 CE notes:
 *   - The Deal Element is priced with "Public Pricelist_EUR" so the Quotation is raised in a
 *   - currency other than the company currency; without that the two totals would be equal and the
 *   - TC would pass vacuously.
 *   - Total in Company Currency is a developer-only field (see CRM-12325_2.5.37), so this TC has to
 *   - reopen the record with ?debug on to read it at all.
 *
 * Command to run:
 *   npx playwright test --grep "CRM-12325_2\.5\.26:" --project=MigSmoke
 */

const TC = 'CRM-12325_2.5.26';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  s12: 'Step 12: Press "NEW QUOTATION" on the saved Deal Element to create the Quotation',
  s13: 'Step 13: Verify Total in Company Currency',
  verify: 'Verification',
} as const;

/**
 * The foreign-currency pricelist this TC prices the Deal Element with, so the Quotation Total
 * and the company-currency total cannot be the same number.
 */
const PRICELIST_EUR = 'Public Pricelist_EUR';

const SKIP_CLEANUP_OPP = false; // false = delete what this test created (house rule: crm-mig test data must be cleaned up).
// Set true ONLY to keep a broken chain for hand-debugging - the 16:00 leftover-data check then reports it.

test.describe(`${TC} - Total in Company Currency of a foreign-currency Quotation`, () => {

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
    await sweepMigLeftoversAfterAll(browser, 'CRM-12325_2.5.26');
  });

  test(`${TC}: Verify the Total in Company Currency on a Quotation priced in a foreign currency is filled and converted`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);

    let opp: O12ceOpportunity | null = null;
    let quotation: O12ceQuotationResult | null = null;
    let totalInCompanyCurrency = NaN;
    let quotationTotal = 0;

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
    await addDealElementOnO12CE(page, { pricelist: PRICELIST_EUR });

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
      await quotationPage.reopenCurrentRecordInDebugMode(baseUrl_mig);
      totalInCompanyCurrency = await quotationPage.getFieldNumber('amount_total_company_signed');
      quotationTotal = await quotationPage.getQuotationTotal();

      console.log(`  - Pricelist used            : ${PRICELIST_EUR}`);
      console.log(`  - Quotation Total (EUR)     : ${quotationTotal}`);
      console.log(`  - Total in Company Currency : ${totalInCompanyCurrency}`);

      record('Total in Company Currency is filled', '> 0', String(totalInCompanyCurrency),
        !Number.isNaN(totalInCompanyCurrency) && totalInCompanyCurrency > 0);
      record('Quotation Total (EUR)', '> 0', String(quotationTotal), quotationTotal > 0);
      record('Total in Company Currency is the CONVERTED total',
        `different from ${quotationTotal}`, String(totalInCompanyCurrency),
        totalInCompanyCurrency > 0 && Math.abs(totalInCompanyCurrency - quotationTotal) > 0.01);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log(`  Opportunity : id=${opp?.oppId} | Company="${opp?.companyValue}"`);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Quotation Total in Company Currency`);

      expect(Number.isNaN(totalInCompanyCurrency), 'Total in Company Currency must be readable').toBe(false);
      expect(totalInCompanyCurrency, 'Total in Company Currency must be filled').toBeGreaterThan(0);
      expect(quotationTotal, 'the Quotation Total must be filled').toBeGreaterThan(0);
      expect(
        Math.abs(totalInCompanyCurrency - quotationTotal),
        'a EUR Quotation must show a company-currency total that differs from the EUR total'
      ).toBeGreaterThan(0.01);
    });
  });
});
