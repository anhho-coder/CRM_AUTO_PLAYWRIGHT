import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  recordChecks,
  money,
  rewardRows,
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
  editQuotationAndSave,
  readOrderLines,
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
 *  CRM-11857_3.3.10 - Removing the promotion from the quotation recomputes Total in Company Currency   (crm-mig port)
 * ================================================================================================
 * Test Case ID     : CRM-11857_3.3.10
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : Exchange-rate_1.3.10 (Jira: not imported yet; tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-10-removed-promotion-recomputes-company-total.spec.ts)
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
 * The quotation is raised from a Deal Element carrying Deal registration ([A2144B] x 5, one reward line). The
 * Promotion is emptied on the quotation: the reward line goes and Total in Company Currency must follow the new Total.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-11857_3\.3\.10:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (the baseline Exchange-rate_1.3.10, on crm-mig)
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
 *           - Line 1       = [A2144B], Quantity = 5
 *           - Promotion    = Deal registration (picked on the Deal Element before Save)
 *  Steps
 *    1. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today)
 *         -> Expected: an EUR row applies today (RC > 0)
 *    2. Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0, and note the reward line Subtotal as RW
 *         -> Expected: C0 = T0 / RC, rounded to 2 decimals; one reward line "10.0% discount on products" with a Subtotal RW < 0
 *    3. Click Edit, empty the Promotion field, click Save, and read the order lines, Total and Total in Company Currency again
 *         -> Expected: No reward line is listed; Total = T0 - RW; Total in Company Currency = Total / RC, rounded to 2 decimals
 * ================================================================================================
 */

const TC = 'CRM-11857_3.3.10';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig as the CRM administrator (anh.ho@nakivo.com)',
  pre2: 'Pre-conditions 2-5: Contacts > Create FX-Cust-<timestamp> (Pricelist = Public Pricelist_EUR); CRM > Pipeline (LIST view) > Create FX-Opp-<timestamp>; DEAL ELEMENT with the order below, Save; NEW QUOTATION on the Deal Element',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today)',
  s2: 'Step 2: Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0, and note the reward line Subtotal as RW',
  s3: 'Step 3: Click Edit, empty the Promotion field, click Save, and read the order lines, Total and Total in Company Currency again',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const ADMIN = users.admin_crm_mig;
const SALESPERSON = users.manager_max_crm_mig;
const PAGES = MIG_PAGES;
const ORDER = { lines: [{ sku: FX_QUOTE.product, qty: 5 }], promotion: FX_QUOTE.dealRegistration };
const HIGHLIGHT = [DISCOUNT_HIGHLIGHT.totals];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Removing the promotion from the quotation recomputes Total in Company Currency`, () => {
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

  test(`${TC}: Removing the promotion from the quotation recomputes Total in Company Currency`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const today = todayIso();
    let quotationId = 0;
    let rc = 0;
    let reward = NaN;
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
      const rates = await readRatesMig(page, FX_QUOTE.currency, [today]);
      rc = rates[today].rate;
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - an EUR rate applies today (RC)', expected: 'RC > 0', actual: `${rc} (row dated ${rates[today].date})`, passed: rc > 0 },
      ], `${TC} - Step 1 EUR rates`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - rates noted');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      a0 = await readQuotationAmountsMig(page, quotationId);
      reward = money(rewardRows(await readOrderLines(page, PAGES), FX_QUOTE.rewardProduct)[0]?.['Subtotal'] ?? '');
      console.log(`  - RW (the reward line Subtotal) = ${reward}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - C0 = T0 / RC', expected: `${round2(a0.total / rc)} (= ${a0.total} / ${rc})`, actual: `${a0.totalCc}`, passed: a0.totalCc === round2(a0.total / rc) },
        { what: 'Step 2 - RW = the reward line Subtotal', expected: 'a Subtotal < 0', actual: `${reward}`, passed: reward < 0 },
      ], `${TC} - Step 2 T0 and C0`, HIGHLIGHT);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await editQuotationAndSave(page, 'Promotion emptied', async (_q, de) => {
        await de.clearPromotion();
      }, PAGES);
      const a = await readQuotationAmountsMig(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc })}`);
      const rewards = rewardRows(await readOrderLines(page, PAGES), FX_QUOTE.rewardProduct);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - no reward line is listed', expected: '0', actual: `${rewards.length}`, passed: rewards.length === 0 },
        { what: 'Step 3 - Total = T0 - RW', expected: `${round2(a0.total - reward)}`, actual: `${a.total}`, passed: a.total === round2(a0.total - reward) },
        { what: 'Step 3 - Total in Company Currency = Total / RC (C0 = not recomputed)', expected: `${round2(a.total / rc)} (= ${a.total} / ${rc}; C0 = ${a0.totalCc})`, actual: `${a.totalCc}`, passed: a.totalCc === round2(a.total / rc) },
      ], `${TC} - Step 3 after the promotion was removed`, [...HIGHLIGHT, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - promotion removed');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
