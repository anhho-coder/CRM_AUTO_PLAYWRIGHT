import { test } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage, DealElementPage, QuotationPage } from '@pages';
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
  findRunCopy,
} from '@helpers/discount-baseline.helper';

/**
 * ================================================================================================
 *  Discount_3.2 - Duplicate a quotation and an opportunity carrying Deal registration   (pre-production BASELINE)
 * ================================================================================================
 * Test Case ID     : Discount_3.2
 * Automation-Type  : new
 * Automation-Date  : 2026-10-20
 * Mirrors          : CRM-12144_3.2 (crm-mig manual TC, master "Migration - Discount" row 44) - same steps,
 *                    same expected results, run on the reference system so crm-mig can be ported 1:1
 * Jira             : CRM-13787
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0082
 * Source version   : master row CRM-12144_3.2 as read 2026-10-20 - re-check before trusting this spec
 * Host             : pre-production (http://pre-production.nakivo.site, Odoo 12 EE = the reference system)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas)
 *
 * Summary
 * -------
 * The header Duplicate of a quotation carrying Deal registration creates a Quotation-state copy (screen stays on the
 * source) with the program and one reward line; the Action menu has no Duplicate; a duplicated opportunity's DE keeps it.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "Discount_3\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.2, adapted to the reference system)
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
 *    4. Open the opportunity, click DEAL ELEMENT, add A2144B with Ordered Qty 5, pick Deal registration, click Save,
 *       then New quotation
 *  Steps
 *    1. On the quotation, click Duplicate in the row of buttons above the form, next to Cancel
 *         -> Expected: a copy is created and the screen STAYS on the source quotation (reference-system behaviour,
 *            accepted as the feature by the tester on 2026-10-21 - CRM-12144_3.2 says "the copy opens"); the copy
 *            is in the Quotation state with Promotion = Deal registration and exactly one reward line of the same amount
 *    2. Open the quotation's Action menu
 *         -> Expected: the Action menu has no Duplicate entry
 *    3. Open the opportunity and pick Duplicate in its Action menu
 *         (reference system, measured 2026-10-21: both Duplicates create the copy server-side and the screen STAYS on
 *          the source - steps 1 and 4 then open the copy by its id, marked [automation aid] in the log)
 *    4. Open the Deal Element of the new opportunity
 *         -> Expected: Promotion = Deal registration; exactly one reward line
 * ================================================================================================
 */

const TC = 'Discount_3.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to pre-production (Odoo 12 EE, the reference system) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: Contacts > Create a new end-customer company Disc-Cust-<timestamp> with Pricelist = Public Pricelist_USD',
  pre3: 'Pre-condition 3: CRM > Pipeline (LIST view) > Create a new opportunity Disc-Opp-<timestamp> whose Company is Disc-Cust-<timestamp>',
  pre4: 'Pre-condition 4: Open the opportunity, click DEAL ELEMENT, add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation',
  s1: 'Step 1: On the quotation, click Duplicate in the row of buttons above the form, next to Cancel',
  s2: "Step 2: Open the quotation's Action menu",
  s3: 'Step 3: Open the opportunity and pick Duplicate in its Action menu',
  s4: 'Step 4: Open the Deal Element of the new opportunity',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging
const SALES = users.sale_ic_thomas;

test.describe(`${TC} - Duplicate a quotation and an opportunity carrying Deal registration (pre-prod baseline of CRM-12144_3.2)`, () => {
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

  test(`${TC}: Duplicate a quotation and an opportunity carrying Deal registration`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPage(page);
    const quotationPage = new QuotationPage(page);
    const checks: Check[] = [];
    let sourceReward = '';
    let newOppId: number | undefined;

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

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_BASELINE.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      await quotationPage.clickNewQuotation(CommonUtils.waitTimes.savingDealElement);
      await quotationPage.waitForPageLoad(CommonUtils.waitTimes.pageLoad);
      await quotationPage.dismissErrorDialogWithRetry();
      const qId = idFromUrl(page.url());
      if (qId) run.saleOrderIds.push(qId);
      sourceReward = rewardRows(await quotationPage.getAllOrderLineRows())[0]?.['Subtotal'] ?? '';
      console.log(`  - Quotation id : ${qId ?? '(not in URL)'} | reward line ${sourceReward || '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - quotation carrying Deal registration');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      const sourceId = idFromUrl(page.url());
      await quotationPage.clickStatusbarButtonByName('action_duplicate');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      const onScreen = idFromUrl(page.url());
      const copyId = await findRunCopy(page, 'sale.order', run, [...run.saleOrderIds]);
      if (copyId) run.saleOrderIds.push(copyId);
      console.log(`  - Source quotation id       : ${sourceId}`);
      console.log(`  - Record on screen after it : ${onScreen}`);
      console.log(`  - Copy created (server)     : ${copyId ?? '(none found)'}`);
      const opened = !!onScreen && onScreen !== sourceId;
      // Expected changed by the tester on 2026-10-21: on the reference system Duplicate creates the copy and the screen
      // STAYS on the source quotation - that is the feature, not a defect (was: "the copy opens")
      const s1: Check[] = [
        {
          what: 'Step 1 - Duplicate creates a copy and the screen stays on the source quotation',
          expected: `a new quotation is created; the screen still shows the source ${sourceId} (moving to another record is a FAIL)`,
          actual: `${copyId ? `copy ${copyId} created` : 'no copy found'}; screen on ${onScreen === sourceId ? `the source ${sourceId}` : `record ${onScreen}`}`,
          passed: !!copyId && onScreen === sourceId,
        },
      ];
      if (copyId) {
        // [automation aid] the screen stayed on the source: open the copy by its id to read it
        if (!opened) await quotationPage.openRecordFormById(baseUrl, 'sale.order', copyId);
        const stage = await quotationPage.getActiveStatusBarStage();
        const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
        const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
        s1.push(
          { what: 'Step 1 - the copy is in the Quotation state', expected: 'Quotation', actual: stage, passed: /^quotation$/i.test(stage.trim()) },
          { what: 'Step 1 - copy Promotion', expected: DISCOUNT_BASELINE.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_BASELINE.dealRegistration },
          { what: 'Step 1 - copy has exactly one reward line of the same amount', expected: `1 line of ${sourceReward}`, actual: `${rewards.length} line(s), ${rewards[0]?.['Subtotal'] ?? '-'}`, passed: rewards.length === 1 && sourceReward !== '' && money(rewards[0]['Subtotal']) === money(sourceReward) },
        );
      } else {
        s1.push({ what: 'Step 1 - a copy exists', expected: 'one new quotation', actual: '(none found)', passed: false });
      }
      await recordChecks(page, testInfo, checks, s1, `${TC} - Step 1 duplicated quotation`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const items = await quotationPage.getControlPanelMenuItems('Action', { keepOpen: true });
      console.log(`  - Action menu entries : ${JSON.stringify(items)}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 - the quotation Action menu has no Duplicate entry', expected: 'no "Duplicate"', actual: items.length ? items.join(' | ') : '(menu empty or absent)', passed: items.length > 0 && !items.some((t) => /^duplicate$/i.test(t)) },
      ], `${TC} - Step 2 quotation Action menu`, ['.o_control_panel .dropdown-menu.show']);
      await quotationPage.closeControlPanelMenu();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 1-2 - copied quotation, Action menu read');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.openByUrlReloaded(run.urlOpp!);
      const items = await opportunityPage.getControlPanelMenuItems('Action', { keepOpen: true });
      console.log(`  - Opportunity Action menu entries : ${JSON.stringify(items)}`);
      await opportunityPage.clickOpenMenuOption('Duplicate');
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      const onScreen = idFromUrl(page.url());
      newOppId = await findRunCopy(page, 'crm.lead', run, [run.leadId!, ...run.extraLeadIds]);
      if (newOppId) run.extraLeadIds.push(newOppId);
      console.log(`  - Record on screen after Duplicate : ${onScreen}`);
      console.log(`  - New opportunity (server)         : ${newOppId ?? '(none found)'}`);
      console.log(`  Observation (not scored - the TC gives step 3 no expected result) - the screen ${onScreen === run.leadId ? 'stays on the source opportunity' : `moved to ${onScreen}`}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - after opportunity Duplicate');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      if (!newOppId) {
        await recordChecks(page, testInfo, checks, [{ what: 'Step 4 - the new opportunity exists', expected: 'one new opportunity', actual: '(none found)', passed: false }], `${TC} - Step 4 no new opportunity`, []);
        return;
      }
      // [automation aid] the screen stayed on the source: open the new opportunity by its id
      await opportunityPage.openByUrlReloaded(`${baseUrl.replace(/\/$/, '')}/web#id=${newOppId}&model=crm.lead&view_type=form`);
      await opportunityPage.clickDealElement();
      await dealElementPage.waitForFormOpen();
      await dealElementPage.dismissErrorDialogWithRetry();
      const deId = idFromUrl(page.url());
      if (deId) run.saleOrderIds.push(deId);
      const promotion = await dealElementPage.getAppliedPromotionName();
      const rows = await dealElementPage.getAllOrderLineRows();
      const rewards = rewardRows(rows);
      console.log(`  - Deal Element id ${deId ?? '(not in URL)'} | order lines ${rows.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 4 - new Deal Element Promotion', expected: DISCOUNT_BASELINE.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_BASELINE.dealRegistration },
        { what: 'Step 4 - new Deal Element has exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
      ], `${TC} - Step 4 Deal Element of the duplicated opportunity`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-4 - Deal Element of the duplicated opportunity');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssert(checks);
    });
  });
});
