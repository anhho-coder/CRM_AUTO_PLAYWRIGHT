import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  idFromUrl,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.1 - Pick an eligible program on a Deal Element   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 34, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_2.1 (Jira CRM-13778; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-1-pick-eligible-program-on-deal-element.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0077
 * Flow reference   : CRM-12144 "Discounts QA Instructions" v2, TC-01
 * Source version   : master row CRM-12144_2.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * A salesperson builds a fresh end-customer order of A2144B x 5 on a Deal Element and picks Deal registration:
 * the 10 % reward line appears at once (before Save), stays single after Save, and the Opportunity's totals
 * match the Deal Element's.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.1, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist (USD)          (crm-mig label: Public Pricelist_USD)
 *       [automation data, same as the baseline]
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *    3. Create a new opportunity in CRM > Pipeline with (switch the pipeline to LIST view first - the kanban
 *       quick-create card does not carry these fields):
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>  (linked through the company's e-mail)
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
 *
 *  Port notes (mechanical only): host crm-mig, *_crm_mig accounts, Contacts / Pipeline opened by URL hash (the
 *  Mig sidebar theme hides the navbar). Teardown deletes exactly the run's records; afterAll sweeps by run marker.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5',
  s3: 'Step 3: Pick Deal registration in Promotion, without saving',
  s4: 'Step 4: Click Save',
  s5: 'Step 5: Go back to the opportunity',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Pick an eligible program on a Deal Element (crm-mig)`, () => {
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

  test(`${TC}: Pick an eligible program on a Deal Element`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const deTotals: Record<string, string> = {};

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
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      console.log(`  - A2144B line Subtotal : ${subtotal}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - A2144B x 5 line Subtotal', expected: '1,645.00', actual: subtotal, passed: money(subtotal) === 1645 },
      ], `${TC} - Step 2 line subtotal`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - A2144B x 5 on the Deal Element');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const picked = await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      console.log(`  - Promotion picked : ${picked}`);
      const rowCount = await dealElementPage.waitForOrderLineRowCount(2);
      const rows = await dealElementPage.getAllOrderLineRows();
      const reward = rewardRows(rows)[0];
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Order line rows (before Save) : ${rowCount}`);
      console.log(`  - Reward line Product           : ${reward?.['Product'] ?? '(none)'}`);
      console.log(`  - Reward line Description       : ${reward?.['Description'] ?? '(none)'}`);
      console.log(`  - Reward line Unit Price        : ${reward?.['Unit Price'] ?? '(none)'}`);
      console.log(`  - Total (before Save)           : ${total}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - a reward line appears at once (before Save)', expected: 'present', actual: reward ? 'present' : 'absent', passed: !!reward },
        { what: "Step 3 - reward line Description = the program's name", expected: DISCOUNT_MIG.dealRegistration, actual: reward?.['Description'] ?? '', passed: reward?.['Description'] === DISCOUNT_MIG.dealRegistration },
        { what: 'Step 3 - reward line Product', expected: DISCOUNT_MIG.dealRegistrationProduct, actual: reward?.['Product'] ?? '', passed: reward?.['Product'] === DISCOUNT_MIG.dealRegistrationProduct },
        { what: 'Step 3 - reward line Unit Price', expected: '-164.50', actual: reward?.['Unit Price'] ?? '', passed: money(reward?.['Unit Price'] ?? '') === -164.5 },
        { what: 'Step 3 - Total', expected: '1,480.50', actual: total, passed: money(total) === 1480.5 },
      ], `${TC} - Step 3 reward line before Save`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.save();
      const deId = idFromUrl(page.url());
      if (deId) run.saleOrderIds.push(deId);
      console.log(`  - Deal Element id : ${deId ?? '(not in URL)'}`);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      for (const f of ['discount', 'discount_money', 'amount_total']) deTotals[f] = await dealElementPage.getSubtotalFooterValue(f);
      console.log(`  - Reward lines after Save : ${rewards.length}`);
      console.log(`  - Partner Discount(%)     : ${deTotals.discount}`);
      console.log(`  - Partner Discount        : ${deTotals.discount_money}`);
      console.log(`  - Total                   : ${deTotals.amount_total}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - exactly one reward line after Save', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
      ], `${TC} - Step 4 one reward line`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
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
      await recordChecks(page, testInfo, checks, s5, `${TC} - Step 5 opportunity totals`, [DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-5 - back on the opportunity');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
