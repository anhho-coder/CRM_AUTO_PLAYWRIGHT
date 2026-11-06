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
 *  Discount_1.1 - Create and name a new Discount Program with a condition and a percentage   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.1 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13764
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - "Program editor" -> sale.coupon.program records created over JSON-RPC by ProgramOwner (no editor screen used).
 *   - "Save as version N" -> no versions on Odoo 12 EE: the program is saved on create; step 2 asserts the saved record.
 *   - "In crm-mig" -> "Open the opportunity" on pre-production (this spec runs on the reference system).
 *
 * Summary
 * -------
 * A 5 % order program limited to the customer Disc-Cust-<ts> is offered in the Promotion list of its Deal Element and,
 * once picked and saved, adds one reward line "5.0% discount on total amount" of -1.05 (5 % of A2160B x 1 = 21.00).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.1, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program editor login (CRM administrator)
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD); salesperson login
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. In the Program editor, add a row with Name, Reward percent = 5.0, Scope = order and
 *       Customer condition = customer name is Disc-Cust-<timestamp>
 *    2. Click Save as version N
 *         -> Expected: the new version is the active one; the version list names the account that saved it
 *            [reference system: no versions - asserted as: program active = true and created by the program owner]
 *    3. In crm-mig, open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    4. On Order Lines, add A2160B with Ordered Qty 1
 *    5. Open the Promotion list (if the program is missing, wait one minute and change the quantity)
 *         -> Expected: the Promotion list contains the program
 *    6. Pick the program and click Save
 *         -> Expected: exactly one reward line: Description = program name; Product = "5.0% discount on total amount";
 *            Amount = -5% of the lines' total (21.00 x 5 % = -1.05)
 *    7. Clean-up: delete the row
 * ================================================================================================
 */

const TC = 'Discount_1.1';
const PROGRAM_PREFIX = 'AUTO-Discount-1.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre3: 'Pre-condition 3: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: '[program owner, JSON-RPC] Step 1: In the Program editor, add a row with Name = AUTO-Discount-1.1-<timestamp>, Reward percent = 5.0, Scope = order and Customer condition = customer name is Disc-Cust-<timestamp>',
  s2: '[program owner, JSON-RPC] Step 2: Click Save as version N',
  s3: 'Step 3: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s4: 'Step 4: On Order Lines, add A2160B with Ordered Qty 1',
  s5: 'Step 5: Open the Promotion list (if the program is missing, wait one minute and change the quantity)',
  s6: 'Step 6: Pick the program and click Save',
  s7: '[done by the afterEach teardown] Step 7: Clean-up: delete the row',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;
const PROGRAM_OWNER = users.admin_crm;

test.describe(`${TC} - Create and name a new Discount Program with a condition and a percentage (pre-prod baseline of CRM-12144_1.1)`, () => {
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

  test(`${TC}: Create and name a new Discount Program with a condition and a percentage`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const programName = `${PROGRAM_PREFIX}-${run.ts}`;

    // Program editor session (own request context, signed in as the CRM administrator)
    const owner = await ProgramOwner.open();
    openedOwner = owner;
    let programId: number | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${PROGRAM_OWNER.username} (${PROGRAM_OWNER.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      programId = await owner.createProgram(run, {
        name: programName,
        percent: 5,
        scope: 'order',
        customerName: run.company,
      });
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  - Reference system has no program versions (Odoo 12 EE): the program is saved on create.');
      console.log('  - Asserting the saved record instead: active flag and the account that created it.');
      const rec = (await owner.call('sale.coupon.program', 'read', [[programId]], { fields: ['name', 'active', 'create_uid'] }))[0];
      const creator: string = rec?.create_uid?.[1] ?? '(none)';
      // the program owner's user as Odoo names it (users.config displayName is a label, e.g. "Anh Ho" for "Ho Quoc Anh")
      const ownerName: string = (await owner.call('res.users', 'search_read', [[['login', '=', PROGRAM_OWNER.username]]], { fields: ['name'], limit: 1 }))[0]?.name ?? PROGRAM_OWNER.displayName;
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the program is the active one', expected: 'active = true', actual: `active = ${rec?.active}`, passed: rec?.active === true },
        { what: 'Step 2 - the account that saved it', expected: ownerName, actual: creator, passed: creator === ownerName },
      ], `${TC} - Step 2 saved program`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      let options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      if (!options.includes(programName)) {
        await dealElementPage.closePromotionList();
        console.log('  - Program not offered yet: waiting one minute, then changing the quantity 1 -> 2 -> 1');
        await page.waitForTimeout(60_000);
        await dealElementPage.changeQtyInRow(DISCOUNT_BASELINE.noProgramProduct, 2);
        await dealElementPage.changeQtyInRow(DISCOUNT_BASELINE.noProgramProduct, 1);
        await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
        options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - the Promotion list contains the program', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 5 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.setPromotion(programName);
      await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rows.filter((r) => (r['Description'] ?? '').trim() === programName);
      const line = reward[0] ?? {};
      console.log(`  - Lines with Description = program name: ${reward.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - exactly one reward line with Description = program name', expected: '1', actual: String(reward.length), passed: reward.length === 1 },
        { what: 'Step 6 - reward line Product', expected: '5.0% discount on total amount', actual: (line['Product'] ?? '(none)').trim(), passed: (line['Product'] ?? '').trim() === '5.0% discount on total amount' },
        { what: 'Step 6 - reward amount = -5% of the lines total (21.00)', expected: '-1.05', actual: line['Unit Price'] ?? '(none)', passed: money(line['Unit Price'] ?? '') === -1.05 },
      ], `${TC} - Step 6 reward line`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-6 - program picked, reward line');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      console.log(`  - Program id to remove : ${programId ?? '(not created)'} (${programName})`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
