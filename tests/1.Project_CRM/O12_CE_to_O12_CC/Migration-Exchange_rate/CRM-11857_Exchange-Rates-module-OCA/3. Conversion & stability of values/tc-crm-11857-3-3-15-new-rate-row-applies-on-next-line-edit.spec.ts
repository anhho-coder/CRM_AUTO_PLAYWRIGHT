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
  setLineQuantityAndSave,
} from '@helpers/fx-quotation.helper';
import {
  baselineDetails,
  readRatesMig,
  createEurQuotationMig,
  readQuotationAmountsMig,
  MIG_PAGES,
  addRateRowMig,
  removeRateRowMig,
} from '@helpers/fx-quotation-mig.helper';

/**
 * ================================================================================================
 *  CRM-11857_3.3.15 - A rate row added after the save does not move Total in Company Currency until the next line change   (crm-mig port)
 * ================================================================================================
 * Test Case ID     : CRM-11857_3.3.15
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : Exchange-rate_1.3.15 (Jira: not imported yet; tests/1.Project_CRM/8.Invoicing_Module/ExchangeRate/1.3 US3 - Everything that uses the conversion keeps working/tc-exchange-rate-1-3-15-new-rate-row-applies-on-next-line-edit.spec.ts)
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
 * The quotation is moved to Order Date 2031-03-17 (no EUR row that day), then an EUR row RF is added for that date:
 * the saved figure must not move, and the next Quantity change must recompute it at RF. The row is removed in teardown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-11857_3\.3\.15:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (the baseline Exchange-rate_1.3.15, on crm-mig)
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
 *  Steps
 *    1. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today); check that no row is dated 03/17/2031
 *         -> Expected: an EUR row applies today (RC > 0); no EUR row is dated 03/17/2031 (the newest row on or before it is older)
 *    2. Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0
 *         -> Expected: C0 = T0 / RC, rounded to 2 decimals
 *    3. Click Edit, open "Other Information", set Order Date = 03/17/2031 10:00:00, click Save, and read Total and Total in Company Currency again
 *         -> Expected: Order Date = 03/17/2031 10:00:00; Total = T0; Total in Company Currency = C0
 *    4. Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates", click CREATE and add Date = 03/17/2031 with Rate = RF (RC x 0.9, 6 decimals), Save
 *         -> Expected: Exactly one EUR row dated 03/17/2031 is listed
 *    5. Open the quotation again and read Total and Total in Company Currency
 *         -> Expected: Total = T0; Total in Company Currency = C0 (a new rate row does not move a saved figure)
 *    6. Click Edit, on "Order Lines" set the Quantity of [A2144B] = 2, click Save, and read Total and Total in Company Currency again
 *         -> Expected: Total = 2 x T0; Total in Company Currency = Total / RF, rounded to 2 decimals (Total / RC = the rate
 *            known before the row was added)
 * ================================================================================================
 */

const TC = 'CRM-11857_3.3.15';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig as the CRM administrator (anh.ho@nakivo.com)',
  pre2: 'Pre-conditions 2-5: Contacts > Create FX-Cust-<timestamp> (Pricelist = Public Pricelist_EUR); CRM > Pipeline (LIST view) > Create FX-Opp-<timestamp>; DEAL ELEMENT with the order below, Save; NEW QUOTATION on the Deal Element',
  s1: 'Step 1: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates" and note RC (the rate that applies today); check that no row is dated 03/17/2031',
  s2: 'Step 2: Open Sales > Orders > Quotations (LIST), switch the optional column "Total in Company Currency" on, filter on ID = the quotation and note it as C0; open the quotation and note Total as T0',
  s3: 'Step 3: Click Edit, open "Other Information", set Order Date = 03/17/2031 10:00:00, click Save, and read Total and Total in Company Currency again',
  s4: 'Step 4: Open Invoicing > Configuration > Accounting > Currencies, open EUR, click "Rates", click CREATE and add Date = 03/17/2031 with Rate = RF (RC x 0.9, 6 decimals), Save',
  s5: 'Step 5: Open the quotation again and read Total and Total in Company Currency',
  s6: 'Step 6: Click Edit, on "Order Lines" set the Quantity of [A2144B] = 2, click Save, and read Total and Total in Company Currency again',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const ADMIN = users.admin_crm_mig;
const SALESPERSON = users.manager_max_crm_mig;
const PAGES = MIG_PAGES;
const ORDER = {};
const HIGHLIGHT = [DISCOUNT_HIGHLIGHT.totals];
const FUTURE_SHOWN = `${toFormDate(FX_QUOTE.futureDate)} 10:00:00`;

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - A rate row added after the save does not move Total in Company Currency until the next line change`, () => {
  const runs: DiscountRun[] = [];
  let run: DiscountRun;
  let rateAdded = false;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newFxRun();
    runs.push(run);
    rateAdded = false;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    // the EUR row this run added (far-future date, no other row carries it - never a migrated row) goes first
    const rowsLeft = rateAdded && !SKIP_CLEANUP ? await removeRateRowMig(page, FX_QUOTE.currency, FX_QUOTE.futureDate) : 0;
    if (!SKIP_CLEANUP) await teardownDiscountRunMig(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (rowsLeft !== 0) throw new Error(`Teardown: the EUR row dated ${FX_QUOTE.futureDate} was not removed on crm-mig (rows left: ${rowsLeft}) - remove it by hand`);
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: A rate row added after the save does not move Total in Company Currency until the next line change`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const checks: Check[] = [];
    const today = todayIso();
    let quotationId = 0;
    let rc = 0;
    let rf = 0;
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
      const rates = await readRatesMig(page, FX_QUOTE.currency, [today, FX_QUOTE.futureDate]);
      rc = rates[today].rate;
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - an EUR rate applies today (RC)', expected: 'RC > 0', actual: `${rc} (row dated ${rates[today].date})`, passed: rc > 0 },
        { what: 'Step 1 - no EUR row is dated 2031-03-17', expected: `the row applying to 2031-03-17 is older than 2031-03-17`, actual: rates[FX_QUOTE.futureDate].date, passed: rates[FX_QUOTE.futureDate].date !== FX_QUOTE.futureDate },
      ], `${TC} - Step 1 EUR rates`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - rates noted');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      a0 = await readQuotationAmountsMig(page, quotationId);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - C0 = T0 / RC', expected: `${round2(a0.total / rc)} (= ${a0.total} / ${rc})`, actual: `${a0.totalCc}`, passed: a0.totalCc === round2(a0.total / rc) },
      ], `${TC} - Step 2 T0 and C0`, HIGHLIGHT);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await setOrderDateAndSave(page, FX_QUOTE.futureDate, PAGES);
      const a = await readQuotationAmountsMig(page, quotationId);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Order Date', expected: FUTURE_SHOWN, actual: a.orderDate, passed: a.orderDate === FUTURE_SHOWN },
        { what: 'Step 3 - Total = T0', expected: `${a0.total}`, actual: `${a.total}`, passed: a.total === a0.total },
        { what: 'Step 3 - Total in Company Currency = C0', expected: `${a0.totalCc}`, actual: `${a.totalCc}`, passed: a.totalCc === a0.totalCc },
      ], `${TC} - Step 3 after the Order Date save`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - Order Date 03/17/2031 saved');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      rf = Number((rc * 0.9).toFixed(6));
      console.log(`  - Date          = ${toFormDate(FX_QUOTE.futureDate)}`);
      console.log(`  - Rate (RF)     = ${rf.toFixed(6)}   (= RC x 0.9)`);
      rateAdded = true;
      const rows = await addRateRowMig(page, FX_QUOTE.currency, FX_QUOTE.futureDate, rf.toFixed(6));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - EUR rows dated 03/17/2031', expected: '1', actual: `${rows}`, passed: rows === 1 },
      ], `${TC} - Step 4 EUR row 03/17/2031 added`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - EUR row 03/17/2031 added');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      const a = await readQuotationAmountsMig(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc, RF: rf })}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Total = T0', expected: `${a0.total}`, actual: `${a.total}`, passed: a.total === a0.total },
        { what: 'Step 5 - Total in Company Currency = C0 (a new rate row does not move a saved figure)', expected: `${a0.totalCc} (Total / RF = ${round2(a.total / rf)})`, actual: `${a.totalCc}`, passed: a.totalCc === a0.totalCc },
      ], `${TC} - Step 5 after the rate row was added`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - quotation re-read');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await setLineQuantityAndSave(page, FX_QUOTE.product, 2, PAGES);
      const a = await readQuotationAmountsMig(page, quotationId);
      console.log(`  - company total matches: ${ratesMatching(a.total, a.totalCc, { RC: rc, RF: rf })}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - Total = 2 x T0', expected: `${round2(2 * a0.total)}`, actual: `${a.total}`, passed: a.total === round2(2 * a0.total) },
        { what: 'Step 6 - Total in Company Currency = Total / RF (Total / RC = the older rate kept)', expected: `${round2(a.total / rf)} (= ${a.total} / ${rf}; Total / RC = ${round2(a.total / rc)})`, actual: `${a.totalCc}`, passed: a.totalCc === round2(a.total / rf) },
      ], `${TC} - Step 6 after the Quantity save`, HIGHLIGHT);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Quantity 2 saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
