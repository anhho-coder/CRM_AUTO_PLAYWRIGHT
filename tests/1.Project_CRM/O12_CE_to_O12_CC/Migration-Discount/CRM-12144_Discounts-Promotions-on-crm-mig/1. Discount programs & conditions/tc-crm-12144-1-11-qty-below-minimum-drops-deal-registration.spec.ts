import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.11 - Lower the quantity of an order carrying Deal registration below the minimum   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.11
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 28, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.11 (Jira CRM-13774; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-11-qty-below-minimum-drops-deal-registration.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0075
 * Source version   : master row CRM-12144_1.11 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * A2144B x 5 with Deal registration carries one -164.50 reward line; lowering the quantity to 4 (Subtotal 1,316.00,
 * below the 1,400.00 minimum) empties Promotion and drops the line; at 6 with Deal registration picked again the line is -197.40.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.11:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.11, master "Migration - Discount" row 28, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Lower the quantity of an order carrying Deal registration below the minimum (IS-CRM-FUNC-0075)
 *  Priority: P2 | Spec Areas: 0075 - change leaves terms
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *      Create a new company in Contacts with:
 *        _ Name = Disc-Cust-<timestamp>
 *        _ Type = end customer (no Reseller, no Distributor)
 *        _ Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with:
 *        _ Name = Disc-Opp-<timestamp>
 *        _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save
 *    3. Change Ordered Qty to 4 and click Save
 *    4. Change Ordered Qty to 6, pick Deal registration again and click Save
 *
 *  Expected Results:
 *    2. One reward line of -164.50
 *    3. Promotion is empty and the reward line is removed (Subtotal 1,316.00 is below 1,400.00)
 *    4. One reward line of -197.40
 *
 *  Port notes: users.sale_ic_thomas_crm_mig; company (pricelist Public Pricelist_USD) and opportunity through the Mig helpers;
 *  DealElementPageMig; printVerifyAndAssertMig; teardown + afterAll sweep by run. No baseline assertion or expected value changed.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.11';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save',
  s3: 'Step 3: Change Ordered Qty to 4 and click Save',
  s4: 'Step 4: Change Ordered Qty to 6, pick Deal registration again and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Lower the quantity of an order carrying Deal registration below the minimum (crm-mig)`, () => {
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

  test(`${TC}: Lower the quantity of an order carrying Deal registration below the minimum`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];

    const readRewardLines = async (tag: string) => {
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      console.log(`  - [${tag}] order lines = ${rows.length}, reward lines = ${rewards.length}`);
      for (const r of rewards) console.log(`  - [${tag}] reward: Unit Price ${r['Unit Price']} | Subtotal ${r['Subtotal']} | ${r['Description']}`);
      return rewards;
    };

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
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
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rewards = await readRewardLines('after Save');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - number of reward lines', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 2 - reward line amount', expected: '-164.50', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -164.5 },
      ], `${TC} - Step 2 reward line`, [DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.clickEdit();
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.listedProduct, 4);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,316.00');
      await saveDealElement(page, run);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rewards = await readRewardLines('qty 4, after Save');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - A2144B x 4 line Subtotal', expected: '1,316.00', actual: subtotal, passed: money(subtotal) === 1316 },
        { what: 'Step 3 - Promotion is empty', expected: '(empty)', actual: promotion || '(empty)', passed: promotion === '' },
        { what: 'Step 3 - the reward line is removed', expected: '0 reward lines', actual: `${rewards.length} reward lines`, passed: rewards.length === 0 },
      ], `${TC} - Step 3 below the minimum`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - quantity 4, Deal registration dropped');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.clickEdit();
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.listedProduct, 6);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,974.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rewards = await readRewardLines('qty 6, after Save');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - number of reward lines', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 4 - reward line amount', expected: '-197.40', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -197.4 },
      ], `${TC} - Step 4 reward line at qty 6`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - quantity 6, Deal registration back');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
