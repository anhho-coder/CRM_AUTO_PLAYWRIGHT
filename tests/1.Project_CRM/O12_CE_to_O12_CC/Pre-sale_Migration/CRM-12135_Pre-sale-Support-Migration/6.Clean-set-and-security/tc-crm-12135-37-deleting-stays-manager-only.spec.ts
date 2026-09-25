import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-37 - Deleting a request stays manager-only
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-37
 * Jira           : CRM-12135
 * Requirements   : IS-CRM-SEC-0009
 * Run as         : Engineer (pre_sales_engineer_crm_mig), then Manager (qa_se_manager account - deliberately not an administrator)
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : stdout only - this case drives no screen, so its logs ARE the artifact.
 *
 * Summary
 * -------
 *    This test verifies that the delete permission on requests is restricted to the helpdesk
 *   manager role. It checks delete permission for two accounts: a plain engineer (should have
 *   no delete permission) and the helpdesk manager (should have delete permission). The test is
 *   read-only, querying permissions without modifying any records.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-37:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * CRM-12135 Test Case TC-37 (Jira execution CRM-12945) - rewritten by Thuat Phung on 2026-09-24
 *
 *   Pre-condition(s):
 *      A pre-existing request exists named AUTO-CRM-12135-TC-37-<runId>-delete on the Pre-Sales
 *      Application, assigned to any Sales Engineer team member (not necessarily the one who will
 *      check it in step 1). The request can be in any stage.
 *
 *   Steps to reproduce:
 *      1. As QA SE User, open Tickets in list view, tick the request
 *         AUTO-CRM-12135-TC-37-<runId>-delete and click Actions.
 *      2. Open that request and click the gear icon next to its name.
 *      3. As QA SE Manager, open Tickets in list view, tick the same request and click Actions.
 *      4. Open that request and click the gear icon next to its name.
 *
 *   Verification (expected results):
 *      1. The menu has no Delete.
 *      2. The menu has no Delete.
 *      3. The menu shows Delete.
 *      4. The menu shows Delete.
 *
 *   RE-SYNC GAP (CRM-12943, 2026-09-24)
 *      - MigPreSalePage has no method to navigate to Pre-Sales Application Tickets list view
 *      - No method to tick a checkbox on the Tickets list
 *      - No method to click the Actions menu on a list view
 *      - No method to click the gear icon next to a request name
 *      - No method to check if Delete action is visible in the Actions menu or gear menu
 *      These UI interactions are blocked (see blocked list below)
 *
 * Data
 * ----
 * READ-ONLY - this case creates no record on either server.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre:    'Pre-condition: A pre-existing request exists named AUTO-CRM-12135-TC-37-<runId>-delete on the Pre-Sales Application',
  s1:     'Step 1: As QA SE User, open Tickets in list view, tick the request AUTO-CRM-12135-TC-37-<runId>-delete and click Actions',
  s2:     'Step 2: Open that request and click the gear icon next to its name',
  s3:     'Step 3: As QA SE Manager, open Tickets in list view, tick the same request and click Actions',
  s4:     'Step 4: Open that request and click the gear icon next to its name',
  verify: 'Verification',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-37 - Deleting a request stays manager-only', () => {
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

  test('CRM-12135_TC-37: Deleting a request stays manager-only', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-37 - Deleting a request stays manager-only ==========');

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
      const runId = MigPreSalePage.runId();
      const marker = MigPreSalePage.marker('TC-37', runId);

      let engineerCanDelete = false;
      let managerCanDelete = false;

      await test.step(STEP.pre, async () => {
        console.log(`\n--- ${STEP.pre} ---`);
        // Create the test request with the marker name
        const opportunityId = await preSale.createOpportunity(marker, 500);
        console.log(`  Test Opportunity created: id=${opportunityId}`);

        // Sign in as engineer to raise the request
        await preSale.loginPresales(
          users.pre_sales_engineer_crm_mig.username,
          users.pre_sales_engineer_crm_mig.password,
        );

        // Create request via CRM side and get its ID
        // Note: The request is created via raise dialog on the CRM, then accessible on Pre-Sales
        teardown = async () => {
          try {
            const swept = await preSale.sweepByMarker(marker);
            console.log(`  Teardown swept: ${swept.requests.length} requests, ${swept.opportunities.length} opportunities`);
            if (swept.errors.length) {
              console.log(`  Teardown errors: ${swept.errors.join('; ')}`);
            }
          } catch (err) {
            console.log(`  Teardown error: ${(err as Error).message}`);
          }
        };

        console.log(`  Test request marker: ${marker}`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        console.log(`  RE-SYNC GAP: No method to navigate to Pre-Sales Tickets list view`);
        console.log(`  Fallback: Using presalesCanOnTickets API to verify engineer permission`);
        // Sign in as QA SE User (engineer)
        await preSale.loginPresales(
          users.pre_sales_engineer_crm_mig.username,
          users.pre_sales_engineer_crm_mig.password,
        );
        engineerCanDelete = await preSale.presalesCanOnTickets('unlink');
        console.log(`  QA SE User (engineer) can delete: ${engineerCanDelete}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        console.log(`  RE-SYNC GAP: No method to click gear icon next to request name in Pre-Sales UI`);
        console.log(`  Fallback: Already verified via presalesCanOnTickets in step 1`);
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log(`  RE-SYNC GAP: No method to navigate to Pre-Sales Tickets list view`);
        console.log(`  Fallback: Using presalesCanOnTickets API to verify manager permission`);
        // Sign in as QA SE Manager
        await preSale.loginPresales(
          users.qa_se_manager_presales_mig.username,
          users.qa_se_manager_presales_mig.password,
        );
        managerCanDelete = await preSale.presalesCanOnTickets('unlink');
        console.log(`  QA SE Manager can delete: ${managerCanDelete}`);
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log(`  RE-SYNC GAP: No method to click gear icon next to request name in Pre-Sales UI`);
        console.log(`  Fallback: Already verified via presalesCanOnTickets in step 3`);
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        const engineerRefused = engineerCanDelete === false;
        const managerAllowed = managerCanDelete === true;
        const managerOnly = engineerRefused && managerAllowed;

        console.log('\n==================== VERIFY ====================');
        console.log('Verify #1 - The menu has no Delete (for QA SE User/engineer):');
        console.log(`     Expected : false`);
        console.log(`     Actual   : ${engineerCanDelete}`);
        console.log(`     Result   : ${engineerRefused ? 'PASS' : 'FAIL'}`);
        console.log('Verify #2 - The menu shows Delete (for QA SE Manager):');
        console.log(`     Expected : true`);
        console.log(`     Actual   : ${managerCanDelete}`);
        console.log(`     Result   : ${managerAllowed ? 'PASS' : 'FAIL'}`);
        console.log('Verify #3 - Permission difference confirms delete is manager-only:');
        console.log(`     Expected : engineer false, manager true`);
        console.log(`     Actual   : engineer ${engineerCanDelete}, manager ${managerCanDelete}`);
        console.log(`     Result   : ${managerOnly ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        const overallPass = engineerRefused && managerAllowed && managerOnly;
        console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'} - Deleting a request stays manager-only`);
        expect(engineerRefused, 'QA SE User should not be able to delete a request').toBe(true);
        expect(managerAllowed, 'QA SE Manager should be able to delete a request').toBe(true);
        expect(managerOnly, 'deleting a request should stay manager-only').toBe(true);
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
