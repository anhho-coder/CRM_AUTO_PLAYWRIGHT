import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { PromotionPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  signIn,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_3.4 - View a program's conditions and percentage in the Program editor   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_3.4
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_3.4 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Sales / Manager - users.admin_crm (the account that keeps programs on the reference system)
 *                    - no program is created or changed by this TC
 *
 * Adaptations to the reference system (reason)
 *   - "Program editor" -> Sales > Promotion Programs list (sale.coupon.program) on pre-production, read as users.admin_crm.
 *     No version exists on Odoo 12 EE, so "the table of the active version" is the list of active programs.
 *   - Expected 1 (the crm-mig Program editor columns) is not met by the reference list: the list columns are logged as an
 *     Observation (not scored); what IS scored is that the list opens and lists the Deal registration row.
 *   - Expected 2 is read from the program FORM (open the row): reward percent, apply-on, specific products, minimum amount.
 *
 * Summary
 * -------
 * The Deal registration program on pre-production: 10 % on specific products (A2144B among them), minimum amount 1,400.00 USD.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_3\.4:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.4, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as users.admin_crm (Sales / Manager)
 *  Steps
 *    1. Open the program table of the active version
 *         -> Expected: the Program editor columns (Promo code, Name, Reward percent, Scope, Target product codes and the
 *            condition columns) - reference system: see the Observation in the log
 *    2. Read the Deal registration row
 *         -> Expected: Reward percent = 10; Scope = specific products; the qualifying products include A2144B;
 *            the minimum amount is 1,400.00 (USD)
 * ================================================================================================
 */

const TC = 'Discount_3.4';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as users.admin_crm (Sales / Manager)',
  s1: 'Step 1: Open the program table of the active version',
  s2: 'Step 2: Read the Deal registration row',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const READER = users.admin_crm;

test.describe(`${TC} - View a program's conditions and percentage in the Program editor (pre-prod baseline of CRM-12144_3.4)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo); // this TC creates nothing: the teardown finds no records
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: View a program's conditions and percentage in the Program editor`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const promotionPage = new PromotionPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : pre-production`);
      console.log(`  - Login : ${READER.username} (${READER.displayName})`);
      await signIn(page, READER);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in as the program keeper');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await promotionPage.openSalesModule();
      await promotionPage.navigateToPromotionPrograms();
      const columns = await promotionPage.getProgramListColumns();
      console.log(`  Observation (not scored) - list columns on the reference system: ${JSON.stringify(columns)}`);
      const rowCount = await promotionPage.countProgramRows(DISCOUNT_BASELINE.dealRegistration);
      await recordChecks(page, testInfo, checks, [
        {
          what: 'Step 1 - the Promotion Programs list opens and lists the Deal registration row',
          expected: DISCOUNT_BASELINE.dealRegistration,
          actual: rowCount ? `listed (${rowCount} row)` : '(not listed)',
          passed: rowCount >= 1,
        },
      ], `${TC} - Step 1 Promotion Programs list`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await promotionPage.openProgramByName(DISCOUNT_BASELINE.dealRegistration);
      const percent = await quotationPage.getFieldDisplayValue('discount_percentage');
      const applyOn = await quotationPage.getFieldDisplayValue('discount_apply_on');
      const specific = await quotationPage.getFieldDisplayValue('discount_specific_product_ids');
      const minAmount = await quotationPage.getFieldDisplayValue('rule_minimum_amount');
      console.log(`  - Reward percent (discount_percentage)        : ${percent || '(not shown)'}`);
      console.log(`  - Apply Discount On (discount_apply_on)       : ${applyOn || '(not shown)'}`);
      console.log(`  - Specific products (discount_specific_product_ids): ${specific || '(not shown)'}`);
      console.log(`  - Minimum amount (rule_minimum_amount)        : ${minAmount || '(not shown)'}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - Reward percent', expected: '10', actual: percent || '(not shown)', passed: money(percent) === 10 },
        { what: 'Step 2 - Scope = specific products (Apply Discount On)', expected: 'specific products', actual: applyOn || '(not shown)', passed: /specific/i.test(applyOn) },
        { what: 'Step 2 - qualifying products include A2144B', expected: DISCOUNT_BASELINE.listedProduct, actual: specific || '(not shown)', passed: specific.includes('A2144B') },
        { what: 'Step 2 - minimum amount (USD)', expected: '1,400.00', actual: minAmount || '(not shown)', passed: money(minAmount) === 1400 },
      ], `${TC} - Step 2 Deal registration program form`, []);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Deal registration program form');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
