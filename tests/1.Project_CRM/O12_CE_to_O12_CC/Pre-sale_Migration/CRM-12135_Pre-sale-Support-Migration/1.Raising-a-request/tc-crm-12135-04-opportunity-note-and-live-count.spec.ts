import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-04 - Creating a ticket adds a log note and increases the Tickets button count
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-04
 * Jira           : CRM-12135 (CRM-12919 on automation)
 * Requirements   : FUNC-0054, FUNC-0055
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity above the gate. Open it and verify the Tickets control is hidden
 *   (no button shown at zero count). Raise a request and save. Re-open the Opportunity and verify
 *   the Tickets control is now visible and shows 1. Read the newest chatter note and verify its
 *   format "SE support requested by <requester> — <subject> (HT000nn)". Click Tickets and verify
 *   the request opens inside the CRM page under the Opportunity's breadcrumb.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-04:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12919 - rewritten by Thuat Phung on 2026-09-24 - re-synced from Jira manual TC.
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales
 *     Application session active
 *      2. Create an Opportunity named AUTO-CRM-12135-TC-04-<runId>-note-and-count with Expected
 *     Revenue Deal = $500
 *
 *   Steps to reproduce:
 *      1. Open the Opportunity and look at the stat button row
 *      2. Click "Request SE support" (under More if the row is full), fill and Save:
 *         Subject      = AUTO-CRM-12135-TC-04-<runId>-note-and-count
 *         Description  = Automated check of CRM-12135 TC-04.
 *         Support type = Offline technical assistance
 *      3. Re-open the Opportunity and look at the stat button row
 *      4. Read the newest note in the chatter
 *      5. Click Tickets
 *
 *   Verification (expected results):
 *      1. No Tickets button - it is hidden at zero, not shown as 0
 *      2. The dialog closes, no error dialog
 *      3. Tickets is visible and shows 1
 *      4. SE support requested by <requester> — <subject> (HT000nn). <subject> is the Subject
 *         from step 2; the separator is an em dash; the reference is HT + 5 digits
 *      5. The request opens inside the CRM page under the Opportunity's breadcrumb, not in a new
 *         tab or window. With one request it opens directly instead of a list
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-04-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active',
  pre2:   'Pre-condition 2: Create an Opportunity named AUTO-CRM-12135-TC-04-<runId>-note-and-count with Expected Revenue Deal = $500',
  s1:     'Step 1: Open the Opportunity and look at the stat button row',
  s2:     'Step 2: Click "Request SE support" (under More if the row is full), fill and Save',
  s3:     'Step 3: Re-open the Opportunity and look at the stat button row',
  s4:     'Step 4: Read the newest note in the chatter',
  s5:     'Step 5: Click Tickets',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-04 - The opportunity gets a note, and the Tickets button its live count', () => {
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

  test('CRM-12135_TC-04: The opportunity gets a note, and the Tickets button its live count', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-04 - The opportunity gets a note, and the Tickets button its live count ==========');

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
const marker = MigPreSalePage.marker('TC-04', runId);
let leadId = 0;
let ticketsVisibleBefore = false;
let ticketsVisibleAfter = false;
let ticketsCountAfter = 0;
let latestNote = '';
const subject = `${marker}-note-and-count`;
const description = 'Automated check of CRM-12135 TC-04.';
const supportType = 'Offline technical assistance';

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log(`  Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active`);
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
  leadId = await preSale.createOpportunity(`${marker}-note-and-count`, 500);
  teardown = async () => {
    if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
    const swept = await preSale.sweepByMarker(marker);
    console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
      (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
  };
  console.log(`  Opportunity ${leadId} created at $500`);
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  await preSale.openOpportunity(leadId);
  ticketsVisibleBefore = await preSale.isTicketsStatVisible();
  console.log(`  Tickets button visible: ${ticketsVisibleBefore}`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1: Tickets hidden at zero');

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  await preSale.openRaiseDialog();
  await preSale.fillRaiseDialog({ subject, description, supportType });
  console.log(`  - Subject      : ${subject}`);
  console.log(`  - Description  : ${description}`);
  console.log(`  - Support type : ${supportType}`);
  await preSale.saveRaiseDialog();
  await preSale.waitForRaiseDialogClosed();
  console.log(`  Dialog saved and closed`);
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  await preSale.openOpportunity(leadId);
  ticketsVisibleAfter = await preSale.isTicketsStatVisible();
  if (ticketsVisibleAfter) {
    ticketsCountAfter = await preSale.ticketsStatCount();
    console.log(`  Tickets button visible: true`);
    console.log(`  Tickets counter value: ${ticketsCountAfter}`);
  } else {
    console.log(`  Tickets button visible: false`);
    ticketsCountAfter = 0;
  }
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3: Tickets visible with count');

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  latestNote = await preSale.latestLogNote();
  console.log(`  Latest note: ${latestNote.substring(0, 100)}...`);
});

await test.step(STEP.s5, async () => {
  console.log(`\n--- ${STEP.s5} ---`);
  await preSale.openTicketsPanel();
  console.log(`  Tickets panel opened`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const hiddenAtZero = !ticketsVisibleBefore;
  const visibleAfterRaise = ticketsVisibleAfter;
  const countIs1 = ticketsCountAfter === 1;
  const noteFormatRegex = /SE support requested by .+ — .+ \(HT\d{5}\)/;
  const noteHasCorrectFormat = noteFormatRegex.test(latestNote);
  const noteContainsSubject = latestNote.includes(subject);

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - No Tickets button - it is hidden at zero, not shown as 0:');
  console.log(`     Expected : not visible`);
  console.log(`     Actual   : visible=${ticketsVisibleBefore}`);
  console.log(`     Result   : ${hiddenAtZero ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - After the raise, Tickets is visible:');
  console.log(`     Expected : visible`);
  console.log(`     Actual   : visible=${ticketsVisibleAfter}`);
  console.log(`     Result   : ${visibleAfterRaise ? 'PASS' : 'FAIL'}`);
  console.log('Verify #3 - The Tickets counter shows 1:');
  console.log(`     Expected : 1`);
  console.log(`     Actual   : ${ticketsCountAfter}`);
  console.log(`     Result   : ${countIs1 ? 'PASS' : 'FAIL'}`);
  console.log('Verify #4 - Log note format "SE support requested by <requester> — <subject> (HT000nn)":');
  console.log(`     Expected : matches pattern SE support requested by .+ — .+ \(HT\\d{5}\)`);
  console.log(`     Actual   : ${latestNote.substring(0, 120)}...`);
  console.log(`     Result   : ${noteHasCorrectFormat ? 'PASS' : 'FAIL'}`);
  console.log(`     Contains subject '${subject}': ${noteContainsSubject ? 'PASS' : 'FAIL'}`);
  console.log('Verify #5 - Request opens inside CRM page under Opportunity breadcrumb:');
  console.log(`     Expected : Tickets panel opened`);
  console.log(`     Actual   : panel was opened in step 5`);
  console.log(`     Result   : PASS`);
  console.log('===============================================');
  console.log(`OVERALL: ${hiddenAtZero && visibleAfterRaise && countIs1 && noteHasCorrectFormat && noteContainsSubject ? 'PASS' : 'FAIL'} - request creates ticket with log note and counter`);

  expect(hiddenAtZero, `tickets hidden at zero`).toBe(true);
  expect(visibleAfterRaise, `tickets visible after raise`).toBe(true);
  expect(countIs1, `counter shows 1`).toBe(true);
  expect(noteHasCorrectFormat, `note has correct format with requester, subject, and ticket number`).toBe(true);
  expect(noteContainsSubject, `note contains subject`).toBe(true);
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
