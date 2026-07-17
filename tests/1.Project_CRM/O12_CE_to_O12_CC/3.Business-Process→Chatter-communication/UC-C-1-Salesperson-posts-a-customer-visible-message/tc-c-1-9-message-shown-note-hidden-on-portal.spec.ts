import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * =============================================================================================
 *  UC-C-1 - Salesperson posts a customer-visible message
 *  TC.-C.1.9 - Customer-visible message is shown to the Reseller but an internal Log note is not
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.9   (Xray TC ID: O12CE-O12CC-UC-C1_1.9)
 *  Jira:            CRM-11158
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas posts a customer-visible "Send message" (M1) and an internal "Log note" (N1) on
 *           his own Opportunity; the Reseller then opens it on the portal and sees M1 in the
 *           "Comment" section but NOT the internal note N1.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.9:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.9 <date time>",
 *                 Assigned Partner = Reseller. Use the existing Reseller portal login.
 *    The deal-registration Internal Note #1 is built from the template, filling the <...> placeholders
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
 *  Steps to reproduce:
 *   1. As the Salesperson, open the Opportunity created above, click "Send message" and post "TEST MESSAGE TC.-C.1.9 <current date time>"
 *   2. On the same Opportunity, click "Log note" and post internal note "TEST NOTE TC.-C.1.9 <current date time>"
 *   3. Log out and log in as the Reseller portal user
 *   4. Open "My Opportunities" > the Opportunity and look at the "Comment" section
 *
 *  Verification (Expected Result on step 4):
 *   4. Message "TEST MESSAGE TC.-C.1.9 <date time>" (Send message) is shown to the Reseller;
 *      internal note "TEST NOTE TC.-C.1.9 <date time>" (Log note) is NOT shown on the portal.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.9 - Customer-visible message shown to Reseller, internal Log note hidden', () => {
  let createdOppUrl: string | null = null;

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      await new HomePage(page).waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    await deleteCreatedOpportunityAsAdmin(page, createdOppUrl, SKIP_CLEANUP_OPP, testInfo);
  });

  test('TC.-C.1.9: Customer-visible message is shown to the Reseller but an internal Log note is not', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.9 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.9 ${currentDateTime}`;
    const logNoteText = `TEST NOTE TC.-C.1.9 ${currentDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | message = "${messageText}" | note = "${logNoteText}"`);
    });

    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1: As the Salesperson, open the Opportunity, click "Send message" and post the message', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await opportunityPage.sendChatterMessage(messageText);
      const { found } = await opportunityPage.waitForChatterContaining(messageText, 4, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`✓ Customer-visible message posted (in backend chatter: ${found})`);
    });

    await test.step('Step 2: On the same Opportunity, click "Log note" and post the internal note', async () => {
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await opportunityPage.logChatterNote(logNoteText);
      const { found } = await opportunityPage.waitForChatterContaining(logNoteText, 4, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`✓ Internal Log note posted (in backend chatter: ${found})`);
    });

    await test.step('Step 3: Log out and log in as the Reseller portal user', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Step 4: Open "My Opportunities" > the Opportunity and look at the "Comment" section', async () => {
      await resellerPortalPage.clickMyOpportunities();
      await resellerPortalPage.openOpportunityByName(oppName);
      await resellerPortalPage.waitForCommentSectionReady().catch(() => {});
      const messageShown = await resellerPortalPage.waitForPortalCommentContaining(messageText);
      const portalText = await resellerPortalPage.getPortalCommentsText().catch(() => '');
      const noteShown = portalText.includes(logNoteText);
      console.log(`  - portal shows the customer-visible message: ${messageShown} | portal shows the internal Log note: ${noteShown}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.9 - Portal Comment section (message shown, note hidden)');

      expect(messageShown, `The customer-visible message ("${messageText}") should be shown to the Reseller on the portal`).toBeTruthy();
      expect(noteShown, `The internal Log note ("${logNoteText}") must NOT be shown on the portal`).toBeFalsy();
      console.log('✅ Verified: the Send-message is visible to the Reseller while the Log note stays internal');
    });
  });
});
