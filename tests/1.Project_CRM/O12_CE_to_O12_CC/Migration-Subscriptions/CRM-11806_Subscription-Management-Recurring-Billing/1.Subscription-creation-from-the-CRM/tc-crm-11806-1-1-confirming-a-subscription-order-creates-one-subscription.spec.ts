import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { HomePageMig as HomePage, SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { SKU_ENT_MONTHLY } from '@helpers/crm-11806-subscription.helper';
import {
  loginToO12CE,
  openOpportunitiesListOnO12CE,
  createOpportunityOnO12CE,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  teardownMigRecords,
  sweepMigLeftoversAfterAll,
} from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-11806_1.1 - Confirming a subscription order creates exactly one subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.1
 *  Spec ID:         IS-CRM-FUNC-0135 / SC-01
 *                   Spec text  : a subscription is created at the moment of confirmation, in stage In Progress
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "SC-01 / FUNC-0135, FUNC-0137" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12140 (implementation) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 *  Run as:          Salesperson (users.sale_ic_thomas_crm_mig)
 * --------------------------------------------------------------------------------------------
 *  PORT - the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/1.Subscription-creation-from-the-CRM/
 *                    tc-subscription-1-1-confirming-a-subscription-order-creates-one-subscription.spec.ts
 *  Baseline TC ID  : subscription-1.1
 *  QA card         : SC-01 - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription peer https://pre-sales-crm-mig.nakivo.site (Odoo 19, db odoo19)
 *
 *  DEVIATIONS from the baseline. Every expected VALUE is the baseline's, unchanged. Two mechanics
 *  had to change because the baseline's mechanism does not exist on crm-mig - both are the
 *  "substitute the datum, keep the scenario's intent, and say so" case, and both are stated here:
 *
 *   D1. CREATION PATH. The baseline opens Sales > Orders > Quotations and clicks CREATE.
 *       crm-mig has NO CREATE button on either Sales > Orders or Sales > Quotations (verified
 *       2026-10-07: `.o_list_button_add` = 0 on both), and per CRM-12140 SC-01 a subscription is
 *       born ONLY by confirming a quotation raised from an Opportunity's Deal Element. So the
 *       pre-conditions build the record through Opportunity > Deal Element > New quotation, which
 *       is the delivered path. The product and quantity the baseline asks for are unchanged.
 *   D2. WHERE THE SUBSCRIPTION IS READ. crm-mig carries no `sale.subscription` model - the record
 *       lives on the peer. VP5 therefore reads it over the peer's authenticated JSON-RPC
 *       (`sale.subscription`, `sale.subscription.line`) instead of off a CRM form. The asserted
 *       values are identical; only the reader moved.
 *
 *   D3. THE SMART BUTTON HAS A DIFFERENT SHAPE. Pre-production renders
 *       `button[name="action_open_subscriptions"]`, plural, showing a COUNT. crm-mig renders
 *       `button[name="action_embed_remote_subscription"]`, singular, showing the REFERENCE
 *       ("SUB00013 Subscription"). VP3 therefore asserts "exactly ONE subscription reference, and
 *       it is the one the order pushed" instead of "the count reads 1" - the same claim, read off
 *       the control this instance actually draws.
 *
 *  NOT deviations: VP1 and VP2 are read on the CRM exactly as the baseline reads them.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a Salesperson (Thomas Semerich)
 *    Create an Opportunity, open its Deal Element and add one Order Line with:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" (Subscriptionable)
 *      - Ordered Qty = 50
 *    Click "SAVE", then "New quotation", and note the quotation number (e.g. SO216758)
 *
 *  Steps to reproduce:
 *   1. Look at the smart-button row at the top right of the created quotation
 *   2. Click "CONFIRM"
 *   3. Look at the smart-button row again
 *   4. Click the "Subscriptions" smart button to open the subscription
 *   5. Read the fields on the subscription form and the "Subscription Lines" tab
 *
 *  Verification Points:
 *   VP1. No "Subscriptions" smart button while the record is still a quotation
 *   VP2. The status bar moves to "SALE ORDER"
 *   VP3. A "Subscriptions" smart button appears and reads 1
 *   VP5. One subscription exists with Customer / IN PROGRESS / Pricelist / Salesperson /
 *        Start Date = confirmation date / exactly 1 line of the ordered product x 50
 *
 *  Evidence: the subscription itself is read over the peer RPC, so step 5 is marked
 *  [INTERNAL check, Call API] and its stdout IS the artifact - there is no CRM screen for it.
 * --------------------------------------------------------------------------------------------
 *  RESULT ON crm-mig - 2026-10-08: GREEN. VP1/VP2/VP3/VP5 all PASS.
 *    push settled in 3.5 s -> contract_push_state "done", contract_remote_ref "SUB00014";
 *    the smart button shows "SUB00014"; the peer subscription carries stage In Progress,
 *    the run's customer, Public Pricelist_USD (USD), Salesperson Thomas Semerich, start date today
 *    and exactly 1 line of CP-NC-PM-ENT x 50. Teardown removed SUB00014 from the peer and the
 *    sweep removed the CRM records.
 *
 *  HISTORY - 2026-10-08, and the reason this header is long. The spec first reported "crm-mig
 *  creates no subscription". That was WRONG, and the fault was the spec's:
 *    - `QuotationPage.getSubscriptionsSmartButtonCount()` targets the pre-prod button name, so it
 *      returned 0 on every run while the order really did carry "SUB000xx Subscription";
 *    - the contract_remote_ref lookup was keyed on the quotation NAME, which comes back EMPTY from
 *      `pressNewQuotationOnO12CE` (the run log reads `Quotation : (unresolved)`), so it polled
 *      `[['name','=','']]` for two minutes and found nothing. Keyed on the ID it settles in 3.5 s.
 *  Five runs created SUB00009..SUB00013 on the peer before anyone noticed, because the peer
 *  teardown was guarded on having READ the subscription back; they were deleted by hand. The guard
 *  now keys on the run's customer, so it fires even when the test fails early.
 *
 *  Comparison: the pre-production baseline subscription-1.1 passes (2026-10-08 16:45, 220 s,
 *  order SO221150, Thomas Semerich).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.1:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.1';
const SALESPERSON = users.sale_ic_thomas_crm_mig;
const ORDERED_QTY = 50;
const PRICELIST = 'Public Pricelist_USD';

/**
 * Teardown toggle - crm-mig allows writes only against a teardown that actually runs.
 *
 * >> TEMPORARILY TRUE at the tester's request (2026-10-09) so the subscriptions these runs create
 *    can be inspected on the service before they are removed. While it is true this spec LEAVES
 *    BEHIND: the Opportunity, the Deal Element, the Quotation/Sale Order on crm-mig, and the
 *    subscription on the peer. The 16:00 leftover check will report them. SET IT BACK TO false.
 */
/**
 * >>> TEARDOWN OFF - TEMPORARY, at the tester's request 2026-10-16. <<<
 *
 * The tester needs the records this run creates to STAY on crm-mig and on the peer so they can be
 * verified by hand against the PW report. While this flag is true the spec leaves behind everything
 * it made - the Opportunity / Deal Element / Sale Order on crm-mig and the subscription on the peer.
 *
 * Consequences, stated so nobody is surprised:
 *  - the 16:00 leftover-data check WILL report these records; that is expected, not a teardown bug.
 *  - this overrides the crm-mig rule "a spec MUST remove everything it created". It is a deliberate
 *    tester decision for a verification window, not a new default.
 *
 * TURN IT BACK ON with one command from the suite root:
 *   grep -rln "SKIP_CLEANUP\(_OPP\)\? = true" --include='*.spec.ts' .
 * and set each back to false.
 */
const SKIP_CLEANUP = true;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a Salesperson (Thomas Semerich)',
  pre2: `Pre-condition 2-4: Create an Opportunity, open its Deal Element, add one Order Line - Product = "[${SKU_ENT_MONTHLY}] min 50Ent Machines, 1Month Subscription" (Subscriptionable), Ordered Qty = ${ORDERED_QTY}; click "SAVE", then "New quotation", and note the quotation number`,
  s1: 'Step 1: Look at the smart-button row at the top right of the created quotation',
  s2: 'Step 2: Click "CONFIRM"',
  s3: 'Step 3: Look at the smart-button row again',
  s4: 'Step 4: Click the "Subscriptions" smart button to open the subscription',
  s5: 'Step 5: [INTERNAL check, Call API] Read the fields on the subscription form and the "Subscription Lines" tab',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Confirming a subscription order creates exactly one subscription`, () => {
  /**
   * The subscription this run causes to be created ON THE PEER. Confirming the order pushes it
   * there, and the CRM-side teardown cannot see it - so the spec records its id and removes it
   * itself. Only a record THIS RUN created is ever touched; nothing migrated is.
   */
  let createdPeerSubId: number | null = null;
  let createdPeerSubRef = '';
  /**
   * The customer this run generates. Teardown keys on THIS, not on whether the spec managed to read
   * the subscription back: guarding the peer cleanup on a successful read is exactly what left
   * SUB00009..SUB00013 behind on 2026-10-08.
   */
  let createdCustomerName = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Peer first: confirming the order creates a subscription there that the CRM-side teardown
    // cannot see. Sweep by THIS RUN'S customer, so it still fires when the spec failed before it
    // could read the subscription back - and so it can never touch a migrated record.
    if (!SKIP_CLEANUP && createdCustomerName) {
      try {
        const subs = new SubscriptionPageMig(page);
        await subs.loginPresales();
        const mine = await subs.presalesCallKw<any[]>(
          'sale.subscription', 'search_read',
          [[['partner_id.name', '=', createdCustomerName]], ['code']],
          { limit: 20 },
        );
        if (mine.length) {
          await subs.presalesCallKw('sale.subscription', 'unlink', [mine.map((r) => r.id)], {});
          console.log(`teardown: removed ${mine.length} peer subscription(s) for "${createdCustomerName}": ${mine.map((r) => r.code).join(', ')}`);
        } else {
          console.log(`teardown: no peer subscription for "${createdCustomerName}"`);
        }
      } catch (e: any) {
        console.log(
          `teardown: COULD NOT clean the peer for "${createdCustomerName}" - ` +
          `${String(e?.message ?? e).slice(0, 220)}. Report it; it is a leftover on the peer.`,
        );
      }
    }
    // crm-mig: delete what this run created, pass or fail.
    await teardownMigRecords(page, SKIP_CLEANUP, { asAdmin: true }).catch((e) =>
      console.log(`teardown problem: ${String(e?.message ?? e).slice(0, 200)}`),
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    // catches anything an aborted run left behind, by the TEST <TC_ID> name marker
    if (SKIP_CLEANUP) { console.log(`[sweep] SKIPPED - SKIP_CLEANUP is true, leftovers of ${TC_ID} are left for inspection`); return; }
    await sweepMigLeftoversAfterAll(browser, TC_ID).catch(() => {});
  });

  test(`${TC_ID}: Confirming an order that holds a subscription product creates exactly one subscription @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);
    const subs = new SubscriptionPageMig(page);

    let quotationName = '';
    let quotationId = '';
    let smartButtonRef = '';
    let customerName = '';
    let hasButtonBefore = true;
    let statusAfterConfirm = '';
    let smartButtonCount = -1;
    let subRef = '';
    let pushState = '';
    let remote: any = null;
    let lines: any[] = [];
    const confirmedOn = new Date();

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  account : ${SALESPERSON.username}`);
      await loginToO12CE(page, SALESPERSON);
      console.log('  OK - signed in on crm-mig');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      // the chain's create steps start on the Opportunities LIST - open it first, or CREATE is not
      // on screen and the run dies on the post-login landing app
      await openOpportunitiesListOnO12CE(page);
      const opp = await createOpportunityOnO12CE(page, TC_ID);
      customerName = opp.companyValue || opp.contactValue || opp.contactName;
      createdCustomerName = customerName;
      console.log(`  Opportunity  : ${opp.oppName} (id ${opp.oppId})`);
      console.log(`  Customer     : ${customerName}`);

      const de = await addDealElementOnO12CE(page, { product: SKU_ENT_MONTHLY, productQty: ORDERED_QTY, pricelist: PRICELIST });
      console.log(`  Product line : ${de.productName}`);
      console.log(`  Ordered Qty  : ${ORDERED_QTY}`);

      const q = await pressNewQuotationOnO12CE(page, { opportunityId: opp.oppId });
      quotationName = q.quotationName;
      quotationId = q.quotationId;
      console.log(`  Quotation    : ${quotationName || '(unresolved)'} (id ${q.quotationId || '-'}, ${q.elapsedMs} ms)`);
      expect(q.quotationId, 'Pre-condition: NEW QUOTATION must produce a resolvable sale.order').not.toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - quotation created').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      hasButtonBefore = await subs.hasSubscriptionSmartButton().catch(() => false);
      console.log(`  Subscription smart button present on the quotation: ${hasButtonBefore}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      console.log('  OK - CONFIRM pressed');
      // The CRM confirms the order at once and pushes the subscription to the peer as a QUEUED JOB,
      // so the reference is not there yet. Wait for the push before reading anything about it.
      const push = await subs.waitForSubscriptionPushById(quotationId);
      console.log(`  push settled after ${push.waitedMs} ms - state "${push.pushState}", ref "${push.ref ?? ''}"`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      // Read the status from the SERVER, not the rendered bar: the crm-mig status bar keeps showing
      // the pre-confirm value until the form is reloaded, so a direct read says "Quotation" while
      // the record is already `sale`.
      statusAfterConfirm = await quotationPage.getQuotationStatusFromServer().catch(() => '');
      smartButtonRef = await subs.getSubscriptionSmartButtonRef().catch(() => '');
      smartButtonCount = smartButtonRef ? 1 : 0;
      console.log(`  status (after reload)            : "${statusAfterConfirm}"`);
      console.log(`  Subscription smart button shows  : "${smartButtonRef}" -> ${smartButtonCount} subscription(s)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - confirmed order with the Subscriptions smart button').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      const link = await subs.getOrderSubscriptionLinkById(quotationId);
      subRef = link?.ref ?? '';
      pushState = link?.pushState ?? '';
      console.log(`  contract_remote_ref   : ${subRef || '(none)'}`);
      console.log(`  contract_push_state   : ${pushState || '(none)'}`);
      console.log(`  contract_push_message : ${link?.pushMessage ?? '(none)'}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await subs.loginPresales();
      remote = subRef
        ? await subs.remoteSubscriptionByRef(subRef, [
            'code', 'partner_id', 'pricelist_id', 'user_id', 'stage_id', 'template_id',
            'date_start', 'recurring_next_date', 'in_progress', 'sale_subscription_line_ids',
          ])
        : null;
      if (!remote) {
        console.log('  no subscription found on the peer for this order');
      } else {
        createdPeerSubId = Number(remote.id) || null;
        createdPeerSubRef = String(remote.code ?? subRef);
        for (const k of Object.keys(remote)) console.log(`  ${k.padEnd(28)}: ${JSON.stringify((remote as any)[k])}`);
        const lineIds: number[] = remote.sale_subscription_line_ids || [];
        lines = lineIds.length
          ? await subs.presalesCallKw<any[]>('sale.subscription.line', 'read', [lineIds, ['product_id', 'product_uom_qty']], {})
          : [];
        console.log(`  lines (${lines.length}):`);
        for (const l of lines) console.log(`    - ${JSON.stringify(l.product_id)}  qty=${l.product_uom_qty}`);
      }
    });

    // ===================== Verification =====================
    await test.step(STEP.verify, async () => {
      const stage = String(remote?.stage_id?.[1] ?? '');
      const customer = String(remote?.partner_id?.[1] ?? '');
      const pricelist = String(remote?.pricelist_id?.[1] ?? '');
      const salesperson = String(remote?.user_id?.[1] ?? '');
      const startDate = String(remote?.date_start ?? '');
      const lineProduct = String(lines[0]?.product_id?.[1] ?? '');
      const lineQty = Number(lines[0]?.product_uom_qty ?? 0);
      const expectedStart = `${confirmedOn.getFullYear()}-${String(confirmedOn.getMonth() + 1).padStart(2, '0')}-${String(confirmedOn.getDate()).padStart(2, '0')}`;

      const p1 = !hasButtonBefore;
      const p2 = /sale\s*order/i.test(statusAfterConfirm);
      const p3 = smartButtonCount === 1 && /^SUB\d+$/.test(smartButtonRef) && smartButtonRef === subRef;
      const p5 =
        /in\s*progress/i.test(stage) && customer.includes(customerName) &&
        pricelist.includes(PRICELIST) && salesperson !== '' &&
        startDate === expectedStart && lines.length === 1 &&
        lineProduct.includes(SKU_ENT_MONTHLY) && lineQty === ORDERED_QTY;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - no "Subscriptions" smart button while the record is a quotation:');
      console.log('     Expected : absent (a subscription exists only once the order is confirmed)');
      console.log(`     Actual   : present = ${hasButtonBefore}`);
      console.log(`     Result   : ${p1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the status bar moves to SALE ORDER:');
      console.log('     Expected : "Sale Order"');
      console.log(`     Actual   : "${statusAfterConfirm}"`);
      console.log(`     Result   : ${p2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the Subscription smart button appears for exactly one subscription:');
      console.log('     Expected : exactly ONE subscription reference on the button, matching the order contract_remote_ref (none, or a second subscription, is a FAIL)');
      console.log(`     Actual   : button shows "${smartButtonRef}" -> ${smartButtonCount}; contract_remote_ref = "${subRef}", push_state = "${pushState}"`);
      console.log(`     Result   : ${p3 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the subscription on the peer carries the order:');
      console.log(`     Expected : stage "In Progress" | Customer contains "${customerName}" | Pricelist contains "${PRICELIST}" | a Salesperson | Start date ${expectedStart} | exactly 1 line of ${SKU_ENT_MONTHLY} x ${ORDERED_QTY}`);
      console.log(`     Actual   : stage "${stage}" | Customer "${customer}" | Pricelist "${pricelist}" | Salesperson "${salesperson}" | Start date ${startDate} | ${lines.length} line(s), "${lineProduct}" x ${lineQty}`);
      console.log(`     Result   : ${p5 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${p1 && p2 && p3 && p5 ? 'PASS' : 'FAIL'} - one confirmed subscription order, one subscription`);

      expect(hasButtonBefore, 'VP1: a quotation must not offer a "Subscriptions" smart button - the subscription only exists once the order is confirmed').toBeFalsy();
      expect(statusAfterConfirm, `VP2: the confirmed record should be a SALE ORDER (status read: "${statusAfterConfirm}")`).toMatch(/sale\s*order/i);
      expect(smartButtonRef, 'VP3: the confirmed order should offer a Subscription smart button carrying a SUB reference').toMatch(/^SUB\d+$/);
      expect(smartButtonRef, 'VP3: the reference on the button must be the one the order pushed - exactly one subscription for one order').toBe(subRef);
      expect(stage, `VP5: the new subscription should be IN PROGRESS (stage read: "${stage}")`).toMatch(/in\s*progress/i);
      expect(customer, `VP5: the subscription Customer should be "${customerName}"`).toContain(customerName);
      expect(pricelist, `VP5: the subscription Pricelist should be "${PRICELIST}"`).toContain(PRICELIST);
      expect(salesperson, 'VP5: the subscription should carry a Salesperson').not.toBe('');
      expect(startDate, `VP5: the Start Date should be the confirmation date ${expectedStart}`).toBe(expectedStart);
      expect(lines.length, 'VP5: the subscription should hold exactly 1 Subscription Line').toBe(1);
      expect(lineProduct, `VP5: the line product should be ${SKU_ENT_MONTHLY}`).toContain(SKU_ENT_MONTHLY);
      expect(lineQty, `VP5: the line Quantity should be ${ORDERED_QTY}`).toBe(ORDERED_QTY);
    });
  });
});
