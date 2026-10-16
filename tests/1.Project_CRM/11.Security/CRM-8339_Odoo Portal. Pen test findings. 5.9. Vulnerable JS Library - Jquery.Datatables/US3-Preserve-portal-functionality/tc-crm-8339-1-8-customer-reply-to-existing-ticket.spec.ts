import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, PortalFunctionalityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  CRM-8339 - Pen test findings 5.9 (Vulnerable JS Library - jQuery DataTables)
 *  US3 - Preserve portal functionality
 * =============================================================================================
 *  Test Case ID     : CRM-8339_1.8
 *  Jira             : CRM-11498 (Xray Manual Steps, 4 steps)
 *  Source version   : CRM-11498 updated 2026-07-09T10:37+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Status           : SKIPPED - BLOCKED (see BLOCKED below)
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The case has a customer reply to a ticket that is waiting on them and checks the ticket moves
 *  off "On Customer". With no reachable ticket list and no ticket on any partner account, there is
 *  nothing to open and reply to, so the case is skipped with the blockers stated.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.8:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  BLOCKED - three blockers (measured 2026-10-13)
 *  ---------------------------------------------------------------------------------------------
 *  1. NO REACHABLE TICKET LIST. "View my Tickets" points at /my/tickets, which answers HTTP 404.
 *     Same blocker as CRM-8339_1.5; reported as D.1 on CRM-12630 (2026-09-30) and agreed on
 *     2026-10-09 to be raised as its own ticket.
 *  2. NO TICKET ON ANY PARTNER ACCOUNT. Zero helpdesk tickets across all six partner test accounts.
 *  3. NO TICKET IN THE "On Customer" STAGE. The case needs a ticket already waiting on the
 *     customer; with no tickets at all, none is in that stage either. Creating one would mean
 *     moving a ticket through the back office as a support agent, which is a different actor from
 *     the one this case is about - the case author should say whether that setup belongs in the
 *     pre-condition.
 *
 *  All three are PORTAL / test-data findings, not consequences of the DataTables upgrade - that
 *  upgrade touched only the internal back-office dashboard bundle and no customer-facing page.
 *
 *  TO UN-SKIP: once /my/tickets resolves and the partner has a ticket in "On Customer", change
 *  `test.skip` to `test` and fill in the reply and stage checks.
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11498 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active portal user that has a ticket currently waiting on them:
 *      _ Login = an active portal user
 *      _ Existing ticket = a support ticket on this user, currently in the "On Customer" stage
 *                          (create one and move it to "On Customer")
 *      _ Reply text = Customer reply <timestamp>
 *      _ Attachment = a small file (e.g. reply-<timestamp>.png)
 *
 *  Steps to reproduce #1:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    2. Open the Support area and open the waiting ticket
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    3. Add the reply text, attach the file and submit the reply
 *       Expected: 3. The reply is accepted with a confirmation
 *    4. Check the ticket thread (portal) and the ticket stage (backend if possible)
 *       Expected: 4. The reply text and attachment appear in the ticket thread in order
 *       _ The ticket moves off "On Customer" back to an active stage for the support team
 *         (e.g. In Progress / Open)
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual steps 1 and 2 have EMPTY Expected Results in Xray.
 *  2. Step 4's expected result names "an active stage for the support team (e.g. In Progress /
 *     Open)" without pinning which one. Two different stages would both satisfy the text; the case
 *     author has to pin the stage this ticket must land in.
 *  3. The pre-condition asks for a ticket to be created and moved to "On Customer" without saying
 *     by whom - that is a support-agent action, not a customer one.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.8';

/** What "View my Tickets" points at. HTTP 404 on 2026-10-13. */
const TICKET_LIST_PATH = 'my/tickets';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Have a ticket on this portal user currently in the "On Customer" stage',
  pre2: 'Pre-condition 2: Log in to the portal (source step 1)',
  s2: 'Step 2: Open the Support area and open the waiting ticket',
  s3: 'Step 3: Add the reply text, attach the file and submit the reply',
  s4: 'Step 4: Check the ticket thread (portal) and the ticket stage (backend if possible)',
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - preserve portal functionality (US3)', () => {
  test.skip(
    `${TC}: Customer reply to an existing ticket is saved to the thread and the ticket moves off "On Customer" back to an active stage @BLOCKED-404-TICKET-LIST`,
    async ({ page }, testInfo) => {
      test.setTimeout(config.timeouts.test);
      await page.setViewportSize({ width: 1920, height: 1080 });

      const loginPage = new LoginPage(page);
      const portalPage = new PortalFunctionalityPage(page);
      const partner = users.reseller_gold;
      const runId = CommonUtils.generateUniqueId();

      let ticketListStatus = 0;

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  - Account      : ${partner.username}`);
        console.log(`  - Reply text   : Customer reply ${runId}`);
        console.log(`  - Attachment   : reply-${runId}.png`);
      });

      await test.step(STEP.pre2, async () => {
        console.log(`\n--- ${STEP.pre2} ---`);
        await loginPage.navigateTo(baseUrl);
        await loginPage.loginPortalUser(partner.username, partner.password);
        await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
        console.log(`  - Landed on : ${page.url()}`);
      });

      await test.step(STEP.s2, async () => {
        console.log(`\n--- ${STEP.s2} ---`);
        ticketListStatus = await portalPage.openPortalPath(baseUrl, TICKET_LIST_PATH);
        console.log(`  - ${TICKET_LIST_PATH} : HTTP ${ticketListStatus}`);
        await CommonUtils.captureAndAttachScreenshot(
          page,
          testInfo,
          `${TC} - Steps to reproduce I - the Support area`
        );
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        console.log('  - No ticket is open, so there is no reply box to fill.');
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log('  - No thread and no stage to read.');
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - The Support ticket list resolves so a ticket can be opened:');
        console.log(`     Expected : HTTP 200 for ${TICKET_LIST_PATH}`);
        console.log(`     Actual   : HTTP ${ticketListStatus}`);
        console.log(`     Result   : ${ticketListStatus === 200 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log('OVERALL: this case is SKIPPED - no reachable ticket list, no ticket on any');
        console.log('         partner account, and none in the "On Customer" stage.');

        expect(ticketListStatus, 'the Support ticket list should resolve').toBe(200);
      });
    }
  );
});
