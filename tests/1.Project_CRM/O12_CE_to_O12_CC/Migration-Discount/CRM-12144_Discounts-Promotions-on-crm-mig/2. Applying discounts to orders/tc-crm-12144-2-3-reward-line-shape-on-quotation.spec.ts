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
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_2.3 - Read the reward line of a quotation created from a Deal Element carrying Deal registration   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_2.3
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 36, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_2.3 (Jira CRM-13780; tests/1.Project_CRM/10.Sales_Module/Discount/2. Applying discounts to orders/
 *                    tc-discount-2-3-reward-line-shape-on-quotation.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0078
 * Source version   : master row CRM-12144_2.3 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * The quotation made from a Deal Element carrying Deal registration (A2144B x 5) holds exactly one reward line:
 * "10.0% discount on products", Description = the program's name, Ordered Qty 1, Subtotal -164.50, no taxes.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_2\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.3, master "Migration - Discount" row 36, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Read the reward line of a quotation created from a Deal Element carrying Deal registration (IS-CRM-FUNC-0078)
 *  Priority: P1 | Spec Areas: 0078 - reward line shape
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)
 *      Create a new company in Contacts with:
 *        _ Name = Disc-Cust-<timestamp>
 *        _ Type = end customer (no Reseller, no Distributor)
 *        _ Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with:
 *        _ Name = Disc-Opp-<timestamp>
 *        _ Customer = Disc-Cust-<timestamp>
 *
 *  Executed Steps:
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save
 *    3. Click New quotation
 *    4. Open the reward line
 *
 *  Expected Results:
 *    3. The quotation has exactly one reward line
 *    4. The reward line has:
 *      _ Product = "10.0% discount on products"
 *      _ Description = the program's name
 *      _ Ordered Qty = 1
 *      _ Subtotal = -164.50
 *      _ Taxes = none
 *
 *  Port notes: users.sale_ic_thomas_crm_mig; "Click New quotation" through newQuotationMig (in place ~45 s later);
 *  QuotationPageMig reads the quotation rows; openOrderLineDialog / closeOrderLineDialog / dismissErrorDialogWithRetry are the
 *  base methods, kept; the '.modal-dialog' highlight is the baseline's raw selector. No assertion or expected value changed.
 * ================================================================================================
 */

const TC = 'CRM-12144_2.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save',
  s3: 'Step 3: Click New quotation (crm-mig creates the quotation in place ~45 s later and stays on the Deal Element - newQuotationMig waits for it)',
  s4: 'Step 4: Open the reward line (the line form opens in a dialog; the list leaves Ordered Qty / Unit Price blank on a reward line, so the values are read from the line)',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Read the reward line of a quotation created from a Deal Element carrying Deal registration (crm-mig)`, () => {
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

  test(`${TC}: Read the reward line of a quotation created from a Deal Element carrying Deal registration`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    let quotationRewards: Array<Record<string, string>> = [];

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
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      console.log(`  - Deal Element reward lines : ${rewardRows(await dealElementPage.getAllOrderLineRows()).length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log(`  - Quotation id : ${qId}`);
      quotationRewards = rewardRows(await quotationPage.getAllOrderLineRows());
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 3 - the quotation has exactly one reward line', expected: '1', actual: String(quotationRewards.length), passed: quotationRewards.length === 1 },
      ], `${TC} - Step 3 one reward line on the quotation`, [DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const listRow = quotationRewards[0] ?? {};
      for (const [k, v] of Object.entries(listRow)) console.log(`  - list ${k.padEnd(28)} : ${v}`);
      // the list leaves Ordered Qty / Unit Price blank on a reward line - read the opened line instead
      const line = await quotationPage.openOrderLineDialog(DISCOUNT_MIG.dealRegistrationProduct);
      const pick = (re: RegExp, listKey: string): string => {
        const key = Object.keys(line).find((k) => re.test(k));
        if (key) return line[key];
        return listRow[listKey] !== undefined ? `${listRow[listKey]} (from the list - not on the line form)` : '(not shown)';
      };
      const product = pick(/^product$/i, 'Product');
      const description = pick(/^description$/i, 'Description');
      const qty = pick(/^(ordered )?(qty|quantity)/i, 'Ordered Qty');
      const subtotal = pick(/^subtotal$/i, 'Subtotal');
      const taxes = pick(/^taxes$/i, 'Taxes');
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - reward line Product', expected: DISCOUNT_MIG.dealRegistrationProduct, actual: product, passed: product.startsWith(DISCOUNT_MIG.dealRegistrationProduct) },
        { what: "Step 4 - reward line Description = the program's name", expected: DISCOUNT_MIG.dealRegistration, actual: description, passed: description.startsWith(DISCOUNT_MIG.dealRegistration) },
        { what: 'Step 4 - reward line Ordered Qty', expected: '1', actual: qty || '(empty)', passed: money(qty) === 1 },
        { what: 'Step 4 - reward line Subtotal', expected: '-164.50', actual: subtotal, passed: money(subtotal) === -164.5 },
        { what: 'Step 4 - reward line Taxes', expected: 'none', actual: taxes.replace(/ \(from the list.*$/, '') || '(none)', passed: taxes.replace(/ \(from the list.*$/, '').trim() === '' },
      ], `${TC} - Step 4 reward line fields`, ['.modal-dialog']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-4 - quotation reward line opened');
      await quotationPage.closeOrderLineDialog();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
