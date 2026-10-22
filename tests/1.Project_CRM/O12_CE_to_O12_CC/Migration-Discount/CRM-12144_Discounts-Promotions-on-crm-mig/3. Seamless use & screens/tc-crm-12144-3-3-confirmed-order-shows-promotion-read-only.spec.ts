import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, QuotationPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { confirmQuotationOnO12CE } from '@helpers/o12ce-main-business.helper';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_3.3 - Confirm a quotation carrying Deal registration and read the sale order   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_3.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 45, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_3.3 (Jira CRM-13788; tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/
 *                    tc-discount-3-3-confirmed-order-shows-promotion-read-only.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-UI-0005
 * Source version   : master row CRM-12144_3.3 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * The sale order confirmed from a quotation carrying Deal registration shows the program, the -164.50 reward line and
 * Total 1,480.50, and its Promotion field can no longer be changed.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_3\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.3, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *       [automation data, same as the baseline]
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *    3. Create a new opportunity in CRM > Pipeline with (LIST view - the kanban quick-create card lacks these fields):
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation
 *    2. Click Confirm
 *    3. Try to change Promotion
 *    4. Clean-up: cancel the sale order
 *  Expected Results
 *    2. The sale order shows Promotion = Deal registration, the reward line of -164.50 and Total = 1,480.50
 *    3. Promotion is read-only
 *
 *  Port notes : accounts *_crm_mig; Mig helpers and Mig readers; New quotation = newQuotationMig; Confirm =
 *               confirmQuotationOnO12CE (status bar read after it flips).
 * ================================================================================================
 */

const TC = 'CRM-12144_3.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation',
  s2: 'Step 2: Click Confirm',
  s3: 'Step 3: Try to change Promotion',
  s4: 'Step 4: Clean-up: cancel the sale order (done by the afterEach teardown as the CRM administrator)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Confirm a quotation carrying Deal registration and read the sale order (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Confirm a quotation carrying Deal registration and read the sale order`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log(`  - Quotation id : ${qId}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - quotation created from the Deal Element');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await confirmQuotationOnO12CE(page); // crm-mig: the status bar is read once it has flipped to the Sale Order
      await quotationPage.dismissErrorDialogWithRetry();
      await quotationPage.waitForConfirmButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      const stage = await quotationPage.getActiveStatusBarStage();
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      const total = await quotationPage.getFieldDisplayValue('amount_total');
      console.log(`  - Status bar stage : ${stage}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the order is confirmed (status bar)', expected: 'Sales Order', actual: stage, passed: /sale/i.test(stage) && !/quotation/i.test(stage) },
        { what: 'Step 2 - sale order Promotion', expected: DISCOUNT_MIG.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_MIG.dealRegistration },
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
      printVerifyAndAssertMig(checks);
    });
  });
});
