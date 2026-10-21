import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage } from '@pages';
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
 *  Discount_1.12 - Lower the price of an order that carries Deal registration just below the minimum
 *                  (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.12
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_1.12 (crm-mig manual TC, master "Migration - Discount" row 29) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0075, IS-CRM-FUNC-0074-05
 * Source version   : master row CRM-12144_1.12 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Sales / Editing Manager - the only group that can edit Unit Price (Max Zaprykutenko, users.manager_max)
 * Bronze reseller  : Bailey Systems (res.partner 13512, Level Bronze, Partner Discount 15.0)
 *
 * Summary
 * -------
 * Bronze reseller, A2144B x 4 at 412.00 (1,400.80 after 15 %) takes Deal registration; lowering the price to 411.50
 * keeps it (Reward -164.60); a second order built directly at 411.50 (1,399.10) is not offered the program.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.12:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.12, adapted to the reference system)
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
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
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
 *    4. CRM > Pipeline (LIST view) > Create a new opportunity, same fields with:
 *         - Name         = Disc-Opp2-<timestamp>
 *    5. Use an existing Bronze reseller (Level = Bronze, 15 %) = Bailey Systems
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       set Reseller = the Bronze reseller
 *    2. On Order Lines, add A2144B with Ordered Qty 4 and Unit Price 412.00; open the Promotion list
 *         -> Expected: the list contains Deal registration (1,648.00 x 0.85 = 1,400.80)
 *    3. Pick Deal registration and click Save
 *         -> Expected: Reward = -164.80; Total = 1,260.72
 *    4. Change Unit Price to 411.50 and click Save (EDIT first - the saved Deal Element is read-only)
 *         -> Expected: Deal registration is kept; Reward = -164.60; Total = 1,259.19
 *    5. Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, set Reseller = the Bronze reseller, add A2144B with Ordered
 *       Qty 4 and Unit Price 411.50, and open the Promotion list
 *         -> Expected: the list does not contain Deal registration (1,399.10)
 * ================================================================================================
 */

const TC = 'Discount_1.12';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a user in Sales / Editing Manager (Max Zaprykutenko)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  pre4: 'Pre-condition 4: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp2-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 4 and Unit Price 412.00; open the Promotion list',
  s3: 'Step 3: Pick Deal registration and click Save',
  s4: 'Step 4: Change Unit Price to 411.50 and click Save',
  s5: 'Step 5: Open Disc-Opp2-<timestamp>, click DEAL ELEMENT, set Reseller = the Bronze reseller, add A2144B with Ordered Qty 4 and Unit Price 411.50, and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const EDITING_MANAGER = users.manager_max;

test.describe(`${TC} - Lower the price of an order that carries Deal registration just below the minimum (pre-prod baseline of CRM-12144_1.12)`, () => {
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

  test(`${TC}: Lower the price of an order that carries Deal registration just below the minimum`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const opp2Name = `Disc-Opp2-${run.ts}`;
    let opp2Url = '';

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
      await createEndCustomerCompany(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      opp2Url = await createOpportunityForCompany(page, run, EDITING_MANAGER, { name: opp2Name });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - second opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
      console.log(`  - Reseller = ${DISCOUNT_PARTNERS.bronze}`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
      console.log(`  - Reseller Discount (%) : ${await dealElementPage.getVisibleFieldValue('reseller_discount')}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 4);
      await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, 412);
      await dealElementPage.blurForm();
      console.log(`  - Total : ${await dealElementPage.getSubtotalFooterValue('amount_total')}`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 - the Promotion list contains Deal registration (1,648.00 x 0.85 = 1,400.80)',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 2 Promotion list at 1,400.80`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Reward', expected: '-164.80', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && money(rewards[0]['Unit Price']) === -164.8 },
        { what: 'Step 3 - Total', expected: '1,260.72', actual: total, passed: money(total) === 1260.72 },
      ], `${TC} - Step 3 reward at 412.00`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration at 412.00');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.clickEdit();
      await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, 411.5);
      await dealElementPage.blurForm();
      await saveDealElement(page, run);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Deal registration is kept', expected: DISCOUNT_BASELINE.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_BASELINE.dealRegistration },
        { what: 'Step 4 - Reward', expected: '-164.60', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && money(rewards[0]['Unit Price']) === -164.6 },
        { what: 'Step 4 - Total', expected: '1,259.19', actual: total, passed: money(total) === 1259.19 },
      ], `${TC} - Step 4 kept at 411.50`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - price 411.50, Deal registration kept');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await opportunityPage.openByUrlReloaded(opp2Url);
      await openDealElementFromOpportunity(page);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 4);
      await dealElementPage.setLineUnitPrice(DISCOUNT_BASELINE.listedProduct, 411.5);
      await dealElementPage.blurForm();
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Total on ${opp2Name} : ${total}`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Total of the second order (1,646.00 x 0.85)', expected: '1,399.10', actual: total, passed: money(total) === 1399.1 },
        {
          what: 'Step 5 - the Promotion list does not contain Deal registration',
          expected: `not listed: ${DISCOUNT_BASELINE.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_BASELINE.dealRegistration),
        },
      ], `${TC} - Step 5 second order at 1,399.10`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - second order at 411.50, not offered');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
