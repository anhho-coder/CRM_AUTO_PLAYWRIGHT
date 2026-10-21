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
  sameCents,
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
 *  Discount_7.1 - Build the same order on crm-mig and on the reference system   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_7.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_7.1 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results; this run is the reference-system half of the parity comparison
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_7.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * On the reference system the same order (A2144B x 5 with Deal registration) is built and its Promotion list,
 * reward, Total and Total in Company Currency are recorded for the crm-mig comparison.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_7\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_7.1, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Build the same order on crm-mig and on the reference system"
 *  Pre-conditions
 *    1. Login as the salesperson Thomas Semerich
 *    2. Company Disc-Cust with Public Pricelist_EUR (DISCOUNT_BASELINE.pricelistEur) exists
 *    3. Opportunity of that company exists (the same company / opportunity on the reference system)
 *  Steps
 *    1. On crm-mig, open the opportunity, DEAL ELEMENT (payment terms rule), add A2144B Qty 5 and open the Promotion list
 *       (Qty changed 4 -> 5 by the tester on 2026-10-21: on Public Pricelist_EUR A2144B is 289.00, so 4 x 289.00 =
 *        1,156.00 EUR - below the 1,400 USD minimum = 1,247.22 EUR at 0.890869 - and Deal registration is not
 *        offered; 5 x 289.00 = 1,445.00 EUR reaches it. CRM-12144_7.1 still says Qty 4.)
 *    2. Pick Deal registration and click Save
 *    3. Repeat steps 1 and 2 on the reference system on the same day
 *    4. Compare the two
 *  Reference-system implementation
 *    - Steps 1 and 2 are performed in this run (this IS the reference system) with checks: the Promotion list contains
 *      Deal registration; one reward line; reward = -10% of the A2144B line Subtotal; Total and Total in Company
 *      Currency are shown.
 *    - Step 3 logs only. Step 4 prints the list, reward %, reward amount, Total and Total in Company Currency.
 * ================================================================================================
 */

const TC = 'Discount_7.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_EUR',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: On crm-mig, open the opportunity, click DEAL ELEMENT (if Payment Terms is empty, set Payment Terms = Immediate Payment), add A2144B with Ordered Qty 5 and open the Promotion list',
  s2: 'Step 2: Pick Deal registration and click Save',
  s3: '[REFERENCE SIDE - this run is the reference system] Step 3: Repeat steps 1 and 2 on the reference system on the same day',
  s4: '[REFERENCE SIDE - this run is the reference system] Step 4: Compare the two',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Same order on crm-mig and on the reference system (pre-prod baseline of CRM-12144_7.1)`, () => {
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

  test(`${TC}: Build the same order on crm-mig and on the reference system`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const values: Record<string, string> = {};
    let options: string[] = [];

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
      await createEndCustomerCompany(page, run, SALES, DISCOUNT_BASELINE.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - EUR company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  Performed in this run: this IS the reference system (the crm-mig side is the other run).');
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5); // tester 2026-10-21: 4 -> 5 (4 x 289.00 EUR is below the minimum)
      await dealElementPage.blurForm();
      const line = await dealElementPage.getOrderLineRowCells(0);
      values['A2144B line Subtotal'] = line['Subtotal'] ?? '';
      options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 - the Promotion list contains Deal registration',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 1 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Promotion list open');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const reward = rewards[0]?.['Unit Price'] ?? '';
      const subtotal = money(values['A2144B line Subtotal']);
      const expectedReward = -Math.round(subtotal * 10) / 100;
      values['reward'] = reward || '(none)';
      values['reward %'] = reward && subtotal ? `${((-money(reward) / subtotal) * 100).toFixed(2)} %` : '(n/a)';
      values['reward amount'] = reward || '(none)';
      values['Total'] = await dealElementPage.getSubtotalFooterValue('amount_total');
      values['Total in Company Currency'] = await dealElementPage.getVisibleFieldValue('amount_total_company_signed');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        {
          what: 'Step 2 - reward = -10% of the A2144B line Subtotal',
          expected: `${expectedReward.toFixed(2)} (10% of ${values['A2144B line Subtotal']})`,
          actual: reward || '(none)',
          passed: rewards.length === 1 && sameCents(money(reward), expectedReward),
        },
        { what: 'Step 2 - Total is shown', expected: 'a non-empty amount', actual: values['Total'] || '(empty)', passed: !Number.isNaN(money(values['Total'])) },
        { what: 'Step 2 - Total in Company Currency is shown', expected: 'a non-empty amount', actual: values['Total in Company Currency'] || '(empty)', passed: !Number.isNaN(money(values['Total in Company Currency'])) },
      ], `${TC} - Step 2 reward and totals`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals, "[name='amount_total_company_signed']"]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - Deal registration saved on the reference system');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log('  This run is on the reference system itself: steps 1 and 2 above are the reference-system build.');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log('  Recorded for the crm-mig comparison:');
      console.log(`    - Promotion list         : ${options.join(' | ') || '(empty)'}`);
      console.log(`    - reward %               : ${values['reward %']}`);
      console.log(`    - reward amount          : ${values['reward amount']}`);
      console.log(`    - Total                  : ${values['Total']}`);
      console.log(`    - Total in Company Currency : ${values['Total in Company Currency']}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
