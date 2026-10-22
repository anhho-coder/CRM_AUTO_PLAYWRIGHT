import { test, Page } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
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
  PROGRAM_EDITOR_WRITES_CONFIRMED,
  PROGRAM_EDITOR_MANUAL_REASON,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.13 - Switch a program off by saving a version without its row   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.13
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 30, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.13 (Jira CRM-13776; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-13-archived-program-leaves-saved-deal-element.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0076
 * Source version   : master row CRM-12144_1.13 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * BLOCKED - Program-editor writes not authorised yet (QI p.3; tester 2026-10-21: "mark manual, I will confirm with Dev later")
 *   The whole describe block is skipped by test.skip(!PROGRAM_EDITOR_WRITES_CONFIRMED, PROGRAM_EDITOR_MANUAL_REASON) at
 *   describe level, so its beforeEach / afterEach / afterAll hooks do not run either (nothing is logged in to crm-mig).
 *   It runs only after Dev confirms and PROGRAM_EDITOR_WRITES_CONFIRMED is set to true.
 *   Manual steps (labelled [MANUAL ONLY ...] in STEP):
 *     - Pre-condition 4 : add the row QA-Disc-<timestamp> (customer = Disc-Cust) and Save as version N
 *     - Step 1          : delete the row QA-Disc-<timestamp> and Save as version N (this is the switch-off)
 *   Reason: PROGRAM_EDITOR_MANUAL_REASON = "MANUAL ONLY - QI p.3: program-table edits in the Program editor are the
 *           development team's (except TC-13); QA writes not confirmed by Dev yet (tester decision 2026-10-21)"
 *
 * Summary
 * -------
 * A program is switched off by saving a new version without its row. Afterwards a new Deal Element of the same
 * customer (Disc-Opp2) does not offer it, and Deal Element #1 (saved with the program in pre-condition 7) keeps its
 * Promotion and its reward line unchanged.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.13:" --project=chromium   (skipped until PROGRAM_EDITOR_WRITES_CONFIRMED is true)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.13, master "Migration - Discount" row 30) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Switch a program off by saving a version without its row (IS-CRM-FUNC-0076)
 *  Priority: P2 | Spec Areas: 0076 - program switched off
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
 *  Click Save as version N and confirm the new version is the active one
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp2-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *  Open Disc-Opp-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save (Deal Element #1)
 *
 *  Executed Steps:
 *  1. In the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N
 *  2. Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1 and open the Promotion list
 *  3. Open Deal Element #1
 *
 *  Expected Results:
 *  2. The list does not contain QA-Disc-<timestamp>
 *  3. Promotion and the reward line are still there, unchanged
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the master has no Clean-up step, so none is
 *  labelled - the afterEach teardown removes the CRM records (Deal Element #1 is one of the run's sale orders). The
 *  baseline archived the program over JSON-RPC; here Step 1 deletes the editor row. Deal Element #1 is re-opened by its
 *  id on crm-mig (hash URL on baseUrl_mig). The crm-mig login is moved ahead of the company (a company needs a session).
 *  The editor row is keyed on the editor's column titles ("Customer condition (Advanced)" -> "Advanced").
 * ================================================================================================
 */

const TC = 'CRM-12144_1.13';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] Add a row to the program table with: Promo code = QA-<timestamp>, Name = QA-Disc-<timestamp>, Reward percent = 5.0, Scope = order, Target product codes = (empty), Customer condition (Advanced) = customer name is Disc-Cust-<timestamp>; Click Save as version N and confirm the new version is the active one',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre6: 'Pre-condition 6: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp2-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre7: 'Pre-condition 7: Open Disc-Opp-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1, pick QA-Disc-<timestamp> and click Save (Deal Element #1)',
  s1: 'Step 1: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] In the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N',
  s2: 'Step 2: Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, add A2160B with Ordered Qty 1 and open the Promotion list',
  s3: 'Step 3: Open Deal Element #1',
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

test.describe(`${TC} - Switch a program off by saving a version without its row (crm-mig)`, () => {
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

  test(`${TC}: Switch a program off by saving a version without its row`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const programName = `QA-Disc-${run.ts}`;
    const promoCode = `QA-${run.ts}`;
    const opp2Name = `Disc-Opp2-${run.ts}`;
    let opp2Url = '';
    let de1Id: number | undefined;
    let de1Promotion = '';
    let de1Reward: Record<string, string> = {};

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

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      opp2Url = await createOpportunityForCompanyMig(page, run, SALES, { name: opp2Name });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - second opportunity created');
    });

    await test.step(STEP.pre7, async () => {
      console.log(`\n--- ${STEP.pre7} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!); // the editor steps left the page on the Program editor
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      await dealElementPage.setPromotion(programName);
      de1Id = await saveDealElement(page, run);
      if (!de1Id) throw new Error(`Deal Element #1 was not saved on crm-mig - no record id in ${page.url()}`);
      const rows = await dealElementPage.getAllOrderLineRows();
      de1Promotion = await dealElementPage.getAppliedPromotionName();
      de1Reward = rows.find((r) => (r['Description'] ?? '').trim() === programName) ?? {};
      console.log(`  - Deal Element #1 id ${de1Id} | Promotion "${de1Promotion}" | reward line Unit Price ${de1Reward['Unit Price'] ?? '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 7 - Deal Element #1 saved with the program');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      // Program-editor write: refused until PROGRAM_EDITOR_WRITES_CONFIRMED is true
      await editor.deleteProgramRowAndSaveVersion(programName);
      forgetEditorRow(programName);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.openByUrlReloaded(opp2Url);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Promotion list does not contain QA-Disc-<timestamp>', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 2 Promotion list of Disc-Opp2`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(`${baseUrl_mig.replace(/\/$/, '')}/web#id=${de1Id}&model=sale.order&view_type=form`);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward: Record<string, string> = rows.find((r) => (r['Description'] ?? '').trim() === programName) ?? {};
      console.log(`  - Deal Element #1 (${de1Id}) now: Promotion "${promotion}" | reward Unit Price ${reward['Unit Price'] ?? '(none)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Deal Element #1 Promotion is still the program', expected: programName, actual: promotion || '(empty)', passed: promotion === programName && promotion === de1Promotion },
        { what: 'Step 3 - Deal Element #1 reward line is still there, unchanged', expected: `${de1Reward['Unit Price'] ?? '(none)'} on ${programName}`, actual: reward['Unit Price'] ?? '(none)', passed: !!reward['Unit Price'] && money(reward['Unit Price']) === money(de1Reward['Unit Price'] ?? '') },
      ], `${TC} - Step 3 Deal Element #1`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Deal Element #1 after the program was switched off');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
