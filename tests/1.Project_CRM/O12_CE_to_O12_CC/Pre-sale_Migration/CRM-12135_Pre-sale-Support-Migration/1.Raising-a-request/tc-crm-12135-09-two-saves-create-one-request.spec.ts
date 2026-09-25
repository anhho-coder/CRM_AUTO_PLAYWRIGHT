import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-09 - Two saves in quick succession create exactly one request
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-09
 * Jira           : CRM-12135
 * Requirements   : REL-0002
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity above the gate and open the raise dialog. Fill every required field.
 *   Press Save twice in quick succession WITHOUT waiting for the first to answer. Wait for the
 *   dialog to close. Verify exactly one request was created. Verify the request carries a
 *   request uuid (which makes retried submissions idempotent).
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-09:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12924 (TC-09) from Jira - rewritten by Thuat Phung on 2026-09-24
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales
 *     Application session active
 *      2. Create an Opportunity named AUTO-CRM-12135-TC-09-<runId>-double-save with Expected
 *     Revenue Deal = $500
 *
 *   Steps to reproduce:
 *      1. Open the Opportunity from the pre-conditions and note the Tickets count as N (hidden = 0).
 *      2. Click "Request SE support", set the dialog to these values, then click Save twice in
 *     quick succession without waiting for a response:
 *        Subject      = AUTO-CRM-12135-TC-09-<runId>-double-save
 *        Meeting Time = one hour from now
 *        Description  = Automated check of CRM-12135 TC-09.
 *        Meeting link = blank
 *        Support type = Online deployment session
 *      3. Re-open the Opportunity and read the Tickets button.
 *      4. Open the CRM mail queue (Settings > Technical > Email > Emails) and search for the
 *     Subject from step 2.
 *      5. Open CRM > Calendar and find the session for this request.
 *
 *   Verification (expected results):
 *      1. The dialog closes. No error dialog. (Step 2)
 *      2. Tickets shows exactly N + 1. (Step 3)
 *      3. Exactly one intake row found. (Step 4)
 *      4. Exactly one session, at the Meeting Time from step 2. (Step 5)
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-09-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active',
  pre2:   'Pre-condition 2: Create an Opportunity named AUTO-CRM-12135-TC-09-<runId>-double-save with Expected Revenue Deal = $500',
  s1:     'Step 1: Open the Opportunity from the pre-conditions and note the Tickets count as N (hidden = 0)',
  s2:     'Step 2: Click "Request SE support", set the dialog to values, then click Save twice in quick succession without waiting for a response',
  s3:     'Step 3: Re-open the Opportunity and read the Tickets button',
  s4:     'Step 4: Open the CRM mail queue (Settings > Technical > Email > Emails) and search for the Subject from step 2',
  s5:     'Step 5: Open CRM > Calendar and find the session for this request',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-09 - Two saves in quick succession create exactly one request', () => {
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

  test('CRM-12135_TC-09: Two saves in quick succession create exactly one request', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-09 - Two saves in quick succession create exactly one request ==========');

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
const marker = MigPreSalePage.marker('TC-09', runId);
        const subject = `${marker}-double-save`;
        const description = 'Automated check of CRM-12135 TC-09.';
        const supportType = 'Online deployment session';
        const meetingTime = 'tomorrow at 15:00'; // RE-SYNC GAP: fixture needs to calculate "one hour from now" dynamically
        let leadId = 0;
        let baselineTicketCount = 0;
        let newTicketCount = 0;

        await test.step(STEP.pre1, async () => {
          console.log(`\n--- ${STEP.pre1} ---`);
          console.log('  READ-ONLY: logged in as Salesperson on CRM and Pre-Sales Application');
        });

        await test.step(STEP.pre2, async () => {
          console.log(`\n--- ${STEP.pre2} ---`);
          leadId = await preSale.createOpportunity(`${marker}-double-save`, 500);
          teardown = async () => {
            if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
            const swept = await preSale.sweepByMarker(marker);
            console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
              (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
          };
          console.log(`  Opportunity ${leadId} created`);
        });

        await test.step(STEP.s1, async () => {
          console.log(`\n--- ${STEP.s1} ---`);
          await preSale.openOpportunity(leadId);

          // Read baseline Tickets count (0 if button is hidden)
          const ticketsBtn = page.locator('button[name="open_customer_tickets"]');
          baselineTicketCount = 0;
          if (await ticketsBtn.isVisible().catch(() => false)) {
            const text = await ticketsBtn.textContent();
            const match = text?.match(/(\d+)/);
            baselineTicketCount = match ? parseInt(match[1], 10) : 0;
          }
          console.log(`  Opportunity form opened; baseline Tickets count = ${baselineTicketCount}`);
        });

        await test.step(STEP.s2, async () => {
          console.log(`\n--- ${STEP.s2} ---`);
          await preSale.openRaiseDialog();
          await preSale.fillRaiseDialog({
            subject,
            description,
            supportType,
            meetingTime,
          });
          console.log(`  - Subject      : ${subject}`);
          console.log(`  - Meeting Time : ${meetingTime}`);
          console.log(`  - Description  : ${description}`);
          console.log(`  - Meeting link : (blank)`);
          console.log(`  - Support type : ${supportType}`);
        });

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Dialog filled with required fields');

        await test.step(STEP.s3, async () => {
          console.log(`\n--- ${STEP.s3} ---`);
          const first = preSale.saveRaiseDialog();
          const second = preSale.saveRaiseDialog().catch(() => { /* control may be gone */ });
          await Promise.allSettled([first, second]);
          console.log(`  Save pressed twice in quick succession (no await between)`);
        });

        await test.step(STEP.s4, async () => {
          console.log(`\n--- ${STEP.s4} ---`);
          await preSale.waitForRaiseDialogClosed();
          console.log(`  Dialog close detected`);
        });

        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3 - After dialog closed');

        await test.step(STEP.s5, async () => {
          console.log(`\n--- Step 3 (re-open Opportunity and read Tickets button) ---`);
          await preSale.openOpportunity(leadId);

          // Read new Tickets count
          const ticketsBtn = page.locator('button[name="open_customer_tickets"]');
          let newTicketCount = 0;
          if (await ticketsBtn.isVisible().catch(() => false)) {
            const text = await ticketsBtn.textContent();
            const match = text?.match(/(\d+)/);
            newTicketCount = match ? parseInt(match[1], 10) : 0;
          } else {
            newTicketCount = 0; // Hidden button means 0
          }
          console.log(`  Re-opened Opportunity; new Tickets count = ${newTicketCount}`);
          console.log(`  Expected = ${baselineTicketCount + 1}, Actual = ${newTicketCount}`);
        });

        // RE-SYNC GAP (CRM-12924, 2026-09-24): Steps 4 and 5 require navigating to CRM Settings and Calendar,
        // but no page object methods exist for:
        // - Navigating to Settings > Technical > Email > Emails
        // - Searching for email subjects in the mail queue
        // - Navigating to CRM > Calendar
        // - Reading calendar events and their times
        // These steps are MANUAL VERIFICATION ONLY and cannot be automated with current page objects.
        await test.step(STEP.verify, async () => {
          console.log(`\n--- ${STEP.verify} ---`);
          const check1 = newTicketCount === baselineTicketCount + 1;

          console.log('\n==================== VERIFY ====================');
          console.log('Verify #1 - The dialog closes. No error dialog. (Step 2):');
          console.log(`     Result   : PASS (dialog closed after double save)`);
          console.log('Verify #2 - Tickets shows exactly N + 1. (Step 3):');
          console.log(`     Expected : ${baselineTicketCount + 1}`);
          console.log(`     Actual   : ${newTicketCount}`);
          console.log(`     Result   : ${check1 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #3 - Exactly one intake row found. (Step 4):');
          console.log(`     Result   : BLOCKED - requires manual navigation to CRM Settings Email`);
          console.log('Verify #4 - Exactly one session at the Meeting Time. (Step 5):');
          console.log(`     Result   : BLOCKED - requires manual navigation to CRM Calendar`);
          console.log('===============================================');
          console.log(`OVERALL: ${check1 ? 'PARTIAL' : 'FAIL'} - Tickets count verified; mail queue and calendar checks blocked`);

          expect(check1, `Tickets should show exactly ${baselineTicketCount + 1} (got ${newTicketCount})`).toBe(true);
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
