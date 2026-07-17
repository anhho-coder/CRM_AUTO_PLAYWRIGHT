import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ResellerPortalPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (My Opportunities sort)
 * Test Case ID: TC.-A.1.6
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the My Opportunities list can be sorted. Thomas creates two registrations whose names
 *          sort predictably (AAA then ZZZ, ZZZ created later). Sort by Name => AAA before ZZZ; sort by
 *          Date (Newest) => ZZZ before AAA. Relative order of the two created opps is asserted.
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
 * Steps to reproduce #1 (create two registrations as Thomas):
 *  1-9. Create registration AAA and SAVE.
 *  1-9. Create registration ZZZ (later) and SAVE.
 *
 * Steps to reproduce #2 (sort the list as the Reseller):
 *  1. Use the account of Reseller_1 (TEST-Reseller#1_Automation_Test) to login successful
 *  2. Click "My Opportunities"
 *  3. Sort by Name
 *  4. Sort by Date (Newest)
 *
 * Verification #1:
 *  3. AAA appears before ZZZ (alphabetical)
 *  4. ZZZ (created later) appears before AAA (newest first)
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.6 - My Opportunities sort by Name and by Date', () => {

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

  test('TC.-A.1.6: Verify My Opportunities can be sorted by Name and by Date', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const resellerPortalPage = new ResellerPortalPage(page);

    const regA = generateDealRegistrationNote();
    const regB = generateDealRegistrationNote();
    const nameAAA = `TEST TC.-A.1.6 ${regA.compactDateTime}-AAA`;
    const nameZZZ = `TEST TC.-A.1.6 ${regB.compactDateTime}-ZZZ`;

    await test.step('Pre-condition 1: Prepare two deal-registration Internal Notes (AAA, ZZZ)', async () => {
      console.log(`Pre-condition 1: AAA = ${nameAAA} | ZZZ = ${nameZZZ}`);
    });

    // ===== Steps to reproduce #1: create both registrations as Thomas (shared helper) =====
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: nameAAA,
      contactName: regA.leadName,
      companyEmail: regA.companyEmail,
      internalNote: regA.note,
      stepPrefix: 'Steps to reproduce #1 (registration AAA)',
    }));
    createdOppUrls.push(await createDealRegistrationOpportunityAsThomas(page, {
      oppName: nameZZZ,
      contactName: regB.leadName,
      companyEmail: regB.companyEmail,
      internalNote: regB.note,
      continueSession: true,
      stepPrefix: 'Steps to reproduce #1 (registration ZZZ, created later)',
    }));

    // ===== Steps to reproduce #2: sort the list as the Reseller =====
    await test.step('Steps to reproduce #2 - Step 1: Use the account of Reseller_1 to login successful', async () => {
      await loginPage.logout(baseUrl);
      await page.context().clearCookies();
      await loginPage.navigateTo(baseUrl);
      await loginPage.loginPortalUser(users.reseller_bronze.username, users.reseller_bronze.password);
      await resellerPortalPage.waitForPortalReady();
    });

    await test.step('Steps to reproduce #2 - Step 2: Click "My Opportunities"', async () => {
      await resellerPortalPage.clickMyOpportunities();
      expect(await resellerPortalPage.isOpportunityListed(nameAAA), 'AAA should be listed').toBeTruthy();
      expect(await resellerPortalPage.isOpportunityListed(nameZZZ), 'ZZZ should be listed').toBeTruthy();
    });

    await test.step('Steps to reproduce #2 - Step 3: Sort by Name - AAA before ZZZ', async () => {
      await resellerPortalPage.sortMyOpportunities('name');
      const names = await resellerPortalPage.getListedOpportunityNames();
      const iA = names.findIndex((n) => n.includes(nameAAA));
      const iZ = names.findIndex((n) => n.includes(nameZZZ));
      console.log(`  - Sort by Name: AAA@${iA}, ZZZ@${iZ}`);
      expect(iA, 'AAA found').toBeGreaterThanOrEqual(0);
      expect(iZ, 'ZZZ found').toBeGreaterThanOrEqual(0);
      expect(iA, 'AAA should sort before ZZZ by Name').toBeLessThan(iZ);
    });

    await test.step('Steps to reproduce #2 - Step 4: Sort by Date (Newest) - ZZZ before AAA', async () => {
      await resellerPortalPage.sortMyOpportunities('date');
      const names = await resellerPortalPage.getListedOpportunityNames();
      const iA = names.findIndex((n) => n.includes(nameAAA));
      const iZ = names.findIndex((n) => n.includes(nameZZZ));
      console.log(`  - Sort by Date: AAA@${iA}, ZZZ@${iZ}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.6 - My Opportunities sorted');
      expect(iZ, 'ZZZ found').toBeGreaterThanOrEqual(0);
      expect(iA, 'AAA found').toBeGreaterThanOrEqual(0);
      expect(iZ, 'ZZZ (newer) should sort before AAA by Newest date').toBeLessThan(iA);
    });
  });
});
