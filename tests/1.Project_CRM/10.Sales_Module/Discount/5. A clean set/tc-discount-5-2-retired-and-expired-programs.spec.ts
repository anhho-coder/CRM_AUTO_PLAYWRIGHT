import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_5.2 - Look for retired and expired programs on a new order and in the Program editor
 *                 (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_5.2
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_5.2 (crm-mig manual TC, master "Migration - Discount") - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591
 * Source version   : master row CRM-12144_5.2 as read 2026-10-21 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *                    Program editor reads: CRM administrator over JSON-RPC (users.admin_crm, see ProgramOwner)
 *
 * Summary
 * -------
 * No retired program and no program past its validity end date is offered on a new order.
 * "Trade-in Promotion 5%" (program id 28, valid to 2026-09-30 16:59:59) must not be listed.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_5\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_5.2, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Title: "Look for retired and expired programs on a new order and in the Program editor"
 *  Pre-conditions: Thomas Semerich; Company Disc-Cust (Public Pricelist USD); opportunity (as in 5.1)
 *  Steps
 *    1. In the Program editor, open the program table of the active version
 *    2. Open the opportunity, DEAL ELEMENT (payment terms rule), add A2144B Qty 5 and open the Promotion list
 *  Expected
 *    2. No retired program is listed, and no program past its validity end date (e.g. "Trade-in Promotion 5%",
 *       valid to 2026-09-30)
 *       -> asserted: "Trade-in Promotion 5%" is not listed; every listed program's rule_date_to (read over
 *          the API) is empty or in the future.
 *       -> Observation (not scored): "no row exists for a program the audit retired" - there is no audit on the
 *          reference system.
 * ================================================================================================
 */

const TC = 'Discount_5.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: '[INTERNAL check, Call API] Step 1: In the Program editor, open the program table of the active version',
  s2: 'Step 2: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5 and open the Promotion list',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;
const EXPIRED_PROGRAM = 'Trade-in Promotion 5%';

test.describe(`${TC} - Retired and expired programs (pre-prod baseline of CRM-12144_5.2)`, () => {
  let run: DiscountRun;
  let owner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await owner?.close();
    owner = undefined;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Retired and expired programs on a new order and in the Program editor`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - company created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log('  The reference system has no Program editor screen: its programs are sale.coupon.program records (read over the API as the CRM administrator).');
      owner = await ProgramOwner.open();
      const programs: Array<{ id: number; name: string; rule_date_from: string | false; rule_date_to: string | false; active: boolean }> =
        await owner.call('sale.coupon.program', 'search_read', [[['active', '=', true]]], { fields: ['name', 'rule_date_from', 'rule_date_to', 'active'], limit: 50 });
      console.log(`  - Active programs on the reference system: ${programs.length}`);
      for (const p of programs) console.log(`    - ${p.name.padEnd(70)} | valid from ${p.rule_date_from || '-'} | valid to ${p.rule_date_to || '-'}`);
      console.log('  Observation (not scored): "no row exists for a program the audit retired" cannot be checked - no audit on the reference system.');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.blurForm();
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      console.log(`  - Promotion list (${options.length}): ${options.join(' | ') || '(empty)'}`);

      // rule_date_to of every listed program, read over the API (matched by exact name)
      const programs: Array<{ name: string; rule_date_to: string | false }> = owner
        ? await owner.call('sale.coupon.program', 'search_read', [[['active', '=', true]]], { fields: ['name', 'rule_date_to'], limit: 50 })
        : [];
      const now = Date.now();
      const listedDetail = options.map((name) => {
        const p = programs.find((x) => x.name === name);
        if (!p) return { name, valid: false, text: 'no active program record with that name' };
        const endsOk = !p.rule_date_to || Date.parse(`${p.rule_date_to}Z`) >= now;
        return { name, valid: endsOk, text: `rule_date_to ${p.rule_date_to || '(empty)'}` };
      });
      listedDetail.forEach((d) => console.log(`    - ${d.name} : ${d.text}`));

      await recordChecks(page, testInfo, checks, [
        {
          what: `Step 2 - "${EXPIRED_PROGRAM}" is not listed`,
          expected: 'not listed',
          actual: options.includes(EXPIRED_PROGRAM) ? 'listed' : 'not listed',
          passed: !options.includes(EXPIRED_PROGRAM),
        },
        {
          what: 'Step 2 - every listed program is empty or ends in the future (rule_date_to over the API)',
          expected: 'all listed programs valid',
          actual: listedDetail.filter((d) => !d.valid).map((d) => `${d.name}: ${d.text}`).join(' | ') || `${listedDetail.length} listed, all valid`,
          passed: listedDetail.every((d) => d.valid),
        },
      ], `${TC} - Step 2 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Promotion list open');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
