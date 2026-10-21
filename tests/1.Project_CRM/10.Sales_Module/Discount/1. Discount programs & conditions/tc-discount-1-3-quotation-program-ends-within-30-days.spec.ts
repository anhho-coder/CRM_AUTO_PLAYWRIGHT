import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, QuotationPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_BASELINE,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  idFromUrl,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
  ProgramOwner,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.3 - Pick a program that ends within the next 30 days on a quotation   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.3
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.3 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Program editor = CRM administrator (users.admin_crm) over JSON-RPC (ProgramOwner);
 *                    Salesperson = Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - Step 1 (scheduled action "NAKIVO Promotion: sync catalogue from Discount Service"): not on the reference system -
 *     programs are records there, there is no catalogue sync. Logged, no assertion.
 *   - "Program editor" -> sale.coupon.program record created over JSON-RPC by ProgramOwner (Valid to = today + 10 at 23:59:59 UTC).
 *   - Validity dates are read in UTC (today + 30 default; the program's Valid to date = today + 10).
 *   - Step 6 "Clear Promotion" clears the field on the quotation (DealElementPage works on any sale.order form).
 *
 * Summary
 * -------
 * A new quotation takes Validity = today + 30; picking the program (Valid to = today + 10) moves Validity to that date,
 * and clearing Promotion leaves Validity on it. Edits are discarded at the end.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.3, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Program: 5 %, scope order, customer = Disc-Cust-<timestamp>, Valid to = within 30 days, 23:59:59 (UTC)
 *       (run by an administrator: the CRM administrator, users.admin_crm)
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD); salesperson login
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. As the administrator, Settings > Technical > Scheduled Actions, run "NAKIVO Promotion: sync catalogue from Discount Service"
 *    2. Open the opportunity and click DEAL ELEMENT (payment terms rule)
 *    3. On Order Lines, add A2160B Qty 1, click Save, then click New quotation
 *    4. Read the quotation's Validity
 *         -> Expected: Validity = today + 30 days
 *    5. Pick the program in Promotion (Edit the quotation first)
 *         -> Expected: Validity changes to the date in the Valid to cell (today + 10)
 *    6. Clear Promotion
 *         -> Expected: Validity stays on the Valid to date
 *    7. Clean-up (discard the quotation edits)
 * ================================================================================================
 */

const TC = 'Discount_1.3';
const PROGRAM_PREFIX = 'AUTO-Discount-1.3';

/** A UTC calendar day `offset` days from today. */
function utcDay(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** Odoo datetime 'YYYY-MM-DD HH:mm:ss' for a UTC day. */
const stamp = (d: Date, hms: string) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${hms}`;
/** MM/DD/YYYY as the Validity field shows it. */
const mdy = (d: Date) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Program editor login - the administrator who runs the scheduled action of the source TC (users.admin_crm), over JSON-RPC; program AUTO-Discount-1.3-<timestamp> with Valid to = within 30 days, 23:59:59 (UTC)',
  pre2: 'Pre-condition 2: Login to pre-production (Odoo 12 EE, the reference system) as the salesperson in Sales / User: Own Documents Only (Thomas Semerich); Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: '[NOT ON THE REFERENCE SYSTEM - programs are records, there is no catalogue sync] Step 1: As the administrator, Settings > Technical > Scheduled Actions, run "NAKIVO Promotion: sync catalogue from Discount Service"',
  s2: 'Step 2: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s3: 'Step 3: On Order Lines, add A2160B Qty 1, click Save, then click New quotation',
  s4: 'Step 4: Read the quotation\'s Validity',
  s5: 'Step 5: Pick the program in Promotion (Edit the quotation first)',
  s6: 'Step 6: Clear Promotion',
  s7: '[done by the afterEach teardown] Step 7: Clean-up (discard the quotation edits; the teardown removes the quotation)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Pick a program that ends within the next 30 days on a quotation (pre-prod baseline of CRM-12144_1.3)`, () => {
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

  test(`${TC}: Pick a program that ends within the next 30 days on a quotation`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];
    const programName = `${PROGRAM_PREFIX}-${run.ts}`;
    const validToDay = utcDay(10);
    const defaultValidity = utcDay(30);

    const owner = await ProgramOwner.open();
    openedOwner = owner;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await owner.createProgram(run, {
        name: programName,
        percent: 5,
        scope: 'order',
        customerName: run.company,
        validTo: stamp(validToDay, '23:59:59'),
      });
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signIn(page, SALES);
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
      console.log('  - Not on the reference system: programs are records (sale.coupon.program); no catalogue sync exists. No assertion.');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.noProgramProduct, 1);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '21.00');
      await saveDealElement(page, run);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - new quotation');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const validity = await quotationPage.getFieldDisplayValue('validity_date');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - quotation Validity = today + 30 days', expected: mdy(defaultValidity), actual: validity || '(empty)', passed: validity.trim() === mdy(defaultValidity) },
      ], `${TC} - Step 4 Validity on the new quotation`, [DISCOUNT_HIGHLIGHT.totals]);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await quotationPage.clickEdit();
      await dealElementPage.setPromotion(programName);
      const validity = await dealElementPage.getValidityValue();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 5 - Validity = the Valid to date of the program', expected: mdy(validToDay), actual: validity || '(empty)', passed: validity.trim() === mdy(validToDay) },
      ], `${TC} - Step 5 Validity after picking the program`, [DISCOUNT_HIGHLIGHT.promotionField]);
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await dealElementPage.clearPromotion();
      const validity = await dealElementPage.getValidityValue();
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 6 - Validity stays on the Valid to date', expected: mdy(validToDay), actual: validity || '(empty)', passed: validity.trim() === mdy(validToDay) },
      ], `${TC} - Step 6 Validity after clearing Promotion`, [DISCOUNT_HIGHLIGHT.promotionField]);
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await quotationPage.discardChanges().catch(() => {});
      console.log('  - Quotation edits discarded; the run records are removed by the teardown');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
