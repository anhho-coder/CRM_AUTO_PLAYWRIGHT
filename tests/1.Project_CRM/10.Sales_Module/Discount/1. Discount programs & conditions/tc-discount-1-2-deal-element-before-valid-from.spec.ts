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
 *  Discount_1.2 - Open a Deal Element dated before the program's Valid from date   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.2
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.2 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13765
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - "Program editor" -> sale.coupon.program record created over JSON-RPC by ProgramOwner (Valid from = tomorrow 00:00:00 UTC).
 *   - "In crm-mig" -> pre-production (this spec runs on the reference system).
 *
 * Summary
 * -------
 * A 5 % order program with Valid from = tomorrow is not offered in the Promotion list of a Deal Element dated today.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.2, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program: 5 %, scope order, customer = Disc-Cust-<timestamp>, Valid from = tomorrow 00:00:00 (UTC)
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD)
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT (payment terms rule)
 *    2. On Order Lines, add A2160B with Ordered Qty 1
 *    3. Open the Promotion list
 *         -> Expected: the list does not contain the program
 *    4. Clean-up
 * ================================================================================================
 */

const TC = 'Discount_1.2';
const PROGRAM_PREFIX = 'AUTO-Discount-1.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the CRM administrator (users.admin_crm) over JSON-RPC, the program owner of the reference system',
  pre2: 'Pre-condition 2: [program owner, JSON-RPC] Create the program AUTO-Discount-1.2-<timestamp>: 5 %, scope order, customer = Disc-Cust-<timestamp>, Valid from = tomorrow 00:00:00 (UTC)',
  pre3: 'Pre-condition 3: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre4: 'Pre-condition 4: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre5: 'Pre-condition 5: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2160B with Ordered Qty 1',
  s3: 'Step 3: Open the Promotion list',
  s4: '[done by the afterEach teardown] Step 4: Clean-up',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

/** Tomorrow 00:00:00 UTC as Odoo stores datetimes. */
function tomorrowStartUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} 00:00:00`;
}

test.describe(`${TC} - Open a Deal Element dated before the program's Valid from date (pre-prod baseline of CRM-12144_1.2)`, () => {
  let run: DiscountRun;
  let openedOwner: ProgramOwner | undefined;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
    openedOwner = undefined;
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (openedOwner) {
      await openedOwner.close().catch(() => {});
      openedOwner = undefined;
    }
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Open a Deal Element dated before the program's Valid from date`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const checks: Check[] = [];
    const programName = `${PROGRAM_PREFIX}-${run.ts}`;

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Program editor : ${users.admin_crm.username} (${users.admin_crm.displayName}), JSON-RPC session opened`);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await owner.createProgram(run, {
        name: programName,
        percent: 5,
        scope: 'order',
        customerName: run.company,
        validFrom: tomorrowStartUtc(),
      });
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - signed in as the salesperson');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await createEndCustomerCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - company created');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      await createOpportunityForCompany(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 5 - opportunity created');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const options = await dealElementPage.getPromotionOptions('', { keepOpen: true });
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the Promotion list does not contain the program', expected: `not ${programName}`, actual: options.join(' | ') || '(empty)', passed: !options.includes(programName) },
      ], `${TC} - Step 3 Promotion list`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      console.log(`  - Program ${programName} and the run's records are removed by the teardown`);
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
