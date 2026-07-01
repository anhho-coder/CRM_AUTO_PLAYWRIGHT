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
 *  TC.-C.1.3 - Customer-visible message posted by Salesperson is visible to the Reseller on the portal
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.3   (Xray TC ID: O12CE-O12CC-UC-C1_1.3)
 *  Jira:            CRM-11152
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-25
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas creates his own deal-registration Opportunity (assigned to the Reseller) and
 *           posts a customer-visible message via "Send message"; the Reseller then logs into the
 *           Partner Portal and sees that message in the Opportunity "Comment" section.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.3:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.3 <date time>",
 *                 Stage New, Assigned Partner = Reseller, fresh unique Email. Use the existing
 *                 Reseller portal login (TEST-Reseller#1_Automation_Test) linked to that Reseller.
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
 *   1. As the Salesperson, open the Opportunity created above, click "Send message", type
 *      "TEST MESSAGE TC.-C.1.3 <current date time>" and click "Send"
 *   2. Log out and log in as the Reseller portal user
 *   3. Open "My Opportunities" and open the same Opportunity (TEST TC.-C.1.3 <current date time>)
 *   4. Look at the "Comment" section
 *
 *  Verification (Expected Result on step 4):
 *   4. The Salesperson's message "TEST MESSAGE TC.-C.1.3 <current date time>" is shown to the
 *      Reseller in the portal Opportunity "Comment" section.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-C.1.3 - Customer-visible message is visible to the Reseller on the portal', () => {

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

  test('TC.-C.1.3: Customer-visible message posted by Salesperson is visible to the Reseller on the Partner Portal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.3 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.3 ${currentDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | Email = ${companyEmail} | message = "${messageText}"`);
    });

    // ===== Pre-condition: create the deal-registration Opportunity as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1: As the Salesperson, open the Opportunity, click "Send message", type the message and click "Send"', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await opportunityPage.sendChatterMessage(messageText);
      const { found } = await opportunityPage.waitForChatterContaining(messageText, 4, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`✓ Customer-visible message posted as the Salesperson (present in backend chatter: ${found})`);
    });

    await test.step('Step 2: Log out and log in as the Reseller portal user', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Step 3: Open "My Opportunities" and open the same Opportunity', async () => {
      await resellerPortalPage.clickMyOpportunities();
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      console.log(`✓ Opportunity detail page opened on the portal: ${detailUrl}`);
    });

    await test.step('Step 4: Look at the "Comment" section', async () => {
      await resellerPortalPage.waitForCommentSectionReady().catch(() => {});
      const shown = await resellerPortalPage.waitForPortalCommentContaining(messageText);
      const portalText = await resellerPortalPage.getPortalCommentsText().catch(() => '');
      console.log(`  - Portal "Comment" section contains the Salesperson's message: ${shown}`);
      if (!shown) console.log(`  - Portal comments text (first 400 chars): "${portalText.substring(0, 400)}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.3 - Salesperson message in the portal Comment section');

      expect(
        shown,
        `The Salesperson's customer-visible message ("${messageText}") should be shown to the Reseller in the portal "Comment" section`
      ).toBeTruthy();
      console.log('✅ Verified: the Salesperson message is visible to the Reseller on the portal');
    });
  });
});
