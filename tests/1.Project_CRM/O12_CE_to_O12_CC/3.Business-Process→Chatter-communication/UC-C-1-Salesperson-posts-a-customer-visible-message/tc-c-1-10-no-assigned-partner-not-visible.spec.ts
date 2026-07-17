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
 *  TC.-C.1.10 - Customer-visible message on an Opportunity with no Assigned Partner is not visible
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.10   (Xray TC ID: O12CE-O12CC-UC-C1_1.10)
 *  Jira:            CRM-11159
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas creates an Opportunity WITHOUT an Assigned Partner and posts a customer-visible
 *           message; the Reseller does not see that Opportunity (nor the message) on the portal -
 *           data isolation holds.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.10:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW Opportunity in CRM > Pipeline FOR
 *                 THIS CASE ONLY, uniquely named "TEST TC.-C.1.10 <date time>", WITHOUT an Assigned
 *                 Partner (not assigned to any Reseller). Use the existing Reseller portal login.
 *    The deal-registration Internal Note #1 is built from the template, filling the <...> placeholders
 *    with fresh dynamic values each run (key fields, one per line); the Opportunity itself is left
 *    WITHOUT an Assigned Partner (the Partner Company Name below is template note data only):
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
 *   1. As the Salesperson, open the Opportunity created above, click "Send message" and post "TEST MESSAGE TC.-C.1.10 <current date time>"
 *   2. Log out and log in as the Reseller portal user
 *   3. Open "My Opportunities" and look for the Opportunity (TEST TC.-C.1.10 <current date time>)
 *
 *  Verification (Expected Result on step 3):
 *   3. The Opportunity is not listed for the Reseller and the message is not visible on the portal.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.10 - Message on an Opportunity with no Assigned Partner is not visible to a Reseller', () => {
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

  test('TC.-C.1.10: Customer-visible message on an Opportunity with no Assigned Partner is not visible to a Reseller', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.10 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.10 ${currentDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name (no Assigned Partner)', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | message = "${messageText}" | Assigned Partner = NONE`);
    });

    // Create the Opportunity WITHOUT an Assigned Partner (assignedPartner: null).
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, assignedPartner: null, stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1: As the Salesperson, open the Opportunity and post a customer-visible message', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await opportunityPage.sendChatterMessage(messageText);
      const { found } = await opportunityPage.waitForChatterContaining(messageText, 4, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`✓ Customer-visible message posted (in backend chatter: ${found})`);
    });

    await test.step('Step 2: Log out and log in as the Reseller portal user', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Step 3: Open "My Opportunities" and look for the Opportunity', async () => {
      await resellerPortalPage.clickMyOpportunities();
      // The Opp has no Assigned Partner, so it must NOT appear in this Reseller's list (poll a few times).
      const listed = await resellerPortalPage.isOpportunityListed(oppName, 4, CommonUtils.waitTimes.long);
      console.log(`  - Opportunity "${oppName}" listed for the Reseller: ${listed} (expected: false)`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.10 - Unassigned Opportunity not listed for the Reseller');

      expect(listed, 'An Opportunity with no Assigned Partner must NOT be visible to the Reseller on the portal').toBeFalsy();
      console.log('✅ Verified: the unassigned Opportunity (and its message) is not visible to the Reseller');
    });
  });
});
