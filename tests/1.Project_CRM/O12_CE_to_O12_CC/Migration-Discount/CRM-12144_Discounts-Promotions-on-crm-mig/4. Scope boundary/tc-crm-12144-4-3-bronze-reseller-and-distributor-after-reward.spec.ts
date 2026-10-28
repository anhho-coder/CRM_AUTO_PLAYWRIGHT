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
  signInMig,
  recordSignedInRoleMig,
  openBorrowedCompanyFormMig,
  leaveBorrowedCompanyFormMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecksMig,
  printVerifyAndAssertMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_4.3 - Bronze reseller and 20 % distributor order carrying Deal registration   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_4.3   (NEW - proposed id, QI TC-04 step 3)
 * Jira             : N/A - NEW test case, not yet in the master file nor in Xray (tester: specs first, master after)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - written from the crm-mig manual TC (no pre-production baseline for this TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0098, IS-CRM-FUNC-0084
 *                    (QI "Discounts QA Instructions" v2, TC-04 step 3)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 f7d83684b7ac
 *                    (sha256 of the lines from "## CRM-12144_4.3 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_4.3
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig). ASSERTED in
 *                    Pre-condition 1: the session's login and MEMBERSHIP of "Sales / User: Own Documents Only",
 *                    implied membership included (tester's rule 2026-10-19, re-confirmed 2026-10-27: a role is group
 *                    membership, not the highest Sales level). Thomas also holds "Sales / User: All Documents" - printed
 *                    as information, not scored. A scored check with its own evidence shot.
 *                    Pre-condition 2 reads the partners' company forms as the crm-mig ADMINISTRATOR
 *                    (users.admin_crm_mig, separate browser context, read-only) - tester 2026-10-27.
 * Partners         : Bronze reseller Bailey Systems (DISCOUNT_PARTNERS.bronze, Partner Discount 15.0) and distributor
 *                    QBS Software Ltd (DISCOUNT_PARTNERS.distributor, Partner Discount 20.0) - borrowed, never edited
 *
 * Summary
 * -------
 * Bronze reseller (15 %) + distributor (20 %) on a new Deal Element; A2144B x 10 with Deal registration gives Reward
 * -329.00, Partner Discount(%) 35 and Total (3,290.00 - 329.00) x 0.65 = 1,924.65 (partner tier after the reward).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_4\.3:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_4.3, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Bronze reseller and 20 % distributor order carrying Deal registration (IS-CRM-FUNC-0098, IS-CRM-FUNC-0084)
 *  Priority: P2 | Spec Areas: 0098 - reseller + distributor after reward
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *      Use an existing Bronze reseller (15 %) and an existing distributor (20 %) - check Partner Discount on each company form
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
 *       set Reseller = the Bronze reseller and Distributor = the distributor
 *    2. Add A2144B with Ordered Qty 10, pick Deal registration and click Save
 *
 *  Expected Results:
 *    1. Reseller Discount (%) = 15; Distributor Discount (%) = 20
 *    2. Reward = -329.00 (10 % of 3,290.00); Partner Discount(%) = 35; Total = (3,290.00 - 329.00) x 0.65 = 1,924.65
 *
 *  Note (QI TC-04 Reference): Total = (sum of the lines - reward) x (1 - reseller and distributor percentages).
 *
 *  Data entered:
 *    - Reseller     = Bailey Systems (Bronze, 15 %)
 *    - Distributor  = QBS Software Ltd (20 %)
 *    - Product      = [A2144B]
 *    - Ordered Qty  = 10
 *    - Unit Price   = blank (pricelist price 329.00)
 *    - Discount (%) = blank (0)
 *    - Promotion    = Deal registration
 *
 *  Port notes: Pre-condition 2 opens each borrowed partner's company form (looked up by exact name, must be unique) in
 *  READ mode and reads its "Partner Discount" field (discount_id) - scored; nothing on either form is edited.
 *  Measured 2026-10-26: for Thomas Semerich the company form HIDES "Partner Discount" (discount_id carries
 *  o_invisible_modifier) and shows "Discount" (float `discount`) = 15.00 / 20.00 instead; a Sales / Editing Manager sees
 *  "Partner Discount". Tester 2026-10-27: the check is made where the field is shown - as the crm-mig administrator in
 *  a separate browser context, read-only (the salesperson's session stays signed in for every other step). Company
 *  data the manual TC leaves open (Email, Country = United States, State = Maryland, Sales Team = BDEU, Salesperson =
 *  Thomas Semerich) is the suite's shared createEndCustomerCompanyMig data. Step 2 also checks, as a (guard), "exactly
 *  one reward line" (a second one would make the -329.00 read ambiguous). Teardown: afterEach deletes the run's Deal
 *  Element, opportunity, company and auto-created contact as the crm-mig administrator; afterAll sweeps by the run's
 *  marker. SKIP_CLEANUP stays false.
 * ================================================================================================
 */

const TC = 'CRM-12144_4.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) [the groups of the signed-in user are read: membership of Sales / User: Own Documents Only, implied membership included]',
  pre2: 'Pre-condition 2: Use an existing Bronze reseller (15 %) and an existing distributor (20 %) - check Partner Discount on each company form [Bailey Systems and QBS Software Ltd, borrowed: their forms are opened read-only, as the crm-mig administrator in a separate browser context (the form of the salesperson hides Partner Discount), and never edited]',
  pre3: 'Pre-condition 3: Create a new company in Contacts with: Name = Disc-Cust-<timestamp>; Type = end customer (no Reseller, no Distributor); Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with: Name = Disc-Opp-<timestamp>; Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller and Distributor = the distributor',
  s2: 'Step 2: Add A2144B with Ordered Qty 10, pick Deal registration and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = []; // every run of this file - the afterAll sweep re-checks them

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Bronze reseller and 20 % distributor order carrying Deal registration (crm-mig)`, () => {
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

  test(`${TC}: Bronze reseller and 20 % distributor order carrying Deal registration`, {
    tag: ['@no-preprod-baseline'],
    annotation: [
      { type: 'manual-tc', description: `${TC} (NEW, NEW_AND_UNSPECCED_TCS.md v2 - sha256 f7d83684b7ac)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0098, IS-CRM-FUNC-0084 (QI TC-04 step 3)' },
    ],
  }, async ({ page, browser }, testInfo) => {
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
      // [INTERNAL check, Call API] the ROLE the TC names (tester decision 2026-10-26) - recorded with its own evidence shot:
      // the top-bar user name outlined, the groups in the banner (review 2026-10-26: a bare checks.push left a FAIL with no image)
      await recordSignedInRoleMig(page, testInfo, checks, SALES, 'Sales / User: Own Documents Only', 'Pre-condition 1', `${TC} - Pre-condition 1 role of the salesperson`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      // tester 2026-10-27: read Partner Discount where it is shown - as the crm-mig administrator, in its own context
      const adminContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });
      const adminPage = await adminContext.newPage();
      try {
      console.log(`  - Reader: ${users.admin_crm_mig.username} (crm-mig administrator, read-only, separate browser context)`);
      await signInMig(adminPage, users.admin_crm_mig);
      const contactPage = new ContactPageMig(adminPage);
      const partners = [
        { role: 'Bronze reseller', name: DISCOUNT_PARTNERS.bronze, pct: 15 },
        { role: 'distributor', name: DISCOUNT_PARTNERS.distributor, pct: 20 },
      ];
      for (const p of partners) {
        console.log(`  - ${p.role} = ${p.name} (borrowed - its form is only read, never edited)`);
        const partnerId = await openBorrowedCompanyFormMig(adminPage, p.name);
        const shown = await contactPage.revealPartnerDiscountMig(); // the field sits on a notebook page, not the top block
        const partnerDiscount = await contactPage.getPartnerDiscountMig();
        const visibleDiscount = await contactPage.getVisibleDiscountMig();
        console.log(`    - res.partner id                  = ${partnerId}`);
        console.log(`    - Partner Discount (discount_id)  = ${partnerDiscount || '(empty)'} - ${shown.visible ? 'on screen' : 'NOT on screen for this user (hidden field)'}`);
        console.log(`  Observation (not scored) - the "Discount" field (discount) on screen: ${visibleDiscount || '(not on screen)'}`);
        await recordChecksMig(adminPage, testInfo, checks, [
          {
            what: `Pre-condition 2 - the ${p.role}'s company form (${p.name}) shows Partner Discount ${p.pct} (read as the crm-mig administrator; a hidden field or another value is a FAIL - the TC's check cannot be made on screen, or the partner tier of Step 2 is not the one the TC sets up)`,
            expected: `Partner Discount = ${p.pct}.0, on screen`,
            actual: shown.visible
              ? `Partner Discount = ${partnerDiscount || '(empty)'}, on screen`
              : `Partner Discount NOT on screen (hidden for this user; the form shows "Discount" = ${visibleDiscount || '(nothing)'})`,
            passed: shown.visible && money(partnerDiscount) === p.pct,
          },
        ], `${TC} - Pre-condition 2 Partner Discount of the ${p.role}`, [shown.visible ? ContactPageMig.PARTNER_DISCOUNT : ContactPageMig.DISCOUNT_FIELD], 'top-left');
        // outline = what the Actual quotes: Partner Discount when it is drawn; when the form hides it, the "Discount" field the
        // Actual reports instead (review 2026-10-26: the hidden discount_id drew no outline and raised no warning)
        if (p === partners[partners.length - 1]) await CommonUtils.captureAndAttachScreenshot(adminPage, testInfo, 'Pre-condition 2 - both partner forms read');
        await leaveBorrowedCompanyFormMig(adminPage); // full page load - a hash change off this form raised an Odoo Client Error
      }
      } finally {
        await adminContext.close().catch(() => {});
      }
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - company created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created');
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
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 1 - Reseller Discount (%)', expected: '15', actual: rPct || '(empty)', passed: money(rPct) === 15 },
        { what: 'Step 1 - Distributor Discount (%)', expected: '20', actual: dPct || '(empty)', passed: money(dPct) === 20 },
      ], `${TC} - Step 1 reseller and distributor discounts`, [
        "div[name='reseller_id']",
        "[name='reseller_discount']:not(.o_invisible_modifier)",
        "div[name='distributor_id']",
        "[name='distributor_discount']:not(.o_invisible_modifier)",
      ]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 10);
      const row = await dealElementPage.getOrderLineRowCells(0);
      console.log(`  - A2144B x 10 line: Subtotal before discount ${row['Subtotal before discount']} | Partner Discount Amount ${row['Partner Discount Amount']} | Subtotal ${row['Subtotal']}`);
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      const rewards = rewardRows(await dealElementPage.getAllOrderLineRows());
      const pct = await dealElementPage.getSubtotalFooterValue('discount');
      const total = await dealElementPage.getSubtotalFooterValue('amount_total');
      console.log(`  - Partner Discount    : ${await dealElementPage.getSubtotalFooterValue('discount_money')}`);
      // two evidence shots, one per owning element (review 2026-10-26): the reward line's Unit Price cell (scrolled into
      // view - the Order Lines table is wider than a 1920 px screen), then the Partner Discount(%) / Total footer
      await dealElementPage.markOrderLineCellMig(DISCOUNT_MIG.dealRegistrationProduct, 'Unit Price');
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - (guard) exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 2 - Reward (10 % of 3,290.00)', expected: '-329.00', actual: rewards[0]?.['Unit Price'] ?? '(none)', passed: money(rewards[0]?.['Unit Price'] ?? '') === -329 },
      ], `${TC} - Step 2 reward line`, [DealElementPageMig.ORDER_LINE_HEAD, DealElementPageMig.ORDER_LINE_CELL]);
      await recordChecksMig(page, testInfo, checks, [
        { what: 'Step 2 - Partner Discount(%)', expected: '35', actual: pct || '(empty)', passed: money(pct) === 35 },
        { what: 'Step 2 - Total ((3,290.00 - 329.00) x 0.65)', expected: '1,924.65', actual: total || '(empty)', passed: money(total) === 1924.65 },
      ], `${TC} - Step 2 partner tier and Total`, [DISCOUNT_HIGHLIGHT.totals], 'bottom-left');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - Bronze reseller + distributor + Deal registration saved');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
