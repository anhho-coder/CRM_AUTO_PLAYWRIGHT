import { test, Page } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
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
 *  CRM-12144_1.1 - Create and name a new Discount Program with a condition and a percentage in the Program editor   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 18, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.1 (Jira CRM-13764; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-1-create-program-with-condition-and-percent.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0073
 * Source version   : master row CRM-12144_1.1 as read 2026-10-21 - re-check before trusting this spec
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
 *     - Step 1 : add the row QA-Disc-<timestamp> (Name, Reward percent 5.0, Scope order, customer condition)
 *     - Step 2 : Save as version N (the save is part of Step 1's call; Step 2 reads the saved version back)
 *     - Step 7 : Clean-up - delete the row QA-Disc-<timestamp> and Save as version N
 *   Reason: PROGRAM_EDITOR_MANUAL_REASON = "chỉ run manual - program-table edits in the Program editor are the
 *           development team's: QI p.3 (except TC-13) and p.28 (TC-14 to TC-18 at QA's request); Nathan,
 *           CRM-12467 2026-10-20: QA runs only TC-13 and TC-19"
 *
 * Summary
 * -------
 * A 5 % order program QA-Disc-<timestamp>, limited to the customer Disc-Cust-<timestamp>, is saved as a new
 * Program-editor version. Once picked on the customer's Deal Element it adds one reward line "5.0% discount on
 * total amount" of -1.05 (5 % of A2160B x 1 = 21.00).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.1:" --project=chromium   (always skipped - chỉ run manual)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.1, master "Migration - Discount" row 18) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Create and name a new Discount Program with a condition and a percentage in the Program editor (IS-CRM-FUNC-0073)
 *  Priority: P2 | Spec Areas: 0073 - new program
 *
 *  Pre-running conditions:
 *  * Pre-conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-Cust-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. In the Program editor, add a row with Name = QA-Disc-<timestamp>, Reward percent = 5.0, Scope = order and Customer condition = customer name is Disc-Cust-<timestamp>
 *  2. Click Save as version N
 *  3. In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *  4. On Order Lines, add A2160B with Ordered Qty 1
 *  5. Open the Promotion list (if the program is missing, wait one minute and change the quantity)
 *  6. Pick QA-Disc-<timestamp> and click Save
 *  7. Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N
 *
 *  Expected Results:
 *  2. The new version is the active one; the version list names the account that saved it
 *  5. The Promotion list contains QA-Disc-<timestamp>
 *  6. Exactly one reward line is added:
 *  _ Description = QA-Disc-<timestamp>
 *  _ Product = "5.0% discount on total amount"
 *  _ Amount = -5% of the lines' total
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; company and opportunity through the Mig helpers;
 *  the Deal Element is re-opened from the opportunity URL after the editor steps (the page sits on the Program editor
 *  in between); teardown = teardownDiscountRunMig in afterEach + sweepDiscountRunsMig in afterAll; the editor row is
 *  keyed on the editor's column titles and "Customer condition" goes to the column "Advanced" (as CRM-12144_3.4 maps
 *  it); the master row gives no Promo code and no Target product codes, so none are passed; the crm-mig login is moved
 *  ahead of the company because a company cannot be created without a session (the master lists the login after it).
 * ================================================================================================
 */

const TC = 'CRM-12144_1.1';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: [MANUAL ONLY - chỉ run manual: Program-editor table edit = development team, QI p.3] In the Program editor, add a row with Name = QA-Disc-<timestamp>, Reward percent = 5.0, Scope = order and Customer condition = customer name is Disc-Cust-<timestamp>',
  s2: 'Step 2: [MANUAL ONLY - chỉ run manual: Program-editor table edit = development team, QI p.3] Click Save as version N',
  s3: 'Step 3: In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s4: 'Step 4: On Order Lines, add A2160B with Ordered Qty 1',
  s5: 'Step 5: Open the Promotion list (if the program is missing, wait one minute and change the quantity)',
  s6: 'Step 6: Pick QA-Disc-<timestamp> and click Save',
  s7: 'Step 7: [MANUAL ONLY - chỉ run manual: Program-editor table edit = development team, QI p.3] Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N',
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

test.describe(`${TC} - Create and name a new Discount Program with a condition and a percentage in the Program editor (crm-mig)`, () => {
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

  test(`${TC}: Create and name a new Discount Program with a condition and a percentage in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const programName = `QA-Disc-${run.ts}`;

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
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // Program-editor write: chỉ run manual - DiscountProgramEditorPageMig refuses it.
      // No Promo code and no Target product codes: the master row gives neither. "Customer condition" -> column "Advanced".
      await editor.addProgramRowAndSaveVersion({
        Name: programName,
        'Reward percent': '5.0',
        Scope: 'order',
        Advanced: `customer name is ${run.company}`,
      });
      editorRows.push(programName);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      // The save is part of addProgramRowAndSaveVersion (Step 1); this step reads back the version it saved.
      const versions = await editor.getVersions();
      const newest = Math.max(...versions.map((v) => v.version));
      const active = versions.find((v) => v.active);
      console.log(`  - Versions : ${versions.map((v) => v.label).join(' | ') || '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the new version is the active one', expected: `Version ${newest} (newest) Active`, actual: active ? `Version ${active.version} Active` : '(none active)', passed: !!active && active.version === newest },
        { what: 'Step 2 - the version list names the account that saved it', expected: EDITOR_ACCOUNT.username, actual: active?.label ?? '(none)', passed: !!active && active.label.includes(EDITOR_ACCOUNT.username) },
      ], `${TC} - Step 2 saved version`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - version list after Save as version');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!); // the editor steps left the page on the Program editor
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      let options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      if (!options.includes(programName)) {
        await dealElementPage.closePromotionList();
        console.log('  - Program not offered yet: waiting one minute, then changing the quantity 1 -> 2 -> 1');
        await page.waitForTimeout(CommonUtils.waitTimes.abnormalWait * 2);
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 2);
        await dealElementPage.changeQtyInRow(DISCOUNT_MIG.noProgramProduct, 1);
        await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
        options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      }
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - the Promotion list contains QA-Disc-<timestamp>', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 5 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.setPromotion(programName);
      await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rows.filter((r) => (r['Description'] ?? '').trim() === programName);
      const line: Record<string, string> = reward[0] ?? {};
      console.log(`  - Lines with Description = ${programName}: ${reward.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - exactly one reward line with Description = QA-Disc-<timestamp>', expected: '1', actual: String(reward.length), passed: reward.length === 1 },
        { what: 'Step 6 - reward line Product', expected: '5.0% discount on total amount', actual: (line['Product'] ?? '(none)').trim(), passed: (line['Product'] ?? '').trim() === '5.0% discount on total amount' },
        { what: 'Step 6 - reward amount = -5% of the lines total (21.00)', expected: '-1.05', actual: line['Unit Price'] ?? '(none)', passed: money(line['Unit Price'] ?? '') === -1.05 },
      ], `${TC} - Step 6 reward line`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-6 - program picked, reward line');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      // Program-editor write: chỉ run manual - refused by DiscountProgramEditorPageMig
      await editor.deleteProgramRowAndSaveVersion(programName);
      forgetEditorRow(programName);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
