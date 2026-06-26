import { test, expect } from '@playwright/test';
import { config } from '@config/test.config';
import { HomePage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import { generateDealRegistrationNote, DEAL_REGISTRATION } from '@/test-data/CRM-deal_registration/deal-registration.note';
import { createDealRegistrationOpportunityAsThomas, deleteCreatedOpportunityAsAdmin } from '@helpers/uc-a-2-deal-registration.helper';

/**
 * UC-A-1 - Reseller submits a new product registration (field persistence)
 * Test Case ID: TC.-A.1.9
 * Automation-Type: refactored
 * Automation-Date: 2026-06-23
 *
 * Summary: Verify the saved product-registration Opportunity persists ALL entered data. Thomas creates
 *          the registration; on the saved record we assert the Opp name, Internal Note, Assigned Partner,
 *          Lead form, Company, Email, IP, Stage = New and Create manually = FALSE all persisted.
 *
 * Command to run:
 * npx playwright test --grep "TC\.-A\.1\.9:" --project=chromium
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
 * Verification #1:
 *  1. On the saved record, all entered values persist: Opp name, Internal Note, Assigned Partner,
 *     Lead form, Company, Email, IP; Stage = New; Create manually = FALSE.
 */

const SKIP_CLEANUP_OPP = false;

test.describe('TC.-A.1.9 - Saved product registration persists all fields', () => {

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

  test('TC.-A.1.9: Verify the saved product registration persists all entered fields', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const opportunityPage = new OpportunityPage(page);

    const { companyEmail, leadName, compactDateTime, note: internalNote } = generateDealRegistrationNote();
    const oppName = `TEST TC.-A.1.9 ${compactDateTime}`;

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

    await test.step('Verification #1: all entered fields persisted on the saved record', async () => {
      const savedName = await opportunityPage.getOpportunityNameValue();
      const savedNote = await opportunityPage.getInternalNotesValue();
      const savedPartner = await opportunityPage.getAssignedPartnerValue();
      const savedLeadForm = await opportunityPage.getLeadFormValue();
      const savedCompany = await opportunityPage.getCompanyNameReadonly();
      const savedEmail = await opportunityPage.getEmailReadonly();
      const savedIp = await opportunityPage.getIpReadonly();
      const savedAddress = await opportunityPage.getAddressReadonly().catch(() => '');
      const stageNew = await opportunityPage.isStageNewVisible();
      const createdManually = await opportunityPage.isCreatedManuallyChecked();

      console.log(`  - Name: "${savedName}"`);
      console.log(`  - Assigned Partner: "${savedPartner}" | Lead form: "${savedLeadForm}"`);
      console.log(`  - Company: "${savedCompany}" | Email: "${savedEmail}" | IP: "${savedIp}"`);
      console.log(`  - Address (logged): "${savedAddress}"`);
      console.log(`  - Stage New: ${stageNew} | Create manually: ${createdManually}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'TC.-A.1.9 - Saved product registration fields');

      expect(savedName, 'Opp name should persist').toContain(oppName);
      expect(savedNote, 'Internal Note should persist (deal-registration marker)').toContain(DEAL_REGISTRATION.leadFormMarker);
      expect(savedPartner, 'Assigned Partner should persist').toContain(DEAL_REGISTRATION.partnerCompanyName);
      expect(savedLeadForm, 'Lead form should persist').toContain(DEAL_REGISTRATION.leadFormMarker);
      expect(savedCompany, 'Company Name should persist').toContain(DEAL_REGISTRATION.companyName);
      expect(savedEmail, 'Email should persist').toContain(companyEmail);
      expect(savedIp, 'IP should persist').toContain(DEAL_REGISTRATION.ip);
      expect(stageNew, 'Stage should be New').toBeTruthy();
      expect(createdManually, 'Create manually should be FALSE').toBe(false);
    });
  });
});
