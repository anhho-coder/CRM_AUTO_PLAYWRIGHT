import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (My Opportunities columns)
 * Test Case ID: TC.-A.1.3
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the My Opportunities row for a new registration shows correct column data (Name,
 *          Contact, Stage = New, Date = today). Thomas creates the registration; Reseller_1 reads the row.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.3:" --project=chromium
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1: Build Internal Note #1 from the deal-registration template (dynamic placeholders).
 *
 * Steps to reproduce #1 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; enter Opp/Contact/Company/Email/Country/State/IP,
 *       Create manually = FALSE, clear Sales Team/Salesperson; CRM Developer Lead form; Assigned
 *       Partner = TEST-Reseller#Automation-Jun10; Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Steps to reproduce #2 (view the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"; locate the Opp Name #1 row
 *
 * Verification #1:
 *  1. The row shows Name = Opp Name #1, Contact = Internal Note Name, Stage = New, Date = today.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.3 - My Opportunities row shows correct column data', () => {

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

  test('TC.-A.1.3: Verify My Opportunities row shows Name, Contact, Stage and Date for the registration', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.3 ${compactDateTime}`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayMDY = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName} | Contact = ${leadName}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

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

    await test.step('Verification #1: row columns are correct (Name, Contact, Stage = New, Date = today)', async () => {
      const listed = await resellerPortalPage.isOpportunityListed(oppName);
      const row = await resellerPortalPage.getOpportunityRowData(oppName);
      console.log(`  - Row data: ${JSON.stringify(row)} | today=${todayMDY}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.3 - My Opportunities row columns');

      expect(listed, 'The registration row should be displayed').toBeTruthy();
      expect(row, 'Row data should be readable').not.toBeNull();
      expect(row!.name, 'Name column').toContain(oppName);
      expect(row!.contact, 'Contact column should show the Internal Note Name').toContain(leadName);
      expect(row!.stage, 'Stage column should be New').toBe('New');
      expect(row!.date, 'Date column should be today').toContain(todayMDY);
    });
  });
});
