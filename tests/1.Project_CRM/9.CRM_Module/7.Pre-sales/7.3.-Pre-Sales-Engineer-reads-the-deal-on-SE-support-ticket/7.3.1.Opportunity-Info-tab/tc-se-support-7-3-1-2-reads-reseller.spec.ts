import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, HelpdeskPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { createOppAndRequestSESupportAsThomas, assignAndOpenOpportunityInfoTabAsNick, deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.3.1.2 - Pre-Sales Engineer reads the deal on SE support ticket: value of "Reseller"
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.3.1.2
 *  Jira:            CRM-9976 (O12 CE to O12 CC)
 *  Automation-Type: refactored
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify the Pre-Sales Engineer reads the deal on the SE support ticket with value of "Reseller".
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.3\.1\.2:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition (as Thomas): build the deal-registration Internal Note #1 (Partner Company Name =
 *    TEST-Reseller#Automation-Jun10, called Reseller_Name#1), create Opp #1, then "REQUEST SE SUPPORT"
 *    -> "New Ticket" (Subject = SE_Support_Subject#1, Description, Support type = Online deployment
 *    session) -> SAVE; the Opp Log note confirms the ticket was opened.
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
 *   9. Press "Opportunity Info" tab
 *   10. Observe the value of "Reseller"
 *
 *  Verification Point:
 *   10. The value of Reseller = value of Reseller_Name#1
 */

const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.3.1.2';

test.describe('pre-sale-7.3.1.2 - Pre-Sales Engineer reads the deal on SE support ticket (Reseller)', () => {

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

  test('pre-sale-7.3.1.2: Verify the Pre-Sales Engineer reads the deal on SE support ticket with value of "Reseller"', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const helpdeskPage = new HelpdeskPage(page);

    // ===================== Pre-condition (as Thomas): create Opp + request the SE support ticket =====================
    const { oppUrl, subject, resellerName } = await createOppAndRequestSESupportAsThomas(page, TC_ID, testInfo);
    createdOppUrl = oppUrl;
    createdTicketSubject = subject;

    // ===================== Steps 1-9 (as Nick): open the ticket + Opportunity Info tab =====================
    await assignAndOpenOpportunityInfoTabAsNick(page, subject, testInfo);

    // ===================== Step 10 + Verification Point =====================
    await test.step('Step 10 + VP: Observe the value of "Reseller" (= Reseller_Name#1)', async () => {
      const reseller = await helpdeskPage.getFieldValueByName('lead_reseller_id');
      console.log(`  VP10: Opportunity Info "Reseller" = "${reseller}" | expected Reseller_Name#1 = "${resellerName}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Reseller value');
      expect(reseller, `VP10: the ticket "Reseller" should equal Reseller_Name#1 ("${resellerName}")`).toContain(resellerName);
      console.log('✅ Reseller on the SE support ticket matches Reseller_Name#1');
    });
  });
});
