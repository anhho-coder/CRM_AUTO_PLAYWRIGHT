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
 *  TC.-C.1.11 - Bidirectional thread: Reseller's portal reply appears in the Salesperson's chatter
 * =============================================================================================
 *  Test Case ID:    TC.-C.1.11   (Xray TC ID: O12CE-O12CC-UC-C1_1.11)
 *  Jira:            CRM-11160
 *  Test Repo Path:  /Migration Odoo 12CE to 12CC/Business Process -> Chatter communication/UC-C.1 Salesperson posts a customer-visible message
 *  Automation-Type: new
 *  Automation-Date: 2026-06-26
 * ---------------------------------------------------------------------------------------------
 *  Summary: Thomas posts a customer-visible message (M1); the Reseller replies on the portal (R1);
 *           Thomas re-opens the Opportunity and the chatter shows BOTH M1 and R1 - a full two-way
 *           thread between Salesperson and Reseller.
 * ---------------------------------------------------------------------------------------------
 *  Command to run:
 *    npx playwright test --grep "TC\.-C\.1\.11:" --project=chromium
 * ---------------------------------------------------------------------------------------------
 *  Source manual TC (mirrors the Xray manual steps - same order, same content):
 *
 *  Pre-condition: Login as Salesperson (Thomas); create a NEW deal-registration Opportunity in
 *                 CRM > Pipeline FOR THIS CASE ONLY, uniquely named "TEST TC.-C.1.11 <date time>",
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
 *   1. As the Salesperson, open the Opportunity created above, click "Send message" and post "TEST MESSAGE TC.-C.1.11 <current date time>"
 *   2. Log out and log in as the Reseller portal user
 *   3. Open "My Opportunities" > the Opportunity and post a reply "TEST REPLY TC.-C.1.11 <current date time>" in the "Comment" section
 *   4. Log out and log in as the Salesperson; reopen the Opportunity
 *
 *  Verification (Expected Result on step 4):
 *   4. The Opportunity chatter shows both "TEST MESSAGE TC.-C.1.11 <date time>" (Salesperson) and
 *      "TEST REPLY TC.-C.1.11 <date time>" (Reseller's reply) as customer-visible messages, in order.
 * =============================================================================================
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-C.1.11 - Bidirectional thread between Salesperson and Reseller', () => {
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

  test('TC.-C.1.11: Bidirectional thread - Reseller portal reply appears in the Salesperson Opportunity chatter', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, currentDateTime, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-C.1.11 ${compactDateTime}`;
    const messageText = `TEST MESSAGE TC.-C.1.11 ${currentDateTime}`;
    const replyText = `TEST REPLY TC.-C.1.11 ${currentDateTime}`;

    await test.step('Pre-condition: Prepare Internal Note #1 and the unique Opportunity name', async () => {
      console.log(`Pre-condition: Opp Name = ${oppName} | message = "${messageText}" | reply = "${replyText}"`);
    });

    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName, contactName: leadName, companyEmail, internalNote, stepPrefix: 'Pre-condition',
    });

    await test.step('Step 1: As the Salesperson, open the Opportunity and post a customer-visible message (M1)', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await opportunityPage.sendChatterMessage(messageText);
      const { found } = await opportunityPage.waitForChatterContaining(messageText, 4, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`✓ Salesperson message M1 posted (in backend chatter: ${found})`);
    });

    await test.step('Step 2: Log out and log in as the Reseller portal user', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Step 3: Open "My Opportunities" > the Opportunity and post a reply (R1) in the "Comment" section', async () => {
      await resellerPortalPage.clickMyOpportunities();
      await resellerPortalPage.openOpportunityByName(oppName);
      await resellerPortalPage.waitForCommentSectionReady().catch(() => {});
      await resellerPortalPage.fillCommentMessage(replyText);
      await resellerPortalPage.submitComment();
      const replyPosted = await resellerPortalPage.waitForPortalCommentContaining(replyText);
      console.log(`✓ Reseller reply R1 posted on the portal (visible in portal list: ${replyPosted})`);
    });

    await test.step('Step 4: Log out and log in as the Salesperson; reopen the Opportunity', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      await opportunityPage.openByUrl(createdOppUrl as string);
      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      console.log('✓ Re-opened the Opportunity as the Salesperson');
    });

    await test.step('Verification: The chatter shows BOTH the Salesperson message (M1) and the Reseller reply (R1)', async () => {
      const m1 = await opportunityPage.waitForChatterContaining(messageText, 6, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      const r1 = await opportunityPage.waitForChatterContaining(replyText, 6, CommonUtils.waitTimes.checkingChatterLog, CommonUtils.waitTimes.contactRefreshTotalWait);
      console.log(`  - chatter contains Salesperson message M1: ${m1.found} | contains Reseller reply R1: ${r1.found}`);

      await opportunityPage.dismissErrorDialogWithRetry().catch(() => {});
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-C.1.11 - Two-way thread (Salesperson message + Reseller reply)');

      expect(m1.found, `The Salesperson's message ("${messageText}") should appear in the Opportunity chatter`).toBeTruthy();
      expect(r1.found, `The Reseller's portal reply ("${replyText}") should appear in the Opportunity chatter`).toBeTruthy();
      console.log('✅ Verified: the Opportunity chatter shows the full two-way thread (message + reply)');
    });
  });
});
