import { Page, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, DiscountProgramEditorPageMig, QuotationPageMig } from '@pages/mig';
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
  saveDealElement,
  newQuotationMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_5.5 - Look for coupon codes and non-percentage rewards   (crm-mig + Program editor)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.5
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 55, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_5.5 (Jira CRM-13796; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-5-coupon-codes-and-non-percentage-rewards.spec.ts) - pre-production; its
 *                    sale.coupon.program counts have no crm-mig equivalent and are replaced by the decision table
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0089
 * Source version   : master row CRM-12144_5.5 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the Program editor of crm-mig
 *                    (Discount Service, https://discount-crm-mig.nakivo.site)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig);
 *                    Program editor - QA's named account users.admin_discount_mig (CRM-12467 row 1.7)
 *
 * Summary
 * -------
 * The quotation created from a saved Deal Element of A2144B x 5 has no code box, no coupon or promo-code button. In the
 * Program editor's decision table every row's Reward percent is a number, every Scope is order or specific_products,
 * and the result columns are exactly Promo code, Name, Reward percent, Scope and Target product codes.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.5, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for coupon codes and non-percentage rewards (IS-CRM-FUNC-0089)
 *  Priority: P3 | Spec Areas: 0089 - no coupons
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account
 *       (held by the development team)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment,
 *       add A2144B with Ordered Qty 5, click Save, then New quotation
 *    2. In the Program editor, open the program table and read the Reward percent and Scope cells
 *  Expected Results
 *    1. The quotation has no Promotion Code field and no other box to enter a code
 *    2. Rewards are percentages only; Scope accepts only order or specific_products (no free product, fixed amount or
 *       next-order reward)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; the quotation is opened by newQuotationMig (crm-mig
 *  creates it in place, ~45 s later). The Program editor is read on its own tab of the same browser context
 *  (ignoreHTTPSErrors, 1920x1080). Step 2 is the decision table of the active version (readActiveDecisionTable): the
 *  program count is printed and not asserted; the baseline's old-program count (16) and its JSON-RPC reads have no
 *  crm-mig equivalent. A table with zero rows fails the step (no vacuous pass). Teardown deletes the run's records;
 *  afterAll sweeps by run marker.
 * ================================================================================================
 */

const TC = 'CRM-12144_5.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre2: 'Pre-condition 2: Login to the Program editor (https://discount-crm-mig.nakivo.site) with a named Program editor account (held by the development team) - QA account users.admin_discount_mig',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_USD',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5, click Save, then New quotation',
  s2: 'Step 2: In the Program editor, open the program table and read the Reward percent and Scope cells',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITOR_ACCOUNT = users.admin_discount_mig;
const SALES = users.sale_ic_thomas_crm_mig;
const RESULT_COLUMNS = ['Promo code', 'Name', 'Reward percent', 'Scope', 'Target product codes'];
const SCOPES = ['order', 'specific_products'];
const PERCENT = /^-?\d+(\.\d+)?$/;
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

/** Unquoted cell text: the decision table keeps the quotes ("specific_products"). */
const unquote = (s: string): string => s.replace(/^\s*"|"\s*$/g, '').trim();

test.use({ ignoreHTTPSErrors: true, actionTimeout: MIG_ACTION_TIMEOUT }); // the Discount Service certificate chain is self-signed

test.describe(`${TC} - Coupon codes and non-percentage rewards (crm-mig + Program editor)`, () => {
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

  test(`${TC}: Coupon codes and non-percentage rewards`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();
    let editor: DiscountProgramEditorPageMig | undefined;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${EDITOR_ACCOUNT.username} (Program editor, own tab of the same browser context)`);
      editorPage = await page.context().newPage();
      await editorPage.setViewportSize({ width: 1920, height: 1080 }); // the decision table renders no rows in a small viewport
      editor = new DiscountProgramEditorPageMig(editorPage);
      await editor.signIn(EDITOR_ACCOUNT);
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Pre-condition 2 - signed in on the Program editor');
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

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run);
      console.log(`  - Quotation id : ${qId}`);

      const labels = await quotationPage.getVisibleFieldLabels();
      const buttons = await quotationPage.getStatusbarButtonMap();
      const codeLabels = labels.filter((l) => /code|coupon/i.test(l));
      const couponButtons = buttons.filter((b) => /coupon|promo/i.test(b.label));
      // the "Promotion" field (promotion_id) is a program picker, not a code box: only a promo CODE label counts
      const promoVisible = labels.some((l) => /promo\s*code|promo_code|coupon/i.test(l));
      console.log(`  - Visible field labels : ${labels.join(' | ')}`);
      console.log(`  - Header buttons       : ${buttons.map((b) => b.label).join(' | ')}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - no visible field labelled Code / Coupon on the quotation', expected: '(none)', actual: codeLabels.join(' | ') || '(none)', passed: codeLabels.length === 0 },
        { what: 'Step 1 - promo_code field is not visible on the quotation', expected: 'not visible', actual: promoVisible ? 'a Promotion-related label is visible' : 'not visible', passed: !promoVisible },
        { what: 'Step 1 - no header button mentions coupon or promo code', expected: '(none)', actual: couponButtons.map((b) => b.label).join(' | ') || '(none)', passed: couponButtons.length === 0 },
      ], `${TC} - Step 1 quotation has no code box`, [DISCOUNT_HIGHLIGHT.promotionField]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - quotation without a code box');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      if (!editor || !editorPage) throw new Error('The Program editor was not opened at Pre-condition 2');
      const table = await editor.readActiveDecisionTable();
      const rows = table.rows;
      console.log(`  - Result columns (Outputs)   : ${JSON.stringify(table.outputs)}`);
      console.log(`  - Condition columns (Inputs) : ${JSON.stringify(table.inputs)}`);
      console.log(`  - Program rows (printed, not asserted) : ${rows.length}`);
      for (const r of rows) {
        console.log(`    - ${unquote(r['Promo code'] ?? '').padEnd(14)} | ${unquote(r['Name'] ?? '').padEnd(60)} | Reward percent ${unquote(r['Reward percent'] ?? '')} | Scope ${unquote(r['Scope'] ?? '')} | ${unquote(r['Target product codes'] ?? '')}`);
      }
      const badPercent = rows.filter((r) => !PERCENT.test(unquote(r['Reward percent'] ?? '')));
      const badScope = rows.filter((r) => !SCOPES.includes(unquote(r['Scope'] ?? '')));
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 - the result columns are exactly Promo code, Name, Reward percent, Scope, Target product codes',
          expected: RESULT_COLUMNS.join(', '),
          actual: table.outputs.join(', ') || '(none)',
          passed: JSON.stringify(table.outputs) === JSON.stringify(RESULT_COLUMNS),
        },
        {
          what: 'Step 2 - the table has program rows (a count is not asserted)',
          expected: 'at least 1 row',
          actual: `${rows.length} row(s)`,
          passed: rows.length > 0,
        },
        {
          what: 'Step 2 - every row\'s Reward percent is a number',
          expected: 'a number on every row',
          actual: badPercent.length ? badPercent.map((r) => `"${unquote(r['Name'] ?? '')}" = ${unquote(r['Reward percent'] ?? '') || '(empty)'}`).join(' | ') : `${rows.length} of ${rows.length} numbers`,
          passed: rows.length > 0 && badPercent.length === 0,
        },
        {
          what: 'Step 2 - every row\'s Scope is order or specific_products',
          expected: SCOPES.join(' or '),
          actual: badScope.length ? badScope.map((r) => `"${unquote(r['Name'] ?? '')}" = ${unquote(r['Scope'] ?? '') || '(empty)'}`).join(' | ') : `${rows.length} of ${rows.length} in scope`,
          passed: rows.length > 0 && badScope.length === 0,
        },
      ], `${TC} - Step 2 decision table`, [DISCOUNT_HIGHLIGHT.promotionField]);
      await CommonUtils.captureAndAttachScreenshot(editorPage, testInfo, 'Step 2 - Program editor decision table read');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
