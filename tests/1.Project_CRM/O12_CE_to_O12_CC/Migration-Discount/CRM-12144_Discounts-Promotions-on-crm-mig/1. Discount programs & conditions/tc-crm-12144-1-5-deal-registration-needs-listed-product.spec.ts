import { test } from '@playwright/test';
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
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  rpcMig,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.5 - Offer Deal registration only when a product from its list is on the order   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.5
 * Jira             : CRM-12277 (master "Migration - Discount" row 22)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-11-03 - spec v7 re-sync (CRM-13848 A2, Aiva 2026-11-03): IS-CRM-FUNC-0074-03 adds "A product
 *                    qualifies only while it is offered for sale" - Pre-condition 1 (Program editor login) and steps 6-7
 *                    added: Deal registration's Products row is read in the Program editor and each listed product's
 *                    "Can be Sold" is looked up on crm-mig (tester 2026-11-03: check it by reading the Program editor)
 * Baseline         : Discount_1.5 (Jira CRM-13768; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-5-deal-registration-needs-listed-product.spec.ts) - assertions ported unchanged; steps 6-7 exist only on
 *                    crm-mig (the Program editor is crm-mig's)
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0074-03
 * Source version   : Jira CRM-12277 / master row 22 as re-synced to spec v7 on 2026-11-03 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) + Program editor (https://discount-crm-mig.nakivo.site, step 6)
 * Run as           : CRM side = Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig);
 *                    Program editor = users.admin_discount_mig (QA's named account, CRM-12467 row 1.7) - READ ONLY
 * Expected RED on rule v55 (not weakened): step 7 - Aiva on CRM-13848 (2026-11-03): "Rule version 55 still lists
 *                    A5044B and A5045B (Can be Sold = No) on Deal registration".
 *
 * Summary
 * -------
 * A Support Services line alone (A2165B x 10, Total above 1,400.00) leaves Deal registration out of the Promotion list;
 * adding the listed product A2144B x 5 brings it in; every product Deal registration lists must be Can be Sold on crm-mig.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.5, master "Migration - Discount" row 22, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Offer Deal registration only when a product from its list is on the order (IS-CRM-FUNC-0074-03)
 *  Priority: P2 | Spec Areas: 0074-03 - listed product needed
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *      Create a new company in Contacts with:
 *        _ Name = Disc-Cust-<timestamp>
 *        _ Type = end customer (no Reseller, no Distributor)
 *        _ Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with:
 *        _ Name = Disc-Opp-<timestamp>
 *        _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2165B (a Support Services product) with Ordered Qty 10
 *    3. Open the Promotion list
 *    4. Add A2144B with Ordered Qty 5
 *    5. Open the Promotion list
 *    6. In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active),
 *       open the card of the Deal registration program (PROG1) and read every product code of the "Products" row under
 *       "When it applies" (click "+N" to unfold the list)
 *    7. On crm-mig, open Sales > Products and look up each code read in step 6: is "Can be Sold" ticked?
 *
 *  Expected Results:
 *    3. The list does not contain Deal registration, although the Total is above 1,400.00
 *    5. The list contains "Deal registration promotion, 10% on Product, Support Services do not qualify"
 *    6. The Products row reads "Products > Default Code is any of" followed by the qualifying product codes (all of them
 *       after "+N")
 *    7. Every product listed in step 6 has "Can be Sold" ticked on crm-mig: a product that is not offered for sale must
 *       not qualify for Deal registration (IS-CRM-FUNC-0074-03)
 *
 *  Port notes: crm-mig host and users.sale_ic_thomas_crm_mig; company (pricelist Public Pricelist_USD) and opportunity
 *  through the Mig helpers (LIST view); DealElementPageMig reads Order Lines by authored caption; printVerifyAndAssertMig;
 *  teardown + afterAll sweep by run. No baseline assertion or expected value changed.
 *  Step 7 is [INTERNAL check, Call API]: 213 products are looked up over JSON-RPC (product.product, default_code in the
 *  step-6 codes, fields sale_ok / active / name, archived included) instead of one Sales > Products search per code; its
 *  evidence is stdout. A code with no product on crm-mig, and an archived product, are printed, not scored.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team)',
  pre2: 'Pre-condition 2: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre3: 'Pre-condition 3: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre4: 'Pre-condition 4: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2165B (a Support Services product) with Ordered Qty 10',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Add A2144B with Ordered Qty 5',
  s5: 'Step 5: Open the Promotion list',
  s6: 'Step 6: In the Program editor, open Discount Programs (Kanban view) of the active version (top bar: Version N / active), open the card of the Deal registration program (PROG1) and read every product code of the "Products" row under "When it applies" (click "+N" to unfold the list) [read only]',
  s7: 'Step 7: [INTERNAL check, Call API] On crm-mig, open Sales > Products and look up each code read in step 6: is "Can be Sold" ticked? [one JSON-RPC read of product.product for all the codes, field sale_ok]',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const EDITOR_ACCOUNT = users.admin_discount_mig; // QA's named Program editor account (CRM-12467 row 1.7) - read only here
/** The program the TC names in step 6 (Deal registration), opened by its promo code from the Kanban (read 2026-11-03, v55). */
const PROGRAM = { code: 'PROG1', name: DISCOUNT_MIG.dealRegistration };
/** The page's arrows / chevrons as ASCII, for stdout and the evidence banner. */
const ascii = (v: string): string => v.replace(/\u2192/g, '->').replace(/\u203a/g, '>');
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Offer Deal registration only when a product from its list is on the order (crm-mig)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    runs.push(run);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Offer Deal registration only when a product from its list is on the order`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const editor = new DiscountProgramEditorPageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const checks: Check[] = [];
    let listedCodes: string[] = []; // step 6 -> step 7

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${EDITOR_ACCOUNT.username} (QA's named account, CRM-12467 row 1.7) - read only`);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on the Program editor');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - signed in on crm-mig as the salesperson');
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
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.supportProduct, 10);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '4,450.00');
      console.log(`  - A2165B line Subtotal : ${subtotal}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the order Total is above 1,400.00', expected: '> 1,400.00', actual: total, passed: money(total) > 1400 },
        {
          what: 'Step 3 - the Promotion list does not contain Deal registration',
          expected: `not listed: ${DISCOUNT_MIG.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 3 Promotion list with A2165B only`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - A2165B x 10, no Deal registration offered');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      const rows = await dealElementPage.getAllOrderLineRows();
      for (const r of rows) console.log(`  - line: ${(r['Product'] ?? '').slice(0, 40)} | qty ${r['Ordered Qty']} | ${r['Subtotal']}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 5 - the Promotion list contains Deal registration',
          expected: DISCOUNT_MIG.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 5 Promotion list with A2144B added`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 4-5 - A2144B added, Deal registration offered');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await editor.openProgramsKanban();
      const version = await editor.getActiveVersionNumber();
      console.log(`  - Screen         : Discount Programs (Kanban view), Version ${Number.isFinite(version) ? version : '(not shown)'} / active`);
      const opened = await editor.openProgramByCode(PROGRAM.code);
      console.log(`  - Card opened    : ${PROGRAM.code} -> "${opened}"`);
      await recordChecks(page, testInfo, checks, [
        { what: `Step 6 - (guard) the card ${PROGRAM.code} opened the Deal registration program page`, expected: `program title "${PROGRAM.name}"`, actual: opened ? `"${opened}"` : '(no title)', passed: opened === PROGRAM.name },
      ], `${TC} - Step 6 program page of ${PROGRAM.code}`, [DiscountProgramEditorPageMig.PROGRAM_TITLE]);
      const conditions = await editor.readProgramConditions();
      const productsRow = conditions.rows.find((r) => r.label === 'Products');
      listedCodes = productsRow ? await editor.getProgramRowCodes(DiscountProgramEditorPageMig.conditionRowSelector('Products')) : [];
      const shown = ascii(productsRow?.value ?? '');
      console.log(`  - Products row   : ${shown || '(no Products row)'}`);
      console.log(`  - Codes read     : ${listedCodes.length} (after "+N")`);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 6 - the Products row lists the qualifying product codes of Deal registration',
          expected: '"Products > Default Code is any of" followed by the product codes (at least 1, all read after "+N")',
          actual: productsRow ? `"${shown.slice(0, 60)}..." - ${listedCodes.length} codes` : `(no Products row among: ${conditions.rows.map((r) => r.label).join(', ')})`,
          passed: !!productsRow && /^Products > Default Code is any of\b/.test(shown) && listedCodes.length > 0,
        },
      ], `${TC} - Step 6 Deal registration Products row`, [productsRow ? DiscountProgramEditorPageMig.conditionRowSelector('Products') : DiscountProgramEditorPageMig.PROGRAM_CONDITIONS_HEADING]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Deal registration Products row read in the Program editor');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!); // back on crm-mig: the JSON-RPC read runs on its origin, as the salesperson
      const products: Array<{ default_code: string; name: string; sale_ok: boolean; active: boolean }> = listedCodes.length
        ? await rpcMig(page, 'product.product', 'search_read', [[['default_code', 'in', listedCodes]]], { fields: ['default_code', 'name', 'sale_ok', 'active'], context: { active_test: false } })
        : [];
      const notForSale = products.filter((x) => !x.sale_ok);
      const archived = products.filter((x) => !x.active);
      const missing = listedCodes.filter((c) => !products.some((x) => x.default_code === c));
      console.log(`  - Query          : product.product search_read, default_code in the ${listedCodes.length} codes of step 6, archived included`);
      console.log(`  - Products found : ${products.length}`);
      console.log(`  - Can be Sold    : ${products.length - notForSale.length} ticked, ${notForSale.length} not ticked`);
      notForSale.forEach((x) => console.log(`      not for sale : ${x.default_code} "${x.name}"${x.active ? '' : ' (archived)'}`));
      console.log(`  Observation (not scored) - archived products among them: ${archived.map((x) => x.default_code).join(', ') || '(none)'}`);
      console.log(`  Observation (not scored) - listed codes with no product on crm-mig: ${missing.join(', ') || '(none)'}`);
      checks.push({
        what: 'Step 7 - every product the Products condition lists is offered for sale ("Can be Sold" ticked on crm-mig)',
        expected: `0 of the ${listedCodes.length} listed products with Can be Sold = No (one listed is a FAIL - it would qualify for Deal registration although it is not offered for sale; spec v7 IS-CRM-FUNC-0074-03)`,
        actual: notForSale.length ? `${notForSale.length} with Can be Sold = No: ${notForSale.map((x) => `${x.default_code} "${x.name}"`).join(', ')}` : `0 of ${products.length} found`,
        passed: listedCodes.length > 0 && products.length > 0 && notForSale.length === 0,
      });
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
