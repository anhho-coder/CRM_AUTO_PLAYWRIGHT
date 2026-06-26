import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (approval banner)
 * Test Case ID: TC.-A.1.10
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the saved Opportunity shows the deal-registration banner ("This deal has been
 *          registered by <partner>. ... has to be approved by <date>."). Thomas creates the
 *          registration; we inspect the banner on the saved record.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.10:" --project=chromium
 *
 * Source manual TC (mirrors the manual steps - same order, same content):
 *
 * Pre-condition #1: Build Internal Note #1 from the deal-registration template (dynamic placeholders).
 *
 * Steps to reproduce #1 (create the registration as Thomas):
 *  1-9. Login as Thomas; CRM > view list > CREATE; ...; Assigned Partner = TEST-Reseller#Automation-Jun10;
 *       Internal Note #1; SAVE; capture Opp URL #1.
 *
 * Verification #1:
 *  1. The saved record shows the deal-registration banner naming the registering partner.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.10 - Deal-registration approval banner on the saved Opportunity', () => {

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

  test('TC.-A.1.10: Verify the deal-registration banner appears on the saved Opportunity', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.10 ${compactDateTime}`;

    await test.step('Pre-condition 1: Prepare Internal Note #1 (deal-registration template)', async () => {
      console.log(`Pre-condition 1: Opp Name #1 = ${oppName}`);
    });

    // ===== Steps to reproduce #1: create the registration as Thomas (shared helper) =====
    createdOppUrl = await createDealRegistrationOpportunityAsThomas(page, {
      oppName,
      contactName: leadName,
      companyEmail,
      internalNote,
    });

    await test.step('Verification #1: deal-registration banner + Approval Status', async () => {
      const banner = await opportunityPage.getDealRegistrationBanner();
      const approvalStatus = await opportunityPage.getApprovalStatus().catch(() => '');
      console.log(`  - Banner: "${banner}"`);
      console.log(`  - Approval Status (logged): "${approvalStatus}"`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.10 - Deal-registration banner');

      expect(banner, 'Deal-registration banner should be present').not.toBe('');
      expect(banner.toLowerCase(), 'Banner should mention the deal has been registered').toContain('registered');
      expect(banner, 'Banner should name the registering partner').toContain(DEAL_REGISTRATION.partnerCompanyName);
    });
  });
});
