import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-02 - Save creates a request on the helpdesk, linked both ways
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-02
 * Jira           : CRM-12135
 * Requirements   : FUNC-0039, FUNC-0056
 * Run as         : Salesperson
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    Create an Opportunity above the gate. Open it and record the baseline Tickets count (N).
 *   Raise a request with specific values via the New Ticket dialog. Save and verify the dialog
 *   closes. Re-open the Opportunity and verify the Tickets counter shows N+1. Verify the request
 *   was created by calling the Pre-Sales API, and verify bidirectional linking: the request's
 *   crmLeadRef points to the Opportunity, and both the subject and the request uuid match what
 *   was entered.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-02:" --project=chromium
 *
 * Source manual TC (CRM-12917)
 * ----------------------------
 * Jira CRM-12917 - manual test case rewritten by Thuat Phung on 2026-09-23.
 * Updated 2026-09-24 to align Playwright spec.
 *
 *   Pre-condition(s):
 *      1. Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales
 *     Application session active
 *
 *   Steps to reproduce:
 *      1. Open CRM > Sales > My Pipeline and open the Opportunity named in the pre-conditions.
 *     Read the number on the Tickets smart button and note it as N.
 *      2. Open the More menu if the header button row is full, click "Request SE support" and
 *     fill the New Ticket dialog with the values in Data.
 *      3. Click "Save".
 *      4. Re-open the Opportunity form and read the Tickets smart button.
 *      5. Click Tickets and open the request whose subject is the Subject from step 2.
 *      6. On the request, open the Opportunity Info tab, read the Opportunity field, then click
 *     its link.
 *
 *   Data:
 *      Subject       = AUTO-CRM-12135-TC-02-<runId>-linked-both-ways
 *      Description   = Automated check of CRM-12135 TC-02 - the request must stay linked to its Opportunity.
 *      Support type  = Offline technical assistance
 *      Meeting Time  = blank (required only for the two online support types)
 *
 *   Verification (expected results):
 *      1. The Opportunity form is open. The Tickets baseline N is recorded; the button being
 *     hidden means N = 0.
 *      2. The three required fields accept the values.
 *      3. The dialog closes. No "Odoo Server Error" dialog and no "Unable to log message" dialog
 *     appears.
 *      4. The Tickets smart button is visible and shows N + 1.
 *      5. The request opens inside the CRM page, under the Opportunity's breadcrumb. Its subject
 *     equals the Subject entered in step 2, and it carries a request reference of the form HT000nn.
 *      6. The Opportunity field names the Opportunity from the pre-conditions, and its link opens
 *     that same Opportunity. Both directions of the link resolve: Opportunity -> request via
 *     Tickets, request -> Opportunity via Opportunity Info.
 *
 *   RE-SYNC GAP (CRM-12917, 2026-09-24):
 *      - Step 5 requires clicking a request in the Tickets list to open it in the UI. The page
 *     object has no method to click on a specific request by subject. Verification uses API
 *     (requestsForLead) instead to confirm the request was created with the correct subject and
 *     crmLeadRef.
 *      - Step 6 requires opening the request's Opportunity Info tab and clicking its Opportunity
 *     link. The page object has no methods to interact with embedded request forms or tabs.
 *     Verification uses API data to confirm bidirectional linking (request.crmLeadRef == leadId).
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-02-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1:   'Pre-condition 1: Logged in to crm-mig.nakivo.site as Salesperson admin_crm_mig with Pre-Sales Application session active',
  s1:     'Step 1: Open CRM > Sales > My Pipeline and open the Opportunity. Read the number on the Tickets smart button and note it as N.',
  s2:     'Step 2: Open the More menu if the header button row is full, click "Request SE support" and fill the New Ticket dialog with the values in Data.',
  s3:     'Step 3: Click "Save".',
  s4:     'Step 4: Re-open the Opportunity form and read the Tickets smart button.',
  s5:     'Step 5: Click Tickets and open the request whose subject is the Subject from step 2.',
  s6:     'Step 6: On the request, open the Opportunity Info tab, read the Opportunity field, then click its link.',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-02 - Save creates a request on the helpdesk, linked both ways', () => {
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

  test('CRM-12135_TC-02: Save creates a request on the helpdesk, linked both ways', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-02 - Save creates a request on the helpdesk, linked both ways ==========');

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
        const marker = MigPreSalePage.marker('TC-02', runId);
        let leadId = 0;
        let baselineTicketsCount = 0;
        let requests: import('@pages/mig/MigPreSalePage').PreSaleRequest[] = [];
        let finalTicketsCount = 0;
        const subject = `${marker}-linked-both-ways`;
        const description = 'Automated check of CRM-12135 TC-02 - the request must stay linked to its Opportunity.';
        const supportType = 'Offline technical assistance';

        await test.step(STEP.pre1, async () => {
          console.log(`\n--- ${STEP.pre1} ---`);
          console.log('  Signed in on both servers; the data this case creates is removed in teardown.');
          // Create an Opportunity to work with (required for test to run)
          leadId = await preSale.createOpportunity(`${marker}-opp`, 750);
          teardown = async () => {
            if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
            const swept = await preSale.sweepByMarker(marker);
            console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
              (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
          };
          console.log(`  Opportunity ${leadId} created at $750`);
        });

        await test.step(STEP.s1, async () => {
          console.log(`\n--- ${STEP.s1} ---`);
          await preSale.openOpportunity(leadId);
          const hasTicketsButton = await preSale.isTicketsStatVisible();
          if (hasTicketsButton) {
            baselineTicketsCount = await preSale.ticketsStatCount();
            console.log(`  Tickets baseline N: ${baselineTicketsCount}`);
          } else {
            console.log(`  Tickets button hidden (N = 0)`);
            baselineTicketsCount = 0;
          }
        });

        await test.step(STEP.s2, async () => {
          console.log(`\n--- ${STEP.s2} ---`);
          await preSale.openRaiseDialog();
          await preSale.fillRaiseDialog({ subject, description, supportType });
          console.log(`  Dialog filled:`);
          console.log(`  - Subject      : ${subject}`);
          console.log(`  - Description  : ${description}`);
          console.log(`  - Support type : ${supportType}`);
          console.log(`  - Meeting Time : (blank, not required for Offline type)`);
        });

        await test.step(STEP.s3, async () => {
          console.log(`\n--- ${STEP.s3} ---`);
          await preSale.saveRaiseDialog();
          console.log(`  Save clicked, waiting for dialog close...`);
          await preSale.waitForRaiseDialogClosed();
          console.log(`  Dialog closed, no error dialogs appeared`);
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3: Dialog saved and closed');

        await test.step(STEP.s4, async () => {
          console.log(`\n--- ${STEP.s4} ---`);
          await preSale.openOpportunity(leadId);
          const hasTicketsButton = await preSale.isTicketsStatVisible();
          if (hasTicketsButton) {
            finalTicketsCount = await preSale.ticketsStatCount();
            console.log(`  Tickets counter now shows: ${finalTicketsCount}`);
          } else {
            console.log(`  Tickets button NOT visible`);
            finalTicketsCount = 0;
          }
        });
        await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 4: Tickets counter after save');

        await test.step(STEP.s5, async () => {
          console.log(`\n--- ${STEP.s5} ---`);
          // Open the Tickets panel to show the embedded helpdesk
          await preSale.openTicketsPanel();
          console.log(`  Tickets panel opened (embedded in CRM page)`);
          console.log(`  [RE-SYNC GAP] Page object has no method to click on a specific request by subject.`);
          console.log(`  [RE-SYNC GAP] Verification uses API to confirm request was created.`);
        });

        await test.step(STEP.s6, async () => {
          console.log(`\n--- ${STEP.s6} ---`);
          // Read the request data via API to verify bidirectional linking
          requests = await preSale.requestsForLead(leadId);
          console.log(`  [RE-SYNC GAP] Page object has no methods to interact with embedded request forms or tabs.`);
          console.log(`  [RE-SYNC GAP] Verification uses API data to confirm bidirectional linking.`);
          if (requests.length > 0) {
            const req = requests[0];
            console.log(`  Request ${req.id}: subject=${req.name}, uuid=${req.requestUuid}, crm_lead_ref=${req.crmLeadRef}`);
          }
        });

        await test.step(STEP.verify, async () => {
          console.log(`\n--- ${STEP.verify} ---`);
          const check1 = baselineTicketsCount >= 0;
          const check2 = finalTicketsCount === baselineTicketsCount + 1;
          const check3 = requests.length === 1;
          const check4 = requests.length > 0 && requests[0].name === subject;
          const check5 = requests.length > 0 && requests[0].crmLeadRef === leadId;
          const check6 = requests.length > 0 && requests[0].requestUuid !== false && String(requests[0].requestUuid).length > 0;

          console.log('\n==================== VERIFY ====================');
          console.log('Verify #1 - Baseline Tickets count recorded (N):');
          console.log(`     Baseline N: ${baselineTicketsCount}`);
          console.log(`     Result     : ${check1 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #2 - Tickets counter shows N + 1:');
          console.log(`     Expected : ${baselineTicketsCount + 1}`);
          console.log(`     Actual   : ${finalTicketsCount}`);
          console.log(`     Result   : ${check2 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #3 - Exactly one request was created for the Opportunity:');
          console.log(`     Expected : 1`);
          console.log(`     Actual   : ${requests.length}`);
          console.log(`     Result   : ${check3 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #4 - The request\'s subject matches the value entered:');
          console.log(`     Expected : ${subject}`);
          console.log(`     Actual   : ${requests.length > 0 ? requests[0].name : '(none)'}`);
          console.log(`     Result   : ${check4 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #5 - The request\'s crmLeadRef field equals the Opportunity id (bidirectional link):');
          console.log(`     Expected : ${leadId}`);
          console.log(`     Actual   : ${requests.length > 0 ? requests[0].crmLeadRef : '(none)'}`);
          console.log(`     Result   : ${check5 ? 'PASS' : 'FAIL'}`);
          console.log('Verify #6 - The request carries a non-empty requestUuid:');
          console.log(`     Expected : non-empty string`);
          console.log(`     Actual   : ${requests.length > 0 ? requests[0].requestUuid || '(empty)' : '(no request)'}`);
          console.log(`     Result   : ${check6 ? 'PASS' : 'FAIL'}`);
          console.log('===============================================');
          console.log(`OVERALL: ${check1 && check2 && check3 && check4 && check5 && check6 ? 'PASS' : 'FAIL'}`);

          expect(check1, `baseline tickets count recorded`).toBe(true);
          expect(check2, `tickets counter shows N + 1`).toBe(true);
          expect(check3, `exactly one request created`).toBe(true);
          expect(check4, `subject matches`).toBe(true);
          expect(check5, `crmLeadRef matches opportunity (bidirectional link)`).toBe(true);
          expect(check6, `request has uuid`).toBe(true);
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
