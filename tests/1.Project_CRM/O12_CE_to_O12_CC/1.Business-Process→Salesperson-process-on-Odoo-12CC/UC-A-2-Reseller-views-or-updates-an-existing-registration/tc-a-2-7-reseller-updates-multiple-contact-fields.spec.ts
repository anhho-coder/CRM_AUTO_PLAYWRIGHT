import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.7
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller can update Phone, Email and Mobile together in one "Edit contact" submit.
 *          Thomas creates the Opportunity (Opp Name #1, Assigned Partner = Reseller); the Reseller edits all
 *          three (Phone/Email/Mobile #1) and Confirms; Thomas re-opens Opp URL #1 and verifies all three.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.7:" --project=chromium
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
 * Steps to reproduce #2 (update the registration as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Select the Opportunity named Opp Name #1 and wait
 *  4. Press "Edit" on the "CONTACT" area
 *  4. Enter the following information:
 *       - Phone  = Phone #1
 *       - Email  = Email #1
 *       - Mobile = Mobile #1
 *  5. Press "CONFIRM"
 *
 * Steps to reproduce #3 (re-open as Thomas):
 *  1. Use the account of Thomas to login successful
 *  2. Launch the Opp URL #1
 *
 * Verification #1:
 *  1. Opp's Phone = Phone #1, Opp's Email = Email #1, and Opp's Mobile = Mobile #1
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.7 - Reseller updates multiple contact fields of an existing registration', () => {

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

  test('TC.-A.2.7: Verify Reseller updates Phone, Email and Mobile of an existing registration successful', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.7 ${compactDateTime}`;
    const phone1 = CommonUtils.generateRandomDigits(9);
    const mobile1 = CommonUtils.generateRandomDigits(9);
    const email1 = `updated.${compactDateTime}@reseller-edit.com`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName}`);
      console.log(`  - Phone #1 = ${phone1} | Email #1 = ${email1} | Mobile #1 = ${mobile1}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: update the registration as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful', async () => {
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

    await test.step('Steps to reproduce #2 - Step 4: Press "Edit" on the "CONTACT" area', async () => {
      await resellerPortalPage.clickEditContact();
      console.log('✓ "Edit contact" modal opened');
    });

    await test.step('Steps to reproduce #2 - Step 4 (data): Enter Phone #1, Email #1 and Mobile #1', async () => {
      console.log(`Steps to reproduce #2 - Step 4 (data): Phone #1=${phone1} | Email #1=${email1} | Mobile #1=${mobile1}`);
      await resellerPortalPage.fillContactPhone(phone1);
      await resellerPortalPage.fillContactEmail(email1);
      await resellerPortalPage.fillContactMobile(mobile1);
      console.log('✓ Phone #1, Email #1 and Mobile #1 entered in the Edit contact modal');
    });

    await test.step('Steps to reproduce #2 - Step 5: Press "CONFIRM" button', async () => {
      await resellerPortalPage.confirmEditContact();
      console.log('✓ Contact edit confirmed');
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

    await test.step('Verification #1: Opp Phone = Phone #1, Opp Email = Email #1, Opp Mobile = Mobile #1', async () => {
      // Poll on Phone first (reload-retry); once the save surfaced, read Email and Mobile from the same page.
      const oppPhone = await opportunityPage.waitForPhoneEquals(phone1);
      const oppEmail = await opportunityPage.getEmailReadonly();
      const oppMobile = await opportunityPage.getMobileValue();
      console.log(`  - Phone: "${oppPhone}" (expected "${phone1}")`);
      console.log(`  - Email: "${oppEmail}" (expected "${email1}")`);
      console.log(`  - Mobile: "${oppMobile}" (expected "${mobile1}")`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.7 - Opportunity Phone/Email/Mobile updated');

      expect(oppPhone, 'Opp Phone should equal Phone #1').toBe(phone1);
      expect(oppEmail, 'Opp Email should equal Email #1').toBe(email1);
      expect(oppMobile, 'Opp Mobile should equal Mobile #1').toBe(mobile1);
      console.log('✅ Reseller multi-field update is reflected: Phone, Email and Mobile all match');
    });
  });
});
