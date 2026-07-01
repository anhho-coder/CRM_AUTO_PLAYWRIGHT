import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.2
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller can VIEW an existing registration's detail page. Thomas creates the
 *          deal-registration Opportunity (Opp Name #1, Assigned Partner = Reseller); the Reseller opens it
 *          and the detail page shows the name, Contact Email and Expected Revenue matching what was created.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.2:" --project=chromium
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
 *          - Opp name                 = Opp Name #1
 *          - Contact                  = Contact
 *          - Company                  = Company
 *          - Email                    = Email
 *          - Country                  = Country
 *          - State                    = State
 *          - IP                       = IP
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *       then CRM Developer Lead form; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *       Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (view the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Select the Opportunity named Opp Name #1 and wait (open its detail page)
 *
 * Verification #1:
 *  1. The detail page displays the registration: Opportunity name = Opp Name #1, Contact Email =
 *     the created Email, and an Expected Revenue is shown.
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.2 - Reseller views an existing registration detail page', () => {

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

  test('TC.-A.2.2: Verify Reseller views an existing registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.2 ${compactDateTime}`;

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
      console.log('Steps to reproduce #2 - Step 1: Logging in as Reseller_1');
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click "My Opportunities" button', async () => {
      await resellerPortalPage.clickMyOpportunities();
      console.log('✓ My Opportunities page opened');
    });

    await test.step('Steps to reproduce #2 - Step 3: On "My Opportunities" page, select the Opportunity named Opp Name #1 and wait', async () => {
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      console.log(`✓ Opportunity detail page opened: ${detailUrl}`);
    });

    await test.step('Verification #1: The detail page displays the registration (name, Contact Email, Expected Revenue)', async () => {
      const detailName = await resellerPortalPage.getDetailOpportunityName();
      const cardEmail = await resellerPortalPage.getContactCardEmail();
      const expectedRevenue = await resellerPortalPage.getDetailExpectedRevenue();
      console.log(`  - Detail name: "${detailName}"`);
      console.log(`  - Contact card email: "${cardEmail}" (created: "${companyEmail}")`);
      console.log(`  - Expected Revenue (shown): "${expectedRevenue}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.2 - Reseller views registration detail page');

      expect(detailName, 'The detail page heading should show Opp Name #1').toContain(oppName);
      expect(cardEmail, 'The CONTACT card Email should equal the created Email').toBe(companyEmail);
      expect(expectedRevenue.length, 'An Expected Revenue should be displayed on the detail page').toBeGreaterThan(0);
      console.log('✅ Reseller can view the existing registration detail with the expected values');
    });
  });
});
