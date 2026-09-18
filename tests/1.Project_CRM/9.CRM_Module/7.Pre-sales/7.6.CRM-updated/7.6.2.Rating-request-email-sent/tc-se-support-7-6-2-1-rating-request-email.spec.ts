import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.6.2.1 - Rating request e-mail is sent once the Pre-Sales Engineer closes the ticket
 *                     (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.6.2.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify that once the Pre-Sales Engineer closes the SE support ticket, the CRM sends the customer a
 *    Rating request e-mail: a "Note" is logged on the ticket chatter containing the message
 *    "Thank you in advance for sharing your feedback with us!" (Customer Success Team / NAKIVO Inc.).
 *    This is the black-box, UI-visible signal that the feedback/rating request went out to the customer.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.6\.2\.1:" --project=chromium
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
 *  11. Move the ticket to the "Closed" stage (light close - type only)
 *  12. Observe the ticket chatter shows the Rating request e-mail Note to the customer
 *      ("Thank you in advance for sharing your feedback with us!")
 *
 *  Verification Point:
 *  12. The ticket chatter contains the Rating request e-mail Note with the message
 *      "Thank you in advance for sharing your feedback with us!" (the CRM sent the feedback request)
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The created Helpdesk ticket is left as a leftover (each run uses a unique Subject).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.6.2.1';

// The Rating request e-mail message logged on the ticket chatter once the ticket is closed.
const RATING_REQUEST_MESSAGE = 'Thank you in advance for sharing your feedback with us!';

test.describe('pre-sale-7.6.2.1 - Rating request e-mail is sent after the Pre-Sales Engineer closes the ticket', () => {

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

  test('pre-sale-7.6.2.1: Verify the CRM sends the Rating request e-mail after the Pre-Sales Engineer closes the ticket (chatter Note "Thank you in advance for sharing your feedback with us!")', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);

    let ratingFound = false;

    // ===================== Pre-condition I+II (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;
    const noteText = `TEST SE Note - session completed - ${subject}`;

    // ===================== Steps to reproduce (as Nick): run the session, note and close =====================
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
      await helpdeskPage.moveTicketToStage('In Progress');
    });

    await test.step('Step 10: On the ticket Log note, write a short note = SE_Support_Note#1', async () => {
      console.log(`Step 10: Writing the Log note (SE_Support_Note#1) = "${noteText}"`);
      await helpdeskPage.postLogNote(noteText);
    });

    await test.step('Step 11: Move the ticket to the "Closed" stage (light close - type only)', async () => {
      console.log('Step 11: Moving the ticket to the "Closed" stage');
      const stage = await helpdeskPage.moveTicketToStage('Closed');
      console.log(`  - Stage after close: "${stage}"`);
    });

    await test.step('Step 12: Observe the Rating request e-mail Note on the ticket chatter', async () => {
      console.log(`Step 12: Waiting for the Rating request e-mail message on the ticket chatter: "${RATING_REQUEST_MESSAGE}"`);
      const result = await helpdeskPage.waitForChatterContaining(
        RATING_REQUEST_MESSAGE,
        6,
        CommonUtils.waitTimes.long
      );
      ratingFound = result.found;
      console.log(`  - Rating request message found: ${ratingFound}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 12 - Rating request e-mail Note on the ticket chatter');
    });

    // ===================== Verification Point (12) =====================
    await test.step('VP12: the CRM sent the Rating request e-mail (chatter Note "Thank you in advance for sharing your feedback with us!")', async () => {
      console.log('==================== VERIFY ====================');
      console.log('  Verify - Rating request e-mail logged on the ticket chatter after close:');
      console.log(`     Expected : a Note containing "${RATING_REQUEST_MESSAGE}"`);
      console.log(`     Actual   : ${ratingFound ? 'message present' : 'message NOT found'}`);
      console.log(`     Result   : ${ratingFound ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${ratingFound ? 'PASS' : 'FAIL'} - Rating request e-mail sent after the SE closed the ticket`);

      expect(ratingFound, `VP12: the ticket chatter should contain the Rating request e-mail Note "${RATING_REQUEST_MESSAGE}" after the ticket is closed`).toBeTruthy();
    });
  });
});
