import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage, SEMeetingPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.2.3.1 - A meeting created (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.2.3.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: new
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    As the Pre-Sales Engineer (Nick Luchkov), take an SE support ticket, schedule a "Schedule
 *    Support Meeting" activity and create a G2M meeting ("Meeting link #4") from the calendar;
 *    verify the Meeting Link then appears on the ticket main page ("L1 notes" table).
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.2\.3\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition I (as Thomas): build the deal-registration Internal Note #1 and create Opp #1
 *    (Opp name = TEST Support SE - <TCID> - <datetime>; Contact/Company/Email from Internal Note #1;
 *     Country = United States; State = Maryland; IP = 128.183.189.157; Create manually = FALSE;
 *     Sales Team / Salesperson cleared; CRM Developer Lead form = NAKIVO deal registration*;
 *     Assigned Partner = TEST-Reseller#Automation-Jun10; Internal Notes = Internal Note #1); SAVE;
 *     capture Opp URL #1; refresh until Company and Contact are populated.
 *
 *  Pre-condition II (as Thomas): from Opp #1, "REQUEST SE SUPPORT" -> "New Ticket" window:
 *     - Subject      = TEST Support SE - <TCID> <datetime>   (SE_Support_Subject#1)
 *     - Description   = TEST Description Support SE - <TCID> <datetime>
 *     - Support type = Online deployment session
 *     SAVE; the Opp Log note shows "A new ticket has been opened by the customer: <Subject>".
 *
 *  Pre-condition III (SKIPPED in automation - done MANUALLY before the run):
 *     Temporary getting the G2M token MANUALLY from Portal - copy Token/Refresh Token of
 *     "Meeting link #4" from Production to Pre-production. This automation assumes "Meeting link #4"
 *     is already available (per the tester's instruction to skip Pre-condition III).
 *
 *  Steps to reproduce (as the Pre-Sales Engineer = Nick Luchkov):
 *   1. Login as Pre-Sales Engineer = Nick Luchkov
 *   2. Go to Helpdesk module at Homepage
 *   3. Once the "Helpdesk" screen appears, find the "Sales Engineers" section in the middle of screen
 *   4. Click at "TICKETS" button at that section
 *   5. Click at "view list"
 *   6. Search SE_Support_Subject#1 that create in pre-condition
 *   7. Select the SE_Support_Subject#1
 *   8. Press "ASSIGN TO ME" button
 *   9. Select "Schedule activity" option on the Log note section
 *  10. On the "Odoo" window select:
 *        - Activity     = Schedule Support Meeting   (SE_Support_Activity#1)
 *        - Meeting type = Data collection
 *        - Assignee     = Nick Luchkov (left as-is: the field already defaults to the logged-in
 *                         Pre-Sales Engineer Nick Luchkov, so the automation does not re-set it)
 *  11. Press "SAVE & OPEN CALENDAR" button
 *  12. Select a range of date in the Calendar
 *  13. Once the "Create: Meetings" window appears:
 *        - Starting at       = current date time + 5 minutes
 *        - Duration          = 15 minutes
 *        - Meeting Platform  = G2M
 *        - G2M Meeting room  = Meeting link #4
 *        - Customer's Timezone = Any value
 *  14. Press "SAVE" button
 *  15. Exit the "Create: Meetings" window
 *  16. Back to Support ticket
 *  17. Observe the Meeting Link is appeared at the main page of Support ticket
 *
 *  Verification Point:
 *   17. The Meeting Link is appeared at the main page of Support ticket (the "L1 notes" table shows
 *       a row with a Meeting Link, Meeting Client Name = "Meeting link #4", Meeting Type = "Data collection").
 */

// Cleanup toggles: archive the created SE Support ticket + delete the created Opportunity on teardown.
// (Helpdesk tickets can't be deleted, only archived; each run uses a unique Subject. The linked
//  calendar meeting is a minor leftover - there is no clean UI handle to delete it here.)
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.2.3.1';

test.describe('pre-sale-7.2.3.1 - A meeting created from the SE support ticket', () => {

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
    // Re-login as admin (Thomas/Nick have no delete rights): archive the SE Support ticket and delete
    // the Opp in a single, time-bounded admin session.
    await deleteCreatedSESupportTicketAndOppAsAdmin(
      page,
      { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl },
      { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP },
      testInfo
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('pre-sale-7.2.3.1: Verify the Pre-Sales Engineer sees a meeting from the Support ticket with Support type = Online deployment session', async ({ page }, testInfo) => {
    // Long multi-actor flow (Thomas creates Opp+ticket -> Nick schedules a G2M meeting via the calendar
    // -> re-open ticket -> poll the "L1 notes" write-back). Use the wider SE-meeting timeout.
    test.setTimeout(config.timeouts.seMeetingTest);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const seMeetingPage = new SEMeetingPage(page);

    // ===================== Pre-condition I + II (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;

    // ===================== Pre-condition III (SKIPPED - manual G2M token copy) =====================
    await test.step('Pre-condition III (SKIPPED in automation): manual G2M Token/Refresh-Token copy from Production to Pre-production', async () => {
      console.log('Pre-condition III: SKIPPED - the temporary G2M token is copied MANUALLY from Portal before the run.');
      console.log('  Assuming "Meeting link #4" is available on Pre-production (per the tester instruction).');
    });

    // ===================== Steps to reproduce (as Nick Luchkov) =====================
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
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.elementVisibility);
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

    await test.step('Step 6: Search SE_Support_Subject#1 that create in pre-condition', async () => {
      console.log(`Step 6: Searching for SE_Support_Subject#1 = "${subject}"`);
      await helpdeskPage.searchTicket(subject);
    });

    await test.step('Step 7: Select the SE_Support_Subject#1', async () => {
      console.log('Step 7: Opening the ticket');
      await helpdeskPage.openTicket(subject);
    });

    await test.step('Step 8: Press "ASSIGN TO ME" button', async () => {
      console.log('Step 8: Clicking ASSIGN TO ME');
      await helpdeskPage.clickAssignToMe();
    });

    await test.step('Step 9: Select "Schedule activity" option on the Log note section', async () => {
      console.log('Step 9: Opening the Schedule Activity wizard from the Log note section');
      await seMeetingPage.clickScheduleActivity();
    });

    await test.step('Step 10: On the "Odoo" window select the Activity / Meeting type / Assignee', async () => {
      console.log('Step 10: Filling the Schedule Activity wizard:');
      console.log('  - Activity     : Schedule Support Meeting');
      console.log('  - Meeting type : Data collection');
      console.log('  - Assignee     : Nick Luchkov (left as default - not re-set)');
      await seMeetingPage.fillScheduleMeetingActivity('Schedule Support Meeting', 'Data collection');
    });

    await test.step('Step 11: Press "SAVE & OPEN CALENDAR" button', async () => {
      console.log('Step 11: Clicking SAVE & OPEN CALENDAR');
      await seMeetingPage.clickSaveAndOpenCalendar();
    });

    await test.step('Step 12: Select a range of date in the Calendar', async () => {
      console.log('Step 12: Selecting a date on the calendar (opens the Create: Meetings window)');
      await seMeetingPage.pickDateAndOpenCreateMeeting();
    });

    await test.step('Step 13: On the "Create: Meetings" window set Starting at / Duration / Meeting Platform / G2M Meeting room / Customer\'s Timezone', async () => {
      console.log('Step 13: Filling the Create: Meetings window:');
      console.log('  - Starting at         : current date time + 5 minutes');
      console.log('  - Duration            : 15 minutes');
      console.log('  - Meeting Platform    : G2M');
      console.log('  - G2M Meeting room    : Meeting link #4');
      console.log("  - Customer's Timezone : America/New_York (any value)");
      await seMeetingPage.fillCreateMeeting({
        subject,
        startPlusMinutes: 5,
        platform: 'G2M',
        g2mRoom: 'Meeting link #4',
        durationMinutes: '15',
        timezone: 'America/New_York',
        ticketName: subject,
      });
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 13 - Create Meetings form filled').catch(() => {});
    });

    await test.step('Step 14: Press "SAVE" button', async () => {
      console.log('Step 14: Saving the Create: Meetings window');
      await seMeetingPage.saveMeeting();
    });

    await test.step('Step 15-16: Exit the "Create: Meetings" window and go back to the Support ticket', async () => {
      console.log('Step 15-16: Returning to the Support ticket (re-login as Nick -> Helpdesk -> open ticket)');
      // The Create: Meetings window closes on Save (step 15). Re-open the ticket FORM by re-logging in
      // as Nick (a FRESH session lands on the apps-home) and using the SAME proven chain that rendered
      // the ticket form in the main flow: navigateToHelpdesk -> Sales Engineers TICKETS -> list -> search
      // -> open. In-app re-navigation AFTER the calendar flow does NOT reliably render the ticket form on
      // this Odoo, and a direct ticket-URL load renders the list - a fresh session avoids both.
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.pre_sales_engineer.username, users.pre_sales_engineer.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.elementVisibility);
      await helpdeskPage.navigateToHelpdesk();
      await helpdeskPage.openSalesEngineersTickets();
      await helpdeskPage.switchToListView();
      await helpdeskPage.searchTicket(subject);
      await helpdeskPage.openTicket(subject);
    });

    // ===================== Verification Point (17) =====================
    await test.step('Step 17: Observe the Meeting Link is appeared at the main page of Support ticket', async () => {
      console.log('Step 17: Verifying the Meeting Link on the ticket main page ("L1 notes" table)');

      const rowAppeared = await helpdeskPage.waitForMeetingInfoRow(3);
      const row = rowAppeared
        ? await helpdeskPage.getFirstMeetingInfoRow()
        : { meetingLink: '', meetingTime: '', meetingClientName: '', meetingType: '', state: '' };

      const hasMeetingLink = /https?:\/\/\S+/i.test(row.meetingLink) || row.meetingLink.trim().length > 0;
      const clientNameOk = row.meetingClientName.includes('Meeting link #4');
      const meetingTypeOk = row.meetingType.includes('Data collection');
      const overall = rowAppeared && hasMeetingLink && clientNameOk && meetingTypeOk;

      // ---- REQUIREMENT #4: explicit VERIFY block (log BEFORE asserting) ----
      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - An "L1 notes" meeting row appeared on the ticket:');
      console.log('     Expected : at least 1 row');
      console.log(`     Actual   : ${rowAppeared ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result   : ${rowAppeared ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Meeting Link is present (a meeting URL):');
      console.log('     Expected : non-empty Meeting Link (e.g. https://meet.goto.com/...)');
      console.log(`     Actual   : ${row.meetingLink ? row.meetingLink : 'NOT FOUND'}`);
      console.log(`     Result   : ${hasMeetingLink ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Meeting Client Name matches the G2M room:');
      console.log('     Expected : Meeting link #4');
      console.log(`     Actual   : ${row.meetingClientName || '(empty)'}`);
      console.log(`     Result   : ${clientNameOk ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #4 - Meeting Type:');
      console.log('     Expected : Data collection');
      console.log(`     Actual   : ${row.meetingType || '(empty)'}`);
      console.log(`     Result   : ${meetingTypeOk ? 'PASS' : 'FAIL'}`);
      console.log(`  (info) Meeting Time  : ${row.meetingTime || '(empty)'}`);
      console.log(`  (info) State         : ${row.state || '(empty)'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${overall ? 'PASS' : 'FAIL'} - Meeting Link ${overall ? 'appeared' : 'did NOT appear'} on the ticket main page`);
      if (!rowAppeared) {
        console.log('NOTE: the "L1 notes" table rendered but is EMPTY (0 rows). The L1-notes row is generated by');
        console.log('      the G2M integration, which needs the token from Pre-condition #3 (the manual G2M');
        console.log('      Token/Refresh-Token copy) that this automation SKIPS. Refresh that token on the');
        console.log('      "Meeting link #4" record before an unattended run so the meeting (and its link) posts.');
      }

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Meeting Link on ticket');

      expect(rowAppeared, 'Step 17: the "L1 notes" meeting table should show a row for the created meeting').toBeTruthy();
      expect(hasMeetingLink, `Step 17: the Meeting Link should appear on the ticket (got "${row.meetingLink}")`).toBeTruthy();
      expect(clientNameOk, `Step 17: the Meeting Client Name should be "Meeting link #4" (got "${row.meetingClientName}")`).toBeTruthy();
      expect(meetingTypeOk, `Step 17: the Meeting Type should be "Data collection" (got "${row.meetingType}")`).toBeTruthy();
      console.log('✅ The Meeting Link appeared at the main page of the Support ticket');
    });
  });
});
