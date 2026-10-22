import { Page, test } from '@playwright/test';
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
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.2 - Look for retired and expired programs on a new order and in the Program editor   (crm-mig + Program editor)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.2
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 52, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_5.2 (Jira CRM-13795; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-2-retired-and-expired-programs.spec.ts) - pre-production; its API read of the
 *                    programs is replaced by the Program editor (no sale.coupon.program on crm-mig)
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0086
 * Source version   : master row CRM-12144_5.2 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the Program editor of crm-mig
 *                    (Discount Service, https://discount-crm-mig.nakivo.site)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig);
 *                    Program editor - QA's named account users.admin_discount_mig (CRM-12467 row 1.7)
 *
 * BLOCKED (not scored): Step 1 expected result 1 ("no row exists for a program the audit retired") - the migration
 * audit is not delivered yet (CRM-12467 row 2.3). The Program editor rows are read and printed, not judged against it.
 *
 * Summary
 * -------
 * The Program editor's List view is read for the active version. On a new order of A2144B x 5 on crm-mig, "Trade-in
 * Promotion 5%" must not be listed, and every listed program must end in the future by the Program editor's Valid to
 * and Status (a program with an empty Valid to, or a future one, and not Ended).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.2, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for retired and expired programs on a new order and in the Program editor (IS-CRM-FUNC-0086)
 *  Priority: P3 | Spec Areas: 0086 - expired not offered
 *  Pre-conditions
 *    1. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *    2. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    5. Have the migration audit from the development team
 *  Executed Steps
 *    1. In the Program editor, open the program table of the active version
 *    2. In crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list
 *  Expected Results
 *    1. No row exists for a program the audit retired
 *    2. No retired program is listed, and no program past its validity end date (e.g. "Trade-in Promotion 5%", valid
 *       to 2026-09-30)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts. The Program editor is read on its own tab of the
 *  same browser context (ignoreHTTPSErrors, 1920x1080), so the crm-mig session is not disturbed. The baseline's
 *  JSON-RPC read of rule_date_to has no crm-mig equivalent: "ends in the future" is judged from the Program editor's
 *  Valid to and Status of each program listed on the Promotion list, matched by exact Name. The Program editor is read
 *  only (getListRows); nothing is saved. Teardown deletes the run's records; afterAll sweeps by run marker.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) - QA account users.admin_discount_mig',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: '[NOT AVAILABLE - the migration audit is not delivered yet, CRM-12467 row 2.3] Pre-condition 5: Have the migration audit from the development team',
  s1: 'Step 1: In the Program editor, open the program table of the active version',
  s2: 'Step 2: In crm-mig, open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const EXPIRED_PROGRAM = 'Trade-in Promotion 5%';
const ENDED_STATUS = /ended|expired|retired/i;
const NO_END_DATE = ['', '-', '—']; // empty Valid to cell (the last one is an em dash, written as an escape to keep the file ASCII)
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

/** Unquoted cell text: the decision table keeps the quotes ("specific_products"). */
const unquote = (s: string): string => s.replace(/^\s*"|"\s*$/g, '').trim();

/** The Valid to cell as a timestamp: empty = no end date; unreadable = NaN. */
function validToTime(text: string): number | undefined {
  if (NO_END_DATE.includes(text)) return undefined;
  const direct = Date.parse(text);
  return Number.isNaN(direct) ? Date.parse(text.replace(' ', 'T')) : direct;
}

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Retired and expired programs (crm-mig + Program editor)`, () => {
  let created: DiscountRun[] = [];
  let editorPage: Page | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
    editorPage = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await editorPage?.close().catch(() => {});
    editorPage = undefined;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) {
      const errors: string[] = [];
      for (const run of created) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
      if (errors.length) throw new Error(errors.join(' | '));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Retired and expired programs on a new order and in the Program editor`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();
    let editor: DiscountProgramEditorPageMig | undefined;
    let editorRows: Array<Record<string, string>> = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (Program editor, own tab of the same browser context)`);
      editorPage = await page.context().newPage();
      await editorPage.setViewportSize({ width: 1920, height: 1080 }); // the decision table renders no rows in a small viewport
      editor = new DiscountProgramEditorPageMig(editorPage);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName}) on crm-mig`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistUsd);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - USD company created on crm-mig');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created on crm-mig');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      console.log('  NOT AVAILABLE: the migration audit of the programs is not delivered by the development team yet (CRM-12467 row 2.3).');
      console.log('  Dependent expectation: Step 1 expected result 1 is BLOCKED (not scored).');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 1');
      editorRows = await editor.getListRows();
      console.log(`  - Program rows in the List view of the active version: ${editorRows.length}`);
      for (const r of editorRows) {
        console.log(`    - ${(r['Code'] ?? '').padEnd(12)} | ${(r['Name'] ?? '').padEnd(70)} | Valid to ${r['Valid to'] || '(empty)'} | Status ${r['Status'] || '(empty)'}`);
      }
      console.log('  BLOCKED (not scored) - expected result 1 "No row exists for a program the audit retired": the migration audit is not delivered yet (CRM-12467 row 2.3).');
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 1 - Program editor List view of the active version');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  - Promotion list (${options.length}): ${options.join(' | ') || '(empty)'}`);

      // "ends in the future" judged from the Program editor's Valid to / Status of each listed name (exact Name match)
      const now = Date.now();
      const judged = options.map((name) => {
        const row = editorRows.find((r) => (r['Name'] ?? '').trim() === name.trim());
        if (!row) return { name, valid: false, text: 'no Program editor row with that name' };
        const validText = (row['Valid to'] ?? '').trim();
        const status = (row['Status'] ?? '').trim();
        const t = validToTime(validText);
        const endsInFuture = NO_END_DATE.includes(validText) || (t !== undefined && !Number.isNaN(t) && t >= now);
        const dateNote = validText && t !== undefined && Number.isNaN(t) ? ' (Valid to is not a date)' : '';
        return {
          name,
          valid: endsInFuture && !ENDED_STATUS.test(status),
          text: `Valid to ${validText || '(empty)'}${dateNote} | Status ${status || '(empty)'}`,
        };
      });
      judged.forEach((j) => console.log(`    - ${j.name} : ${j.text}`));

      await recordChecks(page, testInfo, checks, [
        {
          what: `Step 2 - "${EXPIRED_PROGRAM}" is not listed`,
          expected: 'not listed',
          actual: options.includes(EXPIRED_PROGRAM) ? 'listed' : 'not listed',
          passed: !options.includes(EXPIRED_PROGRAM),
        },
        {
          what: 'Step 2 - every listed program ends in the future (Program editor Valid to / Status by exact Name)',
          expected: 'a non-empty Promotion list, every listed program valid',
          actual: !options.length
            ? 'empty Promotion list'
            : judged.filter((j) => !j.valid).map((j) => `${j.name}: ${j.text}`).join(' | ') || `${judged.length} listed, all valid`,
          passed: options.length > 0 && judged.every((j) => j.valid),
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion list open on crm-mig');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('  BLOCKED (not scored): Step 1 expected result 1 - the migration audit is not delivered yet (CRM-12467 row 2.3).');
      printVerifyAndAssertMig(checks);
    });
  });
});
