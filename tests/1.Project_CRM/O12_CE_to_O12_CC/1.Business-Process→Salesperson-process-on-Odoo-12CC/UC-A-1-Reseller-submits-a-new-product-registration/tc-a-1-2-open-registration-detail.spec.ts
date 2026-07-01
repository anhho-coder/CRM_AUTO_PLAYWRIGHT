import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (open detail)
 * Test Case ID: TC.-A.1.2
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the Reseller can open a registration's detail page from My Opportunities. Thomas
 *          creates the registration (Assigned Partner = Reseller); Reseller_1 opens My Opportunities,
 *          clicks the row, and the detail page shows the Opp name and an Expected Revenue value.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.2:" --project=chromium
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
 * Steps to reproduce #2 (open the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Click the Opp Name #1 row (open its detail page)
 *
 * Verification #1:
 *  1. The detail page (/my/opportunity/...) shows Opp Name #1 and an Expected Revenue value.
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.1.2 - Reseller opens the registration detail from My Opportunities', () => {

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

  test('TC.-A.1.2: Verify the Reseller can open the registration detail page', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.2 ${compactDateTime}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: open the registration as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce #2 - Step 2: Click "My Opportunities"', async () => {
      await resellerPortalPage.clickMyOpportunities();
    });

    await test.step('Steps to reproduce #2 - Step 3: Open the Opp Name #1 detail page', async () => {
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      console.log(`  - Detail URL: ${detailUrl}`);
      expect(detailUrl, 'Detail URL should be a /my/opportunity/ page').toContain('/my/opportunity/');
    });

    await test.step('Verification #1: the detail page shows the Opp name and Expected Revenue', async () => {
      const detailName = await resellerPortalPage.getDetailOpportunityName();
      const detailRevenue = await resellerPortalPage.getDetailExpectedRevenue();
      console.log(`  - Detail name: "${detailName}" | Expected Revenue: "${detailRevenue}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.2 - Registration detail page');
      expect(detailName, 'Detail page should show the Opp name').toContain(oppName);
      expect(detailRevenue, 'Detail page should show an Expected Revenue value').not.toBe('');
    });
  });
});
