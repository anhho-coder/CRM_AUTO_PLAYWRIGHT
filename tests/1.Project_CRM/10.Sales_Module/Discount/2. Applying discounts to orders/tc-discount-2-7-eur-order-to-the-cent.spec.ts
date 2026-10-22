import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
  DiscountRun,
  Check,
  money,
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
 *  Discount_2.7 - EUR order with a line discount and a 35 % partner discount   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.7
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.7 (crm-mig manual TC, master "Migration - Discount" row 40) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13784
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0081
 * Source version   : master row CRM-12144_2.7 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max) - the only group that can edit Unit Price
 * Partners         : Bronze reseller Bailey Systems (res.partner 13512, 15 %), distributor QBS Software Ltd (res.partner 14474, 20 %)
 *
 * Summary
 * -------
 * EUR order, O365-SUB-5Y x 350 at 40.90 with 5 % line discount, Bronze reseller + distributor: Deal registration gives
 * Reward -1,360.10 and Total 7,955.45 with Total in Company Currency shown. These amounts are what crm-mig compares to.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.7:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.7, adapted to the reference system)
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
 *    4. Use an existing Bronze reseller (15 %) and an existing distributor (20 %)
 *    5. The reference system = this pre-production server (the run IS the reference side)
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       set Reseller = the Bronze reseller and Distributor = the distributor
 *         -> Expected: Reseller Discount (%) = 15; Distributor Discount (%) = 20
 *    2. On Order Lines, add O365-SUB-5Y with Ordered Qty 350, Unit Price 40.90 and Discount (%) 5
 *    3. Pick Deal registration and click Save
 *         -> Expected: Reward = -1,360.10; Total = 7,955.45; Total in Company Currency is shown
 *    4. Repeat steps 1 to 3 on the reference system with the same data and compare
 *         -> On pre-production this run IS the reference system: nothing to compare here. The step prints every
 *            amount (Total in Company Currency included) as the record the crm-mig run is compared against.
 * ================================================================================================
 */

const TC = 'Discount_2.7';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a user in Sales / Editing Manager (Max Zaprykutenko)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_EUR',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller and Distributor = the distributor',
  s2: 'Step 2: On Order Lines, add O365-SUB-5Y with Ordered Qty 350, Unit Price 40.90 and Discount (%) 5',
  s3: 'Step 3: Pick Deal registration and click Save',
  s4: 'Step 4: [REFERENCE SIDE - this run is the reference system] Repeat steps 1 to 3 on the reference system with the same data and compare',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const EDITING_MANAGER = users.manager_max;

test.describe(`${TC} - EUR order with a line discount and a 35 % partner discount (pre-prod baseline of CRM-12144_2.7)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: EUR order with a line discount and a 35 % partner discount`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const amounts: Record<string, string> = {};

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${EDITING_MANAGER.username} (${EDITING_MANAGER.displayName})`);
      await signIn(page, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the Editing Manager');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, EDITING_MANAGER, DISCOUNT_BASELINE.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - EUR company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      console.log(`  - Reseller    = ${DISCOUNT_PARTNERS.bronze}`);
      console.log(`  - Distributor = ${DISCOUNT_PARTNERS.distributor}`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
      await dealElementPage.setDistributor(DISCOUNT_PARTNERS.distributor);
      const rPct = await dealElementPage.getVisibleFieldValue('reseller_discount');
      const dPct = await dealElementPage.getVisibleFieldValue('distributor_discount');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - Reseller Discount (%)', expected: '15', actual: rPct, passed: money(rPct) === 15 },
        { what: 'Step 1 - Distributor Discount (%)', expected: '20', actual: dPct, passed: money(dPct) === 20 },
      ], `${TC} - Step 1 partner discounts`, ["[name='reseller_discount']:not(.o_invisible_modifier)", "[name='distributor_discount']:not(.o_invisible_modifier)"]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Product     = O365-SUB-5Y`);
      console.log(`  - Ordered Qty = 350`);
      console.log(`  - Unit Price  = 40.90`);
      console.log(`  - Discount(%) = 5`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.subscriptionProduct, 350);
      await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.subscriptionProduct, 40.9);
      await dealElementPage.blurForm();
      await dealElementPage.setLineDiscount(DISCOUNT_BASELINE.subscriptionProduct, 5);
      await dealElementPage.blurForm();
      const row = await dealElementPage.getOrderLineRowCells(0);
      console.log(`  - line: Unit Price ${row['Unit Price']} | Discount (%) ${row['Discount (%)']} | Subtotal ${row['Subtotal']}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      for (const f of ['discount', 'discount_money', 'amount_untaxed', 'amount_tax', 'amount_total']) amounts[f] = await dealElementPage.getSubtotalFooterValue(f);
      amounts['amount_total_company_signed'] = await dealElementPage.getVisibleFieldValue('amount_total_company_signed');
      amounts['reward'] = rewards[0]?.['Unit Price'] ?? '';
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Reward', expected: '-1,360.10', actual: amounts['reward'] || '(none)', passed: rewards.length === 1 && money(amounts['reward']) === -1360.1 },
        { what: 'Step 3 - Total', expected: '7,955.45', actual: amounts['amount_total'], passed: money(amounts['amount_total']) === 7955.45 },
        { what: 'Step 3 - Total in Company Currency is shown', expected: 'a non-empty amount', actual: amounts['amount_total_company_signed'] || '(empty)', passed: !Number.isNaN(money(amounts['amount_total_company_signed'])) },
      ], `${TC} - Step 3 EUR amounts to the cent`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals, "[name='amount_total_company_signed']"]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - EUR order with Deal registration saved');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log('  This run is on the reference system itself. Amounts recorded for the crm-mig comparison:');
      for (const [k, v] of Object.entries(amounts)) console.log(`    - ${k.padEnd(28)} = ${v}`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
