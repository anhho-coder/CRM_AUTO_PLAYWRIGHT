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
  money,
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
 *  Discount_3.3 - Confirm a quotation carrying Deal registration and read the sale order   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_3.3
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_3.3 (crm-mig manual TC, master "Migration - Discount" row 45) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13788
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-UI-0005
 * Source version   : master row CRM-12144_3.3 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * The sale order confirmed from a quotation carrying Deal registration shows the program, the -164.50 reward line and
 * Total 1,480.50, and its Promotion field can no longer be changed.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_3\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.3, adapted to the reference system)
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
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation
 *    2. Click Confirm
 *         -> Expected: the sale order shows Promotion = Deal registration, the reward line of -164.50 and Total = 1,480.50
 *    3. Try to change Promotion (click Edit on the sale order and look at the Promotion field)
 *         -> Expected: Promotion is read-only
 *    4. Clean-up: cancel the sale order - done by the afterEach teardown as the CRM administrator (cancel, then delete
 *       by id and recount), so a failed step 2 or 3 cannot leave the order behind
 * ================================================================================================
 */

const TC = 'Discount_3.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation',
  s2: 'Step 2: Click Confirm',
  s3: 'Step 3: Try to change Promotion',
  s4: 'Step 4: [done by the afterEach teardown] Clean-up: cancel the sale order',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Confirm a quotation carrying Deal registration and read the sale order (pre-prod baseline of CRM-12144_3.3)`, () => {
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

  test(`${TC}: Confirm a quotation carrying Deal registration and read the sale order`, async ({ page }, testInfo) => {
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - quotation created from the Deal Element');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      const stage = await quotationPage.getActiveStatusBarStage();
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      const total = await quotationPage.getFieldDisplayValue('amount_total');
      console.log(`  - Status bar stage : ${stage}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the order is confirmed (status bar)', expected: 'Sales Order', actual: stage, passed: /sale/i.test(stage) && !/quotation/i.test(stage) },
        { what: 'Step 2 - sale order Promotion', expected: DISCOUNT_BASELINE.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_BASELINE.dealRegistration },
        { what: 'Step 2 - the reward line', expected: '1 line of -164.50', actual: `${rewards.length} line(s), ${rewards[0]?.['Subtotal'] ?? '-'}`, passed: rewards.length === 1 && money(rewards[0]['Subtotal']) === -164.5 },
        { what: 'Step 2 - sale order Total', expected: '1,480.50', actual: total, passed: money(total) === 1480.5 },
      ], `${TC} - Step 2 confirmed sale order`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const editable = await quotationPage.isFieldEditableInEditMode('promotion_id');
      console.log(`  - Promotion editable on the sale order : ${editable}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Promotion is read-only on the sale order', expected: 'read-only', actual: editable ? 'editable' : 'read-only', passed: !editable },
      ], `${TC} - Step 3 Promotion read-only`, [DISCOUNT_HIGHLIGHT.promotionField]);
      await quotationPage.discardChanges();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 2-3 - sale order, Promotion read-only');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - sale order ids to cancel + delete in teardown : ${JSON.stringify(run.saleOrderIds)}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
