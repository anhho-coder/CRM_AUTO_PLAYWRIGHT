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
  money,
  newDiscountRun,
  idFromUrl,
  signIn,
  createEndCustomerCompany,
  createOpportunityForCompany,
  openDealElementFromOpportunity,
  saveDealElement,
  rewardRows,
  recordChecks,
  printVerifyAndAssert,
  teardownDiscountRun,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_2.3 - Read the reward line of a quotation created from a Deal Element carrying Deal registration
 *                 (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_2.3
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_2.3 (crm-mig manual TC, master "Migration - Discount" row 36) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13780
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0078
 * Source version   : master row CRM-12144_2.3 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * The quotation made from a Deal Element carrying Deal registration (A2144B x 5) holds exactly one reward line:
 * "10.0% discount on products", Description = the program's name, Ordered Qty 1, Subtotal -164.50, no taxes.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_2\.3:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_2.3, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login to pre-production as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)
 *    2. Contacts > Create a new company:
 *         - Name        = Disc-Cust-<timestamp>
 *         - Type        = Company - end customer (no Reseller, no Distributor)
 *         - Email       = disc.cust.<timestamp>@d<timestamp>.discautotest.com
 *         - Country     = United States
 *         - State       = Maryland
 *         - Sales Team  = BDEU
 *         - Salesperson = Thomas Semerich
 *         - Pricelist   = Public Pricelist_USD   (crm-mig: "Public Pricelist (USD)")
 *    3. CRM > Pipeline (LIST view) > Create a new opportunity:
 *         - Name         = Disc-Opp-<timestamp>
 *         - Email        = the company's e-mail (links Company = Disc-Cust-<timestamp>)
 *         - Company Name = Disc-Cust-<timestamp>
 *         - Street       = 123 street
 *         - Country      = United States
 *         - State        = Maryland
 *         - Sales Team   = BDEU
 *         - Salesperson  = Thomas Semerich
 *         - Lead Form    = Download Free Trial
 *         - Stage        = New
 *  Steps
 *    1. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment
 *    2. On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save
 *    3. Click New quotation
 *         -> Expected: the quotation has exactly one reward line
 *    4. Open the reward line (click its row on the quotation's Order Lines - the line form opens in a dialog; the
 *       list itself shows Ordered Qty / Unit Price blank on a reward line, so the values are read from the line)
 *         -> Expected: the reward line has:
 *              _ Product     = "10.0% discount on products"
 *              _ Description = the program's name
 *              _ Ordered Qty = 1
 *              _ Subtotal    = -164.50
 *              _ Taxes       = none
 * ================================================================================================
 */

const TC = 'Discount_2.3';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment',
  s2: 'Step 2: On Order Lines, add A2144B with Ordered Qty 5, pick Deal registration and click Save',
  s3: 'Step 3: Click New quotation',
  s4: 'Step 4: Open the reward line',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Read the reward line of a quotation created from a Deal Element carrying Deal registration (pre-prod baseline of CRM-12144_2.3)`, () => {
  let run: DiscountRun;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    run = newDiscountRun();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (!SKIP_CLEANUP) await teardownDiscountRun(page, run, testInfo);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC}: Read the reward line of a quotation created from a Deal Element carrying Deal registration`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];
    let quotationRewards: Array<Record<string, string>> = [];

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
      await openDealElementFromOpportunity(page);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      console.log(`  - Deal Element reward lines : ${rewardRows(await dealElementPage.getAllOrderLineRows()).length}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'}`);
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
      const line = await quotationPage.openOrderLineDialog(DISCOUNT_BASELINE.dealRegistrationProduct);
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
        { what: 'Step 4 - reward line Product', expected: DISCOUNT_BASELINE.dealRegistrationProduct, actual: product, passed: product.startsWith(DISCOUNT_BASELINE.dealRegistrationProduct) },
        { what: "Step 4 - reward line Description = the program's name", expected: DISCOUNT_BASELINE.dealRegistration, actual: description, passed: description.startsWith(DISCOUNT_BASELINE.dealRegistration) },
        { what: 'Step 4 - reward line Ordered Qty', expected: '1', actual: qty || '(empty)', passed: money(qty) === 1 },
        { what: 'Step 4 - reward line Subtotal', expected: '-164.50', actual: subtotal, passed: money(subtotal) === -164.5 },
        { what: 'Step 4 - reward line Taxes', expected: 'none', actual: taxes.replace(/ \(from the list.*$/, '') || '(none)', passed: taxes.replace(/ \(from the list.*$/, '').trim() === '' },
      ], `${TC} - Step 4 reward line fields`, ['.modal-dialog']);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-4 - quotation reward line opened');
      await quotationPage.closeOrderLineDialog();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
