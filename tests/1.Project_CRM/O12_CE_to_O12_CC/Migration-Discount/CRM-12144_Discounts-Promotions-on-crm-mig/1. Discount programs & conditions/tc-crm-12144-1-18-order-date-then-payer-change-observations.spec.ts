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
  idFromUrl,
  newDiscountRun,
  rewardRows,
  recordChecks,
  printVerifyAndAssertMig,
  signInMig,
  signedInRoleCheckMig,
  createEndCustomerCompanyMig,
  createOpportunityForCompanyMig,
  openDealElementFromOpportunity,
  saveDealElement,
  newQuotationMig,
  teardownDiscountRunMig,
  sweepDiscountRunsMig,
  MIG_ACTION_TIMEOUT,
} from '@helpers/discount-mig.helper';

/**
 * ================================================================================================
 *  CRM-12144_1.18 - Change the Order Date, then the Payer of a sent quotation carrying Deal registration - record the
 *                   behaviour   (crm-mig, OBSERVATION case)
 * ================================================================================================
 * Test Case ID     : CRM-12144_1.18
 * Jira             : N/A - NEW test case, not yet in the master file nor in Xray (ID proposed)
 * Automation-Type  : new
 * Automation-Date  : 2026-10-26
 * Baseline         : none - written from the crm-mig manual TC (no pre-production baseline for this TC; not in
 *                    helpers/discount-mig.baseline-map.ts)
 * Spec             : [Migration] Discounts (Promotions) v6, page 222532591 - IS-CRM-FUNC-0075, IS-CRM-FUNC-0077
 *                    (QI "Discounts QA Instructions" v2, TC-10 steps 3-4 and their observations, p.23)
 * Source           : D:/Automation_CRM/[Migration] - memory/crm12144_new_scenarios_20261026/spec/NEW_AND_UNSPECCED_TCS.md
 * Source version   : NEW_AND_UNSPECCED_TCS.md v2 - sha256 9b74d000011e
 *                    (sha256 of the lines from "## CRM-12144_1.18 " up to, not including, the next line made only of
 *                    dashes, CRLF -> LF, joined with "\n", first 12 hex). Recompute before trusting this spec:
 *                    node -e "const s=require('fs').readFileSync(process.argv[1],'utf8').replace(/\r\n/g,'\n').split('\n');
 *                    const i=s.findIndex(l=>l.startsWith('## '+process.argv[2]+' '));let j=i+1;while(j<s.length&&!/^-{3,}\s*$/.test(s[j]))j++;
 *                    console.log(require('crypto').createHash('sha256').update(s.slice(i,j).join('\n')).digest('hex').slice(0,12))"
 *                    "<Source>" CRM-12144_1.18
 * Host             : crm-mig (https://crm-mig.nakivo.site, db nakivoCE); its outbound mail is caught by Mailpit
 * Run as           : Sales / User: Own Documents Only (Thomas Semerich, users.sale_ic_thomas_crm_mig). ASSERTED in
 *                    Pre-condition 1: the session's login and the user's groups (res.groups full names) must contain
 *                    "Sales / User: Own Documents Only" - a scored check.
 *
 * OBSERVATION case (QI: "Record as an observation - do not score it as a pass or a fail; the PM decides which
 * behaviour is kept"). Scored: the role of the signed-in user (Pre-condition 1), each Save the steps contain succeeded (Pre-condition 4 Deal Element, Step 1 quotation),
 * and the records exist; guards: the quotation reached Quotation Sent and the Payer input took the second company.
 * NOT scored: the two observations - printed as "Observation (not scored)" and captured as screenshots.
 *
 * Summary
 * -------
 * A quotation made from a Deal Element of A2144B x 6 with Deal registration gets a new Order Date (saved), then is
 * sent by e-mail and its Payer changed to a second company (not saved - step 2 has no Save); Promotion is recorded.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM-12144_1\.18:" --project=chromium-headless
 *
 * ------------------------------------------------------------------------------------------------
 *  Source manual TC (CRM-12144_1.18, verbatim)
 * ------------------------------------------------------------------------------------------------
 *  Title: Change the Order Date, then the Payer of a sent quotation carrying Deal registration - record the behaviour
 *         (IS-CRM-FUNC-0075, IS-CRM-FUNC-0077)
 *  Priority: P3 | Spec Areas: 0075 - re-check on change (observation)
 *
 *  Pre-running conditions:
 *    * Pre-conditions:
 *      Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only
 *      (e.g. Thomas Semerich)
 *      Create two new companies in Contacts: Disc-Cust-<timestamp> and Disc-Cust2-<timestamp>, each an end customer
 *      (no Reseller, no Distributor), Pricelist = Public Pricelist (USD)
 *      Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp>
 *      Open the opportunity, click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add
 *      A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation
 *
 *  Executed Steps:
 *    1. On the quotation, change the Order Date to another day and click Save
 *    2. Click Send by Email and send, so that the quotation is in the Quotation Sent state; then change Payer to
 *       Disc-Cust2-<timestamp>
 *
 *  Expected Results (QI: "Record as an observation" - write down what you saw; do not score it as a pass or a fail;
 *  the PM decides which behaviour is kept):
 *    1. Observation: the new CRM checks the program again for the new date; for Deal registration the result is the
 *       same (no date limit) - Promotion and the reward line stay
 *    2. Observation: the new CRM does not check the program again and Promotion is read-only (the reference system
 *       checks again)
 *
 *  Note: crm-mig outbound mail is caught by its Mailpit mailbox (no real e-mail). The spec must still verify that each
 *  Save succeeded and capture each observation as evidence (screenshot + stdout); only the two observations themselves
 *  are unscored.
 *
 *  Data entered:
 *    Company 1    : Name = Disc-Cust-<ts>,  end customer, Pricelist = Public Pricelist_USD
 *    Company 2    : Name = Disc-Cust2-<ts>, end customer, Pricelist = Public Pricelist_USD
 *    Deal Element : Product = [A2144B], Ordered Qty = 6, Unit Price = blank (list price), Discount (%) = blank,
 *                   Reseller = blank, Distributor = blank, Promotion = Deal registration
 *    Step 1       : Order Date = the quotation's Order Date minus one day (computed at run time, same time of day)
 *    Step 2       : e-mail = the composer as it opens (template, recipients) - nothing typed; Payer = Disc-Cust2-<ts>
 *
 *  Port notes: step 2 contains no Save (source step 2 and QI TC-10 step 4 p.24 end at "change Payer"), so the spec
 *  does not save after the Payer change: it observes the form in edit mode right after the change, then discards it.
 *  "Each Save succeeded" covers the Saves the steps contain (Pre-condition 4, Step 1). Step 1's evidence is taken on
 *  the Order Lines page (shiftOrderDateByDays leaves the form on Other Information).
 *  "Promotion is read-only" is observed with Edit on the sent quotation (is the promotion_id widget an editable input).
 *  Teardown: afterEach deletes, as the crm-mig administrator, the quotation + Deal Element, the opportunity, both
 *  companies and the auto-created contact (deny-list by the ids / markers of this run); afterAll sweeps by marker.
 * ================================================================================================
 */

const TC = 'CRM-12144_1.18';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to crm-mig (https://crm-mig.nakivo.site) as a salesperson in Sales / User: Own Documents Only (e.g. Thomas Semerich) [the groups of the signed-in user are read and must contain Sales / User: Own Documents Only]',
  pre2: 'Pre-condition 2: Create two new companies in Contacts: Disc-Cust-<timestamp> and Disc-Cust2-<timestamp>, each an end customer (no Reseller, no Distributor), Pricelist = Public Pricelist (USD) [on crm-mig]',
  pre3: 'Pre-condition 3: Create a new opportunity in CRM > Pipeline with Name = Disc-Opp-<timestamp>, Customer = Disc-Cust-<timestamp> [on crm-mig, in the LIST view - the kanban quick-create card lacks these fields]',
  pre4: 'Pre-condition 4: Open the opportunity, click DEAL ELEMENT; if Payment Terms is empty, set Payment Terms = Immediate Payment; add A2144B with Ordered Qty 6, pick Deal registration, click Save, then New quotation',
  s1: 'Step 1: On the quotation, change the Order Date to another day and click Save',
  s2: 'Step 2: Click Send by Email and send, so that the quotation is in the Quotation Sent state; then change Payer to Disc-Cust2-<timestamp>',
  verify: 'Verification',
} as const;

const SKIP_CLEANUP = false; // true = keep the run's records for debugging (crm-mig rule: never leave it true)
const SALES = users.sale_ic_thomas_crm_mig;
const runs: DiscountRun[] = []; // every crm-mig run of this file - the afterAll sweep re-checks them

test.use({ actionTimeout: MIG_ACTION_TIMEOUT }); // a click that never becomes actionable fails here, not at 15 min

test.describe(`${TC} - Change the Order Date, then the Payer of a sent quotation carrying Deal registration - record the behaviour (crm-mig)`, () => {
  let created: DiscountRun[] = [];

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created = [];
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    const errors: string[] = [];
    // the first run carries the opportunity and the quotation, so it goes first; the second only its company
    if (!SKIP_CLEANUP) for (const r of created) await teardownDiscountRunMig(page, r, testInfo).catch((e: Error) => errors.push(e.message));
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (errors.length) throw new Error(errors.join(' | '));
  });

  test.afterAll(async ({ browser }) => {
    if (!SKIP_CLEANUP) await sweepDiscountRunsMig(browser, runs);
  });

  test(`${TC}: Change the Order Date, then the Payer of a sent quotation carrying Deal registration - record the behaviour`, {
    annotation: [
      { type: 'manual-tc', description: `${TC} (NEW, NEW_AND_UNSPECCED_TCS.md v2 - sha256 9b74d000011e)` },
      { type: 'requirement', description: 'IS-CRM-FUNC-0075, IS-CRM-FUNC-0077 (QI TC-10 steps 3-4, observations)' },
      { type: 'observation-case', description: 'the two observations are printed and captured, not scored' },
    ],
  }, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const dealElementPage = new DealElementPageMig(page); // Order Lines keyed on the authored caption (the Mig theme upper-cases headers)
    const quotationPage = new QuotationPageMig(page);
    const checks: Check[] = [];
    const newRun = (): DiscountRun => {
      const r = newDiscountRun();
      created.push(r);
      runs.push(r);
      return r;
    };
    const run = newRun();
    const run2 = newRun();
    run2.company = `Disc-Cust2-${run.ts}`; // the source's name; run2 keeps its own e-mail marker for the teardown
    let qId = 0;

    // ================= Pre-conditions =================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  - Host  : crm-mig`);
      console.log(`  - Login : ${SALES.username} (${SALES.displayName})`);
      await signInMig(page, SALES);
      // [INTERNAL check, Call API] the ROLE the TC names - data-side, stdout is its evidence (tester decision 2026-10-26)
      checks.push(await signedInRoleCheckMig(page, SALES, 'Sales / User: Own Documents Only'));
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 1 - signed in on crm-mig as the salesperson');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await createEndCustomerCompanyMig(page, run, SALES, DISCOUNT_MIG.pricelistUsd);
      await createEndCustomerCompanyMig(page, run2, SALES, DISCOUNT_MIG.pricelistUsd);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - two companies created');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await createOpportunityForCompanyMig(page, run, SALES);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 3 - opportunity created');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      await openDealElementFromOpportunity(page);
      console.log(`  - Product     = ${DISCOUNT_MIG.listedProduct}`);
      console.log(`  - Ordered Qty = 6`);
      console.log(`  - Promotion   = ${DISCOUNT_MIG.dealRegistration}`);
      await dealElementPage.addOrderLineStrict(DISCOUNT_MIG.listedProduct, 6);
      await dealElementPage.waitForOrderLineCell(0, 'Subtotal', '1,974.00');
      await dealElementPage.setPromotion(DISCOUNT_MIG.dealRegistration, { exact: true });
      await saveDealElement(page, run);
      qId = await newQuotationMig(page, run);
      await quotationPage.dismissErrorDialogWithRetry();
      console.log(`  - Quotation id : ${qId}`);
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      console.log(`  - Quotation Promotion   : ${promotion || '(empty)'}`);
      console.log(`  - Quotation reward lines: ${rewards.length}`);
      await recordChecks(page, testInfo, checks, [
        { what: 'Pre-condition 4 (guard) - the quotation carries Deal registration', expected: DISCOUNT_MIG.dealRegistration, actual: promotion || '(empty)', passed: promotion === DISCOUNT_MIG.dealRegistration },
        { what: 'Pre-condition 4 (guard) - the quotation has one reward line', expected: '1', actual: String(rewards.length), passed: rewards.length === 1 },
      ], `${TC} - Pre-condition 4 quotation with Deal registration`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - quotation with Deal registration');
    });

    // ================= Steps =================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await quotationPage.clickEdit();
      const date = await quotationPage.shiftOrderDateByDays(-1);
      console.log(`  - Order Date before : ${date.before}`);
      console.log(`  - Order Date typed  : ${date.typed} (read back: ${date.readBack ? 'yes' : 'NO'})`);
      const saved = await quotationPage.saveQuotation(CommonUtils.waitTimes.savingPage).then(() => true, (e: Error) => { console.log(`  ⚠ Save: ${e.message.split('\n')[0]}`); return false; });
      const shown = await quotationPage.getOrderDateDisplayed();
      // the date sits on Other Information; the Promotion + reward line the observation is about sit on Order Lines
      console.log(`  - Order Lines page active for the evidence : ${(await quotationPage.openOrderLinesTabMig()) ? 'yes' : 'NO'}`);
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      const datePart = date.typed.split(' ')[0];
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 1 - Save succeeded (the quotation is back in read mode)', expected: 'saved', actual: saved ? 'saved' : 'NOT saved', passed: saved },
        { what: 'Step 1 - the saved Order Date is the new day', expected: datePart, actual: shown || '(empty)', passed: shown.startsWith(datePart) },
        { what: 'Step 1 - the quotation still exists (same record id)', expected: String(qId), actual: String(idFromUrl(page.url()) ?? '(no id in URL)'), passed: idFromUrl(page.url()) === qId },
      ], `${TC} - Step 1 Order Date saved`, [DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      console.log(`  Observation (not scored) - after the Order Date change: Promotion = ${promotion || '(empty)'}; reward lines = ${rewards.length}; Total = ${await quotationPage.getFieldDisplayValue('amount_total')}`);
      console.log(`  Observation (not scored) - source expectation: the new CRM checks the program again for the new date; for Deal registration the result is the same (no date limit) - Promotion and the reward line stay`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Observation - after the Order Date change');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      const stageBefore = await quotationPage.getActiveStatusBarStage();
      await quotationPage.clickSendByEmail(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForEmailDialog(CommonUtils.waitTimes.abnormalWait);
      console.log(`  - e-mail recipients : ${(await quotationPage.getEmailRecipients()).join(', ') || '(none)'}`);
      await quotationPage.sendEmail();
      // what crm-mig answered to SEND, read BEFORE anything is dismissed (2026-10-26 first run: an "Odoo Client Error")
      const afterSend = await quotationPage.getBlockingPopupText(CommonUtils.waitTimes.long);
      console.log(`  - popup after SEND : ${afterSend ? `"${afterSend.slice(0, 600)}"` : '(none)'}`);
      if (afterSend) await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - popup after SEND');
      await quotationPage.dismissErrorDialogWithRetry();
      if (await quotationPage.isEmailDialogOpen()) await quotationPage.cancelEmailDialog(CommonUtils.waitTimes.abnormalWait);
      await quotationPage.waitForSendByEmailButtonToDisappear(CommonUtils.waitTimes.abnormalWait).catch(() => {});
      await quotationPage.reloadAndWaitForForm();
      const stage = await quotationPage.getActiveStatusBarStage();
      console.log(`  - Stage before / after sending : ${stageBefore} / ${stage}`);

      await quotationPage.clickEdit();
      const promotionEditable = await quotationPage.isFieldEditableInEditMode('promotion_id');
      console.log(`  - Payer = ${run2.company}`);
      // setPayer reads the input back and throws when the field does not take the name - the step's action itself
      const payerInput = await quotationPage.setPayer(run2.company).catch((e: Error) => { console.log(`  ⚠ Payer: ${e.message.split('\n')[0]}`); return ''; });
      await quotationPage.openOrderLinesTabMig();
      const promotion = await quotationPage.getFieldDisplayValue('promotion_id');
      const rewards = rewardRows(await quotationPage.getAllOrderLineRows());
      await recordChecks(page, testInfo, checks, [
        { what: 'Step 2 (guard) - after Send by Email the quotation is in the Quotation Sent state', expected: 'Quotation Sent', actual: `${stage || '(empty)'}${afterSend ? ` - popup after SEND: "${afterSend.slice(0, 300)}"` : ''}`, passed: /^quotation sent$/i.test(stage.trim()) },
        { what: 'Step 2 (guard) - the Payer input holds the second company after the change (edit mode, NOT saved - step 2 has no Save)', expected: run2.company, actual: payerInput || '(the field did not take the name)', passed: payerInput.includes(run2.company) },
        { what: 'Step 2 - the quotation still exists (same record id)', expected: String(qId), actual: String(idFromUrl(page.url()) ?? '(no id in URL)'), passed: idFromUrl(page.url()) === qId },
      ], `${TC} - Step 2 sent, Payer changed (unsaved)`, ['.o_statusbar_status', "div[name='partner_id']", DISCOUNT_HIGHLIGHT.promotionField, DISCOUNT_HIGHLIGHT.orderLines]);
      console.log(`  Observation (not scored) - Promotion in edit mode on the sent quotation : ${promotionEditable ? 'editable' : 'read-only'}`);
      console.log(`  Observation (not scored) - right after the Payer change (unsaved): Promotion = ${promotion || '(empty)'}; reward lines = ${rewards.length}; Total = ${await quotationPage.getFieldDisplayValue('amount_total')}`);
      console.log(`  Observation (not scored) - source expectation: the new CRM does not check the program again and Promotion is read-only (the reference system checks again)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Observation - sent quotation after the Payer change');
      await quotationPage.discardChanges(); // step 2 has no Save: leave no unsaved form for the teardown's navigation
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      printVerifyAndAssertMig(checks);
    });
  });
});
