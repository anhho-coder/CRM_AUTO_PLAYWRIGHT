import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  recordChecks,
  signInMig,
  printVerifyAndAssertMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';
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
  readOrderLines,
  lineSubtotal,
} from '@helpers/fx-quotation.helper';
import {
  baselineDetails,
  readRatesMig,
  createEurQuotationMig,
  readQuotationAmountsMig,
  MIG_PAGES,
} from '@helpers/fx-quotation-mig.helper';

/**
 * ================================================================================================
 *  CRM-11857_3.3.6 - Removing a product line recomputes Total in Company Currency at the Order Date's rate   (crm-mig port)
 * ================================================================================================
 * Test Case ID     : CRM-11857_3.3.6
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : Exchange-rate_1.3.6 (Jira: not imported yet; tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-6-removed-line-recomputes-company-total.spec.ts)
 *                    - assertions ported unchanged
 * Parent TC        : CRM-11857_3.3 (CRM-13394)
 * Jira             : N/A - not imported to Xray yet (manual TC = the baseline's, ported below)
 * Source version   : baseline inline manual TC of 2026-10-26 - re-check against the master / Xray once imported
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE, Odoo 12 CE)
 * Run as           : CRM administrator (anh.ho@nakivo.com, users.admin_crm_mig). Salesperson = Max Zaprykutenko (data only)
 * Mechanical changes from the baseline:
 *   - host + login (crm-mig, signInMig); NEW QUOTATION creates the quotation in place (newQuotationMig opens it);
 *   - "Total in Company Currency" is not on the crm-mig quotation FORM: every read of it (Step 2 and each later
 *     "read ... Total in Company Currency again") uses Sales > Orders > Quotations (LIST), optional column on,
 *     filtered on ID = the quotation (tester decision for CRM-11857_3.3, 2026-10-22);
 *   - Mig page objects (QuotationPageMig / DealElementPageMig) and a bounded actionTimeout;
 *   - teardown: deny-list of the run's own ids (afterEach) + afterAll sweep, crm-mig rule (CLAUDE.md).
 *
 * Summary
 * -------
 * The quotation carries [A2144B] x 1 and [A2160B] x 1. After the Order Date save the [A2160B] line is deleted:
 * Total in Company Currency must be recomputed at the 2026-08-03 rate.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-11857_3\.3\.6:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (the baseline Exchange-rate_1.3.6, on crm-mig)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig as the CRM administrator (anh.ho@nakivo.com)
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
 *           - Line 2       = [A2160B], Quantity = 1
 *  Steps
 *    1. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today) and R1 (the row dated 2026-08-03)
 *         -> Expected: a row dated 2026-08-03 exists; R1 differs from RC
 *    2. Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0, and note the [A2160B] line Subtotal as S2
 *         -> Expected: C0 = T0 / RC, rounded to 2 decimals; an [A2160B] line with a Subtotal S2 > 0
 *    3. Click Edit, open "Other Information", set Order Date = 08/03/2026 10:00:00, click Save, and read Total and Total in Company Currency again
 *         -> Expected: Order Date = 08/03/2026 10:00:00; Total = T0; Total in Company Currency = C0 (unchanged - accepted 2026-10-26:
 *            an Order Date change alone does not recompute it; T0 / R1 here would mean it now does)
 *    4. Click Edit, on "Order Lines" delete the [A2160B] line (trash icon), click Save, and read Total and Total in Company Currency again
 *         -> Expected: No [A2160B] line is listed; Total = T0 - S2; Total in Company Currency = Total / R1, rounded to 2 decimals
 * ================================================================================================
 */

const TC = 'CRM-11857_3.3.6';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig as the CRM administrator (anh.ho@nakivo.com)',
  pre2: 'Pre-conditions 2-5: Contacts > Create FX-Cust-<timestamp> (Pricelist = Public Pricelist_EUR); CRM > Pipeline (LIST view) > Create FX-Opp-<timestamp>; DEAL ELEMENT with the order below, Save; NEW QUOTATION on the Deal Element',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today) and R1 (the row dated 2026-08-03)',
  s2: 'Step 2: Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0, and note the [A2160B] line Subtotal as S2',
  s3: 'Step 3: Click Edit, open "Other Information", set Order Date = 08/03/2026 10:00:00, click Save, and read Total and Total in Company Currency again',
  s4: 'Step 4: Click Edit, on "Order Lines" delete the [A2160B] line (trash icon), click Save, and read Total and Total in Company Currency again',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const ADMIN = users.admin_crm_mig;
const SALESPERSON = users.manager_max_crm_mig;
const PAGES = MIG_PAGES;
const ORDER = { lines: [{ sku: FX_QUOTE.product, qty: 1 }, { sku: FX_QUOTE.secondProduct, qty: 1 }] };
const HIGHLIGHT = [DISCOUNT_HIGHLIGHT.totals];
const ANCHOR_SHOWN = `${toFormDate(FX_QUOTE.anchorDate)} 10:00:00`;

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Removing a product line recomputes Total in Company Currency at the Order Date's rate`, () => {
  const runs: DiscountRun[] = [];
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newFxRun();
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

  test(`${TC}: Removing a product line recomputes Total in Company Currency at the Order Date's rate`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const today = todayIso();
    let quotationId = 0;
    let rc = 0;
    let r1 = 0;
    let s2 = NaN;
    let a0: QuoteAmounts = { total: NaN, totalText: '', totalCc: NaN, orderDate: '' };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${ADMIN.username}`);
      await signInMig(page, ADMIN);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the CRM administrator');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      quotationId = await createEurQuotationMig(page, run, SALESPERSON, ORDER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-conditions 2-5 - EUR quotation created');
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const rates = await readRatesMig(page, FX_QUOTE.currency, [today, FX_QUOTE.anchorDate]);
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
      a0 = await readQuotationAmountsMig(page, quotationId);
      s2 = lineSubtotal(await readOrderLines(page, PAGES), FX_QUOTE.secondProduct);
      console.log(`  - S2 (the [A2160B] line Subtotal) = ${s2}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - C0 = T0 / RC', expected: `${round2(a0.total / rc)} (= ${a0.total} / ${rc})`, actual: `${a0.totalCc}`, passed: a0.totalCc === round2(a0.total / rc) },
        { what: 'Step 2 - S2 = the [A2160B] line Subtotal', expected: 'a Subtotal > 0', actual: `${s2}`, passed: s2 > 0 },
      ], `${TC} - Step 2 T0 and C0`, HIGHLIGHT);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await setOrderDateAndSave(page, FX_QUOTE.anchorDate, PAGES);
      const a = await readQuotationAmountsMig(page, quotationId);
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
      await editQuotationAndSave(page, 'Delete the [A2160B] line', async (_q, de) => {
        await de.removeProductLineByName(FX_QUOTE.secondProduct);
      }, PAGES);
      const a = await readQuotationAmountsMig(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc, R1: r1 })}`);
      const left = lineSubtotal(await readOrderLines(page, PAGES), FX_QUOTE.secondProduct);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - no [A2160B] line is listed', expected: 'no line', actual: Number.isNaN(left) ? 'no line' : `a line of ${left}`, passed: Number.isNaN(left) },
        { what: 'Step 4 - Total = T0 - S2', expected: `${round2(a0.total - s2)}`, actual: `${a.total}`, passed: a.total === round2(a0.total - s2) },
        { what: 'Step 4 - Total in Company Currency = Total / R1 (recomputed at the Order Date rate; Total / RC = creation-day rate kept, C0 = not recomputed)', expected: `${round2(a.total / r1)} (= ${a.total} / ${r1}; Total / RC = ${round2(a.total / rc)}; C0 = ${a0.totalCc})`, actual: `${a.totalCc}`, passed: a.totalCc === round2(a.total / r1) },
      ], `${TC} - Step 4 after the removed line`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - [A2160B] line removed');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
