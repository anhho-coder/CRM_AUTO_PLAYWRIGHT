import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.10
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller can update the Opportunity's Expected closing date via the "Edit opportunity"
 *          modal. Thomas creates the Opportunity (Opp Name #1, Assigned Partner = Reseller); the Reseller
 *          edits "Expected date" (Date #1) and Confirms; Thomas re-opens Opp URL #1 and verifies it = Date #1.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.10:" --project=chromium
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
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter fields; Lead form; Assigned Partner =
 *       TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (update the Opportunity, as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Select the Opportunity named Opp Name #1 and wait
 *  4. Press "Edit" on the "OPPORTUNITY" area
 *  4. Enter the following information: Expected date = <new date> (Remember this as Date #1)
 *  5. Press "CONFIRM"
 *
 * Steps to reproduce #3 (re-open as Thomas):
 *  1. Use the account of Thomas to login successful
 *  2. Launch the Opp URL #1
 *
 * Verification #1:
 *  1. The value of Opp's Expected Closing = value of Date #1
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.10 - Reseller updates the Opportunity Expected date of an existing registration', () => {

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

  test('TC.-A.2.10: Verify Reseller updates the Opportunity Expected date of an existing registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.10 ${compactDateTime}`;
    const date1 = '12/25/2026'; // Date #1 - the NEW Expected date the Reseller will enter (MM/DD/YYYY)

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | new Expected date (Date #1) = ${date1}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: update the Opportunity, as the Reseller =====
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

    await test.step('Steps to reproduce #2 - Step 3: On "My Opportunities" page, select the Opportunity named Opp Name #1 and wait', async () => {
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      console.log(`✓ Opportunity detail page opened: ${detailUrl}`);
    });

    await test.step('Steps to reproduce #2 - Step 4: Press "Edit" on the "OPPORTUNITY" area', async () => {
      await resellerPortalPage.clickEditOpportunity();
      console.log('✓ "Edit opportunity" modal opened');
    });

    await test.step('Steps to reproduce #2 - Step 4 (data): Enter Expected date = new date (Date #1)', async () => {
      console.log(`Steps to reproduce #2 - Step 4 (data): Entering Expected date (Date #1) = ${date1}`);
      await resellerPortalPage.fillOpportunityExpectedDate(date1);
      console.log('✓ Expected date entered in the Edit opportunity modal');
    });

    await test.step('Steps to reproduce #2 - Step 5: Press "CONFIRM" button', async () => {
      await resellerPortalPage.confirmEditOpportunity();
      console.log('✓ Edit opportunity confirmed');
    });

    // ===== Steps to reproduce #3: re-open as Thomas =====
    await test.step('Steps to reproduce #3 - Step 1: Use the account of Thomas to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Thomas');
    });

    await test.step('Steps to reproduce #3 - Step 2: After login successful, launch the Opp URL #1', async () => {
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opp URL #1 opened');
    });

    await test.step('Verification #1: The value of Opp Expected Closing = value of Date #1', async () => {
      console.log(`Verification #1: confirming the Opportunity Expected Closing matches Date #1 ("${date1}")`);
      const oppDate = await opportunityPage.waitForExpectedClosingMatches(date1);
      console.log(`  - Opportunity Expected Closing read from the form: "${oppDate}" | Date #1: "${date1}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.10 - Opportunity Expected Closing equals Date #1');

      // Compare on a separator/order-independent digit signature (08/15/2026 == 2026-08-15).
      const sig = (s: string) => (s.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => n > 0).sort((a, b) => a - b).join('-');
      expect(sig(oppDate), `The Opportunity Expected Closing should equal Date #1 ("${date1}")`).toBe(sig(date1));
      console.log('✅ Reseller update is reflected: the Opportunity Expected Closing equals Date #1');
    });
  });
});
