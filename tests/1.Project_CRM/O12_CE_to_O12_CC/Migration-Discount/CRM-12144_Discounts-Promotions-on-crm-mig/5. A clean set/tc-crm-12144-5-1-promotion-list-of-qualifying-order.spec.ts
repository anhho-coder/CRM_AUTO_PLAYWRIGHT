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
 *  CRM-12144_5.1 - Open the Promotion list of a qualifying new order   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_5.1
 * Jira             : CRM-12295 (master "Migration - Discount" row 55)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Revised          : 2026-11-03 - spec v7 re-sync (CRM-13848 B4, Aiva 2026-11-03): IS-CRM-FUNC-0085 adds "Enabled
 *                    programs past their validity window are carried over as ended (IS-CRM-FUNC-0086-1)"; the audit is
 *                    delivered (Discounts Program Audit v2, 29 Oct 2026): the one program it marks as operating is PROG1
 *                    Deal registration - Step 2's "exactly" is now scored against that set (was BLOCKED)
 * Baseline         : Discount_5.1 (Jira CRM-13793; tests/1.Project_CRM/10.Sales_Module/Discount/5. A clean set/
 *                    tc-discount-5-1-promotion-list-of-qualifying-order.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v7, page 222532591 - IS-CRM-FUNC-0085, IS-CRM-FUNC-0086-1
 * Source version   : Jira CRM-12295 / master row 55 as re-synced to spec v7 on 2026-11-03 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Audit data (Discounts Program Audit v2, 29 Oct 2026, Nathan Do on CRM-12144): "Only one of them still operates: Deal
 * registration (PROG1). The other 15 keep their records and their history, but their validity windows have ended, so no
 * new order can qualify for them." - AUDIT_OPERATING below.
 *
 * Summary
 * -------
 * The Promotion list of a new order with A2144B x 5 holds exactly "Deal registration promotion, 10% on Product, Support
 * Services do not qualify" (the audit's one operating program); picking it gives a reward of -164.50.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_5\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.1, master "Migration - Discount")
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
 *    4. Have the migration audit from the development team: Discounts Program Audit v2 (29 Oct 2026, attached to CRM-12144)
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list
 *    3. Pick Deal registration and click Save
 *  Expected Results
 *    2. The list holds exactly the one program the audit marks as operating, "Deal registration promotion, 10% on Product,
 *       Support Services do not qualify"; none of the 15 programs the audit carries over as expired is listed
 *       (IS-CRM-FUNC-0085, IS-CRM-FUNC-0086-1)
 *    3. The reward is 10% of the listed product line (-164.50): the program's configuration is intact
 *
 *  Port notes : accounts *_crm_mig; Mig helpers and Mig order-line reader. The baseline's "includes Deal registration"
 *  check is kept; the "exactly" check is crm-mig's (the audit exists only for the migration).
 * ================================================================================================
 */

const TC = 'CRM-12144_5.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre4: 'Pre-condition 4: Have the migration audit from the development team: Discounts Program Audit v2 (29 Oct 2026, attached to CRM-12144)',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5 and open the Promotion list',
  s3: 'Step 3: Pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
/** Discounts Program Audit v2 (29 Oct 2026): the programs a new order can qualify for - "Only one of them still operates". */
const AUDIT_OPERATING: string[] = [DISCOUNT_MIG.dealRegistration];
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Promotion list of a qualifying new order (crm-mig)`, () => {
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

  test(`${TC}: Promotion list of a qualifying new order`, baselineDetails(TC), async ({ page }, testInfo) => {
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

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log('  - Source    : "Discounts Program Audit.pdf" v2 (last updated 29 Oct 2026), Nathan Do, attached to CRM-12144 on 2026-10-30');
      console.log(`  - Operating : ${AUDIT_OPERATING.join(' | ')} (PROG1 - "It is the only program a new order can qualify for")`);
      console.log('  - Carried over as expired (never offered on a new order): 15 programs, Trade-in Promotion 5% included');
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
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  Promotion list crm-mig offers (${options.length} entries):`);
      options.forEach((o, i) => console.log(`    ${i + 1}. ${o}`));
      const extra = options.filter((o) => !AUDIT_OPERATING.includes(o));
      const missing = AUDIT_OPERATING.filter((o) => !options.includes(o));
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 2 - the Promotion list includes the Deal registration program',
          expected: DISCOUNT_MIG.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
        {
          what: 'Step 2 - the Promotion list holds exactly the program(s) the audit marks as operating (IS-CRM-FUNC-0085, IS-CRM-FUNC-0086-1)',
          expected: `exactly ${AUDIT_OPERATING.length} entry: ${AUDIT_OPERATING.join(' | ')} (any other entry is a FAIL - an expired program carried over as ended must never apply to a new order, and a program the audit does not name is not part of the carried-over set)`,
          actual: `${options.length} entr${options.length === 1 ? 'y' : 'ies'}: ${options.join(' | ') || '(empty list)'}${extra.length ? ` - not in the audit's operating set: ${extra.join(' | ')}` : ''}${missing.length ? ` - missing: ${missing.join(' | ')}` : ''}`,
          passed: extra.length === 0 && missing.length === 0,
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion list open');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      const lineSubtotal = await dealElementPage.getOrderLineRowCells(0).then((r) => r['Subtotal'] ?? '');
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const reward = rewards[0]?.['Unit Price'] ?? '';
      const expectedReward = -Math.round(money(lineSubtotal) * 10) / 100;
      console.log(`  - A2144B line Subtotal : ${lineSubtotal} (10% = ${(-expectedReward).toFixed(2)})`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - Reward (10% of the listed product line)', expected: '-164.50', actual: reward || '(none)', passed: money(reward) === -164.5 && money(reward) === expectedReward },
      ], `${TC} - Step 3 reward`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-3 - Deal registration saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
