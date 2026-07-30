import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (view in My Opportunities)
 * Test Case ID: TC.-A.1.6
 * Automation-Type: refactored
 * Automation-Date: 2026-07-30
 *
 * Summary: Verify the Reseller can view the submitted registration in My Opportunities. Thomas creates a
 *          deal-registration assigned to the Reseller. Logged in as the Reseller, the registration is
 *          located via the portal Search box and confirmed listed.
 *          NOTE: this does NOT assert sort order. The Reseller's My Opportunities list holds many
 *          unrelated (leftover) Opportunities and is paginated, so the relative position of a given
 *          Opportunity after sorting is not deterministic - a Search-based visibility check is reliable.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.6:" --project=chromium
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
 *  1-9. Create the deal-registration Opportunity and SAVE.
 *
 * Steps to reproduce #2 (view the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Search for the submitted registration
 *
 * Verification #1:
 *  3. The submitted registration is listed
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.6 - View submitted registrations in My Opportunities', () => {

  const createdOppUrls: string[] = [];

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
    for (const url of createdOppUrls) {
      await deleteCreatedOpportunityAsAdmin(page, url, SKIP_CLEANUP_OPP, testInfo);
    }
  });

  test('TC.-A.1.6: Verify the Reseller can view the submitted registrations in My Opportunities', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const reg = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.6 ${reg.compactDateTime}`;

    await test.step('Pre-condition 1: Prepare the deal-registration Internal Note', async () => {
      console.log(`Pre-condition 1: Opp Name = ${oppName}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: reg.leadName,
      companyEmail: reg.companyEmail,
      internalNote: reg.note,
      stepPrefix: 'Steps to reproduce #1',
    }));

    // ===== Steps to reproduce #2: view the registration as the Reseller =====
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

    let oppListed = false;
    await test.step('Steps to reproduce #2 - Step 3: Search for the submitted registration', async () => {
      // Generous retry: a just-assigned Opp can take a short while to surface in the Reseller portal.
      oppListed = await resellerPortalPage.isOpportunityListedBySearch(oppName, 12);
      console.log('----- VERIFY (submitted registration) -----');
      console.log(`  Expected: registration "${oppName}" is listed in the Reseller's My Opportunities`);
      console.log(`  Actual  : found via Search = ${oppListed}`);
      console.log(`  Result  : ${oppListed ? 'PASS' : 'FAIL'}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.6 - Search submitted registration');
      expect(oppListed, 'The submitted registration should be listed in My Opportunities').toBeTruthy();
    });
  });
});
