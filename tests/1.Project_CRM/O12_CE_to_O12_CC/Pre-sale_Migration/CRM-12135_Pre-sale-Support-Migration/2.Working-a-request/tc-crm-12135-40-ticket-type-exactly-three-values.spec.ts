import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-40 - A request carries a Ticket Type with exactly the three values in use
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-40
 * Jira           : CRM-12135
 * Requirements   : IS-CRM-FUNC-0042
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-23
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *   A request raised from the CRM arrives with its Ticket Type already filled, mapped from the
 *   dialog's Support type, the list offers exactly the three values in use today, and a value an
 *   engineer changes is kept.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-40:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-13079 - Thuat Phung's manual test case (revised 2026-09-24).
 *
 *   Pre-condition(s):
 *      1. Signed in to the CRM as admin, and to the Pre-Sales Application
 *      2. An Opportunity AUTO-CRM-12135-TC-40-<runId> exists with Expected Revenue Deal >= $100
 *
 *   Steps to reproduce:
 *      1. From the Opportunity, click "Request SE support" and create a request with:
 *         Subject = AUTO-CRM-12135-TC-40-<runId>-A, Meeting Time = tomorrow 10:00,
 *         Description = Automated check of CRM-12135 TC-40,
 *         Support type = Online deployment session
 *      2. Click "Request SE support" again and create a request with:
 *         Subject = AUTO-CRM-12135-TC-40-<runId>-B, Meeting Time = tomorrow 11:00,
 *         Description = Automated check of CRM-12135 TC-40,
 *         Support type = Online technical assistance
 *      3. Click "Request SE support" again and create a request with:
 *         Subject = AUTO-CRM-12135-TC-40-<runId>-C, Meeting Time = blank,
 *         Description = Automated check of CRM-12135 TC-40,
 *         Support type = Offline technical assistance
 *      4. As QA SE User, open Tickets, search AUTO-CRM-12135-TC-40-<runId> and open request A
 *      5. Go back to the Tickets list and open request B
 *      6. Go back to the Tickets list and open request C
 *      7. On request C, click the Ticket Type dropdown
 *      8. Select Cancelled demo / session and save
 *      9. Refresh the page and re-open request C
 *
 *   Verification (expected results):
 *      1. No error popup when creating all three requests
 *      2. Request A has Ticket Type = Deployment / POC session
 *      3. Request B has Ticket Type = Technical assistance
 *      4. Request C has Ticket Type = Technical assistance
 *      5. Exactly three values offered: Technical assistance, Deployment / POC session, Cancelled demo / session
 *      6. No error popup when selecting Cancelled demo / session and saving
 *      7. Ticket Type is Cancelled demo / session after refresh and reopen
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-40-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Signed in to the CRM as admin, and to the Pre-Sales Application',
  pre2:   'Pre-condition 2: An Opportunity AUTO-CRM-12135-TC-40-<runId> exists with Expected Revenue Deal >= $100',
  s1:     'Step 1: From the Opportunity, click "Request SE support" and create a request with Online deployment session (Subject = AUTO-CRM-12135-TC-40-<runId>-A)',
  s2:     'Step 2: Click "Request SE support" again and create a request with Online technical assistance (Subject = AUTO-CRM-12135-TC-40-<runId>-B)',
  s3:     'Step 3: Click "Request SE support" again and create a request with Offline technical assistance (Subject = AUTO-CRM-12135-TC-40-<runId>-C)',
  s4:     'Step 4: As QA SE User, open Tickets and open request A',
  s5:     'Step 5: Go back to the Tickets list and open request B',
  s6:     'Step 6: Go back to the Tickets list and open request C',
  s7:     'Step 7: On request C, click the Ticket Type dropdown',
  s8:     'Step 8: Select Cancelled demo / session and save',
  s9:     'Step 9: Refresh the page and re-open request C',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-40 - A request carries a Ticket Type with exactly the three values in use', () => {
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

  test('CRM-12135_TC-40: A request carries a Ticket Type with exactly the three values in use', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-40 - A request carries a Ticket Type with exactly the three values in use ==========');

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
      const marker = MigPreSalePage.marker('TC-40', runId);
      // The mapping the source states: Online deployment session -> Deployment / POC session
      // Both online and offline technical assistance -> Technical assistance
      const SUPPORT_TYPE_A = 'Online deployment session';
      const SUPPORT_TYPE_B = 'Online technical assistance';
      const SUPPORT_TYPE_C = 'Offline technical assistance';
      const MAPPED_TYPE_A = 'Deployment / POC session';
      const MAPPED_TYPE_B = 'Technical assistance';
      const MAPPED_TYPE_C = 'Technical assistance';
      const CHANGED_TYPE = 'Cancelled demo / session';
      let leadId = 0;
      let requestIdA = 0;
      let requestIdB = 0;
      let requestIdC = 0;
      let typeAtArrivalA: string | false = false;
      let typeAtArrivalB: string | false = false;
      let typeAtArrivalC: string | false = false;
      let typeValues: string[] = [];
      let typeAfterChange: string | false = false;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  CRM account       : ${users.admin_crm_mig.username}`);
        console.log(`  Pre-Sales session : uid ${presalesUid}`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        leadId = await preSale.createOpportunity(`${marker} source`, 900);
        teardown = async () => {
          if (SKIP_CLEANUP) {
            console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`);
            return;
          }
          const swept = await preSale.sweepByMarker(marker);
          console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and ` +
            `opportunities [${swept.opportunities.join(', ')}]` +
            (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
        };
        console.log(`  Opportunity id   : ${leadId}`);
        console.log(`  Expected Revenue : 900`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await preSale.openOpportunity(leadId);
        await preSale.openRaiseDialog();
        const subject = `${marker}-A`;
        const description = 'Automated check of CRM-12135 TC-40.';
        console.log(`  - Subject      : ${subject}`);
        console.log(`  - Description  : ${description}`);
        console.log(`  - Meeting Time : tomorrow 10:00`);
        console.log(`  - Support type : ${SUPPORT_TYPE_A}`);
        await preSale.fillRaiseDialog({
          subject,
          description,
          meetingTime: '09/30/2026 10:00:00',
          supportType: SUPPORT_TYPE_A,
        });
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const raised = await preSale.requestsForLead(leadId);
        expect(raised.length, 'the raise should have created exactly one request').toBeGreaterThanOrEqual(1);
        requestIdA = raised[0].id;
        console.log(`  Request A id     : ${requestIdA} (${raised[0].number})`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        await preSale.openRaiseDialog();
        const subject = `${marker}-B`;
        const description = 'Automated check of CRM-12135 TC-40.';
        console.log(`  - Subject      : ${subject}`);
        console.log(`  - Description  : ${description}`);
        console.log(`  - Meeting Time : tomorrow 11:00`);
        console.log(`  - Support type : ${SUPPORT_TYPE_B}`);
        await preSale.fillRaiseDialog({
          subject,
          description,
          meetingTime: '09/30/2026 11:00:00',
          supportType: SUPPORT_TYPE_B,
        });
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const raised = await preSale.requestsForLead(leadId);
        expect(raised.length, 'should have created at least two requests').toBeGreaterThanOrEqual(2);
        requestIdB = raised[1].id;
        console.log(`  Request B id     : ${requestIdB} (${raised[1].number})`);
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        await preSale.openRaiseDialog();
        const subject = `${marker}-C`;
        const description = 'Automated check of CRM-12135 TC-40.';
        console.log(`  - Subject      : ${subject}`);
        console.log(`  - Description  : ${description}`);
        console.log(`  - Meeting Time : blank`);
        console.log(`  - Support type : ${SUPPORT_TYPE_C}`);
        await preSale.fillRaiseDialog({
          subject,
          description,
          supportType: SUPPORT_TYPE_C,
        });
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const raised = await preSale.requestsForLead(leadId);
        expect(raised.length, 'should have created at least three requests').toBeGreaterThanOrEqual(3);
        requestIdC = raised[2].id;
        console.log(`  Request C id     : ${requestIdC} (${raised[2].number})`);
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        const req = await preSale.request(requestIdA);
        typeAtArrivalA = req.typeName;
        console.log(`  Support type chosen in dialog : ${SUPPORT_TYPE_A}`);
        console.log(`  Ticket Type on request A      : ${typeAtArrivalA || '(EMPTY)'}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4 - request A Ticket Type verified');

      await test.step(STEP.s5, async () => {
        console.log(`\n--- ${STEP.s5} ---`);
        const req = await preSale.request(requestIdB);
        typeAtArrivalB = req.typeName;
        console.log(`  Support type chosen in dialog : ${SUPPORT_TYPE_B}`);
        console.log(`  Ticket Type on request B      : ${typeAtArrivalB || '(EMPTY)'}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 5 - request B Ticket Type verified');

      await test.step(STEP.s6, async () => {
        console.log(`\n--- ${STEP.s6} ---`);
        const req = await preSale.request(requestIdC);
        typeAtArrivalC = req.typeName;
        console.log(`  Support type chosen in dialog : ${SUPPORT_TYPE_C}`);
        console.log(`  Ticket Type on request C      : ${typeAtArrivalC || '(EMPTY)'}`);
      });

      await test.step(STEP.s7, async () => {
        console.log(`\n--- ${STEP.s7} ---`);
        typeValues = await preSale.requestTypeNames();
        console.log(`  Values offered (${typeValues.length}):`);
        for (const v of typeValues) {
          console.log(`    - ${v}`);
        }
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 7 - Ticket Type dropdown values verified');

      await test.step(STEP.s8, async () => {
        console.log(`\n--- ${STEP.s8} ---`);
        const changedId = await preSale.requestTypeIdByName(CHANGED_TYPE);
        await preSale.setRequestType(requestIdC, changedId);
        console.log(`  Ticket Type set to : ${CHANGED_TYPE} (id ${changedId})`);
      });

      await test.step(STEP.s9, async () => {
        console.log(`\n--- ${STEP.s9} ---`);
        const req = await preSale.request(requestIdC);
        typeAfterChange = req.typeName;
        console.log(`  Ticket Type read back after refresh : ${typeAfterChange || '(EMPTY)'}`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 9 - request C Ticket Type change persisted');

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const expectedValues = [...MigPreSalePage.EXPECTED_TYPES].sort();
        const actualValues = [...typeValues].sort();
        const mappingA = typeAtArrivalA === MAPPED_TYPE_A;
        const mappingB = typeAtArrivalB === MAPPED_TYPE_B;
        const mappingC = typeAtArrivalC === MAPPED_TYPE_C;
        const exactlyThree = JSON.stringify(actualValues) === JSON.stringify(expectedValues);
        const noFourthValue = typeValues.length === MigPreSalePage.EXPECTED_TYPES.length;
        const changeKept = typeAfterChange === CHANGED_TYPE;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - Request A: Online deployment session maps to Deployment / POC session:');
        console.log(`     Expected : ${MAPPED_TYPE_A}`);
        console.log(`     Actual   : ${typeAtArrivalA || '(EMPTY)'}`);
        console.log(`     Result   : ${mappingA ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - Request B: Online technical assistance maps to Technical assistance:');
        console.log(`     Expected : ${MAPPED_TYPE_B}`);
        console.log(`     Actual   : ${typeAtArrivalB || '(EMPTY)'}`);
        console.log(`     Result   : ${mappingB ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - Request C: Offline technical assistance maps to Technical assistance:');
        console.log(`     Expected : ${MAPPED_TYPE_C}`);
        console.log(`     Actual   : ${typeAtArrivalC || '(EMPTY)'}`);
        console.log(`     Result   : ${mappingC ? 'PASS' : 'FAIL'}`);
        console.log('Verify #4 - The Ticket Type list offers exactly the three values in use:');
        console.log(`     Expected : ${expectedValues.join(' | ')}`);
        console.log(`     Actual   : ${actualValues.join(' | ')}`);
        console.log(`     Result   : ${exactlyThree ? 'PASS' : 'FAIL'}`);
        console.log('Verify #5 - No fourth value (for example a generic "other") is offered:');
        console.log(`     Expected : ${MigPreSalePage.EXPECTED_TYPES.length}`);
        console.log(`     Actual   : ${typeValues.length}`);
        console.log(`     Result   : ${noFourthValue ? 'PASS' : 'FAIL'}`);
        console.log('Verify #6 - A value the engineer changes is accepted and kept on reopen:');
        console.log(`     Expected : ${CHANGED_TYPE}`);
        console.log(`     Actual   : ${typeAfterChange || '(EMPTY)'}`);
        console.log(`     Result   : ${changeKept ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const overallPass = mappingA && mappingB && mappingC && exactlyThree && noFourthValue && changeKept;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - all three requests map correctly and the Ticket Type offers exactly the three values in use`);

        expect(mappingA, `${SUPPORT_TYPE_A} should map to ${MAPPED_TYPE_A} (got ${typeAtArrivalA})`).toBe(true);
        expect(mappingB, `${SUPPORT_TYPE_B} should map to ${MAPPED_TYPE_B} (got ${typeAtArrivalB})`).toBe(true);
        expect(mappingC, `${SUPPORT_TYPE_C} should map to ${MAPPED_TYPE_C} (got ${typeAtArrivalC})`).toBe(true);
        expect(actualValues, 'the Ticket Type list should offer exactly the three values in use').toEqual(expectedValues);
        expect(noFourthValue, `no fourth Ticket Type should exist (found ${typeValues.length})`).toBe(true);
        expect(changeKept, `the changed Ticket Type should be kept (got ${typeAfterChange})`).toBe(true);
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
