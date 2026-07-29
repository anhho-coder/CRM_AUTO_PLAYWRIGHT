import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { HomePage, LoginPage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.2.1.1 - Pre-Sales Engineer takes the SE support ticket (Support type = Online deployment session)
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.2.1.1
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify the Pre-Sales Engineer takes the Support ticket with Support type = Online deployment session.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.2\.1\.1:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition (as Thomas): build the deal-registration Internal Note #1, create Opp #1, then
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
 *
 *  Verification Point:
 *   6. There is a support ticket SE_Support_Subject#1.
 */

// Cleanup toggle: best-effort delete of the created Opportunity on teardown (true = skip).
// The created Helpdesk ticket is left as a leftover (each run uses a unique Subject).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.2.1.1';

test.describe('pre-sale-7.2.1.1 - Pre-Sales Engineer takes the SE support ticket', () => {

  let createdOppUrl: string | null = null;
  let createdTicketSubject: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
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

  test('pre-sale-7.2.1.1: Verify the Pre-Sales Engineer takes the Support ticket with Support type = Online deployment session', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const helpdeskPage = new HelpdeskPage(page);

    // ===================== Pre-condition (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;

    // ===================== Steps to reproduce =====================
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 2 - Helpdesk opened').catch(() => {});
    });

    await test.step('Step 3-4: Find the "Sales Engineers" section and click its "TICKETS" button', async () => {
      console.log('Step 3-4: Opening the Sales Engineers team TICKETS');
      await helpdeskPage.openSalesEngineersTickets();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 3-4 - Sales Engineers TICKETS opened').catch(() => {});
    });

    await test.step('Step 5: Click at "view list"', async () => {
      console.log('Step 5: Switching to list view');
      await helpdeskPage.switchToListView();
    });

    await test.step('Step 6: Search SE_Support_Subject#1 that was created in the pre-condition', async () => {
      console.log(`Step 6: Searching for SE_Support_Subject#1 = "${subject}"`);
      await helpdeskPage.searchTicket(subject);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Step 6 - Ticket searched').catch(() => {});
    });

    // ===================== Verification Point (6) =====================
    await test.step('Verification Point 6: There is a support ticket SE_Support_Subject#1', async () => {
      const visible = await helpdeskPage.isTicketVisible(subject);
      console.log(`  VP6: ticket "${subject}" visible in the Sales Engineers list: ${visible}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Ticket present in Sales Engineers list');
      expect(visible, `VP6: the support ticket SE_Support_Subject#1 ("${subject}") should appear in the Sales Engineers ticket list`).toBeTruthy();
      console.log('✅ SE support ticket is present in the Sales Engineers ticket list');
    });
  });
});
