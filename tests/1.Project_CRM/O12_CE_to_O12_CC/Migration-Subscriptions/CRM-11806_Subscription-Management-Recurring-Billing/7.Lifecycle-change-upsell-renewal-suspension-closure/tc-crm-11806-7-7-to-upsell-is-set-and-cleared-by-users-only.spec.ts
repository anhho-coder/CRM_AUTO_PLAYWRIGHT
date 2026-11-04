import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
// crm-mig carries no native sale.subscription screen - the subscription is driven through the embed.
import { SubscriptionPageEmbed as SubscriptionPage } from '@pages/mig';
import { HomePageMig as HomePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';
import {
  SKU_ENT_MONTHLY,
  SKU_O365,
  TEMPLATE_MONTHLY_INVOICE_ONLY,
  logVerifyBlock,
  todayMMDDYYYY,
} from '@helpers/crm-11806-subscription.helper';
import {
  SubscriptionPageMig,
  createSubscriptionMig,
  deleteSubscriptionOnPeer,
  loginAsCrmAdminMig,
  migRunCustomer,
} from '@helpers/crm-11806-mig-subscription.helper';

/**
 * ============================================================================================
 *  CRM-11806_7.7 - The To Upsell stage is set and cleared by users only
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    CRM-11806_7.7
 *  Jira:            CRM-14096
 *  Source version:  updated 2026-11-02T13:15+0300, 4 manual steps - re-check before trusting this spec
 *  Automation-Type: new
 *  Automation-Date: 2026-11-04
 *  Spec ID:         IS-CRM-FUNC-0199
 *                   Spec text : "The To Upsell stage shall be set and cleared by users only; the
 *                               subscription service shall move no subscription into or out of it."
 *                   Added to spec v5 on 2026-11-02 (CRM-13835, Aiva Nievierova).
 *  Authority:       Confluence "[Migration] Subscription Management (Recurring Billing)"
 *                   pageId 222538152 v5 (2026-11-02). It SUPERSEDES the FRD (pageId 222528736);
 *                   do not key assertions to the FRD.
 *  Runs on:         CRM https://crm-mig.nakivo.site (Odoo 12 CE)
 *                   Subscription service https://pre-sales-crm-mig.nakivo.site (Odoo 19, the peer)
 *  Run as:          CRM administrator with the "Manage Subscriptions" right (anh.ho@nakivo.com)
 * --------------------------------------------------------------------------------------------
 *  NO PRE-PRODUCTION BASELINE - this case is NOT a port.
 *  The pre-production Subscriptions suite holds two section-7 cases, neither about upsell:
 *    tc-subscription-7-1-closing-a-subscription-stops-billing.spec.ts     (= crm-mig 7.3)
 *    tc-subscription-7-2-a-draft-subscription-stops-billing-silently.spec.ts (= crm-mig 7.4)
 *  IS-CRM-FUNC-0199 was written on 2026-11-02, after the baseline suite was built, so there is
 *  nothing to port. Everything below comes from the crm-mig manual TC CRM-14096 alone.
 * --------------------------------------------------------------------------------------------
 *  WHY THIS CASE EXISTS (from CRM-14096's own description):
 *  CRM-11806_7.1 checks that the service does not move a subscription INTO To Upsell. Nothing
 *  checked that a user can SET and CLEAR it, nor that the service never moves it OUT.
 * --------------------------------------------------------------------------------------------
 *  BLOCKED - step 4 is not automated, and its VP4 is NOT scored here.
 *   Step 4 asks the development team to run the daily billing run ("Subscriptions management")
 *   for this subscription. That trigger is a human/dev action, not something the spec can perform,
 *   exactly as CRM-11806_7.1 records for its own step 5 ("the billing run is a scheduled job the
 *   development team triggers for a named date, so it stays on the manual card").
 *   The step therefore runs, states that the billing run was NOT executed, prints VP4 as NOT RUN,
 *   and asserts nothing. VP4 stays on the manual card until a dev executes the run.
 *   This spec consequently covers 3 of the 4 verification points of CRM-14096.
 * --------------------------------------------------------------------------------------------
 *  CLEAN-UP (crm-mig writes are allowed only against a teardown that actually runs):
 *   The subscription this run creates is deleted on the peer in `afterEach`, whatever the verdict,
 *   plus an `afterAll` sweep for anything an aborted test left behind. Both are a DENY-LIST of the
 *   peer ids THIS RUN created, captured from the create call - never a keep-list, and never a
 *   migrated record.
 * --------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-conditions:
 *    Login to the CRM (crm-mig.nakivo.site) as Subscription staff with the "Manage Subscriptions"
 *    right (e.g. Anh Ho)
 *    Create the subscription "Cust-ToUpsell-<unique>" / "Monthly Sub/Invoice only" /
 *      Start date today, with one line
 *      "[CP-NC-O365] Office 365 for CSP - No Commitment" x 1
 *    Click "SAVE" and click "IN PROGRESS" on the stage bar
 *
 *  Steps to reproduce:
 *   1. Click "To Upsell" on the subscription's stage bar
 *   2. Click "EDIT", add a second line with
 *        Product  = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription"
 *        Quantity = 5
 *      click "SAVE", then read the stage bar
 *   3. Click "IN PROGRESS" on the stage bar
 *   4. Have the daily billing run process the subscription once (Dev runs "Subscriptions
 *      management"), then read the stage bar
 *
 *  Verification Points:
 *   VP1. The stage moves to To Upsell - a user can set it by hand (IS-CRM-FUNC-0199)
 *   VP2. The stage still reads To Upsell - editing the lines neither set nor cleared it
 *   VP3. The stage moves back to In Progress - a user can clear it by hand (IS-CRM-FUNC-0199)
 *   VP4. The stage still reads In Progress - the subscription service moved the subscription
 *        neither into nor out of To Upsell (IS-CRM-FUNC-0199)
 *
 *  Summary:
 *   Creates a Monthly/Invoice-only subscription with one line, sets it In Progress, then drives
 *   the stage bar by hand: To Upsell -> edit the lines -> back to In Progress. It verifies that a
 *   user can both set and clear To Upsell and that editing the recurring lines moves the stage
 *   neither way. VP4 (the service never moves it) needs the dev-triggered billing run and is not
 *   scored here.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-11806_7\.7:" --project=chromium
 * ============================================================================================
 */

const TC_ID = 'CRM-11806_7.7';

/** The second line the manual step adds. */
const SECOND_LINE_QUANTITY = 5;

/**
 * OPEN - the line product this spec adds is NOT the one the manual TC names.
 *
 * TWO products on the peer carry `default_code = CP-NC-PM-ENT`:
 *   id 115 "min 50Ent Machines, 1Month Subscription"  <- the one CRM-14096 step 2 names
 *   id 305 "min 20Ent Machines, 1Month Subscription"
 * `addEmbedSubscriptionLine()` types the string it is given and clicks the FIRST matching
 * dropdown entry, so the bare SKU resolves to id 305.
 *
 * Measured 2026-11-04, three runs:
 *   typed "CP-NC-PM-ENT"                              -> picked "min 20Ent ...", row saves
 *   typed "min 50Ent Machines, 1Month Subscription"   -> no option offered, row saves EMPTY
 *   typed "min 50Ent"                                 -> no option offered, row saves EMPTY
 * So this picker resolves the SKU but not the product name. Selecting id 115 would need
 * `addEmbedSubscriptionLine` to take a disambiguating term - a change to the SHARED page object
 * `pages/mig/SubscriptionPageMig.ts`, not made here.
 *
 * It does not change what this TC verifies: VP2 is about the STAGE, and the line is setup data.
 * The variant actually taken is recorded as an observation in step 2 so no reader assumes the
 * 50Ent product was used. Raised with the tester 2026-11-04.
 */
const SECOND_LINE_TC_NAMES = 'min 50Ent Machines, 1Month Subscription';

/** Leave the created subscription on the peer for inspection instead of deleting it. */
const SKIP_CLEANUP = false;

/**
 * Step labels - ONE source of truth for the `test.step()` label and the stdout banner, so the
 * report's step tree and the log line up character for character.
 */
const STEP = {
  pre: 'Pre-condition: create S on "Monthly Sub/Invoice only" with one line and click "IN PROGRESS"',
  s1: 'Step 1: Click "To Upsell" on the subscription\'s stage bar',
  s2: 'Step 2: Click "EDIT", add a second line with Product = "[CP-NC-PM-ENT] min 50Ent Machines, 1Month Subscription" and Quantity = 5, click "SAVE", then read the stage bar',
  s3: 'Step 3: Click "IN PROGRESS" on the stage bar',
  s4: 'Step 4: [MANUAL ONLY - the daily billing run is triggered by the development team] Have the daily billing run process the subscription once (Dev runs "Subscriptions management"), then read the stage bar',
} as const;

/**
 * What to outline in the verify screenshots.
 *
 * The subscription lives on the Odoo 19 peer INSIDE the embed iframe, and `captureVerifyEvidence`
 * marks the top-level document only - it cannot reach into a frame. So a check read on the
 * subscription outlines the EMBED that holds it, not the stage bar itself. That is a real
 * limitation of the evidence helper on this screen, not a shortcut.
 */
const EMBED = 'iframe.o_nakivo_embed_frame, iframe';

const STAGE_TO_UPSELL = 'To Upsell';
const STAGE_IN_PROGRESS = 'In Progress';

const isToUpsell = (stage: string): boolean => /to\s*upsell/i.test(stage);
const isInProgress = (stage: string): boolean => /in\s*progress/i.test(stage) && !isToUpsell(stage);

test.describe(`${TC_ID} - The To Upsell stage is set and cleared by users only`, () => {
  /** Deny-list: every peer id THIS RUN created. Nothing else is ever deleted. */
  const createdPeerIds: number[] = [];
  let peerId: number | null = null;
  let reference = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`❌ TEST FAILED - reason: ${testInfo.error?.message ?? 'unknown'}`);
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
    }
    // Teardown runs whatever the verdict - a failed assertion must not leave a record behind.
    await deleteSubscriptionOnPeer(new SubscriptionPageMig(page), peerId, reference, SKIP_CLEANUP).catch(() => {});
    if (peerId !== null) {
      const i = createdPeerIds.indexOf(peerId);
      if (i >= 0) createdPeerIds.splice(i, 1);
    }
    peerId = null;
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    // Sweep for what an aborted test left behind - the ids this run created and afterEach never
    // reached. A deny-list of exactly those ids; it computes nothing from a keep-list.
    if (createdPeerIds.length === 0) return;
    console.log(`[peer sweep] ${createdPeerIds.length} subscription(s) this run created were not torn down: ${createdPeerIds.join(', ')}`);
    const page = await browser.newPage();
    try {
      await loginAsCrmAdminMig(page, 'afterAll sweep');
      const subs = new SubscriptionPageMig(page);
      for (const id of [...createdPeerIds]) {
        await deleteSubscriptionOnPeer(subs, id, `${TC_ID} leftover`, SKIP_CLEANUP).catch(() => {});
      }
    } finally {
      await page.close().catch(() => {});
    }
  });

  test(`${TC_ID}: The To Upsell stage is set and cleared by users only @mig-live`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const subscriptionPage = new SubscriptionPage(page);
    const customerName = migRunCustomer(TC_ID);

    let stageAfterSetup = '';

    await test.step(STEP.pre, async () => {
      console.log(`\n--- ${STEP.pre} ---`);
      try {
        await loginAsCrmAdminMig(page);
        console.log('  Subscription to create:');
        console.log(`    - Customer    = ${customerName}`);
        console.log(`    - Template    = ${TEMPLATE_MONTHLY_INVOICE_ONLY}`);
        console.log(`    - Start date  = ${todayMMDDYYYY()}`);
        console.log(`    - Line 1 SKU  = ${SKU_O365}`);
        console.log('    - Line 1 Qty  = 1');

        const created = await createSubscriptionMig(page, {
          customerName,
          template: TEMPLATE_MONTHLY_INVOICE_ONLY,
          productSku: SKU_O365,
          quantity: 1,
          startDate: todayMMDDYYYY(),
        });
        peerId = created.peerId;
        reference = created.reference;
        createdPeerIds.push(created.peerId);
        console.log(`✓ Subscription ${reference} created (peer id ${peerId})`);

        // The manual pre-condition's last action: click IN PROGRESS on the stage bar.
        await subscriptionPage.setStage(STAGE_IN_PROGRESS);
        stageAfterSetup = await subscriptionPage.getState();
        console.log(`✓ Stage after the pre-condition = "${stageAfterSetup}"`);

        expect(
          isInProgress(stageAfterSetup),
          `Pre-condition: S must start In Progress, otherwise step 1 has nothing to move - the stage bar reads "${stageAfterSetup}"`,
        ).toBe(true);
      } catch (e) {
        const reason = String((e as Error)?.message ?? e).split('\n')[0];
        console.log(`  SET-UP FAILED : ${reason}`);
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC_ID} - Pre-condition - set-up failed`,
          passed: false,
          highlight: EMBED,
          lines: [`SET-UP FAILED - ${STEP.pre}`, `  error: ${reason}`],
          corner: 'bottom-right',
        }).catch(() => {});
        throw e;
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition - S created and In Progress').catch(() => {});
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await subscriptionPage.setStage(STAGE_TO_UPSELL);
      const stage = await subscriptionPage.getState();
      const ok = isToUpsell(stage);

      const lines = logVerifyBlock(
        [
          {
            what: 'a user can set To Upsell by hand (IS-CRM-FUNC-0199)',
            expected: `the stage bar reads "${STAGE_TO_UPSELL}"`,
            actual: `the stage bar reads "${stage}"`,
            pass: ok,
            difference: `expected the stage to move to "${STAGE_TO_UPSELL}", got "${stage}"`,
          },
        ],
        'clicking To Upsell on the stage bar moved the subscription there',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP1 - the stage after a user clicks To Upsell`,
        passed: ok,
        highlight: EMBED,
        lines,
      }).catch(() => {});

      expect(ok, `VP1: the stage should move to "${STAGE_TO_UPSELL}" when a user clicks it - it reads "${stage}"`).toBe(true);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      console.log('  Second line to add:');
      console.log(`    - Product  = ${SKU_ENT_MONTHLY} (the TC names "${SECOND_LINE_TC_NAMES}")`);
      console.log(`    - Quantity = ${SECOND_LINE_QUANTITY}`);

      await subscriptionPage.clickEdit();
      await subscriptionPage.addSubscriptionLine(SKU_ENT_MONTHLY, SECOND_LINE_QUANTITY);
      await subscriptionPage.save();
      // Read the saved record where it already is. `openByUrl()` navigates the EMBED FRAME, so it
      // needs a frame URL; handing it `page.url()` (the top-level CRM page) made crm-mig refuse
      // the nested load with net::ERR_BLOCKED_BY_RESPONSE - measured on the first run of this
      // spec, 2026-11-04. Nothing here produces a frame URL (this case never bills), so the form
      // simply stays open and the readers below read it in place.
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      const lineCount = await subscriptionPage.getLineCount();
      const products = await subscriptionPage.getAllLineProducts();
      const stage = await subscriptionPage.getState();

      // VP2a is a GUARD, not decoration: "the stage did not change" proves nothing if the edit
      // never landed. An unchanged stage on an unchanged record is vacuous.
      const entLine = products.find((p: string) => p.includes(SKU_ENT_MONTHLY)) ?? '';
      const editLanded =
        lineCount === 2 &&
        products.some((p: string) => p.includes(SKU_O365)) &&
        entLine !== '';
      const stageHeld = isToUpsell(stage);

      // REQUIREMENT #4b - printed, deliberately NOT scored. Two products share this SKU and the
      // picker resolves the SKU, not the name; see SECOND_LINE_TC_NAMES above.
      console.log(`  Observation (not scored) - the ENT line the picker resolved : "${entLine}"`);
      console.log(`  Observation (not scored) - the product CRM-14096 names       : "[${SKU_ENT_MONTHLY}] ${SECOND_LINE_TC_NAMES}"`);

      const lines = logVerifyBlock(
        [
          {
            what: 'the second line was really added, so the stage check below is not vacuous',
            expected: `2 lines, one carrying ${SKU_O365} and one carrying ${SKU_ENT_MONTHLY} with a non-empty product`,
            actual: `${lineCount} line(s): [${products.join(' | ')}]`,
            pass: editLanded,
            difference: `expected 2 lines carrying ${SKU_O365} and ${SKU_ENT_MONTHLY}, got ${lineCount}: [${products.join(' | ')}]`,
          },
          {
            what: 'editing the lines neither set nor cleared To Upsell (IS-CRM-FUNC-0199)',
            expected: `the stage bar still reads "${STAGE_TO_UPSELL}"`,
            actual: `the stage bar reads "${stage}"`,
            pass: stageHeld,
            difference: `expected the stage to stay "${STAGE_TO_UPSELL}", got "${stage}"`,
          },
        ],
        'the line was added and the stage stayed where the user put it',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP2 - the stage after the lines are edited`,
        passed: editLanded && stageHeld,
        highlight: EMBED,
        lines,
      }).catch(() => {});

      expect(editLanded, `VP2a: the second line should be saved - ${lineCount} line(s): [${products.join(' | ')}]`).toBe(true);
      expect(stageHeld, `VP2b: editing the lines should leave the stage at "${STAGE_TO_UPSELL}" - it reads "${stage}"`).toBe(true);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await subscriptionPage.setStage(STAGE_IN_PROGRESS);
      const stage = await subscriptionPage.getState();
      const ok = isInProgress(stage);

      const lines = logVerifyBlock(
        [
          {
            what: 'a user can clear To Upsell by hand (IS-CRM-FUNC-0199)',
            expected: `the stage bar reads "${STAGE_IN_PROGRESS}"`,
            actual: `the stage bar reads "${stage}"`,
            pass: ok,
            difference: `expected the stage to move back to "${STAGE_IN_PROGRESS}", got "${stage}"`,
          },
        ],
        'clicking In Progress cleared To Upsell',
      );
      await CommonUtils.captureVerifyEvidence(page, testInfo, {
        name: `${TC_ID} - VP3 - the stage after a user clears To Upsell`,
        passed: ok,
        highlight: EMBED,
        lines,
      }).catch(() => {});

      expect(ok, `VP3: the stage should move back to "${STAGE_IN_PROGRESS}" - it reads "${stage}"`).toBe(true);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce 1-3 - stage driven by hand, back to In Progress').catch(() => {});
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      // NOT SCORED. VP4 asks what the stage reads AFTER the subscription service has processed the
      // subscription. The daily billing run is triggered by the development team, so this spec
      // cannot produce the condition VP4 is about - and the stage read without that run says
      // nothing about whether the service moves it. Reporting it either way would be a verdict on
      // something nobody observed, so it is recorded as NOT RUN and left on the manual card.
      const stage = await subscriptionPage.getState();
      console.log('==================== VERIFY ====================');
      console.log('  Verify #4 - the subscription service moved the subscription neither into nor out of To Upsell (IS-CRM-FUNC-0199):');
      console.log(`     Expected : the stage bar reads "${STAGE_IN_PROGRESS}" after the daily billing run has processed S`);
      console.log('     Actual   : NOT RUN - the daily billing run was not executed by this spec');
      console.log('     Result   : NOT RUN - BLOCKED, the run is triggered by the development team');
      console.log(`     Reading for the record (no run was performed): the stage bar reads "${stage}"`);
      console.log('================================================');
      console.log(`OVERALL: ${TC_ID} verified VP1, VP2 and VP3. VP4 stays on the manual card until a dev executes "Subscriptions management" for ${reference}.`);
      // No evidence capture here: there is no verification to evidence (REQUIREMENT #3a).
    });
  });
});
