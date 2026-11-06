import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.10 - Order that meets only one of a program's two conditions   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.10
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.10 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13773
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - Two end customers = two DiscountRun objects (runA = Disc-CustA with the program, runB = Disc-CustB).
 *   - "Program editor" -> sale.coupon.program record created over JSON-RPC by ProgramOwner
 *     (customer = CustA AND Min qty >= 3 - both conditions are stored on the one program).
 *
 * Summary
 * -------
 * The program needs customer CustA AND quantity >= 3: CustB at 3 is not offered, CustA at 2 is not offered,
 * CustA at 3 is offered.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.10:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.10, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program: customer = Disc-CustA-<timestamp> AND Min qty >= 3 (5 %, scope order)
 *    2. Companies Disc-CustA-<timestamp> and Disc-CustB-<timestamp> (end customers, Public Pricelist USD)
 *    3. Opportunities Disc-OppA-<timestamp> and Disc-OppB-<timestamp>
 *  Steps
 *    1. Open Disc-OppB, DEAL ELEMENT; add A2160B Qty 3
 *    2. Open the Promotion list
 *         -> Expected: the list does not contain the program (wrong customer)
 *    3. Open Disc-OppA, DEAL ELEMENT; add A2160B Qty 2
 *    4. Open the Promotion list
 *         -> Expected: the list does not contain the program (quantity below 3)
 *    5. Change Ordered Qty to 3 and open the Promotion list
 *         -> Expected: the list contains the program (both conditions met)
 *    6. Clean-up
 * ================================================================================================
 */

const TC = 'Discount_1.10';
const PROGRAM_PREFIX = 'AUTO-Discount-1.10';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre3: 'Pre-condition 3: Contacts > Create the end-customer companies Disc-CustA-<timestamp> and Disc-CustB-<timestamp> with Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: [program owner, JSON-RPC] Create the program AUTO-Discount-1.10-<timestamp>: 5 %, scope order, customer = Disc-CustA-<timestamp>, Min qty >= 3',
  pre5: 'Pre-condition 5: CRM > Pipeline (LIST view) > Create the opportunity Disc-OppA-<timestamp> for Disc-CustA-<timestamp>',
  pre6: 'Pre-condition 6: CRM > Pipeline (LIST view) > Create the opportunity Disc-OppB-<timestamp> for Disc-CustB-<timestamp>',
  s1: 'Step 1: Open Disc-OppB, DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2160B Qty 3',
  s2: 'Step 2: Open the Promotion list',
  s3: 'Step 3: Open Disc-OppA, DEAL ELEMENT; add A2160B Qty 2',
  s4: 'Step 4: Open the Promotion list',
  s5: 'Step 5: Change Ordered Qty to 3 and open the Promotion list',
  s6: '[done by the afterEach teardown] Step 6: Clean-up',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Order that meets only one of a program's two conditions (pre-prod baseline of CRM-12144_1.10)`, () => {
  const runs: DiscountRun[] = [];
  let openedOwner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    runs.length = 0;
    openedOwner = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (openedOwner) {
      await openedOwner.close().catch(() => {});
      openedOwner = undefined;
    }
    if (!SKIP_CLEANUP) {
      const errors: string[] = [];
      for (const r of runs) await teardownDiscountRun(page, r, testInfo).catch((e: Error) => errors.push(e.message));
      if (errors.length) throw new Error(errors.join(' | '));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Order that meets only one of a program's two conditions`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const runA = newDiscountRun();
    const runB = newDiscountRun();
    runs.push(runA, runB);
    const programName = `${PROGRAM_PREFIX}-${runA.ts}`;

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${users.admin_crm.username} (${users.admin_crm.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompany(page, runA, SALES);
      await createEndCustomerCompany(page, runB, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - two companies created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await owner.createProgram(runA, { name: programName, percent: 5, scope: 'order', customerName: runA.company, minQty: 3 });
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await createOpportunityForCompany(page, runA, SALES);
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      await createOpportunityForCompany(page, runB, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - opportunity B created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrlReloaded(runB.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 3);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '63.00');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - Disc-CustB at quantity 3: the Promotion list does not contain the program (wrong customer)', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 2 Promotion list for Disc-CustB`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(runA.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 2);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '42.00');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Disc-CustA at quantity 2: the Promotion list does not contain the program (quantity below 3)', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 4 Promotion list for Disc-CustA at quantity 2`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.changeQtyInRow(DISCOUNT_BASELINE.noProgramProduct, 3);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '63.00');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Disc-CustA at quantity 3: the Promotion list contains the program (both conditions met)', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 5 Promotion list for Disc-CustA at quantity 3`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      console.log(`  - Records of Disc-CustA (${runA.company}) and Disc-CustB (${runB.company}) removed by the teardown`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
