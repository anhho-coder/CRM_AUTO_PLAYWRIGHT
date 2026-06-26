import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (multiple registrations)
 * Test Case ID: TC.-A.1.8
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify that when the same Reseller has MULTIPLE registrations, ALL are displayed on "My
 *          Opportunities". Thomas creates two registrations (each from its own new Internal Note), both
 *          assigned to Reseller_1; Reseller_1 then sees both.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.8:" --project=chromium
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1: Build two Internal Notes from the deal-registration template (dynamic placeholders).
 *
 * Steps to reproduce #1 (create two registrations as Thomas):
 *  1-9. Create registration #1 (Assigned Partner = Reseller) and SAVE.
 *  1-9. Create registration #2 (Assigned Partner = Reseller) and SAVE.
 *
 * Steps to reproduce #2 (view the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *
 * Verification #1:
 *  1. Both registration #1 and registration #2 are displayed.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.8 - Multiple product registrations all appear in My Opportunities', () => {

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

  test('TC.-A.1.8: Verify all of a Reseller\'s product registrations appear in My Opportunities', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const reg1 = generateDealRegistrationNote();
    const reg2 = generateDealRegistrationNote();
    const oppName1 = `TEST TC.-A.1.8 ${reg1.compactDateTime}-A`;
    const oppName2 = `TEST TC.-A.1.8 ${reg2.compactDateTime}-B`;

    await test.step('Pre-condition 1: Prepare two deal-registration Internal Notes', async () => {
      console.log(`Pre-condition 1: Opp #1 = ${oppName1} | Opp #2 = ${oppName2}`);
    });

    // ===== Steps to reproduce #1: create both registrations as Thomas (shared helper) =====
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: oppName1,
      contactName: reg1.leadName,
      companyEmail: reg1.companyEmail,
      internalNote: reg1.note,
      stepPrefix: 'Steps to reproduce #1 (registration #1)',
    }));
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: oppName2,
      contactName: reg2.leadName,
      companyEmail: reg2.companyEmail,
      internalNote: reg2.note,
      continueSession: true,
      stepPrefix: 'Steps to reproduce #1 (registration #2)',
    }));

    // ===== Steps to reproduce #2: view the list as the Reseller =====
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

    await test.step('Verification #1: both product registrations are displayed', async () => {
      const listed1 = await resellerPortalPage.isOpportunityListed(oppName1);
      const listed2 = await resellerPortalPage.isOpportunityListed(oppName2);
      const names = await resellerPortalPage.getListedOpportunityNames();
      console.log(`  - Listed names: ${JSON.stringify(names)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.8 - Multiple registrations in My Opportunities');
      expect(listed1, `Opp #1 "${oppName1}" should be displayed`).toBeTruthy();
      expect(listed2, `Opp #2 "${oppName2}" should be displayed`).toBeTruthy();
    });
  });
});
