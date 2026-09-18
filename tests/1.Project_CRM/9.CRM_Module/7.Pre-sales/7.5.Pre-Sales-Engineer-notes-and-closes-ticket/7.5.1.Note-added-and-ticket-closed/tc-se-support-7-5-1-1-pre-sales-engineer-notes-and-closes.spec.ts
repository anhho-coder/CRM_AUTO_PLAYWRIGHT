import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.5.1.1 - Pre-Sales Engineer writes a note, keeps the Ticket Type, and closes the ticket
 *                     (light close - type only) (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.5.1.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify the Pre-Sales Engineer, after running the session, writes a short Log note, keeps the
 *    auto-set Ticket Type (= SE: Deployment session) and closes the SE support ticket (a light close -
 *    type only). Verified: the note is on the ticket Log note, Ticket Type = SE: Deployment session,
 *    Stage = Closed and the Close date is set.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.5\.1\.1:" --project=chromium
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
 *   9. Move the ticket to the "In Progress" stage (run the session)
 *  10. On the ticket Log note, write a short note = SE_Support_Note#1
 *  11. Observe the "Ticket Type" (auto-set from Support type = Online deployment session)
 *  12. Move the ticket to the "Closed" stage (light close - type only)
 *  13. Observe the Log note, the Ticket Type, the Stage and the Close date
 *
 *  Verification Point:
 *  13.
 *    - The Log note SE_Support_Note#1 is displayed on the ticket Log note
 *    - Ticket Type = SE: Deployment session
 *    - Stage       = Closed
 *    - Close date  is set (not empty)
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The created Helpdesk ticket is left as a leftover (each run uses a unique Subject).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.5.1.1';
const EXPECTED_TICKET_TYPE = 'SE: Deployment session';
const EXPECTED_STAGE_CLOSED = 'Closed';

test.describe('pre-sale-7.5.1.1 - Pre-Sales Engineer notes and closes the SE support ticket', () => {

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

  test('pre-sale-7.5.1.1: Verify the Pre-Sales Engineer writes a note, keeps the Ticket Type and closes the SE support ticket (light close - type only)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);

    // SE_Support_Note#1 - a fresh, unique short note each run.
    let noteText = '';

    // ===================== Pre-condition I+II (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;
    noteText = `TEST SE Note - session completed - ${subject}`;

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
    });

    await test.step('Step 9: Move the ticket to the "In Progress" stage (run the session)', async () => {
      console.log('Step 9: Moving the ticket to the "In Progress" stage');
      const stage = await helpdeskPage.moveTicketToStage('In Progress');
      console.log(`  - Stage after move: "${stage}"`);
    });

    await test.step('Step 10: On the ticket Log note, write a short note = SE_Support_Note#1', async () => {
      console.log(`Step 10: Writing the Log note (SE_Support_Note#1) = "${noteText}"`);
      await helpdeskPage.postLogNote(noteText);
    });

    await test.step('Step 11: Observe the "Ticket Type" (auto-set from Support type = Online deployment session)', async () => {
      const ticketType = await helpdeskPage.getTicketType();
      console.log(`  - Ticket Type on the ticket: "${ticketType}"`);
    });

    await test.step('Step 12: Move the ticket to the "Closed" stage (light close - type only)', async () => {
      console.log('Step 12: Moving the ticket to the "Closed" stage');
      const stage = await helpdeskPage.moveTicketToStage(EXPECTED_STAGE_CLOSED);
      console.log(`  - Stage after close: "${stage}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - ticket noted and Closed');
    });

    // ===================== Verification Point (13) =====================
    await test.step('Step 13 + VP13: Observe the Log note, the Ticket Type, the Stage and the Close date', async () => {
      const noteResult = await helpdeskPage.waitForChatterContaining(noteText);
      const ticketType = await helpdeskPage.getTicketType();
      const stage = await helpdeskPage.getStageName();
      const closeDate = await helpdeskPage.getCloseDate();

      const okNote = noteResult.found;
      const okType = ticketType.includes(EXPECTED_TICKET_TYPE);
      const okStage = new RegExp(EXPECTED_STAGE_CLOSED, 'i').test(stage);
      const okCloseDate = !!closeDate && closeDate.trim().length > 0;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Log note (short note) on the ticket:');
      console.log(`     Expected : contains "${noteText}"`);
      console.log(`     Actual   : ${okNote ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${okNote ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Ticket Type (type only close):');
      console.log(`     Expected : ${EXPECTED_TICKET_TYPE}`);
      console.log(`     Actual   : ${ticketType}`);
      console.log(`     Result   : ${okType ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Stage (ticket closed):');
      console.log(`     Expected : ${EXPECTED_STAGE_CLOSED}`);
      console.log(`     Actual   : ${stage}`);
      console.log(`     Result   : ${okStage ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Close date is set:');
      console.log(`     Expected : a non-empty Close date`);
      console.log(`     Actual   : ${closeDate || '(empty)'}`);
      console.log(`     Result   : ${okCloseDate ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${okNote && okType && okStage && okCloseDate ? 'PASS' : 'FAIL'} - Pre-Sales Engineer noted and closed the ticket`);

      expect(okNote, `VP13: the Log note "${noteText}" should be on the ticket Log note`).toBeTruthy();
      expect(okType, `VP13: Ticket Type should be "${EXPECTED_TICKET_TYPE}" (actual: "${ticketType}")`).toBeTruthy();
      expect(okStage, `VP13: Stage should be "${EXPECTED_STAGE_CLOSED}" (actual: "${stage}")`).toBeTruthy();
      expect(okCloseDate, `VP13: the Close date should be set after closing (actual: "${closeDate}")`).toBeTruthy();
    });
  });
});
