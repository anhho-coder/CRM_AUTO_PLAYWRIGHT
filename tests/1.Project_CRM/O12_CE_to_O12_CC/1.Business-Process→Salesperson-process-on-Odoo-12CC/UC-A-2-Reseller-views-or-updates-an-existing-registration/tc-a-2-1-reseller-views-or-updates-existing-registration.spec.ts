import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.1
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller can update an existing registration via the portal. Thomas creates the
 *          deal-registration Opportunity (Opp Name #1, Assigned Partner = Reseller); the Reseller edits the
 *          CONTACT Phone (Phone #1) and Confirms; Thomas re-opens Opp URL #1 and verifies Phone = Phone #1.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.1:" --project=chromium
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
 *          - Country                  = United States
 *          - State                    = Maryland
 *          - IP                       = IP
 *          - Create manually checkbox = FALSE
 *          - Sales Team               = cleared
 *          - Salesperson              = cleared
 *       then CRM Developer Lead form; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *       Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (view/update the registration as the Reseller):
 *  1. Use the account of Reseller_1 (name: TEST-Reseller#1_Automation_Test) to login successful
 *  2. After login successful, click at "My Opportunities" button
 *  3. On "My Opportunities" page, select the Opportunity name with Opp Name #1 created previously and wait
 *  4. Press "Edit" button on small area of "CONTACT"
 *  4. Enter the following information: Phone = <random of 9-digit number> (Remember this as Phone #1)
 *  5. Press "CONFIRM" button
 *
 * Steps to reproduce #3 (re-open the registration as Thomas):
 *  1. Use the account of Thomas to login successful
 *  2. After login successful, launch the Opp URL #1
 *
 * Verification #1:
 *  1. The value of Opp's Phone = value of Phone #1
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.1 - Reseller views or updates an existing registration', () => {

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

  test('TC.-A.2.1: Verify Reseller views/updates an existing registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.1 ${compactDateTime}`;
    // Phone #1: the NEW phone the Reseller will enter (a fresh random 9-digit number).
    const phone1 = CommonUtils.generateRandomDigits(9);

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template + edit placeholders)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | Email = ${companyEmail} | new Phone #1 = ${phone1}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: view/update the registration as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
      console.log('Steps to reproduce #2 - Step 1: Switching session and logging in as Reseller_1');
      // Deterministically end Thomas's session first (clearing cookies alone is racy), then log in as
      // the Reseller (partner-portal user -> lands on "/my").
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_1.username, users.reseller_1.password);
      await resellerPortalPage.waitForPortalReady();
      console.log(`✓ Logged in as Reseller_1 (${users.reseller_1.displayName})`);
    });

    await test.step('Steps to reproduce #2 - Step 2: After login successful, click "My Opportunities" button', async () => {
      console.log('Steps to reproduce #2 - Step 2: Clicking "My Opportunities"');
      await resellerPortalPage.clickMyOpportunities();
      console.log('✓ My Opportunities page opened');
    });

    await test.step('Steps to reproduce #2 - Step 3: On "My Opportunities" page, select the Opportunity named Opp Name #1 and wait', async () => {
      console.log(`Steps to reproduce #2 - Step 3: Opening Opp Name #1 ("${oppName}")`);
      const detailUrl = await resellerPortalPage.openOpportunityByName(oppName);
      console.log(`✓ Opportunity detail page opened: ${detailUrl}`);
    });

    await test.step('Steps to reproduce #2 - Step 4: Press "Edit" on the "CONTACT" area', async () => {
      console.log('Steps to reproduce #2 - Step 4: Opening the "Edit contact" modal');
      await resellerPortalPage.clickEditContact();
      console.log('✓ "Edit contact" modal opened');
    });

    await test.step('Steps to reproduce #2 - Step 4 (data): Enter Phone = random 9-digit number (Phone #1)', async () => {
      console.log(`Steps to reproduce #2 - Step 4 (data): Entering Phone #1 = ${phone1}`);
      await resellerPortalPage.fillContactPhone(phone1);
      console.log('✓ Phone #1 entered in the Edit contact modal');
    });

    await test.step('Steps to reproduce #2 - Step 5: Press "CONFIRM" button', async () => {
      console.log('Steps to reproduce #2 - Step 5: Confirming the contact edit');
      await resellerPortalPage.confirmEditContact();
      const cardPhone = await resellerPortalPage.getContactCardPhone().catch(() => '');
      console.log(`✓ Contact edit confirmed (CONTACT card phone now reads: "${cardPhone}")`);
    });

    // ===== Steps to reproduce #3: re-open the registration as Thomas =====
    await test.step('Steps to reproduce #3 - Step 1: Use the account of Thomas to login successful', async () => {
      console.log('Steps to reproduce #3 - Step 1: Switching session and logging in as Thomas');
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.sale_ic_thomas.username, users.sale_ic_thomas.password);
      await loginPage.dismissLocationPermissionDialog().catch(() => {});
      console.log('✓ Logged in as Thomas');
    });

    await test.step('Steps to reproduce #3 - Step 2: After login successful, launch the Opp URL #1', async () => {
      console.log(`Steps to reproduce #3 - Step 2: Launching Opp URL #1 = ${createdOppUrl}`);
      await opportunityPage.openByUrl(createdOppUrl as string);
      console.log('✓ Opp URL #1 opened');
    });

    await test.step('Verification #1: The value of Opp Phone = value of Phone #1', async () => {
      console.log(`Verification #1: confirming the Opportunity Phone equals Phone #1 ("${phone1}")`);
      const oppPhone = await opportunityPage.waitForPhoneEquals(phone1);
      console.log(`  - Opportunity Phone read from the form: "${oppPhone}" | Phone #1: "${phone1}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.1 - Opportunity Phone equals Phone #1');

      expect(oppPhone, `The Opportunity's Phone should equal the Reseller-entered Phone #1 ("${phone1}")`).toBe(phone1);
      console.log('✅ Reseller update is reflected: the Opportunity Phone equals Phone #1');
    });
  });
});
