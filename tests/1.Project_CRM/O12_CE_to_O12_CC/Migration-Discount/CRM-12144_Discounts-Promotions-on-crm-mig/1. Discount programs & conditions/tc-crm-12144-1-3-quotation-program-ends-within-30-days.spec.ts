import { test, Page } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, DiscountProgramEditorPageMig, QuotationPageMig, ScheduledActionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  newQuotationMig,
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
 *  CRM-12144_1.3 - Pick a program that ends within the next 30 days on a quotation   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 20, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.3 (Jira CRM-13766; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-3-quotation-program-ends-within-30-days.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-01, IS-CRM-FUNC-0076
 * Source version   : master row CRM-12144_1.3 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site)
 * Run as           : Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7);
 *                    Step 1 = Administration / Settings user users.admin_crm_mig (Anh Ho);
 *                    CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * BLOCKED - Program-editor writes not authorised yet (QI p.3; tester 2026-10-21: "mark manual, I will confirm with Dev later")
 *   The whole describe block is skipped by test.skip(!PROGRAM_EDITOR_WRITES_CONFIRMED, PROGRAM_EDITOR_MANUAL_REASON) at
 *   describe level, so its beforeEach / afterEach / afterAll hooks do not run either (nothing is logged in to crm-mig).
 *   It runs only after Dev confirms and PROGRAM_EDITOR_WRITES_CONFIRMED is set to true.
 *   Manual steps (labelled [MANUAL ONLY ...] in STEP):
 *     - Pre-condition 4 : add the row QA-Disc-<timestamp> with Valid to = today + 10 at 23:59:59 (UTC), Save as version N
 *     - Step 7          : Clean-up - delete the row QA-Disc-<timestamp> and Save as version N
 *   Not a program-table write (so not labelled MANUAL): Step 1 "Run Manually" of the scheduled action
 *   "NAKIVO Promotion: sync catalogue from Discount Service" on crm-mig - it runs only when the spec is unskipped.
 *   Reason: PROGRAM_EDITOR_MANUAL_REASON = "MANUAL ONLY - QI p.3: program-table edits in the Program editor are the
 *           development team's (except TC-13); QA writes not confirmed by Dev yet (tester decision 2026-10-21)"
 *
 * Summary
 * -------
 * A new quotation takes Validity = today + 30. The program QA-Disc-<timestamp> (Valid to = today + 10, 23:59:59 UTC)
 * moves Validity to that date when it is picked, and clearing Promotion leaves Validity on it. Edits are discarded
 * at the end.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.3:" --project=chromium   (skipped until PROGRAM_EDITOR_WRITES_CONFIRMED is true)
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.3, master "Migration - Discount" row 20) - verbatim, ASCII
 * ------------------------------------------------------------------------------------------------
 *  Title: Pick a program that ends within the next 30 days on a quotation (IS-CRM-FUNC-0074-01, IS-CRM-FUNC-0076)
 *  Priority: P3 | Spec Areas: 0074-01 - Valid to caps Validity
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
 *  _ Valid to = <a day within the next 30 days> 23:59:59 (UTC)
 *  Click Save as version N and confirm the new version is the active one
 *  Login to crm-mig as an Administration / Settings user (e.g. Anh Ho); the development team runs this part when QA has no such user
 *  Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *  Create a new opportunity in CRM > Pipeline with:
 *  _ Name = Disc-Opp-<timestamp>
 *  _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *  1. As the administrator, open Settings > Technical > Scheduled Actions (developer mode), open "NAKIVO Promotion: sync catalogue from Discount Service" and click Run Manually
 *  2. As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *  3. On Order Lines, add A2160B with Ordered Qty 1, click Save, then click New quotation
 *  4. Read the quotation's Validity
 *  5. Pick QA-Disc-<timestamp> in Promotion
 *  6. Clear Promotion
 *  7. Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N
 *
 *  Expected Results:
 *  4. Validity = today + 30 days
 *  5. Validity changes to the date in the Valid to cell
 *  6. Validity stays on the Valid to date
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the admin login is pre-condition 6 (the master
 *  lists it before the salesperson login) and Step 2 signs the salesperson in again, because the admin session replaces
 *  it; "a day within the next 30 days" = today + 10, the baseline's choice; the quotation is created by newQuotationMig
 *  (crm-mig creates it in place, ~45 s later); Step 7 discards the quotation edits before the editor delete (as the
 *  baseline's Step 7 does); the crm-mig login is moved ahead of the company (a company needs a session). Teardown =
 *  teardownDiscountRunMig in afterEach + sweepDiscountRunsMig in afterAll.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.3';
const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7)
const SALES = users.sale_ic_thomas_crm_mig;
const ADMIN = users.admin_crm_mig; // "Anh Ho" - the Administration / Settings user of crm-mig (Step 1)
const SYNC_ACTION = 'NAKIVO Promotion: sync catalogue from Discount Service';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts with: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] Add a row to the program table with: Promo code = QA-<timestamp>, Name = QA-Disc-<timestamp>, Reward percent = 5.0, Scope = order, Target product codes = (empty), Customer condition (Advanced) = customer name is Disc-Cust-<timestamp>, Valid to = <a day within the next 30 days> 23:59:59 (UTC); Click Save as version N and confirm the new version is the active one',
  pre5: 'Pre-condition 5: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields) with: Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre6: 'Pre-condition 6: Login to crm-mig (https://crm-mig.nakivo.site) as an Administration / Settings user (e.g. Anh Ho); the development team runs this part when QA has no such user',
  s1: 'Step 1: As the administrator, open Settings > Technical > Scheduled Actions (developer mode), open "NAKIVO Promotion: sync catalogue from Discount Service" and click Run Manually',
  s2: 'Step 2: As the salesperson, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s3: 'Step 3: On Order Lines, add A2160B with Ordered Qty 1, click Save, then click New quotation',
  s4: "Step 4: Read the quotation's Validity",
  s5: 'Step 5: Pick QA-Disc-<timestamp> in Promotion',
  s6: 'Step 6: Clear Promotion',
  s7: 'Step 7: [MANUAL ONLY - Program editor write not authorised yet, QI p.3 / tester 2026-10-21] Clean-up: in the Program editor, delete the QA-Disc-<timestamp> row and click Save as version N',
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

/** A UTC calendar day `offset` days from today. */
function utcDay(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** Odoo datetime 'YYYY-MM-DD HH:mm:ss' for a UTC day. */
const stamp = (d: Date, hms: string) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${hms}`;
/** MM/DD/YYYY as the Validity field shows it. */
const mdy = (d: Date) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;

test.describe(`${TC} - Pick a program that ends within the next 30 days on a quotation (crm-mig)`, () => {
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

  test(`${TC}: Pick a program that ends within the next 30 days on a quotation`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    const programName = `QA-Disc-${run.ts}`;
    const promoCode = `QA-${run.ts}`;
    const validToDay = utcDay(10); // "a day within the next 30 days" - the baseline's choice: today + 10
    const defaultValidity = utcDay(30);

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
        'Valid to': stamp(validToDay, '23:59:59'),
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
      console.log(`  - Login : ${ADMIN.username} (${ADMIN.displayName}) - Administration / Settings user`);
      await signInMig(page, ADMIN);
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const scheduled = new ScheduledActionPageMig(page);
      const opened = await scheduled.openScheduledAction(SYNC_ACTION);
      if (!opened) throw new Error(`Scheduled action "${SYNC_ACTION}" did not open on crm-mig - the catalogue sync cannot be run`);
      const ran = await scheduled.clickRunManually();
      if (!ran) throw new Error(`Scheduled action "${SYNC_ACTION}": RUN MANUALLY was not available on crm-mig`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - sync catalogue from Discount Service run manually');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await signInMig(page, SALES); // Step 1 ran as the administrator; the salesperson signs in again
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run); // crm-mig creates the quotation in place (~45 s later)
      await quotationPage.dismissErrorDialogWithRetry();
      console.log(`  - Quotation id : ${qId}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - new quotation');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const validity = await quotationPage.getFieldDisplayValue('validity_date');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - quotation Validity = today + 30 days', expected: mdy(defaultValidity), actual: validity || '(empty)', passed: validity.trim() === mdy(defaultValidity) },
      ], `${TC} - Step 4 Validity on the new quotation`, [DISCOUNT_HIGHLIGHT.totals]);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await quotationPage.clickEdit();
      await dealElementPage.setPromotion(programName);
      const validity = await dealElementPage.getValidityValue();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Validity = the Valid to date of the program', expected: mdy(validToDay), actual: validity || '(empty)', passed: validity.trim() === mdy(validToDay) },
      ], `${TC} - Step 5 Validity after picking the program`, [DISCOUNT_HIGHLIGHT.promotionField]);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.clearPromotion();
      const validity = await dealElementPage.getValidityValue();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - Validity stays on the Valid to date', expected: mdy(validToDay), actual: validity || '(empty)', passed: validity.trim() === mdy(validToDay) },
      ], `${TC} - Step 6 Validity after clearing Promotion`, [DISCOUNT_HIGHLIGHT.promotionField]);
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await quotationPage.discardChanges().catch(() => {}); // the quotation's edits first (as the baseline's Step 7)
      console.log('  - Quotation edits discarded; the run records are removed by the teardown');
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
