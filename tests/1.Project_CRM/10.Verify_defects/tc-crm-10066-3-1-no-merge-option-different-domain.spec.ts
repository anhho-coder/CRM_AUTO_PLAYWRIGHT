import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION (extended) - CRM-10066
 *  Manual "Convert to Opportunity" - NEGATIVE: no duplicate -> no merge option
 * =============================================================================
 *  Test Case ID     : CRM-10066_3.1
 *  Jira             : CRM-10066  (extended coverage around the manual-merge flow)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - derived from CRM-10066 verification (negative aspect)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Negative: when the Lead and the existing Opportunity have DIFFERENT email domains and DIFFERENT
 *  company names (no duplicate), the conversion wizard must NOT offer "Merge with existing opportunities".
 *  Verifies isMergeOptionAvailable() is false, then cancels the wizard (no conversion performed).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_3\.1:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (scenario steps - same order):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1: Email "opp@<domainA>", Company "AlphaCorp", Sale Team CMR, Lead Form License.
 *  2. Create Lead #1: Email "lead@<domainB>" (DIFFERENT domain), Company "BetaCorp" (DIFFERENT),
 *       Sale Team IBSA, Lead Form IB NC Leads.
 *  3. Select Lead#1, press "Convert to Opportunity"
 *  4. Observe the Conversion Action options
 *
 *  Expected Result : "Merge with existing opportunities" is NOT offered (no duplicate exists);
 *                    only "Convert to opportunity" is available. Wizard is then cancelled.
 *
 *  Verify: Step 4 prints an explicit VERIFY block (Expected/Actual/Result + OVERALL).
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting the created Opportunity
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the created Lead

test.describe('CRM-10066_3.1 - No "Merge with existing opportunities" option when there is no duplicate', () => {

  const createdOppUrls: string[] = [];
  let lead1Url = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('X TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      const homePage = new HomePage(page);
      await homePage.waitForLoadingSpinnerToHide(CommonUtils.waitTimes.savingPage).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
    }
    if (!SKIP_CLEANUP_OPP) {
      for (const url of [...new Set(createdOppUrls)]) {
        console.log(`Cleanup: deleting Opportunity ${url}`);
        await CommonUtils.deleteRecordByUrl(page, url, testInfo).catch(() => {});
      }
    }
    if (!SKIP_CLEANUP_LEAD && lead1Url) {
      console.log(`Cleanup: deleting Lead ${lead1Url}`);
      await CommonUtils.deleteRecordByUrl(page, lead1Url, testInfo).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-10066_3.1: Verify "Merge with existing opportunities" is NOT offered when Lead and Opp have different domain and company', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_3.1';
    const uid = CommonUtils.generateUniqueId().replace(/_/g, '');
    // Deliberately DIFFERENT domains and company names -> no duplicate, so no merge option.
    const oppEmail = `opp-alpha@ap14alpha${uid}.com`;
    const leadEmail = `lead-beta@ap14beta${uid}.com`;
    const oppCompany = `AlphaCorp-${uid}`;
    const leadCompany = `BetaCorp-${uid}`;
    const opp1Name = `TEST Opp 1 ${tcId} ${uid}`;
    const lead1Name = `TEST Lead 1 ${tcId} ${uid}`;
    const opp1Team = 'CMR';
    const lead1Team = 'IBSA';

    await test.step('Pre-condition: Login and open CRM', async () => {
      console.log('Pre-condition: Logging in and navigating to CRM');
      console.log(`  - Opp#1  : ${oppEmail} / ${oppCompany}`);
      console.log(`  - Lead#1 : ${leadEmail} / ${leadCompany}  (different domain + company)`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('OK - Logged in and CRM opened');
    });

    await test.step('Step 1: Create Opp#1 (domain A, company AlphaCorp, Sale Team CMR)', async () => {
      console.log('Step 1: Creating Opp#1');
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      await opportunityPage.fillOpportunityName(opp1Name);
      await opportunityPage.fillEmail(oppEmail);
      await opportunityPage.fillCompanyName(oppCompany);
      await opportunityPage.fillStreet('123street');
      await opportunityPage.selectCountry('United States');
      await opportunityPage.selectState('Texas');
      await opportunityPage.selectSalesTeam(opp1Team);
      console.log(`  - Opp name      : ${opp1Name}`);
      console.log(`  - Email         : ${oppEmail}`);
      console.log(`  - Company Name  : ${oppCompany}`);
      console.log(`  - Sale Team     : ${opp1Team}`);
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('License');
      console.log(`  - Lead Form     : License`);
      await opportunityPage.saveAndWaitForCompletion();
      const opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      createdOppUrls.push(page.url());
      console.log(`OK - Opp#1 saved (ID: ${opp1Id})`);
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Opp#1 created (ID: ${opp1Id})`);
    });

    await test.step('Step 2: Create Lead#1 (DIFFERENT domain B, company BetaCorp, Sale Team IBSA)', async () => {
      console.log('Step 2: Creating Lead#1');
      await homePage.navigateToLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(lead1Name);
      await leadPage.fillEmail(leadEmail);
      await leadPage.fillCompanyName(leadCompany);
      await leadPage.fillStreet('456avenue');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Ohio');
      await leadPage.selectSalesTeam(lead1Team);
      console.log(`  - Lead name     : ${lead1Name}`);
      console.log(`  - Email         : ${leadEmail}`);
      console.log(`  - Company Name  : ${leadCompany}`);
      console.log(`  - Sale Team     : ${lead1Team}`);
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form     : IB NC Leads`);
      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      const lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`OK - Lead#1 saved (ID: ${lead1Id})`);
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition II - Lead#1 created (ID: ${lead1Id})`);
    });

    await test.step('Step 3: Select Lead#1, press "Convert to Opportunity" button', async () => {
      console.log('Step 3: Clicking "Convert to Opportunity" on Lead#1');
      await leadPage.clickConvertToOpportunity();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Convert wizard opened');
      console.log('OK - Conversion wizard opened');
    });

    await test.step('Step 4: Observe the Conversion Action options - merge must NOT be offered', async () => {
      console.log('Step 4: Checking whether "Merge with existing opportunities" is offered');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      console.log(`  - "Merge with existing opportunities" option available: ${mergeAvailable} (expected false)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Conversion Action options (no merge)');

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - "Merge with existing opportunities" is NOT offered (no duplicate):');
      console.log('     Expected            : merge option available = false');
      console.log(`     Actual              : merge option available = ${mergeAvailable}`);
      console.log(`     Result              : ${!mergeAvailable ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      // Cancel the wizard - this is a negative check, we do not convert.
      await leadPage.cancelConvertWizard();
      console.log('  - Conversion wizard cancelled (no conversion performed)');

      expect(mergeAvailable, 'Verify #1 FAILED - "Merge with existing opportunities" should NOT be offered when there is no duplicate').toBeFalsy();
      console.log('OVERALL: PASS - No merge option offered for a non-duplicate Lead');
    });
  });
});
