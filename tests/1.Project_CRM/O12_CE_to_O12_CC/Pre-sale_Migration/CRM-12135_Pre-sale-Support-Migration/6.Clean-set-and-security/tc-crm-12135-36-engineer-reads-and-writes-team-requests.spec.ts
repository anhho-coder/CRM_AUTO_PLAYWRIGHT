import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-36 - An engineer reads and writes every request of the team
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-36
 * Jira           : CRM-12135
 * Requirements   : IS-CRM-SEC-0008, IS-CRM-SEC-0009
 * Run as         : Engineer (pre_sales_engineer_crm_mig account)
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    This test verifies access control: an engineer of the Sales Engineers team can read and
 *   write every request that team owns, including those assigned to other engineers. It creates
 *   one request, assigns it to a different engineer, then verifies the original engineer can
 *   still read and modify it. The request is tagged with AUTO-CRM-12135-TC-36-<runId> and
 *   deleted in teardown.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-36:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * "Pre-sale Migration Instructions.pdf" attached to CRM-12135 on 2026-09-17 -
 * sections 3-5 (the end-user flow) and section 7 (the test-case matrix, row TC-36).
 *
 *   Pre-condition(s):
 *      1. CRM is running at crm-mig.nakivo.site, Pre-Sales Application at
 *     pre-sales-crm-mig.nakivo.site
 *      2. User has credentials to sign into CRM as admin_crm_mig
 *      3. User has credentials to sign into Pre-Sales Application as pre_sales_engineer_crm_mig
 *      4. Test will create an Opportunity with name AUTO-CRM-12135-TC-36-<runId> source in the
 *     CRM
 *      5. Test will raise a request with name AUTO-CRM-12135-TC-36-<runId> request on Pre-Sales
 *     Application
 *      6. Test will delete both the opportunity and request in teardown
 *
 *   Steps to reproduce:
 *      1. Sign into the CRM and launch Pre-Sales Application session
 *      2. Create an opportunity in the CRM
 *      3. Open the opportunity and display the raise dialog
 *      4. Fill and save the raise dialog to create a request
 *          - Subject          = AUTO-CRM-12135-TC-36-<runId> request
 *          - Description      = Automated check of CRM-12135 - this request is the evidence for the case.
 *          - Support Type     = Offline technical assistance
 *      5. [INTERNAL check, Call API] Verify the request was created and read it back
 *      6. [INTERNAL check, Call API] Verify the unowned request is readable by the engineer
 *      7. [INTERNAL check, Call API] Assign the request to another engineer
 *      8. [INTERNAL check, Call API] Set priority on the request owned by another engineer
 *      9. [INTERNAL check, Call API] Read the priority value back to confirm the write took
 *     effect
 *
 *   Verification (expected results):
 *      1. Exactly one request created from the opportunity
 *      2. Request readable by the engineer account while unowned
 *      3. Request successfully assigned to another engineer
 *      4. Priority write accepted while another engineer owns the request
 *      5. Priority value read back as '2' confirming the write persisted
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-36-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: CRM is running at crm-mig.nakivo.site, Pre-Sales Application at pre-sales-crm-mig.nakivo.site',
  pre2:   'Pre-condition 2: User has credentials to sign into CRM as admin_crm_mig',
  pre3:   'Pre-condition 3: User has credentials to sign into Pre-Sales Application as pre_sales_engineer_crm_mig',
  pre4:   'Pre-condition 4: Test will create an Opportunity with name AUTO-CRM-12135-TC-36-<runId> source in the CRM',
  pre5:   'Pre-condition 5: Test will raise a request with name AUTO-CRM-12135-TC-36-<runId> request on Pre-Sales Application',
  pre6:   'Pre-condition 6: Test will delete both the opportunity and request in teardown',
  s1:     'Step 1: Sign into the CRM and launch Pre-Sales Application session',
  s2:     'Step 2: Create an opportunity in the CRM',
  s3:     'Step 3: Open the opportunity and display the raise dialog',
  s4:     'Step 4: Fill and save the raise dialog to create a request',
  s5:     'Step 5: [INTERNAL check, Call API] Verify the request was created and read it back',
  s6:     'Step 6: [INTERNAL check, Call API] Verify the unowned request is readable by the engineer',
  s7:     'Step 7: [INTERNAL check, Call API] Assign the request to another engineer',
  s8:     'Step 8: [INTERNAL check, Call API] Set priority on the request owned by another engineer',
  s9:     'Step 9: [INTERNAL check, Call API] Read the priority value back to confirm the write took effect',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-36 - An engineer reads and writes every request of the team', () => {
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

  test('CRM-12135_TC-36: An engineer reads and writes every request of the team', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-36 - An engineer reads and writes every request of the team ==========');

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
        users.pre_sales_engineer_crm_mig.username,
        users.pre_sales_engineer_crm_mig.password,
      );
      console.log(`  Pre-Sales Application session uid: ${presalesUid}`);

const runId = MigPreSalePage.runId();
const marker = MigPreSalePage.marker('TC-36', runId);
      let leadId = 0;
      let requestId = 0;
      let otherEngineerId = 0;
      let unownedReadable = false;
      let assignmentSucceeded = false;
      let writeSucceeded = false;
      let writePersisted = false;
      let writeError = '';

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  CRM running at: ${baseUrl_mig}`);
        console.log(`  Pre-Sales Application active: confirmed`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        console.log(`  CRM credentials for admin_crm_mig: available in config`);
      });

      await test.step(STEP.pre3, async () => {
        console.log(`\n--- ${STEP.pre3} ---`);
        console.log(`  Pre-Sales credentials for pre_sales_engineer_crm_mig: available in config`);
      });

      await test.step(STEP.pre4, async () => {
        console.log(`\n--- ${STEP.pre4} ---`);
        console.log(`  Test will create an Opportunity with AUTO-CRM-12135-TC-36-<runId> source`);
        console.log(`  Run ID: ${runId}`);
        console.log(`  Marker: ${marker}`);
      });

      await test.step(STEP.pre5, async () => {
        console.log(`\n--- ${STEP.pre5} ---`);
        console.log(`  Test will raise a request with name ${marker} request`);
      });

      await test.step(STEP.pre6, async () => {
        console.log(`\n--- ${STEP.pre6} ---`);
        console.log(`  Test will delete both the opportunity and request in teardown`);
        teardown = async () => {
          if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
          const swept = await preSale.sweepByMarker(marker);
          console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
            (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
        };
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  CRM logged in as admin_crm_mig`);
        console.log(`  Pre-Sales Application session active as pre_sales_engineer_crm_mig`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        leadId = await preSale.createOpportunity(`${marker} source`, 900);
        console.log(`  Opportunity created: ${leadId}`);
        console.log(`  Expected revenue: 900`);
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await preSale.openOpportunity(leadId);
        console.log(`  Opportunity ${leadId} opened`);
        await preSale.openRaiseDialog();
        console.log(`  Raise dialog opened`);
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        await preSale.fillRaiseDialog({
          subject: `${marker} request`,
          description: 'Automated check of CRM-12135 - this request is the evidence for the case.',
          supportType: 'Offline technical assistance',
        });
        console.log(`  Subject                = ${marker} request`);
        console.log(`  Description            = Automated check of CRM-12135 - this request is the evidence for the case.`);
        console.log(`  Support Type           = Offline technical assistance`);
        await preSale.saveRaiseDialog();
        console.log(`  Raise dialog saved`);
        await preSale.waitForRaiseDialogClosed();
        console.log(`  Raise dialog closed`);
      });

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        const requests = await preSale.requestsForLead(leadId);
        console.log(`  Requests for opportunity ${leadId}: ${requests.length}`);
        expect(requests.length, 'the raise should have created exactly one request').toBe(1);
        requestId = requests[0].id;
        console.log(`  Request ID: ${requestId}`);
      });

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        const request = await preSale.request(requestId);
        unownedReadable = request.id === requestId;
        console.log(`  Request readable by engineer: ${unownedReadable}`);
        console.log(`  Request ID from read: ${request.id}`);
      });

      await test.step(STEP.s7, async () => {
        console.log(`\n--- ${STEP.s7} ---`);
        otherEngineerId = await preSale.presalesUserIdByLogin(MigPreSalePage.SE_TEAM_LOGINS[1]);
        console.log(`  Second engineer login: ${MigPreSalePage.SE_TEAM_LOGINS[1]}`);
        console.log(`  Second engineer user ID: ${otherEngineerId}`);
        await preSale.assignRequest(requestId, otherEngineerId);
        console.log(`  Request assigned to engineer ID ${otherEngineerId}`);
        const assignedAfter = await preSale.request(requestId);
        assignmentSucceeded = assignedAfter.assignedUserId === otherEngineerId;
        console.log(`  Assignment verified: ${assignmentSucceeded}`);
      });

      await test.step(STEP.s8, async () => {
        console.log(`\n--- ${STEP.s8} ---`);
        try {
          await preSale.setRequestPriority(requestId, '2');
          writeSucceeded = true;
          console.log(`  setRequestPriority(${requestId}, '2'): succeeded`);
        } catch (err) {
          writeError = (err as Error).message.split('\n')[0];
          writeSucceeded = false;
          console.log(`  setRequestPriority(${requestId}, '2'): failed - ${writeError}`);
        }
      });

      await test.step(STEP.s9, async () => {
        console.log(`\n--- ${STEP.s9} ---`);
        const updated = await preSale.request(requestId);
        const readPriority = updated.priority;
        writePersisted = readPriority === '2';
        console.log(`  request(${requestId}).priority: ${readPriority}`);
        console.log(`  Priority persisted as '2': ${writePersisted}`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const allChecksPassed = unownedReadable && assignmentSucceeded && writeSucceeded && writePersisted;
        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - Exactly one request created from the opportunity:');
        console.log(`     Expected : 1`);
        console.log(`     Actual   : 1`);
        console.log(`     Result   : PASS`);
        console.log('Verify #2 - The engineer reads a request of the team they do not own:');
        console.log(`     Expected : readable`);
        console.log(`     Actual   : ${unownedReadable}`);
        console.log(`     Result   : ${unownedReadable ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - Request successfully assigned to another engineer:');
        console.log(`     Expected : assigned to ${MigPreSalePage.SE_TEAM_LOGINS[1]}`);
        console.log(`     Actual   : ${assignmentSucceeded}`);
        console.log(`     Result   : ${assignmentSucceeded ? 'PASS' : 'FAIL'}`);
        console.log('Verify #4 - The engineer writes a request owned by another engineer:');
        console.log(`     Expected : the write is accepted`);
        console.log(`     Actual   : ${writeSucceeded ? 'accepted' : `refused - ${writeError}`}`);
        console.log(`     Result   : ${writeSucceeded ? 'PASS' : 'FAIL'}`);
        console.log('Verify #5 - The written value persists:');
        console.log(`     Expected : 2`);
        console.log(`     Actual   : ${writePersisted ? '2' : 'different'}`);
        console.log(`     Result   : ${writePersisted ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log(`OVERALL: ${allChecksPassed ? 'PASS' : 'FAIL'} - the engineer can read and write any request of their team, including those assigned to others`);
        expect(unownedReadable, 'the engineer should read a request of the team').toBe(true);
        expect(assignmentSucceeded, 'the engineer should successfully assign a request').toBe(true);
        expect(writeSucceeded, `the engineer should write another engineer's request (${writeError})`).toBe(true);
        expect(writePersisted, 'the written priority should read back as 2').toBe(true);
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
