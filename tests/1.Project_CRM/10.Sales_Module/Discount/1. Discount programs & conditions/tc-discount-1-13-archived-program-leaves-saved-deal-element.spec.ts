import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, OpportunityPage } from '@pages';
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
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.13 - Switch a program off by saving a version without its row   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.13
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.13 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - Step 1 "delete the row and Save as version N" -> archive the program over JSON-RPC: on Odoo 12 EE it is the
 *     way to switch a program off (no versions exist; the program is saved on create).
 *   - Deal Element #1 is the one saved in pre-condition 5; step 3 re-opens it by its id.
 *
 * Summary
 * -------
 * After the program is archived, a new Deal Element of another opportunity does not offer it, and Deal Element #1
 * keeps its Promotion and its reward line unchanged.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.13:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.13, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program: 5 %, scope order, customer = Disc-Cust-<timestamp>
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD); salesperson login
 *    3. Opportunities Disc-Opp-<timestamp> and Disc-Opp2-<timestamp>
 *    4. Open Disc-Opp, DEAL ELEMENT, add A2160B Qty 1, pick the program, Save (Deal Element #1)
 *  Steps
 *    1. In the Program editor, delete the row and Save as version N
 *    2. Open Disc-Opp2, DEAL ELEMENT, add A2160B Qty 1 and open the Promotion list
 *         -> Expected: the list does not contain the program
 *    3. Open Deal Element #1
 *         -> Expected: Promotion and the reward line are still there, unchanged
 *    4. Clean-up
 * ================================================================================================
 */

const TC = 'Discount_1.13';
const PROGRAM_PREFIX = 'AUTO-Discount-1.13';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: [program owner, JSON-RPC] Create the program AUTO-Discount-1.13-<timestamp>: 5 %, scope order, customer = Disc-Cust-<timestamp>',
  pre3: 'Pre-condition 3: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre4: 'Pre-condition 4: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre5: 'Pre-condition 5: CRM > Pipeline (LIST view) > Create the opportunities Disc-Opp-<timestamp> and Disc-Opp2-<timestamp> for Disc-Cust-<timestamp>',
  pre6: 'Pre-condition 6: Open Disc-Opp, DEAL ELEMENT, add A2160B Qty 1, pick the program, Save (Deal Element #1)',
  s1: '[program owner, JSON-RPC] Step 1: In the Program editor, delete the row and Save as version N (archive the program)',
  s2: 'Step 2: Open Disc-Opp2, DEAL ELEMENT, add A2160B Qty 1 and open the Promotion list',
  s3: 'Step 3: Open Deal Element #1',
  s4: '[done by the afterEach teardown] Step 4: Clean-up',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Switch a program off by saving a version without its row (pre-prod baseline of CRM-12144_1.13)`, () => {
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

  test(`${TC}: Switch a program off by saving a version without its row`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const programName = `${PROGRAM_PREFIX}-${run.ts}`;
    const opp2Name = `Disc-Opp2-${run.ts}`;
    let programId: number | undefined;
    let opp2Url = '';
    let de1Id: number | undefined;
    let de1Promotion = '';
    let de1Reward: Record<string, string> = {};

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${users.admin_crm.username} (${users.admin_crm.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      programId = await owner.createProgram(run, { name: programName, percent: 5, scope: 'order', customerName: run.company });
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
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await createOpportunityForCompany(page, run, SALES);
      opp2Url = await createOpportunityForCompany(page, run, SALES, { name: opp2Name });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - two opportunities created');
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      await dealElementPage.setPromotion(programName);
      de1Id = await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      de1Promotion = await dealElementPage.getAppliedPromotionName();
      de1Reward = rows.find((r) => (r['Description'] ?? '').trim() === programName) ?? {};
      console.log(`  - Deal Element #1 id ${de1Id ?? '(not in URL)'} | Promotion "${de1Promotion}" | reward line Unit Price ${de1Reward['Unit Price'] ?? '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - Deal Element #1 saved with the program');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await owner.archiveProgram(programId!);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.openByUrlReloaded(opp2Url);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Promotion list does not contain the archived program', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 2 Promotion list of Disc-Opp2`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(`${baseUrl.replace(/\/$/, '')}/web#id=${de1Id}&model=sale.order&view_type=form`);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rows.find((r) => (r['Description'] ?? '').trim() === programName) ?? {};
      console.log(`  - Deal Element #1 (${idFromUrl(page.url()) ?? '?'}) now: Promotion "${promotion}" | reward Unit Price ${reward['Unit Price'] ?? '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Deal Element #1 Promotion is still the program', expected: programName, actual: promotion || '(empty)', passed: promotion === programName && promotion === de1Promotion },
        { what: 'Step 3 - Deal Element #1 reward line is still there, unchanged', expected: `${de1Reward['Unit Price'] ?? '(none)'} on ${programName}`, actual: reward['Unit Price'] ?? '(none)', passed: !!reward['Unit Price'] && money(reward['Unit Price']) === money(de1Reward['Unit Price'] ?? '') },
      ], `${TC} - Step 3 Deal Element #1`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Deal Element #1 after the program was archived');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - Records of this run removed by the teardown (program ${programId}, Deal Elements, opportunities, company)`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
