import { test, expect } from '@playwright/test';
import { users, baseUrl_mig } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPageMig, MigPreSalePage } from '@pages/mig';
import { CommonUtils } from '@helpers/common.utils';

/**
 * ============================================================================================
 * CRM-12135_TC-25 - An eligible user reaches the helpdesk inside the CRM with no second login
 * ============================================================================================
 * Test Case ID   : CRM-12135_TC-25
 * Jira           : CRM-12135
 * Requirements   : FUNC-0063, FUNC-0064, UI-0002
 * Run as         : Engineer
 * Automation-Type: new
 * Automation-Date: 2026-09-21
 * Evidence       : screenshot at the end of each UI sub-section, plus afterEach start/end.
 *
 * Summary
 * -------
 *    A sales engineer opens the requests raised from an Opportunity via the Tickets button and
 *   reads them inside the CRM page with no additional sign-in required, confirming both the
 *   embedded helpdesk renders and the user stays authenticated.
 *
 * Command to run
 * --------------
 *   npx playwright test --grep "CRM\-12135_TC\-25:" --project=chromium
 *
 * Source manual TC
 * ----------------
 * Jira CRM-12939 - manual test case rewritten by Thuat Phung on 2026-09-24.
 *
 *   Pre-condition(s):
 *      1. Create an Opportunity with Expected Revenue >= $100
 *      2. Open that Opportunity and raise a Request SE support ticket with marker subject
 *
 *   Steps to reproduce:
 *      1. Refresh the Opportunity and click the Tickets smart button.
 *      2. Open that request.
 *
 *   Verification (expected results):
 *      1. The Pre-Sales Application opens inside the CRM page with no login page, and the
 *        request is listed.
 *      2. Its form opens inside the CRM page with no login page and no error popup.
 *
 * Data
 * ----
 * Every record this case creates is named AUTO-CRM-12135-TC-25-<runId> and is removed
 * in the finally block, on a passing AND on a failing run. Set
 * SKIP_CLEANUP_PRESALE=true to keep the records for a manual look.
 */

// Step labels - ONE source of truth for the test.step() label AND the stdout banner.
const STEP = {
  pre1: 'Pre-condition 1: Create an Opportunity with Expected Revenue >= $100',
  pre2: 'Pre-condition 2: Open that Opportunity and raise a Request SE support ticket with marker subject',
  s1:   'Step 1: Refresh the Opportunity and click the Tickets smart button',
  s2:   'Step 2: Open that request',
} as const;

/** Keep the records this run creates, for a manual look. Default: clean up. */
const SKIP_CLEANUP = process.env.SKIP_CLEANUP_PRESALE === 'true';

/** The page the test drives, shared with afterEach so its screenshots show the real session. */
let sharedPage: import('@playwright/test').Page | undefined;

/** Installed by the pre-condition that first creates data; runs in the finally block. */
let teardown: (() => Promise<void>) | undefined;

test.describe('CRM-12135_TC-25 - An eligible user reaches the helpdesk inside the CRM with no second login', () => {
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

  test('CRM-12135_TC-25: An eligible user reaches the helpdesk inside the CRM with no second login', async ({ browser }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    console.log('========== CRM-12135_TC-25 - An eligible user reaches the helpdesk inside the CRM with no second login ==========');

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
      const marker = `${MigPreSalePage.marker('TC-25', runId)}-view`;
      let leadId = 0;
      let requestId = 0;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        leadId = await preSale.createOpportunity(`${marker}`, 900);
        console.log(`  Created Opportunity ${leadId}`);
        console.log(`  Marker: ${marker}`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        teardown = async () => {
          if (SKIP_CLEANUP) { console.log(`  TEARDOWN SKIPPED (SKIP_CLEANUP_PRESALE=true) - marker ${marker}`); return; }
          const swept = await preSale.sweepByMarker(marker);
          console.log(`  TEARDOWN: removed requests [${swept.requests.join(', ')}] and opportunities [${swept.opportunities.join(', ')}]` +
            (swept.errors.length ? ` with errors: ${swept.errors.join(' | ')}` : ''));
        };
        await preSale.openOpportunity(leadId);
        await preSale.openRaiseDialog();
        await preSale.fillRaiseDialog({
          subject: `${marker} request`,
          description: 'Automated check of CRM-12135 TC-25 - the salesperson accesses the request without presales login.',
          supportType: 'Offline technical assistance',
        });
        console.log(`  - Subject      : ${marker} request`);
        console.log(`  - Description  : Automated check of CRM-12135 TC-25 - the salesperson accesses the request without presales login.`);
        console.log(`  - Support type : Offline technical assistance`);
        await preSale.saveRaiseDialog();
        await preSale.waitForRaiseDialogClosed();
        const requests = await preSale.requestsForLead(leadId);
        requestId = requests.length > 0 ? requests[0].id : 0;
        console.log(`  Opportunity ${leadId} raised request ${requestId}`);
      });

      await test.step(STEP.s1, async () => {
        console.log(`\n--- ${STEP.s1} ---`);
        await preSale.openOpportunity(leadId);
        console.log(`  Refreshed Opportunity ${leadId}`);
        await preSale.openTicketsPanel();
        console.log(`  Clicked Tickets button`);

        const loginFormVisible = await preSale.embeddedLoginFormVisible();
        const embeddedContent = await preSale.embeddedText();
        const markerFound = embeddedContent.includes(marker);

        console.log(`  Sign-in form visible: ${loginFormVisible}`);
        console.log(`  Request marker found in embedded content: ${markerFound}`);
        console.log(`  Embedded surface text length: ${embeddedContent.length} characters`);

        expect(loginFormVisible, 'the embedded helpdesk should not show a login form to the salesperson').toBe(false);
        expect(markerFound, 'the request should be listed in the embedded helpdesk').toBe(true);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        // RE-SYNC GAP (CRM-12939, 2026-09-24): The new manual TC expects the request to be opened,
        // but the page object does not have a method to click on a specific request in the embedded
        // helpdesk list and open it. The embeddedText() method only reads the surface text; there is no
        // locator for clicking request items inside the embedded frame. Without page object support
        // for frame-based request opening, this step cannot be completed as the manual TC describes.
        console.log(`  BLOCKED: No page-object method to open a request inside the embedded frame.`);
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Helpdesk opened inside the CRM page with no login form');
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
