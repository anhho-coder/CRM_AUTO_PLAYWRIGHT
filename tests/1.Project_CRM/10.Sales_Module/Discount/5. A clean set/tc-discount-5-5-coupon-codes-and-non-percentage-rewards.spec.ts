import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
  idFromUrl,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_5.5 - Look for coupon codes and non-percentage rewards   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_5.5
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_5.5 (crm-mig manual TC, master "Migration - Discount") - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_5.5 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *                    Program editor reads: CRM administrator over JSON-RPC (users.admin_crm, see ProgramOwner)
 *
 * Summary
 * -------
 * The quotation offers no code box; the active programs are the 16 old ones plus any new ones, counted.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_5\.5:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.5, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Look for coupon codes and non-percentage rewards"
 *  Pre-conditions: Thomas Semerich; Company Disc-Cust (Public Pricelist USD); opportunity (as in 5.1)
 *  Steps
 *    1. Open the opportunity, DEAL ELEMENT (payment terms rule), add A2144B Qty 5, click Save, then New quotation
 *    2. In the Program editor, open the program table and read the Reward percent and Scope cells
 *  Expected
 *    1. The quotation has no Promotion Code field and no other box to enter a code
 *       -> asserted: no visible field label containing "Code" or "Coupon"; no header button whose label mentions
 *          coupon or promo code; promo_code is not visible.
 *    2. Rewards are percentages only; Scope accepts only order or specific_products (no free product, fixed
 *       amount or next-order reward)
 *       -> reference system: [INTERNAL check, Call API] baseline-then-delta count (tester decision 2026-10-21):
 *          the OLD active programs (created before 2026-10-21) = 16, and the total active programs = 16 + the
 *          number of NEW programs (created since). The old set is counted, not judged: 5 PRM-Q220-ENP* programs use
 *          discount_apply_on = specific_product.
 * ================================================================================================
 */

const TC = 'Discount_5.5';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity, click DEAL ELEMENT (if Payment Terms is empty, set Payment Terms = Immediate Payment), add A2144B with Ordered Qty 5, click Save, then New quotation',
  s2: '[INTERNAL check, Call API] Step 2: In the Program editor, open the program table and read the Reward percent and Scope cells',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

/**
 * Baseline of the reference system's OLD active programs (read 2026-10-21, tester decision): the 16 programs created
 * before 2026-10-21 (ids 1-28: Deal registration, PRM-Q319-*, PRM-Q220-*, Trade-in). They are counted, not judged -
 * 5 of them (PRM-Q220-ENP*) use discount_apply_on = specific_product. Anything created later is a NEW program.
 */
const OLD_PROGRAMS = { count: 16, createdBefore: '2026-10-21 00:00:00' } as const;

test.describe(`${TC} - Coupon codes and non-percentage rewards (pre-prod baseline of CRM-12144_5.5)`, () => {
  let run: DiscountRun;
  let owner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await owner?.close();
    owner = undefined;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Coupon codes and non-percentage rewards`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.blurForm();
      await saveDealElement(page, run);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);

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
      console.log('  The reference system has no Program editor screen: its programs are sale.coupon.program records (read over the API as the CRM administrator).');
      owner = await ProgramOwner.open();
      // total first, as its own read: the list below is one capped page, never read as a total
      const total: number = await owner.call('sale.coupon.program', 'search_count', [[['active', '=', true]]]);
      const programs: Array<{ id: number; name: string; create_date: string; reward_type: string; discount_type: string; discount_apply_on: string; promo_applicability: string }> =
        await owner.call('sale.coupon.program', 'search_read', [[['active', '=', true]]], {
          fields: ['name', 'create_date', 'reward_type', 'discount_type', 'discount_apply_on', 'promo_applicability'],
          limit: 100,
          order: 'id',
        });
      console.log(`  - Active programs: ${total} (listed ${programs.length})`);
      for (const p of programs) {
        console.log(`    - [${p.create_date < OLD_PROGRAMS.createdBefore ? 'old' : 'new'}] ${p.name}`);
        console.log(`        reward_type=${p.reward_type} | discount_type=${p.discount_type} | discount_apply_on=${p.discount_apply_on} | promo_applicability=${p.promo_applicability}`);
      }
      const oldOnes = programs.filter((p) => p.create_date < OLD_PROGRAMS.createdBefore);
      const newOnes = programs.filter((p) => p.create_date >= OLD_PROGRAMS.createdBefore);
      const expectedTotal = OLD_PROGRAMS.count + newOnes.length;
      await recordChecks(page, testInfo, checks, [
        {
          what: `Step 2 - old active programs (created before ${OLD_PROGRAMS.createdBefore} UTC) = the baseline count`,
          expected: `${OLD_PROGRAMS.count} old active programs`,
          actual: `${oldOnes.length} old active programs`,
          passed: oldOnes.length === OLD_PROGRAMS.count,
        },
        {
          what: 'Step 2 - total active programs = old baseline + new programs',
          expected: `${expectedTotal} (${OLD_PROGRAMS.count} old + ${newOnes.length} new${newOnes.length ? `: ${newOnes.map((p) => p.name).join(' | ')}` : ''})`,
          actual: `${total} active programs`,
          passed: total === expectedTotal && programs.length === total,
        },
      ], `${TC} - Step 2 program configuration`, []);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
