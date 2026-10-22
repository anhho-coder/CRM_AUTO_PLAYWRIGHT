import { test } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { OpportunityPage } from '@pages';
import { DealElementPageMig, QuotationPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  DISCOUNT_MIG,
  DISCOUNT_HIGHLIGHT,
  DiscountRun,
  Check,
  money,
  newDiscountRun,
  idFromUrl,
  signInMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  findRunCopy,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
  baselineDetails,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_3.2 - Duplicate a quotation and an opportunity carrying Deal registration   (crm-mig)
 * ================================================================================================
 * Test Case ID     : CRM-12144_3.2
 * Jira             : N/A - not yet imported to Xray (master "Migration - Discount" row 44, Jira link empty)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-21
 * Baseline         : Discount_3.2 (Jira CRM-13787; tests/1.Project_CRM/10.Sales_Module/Discount/3. Seamless use & screens/
 *                    tc-discount-3-2-duplicate-keeps-deal-registration.spec.ts) - assertions ported unchanged
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0082
 * Source version   : master row CRM-12144_3.2 as read 2026-10-21 - re-check before trusting this spec
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE)
 * Run as           : Salesperson - Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig)
 *
 * Summary
 * -------
 * The header Duplicate of a quotation carrying Deal registration creates a Quotation-state copy (screen stays on the
 * source) with the program and one reward line; the Action menu has no Duplicate; a duplicated opportunity's DE keeps it.
 * Expected 1 keeps the tester-approved wording of 2026-10-21: "the copy opens" was changed to "the screen STAYS on the
 * source quotation" (duplicate behaviour accepted as the feature). findRunCopy locates the copy.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_3\.2:" --project=chromium
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_3.2, master "Migration - Discount")
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
 *    4. Open the opportunity, click DEAL ELEMENT, add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation
 *  Executed Steps
 *    1. On the quotation, click Duplicate in the row of buttons above the form, next to Cancel
 *    2. Open the quotation's Action menu
 *    3. Open the opportunity and pick Duplicate in its Action menu
 *    4. Open the Deal Element of the new opportunity
 *  Expected Results
 *    1. The copy opens in the Quotation state with Promotion = Deal registration and exactly one reward line of the same amount
 *    2. The Action menu has no Duplicate entry
 *    4. Promotion = Deal registration; exactly one reward line
 *
 *  Port notes : accounts *_crm_mig; baseUrl_mig for the record-by-id opens; Mig readers; New quotation = newQuotationMig.
 * ================================================================================================
 */

const TC = 'CRM-12144_3.2';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (Thomas Semerich)',
  pre2: 'Pre-condition 2: On crm-mig, create a new company in Contacts: Name = Disc-Cust-<timestamp>, end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)',
  pre3: 'Pre-condition 3: On crm-mig, create a new opportunity in CRM > Pipeline (LIST view - the kanban quick-create card lacks these fields): Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>',
  pre4: 'Pre-condition 4: Open the opportunity, click DEAL ELEMENT, add A2144B with Ordered Qty 5, pick Deal registration, click Save, then New quotation',
  s1: 'Step 1: On the quotation, click Duplicate in the row of buttons above the form, next to Cancel',
  s2: "Step 2: Open the quotation's Action menu",
  s3: 'Step 3: Open the opportunity and pick Duplicate in its Action menu',
  s4: 'Step 4: Open the Deal Element of the new opportunity',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = [];

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Duplicate a quotation and an opportunity carrying Deal registration (crm-mig)`, () => {
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

  test(`${TC}: Duplicate a quotation and an opportunity carrying Deal registration`, baselineDetails(TC), async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const opportunityPage = new OpportunityPage(page);
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    let sourceReward = '';
    let newOppId: number | undefined;

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

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await openDealElementFromOpportunity(page);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 5);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,645.00');
      await dealElementPage.setPromotion('Deal registration');
      await saveDealElement(page, run);
      const qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      sourceReward = rewardRows(await quotationPage.getAllOrderLineRows())[0]?.['Subtotal'] ?? '';
      console.log(`  - Quotation id : ${qId} | reward line ${sourceReward || '(none)'}`);
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
      // STAYS on the source quotation - that is the feature, not a defect (was: "the copy opens"); kept for crm-mig
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
        if (!opened) await quotationPage.openRecordFormById(baseUrl_mig, 'sale.order', copyId);
        const stage = await quotationPage.getActiveStatusBarStage();
        const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
        const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
        s1.push(
          { what: 'Step 1 - the copy is in the Quotation state', expected: 'Quotation', actual: stage, passed: /^quotation$/i.test(stage.trim()) },
          { what: 'Step 1 - copy Promotion', expected: DISCOUNT_MIG.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_MIG.dealRegistration },
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
      await opportunityPage.openByUrlReloaded(`${baseUrl_mig.replace(/\/$/, '')}/web#id=${newOppId}&model=crm.lead&view_type=form`);
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
        { what: 'Step 4 - new Deal Element Promotion', expected: DISCOUNT_MIG.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_MIG.dealRegistration },
        { what: 'Step 4 - new Deal Element has exactly one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
      ], `${TC} - Step 4 Deal Element of the duplicated opportunity`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps 3-4 - Deal Element of the duplicated opportunity');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
