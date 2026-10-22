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
  newDiscountRun,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  PROGRAM_EDITOR_WRITES_CONFIRMED,
  PROGRAM_EDITOR_MANUAL_REASON,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.6 - Reach a program's minimum quantity exactly   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.6
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 23, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.6 (Jira CRM-13769; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-6-minimum-quantity-exact.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-04
 * Source version   : master row CRM-12144_1.6 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * BLOCKED - Program-editor writes not authorised yet (QI p.3; tester 2026-10-21: "mark manual, I will confirm with Dev later")
 *   The whole describe block is skipped by test.skip(!PROGRAM_EDITOR_WRITES_CONFIRMED, PROGRAM_EDITOR_MANUAL_REASON) at
 *   describe level, so its beforeEach / afterEach / afterAll hooks do not run either (nothing is logged in to crm-mig).
 *   It runs only after Dev confirms and PROGRAM_EDITOR_WRITES_CONFIRMED is set to true.
 *   Manual steps (labelled [MANUAL ONLY ...] in STEP):
 *     - Pre-condition 4 : add the row QA-Disc-<timestamp> with Min qty = >= 3 and Save as version N
 *     - Step 6          : Clean-up - delete the row QA-Disc-<timestamp> and Save as version N
 *   Reason: PROGRAM_EDITOR_MANUAL_REASON = "MANUAL ONLY - QI p.3: program-table edits in the Program editor are the
 *           development team's (except TC-13); QA writes not confirmed by Dev yet (tester decision 2026-10-21)"
 *
 * Summary
 * -------
 * A 5 % order program QA-Disc-<timestamp> with Min qty >= 3 is not offered at quantity 2 and is offered at
 * quantity 3 (A2160B).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.6:" --project=chromium   (skipped until PROGRAM_EDITOR_WRITES_CONFIRMED is true)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.6, master "Migration - Discount" row 23) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Reach a program's minimum quantity exactly (IS-CRM-FUNC-0074-04)
 *  Priority: P3 | Spec Areas: 0074-04 - qty = minimum
 *
 *  Pre-running conditions:
 *  * Pre-conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-Cust-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  Add a row to the program table with:
 *  _ Promo code = QA-<timestamp>
 *  _ Name = QA-Disc-<timestamp>
 *  _ Reward percent = 5.0
 *  _ Scope = order
 *  _ Target product codes = (empty)
 *  _ Customer condition (Advanced) = customer name is Disc-Cust-<timestamp>
 *  _ Min qty = >= 3
 *  Click Save as version N and confirm the new version is the active one
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *  2. On Order Lines, add A2160B with Ordered Qty 2
 *  3. Open the Promotion list
 *  4. Change Ordered Qty to 3
 *  5. Open the Promotion list
 *  6. Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N
 *
 *  Expected Results:
 *  3. The list does not contain QA-Disc-<timestamp>
 *  5. The list contains QA-Disc-<timestamp>
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; company and opportunity through the Mig helpers;
 *  the crm-mig login is moved ahead of the company (a company needs a session; the master lists the login after the row);
 *  the editor row is keyed on the editor's column titles ("Customer condition (Advanced)" -> column "Advanced", "Min qty"
 *  -> column "Min qty"). Teardown = teardownDiscountRunMig in afterEach + sweepDiscountRunsMig in afterAll.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.6';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] Add a row to the program table with: Promo code = QA-<timestamp>, Name = QA-Disc-<timestamp>, Reward percent = 5.0, Scope = order, Target product codes = (empty), Customer condition (Advanced) = customer name is Disc-Cust-<timestamp>, Min qty = >= 3; Click Save as version N and confirm the new version is the active one',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2160B with Ordered Qty 2',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Change Ordered Qty to 3',
  s5: 'Step 5: Open the Promotion list',
  s6: 'Step 6: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N',
  verify: 'Verification',
} as const;

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Program editor's certificate chain is self-signed

/** Every run of this file - the afterAll sweep re-finds a run's leftovers by its own marker (never by a keep-list). */
const runs: DiscountRun[] = [];
/** Program-editor rows this file added and has not removed yet, by the name the add call gave them. */
const editorRows: string[] = [];

const forgetEditorRow = (name: string): void => {
  const i = editorRows.indexOf(name);
  if (i >= 0) editorRows.splice(i, 1);
};

/** Remove the Program-editor rows this file added and has not removed (crm-mig rule: the teardown deletes what it made). */
async function removeEditorRows(page: Page): Promise<void> {
  if (!editorRows.length) return;
  const editor = new DiscountProgramEditorPageMig(page);
  await editor.signIn(EDITOR_ACCOUNT);
  for (const name of [...editorRows]) {
    await editor.deleteProgramRowAndSaveVersion(name);
    forgetEditorRow(name);
  }
}

test.describe(`${TC} - Reach a program's minimum quantity exactly (crm-mig)`, () => {
  test.skip(!PROGRAM_EDITOR_WRITES_CONFIRMED, PROGRAM_EDITOR_MANUAL_REASON);

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

  test(`${TC}: Reach a program's minimum quantity exactly`, baselineDetails(TC), async ({ page }, testInfo) => {
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
      // Program-editor write: refused by DiscountProgramEditorPageMig until PROGRAM_EDITOR_WRITES_CONFIRMED is true
      await editor.addProgramRowAndSaveVersion({
        'Promo code': promoCode,
        Name: programName,
        'Reward percent': '5.0',
        Scope: 'order',
        'Target product codes': '', // "(empty)" in the master row
        Advanced: `customer name is ${run.company}`,
        'Min qty': '>= 3',
      });
      editorRows.push(programName);
      const versions = await editor.getVersions();
      const newest = Math.max(...versions.map((v) => v.version));
      const active = versions.find((v) => v.active);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 4 - the new version is the active one', expected: `Version ${newest} (newest) Active`, actual: active ? `Version ${active.version} Active` : '(none active)', passed: !!active && active.version === newest },
      ], `${TC} - Pre-condition 4 new version active`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - program row saved as a new version');
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 2);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '42.00');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - at quantity 2 the Promotion list does not contain QA-Disc-<timestamp>', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 3 Promotion list at quantity 2`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 3);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '63.00');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - at quantity 3 the Promotion list contains QA-Disc-<timestamp>', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 5 Promotion list at quantity 3`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      // Program-editor write: refused until PROGRAM_EDITOR_WRITES_CONFIRMED is true
      await editor.deleteProgramRowAndSaveVersion(programName);
      forgetEditorRow(programName);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
