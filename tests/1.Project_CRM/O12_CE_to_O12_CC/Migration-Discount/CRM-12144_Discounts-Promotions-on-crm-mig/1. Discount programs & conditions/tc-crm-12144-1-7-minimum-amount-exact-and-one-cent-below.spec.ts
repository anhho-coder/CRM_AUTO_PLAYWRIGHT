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
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.7 - Order exactly at the 1,400.00 USD minimum and one cent below it   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.7
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 24, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.7 (Jira CRM-13770; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-7-minimum-amount-exact-and-one-cent-below.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-05
 * Source version   : master row CRM-12144_1.7 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / Editing Manager - the only group that can edit Unit Price (Max Zaprykutenko, users.manager_max_crm_mig)
 *
 * Summary
 * -------
 * A2144B x 4 at 350.00 (Subtotal exactly 1,400.00) is offered Deal registration (Reward -140.00, Total 1,260.00);
 * with Promotion cleared and the price at 349.99 (Subtotal 1,399.96) the program is no longer offered.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.7:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.7, master "Migration - Discount" row 24, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Order exactly at the 1,400.00 USD minimum and one cent below it (IS-CRM-FUNC-0074-05)
 *  Priority: P1 | Spec Areas: 0074-05 - = 1,400.00 USD
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price)
 *      Create a new company in Contacts with:
 *        _ Name = Disc-Cust-<timestamp>
 *        _ Type = end customer (no Reseller, no Distributor)
 *        _ Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with:
 *        _ Name = Disc-Opp-<timestamp>
 *        _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 4 and Unit Price 350.00
 *    3. Open the Promotion list
 *    4. Pick Deal registration and click Save
 *    5. Clear Promotion, click Save, then change Unit Price to 349.99
 *    6. Open the Promotion list
 *
 *  Expected Results:
 *    2. Subtotal = 1,400.00
 *    3. The list contains Deal registration
 *    4. Reward = -140.00; Total = 1,260.00
 *    5. Subtotal = 1,399.96
 *    6. The list does not contain Deal registration
 *
 *  Port notes: users.manager_max_crm_mig (Sales / Editing Manager); company (pricelist Public Pricelist_USD) and
 *  opportunity through the Mig helpers; DealElementPageMig; printVerifyAndAssertMig; teardown + afterAll sweep by run.
 *  No baseline assertion or expected value changed.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.7';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 4 and Unit Price 350.00',
  s3: 'Step 3: Open the Promotion list',
  s4: 'Step 4: Pick Deal registration and click Save',
  s5: 'Step 5: Clear Promotion, click Save, then change Unit Price to 349.99',
  s6: 'Step 6: Open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITING_MANAGER = users.manager_max_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Order exactly at the 1,400.00 USD minimum and one cent below it (crm-mig)`, () => {
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

  test(`${TC}: Order exactly at the 1,400.00 USD minimum and one cent below it`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${EDITING_MANAGER.username} (${EDITING_MANAGER.displayName})`);
      await signInMig(page, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the Editing Manager');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
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
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 4);
      await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, 350);
      await dealElementPage.blurForm();
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,400.00');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - A2144B x 4 at 350.00 line Subtotal', expected: '1,400.00', actual: subtotal, passed: money(subtotal) === 1400 },
      ], `${TC} - Step 2 subtotal at the minimum`, [DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 3 - the Promotion list contains Deal registration',
          expected: DISCOUNT_MIG.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 3 Promotion list at 1,400.00`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - Reward', expected: '-140.00', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && money(rewards[0]['Unit Price']) === -140 },
        { what: 'Step 4 - Total', expected: '1,260.00', actual: total, passed: money(total) === 1260 },
      ], `${TC} - Step 4 reward at the minimum`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-4 - Deal registration at exactly 1,400.00');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await dealElementPage.clickEdit();
      await dealElementPage.clearPromotion();
      await saveDealElement(page, run);
      console.log(`  - Promotion after Save : ${(await dealElementPage.getAppliedPromotionName()) || '(empty)'}`);
      console.log(`  - Reward lines after Save : ${rewardRows(await dealElementPage.getAllOrderLineRows()).length}`);
      await dealElementPage.clickEdit();
      await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, 349.99);
      await dealElementPage.blurForm();
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,399.96');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - A2144B x 4 at 349.99 line Subtotal', expected: '1,399.96', actual: subtotal, passed: money(subtotal) === 1399.96 },
      ], `${TC} - Step 5 subtotal one cent per unit below`, [DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 6 - the Promotion list does not contain Deal registration',
          expected: `not listed: ${DISCOUNT_MIG.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 6 Promotion list at 1,399.96`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 5-6 - 1,399.96, Deal registration not offered');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
