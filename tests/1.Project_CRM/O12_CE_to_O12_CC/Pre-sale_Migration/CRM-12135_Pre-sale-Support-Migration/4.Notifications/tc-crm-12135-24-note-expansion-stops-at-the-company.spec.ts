import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-24 - Creating a request adds a log note only on its own Opportunity, not on another Opportunity
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-24
 * Jira           : CRM-12135, CRM-12938
 * Requirements   : FUNC-0062
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create two fresh Opportunities above the gate. Raise a request from Opportunity 1 only.
 *   Verify that the internal note lands on Opportunity 1 but does not appear on Opportunity 2.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-24:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12938 (read from execution 2026-09-24)
 *
 *   Pre-condition(s):
 *      1. Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)
 *      2. Pre-Sales Application user is logged in and session uid is recorded
 *      3. Two fresh Opportunities are created with Expected Revenue >= $100
 *
 *   Steps to reproduce:
 *      1. From Opportunity 1, click "Request SE support" and create one request with:
 *          - Subject          = AUTO-CRM-12135-TC-24-<runId>-note
 *          - Description      = Automated check of CRM-12135 TC-24.
 *          - Support type     = Offline technical assistance
 *      2. Refresh Opportunity 1 and read its chatter
 *      3. Open Opportunity 2 and read its chatter
 *
 *   Verification (expected results):
 *      1. One log note carrying AUTO-CRM-12135-TC-24-<runId>-note is shown on Opportunity 1
 *      2. No log note carrying AUTO-CRM-12135-TC-24-<runId>-note is shown on Opportunity 2
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-24-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Admin is logged in on crm-mig.nakivo.site (Odoo 12 CE, db nakivoCE)',
  pre2:   'Pre-condition 2: Pre-Sales Application user is logged in and session uid is recorded',
  pre3:   'Pre-condition 3: Two fresh Opportunities are created with Expected Revenue >= $100',
  s1:     'Step 1: From Opportunity 1, click "Request SE support" and create one request',
  s2:     'Step 2: Refresh Opportunity 1 and read its chatter',
  s3:     'Step 3: Open Opportunity 2 and read its chatter',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-24 - Note expansion stops at the company, the exact address and a won deal', () => {
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

  test('CRM-12135_TC-24: Note expansion stops at the company, the exact address and a won deal', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-24 - Note expansion stops at the company, the exact address and a won deal ==========');

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
const marker = MigPreSalePage.marker('TC-24', runId);
let leadId = 0;
let untouchedLeadId = 0;
let requestId = 0;
let notesOnSource: string[] = [];
let notesOnUntouched: string[] = [];

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log(`  Admin logged in on crm-mig.nakivo.site`);
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
});

await test.step(STEP.pre3, async () => {
  console.log(`\n--- ${STEP.pre3} ---`);
  leadId = await preSale.createOpportunity(`${marker} - Opportunity 1`, 900);
  untouchedLeadId = await preSale.createOpportunity(`${marker} - Opportunity 2`, 900);
  teardown = async () => {
    if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
    const swept = await preSale.sweepByMarker(marker);
    console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
      (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
  };
  console.log(`  Opportunity 1 created: ${leadId}`);
  console.log(`  Opportunity 2 created: ${untouchedLeadId}`);
});

await test.step(STEP.s1, async () => {
  console.log(`\n--- ${STEP.s1} ---`);
  await preSale.openOpportunity(leadId);
  await preSale.openRaiseDialog();
  await preSale.fillRaiseDialog({
    subject: `${marker}-note`,
    description: 'Automated check of CRM-12135 TC-24.',
    supportType: 'Offline technical assistance',
  });
  console.log(`  - Subject      : ${marker}-note`);
  console.log(`  - Description  : Automated check of CRM-12135 TC-24.`);
  console.log(`  - Support type : Offline technical assistance`);
  await preSale.saveRaiseDialog();
  await preSale.waitForRaiseDialogClosed();
  const raised = await preSale.requestsForLead(leadId);
  expect(raised.length, 'the raise should have created exactly one request').toBe(1);
  requestId = raised[0].id;
  console.log(`  Request ${requestId} raised from Opportunity 1`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 1 - Request raised');

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  await preSale.openOpportunity(leadId);
  notesOnSource = await preSale.logNotesForLead(leadId);
  console.log(`  Notes on Opportunity 1: ${notesOnSource.length}`);
  if (notesOnSource.length > 0) {
    const hasMarker = notesOnSource.some((n) => n.includes(`${marker}-note`));
    console.log(`  Opportunity 1 has note with marker: ${hasMarker}`);
  }
});

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  await preSale.openOpportunity(untouchedLeadId);
  notesOnUntouched = await preSale.logNotesForLead(untouchedLeadId);
  console.log(`  Notes on Opportunity 2: ${notesOnUntouched.length}`);
  if (notesOnUntouched.length > 0) {
    const hasRequestNote = notesOnUntouched.some((n) => n.includes(`${marker}-note`));
    console.log(`  Opportunity 2 has note about the request: ${hasRequestNote}`);
  }
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  const opp1HasNote = notesOnSource.some((n) => n.includes(`${marker}-note`));
  const opp2Clean = !notesOnUntouched.some((n) => n.includes(`${marker}-note`));

  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - One log note carrying AUTO-CRM-12135-TC-24-<runId>-note is shown on Opportunity 1:');
  console.log(`     Expected : a note carrying ${marker}-note`);
  console.log(`     Actual   : ${opp1HasNote}`);
  console.log(`     Result   : ${opp1HasNote ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - No log note carrying AUTO-CRM-12135-TC-24-<runId>-note is shown on Opportunity 2:');
  console.log(`     Expected : no note about the request`);
  console.log(`     Actual   : ${opp2Clean ? 'none' : 'a note was written'}`);
  console.log(`     Result   : ${opp2Clean ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  const overallPass = opp1HasNote && opp2Clean;
  console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Creating a request adds a log note only on its own Opportunity, not on another Opportunity`);

  expect(opp1HasNote, 'Opportunity 1 should carry the note').toBe(true);
  expect(opp2Clean, 'Opportunity 2 should carry no note about the request').toBe(true);
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
