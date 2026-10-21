import { test, expect } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DiscountRun,
  newDiscountRun,
  idFromUrl,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.1 - Pick an eligible program on a Deal Element   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.1 (crm-mig manual TC, master "Migration - Discount" row 34) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0077
 * Flow reference   : CRM-12144 "Discounts QA Instructions" TC-01 (Reference line: the reference system
 *                    gives the same reward line and comparison values)
 * Source version   : master row CRM-12144_2.1 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * A salesperson builds a fresh end-customer order of A2144B x 5 on a Deal Element and picks Deal registration:
 * the 10 % reward line appears at once (before Save), stays single after Save, and the Opportunity's totals
 * match the Deal Element's.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.1, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)" - same pricelist, pre-prod label)
 *    3. CRM > Pipeline > Create a new opportunity (switch the pipeline to LIST view first - the kanban
 *       quick-create card does not carry these fields):
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (this is what links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5
 *         -> Expected: Subtotal = 1,645.00
 *    3. Pick Deal registration in Promotion, without saving
 *         -> Expected: a reward line appears at once:
 *              _ Description = the program's name
 *              _ Product     = "10.0% discount on products"
 *              _ Unit Price  = -164.50
 *              _ Total       = 1,480.50
 *    4. Click Save
 *         -> Expected: exactly one reward line
 *    5. Go back to the opportunity
 *         -> Expected: Partner Discount(%), Partner Discount and Total match the Deal Element
 * ================================================================================================
 */

const TC = 'Discount_2.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5',
  s3: 'Step 3: Pick Deal registration in Promotion, without saving',
  s4: 'Step 4: Click Save',
  s5: 'Step 5: Go back to the opportunity',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging

const SALES = users.sale_ic_thomas;
const ORDER_LINES = '.o_notebook .tab-pane.active table.o_list_view';
const TOTALS = '.oe_subtotal_footer';

interface Check { what: string; expected: string; actual: string; passed: boolean }

const money = (s: string): number => {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? NaN : n;
};

test.describe(`${TC} - Pick an eligible program on a Deal Element (pre-prod baseline of CRM-12144_2.1)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) {
      await teardownDiscountRun(page, run, testInfo);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Pick an eligible program on a Deal Element`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const deTotals: Record<string, string> = {};

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
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      await dealElementPage.waitForAutoPopulate();
      const paymentTerm = await dealElementPage.getPaymentTermValue();
      console.log(`  - Payment Terms on open : ${paymentTerm || '(empty)'}`);
      if (!paymentTerm) await dealElementPage.selectPaymentTerm(DISCOUNT_BASELINE.paymentTerm);
      console.log(`  - Pricelist             : ${await dealElementPage.getPricelistValue()}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addProductLine(DISCOUNT_BASELINE.listedProduct, 5);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      console.log(`  - A2144B line Subtotal : ${subtotal}`);
      const c: Check = { what: 'Step 2 - A2144B x 5 line Subtotal', expected: '1,645.00', actual: subtotal, passed: money(subtotal) === 1645 };
      checks.push(c);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 2 line subtotal`, passed: c.passed, highlight: [ORDER_LINES],
        lines: [`Expected : Subtotal = ${c.expected}`, `Actual   : ${c.actual}`],
      }).catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - A2144B x 5 on the Deal Element');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const picked = await dealElementPage.setPromotion('Deal registration');
      console.log(`  - Promotion picked : ${picked}`);
      const rowCount = await dealElementPage.waitForOrderLineRowCount(2);
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rows.find((r) => r['Product'] === DISCOUNT_BASELINE.dealRegistrationProduct);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Order line rows (before Save) : ${rowCount}`);
      console.log(`  - Reward line Product           : ${reward?.['Product'] ?? '(none)'}`);
      console.log(`  - Reward line Description       : ${reward?.['Description'] ?? '(none)'}`);
      console.log(`  - Reward line Unit Price        : ${reward?.['Unit Price'] ?? '(none)'}`);
      console.log(`  - Total (before Save)           : ${total}`);
      const s3: Check[] = [
        { what: 'Step 3 - a reward line appears at once (before Save)', expected: 'present', actual: reward ? 'present' : 'absent', passed: !!reward },
        { what: "Step 3 - reward line Description = the program's name", expected: DISCOUNT_BASELINE.dealRegistration, actual: reward?.['Description'] ?? '', passed: reward?.['Description'] === DISCOUNT_BASELINE.dealRegistration },
        { what: 'Step 3 - reward line Product', expected: DISCOUNT_BASELINE.dealRegistrationProduct, actual: reward?.['Product'] ?? '', passed: reward?.['Product'] === DISCOUNT_BASELINE.dealRegistrationProduct },
        { what: 'Step 3 - reward line Unit Price', expected: '-164.50', actual: reward?.['Unit Price'] ?? '', passed: money(reward?.['Unit Price'] ?? '') === -164.5 },
        { what: 'Step 3 - Total', expected: '1,480.50', actual: total, passed: money(total) === 1480.5 },
      ];
      checks.push(...s3);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 3 reward line before Save`, passed: s3.every((c) => c.passed), highlight: [ORDER_LINES, TOTALS],
        lines: s3.map((c) => `${c.what}: ${c.actual}`),
      }).catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.save();
      const deId = idFromUrl(page.url());
      if (deId) run.saleOrderIds.push(deId);
      console.log(`  - Deal Element id : ${deId ?? '(not in URL)'}`);
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewardRows = rows.filter((r) => r['Product'] === DISCOUNT_BASELINE.dealRegistrationProduct);
      for (const f of ['discount', 'discount_money', 'amount_total']) deTotals[f] = await dealElementPage.getSubtotalFooterValue(f);
      console.log(`  - Reward lines after Save : ${rewardRows.length}`);
      console.log(`  - Partner Discount(%)     : ${deTotals.discount}`);
      console.log(`  - Partner Discount        : ${deTotals.discount_money}`);
      console.log(`  - Total                   : ${deTotals.amount_total}`);
      const c: Check = { what: 'Step 4 - exactly one reward line after Save', expected: '1', actual: String(rewardRows.length), passed: rewardRows.length === 1 };
      checks.push(c);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 4 one reward line`, passed: c.passed, highlight: [ORDER_LINES, TOTALS],
        lines: [`Expected : 1 reward line`, `Actual   : ${c.actual}`],
      }).catch(() => {});
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.clickBackToOpportunity();
      const opp: Record<string, string> = {};
      for (const f of ['discount', 'discount_money', 'amount_total']) opp[f] = await opportunityPage.getSubtotalFooterValue(f);
      const labels: Record<string, string> = { discount: 'Partner Discount(%)', discount_money: 'Partner Discount', amount_total: 'Total' };
      const s5: Check[] = (['discount', 'discount_money', 'amount_total'] as const).map((f) => ({
        what: `Step 5 - Opportunity ${labels[f]} matches the Deal Element`,
        expected: deTotals[f],
        actual: opp[f],
        passed: deTotals[f] !== '' && money(opp[f]) === money(deTotals[f]),
      }));
      for (const c of s5) console.log(`  - ${c.what.replace('Step 5 - ', '')} : opp ${c.actual} | DE ${c.expected}`);
      checks.push(...s5);
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC} - Step 5 opportunity totals`, passed: s5.every((c) => c.passed), highlight: [TOTALS],
        lines: s5.map((c) => `${c.what}: ${c.actual} (DE ${c.expected})`),
      }).catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-5 - back on the opportunity');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      console.log('==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.passed ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const failed = checks.filter((c) => !c.passed).length;
      console.log(`OVERALL: ${failed ? 'FAIL' : 'PASS'} - ${checks.length - failed}/${checks.length} checks hold on the reference system`);
      for (const c of checks) expect(c.passed, `${c.what}: expected ${c.expected}, got ${c.actual}`).toBe(true);
    });
  });
});
