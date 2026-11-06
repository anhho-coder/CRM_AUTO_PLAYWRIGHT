import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  idFromUrl,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.5 - Order that meets no program   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.5
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.5 (crm-mig manual TC, master "Migration - Discount" row 38) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13782
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0079
 * Source version   : master row CRM-12144_2.5 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * A2160B x 10 (210.00, no listed product, below every minimum) meets no program: the Promotion list is empty and
 * neither the saved Deal Element nor its quotation has a reward line.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.5, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
 *    3. CRM > Pipeline (LIST view) > Create a new opportunity:
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2160B with Ordered Qty 10
 *    3. Open the Promotion list
 *         -> Expected: the Promotion list is empty (the reference system shows only "No results to show...")
 *    4. Click Save, then New quotation
 *         -> Expected: neither the Deal Element nor the quotation has a reward line
 * ================================================================================================
 */

const TC = 'Discount_2.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2160B with Ordered Qty 10',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Click Save, then New quotation',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Order that meets no program (pre-prod baseline of CRM-12144_2.5)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Order that meets no program`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 10);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '210.00');
      console.log(`  - A2160B x 10 line Subtotal : ${subtotal}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Promotion list is empty', expected: '0 programs', actual: options.length ? options.join(' | ') : '0 programs', passed: options.length === 0 },
      ], `${TC} - Step 3 empty Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - A2160B x 10, nothing offered');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await saveDealElement(page, run);
      const deRows = await dealElementPage.getAllOrderLineRows();
      const deRewardLike = deRows.filter((r) => /discount on/i.test(r['Product'] ?? ''));
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);
      const qRows = await quotationPage.getAllOrderLineRows();
      const qRewardLike = qRows.filter((r) => /discount on/i.test(r['Product'] ?? ''));
      console.log(`  - Deal Element lines : ${deRows.length}`);
      console.log(`  - Quotation lines    : ${qRows.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - the Deal Element has no reward line', expected: '0 reward lines', actual: `${deRewardLike.length} reward lines (of ${deRows.length} lines)`, passed: deRewardLike.length === 0 && deRows.length === 1 },
        { what: 'Step 4 - the quotation has no reward line', expected: '0 reward lines', actual: `${qRewardLike.length} reward lines (of ${qRows.length} lines)`, passed: qRewardLike.length === 0 && qRows.length === 1 },
      ], `${TC} - Step 4 no reward line anywhere`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - quotation created, no reward line');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
