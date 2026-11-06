import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
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
 *  Discount_5.6 - Offer programs limited to reseller orders and to distributor orders   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_5.6
 * Automation-Type  : new
 * Automation-Date  : 2026-11-05
 * Mirrors          : CRM-12144_5.6 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected results,
 *                    run on the reference system so the crm-mig result can be compared field by field (CRM-14435 row 5)
 * Jira             : CRM-14437 (master "Sales module" row 155)
 * Spec note        : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0087 leaves the Reseller /
 *                    Distributor eligibility condition out of the new system; this case records how the reference system
 *                    behaves with it
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - "Program editor" -> two sale.coupon.program records created over JSON-RPC by ProgramOwner, with For Reseller /
 *     For Distributor ticked (Sales > Products > Promotion Programs shows them as the "For Reseller" / "For Distributor"
 *     check boxes; their Based on Reseller / Distributor domains keep the default reseller = True / distributor = True).
 *
 * Summary
 * -------
 * Two 5 % order programs limited to the run's customer, one For Reseller, one For Distributor: neither is offered on an
 * order with no reseller and no distributor; setting the reseller brings in the reseller program only; setting the
 * distributor as well brings in the distributor program too.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_5\.6:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.6, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Programs AUTO-Discount-5.6-R-<timestamp> (For Reseller) and AUTO-Discount-5.6-D-<timestamp> (For Distributor):
 *       5 %, scope order, customer = Disc-Cust-<timestamp> (run by the CRM administrator, users.admin_crm)
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD); salesperson login
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT (payment terms rule)
 *    2. On Order Lines, add A2160B with Ordered Qty 1
 *    3. Open the Promotion list
 *         -> Expected: the list contains neither program (no reseller, no distributor on the order)
 *    4. Set Reseller = Bailey Systems (a Bronze reseller)
 *    5. Open the Promotion list
 *         -> Expected: the list contains the reseller program and not the distributor program
 *    6. Set Distributor = QBS Software Ltd (a distributor)
 *    7. Open the Promotion list
 *         -> Expected: the list contains both programs
 *    8. Clean-up
 * ================================================================================================
 */

const TC = 'Discount_5.6';
const PROGRAM_PREFIX = 'AUTO-Discount-5.6';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: [program owner, JSON-RPC] Create the programs AUTO-Discount-5.6-R-<timestamp> (For Reseller) and AUTO-Discount-5.6-D-<timestamp> (For Distributor): 5 %, scope order, customer = Disc-Cust-<timestamp>',
  pre3: 'Pre-condition 3: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre4: 'Pre-condition 4: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre5: 'Pre-condition 5: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2160B with Ordered Qty 1',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Set Reseller = Bailey Systems (a Bronze reseller)',
  s5: 'Step 5: Open the Promotion list',
  s6: 'Step 6: Set Distributor = QBS Software Ltd (a distributor)',
  s7: 'Step 7: Open the Promotion list',
  s8: '[done by the afterEach teardown] Step 8: Clean-up: as the CRM administrator, archive both programs, then delete them (Odoo refuses to delete an active program)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Offer programs limited to reseller orders and to distributor orders (pre-prod baseline of CRM-12144_5.6)`, () => {
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

  test(`${TC}: Offer programs limited to reseller orders and to distributor orders`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const resellerProgram = `${PROGRAM_PREFIX}-R-${run.ts}`;
    const distributorProgram = `${PROGRAM_PREFIX}-D-${run.ts}`;
    const offered = (options: string[]) => `${resellerProgram}: ${options.includes(resellerProgram) ? 'listed' : 'not listed'}; ${distributorProgram}: ${options.includes(distributorProgram) ? 'listed' : 'not listed'}`;

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${users.admin_crm.username} (${users.admin_crm.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await owner.createProgram(run, { name: resellerProgram, percent: 5, scope: 'order', customerName: run.company, forReseller: true });
      await owner.createProgram(run, { name: distributorProgram, percent: 5, scope: 'order', customerName: run.company, forDistributor: true });
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - no reseller, no distributor: the Promotion list contains neither program', expected: `${resellerProgram}: not listed; ${distributorProgram}: not listed`, actual: offered(options), passed: !options.includes(resellerProgram) && !options.includes(distributorProgram) },
      ], `${TC} - Step 3 Promotion list without reseller or distributor`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - reseller set: the Promotion list contains the reseller program, not the distributor program', expected: `${resellerProgram}: listed; ${distributorProgram}: not listed`, actual: offered(options), passed: options.includes(resellerProgram) && !options.includes(distributorProgram) },
      ], `${TC} - Step 5 Promotion list with a reseller`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.setDistributor(DISCOUNT_PARTNERS.distributor);
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 7 - reseller and distributor set: the Promotion list contains both programs', expected: `${resellerProgram}: listed; ${distributorProgram}: listed`, actual: offered(options), passed: options.includes(resellerProgram) && options.includes(distributorProgram) },
      ], `${TC} - Step 7 Promotion list with a reseller and a distributor`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      console.log(`  - Programs ${resellerProgram} / ${distributorProgram} and the run's records are removed by the teardown`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
