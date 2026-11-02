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
 *  CRM-11806_10.1 - Order and subscription reach each other inside the CRM
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_10.1
 *  Spec ID:         IS-CRM-FUNC-0173 / SC-28
 *                   Spec text  : status, invoices and source order are reachable from the customer and the order WITHOUT leaving the CRM
 *                   Authority  : Confluence "[Migration] Subscription Management (Recurring Billing)" pageId 222538152 v4 (2026-09-07), which SUPERSEDES the FRD.
 *                   Was        : "SC-28" - an FRD user story, replaced 2026-10-19.
 *  Spec:            [Migration] Subscription Management (Recurring Billing) - the AUTHORITY
 *                   https://confluence.nakivo.com/pages/viewpage.action?pageId=222538152 (v4, 2026-09-07)
 *                   It SUPERSEDES the FRD (pageId 222528736); do not key assertions to the FRD.
 *  Jira:            CRM-12140 (implementation) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-09
 *  Run as:          users.admin_crm_mig on the CRM, users.anh_ho_presales_mig on the peer (see D6)
 * --------------------------------------------------------------------------------------------
 *  PORT - the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/10.Integration-with-the-CRM-and-visibility/
 *                    tc-subscription-10-1-order-and-subscription-reach-each-other-inside-the-crm.spec.ts
 *  Baseline TC ID  : subscription-10.1
 *  QA card         : SC-28 - "Subscription Test Cases" (CRM-12140, Nathan)
 *
 *  DEVIATIONS. Expected VALUES are the baseline's; only the controls move. Every one of these was
 *  MEASURED on the live screen on 2026-10-09, not assumed.
 *   D1. CREATION PATH. The baseline opens Sales > Orders > Quotations and clicks CREATE. On crm-mig
 *       that path is a known blocker, so the order is built the way CRM-11806_1.1 builds it:
 *       Opportunity > Deal Element > "New quotation" > CONFIRM. Same order, same product, same qty.
 *   D2. WHERE THE SUBSCRIPTION IS READ. crm-mig carries no `sale.subscription` model; the record
 *       lives on the peer (pre-sales-crm-mig.nakivo.site, db odoo19) and the CRM renders it in
 *       `iframe.o_nakivo_embed_frame`.
 *   D3. THE SMART BUTTON HAS A DIFFERENT SHAPE. On the ORDER crm-mig renders
 *       `button[name="action_embed_remote_subscription"]`, SINGULAR, carrying the REFERENCE
 *       ("SUB00008 Subscription"); pre-production renders `action_open_subscriptions` with a COUNT.
 *       VP1 is therefore re-worded, NOT weakened: exactly ONE reference on the button, and it
 *       equals the order's own `contract_remote_ref`. Same claim, read off the control that exists.
 *       On the CONTACT the button is the plural counting one, `action_embed_remote_subscriptions`
 *       ("1 Subscriptions") - so VP5 keeps the baseline's count assertion unchanged.
 *   D4. THE EMBED NEEDS A PEER SESSION. The bootstrap REUSES a peer session, it does not create
 *       one: clicking the smart button with no peer session mounts the iframe on
 *       `<peer>/web/login`. Measured 2026-10-09 for anh.ho@nakivo.com, a user that holds both
 *       Subscriptions groups and signs in to the peer as uid 67. **That is SC-31's defect and it
 *       belongs to CRM-11806_11.4, which carries the finding** - this case signs in to the peer
 *       in the same browser context first so that SC-28's own subject can be tested at all.
 *   D6. THE ACTOR. The baseline runs as a Salesperson (`users.sale_ic_thomas`). That key is the
 *       PRE-PRODUCTION password entry; crm-mig's twin is `users.sale_ic_thomas_crm_mig`. The embed
 *       resolves identity on the peer BY LOGIN, and this suite's peer credentials are
 *       `users.anh_ho_presales_mig` - so the case runs as the account that exists on both sides,
 *       and the two halves are the same person. Whether a Thomas Semerich account exists on the
 *       peer is UNVERIFIED; it is not assumed either way here. What SC-28 checks is reachability,
 *       not permissions - permissions are CRM-11806_11.1's subject.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a Salesperson
 *    Open Sales > Orders > Quotations and click "CREATE"       [see D1]
 *    Fill the quotation form with:
 *      - Customer  = "Cust-Visible-<unique>"
 *      - Pricelist = "Public Pricelist_USD (USD)"
 *    On the "Order Lines" tab click "Add a line" and fill:
 *      - Product     = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *      - Ordered Qty = 50
 *    Click "SAVE", then click "CONFIRM"
 *    Write down the order number shown in the breadcrumb (e.g. SO216758)
 *
 *  Steps to reproduce:
 *   1. Read the "Subscriptions" smart button at the top right of the confirmed order
 *   2. Click the "Subscriptions" smart button
 *   3. Read the subscription status bar and its Customer
 *   4. Click the "Sales" smart button on the subscription and read the order number
 *   5. Open Contacts, search "Cust-Visible-<unique>" and open the contact
 *
 *  Verification Points:
 *   VP1. The "Subscriptions" smart button reads 1            [D3: one reference == contract_remote_ref]
 *   VP2. The subscription opens straight from the order without leaving the CRM
 *   VP3. The status bar highlights IN PROGRESS and the Customer is "Cust-Visible-<unique>"
 *   VP4. The "Sales" smart button returns to the same order number
 *   VP5. The contact record gives access to the same subscription from inside the CRM
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_10\.1:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_10.1';
const SALESPERSON = users.admin_crm_mig;
const ORDERED_QTY = 50;
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
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a Salesperson',
  pre2: `Pre-condition 2-5: Create the order - Customer = "Cust-<unique>", Pricelist = "${PRICELIST}", one Order Line with Product = "[${SKU_ENT_MONTHLY}] min 50Ent Machines, 1Month Subscription" and Ordered Qty = ${ORDERED_QTY}; SAVE, then CONFIRM, and note the order number`,
  s1: 'Step 1: Read the "Subscriptions" smart button at the top right of the confirmed order',
  s2: 'Step 2: Click the "Subscriptions" smart button',
  s3: 'Step 3: Read the subscription status bar and its Customer',
  s4: 'Step 4: Click the "Sales" smart button on the subscription and read the order number',
  s5: 'Step 5: Open Contacts, search the customer and open the contact',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - Order and subscription reach each other inside the CRM`, () => {
  /** Keyed on what the run CREATED, never on having read it back - that guard leaked five records. */
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
    // The peer first: confirming the order creates a subscription there that the CRM-side teardown
    // cannot see. Sweep by THIS RUN'S customer so it still fires when the spec failed early, and so
    // it can never reach a migrated record.
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
    await teardownMigRecords(page, SKIP_CLEANUP, { asAdmin: true }).catch((e) =>
      console.log(`teardown problem: ${String(e?.message ?? e).slice(0, 200)}`),
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    if (SKIP_CLEANUP) { console.log(`[sweep] SKIPPED - SKIP_CLEANUP is true, leftovers of ${TC_ID} are left for inspection`); return; }
    await sweepMigLeftoversAfterAll(browser, TC_ID).catch(() => {});
  });

  test(`${TC_ID}: A confirmed order opens its subscription and the subscription returns to the same order @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const quotationPage = new QuotationPage(page);
    const subs = new SubscriptionPageMig(page);

    const t0 = Date.now();
    const lap = (label: string) => console.log(`  [t+${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${label}`);

    let customerName = '';
    let orderId = '';
    let orderNumber = '';
    let smartButtonRef = '';
    let contractRemoteRef = '';
    let topHostAfterClick = '';
    let embedShowsPeerLogin = true;
    let embedFormReady = false;
    let embedStage = '';
    let embedCustomer = '';
    let embedReference = '';
    let salesButtonText = '';
    let salesButtonCount = -1;
    let orderReachedFromSubscription = '';
    let contactSubscriptionsButton = '';
    let contactSubscriptionCount = -1;

    // ===================== Pre-conditions =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      lap('pre1 START');
      console.log(`  account : ${SALESPERSON.username}`);
      await loginToO12CE(page, SALESPERSON);
      console.log('  OK - signed in on crm-mig');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      lap('pre2 START');
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
      orderId = q.quotationId;
      expect(orderId, 'Pre-condition: NEW QUOTATION must produce a resolvable sale.order').not.toBe('');

      await quotationPage.clickConfirm(CommonUtils.waitTimes.savingPage);
      console.log('  OK - CONFIRM pressed');
      // The push to the peer is a queued job; the reference is not on the record yet.
      const push = await subs.waitForSubscriptionPushById(orderId);
      console.log(`  push settled after ${push.waitedMs} ms - state "${push.pushState}", ref "${push.ref ?? ''}"`);

      // The breadcrumb number is read from the SERVER: the crm-mig status bar and breadcrumb are
      // stale right after CONFIRM (CRM-11806_1.1 established this).
      const link = await subs.getOrderSubscriptionLinkById(orderId);
      contractRemoteRef = link?.ref ?? '';
      orderNumber = link?.name ?? '';
      console.log(`  Order number          : "${orderNumber}"`);
      console.log(`  contract_remote_ref   : "${contractRemoteRef}"`);
      expect(orderNumber, 'Pre-condition: the confirmed order should carry an order number').not.toBe('');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - order confirmed').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      lap('s1 START');
      // The crm-mig order form is STALE right after CONFIRM: the push to the peer is a queued job,
      // and the Subscription smart button is not rendered until the form is drawn again. Measured
      // 2026-10-09 - reading it without this reload returns "" on an order whose
      // `contract_remote_ref` is already set, which looks exactly like "no subscription was
      // created". Re-open the order the way the manual tester would.
      await page.goto(`${baseUrl_mig}web#id=${orderId}&model=sale.order&view_type=form`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 6);
      await page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first()
        .waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait }).catch(() => {});
      smartButtonRef = await subs.getSubscriptionSmartButtonRef().catch(() => '');
      console.log(`  "Subscription" smart button shows: "${smartButtonRef}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - order with the Subscription smart button').catch(() => {});
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      lap('s2 START');
      // D4: establish the peer session the bootstrap will reuse. Without this the iframe lands on
      // the peer's sign-in page - which is SC-31 / CRM-11806_11.4, not this case's subject.
      await subs.loginPresales();
      console.log('  D4 - signed in to the peer in this browser context');

      await page.locator(SubscriptionPageMig.SMART_BUTTON_SELECTOR).first()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait });
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 5);

      topHostAfterClick = new URL(page.url()).host;
      const peerFrame = page.frames().find((f) => f.url().includes('pre-sales-crm-mig'));
      embedShowsPeerLogin = !peerFrame || /\/web\/login/.test(peerFrame.url());
      console.log(`  top-level host after the click : ${topHostAfterClick}`);
      console.log(`  embed frame URL                : ${peerFrame?.url() ?? '(no peer frame)'}`);
      console.log(`  embed shows the peer sign-in   : ${embedShowsPeerLogin}`);
      if (peerFrame) {
        embedFormReady = await subs.waitForEmbedFormReady(peerFrame);
        console.log(`  embed subscription form ready  : ${embedFormReady}`);
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - subscription opened from the order').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      lap('s3 START');
      const peerFrame = page.frames().find((f) => f.url().includes('pre-sales-crm-mig'));
      if (peerFrame && embedFormReady) {
        embedStage = await subs.getEmbedStage(peerFrame);
        embedCustomer = await subs.readEmbedField(peerFrame, 'remote_partner_id');
        embedReference = await subs.getEmbedReference(peerFrame);
      }
      console.log(`  status bar (current stage) : "${embedStage}"`);
      console.log(`  Customer                   : "${embedCustomer}"`);
      console.log(`  Reference (breadcrumb)     : "${embedReference}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - subscription status bar and Customer').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      lap('s4 START');
      const peerFrame = page.frames().find((f) => f.url().includes('pre-sales-crm-mig'));
      if (peerFrame && embedFormReady) {
        // On the peer's subscription form the back-link is `action_open_source_order` and it is
        // labelled "<n> Sales" - measured 2026-10-09 on SUB00008.
        const salesBtn = peerFrame.locator('button[name="action_open_source_order"]').first();
        if (await salesBtn.count().catch(() => 0)) {
          salesButtonText = (await salesBtn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => ''))
            .replace(/\s+/g, ' ').trim();
          const m = salesButtonText.match(/\d+/);
          salesButtonCount = m ? parseInt(m[0], 10) : -1;
          console.log(`  "Sales" smart button : "${salesButtonText}" -> ${salesButtonCount}`);
          await salesBtn.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch((e) =>
            console.log(`  clicking the "Sales" smart button failed: ${String(e).slice(0, 160)}`));
          await page.waitForTimeout(CommonUtils.waitTimes.standard * 6);
          // where did it land - the CRM order, or somewhere on the peer?
          const after = page.frames().find((f) => f.url().includes('pre-sales-crm-mig'));
          const crumb = after
            ? (await after.locator('.o_breadcrumb, .o_control_panel').first()
                .innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => ''))
            : '';
          const topText = await page.locator('.breadcrumb, .o_control_panel').first()
            .innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '');
          const hay = `${crumb} ${topText} ${page.url()}`;
          const om = hay.match(/SO\d+/);
          orderReachedFromSubscription = om ? om[0] : '';
          console.log(`  after the click - top URL  : ${page.url()}`);
          console.log(`  order number reached       : "${orderReachedFromSubscription}"`);
        } else {
          console.log('  the subscription form carries NO "Sales" smart button');
        }
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - back on the originating order').catch(() => {});
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      lap('s5 START');
      // On the CONTACT the control is the PLURAL counting button - `action_embed_remote_subscriptions`
      // labelled "1 Subscriptions" (measured 2026-10-09), so the baseline's count assertion stands.
      // `search` is not in MigDataParityPage.ALLOWED_METHODS (that class is read-only by
      // construction); search_read is.
      const partnerId = await subs.readKw<any[]>('res.partner', 'search_read',
        [[['name', '=', customerName]], ['id']], { limit: 1 })
        .then((rows) => (rows && rows.length ? Number(rows[0].id) : 0)).catch(() => 0);
      console.log(`  contact id for "${customerName}": ${partnerId || '(not found)'}`);
      if (partnerId) {
        contactSubscriptionCount = await subs.getPartnerSubscriptionCount(partnerId).catch(() => -1);
        await page.goto(`${baseUrl_mig}web#id=${partnerId}&model=res.partner&view_type=form`, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        // WAIT FOR THE BUTTON, do not guess how long the form takes. A fixed
        // `waitForTimeout(8 s)` here passed when the spec ran alone and FAILED inside the full-suite
        // run on 2026-10-12 (VP5 read ""), because the contact form had not finished drawing its
        // button box yet. The control itself is the readiness signal.
        const btn = page.locator('button[name="action_embed_remote_subscriptions"]').first();
        const btnReady = await btn.waitFor({ state: 'visible', timeout: CommonUtils.waitTimes.abnormalWait })
          .then(() => true).catch(() => false);
        console.log(`  contact "Subscriptions" button rendered: ${btnReady}`);
        if (btnReady) {
          contactSubscriptionsButton = (await btn.innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => ''))
            .replace(/\s+/g, ' ').trim();
        }
      }
      console.log(`  contact "Subscriptions" smart button : "${contactSubscriptionsButton}"`);
      console.log(`  res.partner.subscription_count       : ${contactSubscriptionCount}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the contact reaches the same subscription').catch(() => {});
    });

    // ===================== Verification =====================
    lap('all steps done - entering VERIFY');
    await test.step(STEP.verify, async () => {
      const p1 = smartButtonRef !== '' && smartButtonRef === contractRemoteRef;
      const p2 = topHostAfterClick.includes('crm-mig.nakivo.site') && !embedShowsPeerLogin && embedFormReady;
      const p3 = /in\s*progress/i.test(embedStage) && embedCustomer.includes(customerName);
      const p4 = salesButtonCount === 1 && orderReachedFromSubscription === orderNumber;
      const contactCountOnButton = (contactSubscriptionsButton.match(/\d+/) || ['-1'])[0];
      const p5 = parseInt(contactCountOnButton, 10) === 1 && contactSubscriptionCount === 1;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #1 - the order\'s "Subscriptions" smart button reads 1 [D3: one reference]:');
      console.log(`     Expected : exactly ONE reference on the button, equal to the order's contract_remote_ref "${contractRemoteRef}"`);
      console.log(`     Actual   : button shows "${smartButtonRef}"`);
      console.log(`     Result   : ${p1 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - the subscription opens straight from the order without leaving the CRM:');
      console.log('     Expected : the top-level page stays on crm-mig.nakivo.site AND the embed shows the subscription form, not the peer sign-in');
      console.log(`     Actual   : top host "${topHostAfterClick}", peer sign-in shown = ${embedShowsPeerLogin}, form ready = ${embedFormReady}`);
      console.log(`     Result   : ${p2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the status bar highlights IN PROGRESS and the Customer is the order\'s customer:');
      console.log(`     Expected : current stage "In Progress", Customer contains "${customerName}"`);
      console.log(`     Actual   : stage "${embedStage}", Customer "${embedCustomer}" (reference "${embedReference}")`);
      console.log(`     Result   : ${p3 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - the "Sales" smart button returns to the same order number:');
      console.log(`     Expected : the button reads 1 and leads back to "${orderNumber}"`);
      console.log(`     Actual   : button "${salesButtonText}" -> ${salesButtonCount}, order reached "${orderReachedFromSubscription}"`);
      console.log(`     Result   : ${p4 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the contact gives access to the same subscription from inside the CRM:');
      console.log('     Expected : the contact\'s "Subscriptions" smart button reads 1, and res.partner.subscription_count is 1');
      console.log(`     Actual   : button "${contactSubscriptionsButton}", subscription_count ${contactSubscriptionCount}`);
      console.log(`     Result   : ${p5 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${p1 && p2 && p3 && p4 && p5 ? 'PASS' : 'FAIL'} - order "${orderNumber}" and its subscription reach each other inside the CRM`);

      let __verifyPassed = false;
      try {
        expect(smartButtonRef, 'VP1: the order should carry exactly one subscription reference on its smart button').not.toBe('');
        expect(smartButtonRef, `VP1: the smart button reference should equal the order's contract_remote_ref "${contractRemoteRef}"`).toBe(contractRemoteRef);
        expect(topHostAfterClick, 'VP2: opening the subscription should stay inside the CRM').toContain('crm-mig.nakivo.site');
        expect(embedShowsPeerLogin, 'VP2: the embed should show the subscription, not the peer sign-in page').toBeFalsy();
        expect(embedFormReady, 'VP2: the embedded subscription form should render').toBeTruthy();
        expect(embedStage, `VP3: the status bar should highlight IN PROGRESS (read: "${embedStage}")`).toMatch(/in\s*progress/i);
        expect(embedCustomer, `VP3: the subscription Customer should be "${customerName}"`).toContain(customerName);
        expect(salesButtonCount, 'VP4: the subscription\'s "Sales" smart button should read 1').toBe(1);
        expect(orderReachedFromSubscription, `VP4: the "Sales" smart button should lead back to "${orderNumber}"`).toBe(orderNumber);
        expect(parseInt(contactCountOnButton, 10), 'VP5: the contact\'s "Subscriptions" smart button should read 1').toBe(1);
        expect(contactSubscriptionCount, 'VP5: res.partner.subscription_count should be 1').toBe(1);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Verification - order and subscription reach each other', passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
