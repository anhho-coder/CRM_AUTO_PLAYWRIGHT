import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.8 - Order with a listed product and a Support Services product   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.8
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 41, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_2.8 (Jira CRM-13785; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-8-product-scope-base-excludes-support.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0097, IS-CRM-FUNC-0096
 * Source version   : master row CRM-12144_2.8 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * Deal registration on A2144B x 5 + A2165B x 2 rewards 10 % of the A2144B line only: -164.50, Total 2,370.50.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.8:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.8, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
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
 *    3. Create a new opportunity in CRM > Pipeline with (LIST view - the kanban quick-create card lacks these fields):
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5 and A2165B with Ordered Qty 2
 *    3. Pick Deal registration and click Save
 *  Expected Results
 *    3. Reward = -164.50 (10% of the A2144B line only); Total = 2,370.50 (1,645.00 + 890.00 - 164.50)
 *
 *  Port notes : accounts *_crm_mig; Mig helpers and Mig order-line reader; no other deviation.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.8';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5 and A2165B with Ordered Qty 2',
  s3: 'Step 3: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Order with a listed product and a Support Services product (crm-mig)`, () => {
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

  test(`${TC}: Order with a listed product and a Support Services product`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];

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
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.supportProduct, 2);
      const a2165 = await dealElementPage.waitForOrderLineCell(1, 'Subtotal', '890.00');
      console.log(`  - A2144B x 5 line Subtotal : 1,645.00`);
      console.log(`  - A2165B x 2 line Subtotal : ${a2165}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - Reward (10% of the A2144B line only)', expected: '-164.50', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -164.5 },
        { what: 'Step 3 - Total (1,645.00 + 890.00 - 164.50)', expected: '2,370.50', actual: total, passed: money(total) === 2370.5 },
      ], `${TC} - Step 3 reward on the listed product only`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration on A2144B + A2165B');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
