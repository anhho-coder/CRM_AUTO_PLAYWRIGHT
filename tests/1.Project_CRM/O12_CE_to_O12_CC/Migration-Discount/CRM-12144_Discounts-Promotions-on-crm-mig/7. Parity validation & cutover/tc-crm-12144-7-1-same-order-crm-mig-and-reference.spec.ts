import { Browser, BrowserContext, Page, TestInfo, test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
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
 *  CRM-12144_7.1 - Build the same order on crm-mig and on the reference system   (crm-mig + reference)
 * ================================================================================================
 * Test Case ID     : CRM-12144_7.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 63, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_7.1 (Jira CRM-13804; tests/1.Project_CRM/10.Sales_Module/Discount/7. Parity validation & cutover/
 *                    tc-discount-7-1-same-order-crm-mig-and-reference.spec.ts) - its run is the reference side here
 * Spec             : [Migration] Discounts (Promotions) v6 - IS-CRM-FUNC-0092
 * Source version   : master row CRM-12144_7.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE) and the reference system
 *                    (pre-production, http://pre-production.nakivo.site, Odoo 12 EE)
 * Run as           : crm-mig - salesperson Thomas Semerich (users.sale_ic_thomas_crm_mig, Sales / User: Own Documents Only);
 *                    reference - the baseline salesperson users.sale_ic_thomas (same role, same data)
 *
 * Summary
 * -------
 * The same order (A2144B x 5 with Deal registration, EUR pricelist) is built on crm-mig and on the reference system on
 * the same day. The Promotion list, the reward percentage and amount, the Total and the Total in Company Currency
 * must match to the cent.
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
 *    2. Have the reference system URL and login from the development team (a non-Production copy of the CRM in use
 *       today)
 *    3. Create a new company in Contacts with:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = end customer (no Reseller, no Distributor)
 *         - Pricelist   = Public Pricelist_EUR (EUR)
 *    4. Create a new opportunity in CRM > Pipeline with:
 *         - Name        = Disc-Opp-<timestamp>
 *         - Customer    = Disc-Cust-<timestamp>
 *    5. Create the same company and opportunity on the reference system
 *  Executed Steps
 *    1. On crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms =
 *       Immediate Payment, add A2144B with Ordered Qty 4 and open the Promotion list
 *    2. Pick Deal registration and click Save
 *    3. Repeat steps 1 and 2 on the reference system on the same day
 *    4. Compare the two
 *  Expected Results
 *    4. Same programs in the Promotion list, same reward percentage and amount, same Total and same Total in Company
 *       Currency (a difference of 0.01 or more is a fail)
 *
 *  Port notes (mechanical only): crm-mig host and *_crm_mig accounts; DealElementPageMig for the crm-mig Order Lines.
 *  Ordered Qty 5 is kept from the baseline (tester-approved 2026-10-21: on Public Pricelist_EUR A2144B is 289.00, so
 *  4 x 289.00 EUR is below the 1,400 USD minimum); the master row still says 4. Step 3 drives the reference system in
 *  this same test (second browser context, baseline helpers and account users.sale_ic_thomas, its own run marker); its
 *  Deal Element is opened on the reference opportunity re-opened by id (fresh page, see Step 3 / reference - Step 1).
 *  Step 4 compares every value to the cent with no tolerance.
 * ================================================================================================
 */

const TC = 'CRM-12144_7.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: [REFERENCE SIDE] Have the reference system URL and login from the development team (pre-production, baseline salesperson users.sale_ic_thomas)',
  pre3: 'Pre-condition 3: Create a new company in Contacts with Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist_EUR (EUR)',
  pre4: 'Pre-condition 4: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre5: 'Pre-condition 5: [REFERENCE SIDE] Create the same company and opportunity on the reference system (pre-production) - same data, own run marker',
  s1: 'Step 1: On crm-mig, Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 (master row says 4 - tester change 2026-10-21) and open the Promotion list',
  s2: 'Step 2: Pick Deal registration and click Save',
  s3: '[REFERENCE SIDE - pre-production, driven in this test] Step 3: Repeat steps 1 and 2 on the reference system on the same day',
  s3s1: 'Step 3 / reference - Step 1: Open the opportunity, DEAL ELEMENT, add A2144B with Ordered Qty 5 and open the Promotion list',
  s3s2: 'Step 3 / reference - Step 2: Pick Deal registration and click Save',
  s4: 'Step 4: Compare the two (Promotion list, reward percentage and amount, Total, Total in Company Currency - to the cent)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const REFERENCE_SALES = users.sale_ic_thomas; // pre-production account (no _crm_mig suffix)
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

type Values = Record<string, string>;

/** Step 4 items. `text` must match exactly; `amount` must match to the cent. */
const COMPARED: Array<{ key: string; label: string; kind: 'text' | 'amount' }> = [
  { key: 'Promotion list', label: 'Promotion list (same programs)', kind: 'text' },
  { key: 'reward %', label: 'Reward percentage', kind: 'amount' },
  { key: 'reward amount', label: 'Reward amount', kind: 'amount' },
  { key: 'Total', label: 'Total', kind: 'amount' },
  { key: 'Total in Company Currency', label: 'Total in Company Currency', kind: 'amount' },
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

/** Steps 1 (line) - add A2144B x 5 and read its Subtotal, on the given system. */
async function lineStep(de: DealElementPage, tag: string, out: Values): Promise<void> {
  await de.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5); // tester 2026-10-21: 4 -> 5 (4 x 289.00 EUR is below the minimum)
  await de.blurForm();
  const line = await de.getOrderLineRowCells(0);
  out['A2144B line Subtotal'] = line['Subtotal'] ?? '';
  console.log(`  - [${tag}] A2144B x 5 line Subtotal : ${out['A2144B line Subtotal'] || '(empty)'}`);
}

/** Step 1 (list) - the Promotion list at Qty 5, on the given system: the baseline's assertion. */
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

/** Step 2 - Deal registration, Save, then the reward, the Total and the Total in Company Currency, on the given system. */
async function rewardStep(p: Page, de: DealElementPage, run: DiscountRun, testInfo: TestInfo, checks: Check[], tag: string, out: Values): Promise<void> {
  await de.setPromotion('Deal registration');
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

/** Step 4 - the compared items, side by side, to the cent (text items must match exactly). */
async function compareStep(page: Page, testInfo: TestInfo, checks: Check[], crm: Values, ref: Values): Promise<void> {
  console.log('  Side by side (crm-mig | reference):');
  const rows: Check[] = COMPARED.map(({ key, label, kind }) => {
    const c = crm[key] ?? '';
    const r = ref[key] ?? '';
    console.log(`    - ${label.padEnd(32)} ${(c || '(empty)').padEnd(16)} | ${r || '(empty)'}`);
    const passed = kind === 'text' ? c !== '' && c === r : sameAmount(c, r);
    return { what: `Step 4 - ${label}`, expected: r || '(empty)', actual: c || '(empty)', passed };
  });
  console.log(`    - (info, not compared) A2144B line Subtotal : ${crm['A2144B line Subtotal'] || '(empty)'} | ${ref['A2144B line Subtotal'] || '(empty)'}`);
  await recordChecks(page, testInfo, checks, rows, `${TC} - Step 4 crm-mig vs reference`, [DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
}

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Same order on crm-mig and on the reference system (crm-mig + reference)`, () => {
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

  test(`${TC}: Build the same order on crm-mig and on the reference system`, baselineDetails(TC), async ({ page, browser }, testInfo) => {
    test.setTimeout(config.timeouts.test * 2); // two systems built in one test
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const checks: Check[] = [];
    const crm: Values = {};
    const ref: Values = {};

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
      console.log(`  - Host  : reference system (pre-production) - opened in a second browser context at Pre-condition 5`);
      console.log(`  - Login : ${REFERENCE_SALES.username} (${REFERENCE_SALES.displayName})`);
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistEur);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - EUR company created on crm-mig');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - opportunity created on crm-mig');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      const side = await openReferenceSide(browser);
      refContext = side.context;
      refPage = side.page;
      const runRef = newDiscountRun();
      refRun = runRef;
      await signIn(side.page, REFERENCE_SALES);
      await createEndCustomerCompany(side.page, runRef, REFERENCE_SALES, DISCOUNT_MIG.pricelistEur);
      await createOpportunityForCompany(side.page, runRef, REFERENCE_SALES);
      await CommonUtils.captureAndAttachScreenshot(side.page, testInfo, 'Pre-condition 5 - reference company and opportunity created');
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

    // ================= Step 3 (reference system, driven in this test) =================
    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const refPageNow = refPage;
      const runRef = refRun;
      if (!refPageNow || !runRef) throw new Error('Reference system was not opened at Pre-condition 5');
      const refDe = new DealElementPage(refPageNow);

      await test.step(STEP.s3s1, async () => {
        console.log(`\n--- ${STEP.s3s1} ---`);
        // the reference opportunity was created at Pre-condition 5 and then sat idle through the crm-mig steps: re-open it
        // by id (a real reload, as 2.7 has its reference Deal Element open straight after the opportunity's own reload)
        // and let the page settle before the line is added
        if (!runRef.leadId) throw new Error('Reference opportunity id is unknown - Pre-condition 5 did not record it');
        await refDe.openRecordFormById(baseUrl, 'crm.lead', runRef.leadId);
        await openDealElementFromOpportunity(refPageNow);
        await refDe.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
        await lineStep(refDe, 'reference', ref);
        await promotionStep(refPageNow, refDe, testInfo, checks, 'reference', ref);
      });

      await test.step(STEP.s3s2, async () => {
        console.log(`\n--- ${STEP.s3s2} ---`);
        await rewardStep(refPageNow, refDe, runRef, testInfo, checks, 'reference', ref);
      });
    });

    // ================= Step 4 (compare) =================
    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await compareStep(page, testInfo, checks, crm, ref);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
