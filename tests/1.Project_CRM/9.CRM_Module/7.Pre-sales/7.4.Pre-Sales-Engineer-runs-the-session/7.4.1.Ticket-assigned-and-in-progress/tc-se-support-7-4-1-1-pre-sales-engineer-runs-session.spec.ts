import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.4.1.1 - Pre-Sales Engineer runs the session (takes the ticket + moves it In Progress)
 *                     (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.4.1.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify the Pre-Sales Engineer runs the session on the SE support ticket: he takes the ticket
 *    (ASSIGN TO ME) and moves it to the "In Progress" stage. Verified: Assigned to = Nick Luchkov
 *    and Stage = In Progress.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.4\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition I+II (as Thomas): build the deal-registration Internal Note #1, create Opp #1, then
 *    "REQUEST SE SUPPORT" -> "New Ticket" (Subject = SE_Support_Subject#1, Description,
 *    Support type = Online deployment session) -> SAVE; the Opp Log note shows
 *    "A new ticket has been opened by the customer: <SE_Support_Subject#1>".
 *
 *  Steps to reproduce:
 *   1. Login as Pre-Sales Engineer = Nick Luchkov
 *   2. Go to Helpdesk module at Homepage
 *   3. Once the "Helpdesk" screen appears, find the "Sales Engineers" section in the middle of screen
 *   4. Click at "TICKETS" button at that section
 *   5. Click at "view list"
 *   6. Search SE_Support_Subject#1 that was created in the pre-condition
 *   7. Select the SE_Support_Subject#1
 *   8. Press "ASSIGN TO ME" button
 *   9. Move the ticket to the "In Progress" stage (start running the session)
 *  10. Observe the "Assigned to" and the Stage
 *
 *  Verification Point:
 *  10.
 *    - Assigned to = Nick Luchkov
 *    - Stage       = In Progress
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The created Helpdesk ticket is left as a leftover (each run uses a unique Subject).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.4.1.1';
const EXPECTED_ASSIGNEE = 'Nick Luchkov';
const EXPECTED_STAGE = 'In Progress';

test.describe('pre-sale-7.4.1.1 - Pre-Sales Engineer runs the session (assign + In Progress)', () => {

  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    // Re-login as admin (Thomas has no delete rights): archive the SE Support ticket (tickets can't be
    // deleted, only archived) and delete the Opp, in one session.
    await deleteCreatedSESupportTicketAndOppAsAdmin(
      page,
      { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl },
      { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP },
      testInfo
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('pre-sale-7.4.1.1: Verify the Pre-Sales Engineer runs the session - takes the ticket (Assign To Me) and moves it to In Progress', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);

    // ===================== Pre-condition I+II (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;

    // ===================== Steps to reproduce (as Nick) =====================
    await test.step('Step 1: Login as Pre-Sales Engineer = Nick Luchkov', async () => {
      console.log('Step 1: Logging in as Nick Luchkov (Pre-Sales Engineer)');
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.pre_sales_engineer.username, users.pre_sales_engineer.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Nick Luchkov');
    });

    await test.step('Step 2: Go to Helpdesk module at Homepage', async () => {
      console.log('Step 2: Opening the Helpdesk module');
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await helpdeskPage.navigateToHelpdesk();
    });

    await test.step('Step 3-4: Find the "Sales Engineers" section and click its "TICKETS" button', async () => {
      console.log('Step 3-4: Opening the Sales Engineers team TICKETS');
      await helpdeskPage.openSalesEngineersTickets();
    });

    await test.step('Step 5: Click at "view list"', async () => {
      console.log('Step 5: Switching to list view');
      await helpdeskPage.switchToListView();
    });

    await test.step('Step 6: Search SE_Support_Subject#1 that was created in the pre-condition', async () => {
      console.log(`Step 6: Searching for SE_Support_Subject#1 = "${subject}"`);
      await helpdeskPage.searchTicket(subject);
      const visible = await helpdeskPage.isTicketVisible(subject);
      expect(visible, `Step 6: the ticket "${subject}" should appear before opening it`).toBeTruthy();
    });

    await test.step('Step 7: Select (open) the SE_Support_Subject#1 ticket', async () => {
      console.log('Step 7: Opening the ticket');
      await helpdeskPage.openTicket(subject);
    });

    await test.step('Step 8: Press "ASSIGN TO ME" button', async () => {
      console.log('Step 8: Clicking ASSIGN TO ME');
      await helpdeskPage.clickAssignToMe();
      const assignee = await helpdeskPage.getAssignedTo();
      console.log(`  - Assigned to (after ASSIGN TO ME): "${assignee}"`);
    });

    await test.step('Step 9: Move the ticket to the "In Progress" stage (start running the session)', async () => {
      console.log('Step 9: Moving the ticket to the "In Progress" stage');
      const stage = await helpdeskPage.moveTicketToStage(EXPECTED_STAGE);
      console.log(`  - Stage after move: "${stage}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - ticket assigned and In Progress');
    });

    // ===================== Verification Point (10) =====================
    await test.step('Step 10 + VP10: Observe the "Assigned to" and the Stage', async () => {
      const assignee = await helpdeskPage.getAssignedTo();
      const stage = await helpdeskPage.getStageName();
      const okAssignee = assignee.includes(EXPECTED_ASSIGNEE);
      const okStage = new RegExp(EXPECTED_STAGE, 'i').test(stage);

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Assigned to (Pre-Sales Engineer took the ticket):');
      console.log(`     Expected : ${EXPECTED_ASSIGNEE}`);
      console.log(`     Actual   : ${assignee}`);
      console.log(`     Result   : ${okAssignee ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Stage (session is being run / In Progress):');
      console.log(`     Expected : ${EXPECTED_STAGE}`);
      console.log(`     Actual   : ${stage}`);
      console.log(`     Result   : ${okStage ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${okAssignee && okStage ? 'PASS' : 'FAIL'} - Pre-Sales Engineer runs the session (assigned + In Progress)`);

      expect(okAssignee, `VP10: "Assigned to" should be "${EXPECTED_ASSIGNEE}" (actual: "${assignee}")`).toBeTruthy();
      expect(okStage, `VP10: Stage should be "${EXPECTED_STAGE}" (actual: "${stage}")`).toBeTruthy();
    });
  });
});
