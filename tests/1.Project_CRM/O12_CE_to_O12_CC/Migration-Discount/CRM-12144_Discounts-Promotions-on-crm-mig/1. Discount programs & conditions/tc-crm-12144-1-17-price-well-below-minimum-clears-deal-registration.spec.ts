import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, ContactPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  signedInRoleCheckMig,
  openBorrowedCompanyFormMig,
  leaveBorrowedCompanyFormMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.17 - Lower the unit price of an order carrying Deal registration well below the minimum   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.17
 * Jira             : N/A - NEW test case, not yet in the master file nor in Xray (ID proposed)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - written from the crm-mig manual TC (no pre-production baseline for this TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0075
 *                    (QI "Discounts QA Instructions" v2, TC-07 steps 1, 2, 4, p.20-21)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 37c868da5087
 *                    (sha256 of the lines from "## CRM-12144_1.17 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_1.17
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / Editing Manager (Max Zaprykutenko, users.manager_max_crm_mig). ASSERTED in Pre-condition 1:
 *                    the session's login and the user's groups (res.groups full names) must contain
 *                    "Sales / Editing Manager" - a scored check.
 * Bronze reseller  : Bailey Systems (DISCOUNT_PARTNERS.bronze - Level Bronze, Partner Discount 15.0), borrowed, never edited
 *
 * Summary
 * -------
 * Bronze reseller, A2144B x 4 at 412.00 (1,400.80 after 15 %) is offered Deal registration and saved with it
 * (Reward -164.80, Total 1,260.72); lowering Unit Price to 400.00 and saving clears Promotion and removes the reward line.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.17:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.17, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Lower the unit price of an order carrying Deal registration well below the minimum (IS-CRM-FUNC-0075)
 *  Priority: P2 | Spec Areas: 0075 - price drop clears it
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / Editing Manager (e.g. Max Zaprykutenko)
 *      Use an existing Bronze reseller (15 %) - check Partner Discount on the company form (a Level without Partner
 *      Discount gives 0 %)
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
 *       set Reseller = the Bronze reseller; add A2144B with Ordered Qty 4 and Unit Price 412.00; open the Promotion list
 *    2. Pick Deal registration and click Save
 *    3. Change Unit Price to 400.00 and click Save
 *
 *  Expected Results:
 *    1. The list contains Deal registration (1,648.00 x 0.85 = 1,400.80)
 *    2. Reward = -164.80; Total = 1,260.72
 *    3. Promotion is cleared and the reward line is removed
 *
 *  Data entered:
 *    - Reseller     = Bailey Systems (Bronze, 15 %)
 *    - Distributor  = blank
 *    - Product      = [A2144B]
 *    - Ordered Qty  = 4
 *    - Unit Price   = 412.00, then 400.00
 *    - Discount (%) = blank (0)
 *    - Promotion    = Deal registration (step 2)
 *
 *  Port notes: Pre-condition 2 opens the borrowed partner's company form (looked up by exact name, must be unique) in
 *  READ mode and reads its "Partner Discount" field (discount_id) - scored; nothing on that form is edited. Step 1 also
 *  records, as a (guard), the Reseller Discount (%) the partner brings to the Deal Element. Teardown: afterEach deletes the run's Deal Element, opportunity, company and
 *  auto-created contact as the crm-mig administrator; afterAll sweeps by the run's marker. SKIP_CLEANUP stays false.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.17';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / Editing Manager (e.g. Max Zaprykutenko) [the groups of the signed-in user are read and must contain Sales / Editing Manager]',
  pre2: 'Pre-condition 2: Use an existing Bronze reseller (15 %) - check Partner Discount on the company form (a Level without Partner Discount gives 0 %) [Bailey Systems, borrowed: its form is opened read-only and never edited]',
  pre3: 'Pre-condition 3: Create a new company in Contacts with: Name = Disc-Cust-<timestamp>; Type = end customer (no Reseller, no Distributor); Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with: Name = Disc-Opp-<timestamp>; Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller; add A2144B with Ordered Qty 4 and Unit Price 412.00; open the Promotion list',
  s2: 'Step 2: Pick Deal registration and click Save',
  s3: 'Step 3: Change Unit Price to 400.00 and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITING_MANAGER = users.manager_max_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Lower the unit price of an order carrying Deal registration well below the minimum (crm-mig)`, () => {
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

  test(`${TC}: Lower the unit price of an order carrying Deal registration well below the minimum`, {
    annotation: [
      { type: 'manual-tc', description: `${TC} (NEW, NEW_AND_UNSPECCED_TCS.md v2 - sha256 37c868da5087)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0075 (QI TC-07 steps 1, 2, 4)' },
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
      console.log(`  - Bronze reseller = ${DISCOUNT_PARTNERS.bronze} (borrowed - its form is only read, never edited)`);
      const partnerId = await openBorrowedCompanyFormMig(page, DISCOUNT_PARTNERS.bronze);
      const partnerDiscount = await new ContactPageMig(page).getPartnerDiscountMig();
      console.log(`  - res.partner id   = ${partnerId}`);
      console.log(`  - Partner Discount = ${partnerDiscount || '(empty)'}`);
      await recordChecks(page, testInfo, checks, [
        {
          what: `Pre-condition 2 - the Bronze reseller's company form shows Partner Discount 15 (0 or empty means a Level without Partner Discount - the order would get 0 %)`,
          expected: '15.0',
          actual: partnerDiscount || '(empty)',
          passed: money(partnerDiscount) === 15,
        },
      ], `${TC} - Pre-condition 2 Partner Discount on the company form`, [ContactPageMig.PARTNER_DISCOUNT]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Bronze reseller company form');
      await leaveBorrowedCompanyFormMig(page); // full page load - a hash change off this form raised an Odoo Client Error
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      console.log(`  - Reseller    = ${DISCOUNT_PARTNERS.bronze}`);
      console.log(`  - Product     = ${DISCOUNT_MIG.listedProduct}`);
      console.log(`  - Ordered Qty = 4`);
      console.log(`  - Unit Price  = 412.00`);
      await dealElementPage.setReseller(DISCOUNT_PARTNERS.bronze);
      const resellerPct = await dealElementPage.getVisibleFieldValue('reseller_discount');
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 4);
      await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, 412);
      await dealElementPage.blurForm();
      const subtotal = await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,648.00');
      const step1Total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - line Subtotal : ${subtotal}`);
      console.log(`  - Total         : ${step1Total}`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 (guard) - the Bronze reseller brings Reseller Discount (%) 15 to the Deal Element', expected: '15', actual: resellerPct, passed: money(resellerPct) === 15 },
        { what: 'Step 1 - the A2144B line Subtotal is 1,648.00 (412.00 x 4)', expected: '1,648.00', actual: subtotal || '(empty)', passed: money(subtotal) === 1648 },
        { what: 'Step 1 - the Total is 1,400.80 (1,648.00 x 0.85 - the amount the 1,400.00 minimum is compared with; another value means the threshold case is not the one the TC sets up)', expected: '1,400.80', actual: step1Total || '(empty)', passed: money(step1Total) === 1400.8 },
        {
          what: 'Step 1 - the Promotion list contains Deal registration (1,648.00 x 0.85 = 1,400.80)',
          expected: DISCOUNT_MIG.dealRegistration,
          actual: options.length ? options.join(' | ') : '(empty list)',
          passed: options.includes(DISCOUNT_MIG.dealRegistration),
        },
      ], `${TC} - Step 1 Promotion list at 1,400.80`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList, DISCOUNT_HIGHLIGHT.totals]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - Reward', expected: '-164.80', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: rewards.length === 1 && money(rewards[0]['Unit Price']) === -164.8 },
        { what: 'Step 2 - Total', expected: '1,260.72', actual: total, passed: money(total) === 1260.72 },
      ], `${TC} - Step 2 reward at 412.00`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - Deal registration saved at 412.00');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      console.log(`  - Unit Price = 400.00`);
      await dealElementPage.clickEdit();
      await dealElementPage.setLineUnitPrice(DISCOUNT_MIG.listedProduct, 400);
      await dealElementPage.blurForm();
      await saveDealElement(page, run);
      const promotion = await dealElementPage.getAppliedPromotionName();
      // an empty read only counts when the Promotion field is on the form at all (no vacuous pass)
      const promotionShown = (await dealElementPage.getVisibleFieldLabels()).some((l) => /^promotion$/i.test(l.trim()));
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      console.log(`  - Promotion field on the form : ${promotionShown ? 'yes' : 'NO'}`);
      console.log(`  - Order lines after Save : ${rows.map((r) => `${(r['Product'] ?? '').slice(0, 30)} @ ${r['Unit Price'] ?? ''}`).join(' | ')}`);
      console.log(`  - Total after Save       : ${await dealElementPage.getSubtotalFooterValue('amount_total')}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - Promotion is cleared', expected: 'Promotion field shown, (empty)', actual: `${promotionShown ? 'shown' : 'NOT on the form'}, ${promotion || '(empty)'}`, passed: promotionShown && promotion === '' },
        { what: 'Step 3 - the reward line is removed (only the A2144B line is left)', expected: '0 reward lines, 1 order line', actual: `${rewards.length} reward line(s), ${rows.length} order line(s)`, passed: rewards.length === 0 && rows.length === 1 },
      ], `${TC} - Step 3 price 400.00 saved`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - price 400.00 saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
