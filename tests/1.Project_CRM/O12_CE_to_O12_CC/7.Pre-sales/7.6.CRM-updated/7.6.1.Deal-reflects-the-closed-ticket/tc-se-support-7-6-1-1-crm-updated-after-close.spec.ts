import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.6.1.1 - CRM updated after the Pre-Sales Engineer closes the session ticket
 *                     (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.6.1.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify that once the Pre-Sales Engineer closes the SE support ticket, the CRM is updated: the
 *    ticket Close date is stamped automatically, and the Salesperson's Opportunity (deal) reflects the
 *    SE support engagement via the "Tickets" smart button. (The e-mail notification to the Salesperson /
 *    Reseller and the aggregate KPI - sessions, revenue-after-SE - are backend / aggregate side-effects
 *    and are out of black-box UI scope.)
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.6\.1\.1:" --project=chromium
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
 *  12. Observe the Close date automatically stamped on the ticket
 *  13. Login as the Salesperson = Thomas Semerich and open the Opportunity (Opp #1)
 *  14. Observe the "Tickets" smart button on the Opportunity
 *
 *  Verification Point:
 *  12. The Close date is automatically set on the ticket (the CRM recorded the closure)
 *  14. The Opportunity shows the SE support ticket linked via the "Tickets" smart button (count >= 1)
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The created Helpdesk ticket is left as a leftover (each run uses a unique Subject).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.6.1.1';

test.describe('pre-sale-7.6.1.1 - CRM updated after the Pre-Sales Engineer closes the session ticket', () => {

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

  test('pre-sale-7.6.1.1: Verify the CRM is updated after the Pre-Sales Engineer closes the session ticket (auto Close date + the deal shows the linked SE support ticket)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);
    const opportunityPage = new OpportunityPage(page);

    let closeDate = '';
    let linkedTickets = 0;

    // ===================== Pre-condition I+II (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;
    const noteText = `TEST SE Note - session completed - ${subject}`;

    // ===================== Steps to reproduce #1 (as Nick): run the session, note and close =====================
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

    await test.step('Step 12: Observe the Close date automatically stamped on the ticket', async () => {
      closeDate = await helpdeskPage.getCloseDate();
      console.log(`  - Close date on the ticket (auto): "${closeDate}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce I - ticket closed with Close date');
    });

    // ===================== Steps to reproduce #2 (as Thomas): the deal reflects the closed ticket =====================
    await test.step('Step 13: Login as the Salesperson = Thomas Semerich and open the Opportunity (Opp #1)', async () => {
      console.log('Step 13: Logging in as Thomas Semerich and opening Opp #1');
      await loginPage.logout(baseUrl).catch(() => {});
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.pageLoad);
      await page.goto('about:blank');
      await opportunityPage.openByUrl(oppUrl);
    });

    await test.step('Step 14: Observe the "Tickets" smart button on the Opportunity', async () => {
      linkedTickets = await opportunityPage.getLinkedTicketsCount();
      console.log(`  - Opportunity linked "Tickets" count: ${linkedTickets}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce II - deal shows the linked SE support ticket');
    });

    // ===================== Verification Points (12 + 14) =====================
    await test.step('VP12 + VP14: the CRM is updated (auto Close date + deal shows the linked SE support ticket)', async () => {
      const okCloseDate = !!closeDate && closeDate.trim().length > 0;
      const okLinked = linkedTickets >= 1;

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Close date automatically stamped on the ticket (CRM recorded the closure):');
      console.log(`     Expected : a non-empty Close date`);
      console.log(`     Actual   : ${closeDate || '(empty)'}`);
      console.log(`     Result   : ${okCloseDate ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - The Opportunity (deal) shows the linked SE support ticket:');
      console.log(`     Expected : "Tickets" smart button count >= 1`);
      console.log(`     Actual   : ${linkedTickets}`);
      console.log(`     Result   : ${okLinked ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${okCloseDate && okLinked ? 'PASS' : 'FAIL'} - CRM updated after the SE closed the session ticket`);

      expect(okCloseDate, `VP12: the ticket Close date should be automatically set after closing (actual: "${closeDate}")`).toBeTruthy();
      expect(okLinked, `VP14: the Opportunity "Tickets" smart button should link the SE support ticket (count >= 1, actual: ${linkedTickets})`).toBeTruthy();
    });
  });
});
