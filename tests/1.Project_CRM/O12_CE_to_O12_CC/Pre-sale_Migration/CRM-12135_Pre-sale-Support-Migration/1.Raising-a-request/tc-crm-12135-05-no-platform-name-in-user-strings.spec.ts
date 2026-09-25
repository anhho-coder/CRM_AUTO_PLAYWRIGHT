import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * OUT OF SCOPE - SKIPPED, NOT DELETED
 * ============================================================================================
 * The Jira test case this spec mirrors, CRM-12920, was CLOSED by Thuat Phung on 2026-09-22 with the
 * reason "this is invalid test case, it related to a design note, not a functionality", its Test Repository Path was cleared, and it is
 * no longer on Test Execution CRM-12945. The agreed scope is now the 28 cases Thuat kept
 * (accepted by the tester 2026-09-24), so this spec must not run or be counted.
 *
 * It is SKIPPED rather than deleted because no spec in this suite is tracked in git - deleting
 * the file would destroy it with no way back. Undo = drop the `.skip` and reopen CRM-12920.
 * ============================================================================================
 * ============================================================================================
 * CRM-12135_TC-05 - No platform or version name reaches a user-visible string
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-05
 * Jira           : CRM-12135
 * Requirements   : FUNC-0071, FUNC-0072
 * Run as         : Salesperson, admin
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity above the gate. Read all user-visible text on the Opportunity
 *   screen. Open the New Ticket dialog and read all user-visible text while the dialog is open.
 *   Search both texts for any platform names (e.g. Odoo, Frappe, O12, O19) or version strings
 *   (e.g. 2.0, v12). Verify no platform or version name appears in either text.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-05:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * "Pre-sale Migration Instructions.pdf" attached to CRM-12135 on 2026-09-17 -
 * sections 3-5 (the end-user flow) and section 7 (the test-case matrix, row TC-05).
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales
 *     Application session active
 *      2. Create an Opportunity named AUTO-CRM-12135-TC-05-<runId>-platform-check with Expected
 *     Revenue Deal = $500
 *
 *   Steps to reproduce:
 *      1. Open the Opportunity form
 *      2. Read all user-visible text on the Opportunity screen
 *      3. Open the New Ticket dialog
 *      4. Read all user-visible text while the dialog is open
 *      5. [INTERNAL check, Call API] Search both texts for platform and version names
 *
 *   Verification (expected results):
 *      1. The Opportunity screen shows no platform name (Odoo, Frappe, O12, O19, etc.)
 *      2. The Opportunity screen shows no version string (v12, v19, 12.0, 19.0, etc.)
 *      3. The raise dialog shows no platform name
 *      4. The raise dialog shows no version string
 *      5. The platform is a development choice, not visible to the salesperson
 *
 * Data
 * ----
 * READ-ONLY - this case creates no record on either server.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active',
  pre2:   'Pre-condition 2: Create an Opportunity named AUTO-CRM-12135-TC-05-<runId>-platform-check with Expected Revenue Deal = $500',
  s1:     'Step 1: Open the Opportunity form',
  s2:     'Step 2: Read all user-visible text on the Opportunity screen',
  s3:     'Step 3: Open the New Ticket dialog',
  s4:     'Step 4: Read all user-visible text while the dialog is open',
  s5:     'Step 5: [INTERNAL check, Call API] Search both texts for platform and version names',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe.skip('CRM-12135_TC-05 - No platform or version name reaches a user-visible string', () => {
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

  test('CRM-12135_TC-05: No platform or version name reaches a user-visible string', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-05 - No platform or version name reaches a user-visible string ==========');

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
const marker = MigPreSalePage.marker('TC-05', runId);
let leadId = 0;
let opportunityText = '';
let dialogText = '';
let noOppName = false;
let noOppVersion = false;
let noDialogName = false;
let noDialogVersion = false;
let noLeakage = false;
const subject = `${marker}-platform-check`;
const description = 'Automated check of CRM-12135 TC-05';
const supportType = 'Offline technical assistance';

await test.step(STEP.pre1, async () => {
  console.log(`\n--- ${STEP.pre1} ---`);
  console.log('  Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active');
});

await test.step(STEP.pre2, async () => {
  console.log(`\n--- ${STEP.pre2} ---`);
  leadId = await preSale.createOpportunity(`${marker}-platform-check`, 500);
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
  console.log(`  Opportunity form opened`);
});

await test.step(STEP.s2, async () => {
  console.log(`\n--- ${STEP.s2} ---`);
  opportunityText = await preSale.visibleBodyText();
  console.log(`  Visible text captured: ${opportunityText.length} characters`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2: Opportunity screen');

await test.step(STEP.s3, async () => {
  console.log(`\n--- ${STEP.s3} ---`);
  await preSale.openRaiseDialog();
  console.log(`  Dialog opened`);
});

await test.step(STEP.s4, async () => {
  console.log(`\n--- ${STEP.s4} ---`);
  dialogText = await preSale.visibleBodyText();
  console.log(`  Visible text with dialog captured: ${dialogText.length} characters`);
});
await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4: Dialog open');

await test.step(STEP.s5, async () => {
  console.log(`\n--- ${STEP.s5} ---`);
  const keywords = ['Odoo', 'Frappe', 'O12', 'O19', 'version', 'v12', 'v19', '12.0', '19.0'];
  const oppMatches = keywords.filter((kw) => opportunityText.toLowerCase().includes(kw.toLowerCase()));
  const dialogMatches = keywords.filter((kw) => dialogText.toLowerCase().includes(kw.toLowerCase()));
  noOppName = oppMatches.filter((kw) => ['Odoo', 'Frappe', 'O12', 'O19'].includes(kw)).length === 0;
  noOppVersion = oppMatches.filter((kw) => ['version', 'v12', 'v19', '12.0', '19.0'].includes(kw)).length === 0;
  noDialogName = dialogMatches.filter((kw) => ['Odoo', 'Frappe', 'O12', 'O19'].includes(kw)).length === 0;
  noDialogVersion = dialogMatches.filter((kw) => ['version', 'v12', 'v19', '12.0', '19.0'].includes(kw)).length === 0;
  noLeakage = noOppName && noOppVersion && noDialogName && noDialogVersion;
  console.log(`  Platform/version keywords found on Opportunity: ${oppMatches.length > 0 ? oppMatches.join(', ') : '(none)'}`);
  console.log(`  Platform/version keywords found in Dialog: ${dialogMatches.length > 0 ? dialogMatches.join(', ') : '(none)'}`);
});

await test.step(STEP.verify, async () => {
  console.log(`\n--- ${STEP.verify} ---`);
  console.log('\n==================== VERIFY ====================');
  console.log('Verify #1 - The Opportunity screen shows no platform name:');
  console.log(`     Expected : no Odoo/Frappe/O12/O19`);
  console.log(`     Result   : ${noOppName ? 'PASS' : 'FAIL'}`);
  console.log('Verify #2 - The Opportunity screen shows no version string:');
  console.log(`     Expected : no version/v12/v19/12.0/19.0`);
  console.log(`     Result   : ${noOppVersion ? 'PASS' : 'FAIL'}`);
  console.log('Verify #3 - The raise dialog shows no platform name:');
  console.log(`     Expected : no Odoo/Frappe/O12/O19`);
  console.log(`     Result   : ${noDialogName ? 'PASS' : 'FAIL'}`);
  console.log('Verify #4 - The raise dialog shows no version string:');
  console.log(`     Expected : no version/v12/v19/12.0/19.0`);
  console.log(`     Result   : ${noDialogVersion ? 'PASS' : 'FAIL'}`);
  console.log('Verify #5 - No platform or version name visible to user:');
  console.log(`     Expected : clean of all platform/version markers`);
  console.log(`     Result   : ${noLeakage ? 'PASS' : 'FAIL'}`);
  console.log('===============================================');
  console.log(`OVERALL: ${noLeakage ? 'PASS' : 'FAIL'} - no platform or version leakage to user`);

  expect(noOppName, `no platform names on opportunity`).toBe(true);
  expect(noOppVersion, `no version strings on opportunity`).toBe(true);
  expect(noDialogName, `no platform names in dialog`).toBe(true);
  expect(noDialogVersion, `no version strings in dialog`).toBe(true);
  expect(noLeakage, `no platform/version leakage`).toBe(true);
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
