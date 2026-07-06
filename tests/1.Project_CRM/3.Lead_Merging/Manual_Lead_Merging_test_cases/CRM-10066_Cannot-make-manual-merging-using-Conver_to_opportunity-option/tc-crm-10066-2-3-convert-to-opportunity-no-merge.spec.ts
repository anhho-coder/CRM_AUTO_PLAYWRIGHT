import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION (extended) - CRM-10066
 *  Manual "Convert to Opportunity" - POSITIVE: convert-only (do NOT merge)
 * =============================================================================
 *  Test Case ID     : CRM-10066_2.3
 *  Jira             : CRM-10066  (extended coverage around the manual-merge flow)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - derived from CRM-10066 verification (positive aspect)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Positive contrast to the merge flow: a duplicate Opportunity exists (shared domain), but the user
 *  picks "Convert to opportunity" (create new) instead of "Merge with existing opportunities". Verifies
 *  the Lead converts to its OWN new Opportunity at Stage New, and the existing Opp#1 is NOT merged
 *  (no "Merged lead : <Lead#1>" note on Opp#1).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_2\.3:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (scenario steps - same order):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1 (Sale Team CMR, Lead Form License, Company test123, Email "opp-test-hot@<domain>").
 *  2. Create Lead #1 (Sale Team IBSA, Lead Form IB NC Leads, Company test123, Email "lead-test-hot@<domain>" - same domain).
 *  3. Select Lead#1, press "Convert to Opportunity"
 *  4. Select option "Convert to opportunity" (create a new opportunity - do NOT merge)
 *  5. Press "CREATE OPPORTUNITY"
 *  6. Observe result
 *
 *  Expected Result : Lead#1 becomes a NEW Opportunity at Stage New; Opp#1 is unchanged / NOT merged
 *                    (no "Merged lead : <Lead#1>" note on Opp#1).
 *
 *  Verify: Step 6 prints an explicit VERIFY block (Expected/Actual/Result per check + OVERALL).
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting created Opportunities
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the converted Lead/Opp

test.describe('CRM-10066_2.3 - "Convert to opportunity" (no merge) creates a new Opp and leaves Opp#1 unmerged', () => {

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
      console.log(`Cleanup: deleting converted Lead ${lead1Url}`);
      await CommonUtils.deleteRecordByUrl(page, lead1Url, testInfo).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-10066_2.3: Verify "Convert to opportunity" (no merge) creates a new Opp and leaves the existing Opp unmerged', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_2.3';
    const uid = CommonUtils.generateUniqueId().replace(/_/g, '');
    const sharedDomain = `ap14test${uid}.com`;
    const oppEmail = `opp-test-hot@${sharedDomain}`;
    const leadEmail = `lead-test-hot@${sharedDomain}`;
    const companyName = `test123-${uid}`;
    const opp1Name = `TEST Opp 1 ${tcId} ${uid}`;
    const lead1Name = `TEST Lead 1 ${tcId} ${uid}`;
    const opp1Team = 'CMR';
    const lead1Team = 'IBSA';

    let opp1Url = '';

    await test.step('Pre-condition: Login and open CRM', async () => {
      console.log('Pre-condition: Logging in and navigating to CRM');
      console.log(`  - Shared company domain : ${sharedDomain}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('OK - Logged in and CRM opened');
    });

    await test.step('Step 1: Create Opp#1 (Sale Team CMR, Lead Form License, same domain)', async () => {
      console.log('Step 1: Creating Opp#1');
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      await opportunityPage.fillOpportunityName(opp1Name);
      await opportunityPage.fillEmail(oppEmail);
      await opportunityPage.fillCompanyName(companyName);
      await opportunityPage.fillStreet('123street');
      await opportunityPage.selectCountry('United States');
      await opportunityPage.selectState('Texas');
      await opportunityPage.selectSalesTeam(opp1Team);
      console.log(`  - Opp name      : ${opp1Name}`);
      console.log(`  - Email         : ${oppEmail}`);
      console.log(`  - Company Name  : ${companyName}`);
      console.log(`  - Sale Team     : ${opp1Team}`);
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('License');
      console.log(`  - Lead Form     : License`);
      await opportunityPage.saveAndWaitForCompletion();
      const opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      createdOppUrls.push(opp1Url);
      console.log(`OK - Opp#1 saved (ID: ${opp1Id})`);
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Opp#1 created (ID: ${opp1Id})`);
    });

    await test.step('Step 2: Create Lead#1 (Sale Team IBSA, same domain email)', async () => {
      console.log('Step 2: Creating Lead#1');
      await homePage.navigateToLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(lead1Name);
      await leadPage.fillEmail(leadEmail);
      await leadPage.fillCompanyName(companyName);
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Texas');
      await leadPage.selectSalesTeam(lead1Team);
      console.log(`  - Lead name     : ${lead1Name}`);
      console.log(`  - Email         : ${leadEmail}`);
      console.log(`  - Company Name  : ${companyName}`);
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

    await test.step('Step 4: Select option "Convert to opportunity" (create new - do NOT merge)', async () => {
      console.log('Step 4: Selecting "Convert to opportunity" (create new, no merge)');
      // The merge option is available (shared domain) but we deliberately pick convert-only.
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      console.log(`  - "Merge with existing opportunities" was offered: ${mergeAvailable} (choosing convert-only anyway)`);
      await leadPage.selectConversionActionConvert();
      // Link to the customer created from the shared email (defensive - usually the default).
      await leadPage.selectLinkToExistingCustomer();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Convert-to-opportunity option selected');
      console.log('OK - Conversion Action set to "Convert to opportunity"');
    });

    await test.step('Step 5: Press "CREATE OPPORTUNITY"', async () => {
      console.log('Step 5: Clicking "CREATE OPPORTUNITY" to convert (no merge)');
      await leadPage.clickCreateOpportunity();
      lead1Url = page.url(); // Lead#1 is now its own Opportunity
      createdOppUrls.push(lead1Url);
      console.log(`OK - Converted (resulting Opportunity URL: ${lead1Url})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    await test.step('Step 6: Observe result - new Opp at Stage New, Opp#1 NOT merged', async () => {
      console.log('Step 6: Verifying the converted Opp + that Opp#1 was not merged');

      // (1) The converted record is an Opportunity at Stage New (current page = the new Opp)
      const convertedStageNew = await opportunityPage.isStageNewVisible();
      console.log(`  - Converted Lead#1 shows Stage "New": ${convertedStageNew}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Converted Opp (Stage New)');

      // (2) Opp#1 must NOT have absorbed Lead#1 (no merge note)
      console.log(`  - Opening Opp#1 to confirm it was NOT merged: ${opp1Url}`);
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      const opp1Merge = await opportunityPage.waitForChatterContaining(`Merged lead : ${lead1Name}`, 2, CommonUtils.waitTimes.long);
      console.log(`  - Opp#1 log shows "Merged lead : Lead#1": ${opp1Merge.found} (expected NOT found)`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp#1 not merged (result)');

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Lead#1 converted to a new Opportunity at Stage "New":');
      console.log('     Expected            : Stage "New" visible = true');
      console.log(`     Actual              : Stage "New" visible = ${convertedStageNew}`);
      console.log(`     Result              : ${convertedStageNew ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Opp#1 was NOT merged (no "Merged lead : Lead#1" note):');
      console.log(`     Expected            : "Merged lead : ${lead1Name}" NOT present`);
      console.log(`     Actual              : ${opp1Merge.found ? 'PRESENT' : 'NOT present'}`);
      console.log(`     Result              : ${!opp1Merge.found ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(convertedStageNew, 'Verify #1 FAILED - the converted Lead#1 should be an Opportunity at Stage "New"').toBeTruthy();
      expect(opp1Merge.found, 'Verify #2 FAILED - Opp#1 should NOT be merged (no "Merged lead" note) when choosing convert-only').toBeFalsy();
      console.log('OVERALL: PASS - Convert-to-opportunity created a new Opp without merging Opp#1');
    });
  });
});
