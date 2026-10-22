import { Browser, BrowserContext, Page, TestInfo, test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig } from '@pages/mig';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DISCOUNT_PARTNERS,
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
  openReferenceSessionMig,
  closeReferenceSessionMig,
  baselineDetails,
} from '@helpers/discount-mig.helper';
import {
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.7 - EUR order with a line discount and a 35 % partner discount, to the cent   (crm-mig + reference)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.7
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 40, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_2.7 (Jira CRM-13784; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-7-eur-order-to-the-cent.spec.ts) - assertions ported unchanged; the baseline's
 *                    run is the reference side of Step 4 here
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0081
 * Source version   : master row CRM-12144_2.7 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the reference system
 *                    (pre-production, http://pre-production.nakivo.site, Odoo 12 EE)
 * Run as           : crm-mig - Sales / Editing Manager (Max Zaprykutenko, users.manager_max_crm_mig);
 *                    reference - the baseline account users.manager_max (same role, same data)
 * Partners         : Bronze reseller Bailey Systems (15 %), distributor QBS Software Ltd (20 %) - the baseline's
 *                    names, not searched
 *
 * Summary
 * -------
 * EUR order, O365-SUB-5Y x 350 at 40.90 with 5 % line discount, Bronze reseller + distributor: Deal registration gives
 * Reward -1,360.10 and Total 7,955.45 with Total in Company Currency shown on crm-mig, and every amount is the same
 * on the reference system to the cent.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.7:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.7, master "Migration - Discount")
 * ------------------------------------------------------------------------------------------------
 *  Title: EUR order with a line discount and a 35 % partner discount (IS-CRM-FUNC-0081)
 *  Priority: P1 | Spec Areas: 0081 - to the cent
 *  Pre-conditions
 *    1. Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can
 *       edit Unit Price)
 *    2. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist_EUR (EUR)
 *    3. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    4. Use an existing Bronze reseller (15 %) and an existing distributor (20 %); ask the development team if none
 *       is found
 *    5. Have the reference system URL and login from the development team (a non-Production copy of the CRM in use
 *       today)
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment;
 *       set Reseller = the Bronze reseller and Distributor = the distributor
 *    2. On Order Lines, add O365-SUB-5Y with Ordered Qty 350, Unit Price 40.90 and Discount (%) 5
 *    3. Pick Deal registration and click Save
 *    4. Repeat steps 1 to 3 on the reference system with the same data and compare
 *  Expected Results
 *    1. Reseller Discount (%) = 15; Distributor Discount (%) = 20
 *    3. Reward = -1,360.10; Total = 7,955.45; Total in Company Currency is shown
 *    4. Every amount, Total in Company Currency included, is the same on both systems (a difference of 0.01 or more
 *       is a fail)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts, DealElementPageMig for the Order Lines reads.
 *  Step 4 drives the reference system in this same test: a second browser context, the baseline helpers, the
 *  baseline account (users.manager_max) and its own run marker; then every amount is compared to the cent with no
 *  tolerance. Steps 1-3 of the reference run keep the baseline checks, so a red here is either a crm-mig amount that
 *  differs from the baseline value or a reference amount that differs from the same value.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.7';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a user in Sales / Editing Manager (only this group can edit Unit Price) - Max Zaprykutenko',
  pre2: 'Pre-condition 2: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_EUR (EUR)',
  pre3: 'Pre-condition 3: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; set Reseller = the Bronze reseller and Distributor = the distributor',
  s2: 'Step 2: On Order Lines, add O365-SUB-5Y with Ordered Qty 350, Unit Price 40.90 and Discount (%) 5',
  s3: 'Step 3: Pick Deal registration and click Save',
  s4: 'Step 4: [REFERENCE SIDE - pre-production, driven in this test] Repeat steps 1 to 3 on the reference system with the same data and compare',
  s4pre: 'Step 4 / reference - Pre-condition: sign in to pre-production (users.manager_max) and create the same company Disc-Cust-<timestamp> (EUR) and opportunity Disc-Opp-<timestamp>',
  s4s1: 'Step 4 / reference - Step 1: Open the opportunity, DEAL ELEMENT, Reseller = Bronze reseller, Distributor = distributor',
  s4s2: 'Step 4 / reference - Step 2: On Order Lines, add O365-SUB-5Y with Ordered Qty 350, Unit Price 40.90 and Discount (%) 5',
  s4s3: 'Step 4 / reference - Step 3: Pick Deal registration and click Save',
  s4cmp: 'Step 4 / compare: every amount, Total in Company Currency included, crm-mig vs reference to the cent (a difference of 0.01 or more is a fail)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const EDITING_MANAGER = users.manager_max_crm_mig;
const REFERENCE_EDITING_MANAGER = users.manager_max; // pre-production account (no _crm_mig suffix)
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

type Amounts = Record<string, string>;

/** The amounts compared to the cent in Step 4 - every money amount the Deal Element shows for this order. */
const COMPARED: Array<{ key: string; label: string }> = [
  { key: 'Line Unit Price', label: 'O365-SUB-5Y Unit Price' },
  { key: 'Line Subtotal', label: 'O365-SUB-5Y Subtotal' },
  { key: 'Reward', label: 'Reward (Deal registration)' },
  { key: 'discount_money', label: 'Partner Discount' },
  { key: 'amount_untaxed', label: 'Untaxed Amount' },
  { key: 'amount_tax', label: 'Taxes' },
  { key: 'amount_total', label: 'Total' },
  { key: 'amount_total_company_signed', label: 'Total in Company Currency' },
];

/** Two amounts equal to the cent; an empty or unreadable value is never equal. */
const sameAmount = (crm: string, ref: string): boolean => {
  const a = money(crm);
  const b = money(ref);
  return !Number.isNaN(a) && !Number.isNaN(b) && sameCents(a, b);
};

/** A second browser context for the reference system (pre-production), so its sign-in never clears crm-mig's session. */
async function openReferenceSide(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  return openReferenceSessionMig(browser, test.info()); // records its own video, attached on close
}

/** Step 1 - the partner discounts: the baseline's assertions, on the given system. */
async function partnerStep(p: Page, de: DealElementPage, testInfo: TestInfo, checks: Check[], tag: string): Promise<void> {
  console.log(`  - [${tag}] Reseller    = ${DISCOUNT_PARTNERS.bronze}`);
  console.log(`  - [${tag}] Distributor = ${DISCOUNT_PARTNERS.distributor}`);
  await de.setReseller(DISCOUNT_PARTNERS.bronze);
  await de.setDistributor(DISCOUNT_PARTNERS.distributor);
  const rPct = await de.getVisibleFieldValue('reseller_discount');
  const dPct = await de.getVisibleFieldValue('distributor_discount');
  await recordChecks(p, testInfo, checks, [
    { what: `${tag} - Step 1 - Reseller Discount (%)`, expected: '15', actual: rPct, passed: money(rPct) === 15 },
    { what: `${tag} - Step 1 - Distributor Discount (%)`, expected: '20', actual: dPct, passed: money(dPct) === 20 },
  ], `${TC} - ${tag} Step 1 partner discounts`, []);
}

/** Step 2 - the O365-SUB-5Y line. Its amounts are read into `out` for the Step 4 comparison. */
async function lineStep(de: DealElementPage, tag: string, out: Amounts): Promise<void> {
  console.log(`  - [${tag}] Product = O365-SUB-5Y, Ordered Qty = 350, Unit Price = 40.90, Discount (%) = 5`);
  await de.addOrderLineStrict(DISCOUNT_MIG.subscriptionProduct, 350);
  await de.setLineUnitPrice(DISCOUNT_MIG.subscriptionProduct, 40.9);
  await de.blurForm();
  await de.setLineDiscount(DISCOUNT_MIG.subscriptionProduct, 5);
  await de.blurForm();
  const row = await de.getOrderLineRowCells(0);
  out['Line Unit Price'] = row['Unit Price'] ?? '';
  out['Line Subtotal'] = row['Subtotal'] ?? '';
  console.log(`  - [${tag}] line: Unit Price ${row['Unit Price']} | Discount (%) ${row['Discount (%)']} | Subtotal ${row['Subtotal']}`);
}

/** Step 3 - Deal registration, Save, then the reward and the totals: the baseline's assertions, on the given system. */
async function rewardStep(p: Page, de: DealElementPage, run: DiscountRun, testInfo: TestInfo, checks: Check[], tag: string, out: Amounts): Promise<void> {
  await de.setPromotion('Deal registration');
  await saveDealElement(p, run);
  const rewards = rewardRows(await de.getAllOrderLineRows());
  out['Reward'] = rewards[0]?.['Unit Price'] ?? '';
  for (const f of ['discount', 'discount_money', 'amount_untaxed', 'amount_tax', 'amount_total']) out[f] = await de.getSubtotalFooterValue(f);
  out['amount_total_company_signed'] = await de.getVisibleFieldValue('amount_total_company_signed');
  console.log(`  - [${tag}] Reward line Unit Price : ${out['Reward'] || '(none)'} (reward lines: ${rewards.length})`);
  console.log(`  - [${tag}] Partner Discount       : ${out['discount_money'] || '(empty)'}`);
  console.log(`  - [${tag}] Total                  : ${out['amount_total'] || '(empty)'}`);
  console.log(`  - [${tag}] Total in Company Currency : ${out['amount_total_company_signed'] || '(empty)'}`);
  await recordChecks(p, testInfo, checks, [
    { what: `${tag} - Step 3 - Reward`, expected: '-1,360.10', actual: out['Reward'] || '(none)', passed: rewards.length === 1 && money(out['Reward']) === -1360.1 },
    { what: `${tag} - Step 3 - Total`, expected: '7,955.45', actual: out['amount_total'] || '(empty)', passed: money(out['amount_total']) === 7955.45 },
    { what: `${tag} - Step 3 - Total in Company Currency is shown`, expected: 'a non-empty amount', actual: out['amount_total_company_signed'] || '(empty)', passed: !Number.isNaN(money(out['amount_total_company_signed'])) },
  ], `${TC} - ${tag} Step 3 EUR amounts`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
  await CommonUtils.captureAndAttachScreenshot(p, testInfo, `${tag} - Steps 1-3 - EUR order with Deal registration saved`);
}

/** Step 4 - every compared amount, side by side, to the cent. No tolerance. */
async function compareStep(page: Page, testInfo: TestInfo, checks: Check[], crm: Amounts, ref: Amounts): Promise<void> {
  console.log('  Side by side, every amount (crm-mig | reference):');
  const rows: Check[] = COMPARED.map(({ key, label }) => {
    const c = crm[key] ?? '';
    const r = ref[key] ?? '';
    console.log(`    - ${label.padEnd(30)} ${(c || '(empty)').padEnd(16)} | ${r || '(empty)'}`);
    return { what: `Step 4 - ${label}`, expected: r || '(empty)', actual: c || '(empty)', passed: sameAmount(c, r) };
  });
  await recordChecks(page, testInfo, checks, rows, `${TC} - Step 4 crm-mig vs reference`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - EUR order with a line discount and a 35 % partner discount (crm-mig, compared with the reference system)`, () => {
  let created: DiscountRun[] = [];
  let refPage: Page | undefined;
  let refContext: BrowserContext | undefined;
  let refRun: DiscountRun | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
    refPage = undefined;
    refContext = undefined;
    refRun = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    const errors: string[] = [];
    if (!SKIP_CLEANUP) {
      for (const run of created) await teardownDiscountRunMig(page, run, testInfo).catch((e: Error) => errors.push(e.message));
      if (refPage && refRun) await teardownDiscountRun(refPage, refRun, testInfo).catch((e: Error) => errors.push(`reference: ${e.message}`));
    }
    await closeReferenceSessionMig(refContext, refPage, test.info());
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (errors.length) throw new Error(errors.join(' | '));
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: EUR order with a line discount and a 35 % partner discount`, baselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // two systems built in one test
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const crm: Amounts = {};
    const ref: Amounts = {};

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
      console.log(`  - Login : ${EDITING_MANAGER.username} (${EDITING_MANAGER.displayName})`);
      await signInMig(page, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the Editing Manager');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, EDITING_MANAGER, DISCOUNT_MIG.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - EUR company created on crm-mig');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, EDITING_MANAGER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created on crm-mig');
    });

    // ================= Steps 1-3 (crm-mig) =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await partnerStep(page, dealElementPage, testInfo, checks, 'crm-mig');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await lineStep(dealElementPage, 'crm-mig', crm);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await rewardStep(page, dealElementPage, run, testInfo, checks, 'crm-mig', crm);
    });

    // ================= Step 4 (reference system, driven in this test) =================
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const side = await openReferenceSide(browser);
      refContext = side.context;
      refPage = side.page;
      const runRef = newDiscountRun();
      refRun = runRef;
      const refDe = new DealElementPage(side.page);

      await test.step(STEP.s4pre, async () => {
        console.log(`\n--- ${STEP.s4pre} ---`);
        await signIn(side.page, REFERENCE_EDITING_MANAGER);
        await createEndCustomerCompany(side.page, runRef, REFERENCE_EDITING_MANAGER, DISCOUNT_MIG.pricelistEur);
        await createOpportunityForCompany(side.page, runRef, REFERENCE_EDITING_MANAGER);
        await CommonUtils.captureAndAttachScreenshot(side.page, testInfo, 'Step 4 - reference company and opportunity created');
      });

      await test.step(STEP.s4s1, async () => {
        console.log(`\n--- ${STEP.s4s1} ---`);
        await openDealElementFromOpportunity(side.page);
        await partnerStep(side.page, refDe, testInfo, checks, 'reference');
      });

      await test.step(STEP.s4s2, async () => {
        console.log(`\n--- ${STEP.s4s2} ---`);
        await lineStep(refDe, 'reference', ref);
      });

      await test.step(STEP.s4s3, async () => {
        console.log(`\n--- ${STEP.s4s3} ---`);
        await rewardStep(side.page, refDe, runRef, testInfo, checks, 'reference', ref);
      });

      await test.step(STEP.s4cmp, async () => {
        console.log(`\n--- ${STEP.s4cmp} ---`);
        await compareStep(page, testInfo, checks, crm, ref);
      });
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
