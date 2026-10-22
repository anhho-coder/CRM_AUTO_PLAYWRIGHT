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
  rewardRows,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.2 - Save an eligible Deal Element without picking a program   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.2
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.2 (crm-mig manual TC, master "Migration - Discount" row 35) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13779
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0077, IS-CRM-FUNC-0082
 * Source version   : master row CRM-12144_2.2 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * A2144B x 5 is eligible for Deal registration, but saved without picking it: neither the Deal Element nor the
 * quotation made from it carries a Promotion or a reward line - nothing is applied automatically.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.2, adapted to the reference system)
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
 *    2. On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list
 *         -> Expected: the list contains Deal registration
 *    3. Do not pick a program; click Save
 *         -> Expected: the Deal Element has no reward line
 *    4. Click New quotation
 *         -> Expected: the quotation has no Promotion and no reward line
 * ================================================================================================
 */

const TC = 'Discount_2.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list',
  s3: 'Step 3: Do not pick a program; click Save',
  s4: 'Step 4: Click New quotation',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Save an eligible Deal Element without picking a program (pre-prod baseline of CRM-12144_2.2)`, () => {
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

  test(`${TC}: Save an eligible Deal Element without picking a program`, async ({ page }, testInfo) => {
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 - the Promotion list contains Deal registration',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      console.log(`  - Deal Element order lines : ${rows.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Deal Element has no reward line', expected: '0 reward lines', actual: `${rewards.length} reward lines`, passed: rewards.length === 0 },
      ], `${TC} - Step 3 Deal Element saved without a program`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal Element saved, no program picked');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rows = await quotationPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      console.log(`  - Quotation order lines : ${rows.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - the quotation has no Promotion', expected: '(empty)', actual: promotion || '(empty)', passed: promotion === '' },
        { what: 'Step 4 - the quotation has no reward line', expected: '0 reward lines', actual: `${rewards.length} reward lines`, passed: rewards.length === 0 },
      ], `${TC} - Step 4 quotation without a program`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - quotation created, no program');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
