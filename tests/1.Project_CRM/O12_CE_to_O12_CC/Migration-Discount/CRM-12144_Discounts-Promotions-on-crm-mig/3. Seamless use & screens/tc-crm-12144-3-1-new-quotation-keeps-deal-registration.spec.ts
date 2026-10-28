import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPageMig, QuotationPageMig } from '@pages/mig';
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
  newQuotationMig,
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
 *  CRM-12144_3.1 - Create a quotation from a Deal Element carrying Deal registration   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_3.1
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 43, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_3.1 (Jira CRM-13786; tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/
 *                    tc-discount-3-1-new-quotation-keeps-deal-registration.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0082
 * Source version   : master row CRM-12144_3.1 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * New quotation from a Deal Element carrying Deal registration (A2144B x 5) keeps the program and one -164.50 reward
 * line (Total 1,480.50); raising the quotation's quantity to 6 recomputes the reward to -197.40.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_3\.1:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.1, master "Migration - Discount")
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
 *  Executed Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5, pick Deal registration and click Save
 *    2. Click New quotation
 *    3. Change Ordered Qty to 6 and click Save
 *  Expected Results
 *    2. Promotion = Deal registration; exactly one reward line of -164.50; Total = 1,480.50
 *    3. The reward line = -197.40
 *
 *  Port notes : accounts *_crm_mig; Mig helpers and Mig list readers; New quotation = newQuotationMig (created in place).
 * ================================================================================================
 */

const TC = 'CRM-12144_3.1';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 5, pick Deal registration and click Save',
  s2: 'Step 2: Click New quotation',
  s3: 'Step 3: Change Ordered Qty to 6 and click Save',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Create a quotation from a Deal Element carrying Deal registration (crm-mig)`, () => {
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

  test(`${TC}: Create a quotation from a Deal Element carrying Deal registration`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
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

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log(`  - Quotation id : ${qId}`);
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      const total = await quotationPage.getFieldDisplayValue('amount_total');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - quotation Promotion', expected: DISCOUNT_MIG.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_MIG.dealRegistration },
        { what: 'Step 2 - exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 2 - reward line amount', expected: '-164.50', actual: rewards[0]?.['Subtotal'] ?? '(none)', passed: money(rewards[0]?.['Subtotal'] ?? '') === -164.5 },
        { what: 'Step 2 - quotation Total', expected: '1,480.50', actual: total, passed: money(total) === 1480.5 },
      ], `${TC} - Step 2 quotation keeps Deal registration`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines, DISCOUNT_HIGHLIGHT.totals]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - quotation created from the Deal Element');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await quotationPage.clickEdit();
      const set = await quotationPage.setOrderLineQuantity('A2144B', 6);
      console.log(`  - Ordered Qty 6 typed : ${set}`);
      await quotationPage.saveQuotation(CommonUtils.waitTimes.savingPage);
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      console.log(`  - Total after Save : ${await quotationPage.getFieldDisplayValue('amount_total')}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - exactly one reward line after the change', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
        { what: 'Step 3 - reward line amount at qty 6', expected: '-197.40', actual: rewards[0]?.['Subtotal'] ?? '(none)', passed: money(rewards[0]?.['Subtotal'] ?? '') === -197.4 },
      ], `${TC} - Step 3 reward recomputed on the quotation`, [DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - quotation at qty 6');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
