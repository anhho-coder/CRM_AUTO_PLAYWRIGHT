import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { QuotationPage, DealElementPage } from '@pages';
import { HomePageMig as HomePage, SubscriptionPageMig } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import { SKU_ENT_MONTHLY, SKU_O365 } from '@helpers/crm-11806-subscription.helper';
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
 *  CRM-11806_1.3 - Two subscription lines land on one subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_1.3
 *  Spec ID:         IS-CRM-FUNC-0137 / SC-01
 *                   Spec text  : more than one subscription product creates ONE subscription for the whole order
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "SC-01" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12140 (implementation) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-12
 *  Run as:          Salesperson (users.sale_ic_thomas_crm_mig)
 * --------------------------------------------------------------------------------------------
 *  PORT - the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/1.Subscription-creation-from-the-CRM/
 *                    tc-subscription-1-3-two-subscription-lines-land-on-one-subscription.spec.ts
 *  Baseline TC ID  : subscription-1.3
 *  QA card         : SC-01 - "Subscription Test Cases" (CRM-12140, Nathan)
 *
 *  DEVIATIONS. Expected VALUES are the baseline's; only the controls move.
 *   D1. CREATION PATH. The baseline opens Sales > Orders > Quotations and clicks CREATE. On crm-mig
 *       that path is a known blocker, so the order is built the way CRM-11806_1.1 builds it:
 *       Opportunity > Deal Element > "New quotation" > CONFIRM. The SECOND order line is added by
 *       re-opening the saved Deal Element with EDIT and calling `addProductBySku` again - the
 *       helper `addDealElementOnO12CE` only takes one product.
 *   D2. WHERE THE SUBSCRIPTION IS READ. crm-mig carries no `sale.subscription` model; the record
 *       lives on the peer (pre-sales-crm-mig.nakivo.site, db odoo19). Steps 4-5 read it over the
 *       peer's authenticated JSON-RPC: `sale_subscription_line_ids` -> `sale.subscription.line`
 *       (`product_id`, `product_uom_qty`, `price_subtotal`) and `recurring_total`
 *       ("Recurring Price"). Field names verified on the peer 2026-10-12.
 *   D3. THE SMART BUTTON HAS A DIFFERENT SHAPE. crm-mig renders
 *       `button[name="action_embed_remote_subscription"]`, SINGULAR, carrying the REFERENCE;
 *       pre-production renders `action_open_subscriptions` with a COUNT. VP2 is therefore
 *       re-worded, NOT weakened: exactly ONE reference on the button, equal to the order's own
 *       `contract_remote_ref`. "One subscription for the whole order, not one per product" is
 *       exactly what that asserts.
 *   D4. THE ORDER FORM IS STALE AFTER CONFIRM. The push to the peer is a queued job and the smart
 *       button is not drawn until the form is re-rendered, so the order is re-opened by id before
 *       step 2 reads it.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a Salesperson (e.g. Thomas Semerich)
 *    Open Sales > Orders > Quotations and click "CREATE"            [see D1]
 *    Fill the quotation form with:
 *      - Customer  = "Cust-TwoLines-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill the first line:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Ordered Qty = 50
 *    Click "Add a line" again and fill the second line:
 *      - Product     = "[CP-NC-O365] Office 365 for CSP - No Commitment"
 *      - Ordered Qty = 100
 *    Click "SAVE"
 *
 *  Steps to reproduce:
 *   1. Click "CONFIRM"
 *   2. Read the number on the "Subscriptions" smart button
 *   3. Click the "Subscriptions" smart button
 *   4. Open the "Subscription Lines" tab and count the lines
 *   5. Read the "Recurring Price" shown at the bottom right of that tab
 *
 *  Verification Points:
 *   VP2. The "Subscriptions" smart button reads 1 - one subscription for the whole order,
 *        not one per product                                        [D3: one reference]
 *   VP4. The subscription holds exactly 2 lines, with the ordered products and quantities
 *   VP5. The Recurring Price equals the sum of the two lines' Sub Total values
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_1\.3:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_1.3';
const SALESPERSON = users.sale_ic_thomas_crm_mig;
const QTY_ENT = 50;
const QTY_O365 = 100;
const PRICELIST = 'Public Pricelist_USD';

/** crm-mig allows writes only against a teardown that actually runs. Keep this false. */
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

const STEP = {
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a Salesperson (Thomas Semerich)',
  pre2: `Pre-condition 2-4: Create the order with TWO order lines - "[${SKU_ENT_MONTHLY}]" x ${QTY_ENT} and "[${SKU_O365}]" x ${QTY_O365}, Pricelist "${PRICELIST}"; click SAVE`,
  s1: 'Step 1: Click "CONFIRM"',
  s2: 'Step 2: Read the number on the "Subscriptions" smart button',
  s3: 'Step 3: Click the "Subscriptions" smart button',
  s4: 'Step 4: Open the "Subscription Lines" tab and count the lines',
  s5: 'Step 5: Read the "Recurring Price" shown at the bottom right of that tab',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Two subscription lines land on one subscription`, () => {
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
    // The peer first: the CRM-side teardown cannot see what confirming the order created there.
    // Keyed on THIS RUN's customer, so it fires even when the spec failed before reading it back.
    if (!SKIP_CLEANUP && createdCustomerName) {
      try {
        const subs = new SubscriptionPageMig(page);
        await subs.loginPresales();
        const mine = await subs.presalesCallKw<any[]>(
          'sale.subscription', 'search_read',
          [[['partner_id.name', '=', createdCustomerName]], ['code']], { limit: 20 },
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
    await teardownMigRecords(page, SKIP_CLEANUP, { asAdmin: true }).catch((e) =>
      console.log(`teardown problem: ${String(e?.message ?? e).slice(0, 200)}`),
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP) { console.log(`[sweep] SKIPPED - SKIP_CLEANUP is true, leftovers of ${TC_ID} are left for inspection`); return; }
    await sweepMigLeftoversAfterAll(browser, TC_ID).catch(() => {});
  });

  test(`${TC_ID}: An order with two subscription products creates ONE subscription carrying both lines @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);
    const dealElementPage = new DealElementPage(page);
    const subs = new SubscriptionPageMig(page);

    const t0 = Date.now();
    const lap = (label: string) => console.log(`  [t+${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${label}`);

    let orderId = '';
    let orderLineCount = -1;
    let smartButtonRef = '';
    let contractRemoteRef = '';
    let embedOpened = false;
    let subLines: Array<{ sku: string; qty: number; subtotal: number }> = [];
    let recurringTotal = -1;
    let lineSubtotalSum = -1;

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      lap('pre1 START');
      await loginToO12CE(page, SALESPERSON);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      lap('pre2 START');
      await openOpportunitiesListOnO12CE(page);
      const opp = await createOpportunityOnO12CE(page, TC_ID);
      createdCustomerName = opp.companyValue || opp.contactValue || opp.contactName;
      console.log(`  Opportunity : ${opp.oppName} (id ${opp.oppId})`);
      console.log(`  Customer    : ${createdCustomerName}`);

      // first line, through the shared chain (it ends with the Deal Element SAVED)
      const de = await addDealElementOnO12CE(page, { product: SKU_ENT_MONTHLY, productQty: QTY_ENT, pricelist: PRICELIST });
      console.log(`  Line 1      : ${de.productName} x ${QTY_ENT}`);

      // D1 - second line: the saved form is read-only, so EDIT it and add the line, then SAVE again
      await dealElementPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 2);
      const name2 = await dealElementPage.addProductBySku(SKU_O365, QTY_O365);
      expect(name2, `a second product line ("${SKU_O365}") must be addable on the Deal Element`).not.toBe('');
      console.log(`  Line 2      : ${name2} x ${QTY_O365}`);
      await dealElementPage.save(CommonUtils.waitTimes.savingPage);
      await dealElementPage.waitForEditButton(CommonUtils.waitTimes.savingPage);

      orderLineCount = await dealElementPage.getOrderLineCount().catch(() => -1);
      console.log(`  Deal Element order lines: ${orderLineCount}`);
      expect(orderLineCount, 'Pre-condition: the Deal Element should carry exactly 2 order lines').toBe(2);

      const q = await pressNewQuotationOnO12CE(page, { opportunityId: opp.oppId });
      orderId = q.quotationId;
      expect(orderId, 'Pre-condition: NEW QUOTATION must produce a resolvable sale.order').not.toBe('');
      console.log(`  Quotation   : id ${orderId}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - quotation with two lines').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      lap('s1 START');
      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      console.log('  OK - CONFIRM pressed');
      const push = await subs.waitForSubscriptionPushById(orderId);
      console.log(`  push settled after ${push.waitedMs} ms - state "${push.pushState}", ref "${push.ref ?? ''}"`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      lap('s2 START');
      // D4 - the order form is stale right after CONFIRM; re-open it the way a tester would
      await page.goto(`${baseUrl_mig}web#id=${orderId}&model=sale.order&view_type=form`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 6);
      await page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      smartButtonRef = await subs.getSubscriptionSmartButtonRef().catch(() => '');
      const link = await subs.getOrderSubscriptionLinkById(orderId);
      contractRemoteRef = link?.ref ?? '';
      console.log(`  "Subscription" smart button shows : "${smartButtonRef}"`);
      console.log(`  contract_remote_ref on the order  : "${contractRemoteRef}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the order smart button').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      lap('s3 START');
      // D4 of CRM-11806_10.1: the embed bootstrap REUSES a peer session, it does not mint one.
      await subs.loginPresales();
      await page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch((e) =>
          console.log(`  clicking the smart button failed: ${String(e).slice(0, 160)}`));
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 5);
      const frame = page.frames().find((f) => f.url().includes('pre-sales-crm-mig'));
      embedOpened = !!frame && (await subs.waitForEmbedFormReady(frame));
      console.log(`  the subscription opened in the embed: ${embedOpened}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - the subscription opened from the order').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      lap('s4 START');
      // D2 - read the lines off the peer. `sale_subscription_line_ids` is the subscription's own
      // o2m, so no reverse field has to be guessed.
      const head = await subs.presalesCallKw<any[]>(
        'sale.subscription', 'search_read',
        [[['code', '=', contractRemoteRef]], ['code', 'recurring_total', 'sale_subscription_line_ids']],
        { limit: 1 },
      );
      const h = head?.[0];
      recurringTotal = Number(h?.recurring_total ?? -1);
      const lineIds: number[] = h?.sale_subscription_line_ids ?? [];
      const rows = lineIds.length
        ? await subs.presalesCallKw<any[]>('sale.subscription.line', 'read',
            [lineIds, ['product_id', 'product_uom_qty', 'price_subtotal']], {})
        : [];
      subLines = rows.map((r: any) => ({
        sku: String(r.product_id?.[1] ?? ''),
        qty: Number(r.product_uom_qty ?? 0),
        subtotal: Number(r.price_subtotal ?? 0),
      }));
      lineSubtotalSum = subLines.reduce((a, l) => a + l.subtotal, 0);
      console.log(`  subscription "${contractRemoteRef}" holds ${subLines.length} line(s):`);
      for (const l of subLines) console.log(`    ${l.qty} x "${l.sku}"  subtotal ${l.subtotal}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      lap('s5 START');
      console.log(`  Recurring Price (recurring_total) : ${recurringTotal}`);
      console.log(`  sum of the line Sub Totals        : ${lineSubtotalSum}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - Recurring Price').catch(() => {});
    });

    lap('all steps done - entering VERIFY');
    await test.step(STEP.verify, async () => {
      const p2 = smartButtonRef !== '' && smartButtonRef === contractRemoteRef;
      const hasEnt = subLines.some((l) => l.sku.includes(SKU_ENT_MONTHLY) && l.qty === QTY_ENT);
      const hasO365 = subLines.some((l) => l.sku.includes(SKU_O365) && l.qty === QTY_O365);
      const p4 = subLines.length === 2 && hasEnt && hasO365;
      const p5 = recurringTotal >= 0 && Math.abs(recurringTotal - lineSubtotalSum) <= 0.05;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #2 - the order carries ONE subscription, not one per product:');
      console.log(`     Expected : exactly ONE reference on the smart button, equal to the order's contract_remote_ref "${contractRemoteRef}"`);
      console.log(`     Actual   : button shows "${smartButtonRef}"`);
      console.log(`     Result   : ${p2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the subscription holds exactly 2 lines with the ordered products and quantities:');
      console.log(`     Expected : 2 lines - "${SKU_ENT_MONTHLY}" x ${QTY_ENT} and "${SKU_O365}" x ${QTY_O365}`);
      console.log(`     Actual   : ${subLines.length} line(s) ${JSON.stringify(subLines)}`);
      console.log(`     Result   : ${p4 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the Recurring Price equals the sum of the two lines\' Sub Totals:');
      console.log(`     Expected : recurring_total == ${lineSubtotalSum}`);
      console.log(`     Actual   : recurring_total = ${recurringTotal}`);
      console.log(`     Result   : ${p5 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${p2 && p4 && p5 ? 'PASS' : 'FAIL'} - two order lines land on one subscription`);

      let __verifyPassed = false;
      try {
        expect(smartButtonRef, 'VP2: the order should carry exactly one subscription reference').not.toBe('');
        expect(smartButtonRef, `VP2: the smart button reference should equal contract_remote_ref "${contractRemoteRef}"`).toBe(contractRemoteRef);
        expect(subLines.length, 'VP4: the subscription should hold exactly 2 lines').toBe(2);
        expect(hasEnt, `VP4: a line for "${SKU_ENT_MONTHLY}" x ${QTY_ENT} should be on the subscription`).toBeTruthy();
        expect(hasO365, `VP4: a line for "${SKU_O365}" x ${QTY_O365} should be on the subscription`).toBeTruthy();
        expect(recurringTotal, 'VP5: the Recurring Price should equal the sum of the line Sub Totals').toBeCloseTo(lineSubtotalSum, 1);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Verification - two lines, one subscription', passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
