import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12916 / CRM-12135_TC-01 - Request SE support button and New Ticket dialog fields
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-01 / CRM-12916
 * Jira           : CRM-12135 (parent), CRM-12916 (manual TC)
 * Requirements   : FUNC-0037, FUNC-0038, FUNC-0041
 * Run as         : Salesperson
 * Automation-Type: automated
 * Automation-Date: 2026-09-21
 * Last Sync      : 2026-09-24 (re-synced to manual TC CRM-12916)
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity above the Expected-Revenue gate ($100). Open the Opportunity on
 *   the CRM, verify the "Request SE support" button is enabled and visible (no tooltip),
 *   click it to open the New Ticket dialog, and verify the dialog carries exactly five
 *   fields in order (Subject, Meeting Time, Description, Meeting link, Support type) with
 *   the correct required markers, and the Support type dropdown offers exactly three options.
 *   Click Cancel and verify the dialog closes without creating a request.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-01:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12916 (synced 2026-09-24):
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig
 *      2. Opportunity exists with Expected Revenue Deal >= $100
 *
 *   Step 1 - Open CRM > Sales > My Pipeline and open the Opportunity. If the header
 *            button row is full, open the More menu.
 *      Expected: The Opportunity form is open. The header offers one entry labelled
 *      "Request SE support" and it is enabled/clickable. No tooltip "Expected Revenue
 *      less than $100!" is shown on it.
 *
 *   Step 2 - Click "Request SE support".
 *      Expected: A modal dialog titled "New Ticket" opens. Its footer carries exactly two
 *      buttons: "Save" and "Cancel".
 *
 *   Step 3 - Read the dialog's field labels from top to bottom.
 *      Expected: Exactly five fields, in this order: (1) Subject (2) Meeting Time
 *      (3) Description (4) Meeting link (5) Support type. Subject, Description and Support
 *      type carry the required marker; Meeting Time and Meeting link do not.
 *
 *   Step 4 - Open the "Support type" dropdown and read every option.
 *      Expected: Exactly three options, no more and no fewer: Online deployment session,
 *      Online technical assistance, Offline technical assistance.
 *
 *   Step 5 - Click "Cancel".
 *      Expected: The dialog closes. The Tickets smart button count is unchanged (still
 *      hidden if it was hidden before). No request was created.
 *
 * RE-SYNC GAP (CRM-12916, 2026-09-24)
 * ----
 * Step 5 requires clicking the Cancel button on the dialog, which is not available as a
 * method on MigPreSalePage. The page object has dialogSaveButton() but no dialogCancelButton()
 * method. Implementation would require either:
 * (a) Adding a new method cancelRaiseDialog() to MigPreSalePage, or
 * (b) Using a direct Playwright locator in the spec (both violate the "no new methods/selectors" rule).
 * Currently left as a code comment; clicking Cancel is not automated.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-01-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig',
  pre2:   'Pre-condition 2: Create an Opportunity named AUTO-CRM-12135-TC-01-<runId>-raise-dialog with Expected Revenue Deal = $500 (above the $100 gate)',
  s1:     'Step 1: Open CRM > Sales > My Pipeline and open the Opportunity. If the header button row is full, open the More menu.',
  s2:     'Step 2: Click "Request SE support"',
  s3:     'Step 3: Read the dialog\'s field labels from top to bottom',
  s4:     'Step 4: Open the "Support type" dropdown and read every option',
  s5:     'Step 5: Click "Cancel"',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-01 - The raise button shows and the dialog carries the five fields in order', () => {
  test.afterEach(async ({}, testInfo) => {
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - start').catch(() => {});
    }
    if (teardown) {
      console.log('TEARDOWN DID NOT RUN - the test left the try block without cleaning up.');
      teardown = undefined;
    }
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log(`TEST FAILED - reason: ${testInfo.error?.message?.split('\n')[0] ?? 'unknown'}`);
    }
    if (sharedPage) {
      await CommonUtils.captureAndAttachScreenshot(sharedPage, testInfo, 'afterEach - teardown done').catch(() => {});
    }
    sharedPage = undefined;
  });

  test('CRM-12135_TC-01: The raise button shows and the dialog carries the five fields in order', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-01 - The raise button shows and the dialog carries the five fields in order ==========');

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    sharedPage = page;

    try {
      const loginPage = new LoginPageMig(page);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);

      const preSale = new MigPreSalePage(page);
      const presalesUid = await preSale.loginPresales(
        users.anh_ho_presales_mig.username,
        users.anh_ho_presales_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

const runId = MigPreSalePage.runId();
const marker = MigPreSalePage.marker('TC-01', runId);
        let leadId = 0;
        let raiseVisible = false;
        let raiseTooltip = '';
        let fieldOrder: string[] = [];
        let requiredFields: string[] = [];
        let supportOptions: string[] = [];
        let ticketsCountBefore = 0;
        let ticketsCountAfter = 0;
        let dialogOpen = false;

        await test.step(STEP.pre1, async () => {
          console.log(`\n--- ${STEP.pre1} ---`);
          console.log('  Logged in as Salesperson admin_crm_mig on crm-mig.nakivo.site');
        });

        await test.step(STEP.pre2, async () => {
          console.log(`\n--- ${STEP.pre2} ---`);
          leadId = await preSale.createOpportunity(`${marker}-raise-dialog`, 500);
          teardown = async () => {
            if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
            const swept = await preSale.sweepByMarker(marker);
            console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
              (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
          };
          console.log(`  Opportunity ${leadId} created at $500 (gate is $${MigPreSalePage.RAISE_THRESHOLD})`);
        });

        await test.step(STEP.s1, async () => {
          console.log(`\n--- ${STEP.s1} ---`);
          await preSale.openOpportunity(leadId);
          raiseVisible = await preSale.isRaiseButtonVisible();
          const twinVisible = await preSale.isRaiseButtonDisabledTwinVisible();
          if (raiseVisible) {
            raiseTooltip = await preSale.raiseDisabledTooltip().catch(() => '');
          }
          console.log(`  Opportunity form loaded`);
          console.log(`  Request SE support button visible: ${raiseVisible}`);
          console.log(`  Greyed disabled twin visible: ${twinVisible}`);
          if (raiseVisible && !twinVisible) console.log(`  Button is enabled (no tooltip expected)`);
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1: Opportunity form with Request SE support button');

        await test.step(STEP.s2, async () => {
          console.log(`\n--- ${STEP.s2} ---`);
          await preSale.openRaiseDialog();
          dialogOpen = await preSale.isRaiseDialogOpen();
          console.log(`  New Ticket dialog opened`);
          console.log(`  Dialog visible: ${dialogOpen}`);
          // TODO: RE-SYNC GAP - verify dialog has exactly two buttons (Save and Cancel)
          // Page object does not expose a method to count or verify footer buttons
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2: New Ticket dialog opened');

        await test.step(STEP.s3, async () => {
          console.log(`\n--- ${STEP.s3} ---`);
          fieldOrder = await preSale.dialogFieldOrder();
          requiredFields = await preSale.dialogRequiredFieldNames();
          console.log(`  Field order: ${fieldOrder.join(', ')}`);
          console.log(`  Required fields: ${requiredFields.join(', ')}`);
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3: Dialog fields and required markers');

        await test.step(STEP.s4, async () => {
          console.log(`\n--- ${STEP.s4} ---`);
          supportOptions = (await preSale.dialogSupportTypeOptions()).filter((o) => o.trim().length > 0);
          console.log(`  Support type options: ${supportOptions.join(' | ')}`);
        });

        await test.step(STEP.s5, async () => {
          console.log(`\n--- ${STEP.s5} ---`);
          // RE-SYNC GAP (CRM-12916, 2026-09-24): No method to click Cancel button
          // The page object MigPreSalePage has no dialogCancelButton() or cancelRaiseDialog() method.
          // Cannot implement Step 5 (click Cancel) without adding a new method, which violates the rule.
          console.log(`  BLOCKED: Cannot click Cancel button - MigPreSalePage.dialogCancelButton() method not available`);
          console.log(`  Would verify: Dialog closes, Tickets count unchanged, no request created`);
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5: Dialog ready for Cancel action (blocked)');

        await test.step(STEP.verify, async () => {
          console.log(`\n--- ${STEP.verify} ---`);
          const expectedOrder = [...MigPreSalePage.DIALOG_FIELD_ORDER];
          const orderOk = JSON.stringify(fieldOrder) === JSON.stringify(expectedOrder);
          const typesOk = MigPreSalePage.SUPPORT_TYPES.every((t) => supportOptions.includes(t));
          const noExtraTypes = supportOptions.every((o) => MigPreSalePage.SUPPORT_TYPES.includes(o));
          const requiredOk = ['subject', 'description', 'support_type'].every((f) => requiredFields.includes(f));
          const meetingTimeNotRequired = !requiredFields.includes('meeting_time');
          const meetingLinkNotRequired = !requiredFields.includes('meeting_link');

          console.log('\n==================== VERIFY ====================');
          console.log('Verify #1 - Request SE support button is visible and enabled:');
          console.log(`     Expected : visible and no "Expected Revenue less than $100!" tooltip`);
          console.log(`     Actual   : visible=${raiseVisible}, tooltip="${raiseTooltip}"`);
          console.log(`     Result   : ${raiseVisible && raiseTooltip !== MigPreSalePage.BELOW_THRESHOLD_TOOLTIP ? 'PASS' : 'FAIL'}`);
          console.log('Verify #2 - New Ticket dialog opens with two buttons (Save and Cancel):');
          console.log(`     Expected : dialog open with Save and Cancel buttons`);
          console.log(`     Actual   : dialog open=${dialogOpen}`);
          console.log(`     Result   : BLOCKED - cannot verify button count (page object limitation)`);
          console.log('Verify #3 - Dialog has exactly five fields in correct order:');
          console.log(`     Expected : ${expectedOrder.join(', ')}`);
          console.log(`     Actual   : ${fieldOrder.join(', ')}`);
          console.log(`     Result   : ${orderOk ? 'PASS' : 'FAIL'}`);
          console.log('Verify #4 - Required markers on Subject, Description, Support type only:');
          console.log(`     Subject required    : ${requiredFields.includes('subject') ? 'YES' : 'NO'}`);
          console.log(`     Description required: ${requiredFields.includes('description') ? 'YES' : 'NO'}`);
          console.log(`     Support type required: ${requiredFields.includes('support_type') ? 'YES' : 'NO'}`);
          console.log(`     Meeting Time NOT required: ${meetingTimeNotRequired ? 'YES' : 'NO'}`);
          console.log(`     Meeting Link NOT required: ${meetingLinkNotRequired ? 'YES' : 'NO'}`);
          console.log(`     Result   : ${requiredOk && meetingTimeNotRequired && meetingLinkNotRequired ? 'PASS' : 'FAIL'}`);
          console.log('Verify #5 - Support type dropdown offers exactly three options:');
          console.log(`     Expected : Online deployment session | Online technical assistance | Offline technical assistance`);
          console.log(`     Actual   : ${supportOptions.join(' | ')}`);
          console.log(`     Result   : ${typesOk && noExtraTypes ? 'PASS' : 'FAIL'}`);
          console.log('Verify #6 - Dialog closes after Cancel, no request created, Tickets count unchanged:');
          console.log(`     Expected : dialog closed, Tickets count=${ticketsCountBefore}, no request in queue`);
          console.log(`     Actual   : BLOCKED - cannot click Cancel (page object limitation)`);
          console.log(`     Result   : BLOCKED`);
          console.log('===============================================');
          const corePass = raiseVisible && orderOk && (typesOk && noExtraTypes) && requiredOk && meetingTimeNotRequired && meetingLinkNotRequired;
          const hasBlocking = true; // Step 5 is blocked
          console.log(`OVERALL: ${corePass && !hasBlocking ? 'PASS' : 'BLOCKED'} - Steps 1-4 pass, Step 5 blocked by missing Cancel button method`);

          expect(raiseVisible, 'live control should be visible').toBe(true);
          expect(fieldOrder, 'five fields in declared order').toEqual(expectedOrder);
          expect(typesOk && noExtraTypes, `support types exact: ${supportOptions.join(', ')}`).toBe(true);
          expect(requiredOk, `required fields: ${requiredFields.join(', ')}`).toBe(true);
          expect(meetingTimeNotRequired && meetingLinkNotRequired, 'Meeting Time and Meeting Link should not be required').toBe(true);
          // BLOCKED: expect(dialogClosed, 'dialog should close on Cancel').toBe(true);
          // BLOCKED: expect(ticketsCountAfter, 'Tickets count should be unchanged').toBe(ticketsCountBefore);
        });
    } finally {
      // Teardown runs HERE, not in afterEach: it needs the live session, and afterEach only
      // sees a closed context. A thrown assertion still passes through finally, so a red run
      // cleans up too.
      if (teardown) {
        try {
          await teardown();
        } catch (err) {
          console.log(`TEARDOWN ERROR: ${(err as Error).message}`);
        }
        teardown = undefined;
      }
      await context.close();
    }
  });
});
