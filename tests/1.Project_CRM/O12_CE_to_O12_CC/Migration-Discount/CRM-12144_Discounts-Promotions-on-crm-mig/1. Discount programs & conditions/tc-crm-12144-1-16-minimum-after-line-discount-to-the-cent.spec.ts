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
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  signedInRoleCheckMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.16 - Compare the 1,400.00 USD minimum with the order's amount after the line discount, to the cent   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.16
 * Jira             : N/A - NEW test case, not yet in the master file nor in Xray (ID proposed)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - written from the crm-mig manual TC (no pre-production baseline for this TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0074-05, IS-CRM-FUNC-0075
 *                    (QI "Discounts QA Instructions" v2, TC-24 steps 4-5, p.37-38)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 d8565b34a23a
 *                    (sha256 of the lines from "## CRM-12144_1.16 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_1.16
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / Editing Manager - the only group with an editable Unit Price column (QI p.9)
 *                    (Max Zaprykutenko, users.manager_max_crm_mig). ASSERTED in Pre-condition 1: the session's login and
 *                    the user's groups (res.groups full names) must contain "Sales / Editing Manager" - a scored check.
 *
 * Summary
 * -------
 * A2144B x 4 at 368.43 with a 5 % line discount (Subtotal 1,400.03) is offered Deal registration; at 5.01 % (Subtotal
 * 1,399.89) it is not, although Unit Price x Ordered Qty is 1,473.72. Nothing is saved.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.16:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.16, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Compare the 1,400.00 USD minimum with the order's amount after the line discount, to the cent
 *         (IS-CRM-FUNC-0074-05, IS-CRM-FUNC-0075)
 *  Priority: P2 | Spec Areas: 0074-05 - after line discount
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / Editing Manager (e.g. Max Zaprykutenko)
 *      Create a new company in Contacts with:
 *        _ Name      = Disc-Cust-<timestamp>
 *        _ Type      = end customer (no Reseller, no Distributor)
 *        _ Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with:
 *        _ Name      = Disc-Opp-<timestamp>
 *        _ Customer  = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       add A2144B with Ordered Qty 4
 *    2. Change Unit Price to 368.43 and Discount (%) to 5; open the Promotion list
 *    3. Change Discount (%) to 5.01; open the Promotion list
 *
 *  Expected Results:
 *    2. The Subtotal is 1,400.03; the Promotion list contains Deal registration
 *    3. The Subtotal is 1,399.89; the Promotion list does not contain Deal registration, although
 *       Unit Price x Ordered Qty is 1,473.72
 *
 *  Note (QI p.37): the minimum is compared with the order's amount after the line discount and after the partner tier
 *  (the Total of an order without tax), not with the unit price times the quantity; an amount equal to the threshold
 *  qualifies.
 *
 *  Data entered (every field of the order line this TC touches):
 *    - Product      = [A2144B]
 *    - Ordered Qty  = 4
 *    - Unit Price   = 368.43
 *    - Discount (%) = 5, then 5.01
 *    - Reseller     = blank
 *    - Distributor  = blank
 *    - Promotion    = blank (the list is only opened, never picked)
 *
 *  Gaps in the source: step 1 has no Expected Result - the spec records one guard check there (the line exists at the
 *  list price) so step 2 starts from a known line; it is labelled (guard), it is not an expected result of the TC.
 *  Teardown: afterEach deletes the run's opportunity / company / auto-created contact (the Deal Element is never saved);
 *  afterAll sweeps by the run's marker. SKIP_CLEANUP must stay false on crm-mig.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.16';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / Editing Manager (e.g. Max Zaprykutenko) [the groups of the signed-in user are read and must contain Sales / Editing Manager]',
  pre2: 'Pre-condition 2: Create a new company in Contacts with: Name = Disc-Cust-<timestamp>; Type = end customer (no Reseller, no Distributor); Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre3: 'Pre-condition 3: Create a new opportunity in CRM > Pipeline with: Name = Disc-Opp-<timestamp>; Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 4',
  s2: 'Step 2: Change Unit Price to 368.43 and Discount (%) to 5; open the Promotion list',
  s3: 'Step 3: Change Discount (%) to 5.01; open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITING_MANAGER = users.manager_max_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Compare the 1,400.00 USD minimum with the order's amount after the line discount, to the cent (crm-mig)`, () => {
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

  test(`${TC}: Compare the 1,400.00 USD minimum with the order's amount after the line discount, to the cent`, {
    annotation: [
      { type: 'manual-tc', description: `${TC} (NEW, NEW_AND_UNSPECCED_TCS.md v2 - sha256 d8565b34a23a)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0074-05, IS-CRM-FUNC-0075 (QI TC-24 steps 4-5)' },
    ],
  }, async ({ page }, testInfo) => {
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
      // [INTERNAL check, Call API] the ROLE the TC names - data-side, stdout is its evidence (tester decision 2026-10-26)
      checks.push(await signedInRoleCheckMig(page, EDITING_MANAGER, 'Sales / Editing Manager'));
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
      console.log(`  - Product     = ${DISCOUNT_MIG.listedProduct}`);
      console.log(`  - Ordered Qty = 4`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 4);
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,316.00');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 (guard) - A2144B x 4 at the list price, line Subtotal', expected: '1,316.00', actual: subtotal, passed: money(subtotal) === 1316 },
      ], `${TC} - Step 1 line added`, [DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log(`  - Unit Price   = 368.43`);
      console.log(`  - Discount (%) = 5`);
      await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, 368.43);
      await dealElementPage.setLineDiscount(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.blurForm();
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,400.03');
      const row = await dealElementPage.getOrderLineRowCells(0);
      console.log(`  - line: Unit Price ${row['Unit Price']} | Discount (%) ${row['Discount (%)']} | Subtotal ${row['Subtotal']}`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Subtotal (368.43 x 4 x 0.95)', expected: '1,400.03', actual: subtotal, passed: money(subtotal) === 1400.03 },
        {
          what: 'Step 2 - the Promotion list contains Deal registration (1,400.03 is at or above the 1,400.00 minimum)',
          expected: DISCOUNT_MIG.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 2 Subtotal 1,400.03 and Promotion list`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - 368.43 at 5 %, Subtotal 1,400.03');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Discount (%) = 5.01`);
      await dealElementPage.setLineDiscount(DISCOUNT_MIG.listedProduct, 5.01);
      await dealElementPage.blurForm();
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,399.89');
      const row = await dealElementPage.getOrderLineRowCells(0);
      const gross = Math.round(money(row['Unit Price'] ?? '') * money(row['Ordered Qty'] ?? '') * 100) / 100;
      console.log(`  - line: Ordered Qty ${row['Ordered Qty']} | Unit Price ${row['Unit Price']} | Discount (%) ${row['Discount (%)']} | Subtotal ${row['Subtotal']}`);
      console.log(`  - Unit Price x Ordered Qty (computed from the two cells) = ${gross.toFixed(2)}`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Subtotal (368.43 x 4 x 0.9499)', expected: '1,399.89', actual: subtotal, passed: money(subtotal) === 1399.89 },
        {
          what: 'Step 3 - Unit Price x Ordered Qty on the line',
          expected: '1,473.72 (368.43 x 4)',
          actual: `${row['Unit Price'] ?? '(empty)'} x ${row['Ordered Qty'] ?? '(empty)'} = ${gross.toFixed(2)}`,
          passed: gross === 1473.72,
        },
        {
          what: 'Step 3 - the Promotion list does not contain Deal registration (a FAIL means the minimum was compared with Unit Price x Ordered Qty, not with the amount after the line discount)',
          expected: `not listed: ${DISCOUNT_MIG.dealRegistration}`,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: !options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 3 Subtotal 1,399.89 and Promotion list`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - 5.01 %, Subtotal 1,399.89, not offered');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
