import { test, expect } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage } from '@pages';
import { HomePageMig as HomePage, SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
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
 *  CRM-11806_1.2 - An order with no subscription product creates no subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.2
 *  Spec ID:         SC-02 / FUNC-0136
 *  Spec:            [Migration] Subscription Management (Recurring Billing)
 *  Jira:            CRM-12140 (implementation) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-08
 *  Run as:          Salesperson (users.sale_ic_thomas_crm_mig)
 * --------------------------------------------------------------------------------------------
 *  PORT - the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/1.Subscription-creation-from-the-CRM/
 *                    tc-subscription-1-2-non-subscription-product-creates-no-subscription.spec.ts
 *  Baseline TC ID  : subscription-1.2
 *  QA card         : SC-02 - "Subscription Test Cases" (CRM-12140, Nathan)
 *  Runs on         : CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                    Subscription peer https://pre-sales-crm-mig.nakivo.site (Odoo 19, db odoo19)
 *
 *  DEVIATIONS from the baseline - the same three CRM-11806_1.1 declares, for the same reasons.
 *  Every expected VALUE is the baseline's, unchanged.
 *   D1. CREATION PATH - built through Opportunity > Deal Element > New quotation, because crm-mig
 *       has no CREATE button on Sales > Orders or Sales > Quotations.
 *   D2. WHERE THE SUBSCRIPTION IS COUNTED - crm-mig has no `sale.subscription` model, so VP3 counts
 *       subscriptions for this customer on the PEER over its authenticated JSON-RPC instead of in
 *       the CRM's Subscriptions list. "Zero for this customer" is the same claim either way, and on
 *       the peer it cannot be fooled by a list filter that silently matched nothing.
 *   D3. SMART-BUTTON SHAPE - crm-mig renders `action_embed_remote_subscription` (singular, carrying
 *       the SUB reference), not the pre-prod `action_open_subscriptions` (plural, carrying a count).
 *       VP2 asserts the crm-mig control is absent. NOTE this is the assertion that matters most in
 *       this case: a reader pointed at the WRONG button is absent for the wrong reason and would
 *       make this negative test pass vacuously forever.
 *
 *  Verified data: `A2149B` exists on crm-mig with `nakivo_subscription_ok = false`, which is the
 *  precondition this case rests on.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a Salesperson (Thomas Semerich)
 *    Create an Opportunity, open its Deal Element and add one Order Line with:
 *      - Product     = "[A2149B] NAKIVO Backup & Replication Enterprise Essentials ... Prepaid"
 *      - Ordered Qty = 1
 *    Click "SAVE", then "New quotation"
 *    NOTE: this product is NOT flagged as a subscription product, which is what the case checks
 *
 *  Steps to reproduce:
 *   1. Click "CONFIRM"
 *   2. Look at the smart-button row at the top right of the confirmed order
 *   3. Search the subscriptions of this customer
 *
 *  Verification Points:
 *   VP1. The status bar moves to "SALE ORDER" - the order confirms normally
 *   VP2. No Subscription smart button is shown
 *   VP3. 0 subscriptions exist for this customer - no subscription was created
 *
 *  Evidence: step 3 is marked [INTERNAL check, Call API] - it reads the peer, there is no CRM screen.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.2:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.2';
const SALESPERSON = users.sale_ic_thomas_crm_mig;
const SKU_NON_SUBSCRIPTION = 'A2149B';
const ORDERED_QTY = 1;
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
  pre2: `Pre-condition 2-3: Create an Opportunity, open its Deal Element, add one Order Line - Product = "[${SKU_NON_SUBSCRIPTION}] NAKIVO Backup & Replication Enterprise Essentials ... Prepaid" (NOT a subscription product), Ordered Qty = ${ORDERED_QTY}; click "SAVE", then "New quotation"`,
  s1: 'Step 1: Click "CONFIRM"',
  s2: 'Step 2: Look at the smart-button row at the top right of the confirmed order',
  s3: 'Step 3: [INTERNAL check, Call API] Search the subscriptions of this customer',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - An order with no subscription product creates no subscription`, () => {
  /** Keyed on what the run CREATED, never on what it managed to read back. */
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
    // This case should create nothing on the peer - sweep anyway, so a regression that DOES create
    // one is cleaned up instead of being left for the 16:00 check.
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
          console.log(`teardown: removed ${mine.length} UNEXPECTED peer subscription(s): ${mine.map((r) => r.code).join(', ')}`);
        } else {
          console.log(`teardown: nothing on the peer for "${createdCustomerName}" - as this case expects`);
        }
      } catch (e: any) {
        console.log(`teardown: peer check failed - ${String(e?.message ?? e).slice(0, 200)}`);
      }
    }
    await teardownMigRecords(page, SKIP_CLEANUP, { asAdmin: true }).catch((e) =>
      console.log(`teardown problem: ${String(e?.message ?? e).slice(0, 200)}`),
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP) { console.log(`[sweep] SKIPPED - SKIP_CLEANUP is true, leftovers of ${TC_ID} are left for inspection`); return; }
    await sweepMigLeftoversAfterAll(browser, TC_ID).catch(() => {});
  });

  test(`${TC_ID}: An order whose product is not a subscription product creates no subscription @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);
    const subs = new SubscriptionPageMig(page);

    let quotationId = '';
    let customerName = '';
    let statusAfterConfirm = '';
    let smartButtonRef = '';
    let hasButton = true;
    let peerCount = -1;
    let pushState: string | null = null;
    let subRef: string | null = null;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      console.log(`  account : ${SALESPERSON.username}`);
      await loginToO12CE(page, SALESPERSON);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await openOpportunitiesListOnO12CE(page);
      const opp = await createOpportunityOnO12CE(page, TC_ID);
      customerName = opp.companyValue || opp.contactValue || opp.contactName;
      createdCustomerName = customerName;
      console.log(`  Opportunity  : ${opp.oppName} (id ${opp.oppId})`);
      console.log(`  Customer     : ${customerName}`);

      const de = await addDealElementOnO12CE(page, { product: SKU_NON_SUBSCRIPTION, productQty: ORDERED_QTY, pricelist: PRICELIST });
      console.log(`  Product line : ${de.productName}`);
      console.log(`  Ordered Qty  : ${ORDERED_QTY}`);

      const q = await pressNewQuotationOnO12CE(page, { opportunityId: opp.oppId });
      quotationId = q.quotationId;
      console.log(`  Quotation    : id ${quotationId || '-'} (${q.elapsedMs} ms)`);
      expect(quotationId, 'Pre-condition: NEW QUOTATION must produce a resolvable sale.order').not.toBe('');

      // The whole case rests on the line NOT being a subscription product. The Deal Element's
      // product picker reports its own label (the run log showed "first product"), which says
      // nothing about what actually landed - so read the line back and pin it. Without this the
      // test passes whenever no subscription appears, including when the wrong product was added.
      const lineProducts = await subs.getOrderLineProductFlags(quotationId);
      console.log('  Order line(s) actually on the quotation:');
      for (const l of lineProducts) {
        console.log(`    - [${l.sku}] ${l.name}  nakivo_subscription_ok = ${l.subscriptionable}`);
      }
      expect(lineProducts.length, 'Pre-condition: the quotation should carry exactly one order line').toBe(1);
      expect(lineProducts[0].sku, `Pre-condition: the order line must be ${SKU_NON_SUBSCRIPTION}, the product this case is about`).toBe(SKU_NON_SUBSCRIPTION);
      expect(lineProducts[0].subscriptionable, `Pre-condition: ${SKU_NON_SUBSCRIPTION} must NOT be flagged Subscriptionable - otherwise this negative case proves nothing`).toBeFalsy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - quotation created').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      // Give the push the same budget the positive case needs (it settles in ~3.5 s), so "nothing
      // was created" is a real wait and not a race won by reading too early.
      const push = await subs.waitForSubscriptionPushById(quotationId);
      pushState = push.pushState;
      subRef = push.ref;
      console.log(`  after ${push.waitedMs} ms: contract_push_state = "${pushState}", contract_remote_ref = "${subRef ?? ''}"`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      statusAfterConfirm = await quotationPage.getQuotationStatusFromServer().catch(() => '');
      smartButtonRef = await subs.getSubscriptionSmartButtonRef().catch(() => '');
      hasButton = await subs.hasSubscriptionSmartButton().catch(() => false);
      console.log(`  status (after reload)           : "${statusAfterConfirm}"`);
      console.log(`  Subscription smart button       : present = ${hasButton}, reference = "${smartButtonRef}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - confirmed order, no Subscription smart button').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await subs.loginPresales();
      const rows = await subs.presalesCallKw<any[]>(
        'sale.subscription', 'search_read',
        [[['partner_id.name', '=', customerName]], ['code', 'template_id']],
        { limit: 20 },
      );
      peerCount = rows.length;
      console.log(`  subscriptions on the peer for "${customerName}": ${peerCount}`);
      for (const r of rows) console.log(`    - ${r.code} ${JSON.stringify(r.template_id)}`);
    });

    await test.step(STEP.verify, async () => {
      const p1 = /sale\s*order/i.test(statusAfterConfirm);
      const p2 = !hasButton && smartButtonRef === '';
      const p3 = peerCount === 0;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - the order confirms normally:');
      console.log('     Expected : status bar "Sale Order" (the product decides the subscription, not whether the order may confirm)');
      console.log(`     Actual   : "${statusAfterConfirm}"`);
      console.log(`     Result   : ${p1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - no Subscription smart button on the confirmed order:');
      console.log('     Expected : absent, and no SUB reference (a button carrying a reference here means a subscription was created for a non-subscription product)');
      console.log(`     Actual   : present = ${hasButton}, reference = "${smartButtonRef}", contract_remote_ref = "${subRef ?? ''}", push_state = "${pushState ?? ''}"`);
      console.log(`     Result   : ${p2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - no subscription exists for this customer on the service:');
      console.log(`     Expected : 0 (the product, not the order, decides whether one is created)`);
      console.log(`     Actual   : ${peerCount}`);
      console.log(`     Result   : ${p3 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${p1 && p2 && p3 ? 'PASS' : 'FAIL'} - a non-subscription product creates no subscription`);

      expect(statusAfterConfirm, `VP1: the order should confirm without error and become a SALE ORDER (status read: "${statusAfterConfirm}")`).toMatch(/sale\s*order/i);
      expect(hasButton, 'VP2: a confirmed order holding no subscription product must not offer a Subscription smart button').toBeFalsy();
      expect(smartButtonRef, 'VP2: and it must carry no SUB reference').toBe('');
      expect(peerCount, `VP3: no subscription should exist for "${customerName}" - the product, not the order, decides whether one is created`).toBe(0);
    });
  });
});
