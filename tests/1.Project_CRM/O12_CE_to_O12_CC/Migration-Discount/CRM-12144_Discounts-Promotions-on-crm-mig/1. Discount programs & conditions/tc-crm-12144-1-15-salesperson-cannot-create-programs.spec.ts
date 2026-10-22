import { test } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, HomePageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  newDiscountRun,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.15 - Look for a way to create or change programs in the CRM as a salesperson   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.15
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 32, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_1.15 (Jira CRM-13777; tests/1.Project_CRM/10.Sales_Module/Discount/1. Discount programs & conditions/
 *                    tc-discount-1-15-salesperson-cannot-create-programs.spec.ts) - assertions ported unchanged
 * Spec             : IS-CRM-SEC-0010 (master row title)
 * Source version   : master row CRM-12144_1.15 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * No CRM or Sales menu of the salesperson creates or edits Discount Programs; the Promotion field of a Deal Element
 * lists programs to pick and offers no "Create ..." entry and no external-link button.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.15:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.15, master "Migration - Discount" row 32, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Look for a way to create or change programs in the CRM as a salesperson (IS-CRM-SEC-0010)
 *  Priority: P3 | Spec Areas: SEC-0010 - no editing in CRM
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
 *    1. Open the Sales and CRM menus
 *    2. Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion field
 *
 *  Expected Results:
 *    1. No menu creates or edits Discount Programs in the CRM (programs are kept in the Program editor)
 *    2. Promotion only lists programs to pick; it offers no way to create or edit one
 *
 *  Port notes: HomePage -> HomePageMig for returnToHome() and navigateToCRM(), which click navbar links the sidebar theme
 *  hides (HomePageMig opens them by URL hash); getCurrentAppMenuEntries(), waitForPageFullyLoaded(), openSalesModule() kept
 *  (DOM read / no Mig equivalent / URL-based). DealElementPageMig; printVerifyAndAssertMig; teardown + afterAll sweep by run.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.15';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, Type = end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  s1: 'Step 1: Open the Sales and CRM menus',
  s2: 'Step 2: Open the opportunity and click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment, add A2144B with Ordered Qty 5 and open the Promotion field',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];
/** A menu entry that would create or edit a discount program. */
const PROGRAM_MENU = /promotion|coupon|discount program/i;

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Look for a way to create or change programs in the CRM as a salesperson (crm-mig)`, () => {
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

  test(`${TC}: Look for a way to create or change programs in the CRM as a salesperson`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const homePage = new HomePageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
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
      // no returnToHome(): on crm-mig it opens the "Apps" root menu, which a salesperson does not have (2026-10-21:
      // "no root menu named Apps") - the CRM and Sales apps are opened directly by their root-menu actions
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      const crmEntries = await homePage.getCurrentAppMenuEntries();
      // Mig: the Sales tile is hidden by the sidebar theme - open the app by its root-menu action, when the user has one
      const salesOpened = await homePage.navigateToSales();
      const salesEntries = salesOpened ? await homePage.getCurrentAppMenuEntries() : [];
      if (!salesOpened) console.log('  Observation (not scored) - crm-mig gives this salesperson no "Sales" root app; the sales menus are the "Sales" section of the CRM app, read above');
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
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
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
      printVerifyAndAssertMig(checks);
    });
  });
});
