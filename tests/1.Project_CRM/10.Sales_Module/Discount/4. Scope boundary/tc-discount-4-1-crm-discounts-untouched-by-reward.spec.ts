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
 *  Discount_4.1 - Pick Deal registration on an order with a pricelist price, a line discount and a partner discount
 *                 (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_4.1
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_4.1 (crm-mig manual TC, master "Migration - Discount" row 48) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0084
 * Source version   : master row CRM-12144_4.1 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max) - the TC's pre-condition role
 * Bronze reseller  : Bailey Systems (res.partner 13512, Level Bronze, Partner Discount 15.0)
 *
 * Summary
 * -------
 * On a EUR order with a Bronze reseller and a 5 % line discount, picking Deal registration leaves Unit Price,
 * Discount (%) and Reseller Discount (%) as they were; the only new order line is the reward line.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_4\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_4.1, adapted to the reference system)
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
 *         - Pricelist   = Public Pricelist_EUR   (crm-mig: "Public Pricelist_EUR (EUR)"; on pre-prod that label is a
 *                         USD list, so the EUR-currency list "Public Pricelist_EUR" is picked by exact name)
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
 *    4. Use an existing Bronze reseller (15 %) = Bailey Systems
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       set Reseller = the Bronze reseller
 *    2. On Order Lines, add A2144B with Ordered Qty 6 and Discount (%) 5; note Unit Price, Discount (%) and
 *       Reseller Discount (%)
 *    3. Pick Deal registration and click Save
 *         -> Expected: Unit Price, Discount (%) and Reseller Discount (%) are unchanged; the only new line is the
 *            reward line
 * ================================================================================================
 */

const TC = 'Discount_4.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a user in Sales / Editing Manager (Max Zaprykutenko)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_EUR',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 6 and Discount (%) 5; note Unit Price, Discount (%) and Reseller Discount (%)',
  s3: 'Step 3: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const EDITING_MANAGER = users.manager_max;

test.describe(`${TC} - Pick Deal registration on an order with a pricelist price, a line discount and a partner discount (pre-prod baseline of CRM-12144_4.1)`, () => {
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

  test(`${TC}: Pick Deal registration on an order with a pricelist price, a line discount and a partner discount`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const noted = { unitPrice: '', discount: '', resellerDiscount: '', lines: 0 };

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
      console.log(`  - Reseller = ${DISCOUNT_PARTNERS.bronze}`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 6);
      await dealElementPage.setLineDiscount(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.blurForm();
      const row = await dealElementPage.getOrderLineRowCells(0);
      noted.unitPrice = row['Unit Price'] ?? '';
      noted.discount = row['Discount (%)'] ?? '';
      noted.resellerDiscount = await dealElementPage.getVisibleFieldValue('reseller_discount');
      noted.lines = (await dealElementPage.getAllOrderLineRows()).length;
      console.log(`  - Noted Unit Price            : ${noted.unitPrice}`);
      console.log(`  - Noted Discount (%)          : ${noted.discount}`);
      console.log(`  - Noted Reseller Discount (%) : ${noted.resellerDiscount}`);
      console.log(`  - Order lines                 : ${noted.lines}`);
      console.log(`  - Pricelist                   : ${await dealElementPage.getPricelistValue()}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rows = await dealElementPage.getAllOrderLineRows();
      const product = rows.find((r) => (r['Product'] ?? '').includes('A2144B')) ?? {};
      const rewards = rewardRows(rows);
      const resellerDiscount = await dealElementPage.getVisibleFieldValue('reseller_discount');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Unit Price unchanged', expected: noted.unitPrice, actual: product['Unit Price'] ?? '(no A2144B line)', passed: noted.unitPrice !== '' && product['Unit Price'] === noted.unitPrice },
        { what: 'Step 3 - Discount (%) unchanged', expected: noted.discount, actual: product['Discount (%)'] ?? '(no A2144B line)', passed: noted.discount !== '' && product['Discount (%)'] === noted.discount },
        { what: 'Step 3 - Reseller Discount (%) unchanged', expected: noted.resellerDiscount, actual: resellerDiscount, passed: noted.resellerDiscount !== '' && resellerDiscount === noted.resellerDiscount },
        { what: 'Step 3 - exactly one new order line', expected: String(noted.lines + 1), actual: String(rows.length), passed: rows.length === noted.lines + 1 },
        { what: 'Step 3 - the new line is the reward line', expected: `1 x ${DISCOUNT_BASELINE.dealRegistrationProduct}`, actual: `${rewards.length} reward line(s)`, passed: rewards.length === 1 },
      ], `${TC} - Step 3 CRM discounts untouched`, [DISCOUNT_HIGHLIGHT.orderLines, "[name='reseller_discount']:not(.o_invisible_modifier)"]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration on top of the CRM discounts');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
