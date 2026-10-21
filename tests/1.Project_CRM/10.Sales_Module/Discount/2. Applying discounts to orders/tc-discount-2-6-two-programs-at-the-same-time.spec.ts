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
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.6 - Order eligible for two programs at the same time   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.6
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_2.6 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - "Program editor" -> sale.coupon.program record created over JSON-RPC by ProgramOwner (5 %, scope order, customer).
 *   - Step 4: the Promotion field takes ONE program (promotion_id is a single many2one). Deal registration is picked,
 *     then the test program is picked; the field keeps the last pick. The two reward lines are read as the TC states
 *     them and asserted as written - the run shows what the reference system does.
 *
 * Summary
 * -------
 * A2144B x 5 (1,645.00) is offered both Deal registration and the 5 % test program; by design only ONE program can be
 * applied, so the second pick replaces the first: one reward line, the test program's -82.25 (tester, 2026-10-21).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.6:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.6, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program: 5 %, scope order, customer = Disc-Cust-<timestamp>
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD); salesperson login
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT (payment terms rule)
 *    2. On Order Lines, add A2144B with Ordered Qty 5
 *    3. Open the Promotion list
 *         -> Expected: the list contains Deal registration and the test program
 *    4. Apply both programs and click Save
 *         -> Expected (changed by the tester on 2026-10-21 - by design only ONE discount program can be selected;
 *            CRM-12144_2.6 still says "each program appears as its own reduction"): the Promotion field holds one
 *            program, the one picked last (the test program); exactly one reward line on the order, the test
 *            program's -82.25 (5% of 1,645.00); no Deal registration reward line
 *    5. Clean-up
 * ================================================================================================
 */

const TC = 'Discount_2.6';
const PROGRAM_PREFIX = 'AUTO-Discount-2.6';
const TEST_PROGRAM_PRODUCT = '5.0% discount on total amount';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: [program owner, JSON-RPC] Create the program AUTO-Discount-2.6-<timestamp>: 5 %, scope order, customer = Disc-Cust-<timestamp>',
  pre3: 'Pre-condition 3: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre4: 'Pre-condition 4: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre5: 'Pre-condition 5: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Apply both programs and click Save',
  s5: '[done by the afterEach teardown] Step 5: Clean-up',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Order eligible for two programs at the same time (pre-prod baseline of CRM-12144_2.6)`, () => {
  let run: DiscountRun;
  let openedOwner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    openedOwner = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (openedOwner) {
      await openedOwner.close().catch(() => {});
      openedOwner = undefined;
    }
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Order eligible for two programs at the same time`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const programName = `${PROGRAM_PREFIX}-${run.ts}`;

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${users.admin_crm.username} (${users.admin_crm.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await owner.createProgram(run, { name: programName, percent: 5, scope: 'order', customerName: run.company });
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - signed in as the salesperson');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - company created');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - opportunity created');
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
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Promotion list contains Deal registration', expected: DISCOUNT_BASELINE.dealRegistration, actual: options.join(' | ') || '(empty)', passed: options.includes(DISCOUNT_BASELINE.dealRegistration) },
        { what: 'Step 3 - the Promotion list contains the test program', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 3 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.setPromotion(DISCOUNT_BASELINE.dealRegistration);
      await dealElementPage.setPromotion(programName);
      console.log('  - By design the Promotion field holds ONE program: the second pick (the test program) replaces Deal registration');
      await saveDealElement(page, run);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewardLines = rows.filter((r) => /discount on/i.test(r['Product'] ?? ''));
      const programLines = rows.filter((r) => (r['Description'] ?? '').trim() === programName);
      const dealRegLines = rows.filter((r) => (r['Product'] ?? '').trim() === DISCOUNT_BASELINE.dealRegistrationProduct);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Reward lines: ${rewardLines.length} (program ${programLines.length} | Deal registration ${dealRegLines.length}) | Total ${total}`);
      // Expected changed by the tester on 2026-10-21: by design only ONE discount program can be selected on an order
      // (was: "each program appears as its own reduction" - test program -82.25 AND Deal registration -164.50)
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Promotion holds one program: the one picked last (the test program)', expected: programName, actual: promotion || '(empty)', passed: promotion === programName },
        { what: 'Step 4 - exactly one reward line on the order', expected: '1', actual: String(rewardLines.length), passed: rewardLines.length === 1 },
        { what: "Step 4 - that line is the test program's reduction on the pre-discount amount", expected: '-82.25 (5% of 1,645.00)', actual: programLines[0]?.['Unit Price'] ?? '(no line)', passed: programLines.length === 1 && money(programLines[0]['Unit Price']) === -82.25 },
        { what: 'Step 4 - no Deal registration reward line (the second pick replaced it)', expected: '0', actual: String(dealRegLines.length), passed: dealRegLines.length === 0 },
      ], `${TC} - Step 4 one program applied`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - both programs applied, Save');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      console.log(`  - Program ${programName} (product "${TEST_PROGRAM_PRODUCT}") and the run's records are removed by the teardown`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
