import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.11
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller CANNOT see a registration not assigned to them (access control). Thomas
 *          creates the Opportunity (Opp Name #1) but leaves Assigned Partner EMPTY; the Reseller opens
 *          "My Opportunities" and the registration does NOT appear in their list.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.11:" --project=chromium
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
 * Steps to reproduce #1 (create the registration as Thomas, NOT assigned to the Reseller):
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter fields; Lead form; (Assigned Partner left
 *       EMPTY - not assigned to the Reseller); Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (check the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *
 * Verification #1:
 *  1. Opp Name #1 does NOT appear in the Reseller's "My Opportunities" list.
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.11 - Reseller cannot see a registration not assigned to them', () => {

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

  test('TC.-A.2.11: Verify Reseller cannot see a registration not assigned to them', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.11 ${compactDateTime}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} (will be created WITHOUT assigning the Reseller)`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas, NOT assigned to the Reseller =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
      assignedPartner: null, // intentionally NOT assigning to the Reseller (access-control negative)
    });

    // ===== Steps to reproduce #2: check the list as the Reseller =====
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

    await test.step('Verification #1: Opp Name #1 does NOT appear in the Reseller\'s My Opportunities list', async () => {
      // We EXPECT absence; a few reload attempts is enough to be confident it never surfaces.
      const isListed = await resellerPortalPage.isOpportunityListed(oppName, 3, CommonUtils.waitTimes.long);
      const listedNames = await resellerPortalPage.getListedOpportunityNames();
      console.log(`  - Opp Name #1 listed for Reseller_1: ${isListed}`);
      console.log(`  - Listed names (first page): ${JSON.stringify(listedNames)}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.11 - Reseller does not see the unassigned registration');

      expect(isListed, `Opp Name #1 "${oppName}" must NOT be visible to a Reseller it is not assigned to`).toBe(false);
      console.log('✅ Access control holds: the Reseller cannot see a registration not assigned to them');
    });
  });
});
