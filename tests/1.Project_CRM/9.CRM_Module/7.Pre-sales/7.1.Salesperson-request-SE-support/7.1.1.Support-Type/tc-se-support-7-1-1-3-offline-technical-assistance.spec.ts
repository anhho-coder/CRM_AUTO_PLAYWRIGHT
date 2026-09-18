import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage, SESupportPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas } from '@helpers/uc-a-2-deal-registration.helper';
import { deleteCreatedSESupportTicketAndOppAsAdmin } from '@helpers/uc-presales-se-support.helper';

/**
 * ============================================================================================
 *  pre-sale-7.1.1.3 - Salesperson requests SE support with Support type = Offline technical assistance
 * --------------------------------------------------------------------------------------------
 *  Test Case ID:    pre-sale-7.1.1.3
 *  Jira:            (none - authored from an inline manual TC)
 *  Automation-Type: new
 *  Automation-Date: 2026-07-28
 * --------------------------------------------------------------------------------------------
 *  Summary:
 *    Verify the Salesperson can select Support type = Offline technical assistance when requesting SE support.
 *
 *  Command to run:
 *    npx playwright test --grep "pre-sale-7\.1\.1\.3:" --project=chromium
 * ============================================================================================
 *
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition #1 - the deal-registration Internal Note #1:
 *    Build Internal Note #1 from the deal-registration template, filling the <...> placeholders with
 *    fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - IP                         = 128.183.189.157
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Pre-condition #2 - create the Opp (logged in as the salesperson Thomas):
 *   1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *          - Opp name                 = TEST Support SE - <Test Case ID> - <current date time>
 *          - Contact name             = Name from Internal Note #1
 *          - CompanyName              = Company Name Lead 1
 *          - Email                    = Email from Internal Note #1
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = 128.183.189.157
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *        then CRM Developer Lead form = NAKIVO deal registration*; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *        Internal Notes = Internal Note #1; SAVE; capture Opp URL #1;
 *   9.   Refresh until Company and Contact are populated in Opp #1 (within ~10s).
 *
 *  Steps to reproduce (still logged in as Thomas):
 *   1. Open Opp #1
 *   2. Click "REQUEST SE SUPPORT" button to create a new SE Support
 *   3. On the "New Ticket" window, set:
 *        - Subject      = TEST Support SE - <Test Case ID> <current date time>
 *        - Description  = TEST Description Support SE - <Test Case ID> <current date time>
 *        - Support type = Offline technical assistance
 *   4. Press "SAVE" button
 *   5. On the Opportunity Log note, wait for the message to be displayed:
 *        "A new ticket has been opened by the customer: <name of Subject> created above"
 *
 *  Verification Point:
 *   5. The message "A new ticket has been opened by the customer: <name of Subject>" appears.
 *
 *  Teardown:
 *   - Log in as Admin (Thomas has no delete rights). Helpdesk tickets cannot be deleted, so ARCHIVE the
 *     SE Support ticket (Sales Engineers list -> search Subject -> tick checkbox -> Action > Archive);
 *     then delete the created Opportunity. Both in one admin session.
 */

// Cleanup toggles: best-effort delete of the created records on teardown (true = skip).
const SKIP_CLEANUP_OPP = false;
const SKIP_CLEANUP_TICKET = false;

const TC_ID = 'pre-sale-7.1.1.3';
const SUPPORT_TYPE = 'Offline technical assistance';

test.describe('pre-sale-7.1.1.3 - Salesperson requests SE support (Support type = Offline technical assistance)', () => {

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
    // Re-login as admin (Thomas has no delete rights) and delete the SE Support ticket + the Opp in one session.
    await deleteCreatedSESupportTicketAndOppAsAdmin(
      page,
      { ticketSubject: createdTicketSubject, oppUrl: createdOppUrl },
      { ticket: SKIP_CLEANUP_TICKET, opp: SKIP_CLEANUP_OPP },
      testInfo
    );
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('pre-sale-7.1.1.3: Verify the Salesperson can select Support type = Offline technical assistance', async ({ page }, testInfo) => {
    // Extra headroom over the standard test timeout for the admin re-login + two-record teardown.
    test.setTimeout(config.timeouts.test + CommonUtils.waitTimes.pageLoad);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);
    const seSupportPage = new SESupportPage(page);

    // Fresh, unique deal-registration data each run (REQUIREMENT #2).
    const { companyEmail, leadName, currentDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST Support SE - ${TC_ID} - ${currentDateTime}`;
    const ticketSubject = `TEST Support SE - ${TC_ID} ${currentDateTime}`;
    const ticketDescription = `TEST Description Support SE - ${TC_ID} ${currentDateTime}`;

    // ===================== Pre-condition #1: build Internal Note #1 =====================
    await test.step('Pre-condition #1: Prepare the deal-registration Internal Note #1 (edit the <...> placeholders)', async () => {
      console.log('Pre-condition #1: Internal Note #1 prepared with fresh dynamic values');
      console.log(`  - Opp name      : ${oppName}`);
      console.log(`  - Name          : ${leadName}`);
      console.log(`  - Email         : ${companyEmail}`);
      console.log(`  - Company       : Company Name Lead 1`);
      console.log(`  - IP            : 128.183.189.157`);
      console.log(`  - Partner       : TEST-Reseller#Automation-Jun10`);
      console.log(`  - Country       : United States`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Internal Note prepared').catch(() => {});
    });

    // ============ Pre-condition #2 - Steps 1-8 (+ capture Opp URL #1): create the Opp as Thomas ============
    // Grouped via the shared helper (the contiguous create block is setup, not what this TC verifies).
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #2',
    });

    // Pre-condition #2 - Step 9: refresh until Company AND Contact populate (async partner creation).
    await test.step('Pre-condition #2 - Step 9: Refresh until Company and Contact are populated in Opp #1', async () => {
      console.log('Pre-condition #2 - Step 9: Waiting for the async Company and Contact to populate on Opp #1');
      await opportunityPage.openByUrl(createdOppUrl as string);
      const populated = await opportunityPage.waitForCompanyAndContactPopulated();
      console.log(`  - Company: "${populated.companyValue}" | Contact: "${populated.contactValue}"`);
      expect(populated.populated, 'Company and Contact should both be populated on Opp #1 before requesting SE support').toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Opp#1 created (Company + Contact populated)').catch(() => {});
    });

    // ===================== Steps to reproduce =====================
    await test.step('Step 1: Open Opp #1', async () => {
      console.log(`Step 1: Opening Opp #1 = ${createdOppUrl}`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opp #1 opened');
    });

    await test.step('Step 2: Click "REQUEST SE SUPPORT" button to create a new SE Support', async () => {
      console.log('Step 2: Clicking REQUEST SE SUPPORT');
      await opportunityPage.clickRequestSESupport();
      await seSupportPage.waitForWindowOpen();
      console.log('✓ "New Ticket" window opened');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - New Ticket window opened').catch(() => {});
    });

    await test.step('Step 3: On the "New Ticket" window, set Subject, Description and Support type', async () => {
      console.log('Step 3: Filling the New Ticket window');
      console.log(`  - Subject      : ${ticketSubject}`);
      console.log(`  - Description  : ${ticketDescription}`);
      console.log(`  - Support type : ${SUPPORT_TYPE}`);
      await seSupportPage.fillSubject(ticketSubject);
      await seSupportPage.fillDescription(ticketDescription);
      await seSupportPage.selectSupportType(SUPPORT_TYPE);
      console.log('✓ New Ticket details entered');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - New Ticket details entered').catch(() => {});
    });

    await test.step('Step 4: Press "SAVE" button', async () => {
      console.log('Step 4: Saving the New Ticket');
      await seSupportPage.save();
      // Ticket now exists - remember its Subject so the afterEach can archive it as admin.
      createdTicketSubject = ticketSubject;
      console.log('✓ New Ticket saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - New Ticket saved').catch(() => {});
    });

    await test.step('Step 5: On the Opportunity Log note, wait for the "A new ticket has been opened by the customer" message', async () => {
      const expectedMessage = `A new ticket has been opened by the customer: ${ticketSubject}`;
      console.log(`Step 5: Waiting for the Opportunity Log note message: "${expectedMessage}"`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      const result = await opportunityPage.waitForChatterContaining(
        expectedMessage,
        6,
        CommonUtils.waitTimes.long,
        CommonUtils.waitTimes.pageLoad
      );
      console.log(`  - Message found: ${result.found}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Verification - Opportunity Log note message');

      // ===================== Verification Point (5) =====================
      // VP5: the message "A new ticket has been opened by the customer: <Subject>" appears.
      expect(
        result.found,
        `VP5: the Opportunity Log note should contain "${expectedMessage}"`
      ).toBeTruthy();
      console.log('✅ SE support ticket opened and the Log note message verified');
    });
  });
});
