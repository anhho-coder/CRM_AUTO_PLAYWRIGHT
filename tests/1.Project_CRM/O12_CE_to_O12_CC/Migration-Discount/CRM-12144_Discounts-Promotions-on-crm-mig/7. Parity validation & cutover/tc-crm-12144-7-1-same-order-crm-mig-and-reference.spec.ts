import { Page, TestInfo, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig } from '@pages/mig';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  sameCents,
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
 *  CRM-12144_7.1 - Build the same order on crm-mig and on the reference system   (crm-mig only)
 * ================================================================================================
 * Test Case ID     : CRM-12144_7.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 63, Jira link empty)
 * Automation-Type  : refactored (2026-10-23: every pre-production step removed - see "Removed" below)
 * Automation-Date  : 2026-10-23
 * Un-skipped       : 2026-10-27 - CRM-13823 + CRM-13830 both Resolved. History - skipped 2026-10-23 by both bugs,
 *                    red at the (now removed) Step 4 comparison:
 *                    - CRM-13823 (crm-mig currency rates not updated since 2026-10-13): Total in Company Currency
 *                      crm-mig 1,454.09 vs reference 1,457.21 on 23-10
 *                    - CRM-13830 (crm-mig offers [PRM-Q319-ASUSTOR] - its Attribution quotes Nathan: "crm-mig offers
 *                      it on every order"): the Promotion list carries ASUSTOR, the reference does not
 *                    Tester 2026-10-23: the skip stays after the pre-production steps were removed, although no check
 *                    left in this spec reads either difference. Remove the test.skip below only once BOTH are fixed
 * Baseline         : Discount_7.1 (Jira CRM-13804; tests/1.Project_CRM/10.Sales_Module/Discount/7. Parity validation & cutover/
 *                    tc-discount-7-1-same-order-crm-mig-and-reference.spec.ts) - run it on its own for the reference side
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0092
 * Source version   : master row CRM-12144_7.1 as updated 2026-10-23 (reference steps removed) - re-check before trusting this spec
 * Host             : crm-mig only (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig, Sales / User: Own Documents Only)
 *
 * Removed - pre-production reference (tester 2026-10-23: pre-production will be shut down)
 * -----------------------------------------------------------------------------------------
 * The old master row's Pre-conditions 2 and 5, Step 3 and Step 4 drove or compared with the reference system; they were
 * removed from this spec AND from the master row (2026-10-23), and the pre-conditions renumbered (old 3, 4 -> 2, 3).
 * The reference half lives only in the baseline spec, run on demand while pre-production is up:
 *   npx playwright test --grep "Discount_7\.1:" --project=chromium
 *
 * Summary
 * -------
 * On crm-mig the order A2144B x 5 with Deal registration (EUR pricelist) is built: the Promotion list offers Deal
 * registration, exactly one reward line of -10% of the line Subtotal, and Total and Total in Company Currency shown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_7\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_7.1, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: Build the same order on crm-mig and on the reference system (IS-CRM-FUNC-0092)
 *  Priority: P1 | Spec Areas: 0092 - same result both sides
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *       (e.g. Thomas Semerich)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist_EUR (EUR)
 *    3. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    Note (2026-10-23): the reference-system steps were removed - pre-production will be shut down; the reference side
 *    stays in baseline Discount_7.1 (CRM-13804), run on demand
 *  Executed Steps
 *    1. On crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list (Qty 5, changed from 4 on
 *       2026-10-21: on Public Pricelist_EUR A2144B is 289.00, so 4 x 289.00 = 1,156.00 EUR stays below the 1,400 USD
 *       minimum converted to EUR and Deal registration is not offered; 5 x 289.00 = 1,445.00 EUR reaches it)
 *    2. Pick Deal registration and click Save
 *  Expected Results
 *    1. The Promotion list contains Deal registration
 *    2. One reward line; Reward = -10% of the A2144B line Subtotal; Total and Total in Company Currency are shown
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; DealElementPageMig for the crm-mig Order Lines.
 *  Steps 1-2 keep the baseline's own checks.
 * ================================================================================================
 */

const TC = 'CRM-12144_7.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_EUR (EUR)',
  pre3: 'Pre-condition 3: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: On crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion list (Qty 5, changed from 4 on 2026-10-21)',
  s2: 'Step 2: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

type Values = Record<string, string>;

/** Steps 1 (line) - add A2144B x 5 and read its Subtotal. */
async function lineStep(de: DealElementPage, tag: string, out: Values): Promise<void> {
  await de.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5); // tester 2026-10-21: 4 -> 5 (4 x 289.00 EUR is below the minimum)
  await de.blurForm();
  const line = await de.getOrderLineRowCells(0);
  out['A2144B line Subtotal'] = line['Subtotal'] ?? '';
  console.log(`  - [${tag}] A2144B x 5 line Subtotal : ${out['A2144B line Subtotal'] || '(empty)'}`);
}

/** Step 1 (list) - the Promotion list at Qty 5: the baseline's assertion. */
async function promotionStep(p: Page, de: DealElementPage, testInfo: TestInfo, checks: Check[], tag: string, out: Values): Promise<void> {
  const options = await de.getPromotionOptions('', { keepOpen: true });
  out['Promotion list'] = [...options].sort().join(' | ');
  console.log(`  - [${tag}] Promotion list : ${options.join(' | ') || '(empty)'}`);
  await recordChecks(p, testInfo, checks, [
    {
      what: `${tag} - Step 1 - the Promotion list contains Deal registration`,
      expected: DISCOUNT_MIG.dealRegistration,
      actual: options.length ? options.join(' | ') : '(empty list)',
      passed: options.includes(DISCOUNT_MIG.dealRegistration),
    },
  ], `${TC} - ${tag} Step 1 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
  await de.closePromotionList();
}

/** Step 2 - Deal registration, Save, then the reward, the Total and the Total in Company Currency. */
async function rewardStep(p: Page, de: DealElementPage, run: DiscountRun, testInfo: TestInfo, checks: Check[], tag: string, out: Values): Promise<void> {
  // setPromotion falls back to Enter when the dropdown is slow and still reports success (seen 2026-10-23: a Deal
  // Element saved with an empty Promotion) - read the field back, pick once more if empty, stop if still empty
  await de.setPromotion('Deal registration');
  if (!/deal registration/i.test(await de.getAppliedPromotionName())) {
    console.log(`  ⚠ [${tag}] Promotion is still empty after the pick - picking Deal registration once more`);
    await de.setPromotion('Deal registration');
    const picked = await de.getAppliedPromotionName();
    if (!/deal registration/i.test(picked)) throw new Error(`${tag} - Step 2: Deal registration could not be picked in Promotion (field reads "${picked}")`);
  }
  await saveDealElement(p, run);
  const rewards = rewardRows(await de.getAllOrderLineRows());
  const reward = rewards[0]?.['Unit Price'] ?? '';
  const subtotal = money(out['A2144B line Subtotal']);
  const expectedReward = -Math.round(subtotal * 10) / 100;
  out['reward amount'] = reward || '(none)';
  out['reward %'] = reward && subtotal ? `${((-money(reward) / subtotal) * 100).toFixed(2)} %` : '(n/a)';
  out['Total'] = await de.getSubtotalFooterValue('amount_total');
  out['Total in Company Currency'] = await de.getVisibleFieldValue('amount_total_company_signed');
  console.log(`  - [${tag}] reward amount : ${out['reward amount']} (reward lines: ${rewards.length})`);
  console.log(`  - [${tag}] reward %      : ${out['reward %']}`);
  console.log(`  - [${tag}] Total         : ${out['Total'] || '(empty)'}`);
  console.log(`  - [${tag}] Total in Company Currency : ${out['Total in Company Currency'] || '(empty)'}`);
  await recordChecks(p, testInfo, checks, [
    { what: `${tag} - Step 2 - exactly one reward line`, expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
    {
      what: `${tag} - Step 2 - reward = -10% of the A2144B line Subtotal`,
      expected: `${expectedReward.toFixed(2)} (10% of ${out['A2144B line Subtotal']})`,
      actual: reward || '(none)',
      passed: rewards.length === 1 && sameCents(money(reward), expectedReward),
    },
    { what: `${tag} - Step 2 - Total is shown`, expected: 'a non-empty amount', actual: out['Total'] || '(empty)', passed: !Number.isNaN(money(out['Total'])) },
    { what: `${tag} - Step 2 - Total in Company Currency is shown`, expected: 'a non-empty amount', actual: out['Total in Company Currency'] || '(empty)', passed: !Number.isNaN(money(out['Total in Company Currency'])) },
  ], `${TC} - ${tag} Step 2 reward and totals`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
  await CommonUtils.captureAndAttachScreenshot(p, testInfo, `${tag} - Steps 1-2 - Deal registration saved`);
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Same order on crm-mig and on the reference system (crm-mig only - reference steps removed)`, () => {
  let created: DiscountRun[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    const errors: string[] = [];
    if (!SKIP_CLEANUP) {
      for (const run of created) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (errors.length) throw new Error(errors.join(' | '));
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Build the same order on crm-mig and on the reference system`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const crm: Values = {};

    const newRun = (): DiscountRun => {
      const run = newDiscountRun();
      created.push(run);
      runs.push(run);
      return run;
    };
    const run = newRun();

    // ================= Pre-conditions (crm-mig) =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - EUR company created on crm-mig');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created on crm-mig');
    });

    // ================= Steps 1-2 (crm-mig) =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await lineStep(dealElementPage, 'crm-mig', crm);
      await promotionStep(page, dealElementPage, testInfo, checks, 'crm-mig', crm);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Promotion list open on crm-mig');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await rewardStep(page, dealElementPage, run, testInfo, checks, 'crm-mig', crm);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
