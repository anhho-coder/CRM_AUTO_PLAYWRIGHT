import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, OpportunityPage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-2 - Reseller views or updates an existing registration
 * Test Case ID: TC.-A.2.8
 * Automation-Type: new
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify that CANCELLING the "Edit contact" modal does NOT persist a change. Thomas creates the
 *          Opportunity (Opp Name #1, no Phone); the Reseller types a Phone then presses CANCEL; Thomas
 *          re-opens Opp URL #1 and verifies the Phone is still empty (the cancelled value was not saved).
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.2\.8:" --project=chromium
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1: Build Internal Note #1 from the deal-registration template (dynamic placeholders).
 *
 * Steps to reproduce #1 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter fields (no Phone); Lead form; Assigned
 *       Partner = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (start an edit then cancel, as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Select the Opportunity named Opp Name #1 and wait
 *  4. Press "Edit" on the "CONTACT" area
 *  4. Enter the following information: Phone = <random 9-digit number> (the cancelled value)
 *  5. Press "CANCEL" (do NOT Confirm)
 *
 * Steps to reproduce #3 (re-open as Thomas):
 *  1. Use the account of Thomas to login successful
 *  2. Launch the Opp URL #1
 *
 * Verification #1:
 *  1. The Opp's Phone is still EMPTY (the cancelled value was not saved)
 */

const SKIP_CLEANUP_OPP = false; // false = delete the created Opportunity on teardown

test.describe('TC.-A.2.8 - Reseller cancels an Edit-contact change (not saved)', () => {

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

  test('TC.-A.2.8: Verify cancelling the Edit-contact change does not persist (Phone stays empty)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const opportunityPage = new OpportunityPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.2.8 ${compactDateTime}`;
    const cancelledPhone = CommonUtils.generateRandomDigits(9); // typed, then CANCELLED (must NOT persist)

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | cancelled Phone (must NOT save) = ${cancelledPhone}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    // ===== Steps to reproduce #2: start an edit then cancel, as the Reseller =====
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

    await test.step('Steps to reproduce #2 - Step 4 (data): Enter Phone = random 9-digit number (the cancelled value)', async () => {
      console.log(`Steps to reproduce #2 - Step 4 (data): Typing Phone = ${cancelledPhone} (will be cancelled)`);
      await resellerPortalPage.fillContactPhone(cancelledPhone);
      console.log('✓ Phone typed in the Edit contact modal (not yet saved)');
    });

    await test.step('Steps to reproduce #2 - Step 5: Press "CANCEL" (do NOT Confirm)', async () => {
      await resellerPortalPage.cancelEditContact();
      console.log('✓ Edit contact CANCELLED');
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

    await test.step('Verification #1: The Opp Phone is still EMPTY (the cancelled value was not saved)', async () => {
      const oppPhone = await opportunityPage.getPhoneValue();
      console.log(`  - Opportunity Phone read from the form: "${oppPhone}" | cancelled value (must NOT appear): "${cancelledPhone}"`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.2.8 - Opportunity Phone unchanged after Cancel');

      expect(oppPhone, 'The cancelled Phone must NOT have been saved to the Opportunity').not.toBe(cancelledPhone);
      expect(oppPhone, 'The Opportunity Phone should remain empty after Cancel').toBe('');
      console.log('✅ Cancel did not persist the change: the Opportunity Phone is unchanged (empty)');
    });
  });
});
