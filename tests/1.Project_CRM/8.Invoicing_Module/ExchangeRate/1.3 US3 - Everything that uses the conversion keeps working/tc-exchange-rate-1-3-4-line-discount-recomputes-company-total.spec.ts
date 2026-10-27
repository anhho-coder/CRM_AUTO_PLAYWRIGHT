import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  recordChecks,
  signIn,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';
import {
  FX_QUOTE,
  QuoteAmounts,
  newFxRun,
  round2,
  todayIso,
  toFormDate,
  ratesMatching,
  setOrderDateAndSave,
  editQuotationAndSave,
  readRates,
  createEurQuotation,
  readQuotationAmounts,
  PREPROD_PAGES,
} from '@helpers/fx-quotation.helper';

/**
 * ================================================================================================
 *  Exchange-rate_1.3.4 - A line Discount (%) change recomputes Total in Company Currency at the Order Date's rate   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Exchange-rate_1.3.4
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Origin           : CRM-11857_3.3 (CRM-13394) - follow-up scenario of 2026-10-26; tester: "an Order Date change does
 *                    not change Total in Company Currency" is accepted for now, explore what does
 * Mirrored by      : CRM-11857_3.3.4 on crm-mig (helpers/fx-quotation-mig.baseline-map.ts)
 * Jira             : N/A - not imported to Xray yet (manual TC written inline below)
 * Spec             : [FRD] Exchange Rates (Currency Conversion), page 222529610 - US3 "Everything that uses the
 *                    conversion keeps working" (company-currency amounts keep appearing on quotations)
 * Source version   : inline manual TC of 2026-10-26 - re-check against the master / Xray once imported
 * Host             : pre-production (Odoo 12 EE = the reference system)
 * Run as           : CRM administrator (anh.ho@nakivo.com) - Billing Manager, Multi Currencies, Settings and Show Full
 *                    Accounting Features, as CRM-13394 asks. Salesperson on the records = Max Zaprykutenko (data only)
 *
 * Summary
 * -------
 * After the Order Date save, Special Discount(%) of [A2144B] is set to 10: Total drops by 10 % and Total in Company
 * Currency must be recomputed at the 2026-08-03 rate.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Exchange-rate_1\.3\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (inline, 2026-10-26)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as the CRM administrator (anh.ho@nakivo.com)
 *    2-5. (setup block) Contacts > Create a company; CRM > Pipeline (LIST view) > Create its opportunity; DEAL ELEMENT
 *         with the order below, Save; NEW QUOTATION on the Deal Element:
 *           - Company      = FX-Cust-<timestamp>   (Company, end customer: no Reseller, no Distributor)
 *           - Email        = fx.cust.<timestamp>@d<timestamp>.fxautotest.com
 *           - Country      = United States
 *           - State        = Maryland
 *           - Sales Team   = BDEU
 *           - Salesperson  = Max Zaprykutenko
 *           - Pricelist    = Public Pricelist_EUR
 *           - Opportunity  = FX-Opp-<timestamp>   (Street 123 street, Lead Form Download Free Trial, Stage New)
 *           - Payment Term = Immediate Payment (when the Deal Element opens with it empty)
 *           - Line 1       = [A2144B], Quantity = 1
 *  Steps
 *    1. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today) and R1 (the row dated 2026-08-03)
 *         -> Expected: a row dated 2026-08-03 exists; R1 differs from RC
 *    2. Open the quotation with developer mode on ("Total in Company Currency" is developer-only on pre-production) and note Total as T0 and Total in Company Currency as C0
 *         -> Expected: C0 = T0 / RC, rounded to 2 decimals
 *    3. Click Edit, open "Other Information", set Order Date = 08/03/2026 10:00:00, click Save, and read Total and Total in Company Currency again
 *         -> Expected: Order Date = 08/03/2026 10:00:00; Total = T0; Total in Company Currency = C0 (unchanged - accepted 2026-10-26:
 *            an Order Date change alone does not recompute it; T0 / R1 here would mean it now does)
 *    4. Click Edit, on "Order Lines" set Special Discount(%) of [A2144B] = 10, click Save, and read Total and Total in Company Currency again
 *         -> Expected: Total = T0 x 0.90; Total in Company Currency = Total / R1, rounded to 2 decimals
 * ================================================================================================
 */

const TC = 'Exchange-rate_1.3.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production as the CRM administrator (anh.ho@nakivo.com)',
  pre2: 'Pre-conditions 2-5: Contacts > Create FX-Cust-<timestamp> (Pricelist = Public Pricelist_EUR); CRM > Pipeline (LIST view) > Create FX-Opp-<timestamp>; DEAL ELEMENT with the order below, Save; NEW QUOTATION on the Deal Element',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today) and R1 (the row dated 2026-08-03)',
  s2: 'Step 2: Open the quotation with developer mode on ("Total in Company Currency" is developer-only on pre-production) and note Total as T0 and Total in Company Currency as C0',
  s3: 'Step 3: Click Edit, open "Other Information", set Order Date = 08/03/2026 10:00:00, click Save, and read Total and Total in Company Currency again',
  s4: 'Step 4: Click Edit, on "Order Lines" set Special Discount(%) of [A2144B] = 10, click Save, and read Total and Total in Company Currency again',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const ADMIN = users.admin_crm;
const SALESPERSON = users.manager_max;
const PAGES = PREPROD_PAGES;
const ORDER = {};
const HIGHLIGHT = [DISCOUNT_HIGHLIGHT.totals, "[name='amount_total_company_signed']"];
const ANCHOR_SHOWN = `${toFormDate(FX_QUOTE.anchorDate)} 10:00:00`;

test.describe(`${TC} - A line Discount (%) change recomputes Total in Company Currency at the Order Date's rate`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newFxRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: A line Discount (%) change recomputes Total in Company Currency at the Order Date's rate`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const today = todayIso();
    let quotationId = 0;
    let rc = 0;
    let r1 = 0;
    let a0: QuoteAmounts = { total: NaN, totalText: '', totalCc: NaN, orderDate: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${ADMIN.username}`);
      await signIn(page, ADMIN);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the CRM administrator');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      quotationId = await createEurQuotation(page, run, SALESPERSON, ORDER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions 2-5 - EUR quotation created');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const rates = await readRates(page, FX_QUOTE.currency, [today, FX_QUOTE.anchorDate]);
      rc = rates[today].rate;
      r1 = rates[FX_QUOTE.anchorDate].rate;
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - a row dated 2026-08-03 exists', expected: FX_QUOTE.anchorDate, actual: rates[FX_QUOTE.anchorDate].date, passed: rates[FX_QUOTE.anchorDate].date === FX_QUOTE.anchorDate },
        { what: 'Step 1 - R1 differs from RC', expected: 'R1 != RC', actual: `R1 = ${r1}, RC = ${rc}`, passed: r1 > 0 && rc > 0 && r1 !== rc },
      ], `${TC} - Step 1 EUR rates`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - rates noted');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      a0 = await readQuotationAmounts(page, quotationId);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - C0 = T0 / RC', expected: `${round2(a0.total / rc)} (= ${a0.total} / ${rc})`, actual: `${a0.totalCc}`, passed: a0.totalCc === round2(a0.total / rc) },
      ], `${TC} - Step 2 T0 and C0`, HIGHLIGHT);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await setOrderDateAndSave(page, FX_QUOTE.anchorDate, PAGES);
      const a = await readQuotationAmounts(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc, R1: r1 })}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Order Date', expected: ANCHOR_SHOWN, actual: a.orderDate, passed: a.orderDate === ANCHOR_SHOWN },
        { what: 'Step 3 - Total = T0', expected: `${a0.total}`, actual: `${a.total}`, passed: a.total === a0.total },
        { what: 'Step 3 - Total in Company Currency = C0 (an Order Date change alone does not recompute it)', expected: `${a0.totalCc}`, actual: `${a.totalCc}`, passed: a.totalCc === a0.totalCc },
      ], `${TC} - Step 3 after the Order Date save`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Order Date 08/03/2026 saved');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await editQuotationAndSave(page, 'Special Discount(%) of [A2144B] = 10', async (_q, de) => {
        await de.setLineDiscount(FX_QUOTE.product, 10);
      }, PAGES);
      const a = await readQuotationAmounts(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc, R1: r1 })}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Total = T0 x 0.90', expected: `${round2(a0.total * 0.9)}`, actual: `${a.total}`, passed: a.total === round2(a0.total * 0.9) },
        { what: 'Step 4 - Total in Company Currency = Total / R1 (recomputed at the Order Date rate; Total / RC = creation-day rate kept, C0 = not recomputed)', expected: `${round2(a.total / r1)} (= ${a.total} / ${r1}; Total / RC = ${round2(a.total / rc)}; C0 = ${a0.totalCc})`, actual: `${a.totalCc}`, passed: a.totalCc === round2(a.total / r1) },
      ], `${TC} - Step 4 after the line discount save`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - Special Discount 10 saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
