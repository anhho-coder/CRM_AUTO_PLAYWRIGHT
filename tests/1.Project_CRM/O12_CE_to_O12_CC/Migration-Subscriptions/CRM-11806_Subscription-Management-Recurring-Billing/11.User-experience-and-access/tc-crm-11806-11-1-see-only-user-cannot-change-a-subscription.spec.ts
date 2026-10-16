import { test, expect } from '@playwright/test';
import { users } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  loginToMigCrm,
  createSubscriptionViaEmbed,
  deleteSubscriptionOnPeer,
  MIG_TEST_CUSTOMER,
  SubscriptionPageMig,
} from '@helpers/crm-11806-mig-subscription.helper';
import { SKU_O365, TEMPLATE_MONTHLY_INVOICE_ONLY } from '@helpers/crm-11806-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_11.1 - A "See Subscriptions" user can read but not change a subscription
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_11.1
 *  Spec ID:         US14 (Access rights) / SC-33
 *  Spec:            [Migration] Subscription Management (Recurring Billing)
 *  Jira:            CRM-12140 (implementation) / CRM-11806 (feature)
 *  Automation-Type: ported
 *  Automation-Date: 2026-10-09
 *  Run as:          fixture by users.admin_crm_mig; the CASE ITSELF runs as
 *                   users.sale_ic_thomas_crm_mig (the see-only user - see B1 below)
 * --------------------------------------------------------------------------------------------
 *  PORT - the crm-mig twin of a pre-production baseline case.
 *  Baseline twin   : tests/1.Project_CRM/9.CRM_Module/8.Subscriptions/11.User-experience-and-access/
 *                    tc-subscription-11-1-see-only-user-cannot-change-a-subscription.spec.ts
 *  Baseline TC ID  : subscription-11.1
 *  QA card         : SC-33 - "Subscription Test Cases" (CRM-12140, Nathan)
 * --------------------------------------------------------------------------------------------
 *  B1 - the see-only account. CLEARED 2026-10-09 by the tester: Thomas Semerich is now
 *       `See Subscriptions` and nothing more. Verified by reading crm-mig res.groups the same day:
 *         115 "See Subscriptions"    (nakivo_subscription_integration.group_see_subscriptions)
 *                                    users [2, 9685, 8816, 17668, **9342**]
 *         116 "Manage Subscriptions" (…group_manage_subscriptions, implied_ids [115])
 *                                    users [2, 9685, 8816, 17668]   <- 9342 is NOT here
 *       The peer knows him too: res.users **63** `thomas.semerich@nakivo.com`, active, and his
 *       crm-mig password opens a peer session as that uid. Both halves of the embed are therefore
 *       the same person, which is what makes this case meaningful at all.
 *
 *  DEVIATIONS. Expected VALUES are the baseline's; only the controls move.
 *   D1. CREATE -> NEW. crm-mig has no `sale.subscription` model, so the fixture is built with
 *       `createSubscriptionViaEmbed()` (the embed's **New** + cloud save), not
 *       `Subscriptions > CREATE` + `SAVE`. Proven by CRM-11806_11.2.
 *   D2. WHERE THE SUBSCRIPTION LIVES. On the peer; the CRM renders it in
 *       `iframe.o_nakivo_embed_frame`. **Every VP of this case is therefore read inside the
 *       embed**, i.e. against the PEER's rights for peer uid 63 - not against crm-mig's.
 *       That is exactly what SC-33 is for: if the CRM-side "See Subscriptions" group does not
 *       restrict what the embed lets the user do, the assertions below go RED and that red is
 *       the migration finding.
 *   D4. THE EMBED NEEDS A PEER SESSION. The bootstrap reuses one, it does not mint one (see
 *       CRM-11806_11.4 / SC-31), so each half of this case signs in to the peer as the account it
 *       is acting as - admin for the fixture, Thomas for the steps.
 *   D5. THE CUSTOMER IS BORROWED. `remote_partner_id` resolves against partners that already
 *       exist, so the case uses the existing test contact "0123456789" and keys teardown on the
 *       subscription id. What the VPs check is what the user may DO, not which customer it is.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as a CRM administrator (e.g. Anh Ho)
 *    Create the subscription Customer "0123456789" [see D5] / "Monthly Sub/Invoice only" /
 *      Start Date today, with one line "[CP-NC-O365] Office 365 for CSP - No Commitment" x 10
 *    Click "SAVE", then click "IN PROGRESS" on the status bar
 *    Open Settings > Users & Companies > Users and pick a second internal user, then set on their
 *      form:
 *      - Subscriptions = "See Subscriptions"
 *      - (make sure "Manage Subscriptions" is NOT selected)
 *    Click "SAVE" and note that user's login
 *      [done once, by the tester, 2026-10-09 - Thomas Semerich. The spec does NOT change anyone's
 *       rights: automation must never downgrade a shared account mid-suite.]
 *
 *  Steps to reproduce:
 *   1. Log out and log back in as the see-only user
 *   2. Open Subscriptions > Subscriptions and open the subscription created above
 *   3. Look at the top left of the subscription list for the "CREATE" button
 *   4. On the open subscription look for the "Close" and "Upsell" buttons
 *   5. Click "IN PROGRESS" then "CLOSED" on the status bar and try to save
 *
 *  Verification Points:
 *   VP2. The subscription opens and all its details can be read
 *   VP3. The "CREATE" button is not offered to this user
 *   VP4. Neither the "Close" nor the "Upsell" button is offered
 *   VP5. The subscription cannot be changed: the Stage does not become CLOSED and an
 *        access-rights error message is shown when the change is attempted
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_11\.1:" --project=O12
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_11.1';
const ADMIN = users.admin_crm_mig;
/** The user permanently set to Subscriptions = "See Subscriptions" (crm-mig uid 9342 / peer 63). */
const SEE_ONLY = users.sale_ic_thomas_crm_mig;
const QUANTITY = 10;

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
  pre1: 'Pre-condition 1: Login to the CRM (crm-mig.nakivo.site) as a CRM administrator',
  pre2: `Pre-condition 2-3: Create the subscription - Customer = "${MIG_TEST_CUSTOMER}", Template = "${TEMPLATE_MONTHLY_INVOICE_ONLY}", Start Date = today, one line "[${SKU_O365}] Office 365 for CSP - No Commitment" x ${QUANTITY}; save, then "IN PROGRESS"`,
  s1: 'Step 1: Log out and log back in as the see-only user',
  s2: 'Step 2: Open Subscriptions > Subscriptions and open the subscription created above',
  s3: 'Step 3: Look at the top left of the subscription list for the "CREATE" button',
  s4: 'Step 4: On the open subscription look for the "Close" and "Upsell" buttons',
  s5: 'Step 5: Click "IN PROGRESS" then "CLOSED" on the status bar and try to save',
  verify: 'Verification',
} as const;

test.describe(`${TC_ID} - A see-only user cannot change a subscription`, () => {
  let adminSubs: SubscriptionPageMig | null = null;
  let createdId: number | null = null;
  let reference = '';

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
    // Delete as the ADMIN, not as the see-only user - and keyed on the id this run created, never
    // on having read it back. A fresh page object, because the browser now holds Thomas's session.
    if (!SKIP_CLEANUP && createdId) {
      const cleaner = new SubscriptionPageMig(page);
      await cleaner.loginPresales().catch(() => {});
      await deleteSubscriptionOnPeer(cleaner, createdId, reference, false);
    } else if (SKIP_CLEANUP) {
      console.log(`[peer teardown] SKIPPED - ${reference || createdId} left for inspection`);
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test(`${TC_ID}: A user with only "See Subscriptions" can read a subscription but cannot create, close, upsell or re-stage it @mig-live`, async ({ context, page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const t0 = Date.now();
    const lap = (label: string) => console.log(`  [t+${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${label}`);

    const today = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

    let seeOnlySubs: SubscriptionPageMig | null = null;
    let peerUidAsSeeOnly = -1;
    let recordOpened = false;
    let readableFields = { customer: '', template: '', stage: '', nextDate: '' };
    let createButtonCount = -1;
    let statusbarButtons: Array<{ name: string | null; text: string }> = [];
    let closeButtonOffered = true;
    let upsellButtonOffered = true;
    let stageAfterAttempt = '';
    let dialogText = '';
    let stageChangeRefused = false;

    // ===================== Pre-conditions, as the ADMIN =====================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      lap('pre1 START');
      await loginToMigCrm(page, ADMIN);
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      lap('pre2 START');
      const fx = await createSubscriptionViaEmbed(page, {
        customer: MIG_TEST_CUSTOMER,
        template: TEMPLATE_MONTHLY_INVOICE_ONLY,
        startDate: todayStr,
        line: { sku: SKU_O365, qty: QUANTITY },
        stage: 'In Progress',
      });
      adminSubs = fx.subs;
      createdId = fx.id;
      reference = fx.reference;
      console.log(`  fixture subscription: ${reference} (peer id ${createdId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - fixture subscription created by the admin').catch(() => {});
    });

    // ===================== Steps, as the SEE-ONLY user =====================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      lap('s1 START');
      // Drop BOTH sessions - the CRM's and the peer's. `loginPresales` writes its cookie into this
      // browser context (api == page.context().request), so clearing cookies is what "log out"
      // means for the embed as well.
      await context.clearCookies();
      await loginToMigCrm(page, SEE_ONLY);
      seeOnlySubs = new SubscriptionPageMig(page);
      peerUidAsSeeOnly = await seeOnlySubs.loginPresales(SEE_ONLY.username, SEE_ONLY.password);
      console.log(`  signed in as ${SEE_ONLY.username} - peer uid ${peerUidAsSeeOnly}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      lap('s2 START');
      const frame = await seeOnlySubs!.openSubscriptionsEmbed();

      // Step 3's control lives on the LIST, so read it before opening the record.
      createButtonCount = await frame.locator(SubscriptionPageMig.EMBED_NEW_SELECTOR).count().catch(() => -1);
      console.log(`  "New"/CREATE controls on the list: ${createButtonCount}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the Subscriptions list as the see-only user').catch(() => {});

      await frame.locator(`.o_kanban_record:has-text("${reference}"), td:has-text("${reference}")`).first()
        .click({ timeout: CommonUtils.waitTimes.abnormalWait })
        .catch((e) => console.log(`  opening "${reference}" from the list failed: ${String(e).slice(0, 160)}`));
      await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);

      const f2 = page.frames().find((fr) => fr.url().includes('pre-sales-crm-mig'));
      recordOpened = !!f2 && (await seeOnlySubs!.waitForEmbedFormReady(f2));
      if (f2 && recordOpened) {
        readableFields = {
          customer: await seeOnlySubs!.readEmbedField(f2, 'remote_partner_id'),
          template: await seeOnlySubs!.readEmbedField(f2, 'template_id'),
          stage: await seeOnlySubs!.getEmbedStage(f2),
          nextDate: await seeOnlySubs!.readEmbedField(f2, 'recurring_next_date'),
        };
      }
      console.log(`  record opened: ${recordOpened}`);
      for (const [k, v] of Object.entries(readableFields)) console.log(`    ${k.padEnd(9)}: "${v}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - the subscription opened as the see-only user').catch(() => {});
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      lap('s3 START');
      console.log(`  CREATE/"New" button count on the subscription list = ${createButtonCount}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      lap('s4 START');
      const f = page.frames().find((fr) => fr.url().includes('pre-sales-crm-mig'));
      if (f) {
        statusbarButtons = await f.locator('.o_statusbar_buttons button, .o_form_statusbar button[name]')
          .evaluateAll((els) => els.map((e) => ({
            name: (e as HTMLElement).getAttribute('name'),
            text: ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(),
          }))).catch(() => [] as Array<{ name: string | null; text: string }>);
      }
      console.log(`  buttons in the form's status bar (${statusbarButtons.length}):`);
      for (const b of statusbarButtons) console.log(`    ${JSON.stringify(b)}`);
      closeButtonOffered = statusbarButtons.some((b) => /close/i.test(b.name ?? '') || /close/i.test(b.text));
      upsellButtonOffered = statusbarButtons.some((b) => /upsell/i.test(b.name ?? '') || /upsell/i.test(b.text));
      console.log(`  "Close" offered : ${closeButtonOffered}`);
      console.log(`  "Upsell" offered: ${upsellButtonOffered}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - the form buttons offered to the see-only user').catch(() => {});
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      lap('s5 START');
      const f = page.frames().find((fr) => fr.url().includes('pre-sales-crm-mig'));
      if (f) {
        // "Closed" is normally behind the status bar's "More..." dropdown - open it when the plain
        // button is not on screen, rather than reporting "the stage could not be clicked".
        const direct = f.locator('button.o_arrow_button').filter({ hasText: /^Closed$/i }).first();
        if (await direct.count().catch(() => 0)) {
          await direct.click({ timeout: CommonUtils.waitTimes.abnormalWait }).catch((e) =>
            console.log(`  clicking CLOSED was refused by the UI: ${String(e).slice(0, 160)}`));
        } else {
          await f.locator('button.o_arrow_button.dropdown-toggle').first()
            .click({ timeout: CommonUtils.waitTimes.long * 3 }).catch(() => {});
          await page.waitForTimeout(CommonUtils.waitTimes.standard);
          await f.locator('.dropdown-menu .dropdown-item, .o-dropdown--menu .dropdown-item')
            .filter({ hasText: /^Closed$/i }).first()
            .click({ timeout: CommonUtils.waitTimes.long * 3 })
            .catch((e) => console.log(`  CLOSED is not clickable from the dropdown either: ${String(e).slice(0, 160)}`));
        }
        await page.waitForTimeout(CommonUtils.waitTimes.standard * 4);

        // anything the peer threw back at the user
        dialogText = (await f.locator('.o_dialog, .modal, .o_notification, .o_error_dialog').first()
          .innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);

        // try to save, in case the click landed but the write is what is refused
        await f.locator('button.o_form_button_save').first()
          .click({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => {});
        await page.waitForTimeout(CommonUtils.waitTimes.standard * 3);
        if (!dialogText) {
          dialogText = (await f.locator('.o_dialog, .modal, .o_notification, .o_error_dialog').first()
            .innerText({ timeout: CommonUtils.waitTimes.long * 2 }).catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
        }
      }

      // Read the stage back from the PEER as the see-only user - the server is the truth, the
      // rendered bar is not (CRM-11806_1.1 established that for the CRM side).
      const rows = await seeOnlySubs!.presalesCallKw<any[]>(
        'sale.subscription', 'read', [[createdId], ['stage_id']], {},
      ).catch((e: any) => {
        console.log(`  reading the stage back as the see-only user failed: ${String(e?.message ?? e).slice(0, 200)}`);
        return [] as any[];
      });
      stageAfterAttempt = String(rows?.[0]?.stage_id?.[1] ?? '');
      stageChangeRefused = !/closed/i.test(stageAfterAttempt);
      console.log(`  stage on the server after the attempt : "${stageAfterAttempt}"`);
      console.log(`  error / notification shown            : ${dialogText ? JSON.stringify(dialogText) : '(none)'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - the attempt to close the subscription').catch(() => {});
    });

    // ===================== Verification =====================
    lap('all steps done - entering VERIFY');
    await test.step(STEP.verify, async () => {
      const p2 = recordOpened && !!readableFields.customer && !!readableFields.template && !!readableFields.stage;
      const p3 = createButtonCount === 0;
      const p4 = !closeButtonOffered && !upsellButtonOffered;
      const p5 = stageChangeRefused && dialogText !== '';

      console.log('\n==================== VERIFY ====================');
      console.log(`  Acting as: ${SEE_ONLY.username} - crm-mig group 115 "See Subscriptions" only, peer uid ${peerUidAsSeeOnly}`);
      console.log('  Verify #2 - the subscription opens and all its details can be read:');
      console.log('     Expected : the record opens and Customer, Template and Stage are all readable');
      console.log(`     Actual   : opened = ${recordOpened}, ${JSON.stringify(readableFields)}`);
      console.log(`     Result   : ${p2 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - the "CREATE" button is not offered to this user:');
      console.log('     Expected : 0 CREATE / "New" controls on the subscription list');
      console.log(`     Actual   : ${createButtonCount}`);
      console.log(`     Result   : ${p3 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - neither the "Close" nor the "Upsell" button is offered:');
      console.log('     Expected : no Close button, no Upsell button on the form');
      console.log(`     Actual   : Close offered = ${closeButtonOffered}, Upsell offered = ${upsellButtonOffered}; status-bar buttons = ${JSON.stringify(statusbarButtons)}`);
      console.log(`     Result   : ${p4 ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #5 - the subscription cannot be changed:');
      console.log('     Expected : the Stage does NOT become Closed, and an access-rights error is shown');
      console.log(`     Actual   : stage after the attempt = "${stageAfterAttempt}", message = ${dialogText ? JSON.stringify(dialogText) : '(none shown)'}`);
      console.log(`     Result   : ${p5 ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${p2 && p3 && p4 && p5 ? 'PASS' : 'FAIL'} - a see-only user can read "${reference}" but cannot change it`);

      let __verifyPassed = false;
      try {
        expect(recordOpened, 'VP2: the see-only user should be able to open the subscription').toBeTruthy();
        expect(readableFields.customer, 'VP2: the Customer should be readable').not.toBe('');
        expect(readableFields.template, 'VP2: the Subscription Template should be readable').not.toBe('');
        expect(readableFields.stage, 'VP2: the Stage should be readable').not.toBe('');
        expect(createButtonCount, 'VP3: the "CREATE" button should not be offered to a see-only user').toBe(0);
        expect(closeButtonOffered, 'VP4: the "Close" button should not be offered to a see-only user').toBeFalsy();
        expect(upsellButtonOffered, 'VP4: the "Upsell" button should not be offered to a see-only user').toBeFalsy();
        expect(stageAfterAttempt, `VP5: the Stage should NOT become Closed (read back: "${stageAfterAttempt}")`).not.toMatch(/closed/i);
        expect(dialogText, 'VP5: an access-rights message should be shown when the change is attempted').not.toBe('');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'Verification - see-only user cannot change a subscription', passed: __verifyPassed }).catch(() => {});
      }
    });
  });
});
