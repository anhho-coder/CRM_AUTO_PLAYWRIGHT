import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION (extended) - CRM-10066
 *  Manual "Convert to Opportunity" merge - NEGATIVE: no active duplicate left
 * =============================================================================
 *  Test Case ID     : CRM-10066_3.1
 *  Jira             : CRM-10066  (extended coverage around the manual-merge flow)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - derived from CRM-10066 verification (negative aspect)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Negative/correctness: after merging Lead#1 into an existing Opportunity via "Convert to Opportunity"
 *  -> "Merge with existing opportunities", the source Lead#1 must be CONSUMED - it must NOT remain as a
 *  separate active record. Verifies Lead#1 is archived (Active = false) and its log records
 *  "This lead has been merged into <Opp#1>" (so the merge did happen and left no active duplicate).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_3\.1:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (scenario steps - same order):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1 (Sale Team CMR, Lead Form License, Email "opp-test-hot@<domain>").
 *  2. Create Lead #1 (Sale Team IBSA, Lead Form IB NC Leads, Email "lead-test-hot@<domain>" - same domain).
 *  3. Select Lead#1, press "Convert to Opportunity"
 *  4. Select option "Merge with existing opportunities"
 *  5. "Add a line" and add Opp#1 (Sale Team CMR)
 *  6. Press "CREATE OPPORTUNITY"
 *  7. Observe the SOURCE Lead#1
 *
 *  Expected Result : Lead#1 is consumed by the merge - Active = false (archived), and its log shows
 *                    "This lead has been merged into <Opp#1>". No separate active duplicate remains.
 *
 *  Verify: Step 7 prints an explicit VERIFY block (Expected/Actual/Result per check + OVERALL).
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting the created/merged Opportunity
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the merged (archived) Lead

test.describe('CRM-10066_3.1 - Manual merge leaves no active duplicate (source Lead archived)', () => {

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
      console.log(`Cleanup: deleting Lead ${lead1Url} (merged/archived)`);
      await CommonUtils.deleteRecordByUrl(page, lead1Url, testInfo).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-10066_3.1: Verify a manual merge consumes the source Lead (Active=false) and leaves no active duplicate', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_3.1';
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
    let lead1Id = '';

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

    await test.step('Step 1: Create Opp#1 (Sale Team CMR, Lead Form License)', async () => {
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
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
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

    await test.step('Step 4: Select option "Merge with existing opportunities"', async () => {
      console.log('Step 4: Selecting "Merge with existing opportunities"');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      expect(mergeAvailable, '"Merge with existing opportunities" should be offered (shared domain)').toBeTruthy();
      await leadPage.selectConversionActionMerge();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge option selected');
      console.log('OK - Conversion Action set to "Merge with existing opportunities"');
    });

    await test.step('Step 5: "Add a line" and add Opp#1 (Sale Team CMR)', async () => {
      console.log(`Step 5: Adding Opp#1 to the merge list (filter by email: ${oppEmail}; select by Sales Team: ${opp1Team})`);
      const pick = await leadPage.addOpportunityToMergeByEmailAndTeam(oppEmail, opp1Team);
      console.log(`  - Opp#1 row selected by its Sales Team: ${pick.selectedByTeam} (rows: ${pick.rowCount})`);
      expect(pick.selectedByTeam, `Opp#1 (Sales Team ${opp1Team}) should be selectable in the picker`).toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp#1 added to merge list');
      console.log('OK - Opp#1 added to the merge list');
    });

    await test.step('Step 6: Press "CREATE OPPORTUNITY"', async () => {
      console.log('Step 6: Clicking "CREATE OPPORTUNITY" to perform the merge');
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());
      console.log(`OK - Merge submitted (resulting Opportunity URL: ${page.url()})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    await test.step('Step 7: Observe the SOURCE Lead#1 - it must be consumed (archived), no active duplicate', async () => {
      console.log('Step 7: Verifying the source Lead#1 was consumed by the merge (archived, no active duplicate)');
      // Open the merged (archived) source Lead via the dedicated action so an inactive record still shows.
      lead1Url = await leadPage.navigateToMergedLeadWithAction682(lead1Url, lead1Id, config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // (a) Source Lead#1 log records it was merged into Opp#1 (so the merge did happen)
      const mergedIntoOpp = await leadPage.hasTargetLeadMergeMessage(opp1Name);
      console.log(`  - Lead#1 log shows "This lead has been merged into ${opp1Name}": ${mergedIntoOpp}`);

      // (b) Source Lead#1 is archived (Active = false) - no separate active duplicate remains
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      const isActive = await leadPage.isActiveChecked();
      console.log(`  - Lead#1 Active checkbox: ${isActive} (expected false = archived)`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Source Lead#1 archived (result)');

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Source Lead#1 is archived (no active duplicate left):');
      console.log('     Expected            : Active = false');
      console.log(`     Actual              : Active = ${isActive}`);
      console.log(`     Result              : ${!isActive ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Source Lead#1 records it was merged into Opp#1:');
      console.log(`     Expected (contains) : "This lead has been merged into ${opp1Name}"`);
      console.log(`     Actual (found)      : ${mergedIntoOpp ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result              : ${mergedIntoOpp ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(isActive, 'Verify #1 FAILED - the merged source Lead#1 should be archived (Active=false), leaving no active duplicate').toBeFalsy();
      expect(mergedIntoOpp, `Verify #2 FAILED - Lead#1 log should record "This lead has been merged into ${opp1Name}"`).toBeTruthy();
      console.log('OVERALL: PASS - Manual merge consumed the source Lead (no active duplicate left)');
    });
  });
});
