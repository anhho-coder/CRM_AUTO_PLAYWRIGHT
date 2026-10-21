import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { DealElementPage, HomePage, OpportunityPage, PromotionPage } from '@pages';
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
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_1.15 - Look for a way to create or change programs in the CRM as a salesperson   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_1.15
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Mirrors          : CRM-12144_1.15 (crm-mig manual TC, master "Migration - Discount") - same steps, same expected
 *                    results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : N/A - manual TC provided inline (baseline rows go to master + Xray once green)
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Adaptations to the reference system (reason)
 *   - "In crm-mig" -> pre-production (this spec runs on the reference system).
 *   - Expected 1 is read from the app menu entries of the CRM and Sales apps as Thomas sees them.
 *
 * Summary
 * -------
 * No CRM or Sales menu of the salesperson creates or edits Discount Programs; the Promotion field of a Deal Element
 * lists programs to pick and offers no "Create ..." entry and no external-link button.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_1\.15:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.15, adapted to the reference system)
 * ------------------------------------------------------------------------------------------------
 *  Pre-conditions
 *    1. Login as a salesperson (Thomas Semerich, Sales / User: Own Documents Only)
 *    2. Company Disc-Cust-<timestamp> (end customer, Public Pricelist USD)
 *    3. Opportunity Disc-Opp-<timestamp> for that company
 *  Steps
 *    1. Open the Sales and CRM menus
 *         -> Expected: no menu creates or edits Discount Programs in the CRM
 *    2. Open the opportunity and click DEAL ELEMENT (payment terms rule), add A2144B Qty 5 and open the Promotion field
 *         -> Expected: Promotion only lists programs to pick; it offers no way to create or edit one
 * ================================================================================================
 */

const TC = 'Discount_1.15';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the Sales and CRM menus',
  s2: 'Step 2: Open the opportunity and click DEAL ELEMENT (payment terms rule), add A2144B Qty 5 and open the Promotion field',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;
/** A menu entry that would create or edit a discount program. */
const PROGRAM_MENU = /promotion|coupon|discount program/i;

test.describe(`${TC} - Look for a way to create or change programs in the CRM as a salesperson (pre-prod baseline of CRM-12144_1.15)`, () => {
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

  test(`${TC}: Look for a way to create or change programs in the CRM as a salesperson`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const homePage = new HomePage(page);
    const promotionPage = new PromotionPage(page);
    const opportunityPage = new OpportunityPage(page);
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
      await homePage.returnToHome();
      await homePage.waitForPageFullyLoaded();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      const crmEntries = await homePage.getCurrentAppMenuEntries();
      await promotionPage.openSalesModule();
      const salesEntries = await homePage.getCurrentAppMenuEntries();
      console.log(`  - CRM menu entries   : ${JSON.stringify(crmEntries)}`);
      console.log(`  - Sales menu entries : ${JSON.stringify(salesEntries)}`);
      const programMenus = [...crmEntries, ...salesEntries].filter((t) => PROGRAM_MENU.test(t));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - no CRM or Sales menu creates or edits Discount Programs', expected: 'no "Promotion" / "Coupon" / "Discount program" entry', actual: programMenus.length ? programMenus.join(' | ') : 'none', passed: programMenus.length === 0 },
      ], `${TC} - Step 1 menus`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      const entries = await dealElementPage.getPromotionDropdownEntries('');
      const hasExternal = await dealElementPage.hasPromotionExternalLink();
      const createEntries = entries.filter((e) => /^create/i.test(e));
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the Promotion field offers no "Create ..." / "Create and Edit..." entry', expected: 'none', actual: createEntries.length ? createEntries.join(' | ') : 'none', passed: createEntries.length === 0 },
        { what: 'Step 2 - the Promotion field has no external-link button (no way to open a program form)', expected: 'no external link', actual: hasExternal ? 'external link present' : 'no external link', passed: !hasExternal },
      ], `${TC} - Step 2 Promotion field`, [DISCOUNT_HIGHLIGHT.promotionList]);
      await dealElementPage.closePromotionList();
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
