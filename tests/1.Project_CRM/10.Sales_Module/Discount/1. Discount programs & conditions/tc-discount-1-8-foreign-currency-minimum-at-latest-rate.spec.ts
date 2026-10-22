import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage, CurrencyPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  sameCents,
  newDiscountRun,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.8 - Compare a EUR order with the 1,400 USD minimum converted at the latest rate   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.8
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_1.8 (crm-mig manual TC, master "Migration - Discount" row 25) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13771
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-05
 * Source version   : master row CRM-12144_1.8 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max) - the only group that can edit Unit Price
 *
 * Summary
 * -------
 * For EUR, then GBP and CHF: with R = the currency's Current Rate and T = 1,400.00 x R, an order of exactly T is
 * offered Deal registration, T - 0.01 is not, and T with an Order Date a year back still is (latest rate used).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.8:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.8, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a user in Sales / Editing Manager (only this group can edit Unit Price) - Max Zaprykutenko
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Max Zaprykutenko
 *         - Pricelist   = Public Pricelist_EUR   (the EUR-currency list, picked by exact name)
 *    3. CRM > Pipeline (LIST view) > Create a new opportunity:
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Max Zaprykutenko
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *  Steps
 *    1. Open Accounting > Configuration > Currencies (pre-prod menu: Invoicing > Configuration > Accounting >
 *       Currencies) and note the Current Rate of EUR (R); compute T = 1,400.00 x R, rounded to the cent
 *    2. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       check Pricelist = EUR
 *    3. On Order Lines, add A2144B with Ordered Qty 1 and Unit Price T
 *    4. Open the Promotion list
 *         -> Expected: the list contains Deal registration
 *    5. Change Unit Price to T - 0.01 and open the Promotion list
 *         -> Expected: the list does not contain Deal registration
 *    6. Change Unit Price back to T, move the Order Date at least one year back (Order Date sits on the Deal
 *       Element's "Other Information" tab) and open the Promotion list
 *         -> Expected: the list still contains Deal registration (the latest rate is used, whatever the order date)
 *    7. Pick Deal registration and click Save
 *         -> Expected: Reward = -10% of T, rounded to the cent; Total in Company Currency is shown
 *    8. Repeat steps 1 to 7 with the GBP and the CHF pricelist, each on a new company and opportunity
 *         -> Expected: same results for GBP and CHF
 * ================================================================================================
 */

const TC = 'Discount_1.8';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a user in Sales / Editing Manager (Max Zaprykutenko)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_EUR',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open Accounting > Configuration > Currencies and note the Current Rate of EUR (R); compute T = 1,400.00 x R, rounded to the cent',
  s2: 'Step 2: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; check Pricelist = EUR',
  s3: 'Step 3: On Order Lines, add A2144B with Ordered Qty 1 and Unit Price T',
  s4: 'Step 4: Open the Promotion list',
  s5: 'Step 5: Change Unit Price to T - 0.01 and open the Promotion list',
  s6: 'Step 6: Change Unit Price back to T, move the Order Date at least one year back and open the Promotion list',
  s7: 'Step 7: Pick Deal registration and click Save',
  s8: 'Step 8: Repeat steps 1 to 7 with the GBP and the CHF pricelist, each on a new company and opportunity',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const EDITING_MANAGER = users.manager_max;
const MINIMUM_USD = 1400;

/** Order Date one year and one day back, as this build renders it (MM/DD/YYYY HH:mm:ss). */
function orderDateOneYearBack(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} 10:00:00`;
}

test.describe(`${TC} - Compare a EUR order with the 1,400 USD minimum converted at the latest rate (pre-prod baseline of CRM-12144_1.8)`, () => {
  const runs: DiscountRun[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    runs.length = 0;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) {
      const errors: string[] = [];
      for (const run of runs) await teardownDiscountRun(page, run, testInfo).catch((e: Error) => errors.push(e.message));
      if (errors.length) throw new Error(errors.join(' | '));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Compare a EUR order with the 1,400 USD minimum converted at the latest rate`, async ({ page }, testInfo) => {
    // three currency cycles (company + opportunity + Deal Element each) - three times the single-cycle budget
    test.setTimeout(config.timeouts.test * 3);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const currencyPage = new CurrencyPage(page);
    const checks: Check[] = [];

    /** Steps 1-7 for one currency; `label` maps a STEP label to the one shown for this cycle. */
    const cycle = async (code: string, run: DiscountRun, label: (s: string) => string) => {
      let T = NaN;
      await test.step(label(STEP.s1.replace(/EUR/g, code)), async () => {
        console.log(`\n--- ${label(STEP.s1.replace(/EUR/g, code))} ---`);
        await currencyPage.openCurrenciesList();
        const raw = await currencyPage.getCurrencyRate(code);
        const R = parseFloat(raw);
        T = Math.round(MINIMUM_USD * R * 100) / 100;
        console.log(`  - Current Rate of ${code} (R) : ${raw}`);
        console.log(`  - T = 1,400.00 x R            : ${T.toFixed(2)}`);
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 1 - Current Rate read from the Currencies list`, expected: 'a rate > 0', actual: raw || '(empty)', passed: R > 0 },
        ], `${TC} - ${code} Step 1 currency rate`, ['table.o_list_view']);
        await opportunityPage.openByUrlReloaded(run.urlOpp!);
      });

      await test.step(label(STEP.s2.replace(/EUR/g, code)), async () => {
        console.log(`\n--- ${label(STEP.s2.replace(/EUR/g, code))} ---`);
        await openDealElementFromOpportunity(page);
        const pricelist = await dealElementPage.getPricelistValue();
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 2 - Pricelist is the ${code} list`, expected: `(${code})`, actual: pricelist, passed: pricelist.trim().endsWith(`(${code})`) && !/\(USD\)$/.test(pricelist.trim()) },
        ], `${TC} - ${code} Step 2 pricelist`, ["div[name='pricelist_id']"]);
      });

      await test.step(label(STEP.s3), async () => {
        console.log(`\n--- ${label(STEP.s3)} ---`);
        await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 1);
        await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, T);
        await dealElementPage.blurForm();
        console.log(`  - line Subtotal : ${(await dealElementPage.getOrderLineRowCells(0))['Subtotal']}`);
      });

      await test.step(label(STEP.s4), async () => {
        console.log(`\n--- ${label(STEP.s4)} ---`);
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 4 - at T = ${T.toFixed(2)} the list contains Deal registration`, expected: DISCOUNT_BASELINE.dealRegistration, actual: options.join(' | ') || '(empty list)', passed: options.includes(DISCOUNT_BASELINE.dealRegistration) },
        ], `${TC} - ${code} Step 4 list at T`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s5), async () => {
        console.log(`\n--- ${label(STEP.s5)} ---`);
        await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, Math.round((T - 0.01) * 100) / 100);
        await dealElementPage.blurForm();
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 5 - at T - 0.01 the list does not contain Deal registration`, expected: `not listed: ${DISCOUNT_BASELINE.dealRegistration}`, actual: options.join(' | ') || '(empty list)', passed: !options.includes(DISCOUNT_BASELINE.dealRegistration) },
        ], `${TC} - ${code} Step 5 list at T - 0.01`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s6), async () => {
        console.log(`\n--- ${label(STEP.s6)} ---`);
        await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, T);
        await dealElementPage.blurForm();
        const dateText = orderDateOneYearBack();
        const dateSet = await dealElementPage.setOrderDate(dateText);
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 6 - Order Date moved a year back`, expected: dateText, actual: await dealElementPage.getOrderDate(), passed: dateSet },
          { what: `${code} Step 6 - with the old Order Date the list still contains Deal registration`, expected: DISCOUNT_BASELINE.dealRegistration, actual: options.join(' | ') || '(empty list)', passed: options.includes(DISCOUNT_BASELINE.dealRegistration) },
        ], `${TC} - ${code} Step 6 list with an old Order Date`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, "div[name='date_order']"]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s7), async () => {
        console.log(`\n--- ${label(STEP.s7)} ---`);
        await dealElementPage.setPromotion('Deal registration');
        await saveDealElement(page, run);
        const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
        const expectedReward = -Math.round(T * 10) / 100;
        const companyTotal = await dealElementPage.getVisibleFieldValue('amount_total_company_signed');
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 7 - Reward = -10% of T, rounded to the cent`, expected: expectedReward.toFixed(2), actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && sameCents(money(rewards[0]['Unit Price']), expectedReward) },
          { what: `${code} Step 7 - Total in Company Currency is shown`, expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !Number.isNaN(money(companyTotal)) },
        ], `${TC} - ${code} Step 7 reward`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals, "[name='amount_total_company_signed']"]);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${code} Steps 1-7 - Deal registration at the converted minimum`);
      });
    };

    /** Pre-conditions 2-3 for one currency: a fresh company with that pricelist + its opportunity. */
    const prepare = async (pricelist: string, label: (s: string) => string): Promise<DiscountRun> => {
      const run = newDiscountRun();
      runs.push(run);
      await test.step(label(STEP.pre2.replace('Public Pricelist_EUR', pricelist)), async () => {
        console.log(`\n--- ${label(STEP.pre2.replace('Public Pricelist_EUR', pricelist))} ---`);
        await createEndCustomerCompany(page, run, EDITING_MANAGER, pricelist);
      });
      await test.step(label(STEP.pre3), async () => {
        console.log(`\n--- ${label(STEP.pre3)} ---`);
        await createOpportunityForCompany(page, run, EDITING_MANAGER);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${pricelist} - Pre-conditions done`);
      });
      return run;
    };

    // ================= Pre-conditions (EUR) =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${EDITING_MANAGER.username} (${EDITING_MANAGER.displayName})`);
      await signIn(page, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the Editing Manager');
    });
    const eurRun = await prepare(DISCOUNT_BASELINE.pricelistEur, (s) => s);

    // ================= Steps 1-7 (EUR) =================
    await cycle('EUR', eurRun, (s) => s);

    // ================= Step 8 (GBP, CHF) =================
    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      for (const [code, pricelist] of [['GBP', DISCOUNT_BASELINE.pricelistGbp], ['CHF', DISCOUNT_BASELINE.pricelistChf]] as const) {
        const label = (s: string) => `Step 8 / ${code} - ${s}`;
        const run = await prepare(pricelist, label);
        await cycle(code, run, label);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
