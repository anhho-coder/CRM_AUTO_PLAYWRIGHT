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
 *  Test Case ID     : CRM-8339_1.5
 *  Jira             : CRM-11495 (Xray Manual Steps, 4 steps)
 *  Source version   : CRM-11495 updated 2026-07-09T10:37+0300 - re-check before trusting this spec
 *  Test Repository  : /CRM test/Security/CRM-8339_Pen test findings 5.9/US3 Preserve portal functionality
 *  Target           : pre-production.nakivo.site
 *  Run as           : partner portal user (reseller_gold)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-10-13
 *  Status           : SKIPPED - BLOCKED (see BLOCKED below)
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The case reviews the partner's existing support tickets in the portal Support area. The link to
 *  that area returns 404, and no partner test account has any ticket, so the case is skipped with
 *  both blockers stated rather than reported as passing against an empty screen.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-8339_1\\.5:" --project=chromium
 *
 *  ---------------------------------------------------------------------------------------------
 *  BLOCKED - two independent blockers (measured 2026-10-13)
 *  ---------------------------------------------------------------------------------------------
 *  1. THE TICKET LIST IS A BROKEN LINK. The published Helpdesk page offers "View my Tickets"
 *     pointing at /my/tickets, and that address answers HTTP 404 with the heading "Not Found".
 *     Every partner can see this link. It was reported as D.1 on CRM-12630 on 2026-09-30 with the
 *     recommendation to raise it as its own ticket; Vitalii agreed on 2026-10-09 that it should be
 *     raised separately and that it is independent of the DataTables upgrade.
 *  2. NO PARTNER TEST ACCOUNT HAS A TICKET. Counted over the six partner accounts on 2026-10-13:
 *     zero helpdesk tickets on every one of them. The case's pre-condition asks for at least three
 *     existing tickets in different stages, so even with the link fixed there would be nothing to
 *     list until tickets are seeded.
 *
 *  Both are PORTAL / test-data findings, not consequences of the DataTables upgrade - that upgrade
 *  touched only the internal back-office dashboard bundle and no customer-facing page.
 *
 *  TO UN-SKIP: once /my/tickets resolves and the partner has tickets, change `test.skip` to `test`.
 *  The steps below are already written against the real addresses.
 *
 *  ---------------------------------------------------------------------------------------------
 *  Source manual TC - CRM-11495 (verbatim, in order)
 *  ---------------------------------------------------------------------------------------------
 *  Pre-conditions:
 *    A remediated build of the Odoo Portal is deployed
 *    Log in as an active partner that already has support tickets:
 *      _ Login = an active partner
 *      _ Data  = at least 3 existing support tickets on this partner, in different stages
 *
 *  Steps to reproduce #1:
 *    1. Log in to the portal
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    2. Open the Support area
 *       Expected: (EMPTY IN JIRA - see OPEN POINTS)
 *    3. Review the list of tickets
 *       Expected: 3. All the partner's tickets are listed with subject, stage/status and
 *       last-updated; sorting and paging work
 *    4. Open one ticket
 *       Expected: 4. The ticket opens and shows its full details and message history
 *
 *  ---------------------------------------------------------------------------------------------
 *  OPEN POINTS raised by this spec (not invented answers)
 *  ---------------------------------------------------------------------------------------------
 *  1. Manual steps 1 and 2 have EMPTY Expected Results in Xray.
 *  2. The "View my Tickets" 404 needs its own bug ticket - agreed with Vitalii on CRM-12630
 *     (2026-10-09), to be raised from QA because QA holds the reproduction detail.
 *  3. Partner test accounts need seeded tickets before this case can run at all.
 * =============================================================================================
 */

const TC = 'CRM-8339_1.5';

/** The Helpdesk landing page that publishes the two links. */
const HELPDESK_PATH = 'helpdesk/';
/** What "View my Tickets" points at. HTTP 404 on 2026-10-13. */
const TICKET_LIST_PATH = 'my/tickets';

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Use a partner that already has at least 3 support tickets in different stages',
  pre2: 'Pre-condition 2: Log in to the portal (source step 1)',
  s2: 'Step 2: Open the Support area',
  s3: 'Step 3: Review the list of tickets',
  s4: 'Step 4: Open one ticket',
  verify: 'Verification',
} as const;

test.describe('CRM-8339 Security - preserve portal functionality (US3)', () => {
  test.skip(
    `${TC}: Portal Support area lists the partner's existing tickets correctly after remediation @BLOCKED-404-TICKET-LIST`,
    async ({ page }, testInfo) => {
      test.setTimeout(config.timeouts.test);
      await page.setViewportSize({ width: 1920, height: 1080 });

      const loginPage = new LoginPage(page);
      const portalPage = new PortalFunctionalityPage(page);
      const partner = users.reseller_gold;

      let helpdeskStatus = 0;
      let ticketListStatus = 0;
      let summary = await portalPage.getPortalListSummary();

      await test.step(STEP.pre1, async () => {
        console.log(`\n--- ${STEP.pre1} ---`);
        console.log(`  - Account : ${partner.username}`);
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
        helpdeskStatus = await portalPage.openPortalPath(baseUrl, HELPDESK_PATH);
        console.log(`  - ${HELPDESK_PATH} : HTTP ${helpdeskStatus}`);
        ticketListStatus = await portalPage.openPortalPath(baseUrl, TICKET_LIST_PATH);
        console.log(`  - ${TICKET_LIST_PATH} ("View my Tickets") : HTTP ${ticketListStatus}`);
        await CommonUtils.captureAndAttachScreenshot(
          page,
          testInfo,
          `${TC} - Steps to reproduce I - the Support area`
        );
      });

      await test.step(STEP.s3, async () => {
        console.log(`\n--- ${STEP.s3} ---`);
        summary = await portalPage.getPortalListSummary();
        console.log(`  - Rows in the ticket list : ${summary.bodyRows}`);
        console.log(`  - Column titles           : ${JSON.stringify(summary.columnTitles)}`);
        console.log(`  - Pager                   : "${summary.pagerText}"`);
      });

      await test.step(STEP.s4, async () => {
        console.log(`\n--- ${STEP.s4} ---`);
        console.log('  - No ticket to open while the list does not resolve.');
      });

      await test.step(STEP.verify, async () => {
        console.log(`\n--- ${STEP.verify} ---`);
        console.log('\n==================== VERIFY ====================');
        console.log('  Verify #1 - The Support ticket list resolves:');
        console.log(`     Expected : HTTP 200 for ${TICKET_LIST_PATH} (a 404 here is the broken "View my Tickets" link every partner can see)`);
        console.log(`     Actual   : HTTP ${ticketListStatus}`);
        console.log(`     Result   : ${ticketListStatus === 200 ? 'PASS' : 'FAIL'}`);
        console.log('  Verify #2 - The partner\'s tickets are listed:');
        console.log(`     Expected : at least 3 ticket rows, per the case's pre-condition`);
        console.log(`     Actual   : ${summary.bodyRows} rows`);
        console.log(`     Result   : ${summary.bodyRows >= 3 ? 'PASS' : 'FAIL'}`);
        console.log('===============================================');
        console.log('OVERALL: this case is SKIPPED - the ticket list returns 404 and no partner');
        console.log('         test account holds a ticket.');

        expect(ticketListStatus, 'the Support ticket list should resolve').toBe(200);
        expect(summary.bodyRows, 'the partner should have tickets listed').toBeGreaterThanOrEqual(3);
      });
    }
  );
});
