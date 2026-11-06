import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
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
 *  Discount_5.1 - Open the Promotion list of a qualifying new order   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_5.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_5.1 (crm-mig manual TC, master "Migration - Discount") - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13793
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_5.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * The Promotion list of a new order with A2144B x 5 offers "Deal registration promotion, 10% on Product,
 * Support Services do not qualify"; picking it gives a reward of -164.50 (10 % of the 1,645.00 product line).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_5\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.1, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Open the Promotion list of a qualifying new order"
 *  Pre-conditions
 *    1. Login as the salesperson Thomas Semerich
 *    2. Company Disc-Cust (Public Pricelist USD) exists
 *    3. Opportunity of that company exists
 *    4. Migration audit from the development team (NOT ON THE REFERENCE SYSTEM - no audit exists there)
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list
 *    3. Pick Deal registration and click Save
 *  Expected
 *    2. The list holds exactly the programs the audit keeps, including "Deal registration promotion, 10% on
 *       Product, Support Services do not qualify"
 *       -> reference system: the DR entry is asserted; "exactly the programs the audit keeps" is an
 *          Observation (not scored) - there is no audit on the reference system; the full list is printed.
 *    3. The reward is 10% of the listed product line (-164.50): the program's configuration is intact.
 * ================================================================================================
 */

const TC = 'Discount_5.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  pre4: '[NOT ON THE REFERENCE SYSTEM - the migration audit from the development team does not exist on the reference system] Pre-condition 4: migration audit',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list',
  s3: 'Step 3: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Promotion list of a qualifying new order (pre-prod baseline of CRM-12144_5.1)`, () => {
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

  test(`${TC}: Promotion list of a qualifying new order`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
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

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log('  - No migration audit exists on the reference system: the programs it would keep are not compared.');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  Observation (not scored): full Promotion list the reference system offers (${options.length} entries):`);
      options.forEach((o, i) => console.log(`    ${i + 1}. ${o}`));
      console.log('  Observation (not scored): "exactly the programs the audit keeps" cannot be checked - no audit on the reference system.');
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 - the Promotion list includes the Deal registration program',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion list open');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion('Deal registration');
      const lineSubtotal = await dealElementPage.getOrderLineRowCells(0).then((r) => r['Subtotal'] ?? '');
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const reward = rewards[0]?.['Unit Price'] ?? '';
      const expectedReward = -Math.round(money(lineSubtotal) * 10) / 100;
      console.log(`  - A2144B line Subtotal : ${lineSubtotal} (10% = ${(-expectedReward).toFixed(2)})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - Reward (10% of the listed product line)', expected: '-164.50', actual: reward || '(none)', passed: money(reward) === -164.5 && money(reward) === expectedReward },
      ], `${TC} - Step 3 reward`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
