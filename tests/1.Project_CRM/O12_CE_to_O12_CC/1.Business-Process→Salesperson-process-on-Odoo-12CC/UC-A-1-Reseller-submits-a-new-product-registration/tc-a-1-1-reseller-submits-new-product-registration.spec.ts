import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration
 * Test Case ID: TC.-A.1.1
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller's new product registration is submitted successfully and visible to the
 *          Reseller. Thomas creates the deal-registration Opportunity (Opp Name #1, Assigned Partner =
 *          Reseller); Reseller_1 then sees it on "My Opportunities".
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.1:" --project=chromium
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1:
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
 * Steps to reproduce #1 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter the Opportunity details:
 *          - Opp
 *          - Contact
 *          - Company
 *          - Email
 *          - Country
 *          - State
 *          - IP
 *          - Create manually  = FALSE
 *          - Sales Team       = cleared
 *          - Salesperson      = cleared
 *          - Lead form        = CRM Developer Lead form
 *          - Assigned Partner = TEST-Reseller#Automation-Jun10
 *          - Internal Note    = Internal Note #1
 *       SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (view the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *
 * Verification #1:
 *  1. Opp Name #1 is displayed on the Reseller's "My Opportunities" page.
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.1.1 - Reseller submits a new product registration', () => {

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

  test('TC.-A.1.1: Verify Reseller submits a new product registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.1 ${compactDateTime}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | Email = ${companyEmail}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: view the registration as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_bronze.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click "My Opportunities" button', async () => {
      await resellerPortalPage.clickMyOpportunities();
      console.log('✓ My Opportunities page opened');
    });

    await test.step('Verification #1: Opp Name #1 is displayed on the Reseller\'s My Opportunities page', async () => {
      const isListed = await resellerPortalPage.isOpportunityListed(oppName);
      const listedNames = await resellerPortalPage.getListedOpportunityNames();
      console.log(`  - Listed names (first page): ${JSON.stringify(listedNames)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.1 - Reseller My Opportunities (Opp Name #1 displayed)');
      expect(isListed, `Opp Name #1 "${oppName}" should be displayed on the Reseller's My Opportunities page`).toBeTruthy();
      console.log('✅ Reseller can see the submitted product registration in My Opportunities');
    });
  });
});
