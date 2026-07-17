import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (portal Overview count)
 * Test Case ID: TC.-A.1.7
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the portal Overview "My Opportunities" count increases by 1 after a new registration.
 *          Reseller_1 reads the count; Thomas creates a registration assigned to Reseller_1; Reseller_1
 *          reads the count again.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.7:" --project=chromium
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
 * Steps to reproduce #1 (read the count as the Reseller):
 *  1. Login as Reseller_1 (TEST-Reseller#1_Automation_Test); read Overview "My Opportunities" count.
 *
 * Steps to reproduce #2 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; ...; Assigned Partner = Reseller; SAVE.
 *
 * Steps to reproduce #3 (re-read the count as the Reseller):
 *  1. Login as Reseller_1; read the Overview "My Opportunities" count again.
 *
 * Verification #1:
 *  1. The count after = count before + 1.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.7 - Overview My Opportunities count increments after a registration', () => {

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

  test('TC.-A.1.7: Verify the Overview My Opportunities count increments after a new registration', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.7 ${compactDateTime}`;
    let countBefore = 0;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName}`);
    });

    await test.step('Steps to reproduce #1 - Step 1: As Reseller_1, read the Overview "My Opportunities" count', async () => {
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      countBefore = await resellerPortalPage.getOverviewCount('My Opportunities');
      console.log(`  - My Opportunities count BEFORE: ${countBefore}`);
      expect(countBefore, 'Overview count should be readable (>= 0)').toBeGreaterThanOrEqual(0);
      // End the Reseller session so the create helper's Thomas login is clean.
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
    });

    // ===== Steps to reproduce #2: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      stepPrefix: 'Steps to reproduce #2',
    });

    await test.step('Steps to reproduce #3 - Step 1: As Reseller_1, read the Overview count again', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
      const countAfter = await resellerPortalPage.getOverviewCount('My Opportunities');
      console.log(`  - My Opportunities count AFTER: ${countAfter} (before ${countBefore})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.7 - Overview count after registration');
      expect(countAfter, 'Overview count should increment by 1').toBe(countBefore + 1);
    });
  });
});
