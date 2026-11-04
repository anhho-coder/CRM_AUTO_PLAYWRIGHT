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
  openCrmMigWebClient,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.6 - Reach a program's minimum quantity exactly   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.6
 * Jira             : CRM-13879 (master "Migration - Discount" row 23)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - program-editor steps reworded to the Kanban path (New program > Save; card >
 *                    Delete), master row 23 updated the same day - the CRM-12144_5.3 standard (tester 2026-10-27)
 *                    2026-11-03 - spec v7 re-sync (CRM-13848 A3, Aiva 2026-11-03): IS-CRM-FUNC-0074-04 now says the minimum
 *                    quantity counts only the order's products that meet the program's required-products condition, so the
 *                    program gets Products = A2160B and the order a line the condition does not list (A2165B x 1, steps 4-5);
 *                    UN-SKIPPED (tester 2026-11-03) under the 2026-10-27 rule "QA may create a test Discount program (then
 *                    teardown); never edit an existing program"
 * Baseline note    : the steps 4-5 check exists only on crm-mig (spec v7); steps 2-3 and 6-7 keep the baseline's checks
 * Baseline         : Discount_1.6 (Jira CRM-13769; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-6-minimum-quantity-exact.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0074-04
 * Source version   : Jira CRM-13879 / master row 23 as re-synced to spec v7 on 2026-11-03 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Program-editor writes: the run creates ONE program of its own, QA-Disc-<timestamp> (Pre-condition 4), and deletes it
 *   at Step 8 - or in afterEach / afterAll when the run stops earlier (deny-list: only the name this run created).
 *   Rule (tester 2026-10-27): QA may create a test Discount program and must delete it; an existing program is never
 *   edited (DiscountProgramEditorPageMig refuses any name that does not start with QA-Disc-). Each Save / Delete
 *   publishes a new rule version (versions are permanent history).
 * Expected RED on rule v55 (not weakened): step 5 - Aiva on CRM-13848 (2026-11-03): "Rule version 55 counts every
 *   non-reward line"; the program form's own hint under Minimum quantity reads "All order lines" (read 2026-11-03).
 *
 * Summary
 * -------
 * A 5 % order program QA-Disc-<timestamp> (Minimum quantity 3, Products = A2160B) is not offered at 2 x A2160B, still not
 * offered when 1 x A2165B (not listed) brings the order to 3 units, and offered at 3 x A2160B.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.6:" --project=chromium
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
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
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
 *  _ Advanced (customer condition, IS-CRM-FUNC-0074-02) = Add a rule: Payer > Name is Disc-Cust-<timestamp> (the Program editor calls the order's customer "Payer")
 *  _ Minimum quantity = 3
 *  _ Products = Add a rule: Products > Default Code is any of A2160B (Pick products > search A2160B > tick it > Apply)
 *  Click Save and confirm the new version is the active one (top bar: Version N / active)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *  2. On Order Lines, add A2160B with Ordered Qty 2
 *  3. Open the Promotion list
 *  4. Add A2165B with Ordered Qty 1 (a product the program's Products condition does not list)
 *  5. Open the Promotion list
 *  6. Change the Ordered Qty of A2160B to 3
 *  7. Open the Promotion list
 *  8. Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion
 *
 *  Expected Results:
 *  3. The list does not contain QA-Disc-<timestamp> (2 units of A2160B, below the minimum of 3)
 *  5. The list does not contain QA-Disc-<timestamp>: the order holds 3 units, but only the 2 units of A2160B meet the
 *     program's Products condition, and the minimum quantity counts only those (IS-CRM-FUNC-0074-04)
 *  7. The list contains QA-Disc-<timestamp> (3 units of A2160B = the minimum exactly)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; company and opportunity through the Mig helpers;
 *  the crm-mig login is moved ahead of the company (a company needs a session; the master listed the login after the row until 2026-10-30);
 *  the program is entered with the program form's labels ("Customer condition (Advanced)" -> "Advanced", "Min qty"
 *  -> "Minimum quantity"). Teardown = teardownDiscountRunMig in afterEach + sweepDiscountRunsMig in afterAll.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.6';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;
/** The one product the program's Products condition lists, and a product it does not list (1 unit = 21.00 / 445.00). */
const LISTED = 'A2160B';
const NOT_LISTED = DISCOUNT_MIG.supportProduct; // [A2165B] - a Support Services product

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: In the Program editor, open Discount Programs (Kanban view), click New program and enter: Promo code = QA-<timestamp>, Program name = QA-Disc-<timestamp>, Reward = 5.0 %, Applies to = Whole order, For = (empty - the For field shows only for Specific products), Advanced (customer condition, IS-CRM-FUNC-0074-02) = Add a rule: Payer > Name is Disc-Cust-<timestamp> (the Program editor calls the order\'s customer "Payer"), Minimum quantity = 3, Products = Add a rule: Products > Default Code is any of A2160B (Pick products > search A2160B > tick it > Apply); Click Save and confirm the new version is the active one (top bar: Version N / active)',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2160B with Ordered Qty 2',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Add A2165B with Ordered Qty 1 (a product the program\'s Products condition does not list)',
  s5: 'Step 5: Open the Promotion list',
  s6: 'Step 6: Change the Ordered Qty of A2160B to 3',
  s7: 'Step 7: Open the Promotion list',
  s8: 'Step 8: Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion',
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

test.describe(`${TC} - Reach a program's minimum quantity exactly (crm-mig)`, () => {
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
      // the run's OWN program (QA-Disc-<timestamp>); For stays empty - the form shows it only for Specific products
      const { versionBefore, versionAfter } = await editor.createProgramOnKanban({
        'Program name': programName,
        Reward: '5.0',
        'Applies to': 'Whole order',
        'Promo code': promoCode,
        'Minimum quantity': '3',
        Products: [LISTED],
        Advanced: `customer name is ${run.company}`,
      });
      editorRows.push(programName);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 4 - the new version is the active one (top bar: Version N / active)', expected: `Version ${versionBefore + 1} / active`, actual: Number.isFinite(versionAfter) ? `Version ${versionAfter} / active` : '(not shown)', passed: versionAfter === versionBefore + 1 },
      ], `${TC} - Pre-condition 4 new version active`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - program saved as a new version');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await openCrmMigWebClient(page); // the program was saved on the Program editor - back on crm-mig first
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
        { what: `Step 3 - 2 units of ${LISTED} (below the minimum of 3): the Promotion list does not contain QA-Disc-<timestamp>`, expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 3 Promotion list at 2 x ${LISTED}`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.addOrderLineStrict(NOT_LISTED, 1);
      const subtotal = await dealElementPage.waitForOrderLineCell(1, 'Subtotal', '445.00');
      console.log(`  - Order lines   : 2 x ${LISTED} (listed) + 1 x ${NOT_LISTED} (not listed) = 3 units`);
      console.log(`  - ${NOT_LISTED} Subtotal : ${subtotal}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: `Step 5 - 3 units on the order, only the 2 units of ${LISTED} meet the Products condition: the Promotion list does not contain QA-Disc-<timestamp>`,
          expected: `not ${programName} (listed is a FAIL - the minimum quantity counted the ${NOT_LISTED} line, which the Products condition does not list; spec v7 IS-CRM-FUNC-0074-04)`,
          actual: options.join(' | ') || '(empty)',
          passed: !options.includes(programName),
        },
      ], `${TC} - Step 5 Promotion list at 2 x ${LISTED} + 1 x ${NOT_LISTED}`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 3);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '63.00');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: `Step 7 - 3 units of ${LISTED} (the minimum exactly): the Promotion list contains QA-Disc-<timestamp>`, expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 7 Promotion list at 3 x ${LISTED}`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      // the run's OWN program only - DiscountProgramEditorPageMig refuses any other name
      await editor.deleteProgramOnKanban(programName);
      forgetEditorRow(programName);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
