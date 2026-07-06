import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION (extended) - CRM-10066
 *  Manual merge via "Convert to Opportunity" - POSITIVE: exact same full email
 * =============================================================================
 *  Test Case ID     : CRM-10066_2.1
 *  Jira             : CRM-10066  (extended coverage around the manual-merge flow)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - derived from CRM-10066 verification (positive aspect)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Positive variant of CRM-10066: the Lead and the existing Opportunity share the EXACT SAME full
 *  email (not just the domain). Verifies the manual "Convert to Opportunity" -> "Merge with existing
 *  opportunities" -> select Opp#1 -> "CREATE OPPORTUNITY" completes (Opp#1 gets a "Merged lead" note,
 *  Stage New).
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_2\.1:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (scenario steps - same order):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1 having:
 *       - Email address = "dup-test-hot@<domain>"   (unique per run)
 *       - Lead Form     = License
 *       - Company Name  = test123                   (unique per run)
 *       - Street        = 123street
 *       - Country       = United States
 *       - State         = Texas (US)
 *       - Sale Team     = CMR
 *       - Status        = NEW
 *  2. Create Lead #1 having the EXACT SAME email as Opp#1:
 *       - Email address = "dup-test-hot@<domain>"   (identical to Opp#1)
 *       - Lead Form     = IB NC Leads
 *       - Company Name  = test123                   (same as Opp#1)
 *       - Street/Country/State = 123street / United States / Texas (US)
 *       - Sale Team     = IBSA
 *  3. Select Lead#1, press "Convert to Opportunity"
 *  4. Select option "Merge with existing opportunities"
 *  5. Select "Add a line" and filter all Opp with Email = "dup-test-hot@<domain>"
 *  6. Select the Opp#1 (Sale Team CMR), then press "CREATE OPPORTUNITY"
 *  7. Observe result
 *
 *  Expected Result : The Merging completes (Opp#1 records "Merged lead : <Lead#1>", Stage New).
 *
 *  Verify: Step 7 prints an explicit VERIFY block (Expected/Actual/Result per check + OVERALL).
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting the created/merged Opportunity
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the created Lead

test.describe('CRM-10066_2.1 - Manual merge (Convert to Opportunity) with exact same email completes', () => {

  const createdOppUrls: string[] = [];
  let lead1Url = '';

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // No boundary screenshot here - page is still about:blank after a cookie clear.
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
      console.log(`Cleanup: deleting Lead ${lead1Url} (may already be merged/inactive)`);
      await CommonUtils.deleteRecordByUrl(page, lead1Url, testInfo).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-10066_2.1: Verify manual merge via "Convert to Opportunity" completes when Lead and Opp share the exact same email', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_2.1';
    const uid = CommonUtils.generateUniqueId().replace(/_/g, '');
    const sharedDomain = `ap14test${uid}.com`;
    const sharedEmail = `dup-test-hot@${sharedDomain}`; // EXACT same email on both records
    const companyName = `test123-${uid}`;
    const opp1Name = `TEST Opp 1 ${tcId} ${uid}`;
    const lead1Name = `TEST Lead 1 ${tcId} ${uid}`;
    const opp1Team = 'CMR';
    const lead1Team = 'IBSA';

    let opp1Url = '';

    await test.step('Pre-condition: Login and open CRM', async () => {
      console.log('Pre-condition: Logging in and navigating to CRM');
      console.log(`  - Shared email (both records) : ${sharedEmail}`);
      console.log(`  - Company Name (shared)       : ${companyName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('OK - Logged in and CRM opened');
    });

    await test.step('Step 1: Create Opp#1 (Email, Lead Form=License, Company=test123, Address, Sale Team=CMR, Status=NEW)', async () => {
      console.log('Step 1: Creating Opp#1');
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      await opportunityPage.fillOpportunityName(opp1Name);
      await opportunityPage.fillEmail(sharedEmail);
      await opportunityPage.fillCompanyName(companyName);
      await opportunityPage.fillStreet('123street');
      await opportunityPage.selectCountry('United States');
      await opportunityPage.selectState('Texas');
      await opportunityPage.selectSalesTeam(opp1Team);
      console.log(`  - Opp name      : ${opp1Name}`);
      console.log(`  - Email         : ${sharedEmail}`);
      console.log(`  - Company Name  : ${companyName}`);
      console.log(`  - Street        : 123street`);
      console.log(`  - Country       : United States`);
      console.log(`  - State         : Texas (US)`);
      console.log(`  - Sale Team     : ${opp1Team}`);
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('License');
      console.log(`  - Lead Form     : License`);
      await opportunityPage.saveAndWaitForCompletion();
      const opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      createdOppUrls.push(opp1Url);
      console.log(`OK - Opp#1 saved (ID: ${opp1Id})`);
      console.log('  - Waiting for the background Contact to be created...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Opp#1 created (ID: ${opp1Id})`);
    });

    await test.step('Step 2: Create Lead#1 with the EXACT SAME email (Lead Form=IB NC Leads, Company=test123, Sale Team=IBSA)', async () => {
      console.log('Step 2: Creating Lead#1 (same email as Opp#1)');
      await homePage.navigateToLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await leadPage.clickCreate();
      await leadPage.fillLeadOpportunity(lead1Name);
      await leadPage.fillEmail(sharedEmail);
      await leadPage.fillCompanyName(companyName);
      await leadPage.fillStreet('123street');
      await leadPage.selectCountry('United States');
      await leadPage.selectState('Texas');
      await leadPage.selectSalesTeam(lead1Team);
      console.log(`  - Lead name     : ${lead1Name}`);
      console.log(`  - Email         : ${sharedEmail}`);
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
      console.log('  - Waiting for the background Contact to be created...');
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
      console.log(`  - "Merge with existing opportunities" option available: ${mergeAvailable}`);
      expect(mergeAvailable, '"Merge with existing opportunities" should be offered (Lead and Opp share the same email)').toBeTruthy();
      await leadPage.selectConversionActionMerge();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge option selected');
      console.log('OK - Conversion Action set to "Merge with existing opportunities"');
    });

    await test.step('Step 5: Select "Add a line" and filter all Opp with Email = the shared email', async () => {
      console.log(`Step 5: Adding Opp#1 to the merge list (filter by email: ${sharedEmail}; select by Sales Team: ${opp1Team})`);
      const pick = await leadPage.addOpportunityToMergeByEmailAndTeam(sharedEmail, opp1Team);
      console.log(`  - Opportunities matched by the email filter : ${pick.rowCount}`);
      console.log(`  - Opp#1 row selected by its Sales Team       : ${pick.selectedByTeam}`);
      expect(pick.selectedByTeam, `Opp#1 (Sales Team ${opp1Team}) should be found and selected in the picker`).toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp#1 added to merge list');
      console.log('OK - Opp#1 added to the merge list');
    });

    await test.step('Step 6: Select the Opp#1, then press "CREATE OPPORTUNITY"', async () => {
      console.log('Step 6: Clicking "CREATE OPPORTUNITY" to perform the merge');
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());
      console.log(`OK - Merge submitted (resulting Opportunity URL: ${page.url()})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    await test.step('Step 7: Observe result - the Merging is completed', async () => {
      console.log('Step 7: Verifying the merge completed on Opp#1 (the surviving master opportunity)');
      console.log(`  - Opening Opp#1: ${opp1Url}`);
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      const mergeLog = await opportunityPage.waitForChatterContaining(`Merged lead : ${lead1Name}`, 3, CommonUtils.waitTimes.long);
      console.log(`  - Opp#1 log shows "Merged lead : Lead#1": ${mergeLog.found}`);
      const stageNewVisible = await opportunityPage.isStageNewVisible();
      console.log(`  - Opp#1 shows Stage "New": ${stageNewVisible}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge completed (Opp#1 result)');

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Opp#1 log records the merged Lead#1:');
      console.log(`     Expected (contains) : "Merged lead : ${lead1Name}"`);
      console.log(`     Actual (found)      : ${mergeLog.found ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result              : ${mergeLog.found ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Opp#1 still shows Stage "New" after the merge:');
      console.log('     Expected            : Stage "New" visible = true');
      console.log(`     Actual              : Stage "New" visible = ${stageNewVisible}`);
      console.log(`     Result              : ${stageNewVisible ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(mergeLog.found, `Verify #1 FAILED - Opp#1 log should record "Merged lead : ${lead1Name}"`).toBeTruthy();
      expect(stageNewVisible, 'Verify #2 FAILED - Opp#1 should still show Stage "New" after the merge').toBeTruthy();
      console.log('OVERALL: PASS - Manual merge with exact same email completed successfully');
    });
  });
});
