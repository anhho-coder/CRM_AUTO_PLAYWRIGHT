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
 *  CRM-12144_1.4 - Offer a program limited to one customer on orders of two customers   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.4
 * Jira             : CRM-12280 (master "Migration - Discount" row 21)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-10-27 - program-editor steps reworded to the Kanban path (New program > Save; card >
 *                    Delete), master row 21 updated the same day - the CRM-12144_5.3 standard (tester 2026-10-27)
 *                    2026-11-03 - spec v7 re-sync (CRM-13848 / CRM-13850, Aiva 2026-11-03): IS-CRM-FUNC-0074-02 now says the
 *                    customer is set with the Program editor's "Advanced" condition - the master's Advanced line names the
 *                    rule (Payer > Name is ...); UN-SKIPPED (tester 2026-11-03) under the 2026-10-27 rule "QA may create a
 *                    test Discount program (then teardown); never edit an existing program"
 * Baseline         : Discount_1.4 (Jira CRM-13767; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-4-one-customer-program-two-customers.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0074-02
 * Source version   : Jira CRM-12280 / master row 21 as re-synced to spec v7 on 2026-11-03 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Program-editor writes: the run creates ONE program of its own, QA-Disc-<timestamp> (Pre-condition 5), and deletes it
 *   at Step 5 - or in afterEach / afterAll when the run stops earlier (deny-list: only the name this run created).
 *   Rule (tester 2026-10-27): QA may create a test Discount program and must delete it; an existing program is never
 *   edited (DiscountProgramEditorPageMig refuses any name that does not start with QA-Disc-). Each Save / Delete
 *   publishes a new rule version (versions are permanent history).
 *
 * Summary
 * -------
 * A 5 % order program QA-Disc-<timestamp>, limited to customer A, is offered on customer A's Deal Element and not
 * on customer B's.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.4, master "Migration - Discount" row 21) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Offer a program limited to one customer on orders of two customers (IS-CRM-FUNC-0074-02)
 *  Priority: P3 | Spec Areas: 0074-02 - one customer only
 *
 *  Pre-running conditions:
 *  * Pre-conditions:
 *  Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-CustA-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  Create a new company in Contacts with:
 *  _ Name = Disc-CustB-<timestamp>
 *  _ Type = end customer (no Reseller, no Distributor)
 *  _ Pricelist = Public Pricelist (USD)
 *  In the Program editor, open Discount Programs (Kanban view), click New program and enter:
 *  _ Promo code = QA-<timestamp>
 *  _ Program name = QA-Disc-<timestamp>
 *  _ Reward = 5.0 %
 *  _ Applies to = Whole order
 *  _ For = (empty - the For field shows only for Specific products)
 *  _ Advanced (customer condition, IS-CRM-FUNC-0074-02) = Add a rule: Payer > Name is Disc-CustA-<timestamp> (the Program editor calls the order's customer "Payer")
 *  Click Save and confirm the new version is the active one (top bar: Version N / active)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-OppA-<timestamp>
 *  _ Customer = Disc-CustA-<timestamp>
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-OppB-<timestamp>
 *  _ Customer = Disc-CustB-<timestamp>
 *
 *  Executed Steps:
 *  1. Open Disc-OppA-<timestamp> and click DEAL ELEMENT; add A2160B with Ordered Qty 1
 *  2. Open the Promotion list
 *  3. Open Disc-OppB-<timestamp> and click DEAL ELEMENT; add A2160B with Ordered Qty 1
 *  4. Open the Promotion list
 *  5. Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion
 *
 *  Expected Results:
 *  2. The list contains QA-Disc-<timestamp>
 *  4. The list does not contain QA-Disc-<timestamp>
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the crm-mig login is moved ahead of the companies
 *  (a company needs a session; the master listed the login after the row until 2026-10-30). Company names: the helper names each run's
 *  company Disc-Cust-<timestamp> (runA and runB have distinct timestamps); the master's Disc-CustA / Disc-CustB names
 *  are kept in STEP only (the baseline did not reproduce them either). The program's customer = run A's company.
 *  Two DiscountRun objects are torn down in afterEach and swept in afterAll. The program is entered with the program
 *  form's labels; "Customer condition (Advanced)" goes to the form's "Advanced".
 * ================================================================================================
 */

const TC = 'CRM-12144_1.4';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-CustA-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: On crm-mig, create a new company in Contacts with: Name = Disc-CustB-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre5: 'Pre-condition 5: In the Program editor, open Discount Programs (Kanban view), click New program and enter: Promo code = QA-<timestamp>, Program name = QA-Disc-<timestamp>, Reward = 5.0 %, Applies to = Whole order, For = (empty - the For field shows only for Specific products), Advanced (customer condition, IS-CRM-FUNC-0074-02) = Add a rule: Payer > Name is Disc-CustA-<timestamp> (the Program editor calls the order\'s customer "Payer"); Click Save and confirm the new version is the active one (top bar: Version N / active)',
  pre6: 'Pre-condition 6: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-OppA-<timestamp>, Customer = Disc-CustA-<timestamp>',
  pre7: 'Pre-condition 7: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-OppB-<timestamp>, Customer = Disc-CustB-<timestamp>',
  s1: 'Step 1: Open Disc-OppA-<timestamp> and click DEAL ELEMENT; add A2160B with Ordered Qty 1 [if Payment Terms is empty, Payment Terms = Immediate Payment is set first]',
  s2: 'Step 2: Open the Promotion list',
  s3: 'Step 3: Open Disc-OppB-<timestamp> and click DEAL ELEMENT; add A2160B with Ordered Qty 1',
  s4: 'Step 4: Open the Promotion list',
  s5: 'Step 5: Clean-up: in the Program editor, open the card QA-Disc-<timestamp> on Discount Programs (Kanban view), click Delete and confirm the deletion',
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

test.describe(`${TC} - Offer a program limited to one customer on orders of two customers (crm-mig)`, () => {
  let run: DiscountRun; // customer A (the program's customer)

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

  test(`${TC}: Offer a program limited to one customer on orders of two customers`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const runB = newDiscountRun(); // customer B - a second end customer, its own run
    runs.push(runB);
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company A created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createEndCustomerCompanyMig(page, runB, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - company B created');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      // the run's OWN program (QA-Disc-<timestamp>); For stays empty - the form shows it only for Specific products
      const { versionBefore, versionAfter } = await editor.createProgramOnKanban({
        'Program name': programName,
        Reward: '5.0',
        'Applies to': 'Whole order',
        'Promo code': promoCode,
        Advanced: `customer name is ${run.company}`,
      });
      editorRows.push(programName);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 5 - the new version is the active one (top bar: Version N / active)', expected: `Version ${versionBefore + 1} / active`, actual: Number.isFinite(versionAfter) ? `Version ${versionAfter} / active` : '(not shown)', passed: versionAfter === versionBefore + 1 },
      ], `${TC} - Pre-condition 5 new version active`, [DiscountProgramEditorPageMig.VERSION_CHIP]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - program saved as a new version');
    });

    await test.step(STEP.pre6, async () => {
      console.log(`\n--- ${STEP.pre6} ---`);
      await openCrmMigWebClient(page); // the program was saved on the Program editor - back on crm-mig first
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 6 - opportunity A created');
    });

    await test.step(STEP.pre7, async () => {
      console.log(`\n--- ${STEP.pre7} ---`);
      await createOpportunityForCompanyMig(page, runB, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 7 - opportunity B created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!); // the editor steps left the page on the Program editor
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - customer A order: the Promotion list contains QA-Disc-<timestamp>', expected: programName, actual: options.join(' | ') || '(empty)', passed: options.includes(programName) },
      ], `${TC} - Step 2 Promotion list for customer A`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(runB.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - customer B order: the Promotion list does not contain QA-Disc-<timestamp>', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 4 Promotion list for customer B`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
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
