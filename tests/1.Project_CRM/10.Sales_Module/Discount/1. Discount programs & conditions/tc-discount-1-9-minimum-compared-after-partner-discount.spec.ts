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
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.9 - Compare the minimum with an order whose amount drops below 1,400.00 after the partner discount
 *                 (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.9
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_1.9 (crm-mig manual TC, master "Migration - Discount" row 26) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-05, IS-CRM-FUNC-0098
 * Source version   : master row CRM-12144_1.9 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 * Bronze reseller  : Bailey Systems (res.partner 13512, Level Bronze, Partner Discount 15.0)
 *
 * Summary
 * -------
 * With a Bronze reseller (15 %), A2144B x 5 (1,645.00, Total 1,398.25 after the partner discount) is not offered Deal
 * registration; at x 6 (Total 1,677.90) it is - the minimum is compared after the partner discount.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.9:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.9, adapted to the reference system)
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
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
 *    3. CRM > Pipeline (LIST view) > Create a new opportunity:
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *    4. Use an existing Bronze reseller (Level = Bronze, 15 %) = Bailey Systems
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. Set Reseller = the Bronze reseller
 *         -> Expected: Reseller Discount (%) = 15
 *    3. On Order Lines, add A2144B with Ordered Qty 5 (Unit Price 329.00)
 *         -> Expected: Subtotal = 1,645.00; Total = 1,398.25
 *    4. Open the Promotion list
 *         -> Expected: the list does not contain Deal registration
 *    5. Change Ordered Qty to 6 and open the Promotion list
 *         -> Expected: Total = 1,677.90; the list contains Deal registration
 * ================================================================================================
 */

const TC = 'Discount_1.9';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: Set Reseller = the Bronze reseller',
  s3: 'Step 3: On Order Lines, add A2144B with Ordered Qty 5 (Unit Price 329.00)',
  s4: 'Step 4: Open the Promotion list',
  s5: 'Step 5: Change Ordered Qty to 6 and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Compare the minimum with an order whose amount drops below 1,400.00 after the partner discount (pre-prod baseline of CRM-12144_1.9)`, () => {
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

  test(`${TC}: Compare the minimum with an order whose amount drops below 1,400.00 after the partner discount`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];

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
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Reseller = ${DISCOUNT_PARTNERS.bronze}`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
      const pct = await dealElementPage.getVisibleFieldValue('reseller_discount');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - Reseller Discount (%)', expected: '15', actual: pct, passed: money(pct) === 15 },
      ], `${TC} - Step 2 Bronze reseller discount`, ["div[name='reseller_id']", "[name='reseller_discount']:not(.o_invisible_modifier)"]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.blurForm();
      const row = await dealElementPage.getOrderLineRowCells(0);
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - line Unit Price ${row['Unit Price']} | Subtotal before discount ${row['Subtotal before discount']} | Subtotal After All Discounts ${row['Subtotal After All Discounts']} | Subtotal ${row['Subtotal']}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - A2144B Unit Price', expected: '329.00', actual: row['Unit Price'] ?? '', passed: money(row['Unit Price'] ?? '') === 329 },
        { what: 'Step 3 - A2144B x 5 line Subtotal', expected: '1,645.00', actual: row['Subtotal'] ?? '', passed: money(row['Subtotal'] ?? '') === 1645 },
        { what: 'Step 3 - Total after the 15 % partner discount', expected: '1,398.25', actual: total, passed: money(total) === 1398.25 },
      ], `${TC} - Step 3 amounts at qty 5`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 4 - the Promotion list does not contain Deal registration (Total 1,398.25 < 1,400.00)',
          expected: `not listed: ${DISCOUNT_BASELINE.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 4 Promotion list at 1,398.25`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-4 - Bronze reseller, qty 5, not offered');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.changeQtyInRow(DISCOUNT_BASELINE.listedProduct, 6);
      await dealElementPage.blurForm();
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Total at qty 6 after the 15 % partner discount', expected: '1,677.90', actual: total, passed: money(total) === 1677.9 },
        {
          what: 'Step 5 - the Promotion list contains Deal registration',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 5 Promotion list at 1,677.90`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - qty 6, Deal registration offered');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
