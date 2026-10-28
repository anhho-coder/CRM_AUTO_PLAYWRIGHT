import { test, Page } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, DiscountProgramEditorPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
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
  PROGRAM_EDITOR_MANUAL_REASON,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.6 - Order eligible for two programs at the same time   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.6
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 42, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - program-editor steps reworded to the Kanban path (New program > Save; card >
 *                    Delete), master row 42 updated the same day - the CRM-12144_5.3 standard (tester 2026-10-27)
 * Baseline         : Discount_2.6 (Jira CRM-13783; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-6-two-programs-at-the-same-time.spec.ts) - CRM-side assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0080, IS-CRM-FUNC-0096
 * Source version   : master row CRM-12144_2.6 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * MANUAL ONLY - chỉ run manual (tester, 2026-10-22). Program-table edits belong to the development team: QI p.3 + p.28
 *   (TC-14 to TC-18 at QA's request); Nathan, CRM-12467 2026-10-20: QA runs only TC-13 and TC-19.
 *   The whole describe block is skipped by test.skip(true, PROGRAM_EDITOR_MANUAL_REASON) at
 *   describe level, so its beforeEach / afterEach / afterAll hooks do not run either (nothing is logged in to crm-mig).
 *   It never runs in automation: run the manual TC by hand, the development team doing the Program-editor steps.
 *   Manual steps (labelled [MANUAL ONLY ...] in STEP):
 *     - Pre-condition 4 : create the program QA-Disc-<timestamp> (Kanban: New program) (customer = Disc-Cust) and Save
 *     - Step 5          : Clean-up - Delete the program QA-Disc-<timestamp> on its Kanban card and confirm
 *   Reason: PROGRAM_EDITOR_MANUAL_REASON = "chỉ run manual - program-table edits in the Program editor are the
 *           development team's: QI p.3 (except TC-13) and p.28 (TC-14 to TC-18 at QA's request); Nathan,
 *           CRM-12467 2026-10-20: QA runs only TC-13 and TC-19"
 *
 * Expected result - CONFLICT between the master row and the baseline (not resolved here)
 *   Tester-approved change recorded in the baseline Discount_2.6 header (2026-10-21): by design only ONE discount
 *   program can be applied to an order. This port asserts that: Step 4 = the Promotion field holds the program picked
 *   last (QA-Disc-<timestamp>), exactly one reward line, -82.25 (5 % of 1,645.00), no Deal registration reward line.
 *   The master row (39) still reads in Expected step 4: "Each program appears as its own reduction, each computed on the
 *   pre-discount amount (no compounding): QA-Disc-<timestamp> = -82.25 (5% of 1,645.00); Deal registration = -164.50
 *   (10% of 1,645.00)". That wording is NOT asserted here. The two disagree; the tester must say which one the master
 *   row keeps.
 *
 * Summary
 * -------
 * A2144B x 5 (1,645.00) is offered both Deal registration and the 5 % program QA-Disc-<timestamp>. Only ONE program can
 * be applied, so the second pick replaces the first: one reward line, the program's -82.25.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.6:" --project=chromium   (always skipped - chỉ run manual)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.6, master "Migration - Discount" row 42) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Order eligible for two programs at the same time (IS-CRM-FUNC-0080, IS-CRM-FUNC-0096)
 *  Priority: P2 | Spec Areas: 0080/0096 - 2 programs at once
 *
 *  Pre-running conditions:
 *  * Pre-conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-Cust-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  In the Program editor, open Discount Programs (Kanban view), click New program and enter:
 *  _ Promo code = QA-<timestamp>
 *  _ Program name = QA-Disc-<timestamp>
 *  _ Reward = 5.0 %
 *  _ Applies to = Whole order
 *  _ For = (empty - the For field shows only for Specific products)
 *  _ Advanced (customer condition) = customer name is Disc-Cust-<timestamp>
 *  Click Save and confirm the new version is the active one (top bar: Version N / active)
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *  2. On Order Lines, add A2144B with Ordered Qty 5
 *  3. Open the Promotion list
 *  4. Apply both programs and click Save
 *  5. Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion
 *
 *  Expected Results:
 *  3. The list contains Deal registration and QA-Disc-<timestamp>
 *  4. Each program appears as its own reduction, each computed on the pre-discount amount (no compounding):
 *  _ QA-Disc-<timestamp> = -82.25 (5% of 1,645.00)
 *  _ Deal registration = -164.50 (10% of 1,645.00)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; company and opportunity through the Mig helpers;
 *  the crm-mig login is moved ahead of the company (a company needs a session; the master lists the login after the row);
 *  the program is entered with the program form's labels ("Customer condition (Advanced)" -> "Advanced"); Step 4 is the
 *  baseline's one-program assertion (see the Expected result conflict above). Teardown = teardownDiscountRunMig in
 *  afterEach + sweepDiscountRunsMig in afterAll.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.6';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: [MANUAL ONLY - chỉ run manual: Program-editor table edit = development team, QI p.3] In the Program editor, open Discount Programs (Kanban view), click New program and enter: Promo code = QA-<timestamp>, Program name = QA-Disc-<timestamp>, Reward = 5.0 %, Applies to = Whole order, For = (empty - the For field shows only for Specific products), Advanced (customer condition) = customer name is Disc-Cust-<timestamp>; Click Save and confirm the new version is the active one (top bar: Version N / active)',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Apply both programs (pick Deal registration, then QA-Disc-<timestamp>) and click Save',
  s5: 'Step 5: [MANUAL ONLY - chỉ run manual: Program-editor table edit = development team, QI p.3] Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion',
  verify: 'Verification',
} as const;

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Program editor's certificate chain is self-signed

/** Every run of this file - the afterAll sweep re-finds a run's leftovers by its own marker (never by a keep-list). */
const runs: DiscountRun[] = [];
/** Programs this file created in the Program editor and has not deleted yet, by the name the create call gave them. */
const editorRows: string[] = [];

const forgetEditorRow = (name: string): void => {
  const i = editorRows.indexOf(name);
  if (i >= 0) editorRows.splice(i, 1);
};

/** Delete the programs this file created in the Program editor and has not deleted (crm-mig rule: the teardown deletes what it made). */
async function removeEditorRows(page: Page): Promise<void> {
  if (!editorRows.length) return;
  const editor = new DiscountProgramEditorPageMig(page);
  await editor.signIn(EDITOR_ACCOUNT);
  for (const name of [...editorRows]) {
    await editor.deleteProgramOnKanban(name);
    forgetEditorRow(name);
  }
}

test.describe(`${TC} - Order eligible for two programs at the same time (crm-mig)`, () => {
  test.skip(true, PROGRAM_EDITOR_MANUAL_REASON); // chỉ run manual

  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.length = 0;
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    try {
      await removeEditorRows(page);
    } finally {
      if (!SKIP_CLEANUP) {
        const errors: string[] = [];
        for (const r of runs) await teardownDiscountRunMig(page, r, testInfo).catch((e: Error) => errors.push(e.message));
        if (errors.length) throw new Error(errors.join(' | '));
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
    if (editorRows.length) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
      try {
        await removeEditorRows(await context.newPage());
      } finally {
        await context.close().catch(() => {});
      }
    }
  });

  test(`${TC}: Order eligible for two programs at the same time`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const programName = `QA-Disc-${run.ts}`;
    const promoCode = `QA-${run.ts}`;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${EDITOR_ACCOUNT.username} (QA's named account, CRM-12467 row 1.7)`);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in as the salesperson on crm-mig');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      // Program-editor write: chỉ run manual - DiscountProgramEditorPageMig refuses it
      const versionBefore = await editor.getActiveVersionNumber(); // Kanban top bar, before Save
      await editor.createProgramOnKanban({
        'Promo code': promoCode,
        'Program name': programName,
        Reward: '5.0',
        'Applies to': 'Whole order',
        For: '', // "(empty)" in the master row - the For field shows only for Specific products
        Advanced: `customer name is ${run.company}`,
      });
      editorRows.push(programName);
      const versionAfter = await editor.getActiveVersionNumber(); // Kanban top bar "Version N / active"
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 4 - the new version is the active one (top bar: Version N / active)', expected: `Version ${versionBefore + 1} / active`, actual: Number.isFinite(versionAfter) ? `Version ${versionAfter} / active` : '(not shown)', passed: versionAfter === versionBefore + 1 },
      ], `${TC} - Pre-condition 4 new version active`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - program saved as a new version');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - opportunity created');
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
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Promotion list contains Deal registration', expected: DISCOUNT_MIG.dealRegistration, actual: options.join(' | ') || '(empty)', passed: options.includes(DISCOUNT_MIG.dealRegistration) },
        { what: 'Step 3 - the Promotion list contains QA-Disc-<timestamp>', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 3 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await dealElementPage.setPromotion(programName);
      console.log('  - By design the Promotion field holds ONE program: the second pick (QA-Disc-<timestamp>) replaces Deal registration');
      await saveDealElement(page, run);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewardLines = rows.filter((r) => /discount on/i.test(r['Product'] ?? ''));
      const programLines = rows.filter((r) => (r['Description'] ?? '').trim() === programName);
      const dealRegLines = rows.filter((r) => (r['Product'] ?? '').trim() === DISCOUNT_MIG.dealRegistrationProduct);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Reward lines: ${rewardLines.length} (program ${programLines.length} | Deal registration ${dealRegLines.length}) | Total ${total}`);
      // Expected as the tester changed it on 2026-10-21 (baseline Discount_2.6 header): by design only ONE discount program
      // can be selected on an order; the master row's "each program appears as its own reduction" is not asserted here
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Promotion holds one program: the one picked last (QA-Disc-<timestamp>)', expected: programName, actual: promotion || '(empty)', passed: promotion === programName },
        { what: 'Step 4 - exactly one reward line on the order', expected: '1', actual: String(rewardLines.length), passed: rewardLines.length === 1 },
        { what: "Step 4 - that line is the test program's reduction on the pre-discount amount", expected: '-82.25 (5% of 1,645.00)', actual: programLines[0]?.['Unit Price'] ?? '(no line)', passed: programLines.length === 1 && money(programLines[0]['Unit Price']) === -82.25 },
        { what: 'Step 4 - no Deal registration reward line (the second pick replaced it)', expected: '0', actual: String(dealRegLines.length), passed: dealRegLines.length === 0 },
      ], `${TC} - Step 4 one program applied`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - program applied, Save');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      // Program-editor write: chỉ run manual - refused by DiscountProgramEditorPageMig
      await editor.deleteProgramOnKanban(programName);
      forgetEditorRow(programName);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
