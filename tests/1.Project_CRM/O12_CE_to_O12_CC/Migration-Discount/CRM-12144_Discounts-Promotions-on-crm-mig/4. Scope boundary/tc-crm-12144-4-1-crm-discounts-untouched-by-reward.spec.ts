import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
  DiscountRun,
  Check,
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
 *  CRM-12144_4.1 - Pick Deal registration on an order with a pricelist price, a line discount and a partner
 *                  discount   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_4.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 48, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_4.1 (Jira CRM-13791; tests/1.Project_CRM/10.Sales_Module/Discount/4. Scope boundary/
 *                    tc-discount-4-1-crm-discounts-untouched-by-reward.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0084
 * Source version   : master row CRM-12144_4.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max_crm_mig) - the TC's pre-condition role
 * Bronze reseller  : Bailey Systems (res.partner 13512 on pre-production, Level Bronze, Partner Discount 15.0 - same
 *                    partner on crm-mig)
 *
 * Summary
 * -------
 * On a EUR order with a Bronze reseller and a 5 % line discount, picking Deal registration leaves Unit Price,
 * Discount (%) and Reseller Discount (%) as they were; the only new order line is the reward line.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_4\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_4.1, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist_EUR (EUR)
 *       [automation data, same as the baseline]
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Max Zaprykutenko
 *    3. Create a new opportunity in CRM > Pipeline with (LIST view - the kanban quick-create card lacks these fields):
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    4. Use an existing Bronze reseller (15 %); ask the development team if none is found
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller
 *    2. On Order Lines, add A2144B with Ordered Qty 6 and Discount (%) 5; note Unit Price, Discount (%) and Reseller Discount (%)
 *    3. Pick Deal registration and click Save
 *  Expected Results
 *    3. Unit Price, Discount (%) and Reseller Discount (%) are unchanged; the only new line is the reward line
 *
 *  Port notes : accounts *_crm_mig (manager_max_crm_mig = Editing Manager); Mig helpers and Mig order-line reader;
 *               the EUR list is picked by its exact name, Public Pricelist_EUR (shown "Public Pricelist_EUR (EUR)").
 * ================================================================================================
 */

const TC = 'CRM-12144_4.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price) (Max Zaprykutenko)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_EUR (EUR)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 6 and Discount (%) 5; note Unit Price, Discount (%) and Reseller Discount (%)',
  s3: 'Step 3: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITING_MANAGER = users.manager_max_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Pick Deal registration on an order with a pricelist price, a line discount and a partner discount (crm-mig)`, () => {
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

  test(`${TC}: Pick Deal registration on an order with a pricelist price, a line discount and a partner discount`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const noted = { unitPrice: '', discount: '', resellerDiscount: '', lines: 0 };

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${EDITING_MANAGER.username} (${EDITING_MANAGER.displayName})`);
      await signInMig(page, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the Editing Manager');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, EDITING_MANAGER, DISCOUNT_MIG.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - EUR company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, EDITING_MANAGER);
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 6);
      await dealElementPage.setLineDiscount(DISCOUNT_MIG.listedProduct, 5);
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
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
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
        { what: 'Step 3 - the new line is the reward line', expected: `1 x ${DISCOUNT_MIG.dealRegistrationProduct}`, actual: `${rewards.length} reward line(s)`, passed: rewards.length === 1 },
      ], `${TC} - Step 3 CRM discounts untouched`, [DISCOUNT_HIGHLIGHT.orderLines, "[name='reseller_discount']:not(.o_invisible_modifier)"]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration on top of the CRM discounts');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
