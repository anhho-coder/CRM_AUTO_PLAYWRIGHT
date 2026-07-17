import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (data isolation / negative)
 * Test Case ID: TC.-A.1.4
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify a Reseller only sees their OWN opportunities. Thomas creates (A) a registration
 *          assigned to Reseller_1 [should appear] and (B) a registration NOT assigned to Reseller_1
 *          [should NOT appear]. Reseller_1 sees only A.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.4:" --project=chromium
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
 * Steps to reproduce #1 (create two registrations as Thomas):
 *  1-9. Create Opp A assigned to TEST-Reseller#Automation-Jun10 (control) and SAVE.
 *  1-9. Create Opp B with NO Assigned Partner (not the Reseller) and SAVE.
 *
 * Steps to reproduce #2 (view the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *
 * Verification #1:
 *  1. Opp A IS displayed; Opp B is NOT displayed.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.4 - Reseller does not see opportunities that are not theirs', () => {

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

  test('TC.-A.1.4: Verify a Reseller does not see an opportunity that is not assigned to them', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const regA = generateDealRegistrationNote();
    const regB = generateDealRegistrationNote();
    const oppNameMine = `TEST TC.-A.1.4 MINE ${regA.compactDateTime}`;
    const oppNameOther = `TEST TC.-A.1.4 OTHER ${regB.compactDateTime}`;

    await test.step('Pre-condition 1: Prepare two deal-registration Internal Notes', async () => {
      console.log(`Pre-condition 1: Control (assigned) = ${oppNameMine} | Other (not assigned) = ${oppNameOther}`);
    });

    // ===== Steps to reproduce #1: create both registrations as Thomas (shared helper) =====
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: oppNameMine,
      contactName: regA.leadName,
      companyEmail: regA.companyEmail,
      internalNote: regA.note,
      stepPrefix: 'Steps to reproduce #1 (Opp A, assigned to Reseller_1)',
    }));
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: oppNameOther,
      contactName: regB.leadName,
      companyEmail: regB.companyEmail,
      internalNote: regB.note,
      assignedPartner: null, // intentionally NOT assigned to the Reseller
      continueSession: true,
      stepPrefix: 'Steps to reproduce #1 (Opp B, NOT assigned to Reseller_1)',
    }));

    // ===== Steps to reproduce #2: view the list as the Reseller =====
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

    await test.step('Verification #1: only the Reseller\'s own opportunity is displayed', async () => {
      const listedMine = await resellerPortalPage.isOpportunityListed(oppNameMine);
      const listedOther = await resellerPortalPage.isOpportunityListed(oppNameOther, 1);
      const names = await resellerPortalPage.getListedOpportunityNames();
      console.log(`  - Listed names: ${JSON.stringify(names)}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.4 - Reseller data isolation');
      expect(listedMine, `Opp A "${oppNameMine}" (assigned to Reseller_1) should be displayed`).toBeTruthy();
      expect(listedOther, `Opp B "${oppNameOther}" (not assigned to Reseller_1) should NOT be displayed`).toBeFalsy();
    });
  });
});
