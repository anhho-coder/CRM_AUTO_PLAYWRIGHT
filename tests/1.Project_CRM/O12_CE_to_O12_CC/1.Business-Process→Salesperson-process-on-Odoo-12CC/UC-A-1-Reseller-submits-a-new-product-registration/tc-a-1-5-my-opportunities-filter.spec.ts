import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (My Opportunities filter)
 * Test Case ID: TC.-A.1.5
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the My Opportunities filters work. A new registration is in stage New (active, not
 *          Won): "All" shows it, "Active" shows it, "Won" does NOT. (The "Today"/"Week" filters are
 *          activity-based, not creation-date based, so they are not used here.)
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.5:" --project=chromium
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
 * Steps to reproduce #2 (filter the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Apply filter "All"
 *  4. Apply filter "Active"
 *  5. Apply filter "Won"
 *
 * Verification #1:
 *  3. Opp Name #1 is displayed (All)
 *  4. Opp Name #1 is displayed (Active = New)
 *  5. Opp Name #1 is NOT displayed (Won)
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.5 - My Opportunities filter (All / Active / Won)', () => {

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

  test('TC.-A.1.5: Verify My Opportunities filters (All/Active show a New registration, Won does not)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.5 ${compactDateTime}`;

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

    // ===== Steps to reproduce #2: filter the list as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce #2 - Step 2: Click "My Opportunities"', async () => {
      await resellerPortalPage.clickMyOpportunities();
    });

    await test.step('Steps to reproduce #2 - Step 3: Apply filter "All" (registration is shown)', async () => {
      await resellerPortalPage.filterMyOpportunities('all');
      const listed = await resellerPortalPage.isOpportunityListed(oppName);
      console.log(`  - Filter All: listed=${listed}`);
      expect(listed, 'Filter All should show the registration').toBeTruthy();
    });

    await test.step('Steps to reproduce #2 - Step 4: Apply filter "Active" (New registration is shown)', async () => {
      await resellerPortalPage.filterMyOpportunities('active');
      const listed = await resellerPortalPage.isOpportunityListed(oppName);
      console.log(`  - Filter Active: listed=${listed}`);
      expect(listed, 'Filter Active should show the New registration').toBeTruthy();
    });

    await test.step('Steps to reproduce #2 - Step 5: Apply filter "Won" (New registration is NOT shown)', async () => {
      await resellerPortalPage.filterMyOpportunities('won');
      const listed = await resellerPortalPage.isOpportunityListed(oppName, 1);
      console.log(`  - Filter Won: listed=${listed}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.5 - My Opportunities filter Won');
      expect(listed, 'Filter Won should NOT show the New registration').toBeFalsy();
    });
  });
});
