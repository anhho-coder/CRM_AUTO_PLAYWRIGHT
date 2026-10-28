import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, CurrencyPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  sameCents,
  newDiscountRun,
  rewardRows,
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
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.8 - Compare a EUR order with the 1,400 USD minimum converted at the latest rate   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.8
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 25, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.8 (Jira CRM-13771; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-8-foreign-currency-minimum-at-latest-rate.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0074-05
 * Source version   : master row CRM-12144_1.8 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max_crm_mig) for the CRM steps;
 *                    the Current Rate is read at Step 1 as Faye Nguyen (users.accountance_ic_faye_crm_mig)
 *
 * Summary
 * -------
 * For EUR, then GBP and CHF: with R = the currency's Current Rate and T = 1,400.00 x R, an order of exactly T is
 * offered Deal registration, T - 0.01 is not, and T with an Order Date a year back still is (latest rate used).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.8:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.8, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Compare a EUR order with the 1,400 USD minimum converted at the latest rate (IS-CRM-FUNC-0074-05)
 *  Priority: P1 | Spec Areas: 0074-05 - EUR at latest rate
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can
 *       edit Unit Price)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist_EUR (EUR)
 *    3. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. Open Accounting > Configuration > Currencies and note the Current Rate of EUR (R); compute T = 1,400.00 x R,
 *       rounded to the cent
 *    2. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       check Pricelist = EUR
 *    3. On Order Lines, add A2144B with Ordered Qty 1 and Unit Price T
 *    4. Open the Promotion list
 *    5. Change Unit Price to T - 0.01 and open the Promotion list
 *    6. Change Unit Price back to T, move the Order Date at least one year back and open the Promotion list
 *    7. Pick Deal registration and click Save
 *    8. Repeat steps 1 to 7 with the GBP and the CHF pricelist, each on a new company and opportunity
 *  Expected Results
 *    4. The list contains Deal registration
 *    5. The list does not contain Deal registration
 *    6. The list still contains Deal registration (the latest rate is used, whatever the order date)
 *    7. Reward = -10% of T, rounded to the cent; Total in Company Currency is shown
 *    8. Same results for GBP and CHF
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; Step 1 reads the rate as
 *  users.accountance_ic_faye_crm_mig because Invoicing > Configuration > Accounting > Currencies needs groups 30+26+5
 *  and users.manager_max_crm_mig lacks group 30 (CRM-12467 row 1.5); the spec signs in again as
 *  users.manager_max_crm_mig for Steps 2-8 of every cycle. crm-mig rates are static (last dated 2026-10-13).
 *  Teardown deletes each run's records; afterAll sweeps by run marker.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.8';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price) - Max Zaprykutenko',
  pre2: 'Pre-condition 2: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_EUR (EUR)',
  pre3: 'Pre-condition 3: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
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

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const MANAGER = users.manager_max_crm_mig;
const CURRENCY_READER = users.accountance_ic_faye_crm_mig;
const MINIMUM_USD = 1400;
const runs: DiscountRun[] = []; // every run of this file - the afterAll sweep re-checks them

/** Order Date one year and one day back, as this build renders it (MM/DD/YYYY HH:mm:ss). */
function orderDateOneYearBack(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} 10:00:00`;
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Compare a EUR order with the 1,400 USD minimum converted at the latest rate (crm-mig)`, () => {
  let created: DiscountRun[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
  });

  test.afterEach(async ({ page }, testInfo) => {
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

  test(`${TC}: Compare a EUR order with the 1,400 USD minimum converted at the latest rate`, baselineDetails(TC), async ({ page }, testInfo) => {
    // three currency cycles (company + opportunity + Deal Element each) plus three extra sign-ins for the rate reads
    test.setTimeout(config.timeouts.test * 3);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const currencyPage = new CurrencyPageMig(page);
    const checks: Check[] = [];

    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };

    /** Steps 1-7 for one currency; `label` maps a STEP label to the one shown for this cycle. */
    const cycle = async (code: string, run: DiscountRun, label: (s: string) => string) => {
      let T = NaN;
      await test.step(label(STEP.s1.replace('EUR', code)), async () => {
        console.log(`\n--- ${label(STEP.s1.replace('EUR', code))} ---`);
        console.log(`  - Login : ${CURRENCY_READER.username} (${CURRENCY_READER.displayName}) - the Currencies screen needs groups that Max lacks`);
        await signInMig(page, CURRENCY_READER);
        await currencyPage.openCurrenciesList();
        const raw = await currencyPage.getCurrencyRate(code);
        const R = parseFloat(raw);
        T = Math.round(MINIMUM_USD * R * 100) / 100;
        console.log(`  - Current Rate of ${code} (R) : ${raw}`);
        console.log(`  - T = 1,400.00 x R            : ${T.toFixed(2)}`);
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 1 - Current Rate read from the Currencies list`, expected: 'a rate > 0', actual: raw || '(empty)', passed: R > 0 },
        ], `${TC} - ${code} Step 1 currency rate`, []);
        // Steps 2-8 run as the Editing Manager again
        await signInMig(page, MANAGER);
        if (!run.urlOpp) throw new Error(`Opportunity of ${run.company} has no URL - Pre-condition 3 did not complete`);
        await opportunityPage.openByUrlReloaded(run.urlOpp);
      });

      await test.step(label(STEP.s2.replace('EUR', code)), async () => {
        console.log(`\n--- ${label(STEP.s2.replace('EUR', code))} ---`);
        await openDealElementFromOpportunity(page);
        const pricelist = await dealElementPage.getPricelistValue();
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 2 - Pricelist is the ${code} list`, expected: `(${code})`, actual: pricelist, passed: pricelist.trim().endsWith(`(${code})`) && !/\(USD\)$/.test(pricelist.trim()) },
        ], `${TC} - ${code} Step 2 pricelist`, [DISCOUNT_HIGHLIGHT.totals]);
      });

      await test.step(label(STEP.s3), async () => {
        console.log(`\n--- ${label(STEP.s3)} ---`);
        await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 1);
        await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, T);
        await dealElementPage.blurForm();
        console.log(`  - line Subtotal : ${(await dealElementPage.getOrderLineRowCells(0))['Subtotal']}`);
      });

      await test.step(label(STEP.s4), async () => {
        console.log(`\n--- ${label(STEP.s4)} ---`);
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 4 - at T = ${T.toFixed(2)} the list contains Deal registration`, expected: DISCOUNT_MIG.dealRegistration, actual: options.join(' | ') || '(empty list)', passed: options.includes(DISCOUNT_MIG.dealRegistration) },
        ], `${TC} - ${code} Step 4 list at T`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s5), async () => {
        console.log(`\n--- ${label(STEP.s5)} ---`);
        await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, Math.round((T - 0.01) * 100) / 100);
        await dealElementPage.blurForm();
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 5 - at T - 0.01 the list does not contain Deal registration`, expected: `not listed: ${DISCOUNT_MIG.dealRegistration}`, actual: options.join(' | ') || '(empty list)', passed: !options.includes(DISCOUNT_MIG.dealRegistration) },
        ], `${TC} - ${code} Step 5 list at T - 0.01`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s6), async () => {
        console.log(`\n--- ${label(STEP.s6)} ---`);
        await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, T);
        await dealElementPage.blurForm();
        const dateText = orderDateOneYearBack();
        const dateSet = await dealElementPage.setOrderDate(dateText);
        const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 6 - Order Date moved a year back`, expected: dateText, actual: await dealElementPage.getOrderDate(), passed: dateSet },
          { what: `${code} Step 6 - with the old Order Date the list still contains Deal registration`, expected: DISCOUNT_MIG.dealRegistration, actual: options.join(' | ') || '(empty list)', passed: options.includes(DISCOUNT_MIG.dealRegistration) },
        ], `${TC} - ${code} Step 6 list with an old Order Date`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
        await dealElementPage.closePromotionList();
      });

      await test.step(label(STEP.s7), async () => {
        console.log(`\n--- ${label(STEP.s7)} ---`);
        await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
        await saveDealElement(page, run);
        const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
        const expectedReward = -Math.round(T * 10) / 100;
        const companyTotal = await dealElementPage.getVisibleFieldValue('amount_total_company_signed');
        await recordChecks(page, testInfo, checks, [
          { what: `${code} Step 7 - Reward = -10% of T, rounded to the cent`, expected: expectedReward.toFixed(2), actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && sameCents(money(rewards[0]['Unit Price']), expectedReward) },
          { what: `${code} Step 7 - Total in Company Currency is shown`, expected: 'a non-empty amount', actual: companyTotal || '(empty)', passed: !Number.isNaN(money(companyTotal)) },
        ], `${TC} - ${code} Step 7 reward`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${code} Steps 1-7 - Deal registration at the converted minimum`);
      });
    };

    /** Pre-conditions 2-3 for one currency: a fresh company with that pricelist + its opportunity. */
    const prepare = async (code: string, pricelist: string, label: (s: string) => string): Promise<DiscountRun> => {
      const run = newRun();
      const pre2 = STEP.pre2.replace('Public Pricelist_EUR (EUR)', `${pricelist} (${code})`);
      await test.step(label(pre2), async () => {
        console.log(`\n--- ${label(pre2)} ---`);
        await createEndCustomerCompanyMig(page, run, MANAGER, pricelist);
      });
      await test.step(label(STEP.pre3), async () => {
        console.log(`\n--- ${label(STEP.pre3)} ---`);
        await createOpportunityForCompanyMig(page, run, MANAGER);
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${code} - Pre-conditions 2-3 done`);
      });
      return run;
    };

    // ================= Pre-conditions (EUR) =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${MANAGER.username} (${MANAGER.displayName})`);
      await signInMig(page, MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the Editing Manager');
    });
    const eurRun = await prepare('EUR', DISCOUNT_MIG.pricelistEur, (s) => s);

    // ================= Steps 1-7 (EUR) =================
    await cycle('EUR', eurRun, (s) => s);

    // ================= Step 8 (GBP, CHF) =================
    await test.step(STEP.s8, async () => {
      console.log(`\n--- ${STEP.s8} ---`);
      for (const [code, pricelist] of [['GBP', DISCOUNT_MIG.pricelistGbp], ['CHF', DISCOUNT_MIG.pricelistChf]] as const) {
        const label = (s: string) => `Step 8 / ${code} - ${s}`;
        const run = await prepare(code, pricelist, label);
        await cycle(code, run, label);
      }
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
