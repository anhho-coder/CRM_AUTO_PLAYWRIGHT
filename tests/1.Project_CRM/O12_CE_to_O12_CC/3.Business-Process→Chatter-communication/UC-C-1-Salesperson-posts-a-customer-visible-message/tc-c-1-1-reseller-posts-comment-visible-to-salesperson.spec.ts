import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Reseller <-> Salesperson communication on a registration
 *  TC.-C.1.1 - Verify Salesperson posts a customer-visible message successfully
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.1
 *  Automation-Type: new
 *  Automation-Date: 2026-06-25
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas creates the deal-registration Opportunity (Opp #1, Assigned Partner = Reseller)
 *           and keeps its URL (Link_Opp#1). The Reseller opens Opp #1 on the portal and posts a
 *           comment; Thomas re-opens Link_Opp#1 and confirms the Reseller's comment shows in the
 *           Opportunity log note (chatter).
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.1:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the manual steps - same order, same content):
 *
 *  Pre-condition #1:
 *    Build the deal-registration Internal Note #1 from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line):
 *      - NAKIVO deal registration*  = <random 4-digit number>
 *      - Name                       = TEST <current date time>
 *      - Email                      = Test@company<compact date time>.com
 *      - Created Date               = <current date time>
 *      - phone                      = <random 9-digit number>
 *      - Company                    = Company Name Lead 1
 *      - Partner Company Name       = TEST-Reseller#Automation-Jun10
 *      - IP                         = 128.183.189.157
 *      - Country                    = United States
 *    (Remaining template lines - Solution used, Edition, License Type, etc. - are static defaults.)
 *
 *  Pre-condition #2 (create the registration as Thomas):
 *   1-9. Use the account of Thomas to login; click "CRM" > "view list"; click "CREATE"; enter the
 *        Opportunity details:
 *          - Opp name                   = TEST + Test Case ID + current date time
 *          - Contact name               = from Internal Note #1
 *          - Company                    = from Internal Note #1
 *          - Email                      = from Internal Note #1
 *          - Country                    = United States
 *          - State                      = Maryland
 *          - IP                         = from Note #1
 *          - Create manually checkbox   = FALSE
 *          - Sales Team                 = cleared
 *          - Salesperson                = cleared
 *          - CRM Developer tab Lead form = NAKIVO deal registration*
 *          - Assigned Partner tab       = TEST-Reseller#Automation-Jun10
 *          - Internal Notes tab         = Internal Note #1
 *        then press SAVE (= Opp #1); copy the link of Opp #1 (= Link_Opp#1).
 *
 *  Steps to reproduce #1 (Reseller posts the comment):
 *   1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *   2. After login successful, click "My Opportunities" button
 *   3. Select the Opp #1 to open the Opp #1
 *   4. At "Comment" section, leave a test message: TEST MESSAGE + Test Case ID + current date time
 *   5. Press "COMMENT" button
 *
 *  Steps to reproduce #2 (Salesperson observes):
 *   1. Use the account of Thomas to login successful
 *   2. Launch the Link_Opp#1
 *   3. Observe to see if the content Reseller_1 showing at Opp #1 log note
 *
 *  Verification Point:
 *   1. The content Reseller_1 posted is showing at Opp #1 log note (chatter)
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-C.1.1 - Reseller posts a customer-visible comment that the Salesperson sees', () => {

  let createdOppUrl: string | null = null;

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
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-C.1.1: Verify Salesperson posts a customer-visible message successfully', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.1 ${compactDateTime}`;
    // The comment the Reseller will post: "TEST MESSAGE + Test Case ID + current date time" (unique per run).
    const commentMessage = `TEST MESSAGE TC.-C.1.1 ${currentDateTime}`;

    await test.step('Pre-condition #1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition #1: Opp Name #1 = ${oppName} | Email = ${companyEmail} | Contact = ${leadName}`);
      console.log(`Pre-condition #1: Comment to post = "${commentMessage}"`);
    });

    // ===== Pre-condition #2: create the registration as Thomas (shared helper, steps 1-9) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition #2',
    });
    console.log(`Link_Opp#1 = ${createdOppUrl}`);

    // ===== Steps to reproduce #1: the Reseller posts the comment =====
    await test.step('Steps to reproduce #1 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      console.log('Steps to reproduce #1 - Step 1: Logging in as Reseller_1');
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #1 - Step 2: After login successful, click "My Opportunities" button', async () => {
      await resellerPortalPage.clickMyOpportunities();
      console.log('✓ My Opportunities page opened');
    });

    await test.step('Steps to reproduce #1 - Step 3: Select the Opp #1 to open the Opp #1', async () => {
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      await resellerPortalPage.waitForCommentSectionReady();
      console.log(`✓ Opp #1 detail page opened with the Comment section ready: ${detailUrl}`);
    });

    await test.step('Steps to reproduce #1 - Step 4: At "Comment" section, leave a test message (TEST MESSAGE + Test Case ID + current date time)', async () => {
      console.log(`Steps to reproduce #1 - Step 4: Entering comment = "${commentMessage}"`);
      await resellerPortalPage.fillCommentMessage(commentMessage);
      console.log('✓ Comment message entered in the composer');
    });

    await test.step('Steps to reproduce #1 - Step 5: Press "COMMENT" button', async () => {
      const beforeCount = await resellerPortalPage.getPortalCommentCount();
      await resellerPortalPage.submitComment();
      // Best-effort in-portal evidence that the post landed (the authoritative check is the
      // backend log note as Thomas, in the Verification step below).
      const postedInPortal = await resellerPortalPage.waitForPortalCommentContaining(commentMessage);
      const afterCount = await resellerPortalPage.getPortalCommentCount();
      console.log(`✓ "COMMENT" pressed | portal comment count ${beforeCount} -> ${afterCount} | message visible in portal list: ${postedInPortal}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.1 - Reseller comment posted on the portal');
    });

    // ===== Steps to reproduce #2: Thomas observes the comment in the Opp log note =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Thomas to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Thomas');
    });

    await test.step('Steps to reproduce #2 - Step 2: Launch the Link_Opp#1', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      // The Opp form can raise a delayed "Odoo Client Error" ("An error occurred") popup on open;
      // poll-and-dismiss it so it cannot overlay / intercept the log note.
      const dismissed = await opportunityPage.dismissErrorDialogWithRetry();
      console.log(`✓ Link_Opp#1 opened: ${createdOppUrl} (cleared ${dismissed} "Odoo Client Error" dialog(s))`);
    });

    await test.step('Steps to reproduce #2 - Step 3 / Verification: The content Reseller_1 posted is showing at Opp #1 log note', async () => {
      console.log(`Verification: confirming the Opportunity log note contains the Reseller's comment "${commentMessage}"`);
      const { found, chatterText } = await opportunityPage.waitForChatterContaining(
        commentMessage,
        6,                                          // maxAttempts (reload-and-retry; count, not a timeout)
        CommonUtils.waitTimes.checkingChatterLog,   // refreshInterval between reloads (30s)
        CommonUtils.waitTimes.contactRefreshTotalWait // total max budget (5 min hard cap)
      );
      console.log(`  - Log note contains the Reseller comment: ${found}`);
      if (!found) console.log(`  - Chatter (first 400 chars): "${chatterText.substring(0, 400)}"`);

      // The chatter reload loop can re-trigger the delayed "Odoo Client Error" popup; clear it so the
      // captured evidence shows the log note unobstructed.
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.1 - Reseller comment shown in the Opportunity log note');

      expect(
        found,
        `The Reseller's comment ("${commentMessage}") should appear in the Opportunity log note (chatter)`
      ).toBeTruthy();
      console.log('✅ Verified: the Reseller-posted comment is shown in the Opportunity log note');
    });
  });
});
